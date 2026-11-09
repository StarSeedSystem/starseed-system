/**
 * ARC1108A — «Error · hash-no-coincide» en casi todos los archivos por la red local (prueba real del
 * 08-11 · ~01:36 UTC, Mac «MaggaBook» → tableta Android «Maggaboard», 18 archivos, «Automático»).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * La burbuja del remitente guardó la vía real: `local:nativo-…`, el ENLACE WebRTC que las dos apps
 * abren solas señalizándolo por el canal TCP 47071 (la UI lo llama igual: «Red local (app nativa)»).
 * Ese enlace admite binario, así que el motor negoció `modo: "binario"` y los trozos llegaron por el
 * camino binario de `manejarMensaje`, que guardaba el trozo SIN esperar y lo daba por recibido en el
 * acto: `archivo.fin` verificaba antes de que el almacén (OPFS/IndexedDB, asíncronos) terminara de
 * escribir → trozo vacío → SHA-256 distinto. El vídeo de 8 MB pasó porque releer sus 511 trozos
 * anteriores daba tiempo a que terminara la última escritura.
 *
 * Aquí corren los motores REALES de los dos lados sobre las DOS rutas que la UI llama «Red local
 * (app nativa)», con un almacén ASÍNCRONO como OPFS (no el mapa en memoria de las otras pruebas):
 *  · `local:nativo-…`: data channel ordenado, binaryType "arraybuffer" (lo binario llega como un
 *    ArrayBuffer nuevo, en otra tarea, en orden);
 *  · `nativo:<ip>`: el canal TCP con las tramas de `malla_local_trama.rs` (cuerpo JSON ≤ 64 KiB,
 *    acuse por trama, lotes `nl.lote`), armadas por el motor real `red-local-nativa-motor.ts`,
 *    incluso con acuses perdidos (la trama se reenvía y llega DOS veces).
 * Con los 18 formatos de la prueba (sintéticos, con su cabecera real y su tamaño) y, si están en
 * esta máquina, con los archivos reales de `~/.starseed/pruebas-malla/` y sus SHA-256.
 */
import { createHash, randomFillSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_VISTA_IMAGEN,
  b64ABuf,
  calcularHashLista,
  crearAlmacenAuto,
  crearAlmacenEnCadena,
  crearAlmacenEnMemoria,
  crearMotorArchivos,
  decodeChunkBinario,
  encodeChunkBinario,
  opfsEscribible,
  sanearRutaRelativa,
  sanearVista,
  type AlmacenTrozos,
  type CanalArchivos,
  type EstadoTransferencia,
  type MotorArchivos,
} from "@/lib/network/archivos-malla";
import { crearRedNativa, type DepsRedNativa, type RedNativa } from "@/lib/malla/red-local-nativa-motor";
import { FALLOS_PARA_CAIDA, type LimitesCanal } from "@/lib/malla/red-local-nativa";

/* ══════════════════════════ Los 18 archivos de la prueba ══════════════════════════ */

interface Fijo {
  nombre: string;
  tipo: string;
  datos: Uint8Array<ArrayBuffer>;
}

const CABECERAS: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff, 0xe0],
  heic: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34],
  docx: [0x50, 0x4b, 0x03, 0x04],
  zip: [0x50, 0x4b, 0x03, 0x04],
  mp3: [0x49, 0x44, 0x33, 0x04],
  m4a: [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20],
  wav: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45],
  mp4: [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d],
  webm: [0x1a, 0x45, 0xdf, 0xa3],
};

function binario(ext: string, tamano: number): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(tamano);
  randomFillSync(d);
  d.set((CABECERAS[ext] ?? []).slice(0, tamano));
  return d;
}

function texto(t: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(t));
}

/** Los 18 de `~/Downloads/pruebas-malla/`: mismos nombres, tipos (como los da el navegador) y tamaños. */
function fijosSinteticos(incluirGrande = true): Fijo[] {
  const f: Fijo[] = [
    { nombre: "imagen.png", tipo: "image/png", datos: binario("png", 96_453) },
    { nombre: "foto.jpg", tipo: "image/jpeg", datos: binario("jpg", 73_690) },
    { nombre: "foto.heic", tipo: "image/heic", datos: binario("heic", 39_056) },
    { nombre: "animacion.gif", tipo: "image/gif", datos: binario("gif", 119_263) },
    { nombre: "logo.svg", tipo: "image/svg+xml", datos: texto('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#7c3aed"/><text x="32" y="38" text-anchor="middle" fill="#fff">✦ ñ</text></svg>') },
    { nombre: "documento.pdf", tipo: "application/pdf", datos: binario("pdf", 12_890) },
    { nombre: "documento.docx", tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", datos: binario("docx", 3_567) },
    { nombre: "texto.txt", tipo: "text/plain", datos: texto("Prueba de la malla: acentos áéíóú ñ, emoji 🌱✨ y fin de línea\r\n") },
    { nombre: "nota.md", tipo: "text/markdown", datos: texto("# Nota\n\n- uno\n- dos ✦\n") },
    { nombre: "datos.json", tipo: "application/json", datos: texto('{"hola":"señal","n":[1,2,3]}') },
    { nombre: "tabla.csv", tipo: "text/csv", datos: texto("a,b\n1,ñ\n") },
    { nombre: "archivo.zip", tipo: "application/zip", datos: binario("zip", 438) },
    { nombre: "voz.mp3", tipo: "audio/mpeg", datos: binario("mp3", 15_691) },
    { nombre: "voz.m4a", tipo: "audio/x-m4a", datos: binario("m4a", 19_690) },
    { nombre: "voz.wav", tipo: "audio/wav", datos: binario("wav", 167_774) },
    { nombre: "video.mp4", tipo: "video/mp4", datos: binario("mp4", 8_034_291) },
    { nombre: "video.webm", tipo: "video/webm", datos: binario("webm", 154_830) },
  ];
  if (incluirGrande) f.push({ nombre: "grande-50MB.bin", tipo: "application/octet-stream", datos: binario("bin", 52_428_800) });
  return f;
}

const DIR_REAL = path.join(homedir(), ".starseed", "pruebas-malla");
const SUMAS_REALES = path.join(homedir(), ".starseed", "pruebas-malla.sha256");
const HAY_REALES = existsSync(DIR_REAL) && existsSync(SUMAS_REALES);

const TIPOS_REALES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", heic: "image/heic", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown",
  json: "application/json", csv: "text/csv", zip: "application/zip", mp3: "audio/mpeg", m4a: "audio/x-m4a", wav: "audio/wav",
  mp4: "video/mp4", webm: "video/webm", bin: "application/octet-stream",
};

