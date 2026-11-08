/**
 * cifrado-archivo (MPT1108A): ida y vuelta, manipulación/reorden/truncado, destinatario equivocado, varios
 * destinatarios, oferta firmada y el canal sellado (par antiguo, trozos en claro descartados).
 */
import { describe, expect, it } from "vitest";
import {
  BYTES_TAG_GCM,
  CAPACIDAD_CIFRADO_ARCHIVO,
  abrirOferta,
  abrirSobreCon,
  abrirTrozo,
  crearClaveContenido,
  importarClaveContenido,
  nonceTrozo,
  parCifraArchivo,
  sellarOferta,
  sellarTrozo,
  type VerificarFn,
} from "@/lib/malla/cifrado-archivo";
import { crearCanalSellado } from "@/lib/malla/canal-sellado";
import { firmanteDePrueba, identidadEcdh } from "./ayudas-cifrado";
import { bufAB64, encodeChunkBinario, type CanalArchivos } from "@/lib/network/archivos-malla";

const oferta = (id = "arch_t1", extra: Record<string, unknown> = {}) => ({
  t: "archivo.oferta",
  id,
  nombre: "secreto.pdf",
  tipo: "application/pdf",
  tamano: 3000,
  sha256: "ab".repeat(32),
  trozos: 3,
  tamanoTrozo: 1024,
  destino: { tipo: "dispositivo" },
  ...extra,
});

const bytes = (n: number, sem = 7) => new Uint8Array(n).map((_, i) => (i * sem + 3) % 256).buffer;

describe("trozos sellados (AES-256-GCM)", () => {
  it("ida y vuelta, con el tag de 16 bytes", async () => {
    const c = (await crearClaveContenido("arch_a"))!;
    const claro = bytes(1000);
    const ct = (await sellarTrozo(c, "arch_a", 2, 5, claro))!;
    expect(ct.byteLength).toBe(1000 + BYTES_TAG_GCM);
    expect(Buffer.from(ct).includes(Buffer.from(claro.slice(0, 32)))).toBe(false);
    expect(new Uint8Array((await abrirTrozo(c, "arch_a", 2, 5, ct))!)).toEqual(new Uint8Array(claro));
  });

  it("un bit cambiado, otro índice, otro total, otra transferencia o truncado → se rechaza", async () => {
    const c = (await crearClaveContenido("arch_a"))!;
    const ct = (await sellarTrozo(c, "arch_a", 1, 4, bytes(500)))!;
    const malo = new Uint8Array(ct.slice(0));
    malo[10] ^= 1;
    expect(await abrirTrozo(c, "arch_a", 1, 4, malo.buffer)).toBeNull();
    expect(await abrirTrozo(c, "arch_a", 2, 4, ct)).toBeNull(); // reordenado
    expect(await abrirTrozo(c, "arch_a", 1, 5, ct)).toBeNull(); // otro total
    expect(await abrirTrozo(c, "arch_b", 1, 4, ct)).toBeNull(); // de otra transferencia
    expect(await abrirTrozo(c, "arch_a", 1, 4, ct.slice(0, ct.byteLength - 1))).toBeNull(); // truncado
    expect(await abrirTrozo(c, "arch_a", 1, 4, ct.slice(0, 8))).toBeNull();
    expect(await abrirTrozo(c, "arch_a", 1, 4, ct)).not.toBeNull();
  });

  it("clave equivocada → no abre; el nonce es único por trozo y depende del id", async () => {
    const a = (await crearClaveContenido("arch_a"))!;
    const otra = (await crearClaveContenido("arch_a"))!;
    const ct = (await sellarTrozo(a, "arch_a", 0, 1, bytes(64)))!;
    expect(await abrirTrozo(otra, "arch_a", 0, 1, ct)).toBeNull();
    const n = new Set(Array.from({ length: 200 }, (_, i) => Buffer.from(nonceTrozo(a.prefijo, i)).toString("hex")));
    expect(n.size).toBe(200);
    const b = (await importarClaveContenido("arch_b", a.raw))!;
    expect(Buffer.from(b.prefijo).equals(Buffer.from(a.prefijo))).toBe(false);
  });
});

