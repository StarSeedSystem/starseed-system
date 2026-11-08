/**
 * ARC1108B — archivos GRANDES por la red local sin que el remitente se rinda (prueba real del 08-11,
 * ~04:09 UTC: Mac native-21 → tableta Android «Maggaboard», 18 archivos a la vez, multitrayecto
 * enlace directo WebRTC + canal TCP 47071). 16 llegaron; `video.mp4` (8 MB) terminó en «sin
 * confirmación en 85 s» y `grande-50MB.bin` se quedó en «verificando» al 100 %.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Causa (ver `architecture/datos-por-la-malla.md` §8.7): tras «fin» el receptor RELEÍA todo el
 * almacén para el hash y lo releía OTRA vez para ensamblarlo, en un almacén que en el WebView atiende
 * las operaciones una detrás de otra y que además seguía escribiendo los miles de trozos del otro
 * archivo (el remitente no tenía freno: mandaba todo de golpe), sin decir nada al remitente, que a los
 * 85 s fijos lo daba por perdido. Aquí se reproduce con un almacén LENTO y EN SERIE (como IndexedDB y
 * OPFS del WebView) y los motores reales de los dos lados, por las dos rutas y por las dos a la vez.
 */
import { createHash, randomFillSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TAM_TROZO_ENLACE_DIRECTO,
  b64ABuf,
  bufAB64,
  calcularHashLista,
  crearAlmacenEnMemoria,
  crearAlmacenIDB,
  crearMotorArchivos,
  decodeChunkBinario,
  elegirTamanoTrozo,
  huecosDe,
  sanearHuecos,
  textoProgresoRemoto,
  type AlmacenTrozos,
  type CanalArchivos,
  type ConfigMotorArchivos,
  type EstadoTransferencia,
  type MotorArchivos,
} from "@/lib/network/archivos-malla";
import { crearCanalMultitrayecto, type CanalMultitrayecto } from "@/lib/malla/canal-multitrayecto";
import { crearRedNativa, type DepsRedNativa, type RedNativa } from "@/lib/malla/red-local-nativa-motor";
import { LIMITES_CANAL_ANTERIOR, maxTextoPorTrama, trozoArchivoParaTrama, type LimitesCanal } from "@/lib/malla/red-local-nativa";

const sha = (d: Uint8Array | ArrayBuffer) => createHash("sha256").update(d instanceof Uint8Array ? d : new Uint8Array(d)).digest("hex");

function aleatorio(n: number): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(n);
  randomFillSync(d);
  return d;
}

const VIDEO = 8_034_291;
const GRANDE = 52_428_800;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ══════════════════════════ Almacén lento y en serie ══════════════════════════ */

interface AlmacenMedido extends AlmacenTrozos {
  /** Escrituras por `id:index` (más de 1 = trabajo repetido). */
  escrituras: Map<string, number>;
  lecturas: number;
  /** Operaciones (escrituras + lotes de lectura) en total. */
  ops(): number;
}

/**
 * Como IndexedDB/OPFS del WebView: UNA cola, cada operación tarda `ms` (las escrituras `msEscritura`,
 * las lecturas `msLectura`) y no empieza la siguiente hasta que acaba la anterior. Un lote de
 * `leerTrozos` es UNA operación (una transacción de IndexedDB).
 */
function almacenEnSerie(opts: { msEscritura?: number; msLectura?: number; maxBytes?: number; releerMal?: number; sinLotes?: boolean } = {}): AlmacenMedido {
  const base = crearAlmacenEnMemoria(opts.maxBytes ? { maxBytes: opts.maxBytes } : {});
  let cola: Promise<unknown> = Promise.resolve();
  let ops = 0;
  const turno = <T>(ms: number, fn: () => Promise<T>): Promise<T> => {
    const p = cola.then(() => new Promise((r) => setTimeout(r, ms))).then(fn);
    cola = p.then(
      () => undefined,
      () => undefined,
    );
    ops++;
    return p;
  };
  const leer = async (id: string, i: number): Promise<ArrayBuffer | null> => {
    a.lecturas++;
    const d = await base.leerTrozo(id, i);
    if (d && i === opts.releerMal) {
      const malo = new Uint8Array(d.slice(0));
      malo[0] ^= 0xff;
      return malo.buffer;
    }
    return d;
  };
  const a: AlmacenMedido = {
    tipo: "IndexedDB (lento)",
    escrituras: new Map(),
    lecturas: 0,
    ops: () => ops,
    guardarTrozo: (id, i, d) =>
      turno(opts.msEscritura ?? 1, async () => {
        const k = `${id}:${i}`;
        a.escrituras.set(k, (a.escrituras.get(k) ?? 0) + 1);
        await base.guardarTrozo(id, i, d.slice(0));
      }),
    leerTrozo: (id, i) => turno(opts.msLectura ?? 1, () => leer(id, i)),
    ...(opts.sinLotes ? {} : { leerTrozos: (id: string, indices: number[]) => turno(opts.msLectura ?? 1, () => Promise.all(indices.map((i) => leer(id, i)))) }),
    indicesGuardados: (id) => base.indicesGuardados(id),
    ensamblar: (id, t) => base.ensamblar(id, t),
    limpiar: (id) => base.limpiar(id),
    espacioPara: (bytes) => (base.espacioPara ? base.espacioPara(bytes) : Promise.resolve({ ok: true })),
  };
  return a;
}