/** Los archivos reales de la prueba con el SHA-256 que guardó Alex (solo si están en esta máquina). */
function fijosReales(): Array<Fijo & { sha256: string }> {
  return readFileSync(SUMAS_REALES, "utf8")
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 2)
    .map(([sha256, nombre]) => ({ nombre, sha256, tipo: TIPOS_REALES[nombre.split(".").pop() ?? ""] ?? "", datos: new Uint8Array(readFileSync(path.join(DIR_REAL, nombre))) }));
}

const sha = (d: Uint8Array | ArrayBuffer) => createHash("sha256").update(d instanceof Uint8Array ? d : new Uint8Array(d)).digest("hex");

/* ══════════════════════════ Almacén asíncrono (como OPFS) ══════════════════════════ */

/**
 * Como OPFS con `createWritable`: lo escrito solo se ve al cerrar, varias tareas después. Las otras
 * pruebas usan el mapa en memoria, que guarda en el acto: con él el fallo NUNCA se veía.
 */
function almacenComoOpfs(msEscritura = 3): AlmacenTrozos & { escrituras: number } {
  const base = crearAlmacenEnMemoria();
  const a = {
    escrituras: 0,
    async guardarTrozo(id: string, index: number, datos: ArrayBuffer) {
      a.escrituras++;
      const copia = datos.slice(0);
      await new Promise((r) => setTimeout(r, msEscritura));
      await base.guardarTrozo(id, index, copia);
    },
    leerTrozo: (id: string, index: number) => base.leerTrozo(id, index),
    indicesGuardados: (id: string) => base.indicesGuardados(id),
    ensamblar: (id: string, tipo: string) => base.ensamblar(id, tipo),
    limpiar: (id: string) => base.limpiar(id),
  };
  return a;
}

/* ══════════════════════════ Ruta 1 · enlace `local:nativo-…` (data channel) ══════════════════════════ */

/**
 * Un RTCDataChannel ordenado con `binaryType = "arraybuffer"` (`emparejar-sin-internet.ts`): entrega
 * en orden y en otra tarea; lo binario llega como un ArrayBuffer NUEVO. Devuelve los dos extremos.
 */
function enlaceLocalSimulado(): { a: CanalArchivos; b: CanalArchivos; binarios: { ab: number } } {
  const oyentes = { a: new Set<(d: string | ArrayBuffer) => void>(), b: new Set<(d: string | ArrayBuffer) => void>() };
  const binarios = { ab: 0 };
  const extremo = (yo: "a" | "b"): CanalArchivos => {
    const otro = yo === "a" ? "b" : "a";
    const entregar = (d: string | ArrayBuffer) => {
      setTimeout(() => {
        for (const l of Array.from(oyentes[otro])) l(d);
      }, 0);
      return true;
    };
    return {
      enviar: (t) => entregar(t),
      enviarBinario: (buf) => {
        if (yo === "a") binarios.ab++;
        return entregar(buf.slice(0));
      },
      bufferedAmount: () => 0,
      alMensaje: (cb) => {
        oyentes[yo].add(cb);
        return () => oyentes[yo].delete(cb);
      },
    };
  };
  return { a: extremo("a"), b: extremo("b"), binarios };
}

interface Lados {
  motorA: MotorArchivos;
  motorB: MotorArchivos;
  canalA: CanalArchivos;
  recibidos: Map<string, Blob>;
}

/**
 * Remitente (Mac) y receptor (tableta) con los motores reales. El receptor recibe como
 * `asegurarRecepcionLocal` (`transporte-universal.ts`): otra app vinculada → SIEMPRE pregunta, y
 * aquí la persona pulsa «Aceptar» en cuanto ve la oferta.
 */
