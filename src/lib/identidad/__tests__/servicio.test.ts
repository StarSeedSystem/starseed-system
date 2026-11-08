/**
 * (IDN1108A) Servicio de identidad: maestra real (master-identity), exportación con contraseña, enrolamiento extremo a
 * extremo entre dos servicios, revocación y decisión del modo «sin internet».
 */
import { beforeEach, describe, expect, it } from "vitest";
import * as MI from "@/ai/astraura/mesh/master-identity";
import { crearAlmacenMemoria } from "../almacen";
import { crearAnclas } from "../anclas";
import { verificarCertificadoNeurona } from "../certificado-neurona";
import { codificarMensaje, decodificarMensaje } from "../enrolar";
import { decidirModoAcceso } from "../modo-sin-internet";
import { crearRevocaciones } from "../revocaciones";
import { blobATexto, crearServicio, textoABlob, type MaestraLocal } from "../servicio";
import { huellaAparato } from "../util";

const PASS = "una-contrasena-larga-1";

async function aparato() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { pub: await crypto.subtle.exportKey("jwk", kp.publicKey) };
}
const maestraReal: MaestraLocal = { tiene: MI.hasMasterKey, obtener: MI.getOrCreateMasterKey, exportar: MI.exportMasterKeyEncrypted, importar: MI.importMasterKeyEncrypted };
const sinMaestra: MaestraLocal = { tiene: () => false, obtener: async () => null, exportar: async () => null, importar: async () => null };

async function neurona(id: string, maestra: MaestraLocal, ahora = () => Date.now()) {
  const almacen = crearAlmacenMemoria();
  const ap = await aparato();
  const anclas = crearAnclas(almacen);
  const revocaciones = crearRevocaciones(almacen);
  const s = crearServicio({ almacen, anclas, revocaciones, maestra, neuronaId: () => id, nombreNeurona: () => `Neurona ${id}`, cuenta: async () => "cuenta-1", aparato: async () => ap, ahora });
  return { s, anclas, revocaciones, ap };
}

beforeEach(() => MI._resetMasterKey());

describe("clave maestra con contraseña", () => {
  it("crear fija ancla propia, tenencia y certificado propio; no pisa una existente", async () => {
    const a = await neurona("a", maestraReal);
    const r = await a.s.crearMaestra();
    expect(r.ok).toBe(true);
    const est = await a.s.estado();
    expect(est.tiene).toBe(true);
    expect(est.tenencia).toMatchObject({ neuronaId: "a", mfp: est.mfp });
    expect((await a.anclas.propia())?.mfp).toBe(est.mfp);
    const v = await verificarCertificadoNeurona(est.certificado, await a.anclas.listar());
    expect(v).toMatchObject({ ok: true, nivel: "propia", neuronaId: "a" });
    expect((await a.s.crearMaestra()).ok).toBe(false);
  });

  it("exportar → importar en otra neurona conserva la identidad; contraseña corta o mala se rechaza", async () => {
    const a = await neurona("a", maestraReal);
    await a.s.crearMaestra();
    const mfp = (await a.s.estado()).mfp;
    expect((await a.s.exportar("corta")).ok).toBe(false);
    const ex = await a.s.exportar(PASS);
    if (!ex.ok) throw new Error(ex.motivo);
    expect(ex.texto.startsWith("ssm1:")).toBe(true);
    expect(ex.nombreArchivo).toMatch(/\.ssm$/);
    expect(ex.texto).not.toMatch(/"d"/); // la privada nunca va en claro
    const blob = textoABlob(ex.texto)!;
    expect(JSON.stringify(blob)).not.toContain('"d":');

    MI._resetMasterKey(); // «otra neurona»: sin maestra
    const b = await neurona("b", maestraReal);
    expect((await b.s.importar(ex.texto, "contrasena-equivocada-1")).ok).toBe(false);
    expect(MI.hasMasterKey()).toBe(false);
    const ok = await b.s.importar(ex.texto, PASS);
    expect(ok).toEqual({ ok: true, mfp });
    expect((await b.anclas.propia())?.mfp).toBe(mfp);
    expect((await b.s.estado()).tenencia?.neuronaId).toBe("b");
    // JSON crudo también vale (archivo)
    MI._resetMasterKey();
    const c = await neurona("c", maestraReal);
    expect((await c.s.importar(JSON.stringify(blob), PASS)).ok).toBe(true);
  });

  it("rechaza blobs manipulados (ciphertext, clave pública intercambiada) y basura", async () => {
    const a = await neurona("a", maestraReal);
    await a.s.crearMaestra();
    const ex = await a.s.exportar(PASS);
    if (!ex.ok) throw new Error(ex.motivo);
    const blob = textoABlob(ex.texto)!;
    MI._resetMasterKey();
    const b = await neurona("b", maestraReal);
    const ct = blob.ct.slice(0, -3) + (blob.ct.endsWith("AAA") ? "BBB" : "AAA");
    expect((await b.s.importar(blobATexto({ ...blob, ct }), PASS)).ok).toBe(false);
    const otra = await MI.fpOfMaster({ ...blob.mpub, x: "xxxx" });
    expect((await b.s.importar(blobATexto({ ...blob, mpub: { ...blob.mpub, x: "xxxx" }, mfp: otra }), PASS)).ok).toBe(false);
    expect((await b.s.importar("basura", PASS)).ok).toBe(false);
    expect(MI.hasMasterKey()).toBe(false);
  });
});

