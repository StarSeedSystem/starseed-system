/**
 * (IDN1108A) Identidad de cuenta sin servidor: certificados, anclas, enrolamiento, SAS, revocación y ganchos de saludo.
 */
import { describe, expect, it } from "vitest";
import { crearAlmacenMemoria } from "../almacen";
import { crearAnclas, codificarAnclaQr, crearAnuncioCuenta, decodificarAnclaQr, verificarAnuncioCuenta } from "../anclas";
import { emitirCertificadoNeurona, firmanteDeClave, verificarCertificadoNeurona, type AnclaCuenta, type Firmante } from "../certificado-neurona";
import { calcularSas, codificarMensaje, compromisoDe, confirmarEnrolamiento, crearOferta, crearSolicitud, decodificarMensaje, prepararEnrolamiento, procesarRespuesta, VIDA_ENROLAMIENTO_MS } from "../enrolar";
import { verificarHolaConCertificado, type ContextoIdentidad } from "../enlace";
import { CANAL_REVOCACIONES, crearRevocaciones, firmarListaRevocacion, iniciarGossipRevocaciones, verificarListaRevocacion } from "../revocaciones";
import { huellaAparato, huellaMaestra } from "../util";

async function par(): Promise<{ pub: JsonWebKey; priv: CryptoKey }> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { pub, priv: kp.privateKey };
}
async function maestra(): Promise<{ f: Firmante; mfp: string }> {
  const k = await par();
  return { f: firmanteDeClave(k.pub, k.priv), mfp: await huellaMaestra(k.pub) };
}
const propia = (mfp: string): AnclaCuenta => ({ mfp, nivel: "propia", confianza: 1 });
const HOY = 1_800_000_000_000;

describe("certificado cuenta → neurona", () => {
  it("emite y verifica contra su ancla", async () => {
    const m = await maestra();
    const ap = await par();
    const c = await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY, permisos: ["mensajes", "archivos"] });
    expect(c).not.toBeNull();
    const r = await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY + 1000 });
    expect(r).toMatchObject({ ok: true, estado: "valido", cuenta: "u1", neuronaId: "n1", nivel: "propia" });
    expect(r.huella).toBe(await huellaAparato(ap.pub));
    expect(r.permisos).toEqual(["archivos", "mensajes"]);
  });

  it("rechaza cualquier campo manipulado", async () => {
    const m = await maestra();
    const ap = await par();
    const otro = await par();
    const c = (await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY }))!;
    const anclas = [propia(m.mfp)];
    const probar = (x: unknown) => verificarCertificadoNeurona(x, anclas, { ahora: HOY + 1000 });
    expect((await probar({ ...c, neuronaId: "n2" })).ok).toBe(false);
    expect((await probar({ ...c, cuenta: "u2" })).ok).toBe(false);
    expect((await probar({ ...c, permisos: [...c.permisos, "revocar"] })).ok).toBe(false);
    expect((await probar({ ...c, caduca: c.caduca + 1 })).ok).toBe(false);
    expect((await probar({ ...c, clavePublicaAparato: otro.pub })).ok).toBe(false);
    expect((await probar({ ...c, sig: c.sig.slice(0, -4) + "AAAA" })).ok).toBe(false);
    expect((await probar({ ...c, mpub: otro.pub })).ok).toBe(false);
    expect((await probar(null)).ok).toBe(false);
    expect((await probar({ v: 1 })).ok).toBe(false);
  });

  it("caducidad y fechas en el futuro", async () => {
    const m = await maestra();
    const ap = await par();
    const c = (await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY, caduca: HOY + 60_000 }))!;
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY + 30_000 })).ok).toBe(true);
    const tarde = await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY + 61_000 });
    expect(tarde).toMatchObject({ ok: false, estado: "invalido" });
    expect(tarde.motivo).toMatch(/caducado/);
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY - 3 * 86_400_000 })).ok).toBe(false);
    expect(await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY, caduca: HOY })).toBeNull();
  });

  it("sin ancla no prueba nada: una maestra ajena no se hace pasar por la cuenta", async () => {
    const real = await maestra();
    const falsa = await maestra();
    const ap = await par();
    const c = (await emitirCertificadoNeurona(falsa.f, { cuenta: "u-de-la-victima", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY }))!;
    const r = await verificarCertificadoNeurona(c, [propia(real.mfp)], { ahora: HOY });
    expect(r).toMatchObject({ ok: false, estado: "sin-ancla" });
    // Reclamar la huella de la víctima con la propia clave no cuela: la huella no corresponde a la clave.
    const r2 = await verificarCertificadoNeurona({ ...c, mfp: real.mfp }, [propia(real.mfp)], { ahora: HOY });
    expect(r2).toMatchObject({ ok: false, estado: "invalido" });
  });

  it("revocación y portador esperado", async () => {
    const m = await maestra();
    const ap = await par();
    const c = (await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY }))!;
    const hu = await huellaAparato(ap.pub);
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY, estaRevocada: (r) => r.neuronaId === "n1" })).motivo).toMatch(/revocada/);
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY, estaRevocada: (r) => r.huella === hu })).ok).toBe(false);
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY, esperado: { neuronaId: "n9" } })).ok).toBe(false);
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY, esperado: { huella: "id:otra" } })).ok).toBe(false);
    expect((await verificarCertificadoNeurona(c, [propia(m.mfp)], { ahora: HOY, esperado: { neuronaId: "n1", huella: hu } })).ok).toBe(true);
  });

  it("una ancla solo anunciada no vale hasta ganar confianza", async () => {
    const m = await maestra();
    const ap = await par();
    const c = (await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY }))!;
    const anclas = crearAnclas(crearAlmacenMemoria());
    const anuncio = (await crearAnuncioCuenta(m.f, "u1"))!;
    await anclas.aprenderAnuncio(anuncio);
    expect((await verificarCertificadoNeurona(c, await anclas.listar(), { ahora: HOY })).estado).toBe("sin-ancla");
    for (let i = 0; i < 3; i++) await anclas.registrarEvento(m.mfp, "veredicto-confirmado");
    const r = await verificarCertificadoNeurona(c, await anclas.listar(), { ahora: HOY });
    expect(r).toMatchObject({ ok: true, nivel: "anunciada" });
  });
});

