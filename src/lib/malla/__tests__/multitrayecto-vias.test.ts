/**
 * Multitrayecto por vías (MPT1108A): reparto por capacidad, política de relés/terceros, vía que muere y vuelve,
 * y de punta a punta con el motor real: archivo sellado por 3 vías simuladas de distinta velocidad; un relé
 * solo ve texto cifrado.
 */
import { describe, expect, it } from "vitest";
import { crearCanalMultiVias, porcentajes, textoReparto, type ViaMulti } from "@/lib/malla/canal-multitrayecto-vias";
import { crearCanalSellado } from "@/lib/malla/canal-sellado";
import { abrirSobreCon } from "@/lib/malla/cifrado-archivo";
import { crearAlmacenEnMemoria, crearMotorArchivos, decodeChunkBinario, type CanalArchivos } from "@/lib/network/archivos-malla";
import { firmanteDePrueba, identidadEcdh } from "./ayudas-cifrado";

const trozo = (i: number) => JSON.stringify({ t: "archivo.chunk", id: "x", index: i, datosB64: "AA==" });

function canalFalso(opts: { falla?: () => boolean; cola?: () => number; arriba?: () => boolean } = {}) {
  const enviados: string[] = [];
  const canal: CanalArchivos = {
    enviar: (t) => {
      if (opts.falla?.()) return false;
      enviados.push(t);
      return true;
    },
    bufferedAmount: () => opts.cola?.() ?? 0,
    ...(opts.arriba ? { enlaceArriba: opts.arriba } : {}),
    alMensaje: () => () => undefined,
  };
  return { canal, enviados };
}