function porEnlaceLocal(almacenB: AlmacenTrozos): Lados & { binarios: { ab: number } } {
  const enlace = enlaceLocalSimulado();
  const recibidos = new Map<string, Blob>();
  const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
  const motorB: MotorArchivos = crearMotorArchivos({
    almacen: almacenB,
    onOfertaEntrante: (o) => motorB.aceptarOferta(o.id),
    onCompletado: (e, blob) => recibidos.set(e.id, blob),
  });
  enlace.a.alMensaje((d) => motorA.manejarMensaje(enlace.a, d));
  enlace.b.alMensaje((d) => {
    if (typeof d !== "string" || d.startsWith('{"t":"archivo.')) {
      motorB.manejarMensaje(enlace.b, d, { mismaCuenta: false, etiquetaOrigen: "MaggaBook (red local · app nativa)", verificarPermiso: () => true });
    }
  });
  return { motorA, motorB, canalA: enlace.a, recibidos, binarios: enlace.binarios };
}

/* ══════════════════════════ Ruta 2 · canal TCP `nativo:<ip>` (tramas de Rust) ══════════════════════════ */

const IP_MAC = "192.168.1.10";
const IP_TABLETA = "192.168.1.20";
const LIMITES: LimitesCanal = { maxCuerpo: 64 * 1024, porVentana: 300, ventanaMs: 10_000 };
/** `malla_local_trama::MAX_CUERPO`. */
const MAX_CUERPO_RUST = 64 * 1024;

/** Lo que `validar_cuerpo` (Rust) exige antes de escribir una trama. */
function tramaValidaComoRust(cuerpo: string): boolean {
  const t = cuerpo.trim();
  return t.length > 0 && Buffer.byteLength(cuerpo, "utf8") <= MAX_CUERPO_RUST && t.startsWith("{") && t.endsWith("}");
}

/**
 * Dos apps nativas vinculadas, cada una con su `crearRedNativa` real. `enviar` hace lo de
 * `malla_local::enviar`: valida la trama como Rust, la «escribe» y espera el acuse; la otra app la
 * emite a su web (`malla-local://mensaje` → `red.recibir`). `perderAcuse(n)`: la n-ésima trama HACIA
 * ESA APP llega pero su acuse no (la web la reintenta y llega DOS veces, como en una red real).
 *
 * (SUP0911E) Se cuenta por destino. Con un contador común a los dos sentidos, el reintento de una trama
 * podía caer otra vez en un múltiplo (rachas de 2 en casi cada vuelta) y, con `FALLOS_PARA_CAIDA` acuses
 * perdidos seguidos, una app daba a la otra por caída `CAIDA_MS` en este reloj, que solo avanza con
 * `dormir`: la caída no acababa nunca, los «ok» del receptor se perdían y la CI caía con los 16 archivos
 * ÍNTEGROS en el receptor y «no confirmó la verificación a tiempo» a los 45 s (09-11: 3 de ~25 runs).
 * La prueba de acuses perdidos es de tramas duplicadas, no de caídas: `tramas.rachaPerdidas` lo vigila.
 */
function porCanalNativo(
  almacenB: AlmacenTrozos,
  opts: { perderAcuse?: (n: number) => boolean } = {},
): Lados & { tramas: { total: number; maxBytes: number; rechazadas: number; duplicadas: number; rachaPerdidas: number }; redes: Record<string, RedNativa> } {
  const reloj = { ahora: 1_000_000 };
  const redes: Record<string, RedNativa> = {};
  const tramas = { total: 0, maxBytes: 0, rechazadas: 0, duplicadas: 0, rachaPerdidas: 0 };
  /** (SUP0911E) Tramas hacia cada app y acuses perdidos seguidos hacia ella. */
  const hacia: Record<string, { n: number; seguidas: number }> = {};
  const recibidos = new Map<string, Blob>();
  const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
  const motorB: MotorArchivos = crearMotorArchivos({
    almacen: almacenB,
    onOfertaEntrante: (o) => motorB.aceptarOferta(o.id),
    onCompletado: (e, blob) => recibidos.set(e.id, blob),
  });
  const motores: Record<string, MotorArchivos> = { [IP_MAC]: motorA, [IP_TABLETA]: motorB };
  const app = (ip: string, neurona: string, huella: string, nombre: string, otra: { ip: string; neurona: string; huella: string; nombre: string }) => {
    const deps: DepsRedNativa = {
      ahora: () => reloj.ahora,
      dormir: async (ms) => {
        reloj.ahora += ms;
        await new Promise((r) => setTimeout(r, 0));
      },
      nuevaSesion: () => `nativo-${neurona}`,
      estado: async () => ({ escuchando: true, vecinos: [{ ip: otra.ip, neurona: otra.neurona, puerto: 47071, canal: true }], limites: LIMITES }),
      enviar: async (destino, _puerto, json) => {
        if (!tramaValidaComoRust(json)) {
          tramas.rechazadas++;
          return { ok: false, motivo: "No se envía: la trama no es válida." };
        }
        tramas.total++;
        tramas.maxBytes = Math.max(tramas.maxBytes, Buffer.byteLength(json, "utf8"));
        const red = redes[destino];
        if (!red) return { ok: false, motivo: "no se pudo conectar" };
        const h = (hacia[destino] ??= { n: 0, seguidas: 0 });
        const n = ++h.n;
        // La app que escucha la guarda en su buzón, acusa y la emite a su web en otra tarea.
        setTimeout(() => void red.recibir(json, ip), 0);
        if (opts.perderAcuse?.(n)) {
          tramas.duplicadas++;
          h.seguidas++;
          tramas.rachaPerdidas = Math.max(tramas.rachaPerdidas, h.seguidas);
          return { ok: false, motivo: "tiempo agotado esperando a la otra neurona" };
        }
        h.seguidas = 0;
        return { ok: true, ms: 2 };
      },
      yo: async () => ({ neurona, nombre }),
      vinculos: () => [{ neurona: otra.neurona, nombre: otra.nombre, huella: otra.huella, ultimaIp: otra.ip }],
      firmar: async (cuerpo) => ({ v: 2, fp: huella, body: cuerpo }),
      verificar: async (s) => {
        const o = s as { fp?: string; body?: unknown };
        return { cuerpo: o.body, huella: o.fp, valido: typeof o.fp === "string" };
      },
      webrtc: () => false,
      enlaceLocalCon: () => false,
      ofrecer: async () => ({ ok: false, motivo: "sin WebRTC en esta prueba" }),
      responder: async () => ({ ok: false, motivo: "sin WebRTC en esta prueba" }),
      entregarTransporte: () => undefined,
      // Como `depsReales().entregarArchivo`: otra app vinculada → el motor SIEMPRE pregunta.
      entregarArchivo: (canal, t, etiquetaOrigen, quien) =>
        motores[ip].manejarMensaje(canal, t, {
          mismaCuenta: false,
          etiquetaOrigen,
          verificarPermiso: () => true,
          via: "Red local (app nativa) · canal TCP 47071",
          ...(quien ? { verificacion: { tipo: "firma" as const, huella: quien.huella, texto: "Saludo firmado" } } : {}),
        }),
    };
    redes[ip] = crearRedNativa(deps);
  };
  app(IP_MAC, "N-MAC", "fp-mac", "MaggaBook", { ip: IP_TABLETA, neurona: "N-TAB", huella: "fp-tab", nombre: "Maggaboard" });
  app(IP_TABLETA, "N-TAB", "fp-tab", "Maggaboard", { ip: IP_MAC, neurona: "N-MAC", huella: "fp-mac", nombre: "MaggaBook" });
  return { motorA, motorB, canalA: redes[IP_MAC].canalArchivos(IP_TABLETA), recibidos, tramas, redes };
}