describe("almacén de anclas", () => {
  it("niveles: propia manda, el QR no baja ni sube de más, el anuncio firmado se verifica", async () => {
    const a = crearAnclas(crearAlmacenMemoria());
    const yo = await maestra();
    const otra = await maestra();
    await a.fijarPropia(yo.mfp, "u1");
    expect((await a.propia())?.mfp).toBe(yo.mfp);
    await a.aprenderPorQr(yo.mfp);
    expect((await a.obtener(yo.mfp))?.nivel).toBe("propia");
    const q = await a.aprenderPorQr(otra.mfp, "u2", "Ana");
    expect(q).toMatchObject({ nivel: "qr", confianza: 0.9 });
    const falso = { ...(await crearAnuncioCuenta(otra.f, "u2"))!, cuenta: "otro" };
    expect(await verificarAnuncioCuenta(falso)).toBe(false);
    expect(await a.aprenderAnuncio(falso)).toBeNull();
    await a.registrarEvento(otra.mfp, "firma-mala");
    expect((await a.obtener(otra.mfp))!.confianza).toBeCloseTo(0.6);
    await a.registrarEvento(yo.mfp, "firma-mala");
    expect((await a.obtener(yo.mfp))!.confianza).toBe(1);
    // fijar otra propia sustituye a la anterior
    await a.fijarPropia(otra.mfp);
    expect((await a.listar()).filter((x) => x.nivel === "propia")).toHaveLength(1);
  });

  it("QR de ancla: ida y vuelta y rechazo de huella que no cuadra", async () => {
    const m = await maestra();
    const txt = codificarAnclaQr({ mpub: m.f.mpub, mfp: m.mfp, cuenta: "u1", etiqueta: "Ana" });
    expect(await decodificarAnclaQr(txt)).toEqual({ mfp: m.mfp, cuenta: "u1", etiqueta: "Ana" });
    const mala = codificarAnclaQr({ mpub: m.f.mpub, mfp: "acct:falsa", cuenta: "u1" });
    expect(await decodificarAnclaQr(mala)).toBeNull();
    expect(await decodificarAnclaQr("hola")).toBeNull();
  });
});

