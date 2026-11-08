/**
 * archivo-seguro (MPT1108B): el archivo sellado de punta a punta por todas las vías permitidas, con el motor REAL de archivos.
 * Dos neuronas con tres vías simuladas (una muere a mitad), un par antiguo, un envío a dos destinatarios, un relé que solo ve
 * texto cifrado, el orden de resolución de claves y los topes del salto por otra neurona.
 */
import { afterEach, describe, expect, it } from "vitest";
import { armarCanalArchivo, CAPACIDADES_ARCHIVO, filtrarVias, type ViaCandidata } from "@/lib/malla/archivo-seguro";
import { AJUSTES_VIAS_POR_DEFECTO, normalizarAjustesVias, topesSalto, type AjustesViasArchivo } from "@/lib/malla/ajustes-vias-archivo";
import { crearCanalSellado, crearAlmacenSellos } from "@/lib/malla/canal-sellado";
import { abrirSobreCon, parCifraArchivo } from "@/lib/malla/cifrado-archivo";
import { crearCanalPorTexto, crearCanalViaSalto, crearSalto, envolverSalto, leerLlegada } from "@/lib/malla/rele-archivo";
import {
  esClaveCifrado,
  fuenteCertificado,
  fuenteInstantanea,
  fuenteServidor,
  fuenteVivo,
  olvidarClavesVivas,
  recordarClaveCertificada,
  recordarClaveViva,
  resolverClaves,
  type AlmacenClavesCuenta,
} from "@/lib/malla/claves-destinatario";
import { crearAlmacenEnMemoria, crearMotorArchivos, type CanalArchivos, type MotorArchivos } from "@/lib/network/archivos-malla";
import { firmanteDePrueba, identidadEcdh } from "./ayudas-cifrado";

/* ───────── vía simulada con velocidad, cola y muerte (como en multitrayecto-vias.test) ───────── */

function via(entrega: (d: string | ArrayBuffer) => void, espia: Array<string | ArrayBuffer>, bytesPorMs: number, opts: { binario?: boolean; muereTrasTramas?: number } = {}): CanalArchivos {
  let enCola = 0;
  let tramas = 0;
  let muerta = false;
  const pend: Array<{ d: string | ArrayBuffer; n: number }> = [];
  let corriendo = false;
  const bombear = () => {
    if (corriendo) return;
    corriendo = true;
    const paso = () => {
      const it = pend.shift();
      if (!it) {
        corriendo = false;
        return;
      }
      setTimeout(() => {
        enCola -= it.n;
        if (!muerta) entrega(it.d);
        paso();
      }, Math.max(1, Math.ceil(it.n / bytesPorMs)));
    };
    paso();
  };
  const meter = (d: string | ArrayBuffer): boolean => {
    if (muerta) return false;
    tramas++;
    if (opts.muereTrasTramas && tramas > opts.muereTrasTramas) {
      muerta = true;
      pend.length = 0;
      enCola = 0;
      return false;
    }
    espia.push(d);
    const n = typeof d === "string" ? d.length : d.byteLength;
    enCola += n;
    pend.push({ d, n });
    bombear();
    return true;
  };
  return {
    enviar: (t) => meter(t),
    ...(opts.binario ? { enviarBinario: (b: ArrayBuffer) => meter(b) } : {}),
    bufferedAmount: () => enCola,
    enlaceArriba: () => !muerta,
    tamanoTrozo: () => 4096,
    alMensaje: () => () => undefined,
  };
}

const MARCA = "SECRETO-STARSEED-";
function textoDe(d: string | ArrayBuffer): string {
  if (typeof d !== "string") return Buffer.from(d).toString("latin1");
  const m = /"datosB64":"([^"]*)"/.exec(d);
  return d + (m ? Buffer.from(m[1], "base64").toString("latin1") : "");
}
const datosSecretos = (kib: number) => new Uint8Array(kib * 1024).map((_, i) => MARCA.charCodeAt(i % MARCA.length));