describe("oferta sellada para el receptor", () => {
  it("la abre el destinatario, trae el manifiesto firmado y la clave; ningún dato en claro viaja", async () => {
    const rx = await identidadEcdh();
    const { firmar, verificar } = await firmanteDePrueba();
    const c = (await crearClaveContenido("arch_t1"))!;
    const msg = (await sellarOferta(oferta(), c, [{ pub: rx.pub }], { firmar }))!;
    const crudo = JSON.stringify(msg);
    expect(crudo).not.toContain("secreto.pdf");
    expect(crudo).not.toContain(Buffer.from(c.raw).toString("base64"));
    const ab = (await abrirOferta(msg, { abrir: abrirSobreCon(rx.priv), verificar }))!;
    expect(ab.oferta.nombre).toBe("secreto.pdf");
    expect(ab.firmante?.fp).toBe("huella-prueba");
    expect(Buffer.from(ab.clave.raw).equals(Buffer.from(c.raw))).toBe(true);
    const ct = (await sellarTrozo(c, "arch_t1", 0, 3, bytes(100)))!;
    expect(await abrirTrozo(ab.clave, "arch_t1", 0, 3, ct)).not.toBeNull();
  });

  it("un destinatario equivocado no la puede abrir", async () => {
    const rx = await identidadEcdh();
    const intruso = await identidadEcdh();
    const c = (await crearClaveContenido("arch_t1"))!;
    const msg = (await sellarOferta(oferta(), c, [{ pub: rx.pub }], { firmar: null }))!;
    expect(await abrirOferta(msg, { abrir: abrirSobreCon(intruso.priv), verificar: null })).toBeNull();
  });

  it("varios destinatarios: cada uno abre el suyo con la MISMA clave; un tercero no", async () => {
    const [a, b, otro] = [await identidadEcdh(), await identidadEcdh(), await identidadEcdh()];
    const c = (await crearClaveContenido("arch_t1"))!;
    const msg = (await sellarOferta(oferta(), c, [{ pub: a.pub }, { pub: b.pub }], { firmar: null }))!;
    expect(msg.sobres).toHaveLength(2);
    const ra = (await abrirOferta(msg, { abrir: abrirSobreCon(a.priv), verificar: null }))!;
    const rb = (await abrirOferta(msg, { abrir: abrirSobreCon(b.priv), verificar: null }))!;
    expect(Buffer.from(ra.clave.raw).equals(Buffer.from(rb.clave.raw))).toBe(true);
    expect(await abrirOferta(msg, { abrir: abrirSobreCon(otro.priv), verificar: null })).toBeNull();
  });

  it("firma rota, manifiesto que no casa con la oferta o id cambiado → se rechaza", async () => {
    const rx = await identidadEcdh();
    const { firmar } = await firmanteDePrueba();
    const falsa: VerificarFn = async () => false;
    const c = (await crearClaveContenido("arch_t1"))!;
    const msg = (await sellarOferta(oferta(), c, [{ pub: rx.pub }], { firmar }))!;
    expect(await abrirOferta(msg, { abrir: abrirSobreCon(rx.priv), verificar: falsa })).toBeNull();
    expect(await abrirOferta({ ...msg, id: "arch_otro" }, { abrir: abrirSobreCon(rx.priv), verificar: null })).toBeNull();
    expect(await sellarOferta(oferta(), c, [], { firmar: null })).toBeNull();
  });

  it("capacidad anunciada", () => {
    expect(parCifraArchivo([CAPACIDAD_CIFRADO_ARCHIVO])).toBe(true);
    expect(parCifraArchivo(["otra"])).toBe(false);
    expect(parCifraArchivo(undefined)).toBe(false);
  });
});