describe("enrolamiento sin internet y código de 6 cifras", () => {
  it("el SAS son 6 cifras, es estable y cambia con cualquier entrada", async () => {
    const m = await maestra();
    const a = await par();
    const otra = await par();
    const s = (await calcularSas(a.pub, m.f.mpub, "nN", "nE"))!;
    expect(s).toMatch(/^\d{6}$/);
    expect(await calcularSas(a.pub, m.f.mpub, "nN", "nE")).toBe(s);
    const distintos = await Promise.all([calcularSas(otra.pub, m.f.mpub, "nN", "nE"), calcularSas(a.pub, otra.pub, "nN", "nE"), calcularSas(a.pub, m.f.mpub, "nX", "nE"), calcularSas(a.pub, m.f.mpub, "nN", "nX")]);
    expect(distintos.filter((x) => x === s)).toHaveLength(0);
    expect(await calcularSas(a.pub, m.f.mpub, "", "nE")).toBeNull();
  });

  it("modo QR: solicitud → SAS igual en las dos pantallas → certificado, ancla y texto QR", async () => {
    const m = await maestra();
    const ap = await par();
    const sol = crearSolicitud({ neuronaId: "nueva", nombre: "Tablet", clavePublicaAparato: ap.pub }, HOY)!;
    const enQr = decodificarMensaje<typeof sol>(codificarMensaje(sol));
    const prep = await prepararEnrolamiento(enQr, m.f, "u1", { ahora: HOY + 1000 });
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    const resp = (await prep.preparado.emitir())!;
    const respQr = decodificarMensaje<typeof resp>(codificarMensaje(resp));
    const proc = await procesarRespuesta(sol, respQr, { ahora: HOY + 2000 });
    expect(proc.ok).toBe(true);
    if (!proc.ok) return;
    expect(proc.pendiente.sas).toBe(prep.preparado.sas);
    const guardado: { cert?: unknown; ancla?: [string, string] } = {};
    const destinos = { guardarCertificado: async (c: unknown) => void (guardado.cert = c), fijarAnclaPropia: async (a: string, c: string) => void (guardado.ancla = [a, c]) };
    expect(await confirmarEnrolamiento(proc.pendiente, "000000" === proc.pendiente.sas ? "111111" : "000000", destinos)).toBe(false);
    expect(guardado.cert).toBeUndefined();
    expect(await confirmarEnrolamiento(proc.pendiente, proc.pendiente.sas.slice(0, 3) + " " + proc.pendiente.sas.slice(3), destinos)).toBe(true);
    expect(guardado.ancla).toEqual([m.mfp, "u1"]);
    const v = await verificarCertificadoNeurona(guardado.cert, [propia(m.mfp)], { ahora: HOY + 3000, esperado: { neuronaId: "nueva" } });
    expect(v.ok).toBe(true);
  });

  it("rechaza respuestas ajenas, de otro aparato, de otra solicitud o caducadas", async () => {
    const m = await maestra();
    const ap = await par();
    const intruso = await par();
    const sol = crearSolicitud({ neuronaId: "nueva", nombre: "T", clavePublicaAparato: ap.pub }, HOY)!;
    const sol2 = crearSolicitud({ neuronaId: "nueva", nombre: "T", clavePublicaAparato: ap.pub }, HOY)!;
    const prep = await prepararEnrolamiento(sol, m.f, "u1", { ahora: HOY });
    if (!prep.ok) throw new Error("no prepara");
    const resp = (await prep.preparado.emitir())!;
    expect((await procesarRespuesta(sol2, resp, { ahora: HOY })).ok).toBe(false); // nonce de otra solicitud
    expect((await procesarRespuesta(sol, resp, { ahora: HOY + VIDA_ENROLAMIENTO_MS + 1 })).ok).toBe(false);
    const solIntruso = crearSolicitud({ neuronaId: "nueva", nombre: "T", clavePublicaAparato: intruso.pub }, HOY)!;
    const prepIntruso = await prepararEnrolamiento(solIntruso, m.f, "u1", { ahora: HOY });
    if (!prepIntruso.ok) throw new Error("no prepara");
    const respIntruso = (await prepIntruso.preparado.emitir())!;
    expect((await procesarRespuesta(sol, { ...respIntruso, nonceN: sol.nonceN }, { ahora: HOY })).ok).toBe(false); // certificado de otro aparato
    expect((await procesarRespuesta(sol, { ...resp, certificado: { ...resp.certificado, permisos: ["todo"] } }, { ahora: HOY })).ok).toBe(false);
    expect((await prepararEnrolamiento({ ...sol, creada: HOY - VIDA_ENROLAMIENTO_MS - 1 }, m.f, "u1", { ahora: HOY })).ok).toBe(false);
    expect((await prepararEnrolamiento({ t: "otra" }, m.f, "u1")).ok).toBe(false);
  });

  it("modo enlace: el compromiso impide cambiar la solicitud después de ver la oferta", async () => {
    const m = await maestra();
    const ap = await par();
    const intruso = await par();
    const sol = crearSolicitud({ neuronaId: "nueva", nombre: "T", clavePublicaAparato: ap.pub }, HOY)!;
    const com = (await compromisoDe(sol))!;
    const oferta = crearOferta(m.f.mpub, com)!;
    const ok = await prepararEnrolamiento(sol, m.f, "u1", { oferta, compromiso: com, ahora: HOY });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.preparado.nonceE).toBe(oferta.nonceE);
    const resp = (await ok.preparado.emitir())!;
    const proc = await procesarRespuesta(sol, resp, { oferta, ahora: HOY });
    expect(proc.ok && proc.pendiente.sas === ok.preparado.sas).toBe(true);
    // Un atacante intenta colar otra solicitud (otra clave) tras haber visto la oferta.
    const cambiada = crearSolicitud({ neuronaId: "nueva", nombre: "T", clavePublicaAparato: intruso.pub }, HOY)!;
    expect((await prepararEnrolamiento(cambiada, m.f, "u1", { oferta, compromiso: com, ahora: HOY })).ok).toBe(false);
    // Y una respuesta con otro nonceE que el ofrecido tampoco vale.
    expect((await procesarRespuesta(sol, { ...resp, nonceE: "otro" }, { oferta, ahora: HOY })).ok).toBe(false);
  });
});