/* ══════════════════════════ Rutas ══════════════════════════ */

type Oyente = (d: string | ArrayBuffer) => void;

/**
 * Enlace directo `local:nativo-…` (data channel ordenado, binario): entrega en otra tarea; lo binario
 * llega como un ArrayBuffer nuevo. Sugiere 63 KiB como `transporte-universal` (salvo `sinSugerir`).
 * `perder(texto|buf)` = sale pero no llega.
 */
function enlaceDirecto(opts: { sinSugerir?: boolean; perder?: (d: string | ArrayBuffer) => boolean; filtrarVuelta?: (t: string) => string | null } = {}) {
  const oyentes = { a: new Set<Oyente>(), b: new Set<Oyente>() };
  const mensajes = { binarios: 0, textos: 0 };
  const extremo = (yo: "a" | "b"): CanalArchivos => {
    const otro = yo === "a" ? "b" : "a";
    const entregar = (d: string | ArrayBuffer) => {
      if (yo === "a" && opts.perder?.(d)) return true;
      let x: string | ArrayBuffer | null = d;
      if (yo === "b" && typeof d === "string" && opts.filtrarVuelta) x = opts.filtrarVuelta(d);
      if (x === null) return true;
      const y = x;
      setTimeout(() => {
        for (const l of Array.from(oyentes[otro])) l(y);
      }, 0);
      return true;
    };
    return {
      enviar: (t) => {
        if (yo === "a" && t.startsWith('{"t":"archivo.chunk"')) mensajes.textos++;
        return entregar(t);
      },
      enviarBinario: (buf) => {
        if (yo === "a") mensajes.binarios++;
        return entregar(buf.slice(0));
      },
      bufferedAmount: () => 0,
      ...(opts.sinSugerir ? {} : { tamanoTrozo: () => TAM_TROZO_ENLACE_DIRECTO }),
      alMensaje: (cb) => {
        oyentes[yo].add(cb);
        return () => oyentes[yo].delete(cb);
      },
    };
  };
  return { a: extremo("a"), b: extremo("b"), mensajes };
}

const IP_MAC = "192.168.1.10";
const IP_TAB = "192.168.1.20";
/** Los límites que anuncia `malla_local.rs` desde MLT1107A (64 KiB por trama, 300 tramas / 10 s). */
const LIMITES: LimitesCanal = { maxCuerpo: 64 * 1024, porVentana: 300, ventanaMs: 10_000 };

/**
 * Canal TCP 47071 entre dos apps nativas, con el motor real `red-local-nativa-motor` en cada una: tramas
 * validadas como Rust (≤ 64 KiB, objeto JSON), acuse por trama, ritmo de su limitador.
 */
function canalTcp(motores: Record<string, () => MotorArchivos>) {
  const reloj = { ahora: 1_000_000 };
  const redes: Record<string, RedNativa> = {};
  const tramas = { total: 0, maxBytes: 0, rechazadas: 0 };
  /** Lo `archivo.*` que cada app entregó a su web, por IP de la app que lo recibe. */
  const vistos: Record<string, string[]> = {};
  const app = (ip: string, neurona: string, otra: { ip: string; neurona: string }) => {
    const deps: DepsRedNativa = {
      ahora: () => reloj.ahora,
      dormir: async (ms) => {
        reloj.ahora += ms;
        await new Promise((r) => setTimeout(r, 0));
      },
      nuevaSesion: () => `nativo-${neurona}`,
      estado: async () => ({ escuchando: true, vecinos: [{ ip: otra.ip, neurona: otra.neurona, puerto: 47071, canal: true }], limites: LIMITES }),
      enviar: async (destino, _puerto, json) => {
        const t = json.trim();
        if (!(Buffer.byteLength(json, "utf8") <= 64 * 1024 && t.startsWith("{") && t.endsWith("}"))) {
          tramas.rechazadas++;
          return { ok: false, motivo: "trama no válida" };
        }
        tramas.total++;
        tramas.maxBytes = Math.max(tramas.maxBytes, Buffer.byteLength(json, "utf8"));
        const red = redes[destino];
        if (!red) return { ok: false, motivo: "no se pudo conectar" };
        setTimeout(() => void red.recibir(json, ip), 0);
        return { ok: true, ms: 2 };
      },
      yo: async () => ({ neurona, nombre: neurona }),
      vinculos: () => [{ neurona: otra.neurona, nombre: otra.neurona, huella: `fp-${otra.neurona}`, ultimaIp: otra.ip }],
      firmar: async (cuerpo) => ({ v: 2, fp: `fp-${neurona}`, body: cuerpo }),
      verificar: async (s) => {
        const o = s as { fp?: string; body?: unknown };
        return { cuerpo: o.body, huella: o.fp, valido: typeof o.fp === "string" };
      },
      webrtc: () => false,
      enlaceLocalCon: () => false,
      ofrecer: async () => ({ ok: false, motivo: "sin WebRTC" }),
      responder: async () => ({ ok: false, motivo: "sin WebRTC" }),
      entregarTransporte: () => undefined,
      entregarArchivo: (canal, t) => {
        (vistos[ip] ??= []).push(t);
        motores[ip]().manejarMensaje(canal, t, { mismaCuenta: false, verificarPermiso: () => true });
      },
    };
    redes[ip] = crearRedNativa(deps);
  };
  app(IP_MAC, "N-MAC", { ip: IP_TAB, neurona: "N-TAB" });
  app(IP_TAB, "N-TAB", { ip: IP_MAC, neurona: "N-MAC" });
  const ligar = async () => {
    await redes[IP_TAB].refrescar();
    await redes[IP_MAC].refrescar();
    for (let i = 0; i < 50 && !redes[IP_MAC].enlaces().length; i++) await new Promise((r) => setTimeout(r, 0));
    expect(redes[IP_MAC].enlaces().map((e) => e.id)).toEqual([`nativo:${IP_TAB}`]);
  };
  return { haciaTableta: () => redes[IP_MAC].canalArchivos(IP_TAB), tramas, ligar, vistos };
}