async function ligarApps(redes: Record<string, RedNativa>): Promise<void> {
  await redes[IP_TABLETA].refrescar();
  await redes[IP_MAC].refrescar();
  for (let i = 0; i < 50 && !redes[IP_MAC].enlaces().length; i++) await new Promise((r) => setTimeout(r, 0));
  expect(redes[IP_MAC].enlaces().map((e) => e.id)).toEqual([`nativo:${IP_TABLETA}`]);
}

/* ══════════════════════════ Envío y comprobación ══════════════════════════ */

const TERMINALES = new Set(["completada", "error", "rechazada", "cancelada"]);

async function esperarHasta(fn: () => boolean, timeoutMs: number, pasoMs = 10): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("esperarHasta: se agotó el tiempo de espera");
    await new Promise((r) => setTimeout(r, pasoMs));
  }
}

interface Resultado {
  nombre: string;
  fase: string | undefined;
  motivo: string | undefined;
  integro: boolean;
}

/** Manda los archivos como Mensajes › Neuronas (uno detrás de otro) y espera a que TODOS terminen. */
async function enviarTodos(l: Lados, fijos: Array<Fijo & { sha256?: string }>, esperaMs: number): Promise<Resultado[]> {
  const ids: string[] = [];
  for (const f of fijos) {
    const r = await l.motorA.enviarArchivo(l.canalA, new Blob([f.datos], { type: f.tipo }), f.nombre, { tipo: "dispositivo", id: "N-TAB" }, { tipoMime: f.tipo });
    expect(r.ok, f.nombre).toBe(true);
    ids.push(r.id);
  }
  await esperarHasta(() => ids.every((id) => TERMINALES.has(l.motorA.estadoDe(id)?.fase ?? "")), esperaMs);
  const out: Resultado[] = [];
  for (let i = 0; i < fijos.length; i++) {
    const e: EstadoTransferencia | undefined = l.motorA.estadoDe(ids[i]);
    const blob = l.recibidos.get(ids[i]);
    const esperado = fijos[i].sha256 ?? sha(fijos[i].datos);
    out.push({ nombre: fijos[i].nombre, fase: e?.fase, motivo: e?.motivo, integro: !!blob && sha(await blob.arrayBuffer()) === esperado });
  }
  return out;
}

