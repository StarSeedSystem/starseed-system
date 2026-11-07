/**
 * (VER1107B) «Pedir actualización»: el mensaje firmado `neurona.actualizar.solicitud` solo se acepta
 * de una neurona de la MISMA cuenta, con firma válida y fresca. Firmas de verdad (WebCrypto de Node,
 * ECDSA P-256 de mesh-identity): nada simulado en la criptografía.
 */
import { describe, expect, it } from "vitest";
import { unwrapSigned, wrapSigned } from "@/ai/astraura/mesh/mesh-identity";
import { crearSolicitud, TIPO_SOLICITUD, validarSolicitud, VENTANA_SOLICITUD_MS, type ContextoValidacion } from "../pedir-actualizacion";

const CUENTA = "uid-alex";
const cuerpo = (cambios: Partial<ReturnType<typeof crearSolicitud>> = {}) => ({
  ...crearSolicitud({ id: "pedido-1", de: "neu-a", deNombre: "Mac de Alex", para: "neu-b", cuenta: CUENTA, version: "0.6.0", ahora: Date.now() }),
  ...cambios,
});
const firmado = async (c: unknown) => unwrapSigned(await wrapSigned(c));
const ctx = (fpPropia: string | undefined, extra: Partial<ContextoValidacion> = {}): ContextoValidacion => ({
  miCuenta: CUENTA,
  miNeurona: "neu-b",
  cuentaDeHuella: (fp) => (fp === fpPropia ? CUENTA : null),
  ahora: Date.now(),
  ...extra,
});

describe("crearSolicitud", () => {
  it("tiene la forma del contrato", () => {
    expect(cuerpo()).toMatchObject({ t: TIPO_SOLICITUD, v: 1, id: "pedido-1", de: "neu-a", para: "neu-b", cuenta: CUENTA, version: "0.6.0" });
  });
});

describe("validarSolicitud (firmas reales)", () => {
  it("de una neurona de la misma cuenta, firmada y fresca → se acepta", async () => {
    const d = await firmado(cuerpo());
    expect(d.verified).toBe(true);
    const r = validarSolicitud(d, ctx(d.fp));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.solicitud.deNombre).toBe("Mac de Alex");
  });

  it("dueño equivocado: el cuerpo dice otra cuenta → se rechaza", async () => {
    const d = await firmado(cuerpo({ cuenta: "uid-otra" }));
    expect(validarSolicitud(d, ctx(d.fp))).toEqual({ ok: false, motivo: "Viene de otra cuenta." });
  });

  it("dueño equivocado: la huella que firma es de OTRA cuenta (aunque el cuerpo diga la mía) → se rechaza", async () => {
    const d = await firmado(cuerpo());
    const r = validarSolicitud(d, ctx(undefined, { cuentaDeHuella: () => "uid-otra" }));
    expect(r).toEqual({ ok: false, motivo: "La firma no es de una neurona de tu cuenta." });
    // …ni aunque un vínculo recordado tenga esa huella: manda el registro verificado.
    expect(validarSolicitud(d, ctx(undefined, { cuentaDeHuella: () => "uid-otra", huellasVinculadas: new Set([d.fp as string]) })).ok).toBe(false);
  });

  it("huella desconocida → se rechaza; sin internet, un vínculo RECORDADO con esa huella la acepta", async () => {
    const d = await firmado(cuerpo());
    expect(validarSolicitud(d, ctx(undefined)).ok).toBe(false);
    expect(validarSolicitud(d, ctx(undefined, { huellasVinculadas: new Set([d.fp as string]) })).ok).toBe(true);
  });

  it("firma mala: el cuerpo se cambió después de firmar → se rechaza", async () => {
    const sobre = await wrapSigned(cuerpo());
    (sobre.b as Record<string, unknown>).para = "neu-c";
    const d = await unwrapSigned(sobre);
    expect(d.verified).toBe(false);
    expect(validarSolicitud(d, ctx(d.fp, { miNeurona: "neu-c" }))).toEqual({ ok: false, motivo: "La firma no es válida." });
  });

  it("firma mala: la firma de otro sobre pegada a este (otro nonce) → se rechaza", async () => {
    const mio = await wrapSigned(cuerpo());
    const ajeno = await wrapSigned(cuerpo());
    const d = await unwrapSigned({ ...ajeno, s: mio.s, nonce: ajeno.nonce });
    expect(validarSolicitud(d, ctx(d.fp)).ok).toBe(false);
  });

  it("sin firma, caducada, para otra neurona, de sí misma o revocada → se rechaza", async () => {
    expect(validarSolicitud(await unwrapSigned({ v: 0, b: cuerpo() }), ctx("x")).ok).toBe(false);
    const d = await firmado(cuerpo());
    expect(validarSolicitud(d, ctx(d.fp, { ahora: Date.now() + VENTANA_SOLICITUD_MS + 5_000 }))).toEqual({ ok: false, motivo: "La solicitud caducó." });
    expect(validarSolicitud(d, ctx(d.fp, { miNeurona: "neu-c" }))).toEqual({ ok: false, motivo: "No es para esta neurona." });
    expect(validarSolicitud(d, ctx(d.fp, { miNeurona: "neu-a" })).ok).toBe(false);
    expect(validarSolicitud(d, ctx(d.fp, { revocada: () => true }))).toEqual({ ok: false, motivo: "Esa identidad está revocada." });
    expect(validarSolicitud(d, ctx(d.fp, { miCuenta: null })).ok).toBe(false);
  });

  it("lo que no es una solicitud de actualización → se rechaza", async () => {
    const d = await firmado({ t: "otra.cosa", v: 1, id: "x", de: "neu-a", para: "neu-b", cuenta: CUENTA, ts: 1 });
    expect(validarSolicitud(d, ctx(d.fp))).toEqual({ ok: false, motivo: "No es una solicitud de actualización." });
    const malId = await firmado(cuerpo({ id: "con espacios y <html>" }));
    expect(validarSolicitud(malId, ctx(malId.fp)).ok).toBe(false);
  });
});