/* ══════════════════════════ Los dos lados ══════════════════════════ */

type Ruta = "directo" | "tcp" | "multitrayecto";

interface Par {
  motorA: MotorArchivos;
  motorB: MotorArchivos;
  canalA: CanalArchivos;
  multi: CanalMultitrayecto | null;
  recibidos: Map<string, Blob>;
  /** Todo lo que el receptor manda al remitente (texto), en orden. */
  vuelta: string[];
  directo: ReturnType<typeof enlaceDirecto>;
  tcp: ReturnType<typeof canalTcp>;
}

/**
 * Mac (remitente, almacén en memoria) y tableta (receptor, `almacenB`) con los motores reales; la
 * tableta «acepta» en cuanto ve la oferta (la ventana del envío, ARC1108A). `ruta` elige por dónde.
 */
async function par(ruta: Ruta, almacenB: AlmacenTrozos, cfgA: ConfigMotorArchivos = {}, cfgB: ConfigMotorArchivos = {}, opsEnlace: Parameters<typeof enlaceDirecto>[0] = {}): Promise<Par> {
  const recibidos = new Map<string, Blob>();
  const vuelta: string[] = [];
  const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), ...cfgA });
  const motorB: MotorArchivos = crearMotorArchivos({
    almacen: almacenB,
    onOfertaEntrante: (o) => motorB.aceptarOferta(o.id),
    onCompletado: (e, b) => recibidos.set(e.id, b),
    ...cfgB,
  });
  const directo = enlaceDirecto(opsEnlace);
  const tcp = canalTcp({ [IP_MAC]: () => motorA, [IP_TAB]: () => motorB });
  // Lo que vuelve al remitente (por cualquiera de los dos caminos) se anota y se le entrega.
  directo.a.alMensaje((d) => {
    if (typeof d === "string") vuelta.push(d);
    motorA.manejarMensaje(directo.a, d);
  });
  directo.b.alMensaje((d) => motorB.manejarMensaje(directo.b, d, { mismaCuenta: false, verificarPermiso: () => true }));
  let canalA: CanalArchivos = directo.a;
  let multi: CanalMultitrayecto | null = null;
  if (ruta !== "directo") {
    await tcp.ligar();
    canalA = tcp.haciaTableta();
  }
  if (ruta === "multitrayecto") {
    multi = crearCanalMultitrayecto([
      { id: "local:nativo-1", canal: directo.a, capacidadKbps: 20_000 },
      { id: `nativo:${IP_TAB}`, canal: tcp.haciaTableta(), capacidadKbps: 20_000 },
    ]);
    canalA = multi;
  }
  return { motorA, motorB, canalA, multi, recibidos, vuelta, directo, tcp };
}

const TERMINALES = new Set(["completada", "error", "rechazada", "cancelada"]);

async function esperarHasta(fn: () => boolean, timeoutMs: number, pasoMs = 10): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("esperarHasta: se agotó el tiempo de espera");
    await new Promise((r) => setTimeout(r, pasoMs));
  }
}

/** Manda los archivos a la vez (como Mensajes › Neuronas con «Aceptar todos») y espera a que terminen. */
async function enviarALaVez(p: Par, archivos: Array<{ nombre: string; datos: Uint8Array<ArrayBuffer> }>, esperaMs: number) {
  const fases = new Map<string, string[]>();
  p.motorA.onProgreso((e) => {
    const f = fases.get(e.id) ?? [];
    if (f.at(-1) !== e.fase) f.push(e.fase);
    fases.set(e.id, f);
  });
  const ids: string[] = [];
  for (const a of archivos) {
    const r = await p.motorA.enviarArchivo(p.canalA, new Blob([a.datos]), a.nombre, { tipo: "dispositivo", id: "N-TAB" }, { tipoMime: "application/octet-stream" });
    expect(r.ok, a.nombre).toBe(true);
    ids.push(r.id);
  }
  await esperarHasta(() => ids.every((id) => TERMINALES.has(p.motorA.estadoDe(id)?.fase ?? "")), esperaMs);
  return Promise.all(
    ids.map(async (id, i) => {
      const blob = p.recibidos.get(id);
      return {
        id,
        nombre: archivos[i].nombre,
        fase: p.motorA.estadoDe(id)?.fase,
        motivo: p.motorA.estadoDe(id)?.motivo,
        trozos: p.motorA.estadoDe(id)?.trozos ?? 0,
        fases: fases.get(id) ?? [],
        integro: !!blob && blob.size === archivos[i].datos.byteLength && sha(await blob.arrayBuffer()) === sha(archivos[i].datos),
      };
    }),
  );
}