/** Receptor: cada vía entrega a su PROPIO canal receptor (la oferta puede llegar por una y los trozos por otras). */
async function montar(opts: {
  vias: (entrega: (i: number) => (d: string | ArrayBuffer) => void, espia: Array<string | ArrayBuffer>) => ViaCandidata[];
  parCifra: boolean;
  destinatariosDe?: () => Promise<Array<{ pub: JsonWebKey }>>;
  ajustes?: Partial<AjustesViasArchivo>;
  kib?: number;
}) {
  const rx = await identidadEcdh();
  const { firmar, verificar } = await firmanteDePrueba();
  const espia: Array<string | ArrayBuffer> = [];
  const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 2048 });
  const motorB = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 2048 });
  const almacenRx = crearAlmacenSellos();
  let armadoCanal: CanalArchivos | null = null;
  const receptores = new Map<number, CanalArchivos>();
  const receptorDe = (i: number): CanalArchivos => {
    let c = receptores.get(i);
    if (!c) {
      const oyentes = new Set<(d: string | ArrayBuffer) => void>();
      const base: CanalArchivos = {
        enviar: (t) => {
          queueMicrotask(() => motorA.manejarMensaje(armadoCanal!, t, { mismaCuenta: true }));
          return true;
        },
        alMensaje: (cb) => (oyentes.add(cb), () => oyentes.delete(cb)),
      };
      const sellado = crearCanalSellado(base, { almacen: almacenRx, abrirSobre: abrirSobreCon(rx.priv), verificar });
      sellado.alMensaje((claro) => void motorB.manejarMensaje(sellado, claro, { mismaCuenta: true }));
      c = { ...sellado, alMensaje: sellado.alMensaje };
      (c as unknown as { alimentar: (d: string | ArrayBuffer) => void }).alimentar = (d) => oyentes.forEach((cb) => cb(d));
      receptores.set(i, c);
    }
    return c;
  };
  const entrega = (i: number) => (d: string | ArrayBuffer) => (receptorDe(i) as unknown as { alimentar: (d: string | ArrayBuffer) => void }).alimentar(d);
  const armado = await armarCanalArchivo({
    vias: opts.vias(entrega, espia),
    bytes: (opts.kib ?? 160) * 1024,
    parCifra: opts.parCifra,
    destinatarios: async () => (opts.destinatariosDe ? await opts.destinatariosDe() : [{ pub: rx.pub }]),
    ajustes: { ...AJUSTES_VIAS_POR_DEFECTO, ...(opts.ajustes ?? {}) },
    firmar,
    verificar,
  });
  armadoCanal = armado.canal;
  const datos = datosSecretos(opts.kib ?? 160);
  const r = await motorA.enviarArchivo(armado.canal!, new Blob([datos]), "plano-secreto.bin", { tipo: "dispositivo", id: "B" });
  const fin = await esperarRecepcion(motorB);
  const rec = motorB.listaTransferencias().find((e) => e.rol === "recibir");
  const blob = fin === "completada" && rec ? motorB.blobRecibido(rec.id) : undefined;
  return { armado, r, fin, datos, blob, espia, motorA, motorB, rec };
}

function esperarRecepcion(motor: MotorArchivos, plazoMs = 25_000): Promise<string> {
  return new Promise((resolver) => {
    let baja: (() => void) | null = null;
    const t = setTimeout(() => {
      baja?.();
      resolver("plazo");
    }, plazoMs);
    const mirar = (): boolean => {
      const rec = motor.listaTransferencias().find((e) => e.rol === "recibir");
      if (rec?.fase === "completada" || rec?.fase === "error") {
        clearTimeout(t);
        baja?.();
        resolver(rec.fase);
        return true;
      }
      return false;
    };
    baja = motor.onProgreso(() => void mirar());
    mirar();
  });
}

const tresVias = (muereWifi = false) => (entrega: (i: number) => (d: string | ArrayBuffer) => void, espia: Array<string | ArrayBuffer>): ViaCandidata[] => [
  { id: "nativo:lan", tipo: "directa", etiqueta: "Red local", canal: via(entrega(0), espia, 3000, { binario: true }), capacidadKbps: 30_000 },
  { id: "wifi", tipo: "directa", etiqueta: "Wi‑Fi directo", canal: via(entrega(1), espia, 900, { binario: true, ...(muereWifi ? { muereTrasTramas: 12 } : {}) }), capacidadKbps: 9_000 },
  { id: "ble", tipo: "directa", etiqueta: "Bluetooth", canal: via(entrega(2), espia, 150), capacidadKbps: 1_500 },
];

afterEach(() => olvidarClavesVivas());