function todosBien(r: Resultado[]): Resultado[] {
  return r.filter((x) => x.fase !== "completada" || !x.integro);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ══════════════════════════ La prueba real, reproducida ══════════════════════════ */

describe("ARC1108A · los 18 archivos de la prueba llegan íntegros por la red local", () => {
  it("por el enlace `local:nativo-…` (trozos binarios) con un almacén asíncrono como OPFS", async () => {
    const l = porEnlaceLocal(almacenComoOpfs());
    const r = await enviarTodos(l, fijosSinteticos(), 90_000);
    expect(l.binarios.ab, "los trozos viajaron en binario, como en la prueba real").toBeGreaterThan(0);
    expect(todosBien(r)).toEqual([]);
  }, 120_000);

  it("por el canal TCP `nativo:<ip>` (tramas ≤ 64 KiB con acuse, en lotes) con el mismo almacén", async () => {
    const l = porCanalNativo(almacenComoOpfs());
    await ligarApps(l.redes);
    const r = await enviarTodos(l, fijosSinteticos(false), 90_000);
    expect(todosBien(r)).toEqual([]);
    expect(l.tramas.rechazadas, "ninguna trama pasa del tope de Rust").toBe(0);
    expect(l.tramas.maxBytes).toBeLessThanOrEqual(MAX_CUERPO_RUST);
  }, 120_000);

  it("por el canal TCP aunque se pierdan acuses (tramas que llegan dos veces: trozos y «fin» duplicados)", async () => {
    const l = porCanalNativo(almacenComoOpfs(), { perderAcuse: (n) => n % 5 === 0 });
    await ligarApps(l.redes);
    const r = await enviarTodos(l, fijosSinteticos(false).filter((f) => f.datos.byteLength < 1_000_000), 60_000);
    expect(l.tramas.duplicadas).toBeGreaterThan(0);
    // (SUP0911E) Duplicadas, sí; una racha que dé a la otra app por caída, nunca (ver `porCanalNativo`).
    expect(l.tramas.rachaPerdidas).toBeLessThan(FALLOS_PARA_CAIDA);
    expect(todosBien(r)).toEqual([]);
  }, 90_000);

  it.runIf(HAY_REALES)("con los archivos REALES de ~/.starseed/pruebas-malla y su SHA-256 (enlace local, binario)", async () => {
    const l = porEnlaceLocal(almacenComoOpfs());
    const r = await enviarTodos(l, fijosReales(), 90_000);
    expect(r).toHaveLength(18);
    expect(todosBien(r)).toEqual([]);
  }, 120_000);

  it.runIf(HAY_REALES)("con los archivos REALES por el canal TCP (base64 en tramas)", async () => {
    const l = porCanalNativo(almacenComoOpfs());
    await ligarApps(l.redes);
    const r = await enviarTodos(l, fijosReales().filter((f) => f.datos.byteLength < 20_000_000), 90_000);
    expect(r).toHaveLength(17);
    expect(todosBien(r)).toEqual([]);
  }, 120_000);
});

/* ══════════════════════════ Regresiones (ARC1108A) ══════════════════════════ */

/** Un archivo por un par de motores, con canal opcionalmente manipulado. Devuelve el id. */
async function unArchivo(l: Lados, datos: Uint8Array<ArrayBuffer>, nombre = "a.bin", opciones: { idTransferencia?: string } = {}): Promise<string> {
  const r = await l.motorA.enviarArchivo(l.canalA, new Blob([datos]), nombre, { tipo: "dispositivo" }, { tipoMime: "application/octet-stream", ...opciones });
  expect(r.ok).toBe(true);
  await esperarHasta(() => TERMINALES.has(l.motorA.estadoDe(r.id)?.fase ?? ""), 20_000);
  return r.id;
}

describe("ARC1108A · trozos de varios tamaños y vistas con desplazamiento", () => {
  it("un archivo de varios trozos con el último a medias llega íntegro por las dos rutas", async () => {
    const datos = binario("bin", 16 * 1024 * 3 + 123);
    const local = porEnlaceLocal(almacenComoOpfs());
    const idL = await unArchivo(local, datos);
    expect(local.motorA.estadoDe(idL)?.fase).toBe("completada");
    expect(sha(await (local.recibidos.get(idL) as Blob).arrayBuffer())).toBe(sha(datos));

    const nativo = porCanalNativo(almacenComoOpfs());
    await ligarApps(nativo.redes);
    const idN = await unArchivo(nativo, datos);
    expect(nativo.motorA.estadoDe(idN)?.fase).toBe("completada");
    expect(sha(await (nativo.recibidos.get(idN) as Blob).arrayBuffer())).toBe(sha(datos));
  });

  it("b64ABuf devuelve exactamente sus bytes aunque Node los saque de su reserva compartida (vista con desplazamiento)", () => {
    const original = new Uint8Array([7, 8, 9, 250, 0, 1]);
    const b64 = Buffer.from(original).toString("base64");
    const pool = Buffer.from(b64, "base64");
    expect(pool.byteOffset > 0 || pool.buffer.byteLength > pool.byteLength).toBe(true); // la sospecha existía…
    const buf = b64ABuf(b64);
    expect(buf.byteLength).toBe(6); // …y no se cumple: copia exacta, no la reserva entera
    expect(Array.from(new Uint8Array(buf))).toEqual(Array.from(original));
  });

  it("un trozo binario decodificado es una copia exacta (sin la cabecera ni el buffer de alrededor)", () => {
    const datos = new Uint8Array([1, 2, 3, 4, 5]);
    const enc = encodeChunkBinario("arch_x", 3, datos.buffer);
    const dec = decodeChunkBinario(enc);
    expect(dec?.index).toBe(3);
    expect(dec?.datos.byteLength).toBe(5);
    expect(Array.from(new Uint8Array(dec?.datos as ArrayBuffer))).toEqual([1, 2, 3, 4, 5]);
  });

  it("el hash de una lista de trozos es el mismo si el almacén devuelve vistas (subarray) en vez de ArrayBuffers", async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const exactos = [a.slice(0, 3).buffer, a.slice(3).buffer];
    const grande = new Uint8Array(64);
    grande.set(a, 10);
    const vistas = [grande.subarray(10, 13), grande.subarray(13, 18)];
    const r1 = await calcularHashLista(async (i) => exactos[i], 2);
    const r2 = await calcularHashLista(async (i) => vistas[i] as unknown as ArrayBuffer, 2);
    expect(r2.raiz).toBe(r1.raiz);
  });

  it("un almacén que devuelve vistas (como algunos IndexedDB) no rompe ni la verificación ni el archivo ensamblado", async () => {
    const base = almacenComoOpfs(1);
    const devuelveVistas: AlmacenTrozos = {
      ...base,
      leerTrozo: async (id, i) => {
        const d = await base.leerTrozo(id, i);
        if (!d) return null;
        const grande = new Uint8Array(d.byteLength + 32);
        grande.set(new Uint8Array(d), 16);
        return grande.subarray(16, 16 + d.byteLength) as unknown as ArrayBuffer;
      },
    };
    const datos = binario("bin", 40_000);
    const l = porEnlaceLocal(crearAlmacenEnCadena([devuelveVistas]));
    const id = await unArchivo(l, datos);
    expect(l.motorA.estadoDe(id)?.fase).toBe("completada");
    expect(sha(await (l.recibidos.get(id) as Blob).arrayBuffer())).toBe(sha(datos));
  });
});