/** Ningún trozo se escribió dos veces en el almacén del receptor (ni por varios caminos ni al reanudar). */
function repetidos(a: AlmacenMedido): string[] {
  return Array.from(a.escrituras).filter(([, n]) => n > 1).map(([k]) => k);
}

/** Los latidos que llegaron a la Mac (por el enlace directo o por el TCP). */
const latidosDe = (p: Par) =>
  [...p.vuelta, ...(p.tcp.vistos[IP_MAC] ?? [])].filter((t) => t.startsWith('{"t":"archivo.progreso"')).map((t) => JSON.parse(t) as { id: string; n: number; fase: string });

/* ══════════════════════════ 8 MB + 50 MB a la vez, por las tres rutas ══════════════════════════ */

describe("ARC1108B · el vídeo de 8 MB y el .bin de 50 MB a la vez llegan íntegros con un almacén lento y en serie", () => {
  const video = aleatorio(VIDEO);
  const grande = aleatorio(GRANDE);
  const archivos = [
    { nombre: "video.mp4", datos: video },
    { nombre: "grande-50MB.bin", datos: grande },
  ];

  it("por el enlace directo WebRTC (binario, trozos de 63 KiB)", async () => {
    const almacen = almacenEnSerie({ msEscritura: 1, msLectura: 1 });
    const p = await par("directo", almacen);
    const r = await enviarALaVez(p, archivos, 120_000);
    expect(r.map((x) => [x.nombre, x.fase, x.integro])).toEqual([
      ["video.mp4", "completada", true],
      ["grande-50MB.bin", "completada", true],
    ]);
    // 4 veces menos trozos (y escrituras) que con los 16 KiB de antes.
    expect(r[0].trozos).toBe(Math.ceil(VIDEO / TAM_TROZO_ENLACE_DIRECTO));
    expect(r[1].trozos).toBe(Math.ceil(GRANDE / TAM_TROZO_ENLACE_DIRECTO));
    expect(p.directo.mensajes.binarios).toBe(r[0].trozos + r[1].trozos);
    expect(repetidos(almacen)).toEqual([]);
    // UNA pasada por el almacén para verificar y unir (antes: dos, más recorrer los índices).
    expect(almacen.lecturas).toBe(r[0].trozos + r[1].trozos);
    // El receptor acusó lo guardado y latió tras «fin»; el remitente nunca se rindió.
    const latidos = latidosDe(p);
    expect(latidos.some((l) => l.fase === "recibiendo")).toBe(true);
    expect(latidos.some((l) => l.fase === "ensamblando" || l.fase === "verificando" || l.fase === "esperando-trozos")).toBe(true);
    for (const x of r) expect(x.fases).not.toContain("error");
  }, 180_000);

  it("por el canal TCP 47071 (base64, trozos de 46 KiB, uno por trama ≤ 64 KiB)", async () => {
    const almacen = almacenEnSerie({ msEscritura: 1, msLectura: 1 });
    const p = await par("tcp", almacen);
    const r = await enviarALaVez(p, archivos, 150_000);
    expect(r.map((x) => [x.nombre, x.fase, x.integro])).toEqual([
      ["video.mp4", "completada", true],
      ["grande-50MB.bin", "completada", true],
    ]);
    expect(r[0].trozos).toBe(Math.ceil(VIDEO / (46 * 1024)));
    expect(p.tcp.tramas.rechazadas).toBe(0);
    expect(p.tcp.tramas.maxBytes).toBeLessThanOrEqual(64 * 1024);
    expect(repetidos(almacen)).toEqual([]);
    expect(latidosDe(p).length).toBeGreaterThan(0);
  }, 180_000);

  it("por los DOS a la vez (multitrayecto): cada trozo por un solo camino, ninguno escrito dos veces", async () => {
    const almacen = almacenEnSerie({ msEscritura: 1, msLectura: 1 });
    const p = await par("multitrayecto", almacen);
    const r = await enviarALaVez(p, archivos, 150_000);
    expect(r.map((x) => [x.nombre, x.fase, x.integro])).toEqual([
      ["video.mp4", "completada", true],
      ["grande-50MB.bin", "completada", true],
    ]);
    // El trozo es el menor de los dos caminos (el TCP) y salen en binario por el directo y en texto por el TCP.
    expect(r[0].trozos).toBe(Math.ceil(VIDEO / (46 * 1024)));
    const reparto = p.multi?.reparto() ?? {};
    const total = Object.values(reparto).reduce((s, n) => s + n, 0);
    expect(total, "ningún trozo salió por dos caminos").toBe(r[0].trozos + r[1].trozos);
    expect(reparto["local:nativo-1"]).toBeGreaterThan(0);
    expect(reparto[`nativo:${IP_TAB}`]).toBeGreaterThan(0);
    expect(p.directo.mensajes.binarios).toBe(reparto["local:nativo-1"]);
    expect(repetidos(almacen)).toEqual([]);
    expect(almacen.escrituras.size).toBe(r[0].trozos + r[1].trozos);
  }, 180_000);
});