describe("revocación por la malla", () => {
  it("la lista es acumulativa, solo la acepta quien conoce la ancla, y seq nunca baja", async () => {
    const m = await maestra();
    const otra = await maestra();
    const anclas: AnclaCuenta[] = [propia(m.mfp)];
    const l1 = (await firmarListaRevocacion(m.f, null, [{ neuronaId: "n1", huella: "id:aaa" }], HOY))!;
    const l2 = (await firmarListaRevocacion(m.f, l1, [{ neuronaId: "n2" }], HOY + 1))!;
    expect(l2.seq).toBe(2);
    expect(l2.revocadas.map((r) => r.neuronaId)).toEqual(["n1", "n2"]);
    expect(await verificarListaRevocacion(l2, anclas)).toBe(true);
    expect(await verificarListaRevocacion(l2, [propia(otra.mfp)])).toBe(false); // ancla desconocida
    expect(await verificarListaRevocacion({ ...l2, revocadas: [] }, anclas)).toBe(false); // manipulada
    const ajena = (await firmarListaRevocacion(otra.f, null, [{ neuronaId: "n1" }], HOY))!;
    expect(await verificarListaRevocacion({ ...ajena, mfp: m.mfp }, anclas)).toBe(false);
    expect(await firmarListaRevocacion(otra.f, l1, [{ neuronaId: "x" }])).toBeNull(); // no se extiende la lista de otra cuenta

    const rev = crearRevocaciones(crearAlmacenMemoria());
    await rev.cargar();
    expect(await rev.aceptar(l2, anclas)).toBe(true);
    expect(await rev.aceptar(l2, anclas)).toBe(false); // ya la tenía
    expect(await rev.aceptar(l1, anclas)).toBe(false); // seq menor
    expect(rev.estaRevocada({ mfp: m.mfp, neuronaId: "n2", huella: "id:z" })).toBe(true);
    expect(rev.estaRevocada({ mfp: m.mfp, neuronaId: "nX", huella: "id:aaa" })).toBe(true); // por huella
    expect(rev.estaRevocada({ mfp: m.mfp, neuronaId: "n3", huella: "id:b" })).toBe(false);
    expect(rev.estaRevocada({ mfp: otra.mfp, neuronaId: "n1", huella: "id:aaa" })).toBe(false);
  });

  it("gossip: lo nuevo se reenvía por los demás enlaces y no entra en bucle", async () => {
    const m = await maestra();
    const anclas: AnclaCuenta[] = [propia(m.mfp)];
    const enviados: Array<{ enlaceId: string; canal: string }> = [];
    let entrada: ((x: { cuerpo: unknown; origen: { enlaceId: string } }) => void) | null = null;
    const g = iniciarGossipRevocaciones({
      revocaciones: crearRevocaciones(crearAlmacenMemoria()),
      anclas: async () => anclas,
      enlaces: async () => [{ id: "lan:1" }, { id: "ble:2" }, { id: "rtc:3" }],
      enviar: async (d, canal) => void enviados.push({ enlaceId: d.enlaceId, canal }),
      alRecibir: (canal, cb) => {
        expect(canal).toBe(CANAL_REVOCACIONES);
        entrada = cb;
        return () => {};
      },
    });
    const l = (await firmarListaRevocacion(m.f, null, [{ neuronaId: "n1" }], HOY))!;
    entrada!({ cuerpo: l, origen: { enlaceId: "lan:1" } });
    await new Promise((r) => setTimeout(r, 30));
    expect(enviados.map((e) => e.enlaceId).sort()).toEqual(["ble:2", "rtc:3"]);
    enviados.length = 0;
    entrada!({ cuerpo: l, origen: { enlaceId: "ble:2" } }); // repetida: no se reenvía
    entrada!({ cuerpo: { basura: true }, origen: { enlaceId: "ble:2" } });
    await new Promise((r) => setTimeout(r, 30));
    expect(enviados).toHaveLength(0);
    const l2 = (await firmarListaRevocacion(m.f, l, [{ neuronaId: "n2" }], HOY + 5))!;
    expect(await g.difundir(l2)).toBe(true);
    expect(enviados).toHaveLength(3);
  });
});