describe("dos neuronas, tres vías, archivo sellado", () => {
  it("llega entero y verificado; el reparto sigue la capacidad; marca «cifrado de archivo»; nadie en el camino ve el claro", async () => {
    const t = await montar({ vias: tresVias(), parCifra: true });
    expect(t.armado.modo).toBe("archivo");
    expect(t.armado.copias).toBe(1);
    expect(t.fin).toBe("completada");
    expect(new Uint8Array(await t.blob!.arrayBuffer())).toEqual(t.datos);
    const ea = t.motorA.listaTransferencias()[0];
    expect(ea.cifradoArchivo).toBe("archivo");
    expect(ea.repartoVias).toMatch(/^Red local \d+ % · /);
    expect(ea.repartoVias).toMatch(/Bluetooth/);
    expect(t.rec!.cifradoArchivo).toBe("archivo"); // también el lado que recibe
    for (const d of t.espia) {
      const x = textoDe(d);
      expect(x.includes("SECRETO-STARSEED")).toBe(false);
      expect(x.includes("plano-secreto")).toBe(false);
    }
  }, 40_000);

  it("una vía muere a mitad: se reequilibra y el archivo llega íntegro", async () => {
    const t = await montar({ vias: tresVias(true), parCifra: true });
    expect(t.fin).toBe("completada");
    expect(new Uint8Array(await t.blob!.arrayBuffer())).toEqual(t.datos);
    const p = t.armado.multi!.participacion();
    expect(p.find((x) => x.id === "wifi")!.muerta).toBe(true);
    expect(p.find((x) => x.id === "nativo:lan")!.trozos).toBeGreaterThan(p.find((x) => x.id === "wifi")!.trozos * 2);
  }, 40_000);

  it("par antiguo (sin archivo.e2e.v1): el archivo va como antes, marcado «sin cifrado de archivo», y sin relés", async () => {
    const espiaRele: string[] = [];
    const t = await montar({
      parCifra: false,
      kib: 64,
      vias: (entrega, espia) => [
        { id: "nativo:lan", tipo: "directa", etiqueta: "Red local", canal: via(entrega(0), espia, 3000), capacidadKbps: 30_000 },
        { id: "rele-starseed", tipo: "rele-starseed", etiqueta: "Relé de StarSeed", canal: { enviar: (x) => (espiaRele.push(x), true), alMensaje: () => () => undefined } },
      ],
    });
    expect(t.armado.modo).toBe("sin-cifrado-de-archivo");
    expect(t.armado.excluidas.map((e) => e.id)).toEqual(["rele-starseed"]);
    expect(espiaRele).toEqual([]);
    expect(t.motorA.listaTransferencias()[0].cifradoArchivo).toBe("sin-cifrado-de-archivo");
    // como antes: la oferta y los trozos viajan en claro (hoy el enlace es lo único que protege)
    expect(t.espia.some((d) => typeof d === "string" && d.startsWith('{"t":"archivo.oferta"'))).toBe(true);
    expect(t.fin).toBe("completada");
    expect(t.rec!.cifradoArchivo).toBe("sin-cifrado-de-archivo");
    expect(new Uint8Array(await t.blob!.arrayBuffer())).toEqual(t.datos);
  }, 40_000);

  it("el relé del servidor lleva solo texto cifrado (y recibe trozos de verdad)", async () => {
    const espiaRele: Array<string | ArrayBuffer> = [];
    const t = await montar({
      parCifra: true,
      kib: 192,
      ajustes: { minBytesRele: 1024 },
      vias: (entrega, espia) => [
        { id: "nativo:lan", tipo: "directa", etiqueta: "Red local", canal: via(entrega(0), espia, 2500, { binario: true }), capacidadKbps: 20_000 },
        {
          id: "rele-starseed",
          tipo: "rele-starseed",
          etiqueta: "Relé de StarSeed",
          capacidadKbps: 8_000,
          canal: crearCanalPorTexto({
            enviarTexto: (x) => {
              espiaRele.push(x);
              setTimeout(() => entrega(1)(x), 3);
              return true;
            },
            suscribir: () => () => undefined,
          }),
        },
      ],
    });
    expect(t.armado.usadas.map((u) => u.id)).toContain("rele-starseed");
    expect(t.fin).toBe("completada");
    expect(new Uint8Array(await t.blob!.arrayBuffer())).toEqual(t.datos);
    expect(espiaRele.length).toBeGreaterThan(5);
    for (const d of espiaRele) {
      const x = textoDe(d);
      expect(x.includes("SECRETO-STARSEED")).toBe(false);
      expect(x.includes("plano-secreto")).toBe(false);
    }
    expect(t.armado.multi!.participacion().find((p) => p.id === "rele-starseed")!.trozos).toBeGreaterThan(0);
  }, 40_000);
});