/* ══════════════════════════ El plazo de 85 s, con relojes falsos ══════════════════════════ */

/** Quita del camino de vuelta lo que un receptor ANTERIOR no manda: latidos, `acuses` y `huecos`. */
function comoReceptorAnterior(t: string): string | null {
  if (t.startsWith('{"t":"archivo.progreso"')) return null;
  if (t.startsWith('{"t":"archivo.aceptar"')) {
    const m = JSON.parse(t) as Record<string, unknown>;
    delete m.acuses;
    delete m.huecos;
    return JSON.stringify(m);
  }
  return t;
}

describe("ARC1108B · con latidos, el remitente no se rinde aunque verificar tarde más de 85 s", () => {
  /** Avanza el reloj falso a pasos de 100 ms, dejando correr lo asíncrono de verdad (hash, Blob). */
  async function correr(hasta: () => boolean, maxMs: number): Promise<void> {
    for (let t = 0; t < maxMs && !hasta(); t += 100) {
      for (let k = 0; k < 4; k++) await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(100);
    }
  }

  async function verificacionLenta(receptorAnterior: boolean) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    // 64 trozos de 16 KiB; releer cada uno tarda 1,5 s y el almacén va de uno en uno: unir = 96 s.
    const almacen = almacenEnSerie({ msEscritura: 0, msLectura: 1_500, sinLotes: true });
    const p = await par("directo", almacen, { esperaVerificacionMs: () => 85_000 }, {}, { sinSugerir: true, ...(receptorAnterior ? { filtrarVuelta: comoReceptorAnterior } : {}) });
    const datos = aleatorio(64 * 16 * 1024);
    const momentos: Array<{ fase: string; t: number; codigo?: string }> = [];
    p.motorA.onProgreso((e: EstadoTransferencia) => {
      if (momentos.at(-1)?.fase !== e.fase) momentos.push({ fase: e.fase, t: Date.now(), codigo: e.codigo });
    });
    const r = await p.motorA.enviarArchivo(p.canalA, new Blob([datos]), "video.mp4", { tipo: "dispositivo" });
    await correr(() => p.motorA.estadoDe(r.id)?.fase === "completada", 400_000);
    const verificando = momentos.find((m) => m.fase === "verificando")?.t ?? NaN;
    const completada = momentos.find((m) => m.fase === "completada")?.t ?? NaN;
    return { p, r, momentos, segundos: (completada - verificando) / 1000, datos };
  }

  it("receptor nuevo: late cada 4 s mientras une y verifica, y el remitente sigue esperando hasta el «ok»", async () => {
    const { p, r, momentos, segundos, datos } = await verificacionLenta(false);
    expect(segundos, "verificar tardó más que el plazo de 85 s de la prueba real").toBeGreaterThan(85);
    expect(momentos.map((m) => m.fase)).not.toContain("error");
    expect(p.motorA.estadoDe(r.id)?.fase).toBe("completada");
    expect(sha(await (p.recibidos.get(r.id) as Blob).arrayBuffer())).toBe(sha(datos));
    const ensamblando = latidosDe(p).filter((l) => l.fase === "ensamblando");
    expect(ensamblando.length, "un latido cada 4 s durante ~96 s").toBeGreaterThanOrEqual(20);
  }, 60_000);

  it("receptor ANTERIOR (sin latidos): a los 85 s pasa a «sin-confirmacion» y el «ok» que llega tarde lo da por verificado", async () => {
    const { p, r, momentos } = await verificacionLenta(true);
    const error = momentos.find((m) => m.fase === "error");
    expect(error?.codigo).toBe("sin-confirmacion");
    expect(error && error.t - (momentos.find((m) => m.fase === "verificando")?.t ?? 0)).toBe(85_000);
    expect(momentos.at(-1)?.fase).toBe("completada");
    expect(p.motorA.estadoDe(r.id)?.motivo).toBeUndefined();
  }, 60_000);
});

/* ══════════════════════════ Sin trabajo repetido ══════════════════════════ */

/** Índice de un trozo (binario o `archivo.chunk`), o null si no es un trozo. */
function indiceDe(d: string | ArrayBuffer): number | null {
  if (typeof d !== "string") return decodeChunkBinario(d)?.index ?? null;
  return d.startsWith('{"t":"archivo.chunk"') ? (JSON.parse(d) as { index: number }).index : null;
}