describe("gancho de saludo verificarHolaConCertificado", () => {
  async function escena() {
    const m = await maestra();
    const ap = await par();
    const hu = await huellaAparato(ap.pub);
    const cert = (await emitirCertificadoNeurona(m.f, { cuenta: "u1", neuronaId: "n1", clavePublicaAparato: ap.pub, emitido: HOY }))!;
    const rev = crearRevocaciones(crearAlmacenMemoria());
    await rev.cargar();
    const ctx = (anclas: AnclaCuenta[]): ContextoIdentidad => ({ anclas: async () => anclas, estaRevocada: (r) => rev.estaRevocada(r), ahora: () => HOY + 1000 });
    return { m, hu, cert, rev, ctx };
  }

  it("sin certificado no se rechaza ni se eleva", async () => {
    const e = await escena();
    expect(await verificarHolaConCertificado({ neurona: "n1", huella: e.hu }, e.ctx([]))).toMatchObject({ ok: true, mismaCuenta: false, estado: "sin-certificado" });
  });

  it("misma cuenta con certificado válido: se acepta sin haberse vinculado antes", async () => {
    const e = await escena();
    expect(await verificarHolaConCertificado({ certificado: e.cert, neurona: "n1", huella: e.hu }, e.ctx([propia(e.m.mfp)]))).toMatchObject({ ok: true, mismaCuenta: true, estado: "valido" });
  });

  it("cuenta ajena con ancla por QR: válido pero NO es misma cuenta; sin ancla: se sigue como antes", async () => {
    const e = await escena();
    const qr: AnclaCuenta = { mfp: e.m.mfp, nivel: "qr", confianza: 0.9 };
    expect(await verificarHolaConCertificado({ certificado: e.cert, neurona: "n1", huella: e.hu }, e.ctx([qr]))).toMatchObject({ ok: true, mismaCuenta: false, estado: "valido" });
    expect(await verificarHolaConCertificado({ certificado: e.cert, neurona: "n1", huella: e.hu }, e.ctx([]))).toMatchObject({ ok: true, mismaCuenta: false, estado: "sin-ancla" });
  });

  it("rechaza revocados, huella que no es la certificada y neurona que no es la certificada", async () => {
    const e = await escena();
    const anclas = [propia(e.m.mfp)];
    expect((await verificarHolaConCertificado({ certificado: e.cert, neurona: "n1", huella: "id:otra" }, e.ctx(anclas))).ok).toBe(false);
    expect((await verificarHolaConCertificado({ certificado: e.cert, neurona: "n7", huella: e.hu }, e.ctx(anclas))).ok).toBe(false);
    const lista = (await firmarListaRevocacion(e.m.f, null, [{ neuronaId: "n1" }], HOY))!;
    await e.rev.aceptar(lista, anclas);
    const v = await verificarHolaConCertificado({ certificado: e.cert, neurona: "n1", huella: e.hu }, e.ctx(anclas));
    expect(v).toMatchObject({ ok: false, estado: "invalido" });
    expect(v.motivo).toMatch(/revocada/);
  });
});