describe("un envío a dos destinatarios (grupo o todas las neuronas de la cuenta)", () => {
  it("una copia sellada por neurona: las dos abren, una tercera no", async () => {
    const r1 = await identidadEcdh();
    const r2 = await identidadEcdh();
    const intruso = await identidadEcdh();
    const { firmar, verificar } = await firmanteDePrueba();
    const res = await resolverClaves(
      ["n1", "n2", "n3-sin-clave"],
      [
        { origen: "vivo", buscar: (n) => (n === "n1" ? r1.pub : null) },
        { origen: "servidor", buscar: (n) => (n === "n2" ? r2.pub : null) },
      ],
    );
    expect(res.destinatarios).toHaveLength(2);
    expect(res.sinClave).toEqual(["n3-sin-clave"]);
    const espia: string[] = [];
    const base: CanalArchivos = { enviar: (t) => (espia.push(t), true), alMensaje: () => () => undefined };
    const armado = await armarCanalArchivo({ vias: [{ id: "a", tipo: "directa", canal: base }], bytes: 10, parCifra: true, destinatarios: async () => res.destinatarios, ajustes: AJUSTES_VIAS_POR_DEFECTO, firmar, verificar });
    expect(armado.copias).toBe(2);
    armado.canal!.enviar(JSON.stringify({ t: "archivo.oferta", id: "g1", nombre: "g.bin", tipo: "x", tamano: 4, sha256: "ab", trozos: 1, tamanoTrozo: 4 }));
    await new Promise((r) => setTimeout(r, 50));
    const oferta = JSON.parse(espia[0]);
    expect(oferta.t).toBe("archivo.oferta.cif");
    expect(oferta.sobres).toHaveLength(2);
    for (const priv of [r1.priv, r2.priv]) {
      const salida: string[] = [];
      const rx = crearCanalSellado({ enviar: () => true, alMensaje: (cb) => (setTimeout(() => cb(espia[0]), 1), () => undefined) }, { abrirSobre: abrirSobreCon(priv), verificar });
      rx.alMensaje((d) => salida.push(d as string));
      await new Promise((r) => setTimeout(r, 80));
      expect(JSON.parse(salida[0]).nombre).toBe("g.bin");
    }
    const ajeno: string[] = [];
    const rxAjeno = crearCanalSellado({ enviar: () => true, alMensaje: (cb) => (setTimeout(() => cb(espia[0]), 1), () => undefined) }, { abrirSobre: abrirSobreCon(intruso.priv), verificar });
    rxAjeno.alMensaje((d) => ajeno.push(d as string));
    await new Promise((r) => setTimeout(r, 80));
    expect(ajeno).toEqual([]);
  });
});