describe("ARC1108A · el almacén de trozos nunca pierde un trozo en silencio", () => {
  it("OPFS sin createWritable (Safari/WKWebView, WebView antiguo): crearAlmacenAuto no lo elige y el archivo llega", async () => {
    // navigator.storage.getDirectory existe, FileSystemFileHandle.prototype.createWritable no.
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => ({}) } });
    vi.stubGlobal("FileSystemFileHandle", function FileSystemFileHandle() {});
    expect(opfsEscribible()).toBe(false);
    const almacen = crearAlmacenAuto();
    expect(almacen.tipo).toBe("memoria");
    const datos = binario("bin", 50_000);
    const l = porEnlaceLocal(almacen);
    const id = await unArchivo(l, datos);
    expect(l.motorA.estadoDe(id)?.fase).toBe("completada");
    expect(sha(await (l.recibidos.get(id) as Blob).arrayBuffer())).toBe(sha(datos));
  });

  it("si el primer almacén falla al escribir (cuota, permisos), los trozos van al siguiente y el archivo llega", async () => {
    const roto: AlmacenTrozos = {
      tipo: "OPFS",
      guardarTrozo: async () => {
        throw new Error("QuotaExceededError");
      },
      leerTrozo: async () => null,
      indicesGuardados: async () => [],
      ensamblar: async (_id, tipo) => new Blob([], { type: tipo }),
      limpiar: async () => undefined,
    };
    const cadena = crearAlmacenEnCadena([roto, almacenComoOpfs(1)]);
    const datos = binario("bin", 70_000);
    const l = porEnlaceLocal(cadena);
    const id = await unArchivo(l, datos);
    expect(l.motorA.estadoDe(id)?.fase).toBe("completada");
    expect(sha(await (l.recibidos.get(id) as Blob).arrayBuffer())).toBe(sha(datos));
    expect(cadena.tipo).toMatch(/tras fallar OPFS/);
  });

  it("si NINGÚN almacén puede guardar, falla diciendo dónde y por qué (no «hash-no-coincide» a ciegas)", async () => {
    const roto: AlmacenTrozos = {
      tipo: "IndexedDB",
      guardarTrozo: async () => {
        throw new Error("bloqueado en este origen");
      },
      leerTrozo: async () => null,
      indicesGuardados: async () => [],
      ensamblar: async (_id, tipo) => new Blob([], { type: tipo }),
      limpiar: async () => undefined,
    };
    const l = porEnlaceLocal(crearAlmacenEnCadena([roto]));
    const id = await unArchivo(l, binario("bin", 20_000));
    const e = l.motorA.estadoDe(id);
    expect(e?.fase).toBe("error");
    expect(e?.lado).toBe("receptor");
    expect(e?.codigo).toBe("almacen-receptor");
    expect(e?.motivo).toMatch(/^Falló en el receptor: no pudo guardar/);
    expect(e?.motivo).toMatch(/bloqueado en este origen/);
    expect(l.motorB.estadoDe(id)?.motivo).toMatch(/^Falló en este aparato \(receptor\)/);
  });
});