/** Un canal falso que apunta lo que sale y deja inyectar lo que entra. */
function canalFalso() {
  const salida: Array<string | ArrayBuffer> = [];
  const oyentes = new Set<(d: string | ArrayBuffer) => void>();
  const canal: CanalArchivos = {
    enviar: (t) => (salida.push(t), true),
    enviarBinario: (b) => (salida.push(b), true),
    alMensaje: (cb) => (oyentes.add(cb), () => oyentes.delete(cb)),
  };
  return { canal, salida, entra: (d: string | ArrayBuffer) => oyentes.forEach((cb) => cb(d)) };
}
const tick = () => new Promise((r) => setTimeout(r, 25));
/** Espera (con tope) a que se cumpla algo: el cifrado de WebCrypto es asíncrono y la Mac puede ir cargada. */
async function hasta(cond: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await tick();
}

describe("canal sellado", () => {
  it("emisor→receptor: la oferta y los trozos viajan cifrados y el motor del otro lado los ve en claro", async () => {
    const rx = await identidadEcdh();
    const emi = canalFalso();
    const rec = canalFalso();
    const selladoE = crearCanalSellado(emi.canal, { destinatarios: () => [{ pub: rx.pub }], firmar: null });
    const selladoR = crearCanalSellado(rec.canal, { abrirSobre: abrirSobreCon(rx.priv), verificar: null });
    const vistos: Array<string | ArrayBuffer> = [];
    selladoR.alMensaje((d) => vistos.push(d));

    selladoE.enviar(JSON.stringify(oferta("arch_c1", { trozos: 2 })));
    const claro = bytes(700, 11);
    selladoE.enviarBinario!(encodeChunkBinario("arch_c1", 0, claro));
    selladoE.enviar(JSON.stringify({ t: "archivo.chunk", id: "arch_c1", index: 1, datosB64: bufAB64(claro) }));
    selladoE.enviar(JSON.stringify({ t: "archivo.fin", id: "arch_c1" }));
    await hasta(() => emi.salida.length >= 4);
    expect(emi.salida).toHaveLength(4);
    expect(String(emi.salida[0])).toContain("archivo.oferta.cif");
    expect(String(emi.salida[0])).not.toContain("secreto.pdf");
    expect(selladoE.modoCifrado("arch_c1")).toBe("archivo");

    for (const f of emi.salida) rec.entra(f);
    await hasta(() => vistos.length >= 4);
    expect(vistos).toHaveLength(4);
    expect(JSON.parse(vistos[0] as string).nombre).toBe("secreto.pdf");
    expect(selladoR.modoCifrado("arch_c1")).toBe("archivo");
    // trozo binario y de texto llegan en claro y con el mismo contenido
    expect(Buffer.from(vistos[1] as ArrayBuffer).includes(Buffer.from(claro))).toBe(true);
    expect(JSON.parse(vistos[2] as string).datosB64).toBe(bufAB64(claro));
    expect(JSON.parse(vistos[3] as string).t).toBe("archivo.fin");
  });

  it("un trozo manipulado, repetido con otro índice o en claro se descarta sin llegar al motor", async () => {
    const rx = await identidadEcdh();
    const emi = canalFalso();
    const rec = canalFalso();
    const selladoE = crearCanalSellado(emi.canal, { destinatarios: () => [{ pub: rx.pub }], firmar: null });
    const selladoR = crearCanalSellado(rec.canal, { abrirSobre: abrirSobreCon(rx.priv), verificar: null });
    const vistos: unknown[] = [];
    selladoR.alMensaje((d) => vistos.push(d));
    selladoE.enviar(JSON.stringify(oferta("arch_c2", { trozos: 3 })));
    selladoE.enviarBinario!(encodeChunkBinario("arch_c2", 0, bytes(300)));
    await hasta(() => emi.salida.length >= 2);
    rec.entra(emi.salida[0]);
    await hasta(() => vistos.length >= 1);
    const trozoBueno = emi.salida[1] as ArrayBuffer;
    const manipulado = trozoBueno.slice(0);
    new Uint8Array(manipulado)[manipulado.byteLength - 3] ^= 0xff;
    // mismo texto cifrado con el índice cambiado en la cabecera
    const reindexado = encodeChunkBinario("arch_c2", 1, trozoBueno.slice(4 + "arch_c2".length + 4));
    rec.entra(manipulado);
    rec.entra(reindexado);
    rec.entra(encodeChunkBinario("arch_c2", 2, bytes(300))); // «en claro» a una transferencia sellada
    await hasta(() => selladoR.descartados() >= 3);
    expect(vistos).toHaveLength(1); // solo la oferta
    expect(selladoR.descartados()).toBe(3);
    rec.entra(trozoBueno);
    await hasta(() => vistos.length >= 2);
    expect(vistos).toHaveLength(2);
  });

  it("un destinatario que no es el elegido rechaza la oferta y no recibe nada", async () => {
    const rx = await identidadEcdh();
    const intruso = await identidadEcdh();
    const emi = canalFalso();
    const rec = canalFalso();
    const selladoE = crearCanalSellado(emi.canal, { destinatarios: () => [{ pub: rx.pub }], firmar: null });
    const selladoR = crearCanalSellado(rec.canal, { abrirSobre: abrirSobreCon(intruso.priv), verificar: null });
    const vistos: unknown[] = [];
    selladoR.alMensaje((d) => vistos.push(d));
    selladoE.enviar(JSON.stringify(oferta("arch_c3")));
    await hasta(() => emi.salida.length >= 1);
    rec.entra(emi.salida[0]);
    await hasta(() => rec.salida.length >= 1);
    expect(vistos).toHaveLength(0);
    expect(JSON.parse(rec.salida[0] as string)).toMatchObject({ t: "archivo.rechazar", id: "arch_c3" });
  });

  it("par antiguo: sin la capacidad el archivo va como antes y queda «sin cifrado de archivo»", async () => {
    const rx = await identidadEcdh();
    const emi = canalFalso();
    const avisos: string[] = [];
    const sellado = crearCanalSellado(emi.canal, { destinatarios: () => [{ pub: rx.pub }], parCifra: () => false, alModo: (id, m) => avisos.push(`${id}:${m}`) });
    sellado.enviar(JSON.stringify(oferta("arch_old")));
    sellado.enviar(JSON.stringify({ t: "archivo.chunk", id: "arch_old", index: 0, datosB64: "AAEC" }));
    await hasta(() => emi.salida.length >= 2);
    expect(JSON.parse(emi.salida[0] as string).t).toBe("archivo.oferta");
    expect(JSON.parse(emi.salida[1] as string).datosB64).toBe("AAEC");
    expect(sellado.modoCifrado("arch_old")).toBe("sin-cifrado-de-archivo");
    expect(avisos).toEqual(["arch_old:sin-cifrado-de-archivo"]);
  });

  it("receptor nuevo ante emisor antiguo: acepta en claro marcado, o lo rechaza si exige cifrado", async () => {
    const rec = canalFalso();
    const libre = crearCanalSellado(rec.canal, {});
    const vistos: unknown[] = [];
    libre.alMensaje((d) => vistos.push(d));
    rec.entra(JSON.stringify(oferta("arch_o1")));
    await hasta(() => vistos.length >= 1);
    expect(vistos).toHaveLength(1);
    expect(libre.modoCifrado("arch_o1")).toBe("sin-cifrado-de-archivo");

    const rec2 = canalFalso();
    const estricto = crearCanalSellado(rec2.canal, { exigirCifrado: true });
    const vistos2: unknown[] = [];
    estricto.alMensaje((d) => vistos2.push(d));
    rec2.entra(JSON.stringify(oferta("arch_o2")));
    await hasta(() => rec2.salida.length >= 1);
    expect(vistos2).toHaveLength(0);
    expect(JSON.parse(rec2.salida[0] as string).t).toBe("archivo.rechazar");
  });
});