describe("ARC1108B · varios caminos sin trabajo repetido", () => {
  it("un trozo que se pierde por un camino se pide SOLO a él (`huecos`): ni se reenvía lo demás ni se escribe dos veces", async () => {
    let perdido = false;
    const perder = (d: string | ArrayBuffer) => {
      if (perdido || indiceDe(d) !== 5) return false;
      perdido = true;
      return true;
    };
    const uno = enlaceDirecto({ perder });
    const otro = enlaceDirecto({ perder });
    const almacen = almacenEnSerie({ msEscritura: 0, msLectura: 0 });
    const vuelta: string[] = [];
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    const motorB: MotorArchivos = crearMotorArchivos({ almacen, esperaTrozosFaltantesMs: 200, onOfertaEntrante: (o) => motorB.aceptarOferta(o.id) });
    for (const e of [uno, otro]) {
      e.a.alMensaje((d) => {
        if (typeof d === "string") vuelta.push(d);
        motorA.manejarMensaje(e.a, d);
      });
      e.b.alMensaje((d) => motorB.manejarMensaje(e.b, d, { mismaCuenta: false, verificarPermiso: () => true }));
    }
    const multi = crearCanalMultitrayecto([
      { id: "uno", canal: uno.a, capacidadKbps: 10_000 },
      { id: "otro", canal: otro.a, capacidadKbps: 10_000 },
    ]);
    const datos = aleatorio(TAM_TROZO_ENLACE_DIRECTO * 20 - 7);
    const r = await motorA.enviarArchivo(multi, new Blob([datos]), "corte.bin", { tipo: "dispositivo" });
    await esperarHasta(() => TERMINALES.has(motorA.estadoDe(r.id)?.fase ?? ""), 20_000);
    expect(motorA.estadoDe(r.id)?.fase).toBe("completada");
    expect(sha(await (motorB.blobRecibido(r.id) as Blob).arrayBuffer())).toBe(sha(datos));
    const aceptares = vuelta.filter((t) => t.startsWith('{"t":"archivo.aceptar"')).map((t) => JSON.parse(t) as { huecos?: unknown; desde?: number; acuses?: number });
    expect(aceptares).toHaveLength(2);
    expect(aceptares[0].acuses).toBe(1);
    expect(aceptares[1]).toMatchObject({ desde: 5, huecos: [[5, 5]] });
    const enviados = Object.values(multi.reparto()).reduce((s, n) => s + n, 0);
    expect(enviados, "20 trozos y SOLO el perdido otra vez").toBe(21);
    expect(repetidos(almacen)).toEqual([]);
    expect(almacen.escrituras.size).toBe(20);
  });
});

/* ══════════════════════════ Compatibilidad ══════════════════════════ */

describe("ARC1108B · compatible con remitentes y receptores anteriores", () => {
  it("un remitente ANTERIOR (16 KiB en base64, sin ventana ni huecos) → el receptor nuevo verifica con la misma raíz", async () => {
    const T = 16 * 1024;
    const datos = aleatorio(T * 7 + 99);
    const n = Math.ceil(datos.length / T);
    const trozo = (i: number) => datos.slice(i * T, Math.min(datos.length, (i + 1) * T)).buffer;
    const { raiz } = await calcularHashLista(async (i) => trozo(i), n);
    const d = enlaceDirecto({ sinSugerir: true });
    const recibidos = new Map<string, Blob>();
    const motorB: MotorArchivos = crearMotorArchivos({
      almacen: almacenEnSerie(),
      onOfertaEntrante: (o) => motorB.aceptarOferta(o.id),
      onCompletado: (e, b) => recibidos.set(e.id, b),
    });
    d.b.alMensaje((m) => motorB.manejarMensaje(d.b, m, { mismaCuenta: false, verificarPermiso: () => true }));
    const llega: string[] = [];
    d.a.alMensaje((m) => {
      if (typeof m === "string") llega.push(m);
    });
    const id = "arch_remitente_anterior";
    d.a.enviar(JSON.stringify({ t: "archivo.oferta", id, nombre: "viejo.bin", tipo: "application/octet-stream", tamano: datos.length, sha256: raiz, trozos: n, tamanoTrozo: T, destino: { tipo: "dispositivo" }, modo: "base64" }));
    await esperarHasta(() => llega.some((m) => m.startsWith('{"t":"archivo.aceptar"')), 5_000);
    // Como antes: todo de golpe, sin mirar los latidos (un remitente anterior no los entiende y los ignora).
    for (let i = 0; i < n; i++) d.a.enviar(JSON.stringify({ t: "archivo.chunk", id, index: i, datosB64: bufAB64(trozo(i)) }));
    d.a.enviar(JSON.stringify({ t: "archivo.fin", id }));
    await esperarHasta(() => llega.some((m) => m.startsWith('{"t":"archivo.ok"')), 10_000);
    expect(sha(await (recibidos.get(id) as Blob).arrayBuffer())).toBe(sha(datos));
    expect(llega.some((m) => m.startsWith('{"t":"archivo.error"'))).toBe(false);
  });

  it("un receptor ANTERIOR (sin latidos ni huecos) → el remitente nuevo manda sin ventana y termina con su «ok»", async () => {
    const almacen = almacenEnSerie({ msEscritura: 0, msLectura: 0 });
    const p = await par("directo", almacen, {}, {}, { filtrarVuelta: comoReceptorAnterior });
    const r = await enviarALaVez(p, [{ nombre: "a.bin", datos: aleatorio(3_000_000) }], 30_000);
    expect(r[0].fase).toBe("completada");
    expect(r[0].integro).toBe(true);
    expect(latidosDe(p)).toEqual([]);
  });
});