describe("enrolar una neurona nueva sin internet (dos servicios)", () => {
  it("titular + neurona nueva: código igual, certificado guardado y verificable offline; código malo no guarda nada", async () => {
    const a = await neurona("a", maestraReal);
    await a.s.crearMaestra();
    const b = await neurona("b", sinMaestra);

    const sol = (await b.s.nuevaSolicitud())!;
    const prep = await a.s.prepararEnrolamientoDe(codificarMensaje(sol));
    if (!prep.ok) throw new Error(prep.motivo);
    const resp = codificarMensaje((await prep.preparado.emitir())!);
    const proc = await b.s.leerRespuesta(sol, resp);
    if (!proc.ok) throw new Error(proc.motivo);
    expect(proc.pendiente.sas).toBe(prep.preparado.sas);

    const mal = proc.pendiente.sas === "123456" ? "654321" : "123456";
    expect(await b.s.confirmarEnrolamiento(proc.pendiente, mal)).toBe(false);
    expect(await b.s.certificadoPropio()).toBeNull();
    expect(await b.s.confirmarEnrolamiento(proc.pendiente, proc.pendiente.sas)).toBe(true);

    const cert = await b.s.certificadoPropio();
    expect(cert?.neuronaId).toBe("b");
    expect(await b.anclas.propia()).toMatchObject({ mfp: (await a.s.estado()).mfp, cuenta: "cuenta-1" });
    const v = await verificarCertificadoNeurona(cert, await b.anclas.listar(), { esperado: { huella: await huellaAparato(b.ap.pub) } });
    expect(v).toMatchObject({ ok: true, nivel: "propia" });
    // Una neurona sin maestra no puede emitir.
    expect((await b.s.prepararEnrolamientoDe(codificarMensaje(sol))).ok).toBe(false);
    expect(decodificarMensaje("sse1:%%%")).toBeNull();
  });

  it("revocar: la lista firmada por la maestra hace que la neurona deje de verificar", async () => {
    const a = await neurona("a", maestraReal);
    await a.s.crearMaestra();
    const b = await neurona("b", sinMaestra);
    const sol = (await b.s.nuevaSolicitud())!;
    const prep = await a.s.prepararEnrolamientoDe(codificarMensaje(sol));
    if (!prep.ok) throw new Error(prep.motivo);
    const proc = await b.s.leerRespuesta(sol, codificarMensaje((await prep.preparado.emitir())!));
    if (!proc.ok) throw new Error(proc.motivo);
    await b.s.confirmarEnrolamiento(proc.pendiente, proc.pendiente.sas);

    const lista = (await a.s.revocar([{ neuronaId: "b", motivo: "perdida" }]))!;
    expect(lista.seq).toBe(1);
    await b.revocaciones.cargar();
    expect(await b.revocaciones.aceptar(lista, await b.anclas.listar())).toBe(true);
    const cert = await b.s.certificadoPropio();
    const r = await verificarCertificadoNeurona(cert, await b.anclas.listar(), { estaRevocada: (x) => b.revocaciones.estaRevocada(x) });
    expect(r.ok).toBe(false);
    expect(await b.s.revocar([{ neuronaId: "z" }])).toBeNull(); // sin maestra no se revoca
  });
});

describe("modo sin internet", () => {
  it("con internet no cambia nada; sin sesión guardada va a login", async () => {
    const base = { certificado: null, anclas: [], fallaRed: false };
    expect((await decidirModoAcceso({ ...base, enLinea: true, sesionEnCache: true, sesionVerificada: true })).modo).toBe("normal");
    expect((await decidirModoAcceso({ ...base, enLinea: true, sesionEnCache: true, sesionVerificada: false })).modo).toBe("login");
    expect((await decidirModoAcceso({ ...base, enLinea: false, sesionEnCache: false, sesionVerificada: false })).modo).toBe("login");
  });

  it("sin red y con sesión guardada se queda, etiquetado; el certificado válido sube la identidad; el estricto lo exige", async () => {
    const a = await neurona("a", maestraReal);
    await a.s.crearMaestra();
    const est = await a.s.estado();
    const anclas = await a.anclas.listar();
    const sinRed = { enLinea: false, fallaRed: true, sesionEnCache: true, sesionVerificada: false };
    const conCert = await decidirModoAcceso({ ...sinRed, certificado: est.certificado, anclas });
    expect(conCert).toMatchObject({ modo: "sin-internet", identidad: "certificada" });
    expect(conCert.etiqueta).toMatch(/Sin internet/);
    const sinCert = await decidirModoAcceso({ ...sinRed, certificado: null, anclas });
    expect(sinCert).toMatchObject({ modo: "sin-internet", identidad: "solo-sesion" });
    expect((await decidirModoAcceso({ ...sinRed, certificado: null, anclas, exigirCertificado: true })).modo).toBe("login");
    const revocado = await decidirModoAcceso({ ...sinRed, certificado: est.certificado, anclas, estaRevocada: () => true, exigirCertificado: true });
    expect(revocado.modo).toBe("login");
    const rev = await decidirModoAcceso({ ...sinRed, certificado: est.certificado, anclas, estaRevocada: () => true });
    expect(rev.identidad).toBe("solo-sesion");
  });
});