describe("canal multitrayecto por vías", () => {
  it("reparte por capacidad (con la latencia) y enseña el reparto", () => {
    const lan = canalFalso();
    const wifi = canalFalso();
    const ble = canalFalso();
    const multi = crearCanalMultiVias([
      { id: "nativo:1", tipo: "directa", etiqueta: "LAN", canal: lan.canal, capacidadKbps: 60_000 },
      { id: "wifi:1", tipo: "directa", etiqueta: "Wi‑Fi directo", canal: wifi.canal, capacidadKbps: 20_000 },
      { id: "ble:1", tipo: "directa", etiqueta: "Bluetooth", canal: ble.canal, capacidadKbps: 8_000 },
    ]);
    for (let i = 0; i < 88; i++) multi.enviar(trozo(i));
    expect(multi.reparto()).toEqual({ "nativo:1": 60, "wifi:1": 20, "ble:1": 8 });
    const r = multi.resumenVias()!;
    expect(r.texto).toBe("LAN 68 % · Wi‑Fi directo 23 % · Bluetooth 9 %");
    expect(porcentajes([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(textoReparto([{ etiqueta: "A", porcentaje: 0 }, { etiqueta: "B", porcentaje: 100 }])).toBe("B 100 %");
  });

  it("una latencia alta resta peso", () => {
    const a = canalFalso();
    const b = canalFalso();
    const multi = crearCanalMultiVias([
      { id: "a", tipo: "directa", canal: a.canal, capacidadKbps: 10_000, latenciaMs: 0 },
      { id: "b", tipo: "cuenta", canal: b.canal, capacidadKbps: 10_000, latenciaMs: 750 },
    ]);
    for (let i = 0; i < 40; i++) multi.enviar(trozo(i));
    expect(multi.reparto().a).toBe(32);
    expect(multi.reparto().b).toBe(8);
  });

  it("contrapresión: la vía con la cola llena se salta; si el relé es de un tercero, solo con permiso", () => {
    let cola = 9_000_000;
    const lan = canalFalso({ cola: () => cola });
    const rele = canalFalso();
    const ajeno = canalFalso();
    const vias: ViaMulti[] = [
      { id: "lan", tipo: "directa", canal: lan.canal },
      { id: "rele", tipo: "rele-starseed", canal: rele.canal },
      { id: "ajeno", tipo: "rele-propio", tercero: true, canal: ajeno.canal },
    ];
    const sin = crearCanalMultiVias(vias);
    for (let i = 0; i < 6; i++) sin.enviar(trozo(i));
    expect(sin.reparto()).toEqual({ lan: 0, rele: 6, ajeno: 0 });
    cola = 0;
    const con = crearCanalMultiVias(vias, { permitirTerceros: true });
    for (let i = 0; i < 9; i++) con.enviar(trozo(i));
    expect(con.reparto().ajeno).toBeGreaterThan(0);
  });

  it("tope de bytes por relé: pasado el tope, el relé sale del reparto", () => {
    const lan = canalFalso();
    const rele = canalFalso();
    const multi = crearCanalMultiVias(
      [
        { id: "lan", tipo: "directa", canal: lan.canal, capacidadKbps: 1000 },
        { id: "rele", tipo: "rele-starseed", canal: rele.canal, capacidadKbps: 1000 },
      ],
      { maxBytesRele: 100 },
    );
    for (let i = 0; i < 60; i++) multi.enviar(trozo(i));
    const r = multi.reparto();
    expect(r.rele).toBeGreaterThan(0);
    expect(r.rele).toBeLessThan(10); // ~ 100 B / 60 B por trozo
    expect(r.lan + r.rele).toBe(60);
  });

  it("una vía que falla se da por muerta, su último trabajo se reenvía y puede volver", () => {
    let t = 0;
    let viva = true;
    const a = canalFalso({ falla: () => !viva });
    const b = canalFalso();
    const multi = crearCanalMultiVias(
      [
        { id: "a", tipo: "directa", canal: a.canal, capacidadKbps: 10_000 },
        { id: "b", tipo: "cuenta", canal: b.canal, capacidadKbps: 10_000 },
      ],
      { ahora: () => t, reintentoMuertaMs: 1000 },
    );
    for (let i = 0; i < 6; i++) multi.enviar(trozo(i));
    expect(a.enviados.length).toBe(3);
    viva = false;
    for (let i = 6; i < 16; i++) expect(multi.enviar(trozo(i))).toBe(true);
    expect(multi.participacion().find((p) => p.id === "a")!.muerta).toBe(true);
    // los 3 trozos de «a» se reenviaron por «b» (duplicados que el receptor ignora)
    const indicesB = new Set(b.enviados.map((x) => JSON.parse(x).index));
    for (let i = 0; i < 16; i++) expect(indicesB.has(i) || a.enviados.some((x) => JSON.parse(x).index === i)).toBe(true);
    t = 2000;
    viva = true;
    for (let i = 16; i < 30; i++) multi.enviar(trozo(i));
    expect(a.enviados.length).toBeGreaterThan(3);
    expect(multi.participacion().find((p) => p.id === "a")!.muerta).toBe(false);
  });

  it("agregar y quitar vías en caliente; sin vías elegibles devuelve false", () => {
    const a = canalFalso();
    const b = canalFalso();
    const multi = crearCanalMultiVias([{ id: "a", tipo: "directa", canal: a.canal, capacidadKbps: 1000 }]);
    for (let i = 0; i < 4; i++) multi.enviar(trozo(i));
    multi.agregarVia({ id: "b", tipo: "cuenta", canal: b.canal, capacidadKbps: 1000 });
    for (let i = 4; i < 12; i++) multi.enviar(trozo(i));
    expect(multi.reparto().b).toBe(4);
    multi.quitarVia("a");
    expect(multi.enlaces()).toEqual(["b"]);
    expect(multi.enviar(trozo(99))).toBe(true);
    multi.quitarVia("b");
    expect(multi.enviar(trozo(100))).toBe(false);
  });
});

/** Una vía simulada: tubería con velocidad (bytes/ms) que entrega al receptor tras su retraso. Puede morir. */
function via(
  entrega: (d: string | ArrayBuffer) => void,
  espia: Array<string | ArrayBuffer>,
  bytesPorMs: number,
  opts: { binario?: boolean; muereTrasTramas?: number } = {},
) {
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
      pend.length = 0; // lo que iba en la tubería se pierde
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
  const canal: CanalArchivos = {
    enviar: (t) => meter(t),
    ...(opts.binario ? { enviarBinario: (b: ArrayBuffer) => meter(b) } : {}),
    bufferedAmount: () => enCola,
    enlaceArriba: () => !muerta,
    tamanoTrozo: () => 4096,
    alMensaje: () => () => undefined,
  };
  return canal;
}

async function transferir(opciones: { muereWifi?: boolean }) {
  const rx = await identidadEcdh();
  const { firmar, verificar } = await firmanteDePrueba();
  const espia: Array<string | ArrayBuffer> = [];
  const oyentesB = new Set<(d: string | ArrayBuffer) => void>();
  const haciaB = (d: string | ArrayBuffer) => oyentesB.forEach((cb) => cb(d));
  const baseB: CanalArchivos = {
    enviar: (t) => {
      queueMicrotask(() => motorA.manejarMensaje(selladoA, t, { mismaCuenta: true }));
      return true;
    },
    alMensaje: (cb) => (oyentesB.add(cb), () => oyentesB.delete(cb)),
  };
  const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 2048 });
  const motorB = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 2048 });
  const lan = via(haciaB, espia, 3000, { binario: true });
  const wifi = via(haciaB, espia, 900, { binario: true, ...(opciones.muereWifi ? { muereTrasTramas: 12 } : {}) });
  const ble = via(haciaB, espia, 150); // solo texto
  const multi = crearCanalMultiVias([
    { id: "nativo:lan", tipo: "directa", etiqueta: "LAN", canal: lan, capacidadKbps: 30_000 },
    { id: "wifi", tipo: "directa", etiqueta: "Wi‑Fi directo", canal: wifi, capacidadKbps: 9_000 },
    { id: "ble", tipo: "directa", etiqueta: "Bluetooth", canal: ble, capacidadKbps: 1_500 },
  ]);
  const selladoA = crearCanalSellado(multi, { destinatarios: () => [{ pub: rx.pub }], firmar });
  const selladoB = crearCanalSellado(baseB, { abrirSobre: abrirSobreCon(rx.priv), verificar });
  selladoB.alMensaje((d) => void motorB.manejarMensaje(selladoB, d, { mismaCuenta: true }));

  const marca = new TextEncoder().encode("SECRETO-STARSEED-");
  const datos = new Uint8Array(160 * 1024).map((_, i) => marca[i % marca.length]);
  const r = await motorA.enviarArchivo(selladoA, new Blob([datos]), "plano-secreto.bin", { tipo: "dispositivo", id: "B" });
  expect(r.ok).toBe(true);
  const fin = await new Promise<string>((resolver) => {
    const t0 = Date.now();
    const mirar = () => {
      const rec = motorB.listaTransferencias().find((e) => e.rol === "recibir");
      if (rec?.fase === "completada" || rec?.fase === "error") return resolver(rec.fase);
      if (Date.now() - t0 > 20_000) return resolver("plazo");
      setTimeout(mirar, 25);
    };
    mirar();
  });
  const rec = motorB.listaTransferencias().find((e) => e.rol === "recibir")!;
  const blob = fin === "completada" ? motorB.blobRecibido(rec.id) : undefined;
  return { fin, datos, blob, multi, espia, motorA, selladoA, selladoB, marca };
}