describe("ARC1108A · «fin» repetido, reintentar y reanudar", () => {
  it("un «fin» repetido después de verificar no vacía el archivo recibido ni cambia el «ok» por un error", async () => {
    const l = porEnlaceLocal(almacenComoOpfs());
    const datos = binario("bin", 30_000);
    const id = await unArchivo(l, datos);
    expect(l.motorA.estadoDe(id)?.fase).toBe("completada");
    l.canalA.enviar(JSON.stringify({ t: "archivo.fin", id }));
    l.canalA.enviar(JSON.stringify({ t: "archivo.fin", id }));
    await new Promise((r) => setTimeout(r, 120));
    expect(l.motorB.estadoDe(id)?.fase).toBe("completada");
    expect(sha(await (l.motorB.blobRecibido(id) as Blob).arrayBuffer())).toBe(sha(datos));
    expect(l.motorA.estadoDe(id)?.fase).toBe("completada");
  });

  it("tras un error de integridad, la burbuja dice el lado y «Reintentar» (mismo id) llega sin volver a preguntar", async () => {
    // Primer intento por un canal que estropea UN trozo en tránsito; el segundo, limpio.
    const enlace = enlaceLocalSimulado();
    let estropear = true;
    const canalA: CanalArchivos = {
      ...enlace.a,
      enviarBinario: (buf) => {
        const copia = new Uint8Array(buf.slice(0));
        if (estropear && copia.byteLength > 100) {
          copia[copia.byteLength - 1] ^= 0xff;
          estropear = false;
        }
        return enlace.a.enviarBinario?.(copia.buffer) ?? false;
      },
    };
    const preguntas: string[] = [];
    const recibidos = new Map<string, Blob>();
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    const motorB: MotorArchivos = crearMotorArchivos({
      almacen: almacenComoOpfs(),
      onOfertaEntrante: (o) => {
        preguntas.push(o.id);
        motorB.aceptarOferta(o.id);
      },
      onCompletado: (e, b) => recibidos.set(e.id, b),
    });
    enlace.a.alMensaje((d) => motorA.manejarMensaje(canalA, d));
    enlace.b.alMensaje((d) => motorB.manejarMensaje(enlace.b, d, { mismaCuenta: false, verificarPermiso: () => true }));
    const l: Lados = { motorA, motorB, canalA, recibidos };
    const datos = binario("bin", 50_000);
    const id = await unArchivo(l, datos);
    const e = motorA.estadoDe(id);
    expect(e?.fase).toBe("error");
    expect(e?.codigo).toBe("hash-no-coincide");
    expect(e?.lado).toBe("receptor");
    expect(e?.motivo).toMatch(/^Falló en el receptor: la verificación de integridad/);
    expect(motorA.archivoDeEnvio(id), "el archivo se queda para «Reintentar»").toBeDefined();

    // «Reintentar»: el mismo archivo con el mismo id. El receptor ya lo aceptó: no vuelve a preguntar.
    await unArchivo(l, datos, "a.bin", { idTransferencia: id });
    expect(motorA.estadoDe(id)?.fase).toBe("completada");
    expect(sha(await (recibidos.get(id) as Blob).arrayBuffer())).toBe(sha(datos));
    expect(preguntas).toEqual([id]);
  });

  it("reanuda desde el PRIMER trozo que falta (con huecos), no desde «el mayor + 1»", async () => {
    const almacen = crearAlmacenEnMemoria();
    const datos = binario("bin", 16 * 1024 * 5);
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    // El receptor ya tiene los trozos 0, 1 y 3 de una sesión anterior.
    for (const i of [0, 1, 3]) await almacen.guardarTrozo("arch_hueco", i, datos.slice(i * 16384, (i + 1) * 16384).buffer);
    const vistos: string[] = [];
    const enlace = enlaceLocalSimulado();
    const motorB: MotorArchivos = crearMotorArchivos({ almacen, onOfertaEntrante: (o) => motorB.aceptarOferta(o.id) });
    enlace.a.alMensaje((d) => {
      if (typeof d === "string") vistos.push(d);
      motorA.manejarMensaje(enlace.a, d);
    });
    enlace.b.alMensaje((d) => motorB.manejarMensaje(enlace.b, d, { mismaCuenta: false, verificarPermiso: () => true }));
    const r = await motorA.enviarArchivo(enlace.a, new Blob([datos]), "hueco.bin", { tipo: "dispositivo" }, { idTransferencia: "arch_hueco" });
    await esperarHasta(() => TERMINALES.has(motorA.estadoDe(r.id)?.fase ?? ""), 10_000);
    const aceptar = vistos.map((v) => JSON.parse(v) as { t: string; desde?: number }).find((m) => m.t === "archivo.aceptar");
    expect(aceptar?.desde).toBe(2);
    expect(motorA.estadoDe(r.id)?.fase).toBe("completada");
    expect(sha(await (motorB.blobRecibido(r.id) as Blob).arrayBuffer())).toBe(sha(datos));
  });

  it("si faltan trozos al llegar «fin», el receptor lo dice con el primero que falta y el remitente reanuda solo", async () => {
    const enlace = enlaceLocalSimulado();
    let perder = true;
    const canalA: CanalArchivos = {
      ...enlace.a,
      enviarBinario: (buf) => {
        const dec = decodeChunkBinario(buf);
        if (perder && dec?.index === 2) {
          perder = false;
          return true; // «salió», pero se perdió por el camino
        }
        return enlace.a.enviarBinario?.(buf) ?? false;
      },
    };
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    const motorB: MotorArchivos = crearMotorArchivos({ almacen: almacenComoOpfs(), esperaTrozosFaltantesMs: 200, onOfertaEntrante: (o) => motorB.aceptarOferta(o.id) });
    const fases: string[] = [];
    motorA.onProgreso((e) => fases.push(`${e.fase}:${e.codigo ?? ""}`));
    enlace.a.alMensaje((d) => motorA.manejarMensaje(canalA, d));
    enlace.b.alMensaje((d) => motorB.manejarMensaje(enlace.b, d, { mismaCuenta: false, verificarPermiso: () => true }));
    const datos = binario("bin", 16 * 1024 * 4 + 7);
    const r = await motorA.enviarArchivo(canalA, new Blob([datos]), "corte.bin", { tipo: "dispositivo" });
    await esperarHasta(() => motorA.estadoDe(r.id)?.fase === "completada", 10_000);
    expect(fases).toContain("reintentando:faltan-trozos");
    expect(sha(await (motorB.blobRecibido(r.id) as Blob).arrayBuffer())).toBe(sha(datos));
  });

  it("si el receptor no confirma la verificación, el remitente no se queda colgado: error con el lado y «Reintentar»", async () => {
    const enlace = enlaceLocalSimulado();
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), esperaVerificacionMs: () => 150 });
    const motorB: MotorArchivos = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), onOfertaEntrante: (o) => motorB.aceptarOferta(o.id) });
    enlace.a.alMensaje((d) => motorA.manejarMensaje(enlace.a, d));
    // El receptor procesa todo menos «fin» (app que se cerró justo al final).
    enlace.b.alMensaje((d) => {
      if (typeof d === "string" && d.startsWith('{"t":"archivo.fin"')) return;
      motorB.manejarMensaje(enlace.b, d, { mismaCuenta: false, verificarPermiso: () => true });
    });
    const r = await motorA.enviarArchivo(enlace.a, new Blob([binario("bin", 20_000)]), "x.bin", { tipo: "dispositivo" });
    await esperarHasta(() => motorA.estadoDe(r.id)?.fase === "verificando", 5_000);
    await esperarHasta(() => motorA.estadoDe(r.id)?.fase === "error", 5_000);
    expect(motorA.estadoDe(r.id)?.codigo).toBe("sin-confirmacion");
    expect(motorA.estadoDe(r.id)?.motivo).toMatch(/^Falló en el receptor: no confirmó/);
    expect(motorA.archivoDeEnvio(r.id)).toBeDefined();
  });
});