describe("qué vías entran", () => {
  const canal: CanalArchivos = { enviar: () => true, alMensaje: () => () => undefined };
  const v = (id: string, tipo: ViaCandidata["tipo"], extra: Partial<ViaCandidata> = {}): ViaCandidata => ({ id, tipo, canal, ...extra });
  const MB = 1024 * 1024;

  it("«Automático» usa todas las permitidas; los ajustes recortan; terceros solo con permiso; pequeños sin relé", () => {
    const todas = [v("lan", "directa"), v("salto:x", "rele-neurona"), v("rele-starseed", "rele-starseed"), v("ajeno", "rele-propio", { tercero: true })];
    const base = { bytes: 20 * MB, sellable: true, ajustes: AJUSTES_VIAS_POR_DEFECTO };
    expect(filtrarVias(todas, base).usadas.map((x) => x.id)).toEqual(["lan", "salto:x", "rele-starseed"]);
    expect(filtrarVias(todas, { ...base, ajustes: { ...base.ajustes, releTerceros: true } }).usadas.map((x) => x.id)).toContain("ajeno");
    expect(filtrarVias(todas, { ...base, ajustes: { ...base.ajustes, modo: "directas" } }).usadas.map((x) => x.id)).toEqual(["lan"]);
    expect(filtrarVias(todas, { ...base, ajustes: { ...base.ajustes, releNeuronas: false } }).usadas.map((x) => x.id)).toEqual(["lan", "rele-starseed"]);
    expect(filtrarVias(todas, { ...base, ajustes: { ...base.ajustes, releServidor: false } }).usadas.map((x) => x.id)).toEqual(["lan", "salto:x"]);
    expect(filtrarVias(todas, { ...base, bytes: 200 * 1024 }).usadas.map((x) => x.id)).toEqual(["lan"]);
    expect(filtrarVias(todas, { ...base, sellable: false }).excluidas).toHaveLength(3);
  });

  it("solo por relé y el archivo pasa el tope: no hay canal; dentro del tope, sí", async () => {
    const aj = { ...AJUSTES_VIAS_POR_DEFECTO, maxBytesRele: 10 * MB };
    const dest = async () => [{ pub: (await identidadEcdh()).pub }];
    const grande = await armarCanalArchivo({ vias: [v("rele-starseed", "rele-starseed")], bytes: 30 * MB, parCifra: true, destinatarios: dest, ajustes: aj });
    expect(grande.canal).toBeNull();
    expect(grande.motivo).toMatch(/tope de 10 MiB/);
    const chico = await armarCanalArchivo({ vias: [v("rele-starseed", "rele-starseed")], bytes: 5 * MB, parCifra: true, destinatarios: dest, ajustes: aj });
    expect(chico.canal).not.toBeNull();
  });

  it("sin ninguna clave resuelta el archivo no se sella (marcado) y no usa relés", async () => {
    const a = await armarCanalArchivo({ vias: [v("lan", "directa"), v("rele-starseed", "rele-starseed")], bytes: 20 * MB, parCifra: true, destinatarios: async () => [], ajustes: AJUSTES_VIAS_POR_DEFECTO });
    expect(a.modo).toBe("sin-cifrado-de-archivo");
    expect(a.usadas.map((x) => x.id)).toEqual(["lan"]);
  });

  it("ajustes: se normalizan y los topes del salto cuentan batería y datos", () => {
    expect(normalizarAjustesVias({ modo: "x", maxBytesRele: -5, releTerceros: "sí" })).toMatchObject({ modo: "automatico", maxBytesRele: 0, releTerceros: false });
    const a = AJUSTES_VIAS_POR_DEFECTO;
    expect(topesSalto(a, { bateria: 0.1, cargando: false, usadoHoy: 0, bytes: 10 }).ok).toBe(false);
    expect(topesSalto(a, { bateria: 0.1, cargando: true, usadoHoy: 0, bytes: 10 }).ok).toBe(true);
    expect(topesSalto(a, { bateria: 0.9, cargando: false, usadoHoy: a.maxBytesSaltoDia, bytes: 1 }).motivo).toMatch(/tope diario/);
    expect(topesSalto({ ...a, releNeuronas: false }, { bateria: 1, cargando: true, usadoHoy: 0, bytes: 1 }).ok).toBe(false);
  });
});

describe("las neuronas anuncian las capacidades", () => {
  it("archivo.e2e.v1 y multitrayecto.v1 van en la lista; un par sin ellas es antiguo", () => {
    expect([...CAPACIDADES_ARCHIVO]).toEqual(["archivo.e2e.v1", "multitrayecto.v1"]);
    expect(parCifraArchivo(["WebRTC", ...CAPACIDADES_ARCHIVO])).toBe(true);
    expect(parCifraArchivo(["WebRTC"])).toBe(false);
    expect(parCifraArchivo(null)).toBe(false);
  });
});