function aBytes(d: string | ArrayBuffer): Buffer {
  if (typeof d !== "string") return Buffer.from(d);
  const m = /"datosB64":"([^"]*)"/.exec(d);
  return Buffer.concat([Buffer.from(d), m ? Buffer.from(m[1], "base64") : Buffer.alloc(0)]);
}

describe("de punta a punta: archivo sellado por tres vías de distinta velocidad", () => {
  it("llega entero y verificado; el reparto sigue la capacidad; nadie en el camino ve el claro", async () => {
    const t = await transferir({});
    expect(t.fin).toBe("completada");
    expect(new Uint8Array(await t.blob!.arrayBuffer())).toEqual(t.datos);
    const p = t.multi.participacion();
    const pct = Object.fromEntries(p.map((x) => [x.id, x.porcentaje]));
    expect(pct["nativo:lan"]).toBeGreaterThan(pct.wifi);
    expect(pct.wifi).toBeGreaterThan(pct.ble);
    expect(pct["nativo:lan"]).toBeGreaterThan(60);
    expect(pct.ble).toBeLessThan(15);
    expect(pct["nativo:lan"] + pct.wifi + pct.ble).toBe(100);
    expect(t.selladoA.resumenVias?.()?.texto).toMatch(/^LAN \d+ % · /);
    expect(t.selladoA.modoCifrado(t.motorA.listaTransferencias()[0].id)).toBe("archivo");
    expect(t.motorA.listaTransferencias()[0].repartoVias).toMatch(/LAN/);
    expect(t.motorA.listaTransferencias()[0].cifradoArchivo).toBe("archivo");
    // El relé/espía de TODAS las tramas: ni la marca del contenido, ni el nombre, ni el sha del archivo.
    expect(t.espia.length).toBeGreaterThan(40);
    for (const d of t.espia) {
      const b = aBytes(d);
      expect(b.includes(Buffer.from("SECRETO-STARSEED"))).toBe(false);
      expect(b.includes(Buffer.from("plano-secreto"))).toBe(false);
    }
    // y cada trozo lleva texto cifrado + tag (2048 + 16), en binario o en base64
    const largos = t.espia.map((d) => (typeof d === "string" ? (/"datosB64":"([^"]*)"/.exec(d) ? Buffer.from(/"datosB64":"([^"]*)"/.exec(d)![1], "base64").length : 0) : (decodeChunkBinario(d)?.datos.byteLength ?? 0)));
    expect(Math.max(...largos)).toBe(2048 + 16);
  }, 30_000);

  it("una vía muere a mitad: se reequilibra, se reenvía lo perdido y el archivo llega íntegro", async () => {
    const t = await transferir({ muereWifi: true });
    expect(t.fin).toBe("completada");
    expect(new Uint8Array(await t.blob!.arrayBuffer())).toEqual(t.datos);
    const wifi = t.multi.participacion().find((x) => x.id === "wifi")!;
    expect(wifi.muerta).toBe(true);
    expect(wifi.trozos).toBeLessThanOrEqual(12);
    const lan = t.multi.participacion().find((x) => x.id === "nativo:lan")!;
    expect(lan.trozos).toBeGreaterThan(wifi.trozos * 2);
  }, 30_000);
});