/* ══════════════════════════ Antes de aceptar y al unir ══════════════════════════ */

describe("ARC1108B · lo que no cabe se dice antes y lo que se relee mal no se da por bueno", () => {
  it("si el archivo no cabe (memoria con tope), el receptor lo rechaza ANTES de preguntar ni guardar nada, diciendo por qué", async () => {
    const almacen = almacenEnSerie({ maxBytes: 1024 * 1024 });
    const preguntas: string[] = [];
    const p = await par("directo", almacen, {}, { onOfertaEntrante: (o) => preguntas.push(o.id) });
    const r = await enviarALaVez(p, [{ nombre: "grande.bin", datos: aleatorio(2 * 1024 * 1024) }], 10_000);
    expect(r[0].fase).toBe("rechazada");
    expect(r[0].motivo).toMatch(/^No cabe en el aparato que recibe: solo puede guardarlo en memoria \(hasta 1\.0 MB\) y mide 2\.0 MB\.$/);
    const e = p.motorB.estadoDe(r[0].id);
    expect(e).toMatchObject({ fase: "rechazada", codigo: "sin-espacio", lado: "receptor" });
    expect(preguntas).toEqual([]);
    expect(almacen.escrituras.size).toBe(0);
  });

  it("un trozo que el almacén relee distinto de como llegó → error del almacén (no un «ok» con el archivo malo)", async () => {
    const almacen = almacenEnSerie({ msEscritura: 0, msLectura: 0, releerMal: 3 });
    const p = await par("directo", almacen);
    const r = await enviarALaVez(p, [{ nombre: "a.bin", datos: aleatorio(TAM_TROZO_ENLACE_DIRECTO * 6) }], 10_000);
    expect(r[0].fase).toBe("error");
    expect(p.motorA.estadoDe(r[0].id)?.codigo).toBe("almacen-receptor");
    expect(r[0].motivo).toMatch(/^Falló en el receptor: no pudo guardar o releer los trozos .* el trozo 3 no se relee de IndexedDB \(lento\) igual que llegó/);
    expect(p.recibidos.size).toBe(0);
  });
});

/* ══════════════════════════ Piezas puras ══════════════════════════ */

describe("ARC1108B · piezas puras", () => {
  it("trozo por canal: 46 KiB caben solos en una trama de 64 KiB del TCP; el que se configura manda; lo absurdo se acota", () => {
    expect(trozoArchivoParaTrama(LIMITES_CANAL_ANTERIOR)).toBe(46 * 1024);
    expect(trozoArchivoParaTrama(LIMITES)).toBe(46 * 1024);
    const id = `arch_${"0".repeat(8)}-${"0".repeat(4)}-${"0".repeat(4)}-${"0".repeat(4)}-${"0".repeat(12)}`;
    const texto = JSON.stringify({ t: "archivo.chunk", id, index: 999_999, datosB64: bufAB64(aleatorio(46 * 1024).buffer) });
    expect(Buffer.byteLength(texto)).toBeLessThanOrEqual(maxTextoPorTrama(LIMITES_CANAL_ANTERIOR));
    expect(elegirTamanoTrozo(undefined, {})).toBe(16 * 1024);
    expect(elegirTamanoTrozo(4, { tamanoTrozo: () => 63 * 1024 })).toBe(4);
    expect(elegirTamanoTrozo(undefined, { tamanoTrozo: () => 63 * 1024 + 5 })).toBe(63 * 1024);
    expect(elegirTamanoTrozo(undefined, { tamanoTrozo: () => 10_000_000 })).toBe(256 * 1024);
    expect(
      elegirTamanoTrozo(undefined, {
        tamanoTrozo: () => {
          throw new Error("x");
        },
      }),
    ).toBe(16 * 1024);
    expect(Array.from(new Uint8Array(b64ABuf(bufAB64(new Uint8Array([0, 255, 7]).buffer))))).toEqual([0, 255, 7]);
  });

  it("huecos: rangos de lo que falta y su saneado", () => {
    expect(huecosDe(new Set([0, 1, 3, 6]), 8)).toEqual([
      [2, 2],
      [4, 5],
      [7, 7],
    ]);
    expect(huecosDe([0, 1, 2], 3)).toEqual([]);
    expect(huecosDe([1, 3, 5], 7, 2)).toBeNull();
    expect(sanearHuecos([[2, 2], [4, 5]], 8)).toEqual([
      [2, 2],
      [4, 5],
    ]);
    expect(sanearHuecos([[4, 5], [2, 2]], 8)).toBeNull(); // desordenados
    expect(sanearHuecos([[2, 4], [4, 5]], 8)).toBeNull(); // se solapan
    expect(sanearHuecos([[7, 8]], 8)).toBeNull(); // fuera
    expect(sanearHuecos([[1.5, 2]], 8)).toBeNull();
    expect(sanearHuecos("2-4", 8)).toBeNull();
    expect(sanearHuecos([], 8)).toEqual([]);
  });

  it("lo que dice la burbuja del remitente con cada latido", () => {
    expect(textoProgresoRemoto("ensamblando", 10, 10, 42.7)).toBe("El otro aparato verifica y une el archivo (SHA-256)… 42 %");
    expect(textoProgresoRemoto("recibiendo", 5, 10)).toBe("El otro aparato termina de guardar los trozos… 50 %");
    expect(textoProgresoRemoto("esperando-trozos", 9, 10)).toBe("El otro aparato espera los trozos que aún vienen por otro camino (9 de 10)…");
    expect(textoProgresoRemoto("otra-cosa", 1, 1, 200)).toBe("El otro aparato verifica el SHA-256… 100 %");
  });
});