describe("ARC1108A · la oferta con su envío, su ruta y su vista cabe en una trama del canal nativo", () => {
  it("con la miniatura y el mensaje más grandes permitidos, la oferta viaja y el receptor la ve saneada", async () => {
    const l = porCanalNativo(almacenComoOpfs());
    await ligarApps(l.redes);
    const datosUrl = `data:image/jpeg;base64,${"A".repeat(MAX_VISTA_IMAGEN - 24)}`;
    const ofertas: EstadoTransferencia[] = [];
    l.motorB.onProgreso((e) => {
      if (e.fase === "transfiriendo" && e.rol === "recibir") ofertas.push(e);
    });
    const r = await l.motorA.enviarArchivo(l.canalA, new Blob([binario("png", 5_000)], { type: "image/png" }), "a.png", { tipo: "dispositivo" }, {
      lote: { id: "lote_prueba_1", total: 3, mensaje: `${"✦ñ".repeat(600)}\u0007` },
      ruta: "../../vacaciones/2026/a.png",
      vista: { tipo: "imagen", datosUrl },
    });
    await esperarHasta(() => TERMINALES.has(l.motorA.estadoDe(r.id)?.fase ?? ""), 20_000);
    expect(l.motorA.estadoDe(r.id)?.fase).toBe("completada");
    expect(l.tramas.rechazadas).toBe(0);
    expect(l.tramas.maxBytes).toBeLessThanOrEqual(MAX_CUERPO_RUST);
    const e = ofertas[0];
    expect(e.lote).toBe("lote_prueba_1");
    expect(e.loteTotal).toBe(3);
    expect(e.mensaje?.length).toBeLessThanOrEqual(1000);
    expect(e.mensaje).not.toMatch(/\u0007/);
    expect(e.ruta).toBe("vacaciones/2026/a.png");
    expect(e.vista).toEqual({ tipo: "imagen", datosUrl });
    expect(e.inicioB64 && Buffer.from(e.inicioB64, "base64").subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    // Quién lo manda: la huella con la que la Mac firmó su saludo (la ligadura del canal nativo).
    expect(e.verificacion).toMatchObject({ tipo: "firma", huella: "fp-mac" });
    expect(e.via).toBe("Red local (app nativa) · canal TCP 47071");
    expect(e.origen).toBe("MaggaBook (red local · app nativa)");
  });

  it("una vista que no es una miniatura raster (SVG, HTML, URL remota) se descarta", () => {
    expect(sanearVista({ tipo: "imagen", datosUrl: "data:image/svg+xml;base64,PHN2Zz4=" })).toBeUndefined();
    expect(sanearVista({ tipo: "imagen", datosUrl: "https://ejemplo.org/a.png" })).toBeUndefined();
    expect(sanearVista({ tipo: "imagen", datosUrl: "data:text/html;base64,PGI+" })).toBeUndefined();
    expect(sanearVista({ tipo: "texto", texto: "x".repeat(5000) })).toEqual({ tipo: "texto", texto: "x".repeat(1200) });
    expect(sanearRutaRelativa("C:\\Users\\a\\..\\b.txt")).toBe("Users/a/b.txt");
    expect(sanearRutaRelativa("/etc/passwd")).toBe("etc/passwd");
    expect(sanearRutaRelativa("..")).toBeUndefined();
  });
});