describe("claves de la neurona destinataria: vivo → instantánea → certificado → servidor", () => {
  it("cada fuente responde cuando las anteriores no; la primera gana", async () => {
    const [a, b, c, d] = await Promise.all([identidadEcdh(), identidadEcdh(), identidadEcdh(), identidadEcdh()]);
    const almacen: AlmacenClavesCuenta = { leer: async (n) => ({ n1: b.pub, n2: b.pub, n3: b.pub }[n] ?? null), escribir: async () => undefined };
    recordarClaveViva("n1", a.pub);
    recordarClaveCertificada("n3", c.pub);
    const fuentes = [
      fuenteVivo,
      fuenteInstantanea(almacen, (n) => n !== "n4"),
      fuenteCertificado,
      fuenteServidor(() => true, (n) => (n === "n4" ? d.pub : n === "n3" ? a.pub : null)),
    ];
    const r = await resolverClaves(["n1", "n2", "n3", "n4", "n5"], [...fuentes].reverse()); // el orden de entrada no importa
    expect(r.origenes).toEqual({ n1: "vivo", n2: "instantanea", n3: "instantanea", n4: "servidor" });
    expect(r.sinClave).toEqual(["n5"]);
    expect(r.destinatarios.map((x) => x.rfp)).toEqual(["n1", "n2", "n4"]); // n3 comparte clave con n2: una sola copia
  });

  it("sin internet no se consulta el servidor; la instantánea solo vale para neuronas de la cuenta; claves inválidas se ignoran", async () => {
    const a = await identidadEcdh();
    let consultas = 0;
    const almacen: AlmacenClavesCuenta = { leer: async () => a.pub, escribir: async () => undefined };
    const r = await resolverClaves(
      ["propia", "ajena", "mala"],
      [
        fuenteInstantanea(almacen, (n) => n === "propia"),
        fuenteServidor(() => false, () => (consultas++, a.pub)),
        { origen: "vivo", buscar: (n) => (n === "mala" ? ({ kty: "EC", crv: "P-256", x: "1", y: "2", d: "privada" } as JsonWebKey) : null) },
      ],
    );
    expect(consultas).toBe(0);
    expect(r.origenes).toEqual({ propia: "instantanea" });
    expect(r.sinClave).toEqual(["ajena", "mala"]);
    expect(esClaveCifrado({ kty: "EC", crv: "P-256", x: "a", y: "b" })).toBe(true);
    expect(esClaveCifrado({ kty: "RSA" })).toBe(false);
  });
});

describe("salto por otra neurona tuya", () => {
  const propias = new Set(["A", "B", "C"]);
  function salto(extra: { bateria?: number | null; cargando?: boolean; usado?: number } = {}) {
    const reenviados: Array<{ para: string; texto: string }> = [];
    let usado = extra.usado ?? 0;
    const s = crearSalto({
      ajustes: () => AJUSTES_VIAS_POR_DEFECTO,
      energia: () => ({ bateria: extra.bateria ?? 1, cargando: extra.cargando ?? false }),
      esPropia: (n) => propias.has(n),
      reenviar: (para, texto) => (reenviados.push({ para, texto }), true),
      usadoHoy: () => usado,
      sumar: (b) => (usado += b),
    });
    return { s, reenviados };
  }

  it("A manda por B hacia C: B reenvía el texto cifrado tal cual y C lo recibe", async () => {
    const { s, reenviados } = salto();
    const envios: string[] = [];
    const canal = crearCanalViaSalto({ yo: "A", destino: "C", enviarAlSalto: (t) => (envios.push(t), true), alLlegar: () => () => undefined });
    canal.enviar('{"t":"archivo.chunk","id":"x","index":0,"datosB64":"Q0lGUkFETw=="}');
    await new Promise((r) => setTimeout(r, 5));
    const r = await s.procesar(envios[0], "A");
    expect(r).toMatchObject({ ok: true });
    expect(reenviados[0].para).toBe("C");
    expect(leerLlegada(reenviados[0].texto)).toEqual({ de: "A", p: '{"t":"archivo.chunk","id":"x","index":0,"datosB64":"Q0lGUkFETw=="}' });
  });

  it("rechaza: ajeno a la cuenta, origen falso, salto dentro de salto, batería baja, tope diario", async () => {
    expect(await salto().s.procesar(envolverSalto("C", "X", "p"), "X")).toMatchObject({ ok: false });
    expect(await salto().s.procesar(envolverSalto("Z", "A", "p"), "A")).toMatchObject({ ok: false });
    expect(await salto().s.procesar(envolverSalto("C", "A", "p"), "B")).toMatchObject({ ok: false, motivo: expect.stringMatching(/origen/) });
    expect(await salto().s.procesar(envolverSalto("C", "A", envolverSalto("C", "A", "p")), "A")).toMatchObject({ ok: false, motivo: expect.stringMatching(/dentro de otro/) });
    expect(await salto({ bateria: 0.05 }).s.procesar(envolverSalto("C", "A", "p"), "A")).toMatchObject({ ok: false, motivo: expect.stringMatching(/batería/) });
    expect(await salto({ usado: AJUSTES_VIAS_POR_DEFECTO.maxBytesSaltoDia }).s.procesar(envolverSalto("C", "A", "p"), "A")).toMatchObject({ ok: false, motivo: expect.stringMatching(/tope diario/) });
    expect(await salto().s.procesar('{"t":"otra.cosa"}', "A")).toBeNull();
  });
});