/* ══════════════════════════ IndexedDB ══════════════════════════ */

/** Lo mínimo de IndexedDB que usa `crearAlmacenIDB`, contando aperturas y transacciones. */
function idbFalso() {
  const datos = new Map<string, unknown>();
  const cuenta = { aperturas: 0, lecturas: 0, escrituras: 0, cursores: 0 };
  const tarde = (fn: () => void) => setTimeout(fn, 0);
  const bound = (lower: string, upper: string) => ({ lower, upper });
  const dentro = (k: string, r: { lower: string; upper: string }) => k >= r.lower && k <= r.upper;
  type Req = { result?: unknown; error: unknown; onsuccess: null | (() => void); onerror: null | (() => void) };
  const transaction = (_tabla: string, modo: "readonly" | "readwrite") => {
    cuenta[modo === "readwrite" ? "escrituras" : "lecturas"]++;
    let vivas = 0;
    const tx = { oncomplete: null as null | (() => void), onerror: null, onabort: null, error: null, objectStore: () => store };
    const pedir = (fn: () => unknown): Req => {
      const req: Req = { error: null, onsuccess: null, onerror: null };
      vivas++;
      tarde(() => {
        req.result = fn();
        req.onsuccess?.();
        if (--vivas === 0) tarde(() => tx.oncomplete?.());
      });
      return req;
    };
    const store = {
      put: (v: unknown, k: string) => pedir(() => (datos.set(k, v), k)),
      get: (k: string) => pedir(() => datos.get(k)),
      getAllKeys: (r: { lower: string; upper: string }) => pedir(() => [...datos.keys()].filter((k) => dentro(k, r)).sort()),
      delete: (r: { lower: string; upper: string }) =>
        pedir(() => {
          for (const k of [...datos.keys()]) if (dentro(k, r)) datos.delete(k);
        }),
      openCursor: () => {
        cuenta.cursores++;
        throw new Error("no debe recorrer la tabla entera con sus datos");
      },
    };
    return tx;
  };
  const db = { objectStoreNames: { contains: () => true }, createObjectStore: () => undefined, transaction, close: () => undefined, onversionchange: null, onclose: null };
  const indexedDB = {
    open: () => {
      cuenta.aperturas++;
      const req = { result: undefined as unknown, error: null, onsuccess: null as null | (() => void), onerror: null, onupgradeneeded: null };
      tarde(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { indexedDB, IDBKeyRange: { bound }, cuenta };
}

describe("ARC1108B · el almacén de IndexedDB", () => {
  it("UNA conexión para todo, escrituras agrupadas en pocas transacciones e índices por rango de claves", async () => {
    const f = idbFalso();
    vi.stubGlobal("indexedDB", f.indexedDB);
    vi.stubGlobal("IDBKeyRange", f.IDBKeyRange);
    const a = crearAlmacenIDB("prueba-arc1108b");
    await a.guardarTrozo("arch_otra", 0, new Uint8Array([9]).buffer);
    await Promise.all(Array.from({ length: 200 }, (_, i) => a.guardarTrozo("arch_x", i, new Uint8Array([i % 256, 1, 2]).buffer)));
    expect(f.cuenta.aperturas, "antes: una apertura por trozo").toBe(1);
    expect(f.cuenta.escrituras, "200 trozos en lotes de hasta 64").toBeLessThanOrEqual(1 + Math.ceil(200 / 64));
    expect(await a.indicesGuardados("arch_x")).toEqual(Array.from({ length: 200 }, (_, i) => i));
    const leidos = (await a.leerTrozos?.("arch_x", [0, 5, 199, 300])) ?? [];
    expect(Array.from(new Uint8Array(leidos[1] as ArrayBuffer))).toEqual([5, 1, 2]);
    expect(leidos[3]).toBeNull();
    await a.limpiar("arch_x");
    expect(await a.indicesGuardados("arch_x")).toEqual([]);
    expect(await a.indicesGuardados("arch_otra")).toEqual([0]);
    expect(f.cuenta.cursores, "nunca un cursor por toda la tabla").toBe(0);
    expect(f.cuenta.aperturas).toBe(1);
  });
});
