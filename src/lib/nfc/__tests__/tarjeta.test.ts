import { describe, it, expect } from "vitest";
import { bytesAFirmar, codificar, decodificar, verificar, VALIDEZ_MS, type TarjetaNeurona, type VerificadorFirma } from "../tarjeta";

const h = (c: string, n: number) => c.repeat(n);
const base: TarjetaNeurona = {
  version: 1, neuronaId: "neu-1", clavePublica: h("a", 64), cuenta: { modo: "alias", valor: "luna" },
  claveEfimera: h("b", 64), nonce: h("c", 32), emitidaEn: 1_000_000, ofertas: ["capacidades"],
  transportes: [{ tipo: "ble", direccion: "AA:BB" }], firma: h("d", 128),
};
const ok: VerificadorFirma = () => true;
const no: VerificadorFirma = () => false;
const idaYVuelta = (t: unknown) => {
  const r = codificar(t as TarjetaNeurona);
  return r.ok && decodificar(r.bytes).ok;
};

describe("codificar / decodificar", () => {
  it("ida y vuelta conserva la tarjeta", () => {
    const r = codificar(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(decodificar(r.bytes)).toEqual({ ok: true, tarjeta: base });
  });
  it("usa registro largo o corto según el tamaño", () => {
    const grande = codificar({ ...base, ofertas: Array.from({ length: 8 }, (_, i) => "oferta-" + i + "x".repeat(20)) });
    expect(grande.ok && grande.bytes[0]).toBe(0xc2);
    expect(idaYVuelta({ ...base, ofertas: Array.from({ length: 8 }, (_, i) => "oferta-" + i + "x".repeat(20)) })).toBe(true);
    const chica = codificar({ ...base, ofertas: [], transportes: [] });
    expect(chica.ok && chica.bytes[0]).toBe(0xc2);
  });
  it("rechaza lo que pasa de 1 KB", () => {
    expect(codificar({ ...base, ofertas: ["x".repeat(1200)] }).ok).toBe(false);
    expect(decodificar(new Uint8Array(1025)).ok).toBe(false);
  });
  it("rechaza bytes rotos o ajenos", () => {
    expect(decodificar(new Uint8Array([1, 2])).ok).toBe(false);
    const r = codificar(base);
    if (!r.ok) throw new Error("no codifica");
    expect(decodificar(r.bytes.subarray(0, r.bytes.length - 3)).ok).toBe(false);
    const mal = r.bytes.slice();
    mal[mal.length - 1] = 0xff;
    expect(decodificar(mal).ok).toBe(false);
  });
  it("valida la forma: versión, claves, cuenta y transportes", () => {
    expect(idaYVuelta({ ...base, version: 2 })).toBe(false);
    expect(idaYVuelta({ ...base, clavePublica: "zz" })).toBe(false);
    expect(idaYVuelta({ ...base, firma: "ab" })).toBe(false);
    expect(idaYVuelta({ ...base, nonce: "ab" })).toBe(false);
    expect(idaYVuelta({ ...base, cuenta: { modo: "alias" } })).toBe(false);
    expect(idaYVuelta({ ...base, cuenta: { modo: "nada", valor: "x" } })).toBe(false);
    expect(idaYVuelta({ ...base, cuenta: { modo: "nada" } })).toBe(true);
    expect(idaYVuelta({ ...base, transportes: [{ tipo: "radio", direccion: "x" }] })).toBe(false);
  });
});

describe("bytesAFirmar", () => {
  const { firma, ...sin } = base;
  it("no depende del orden de las claves ni incluye la firma", () => {
    const barajada = { transportes: sin.transportes, ofertas: sin.ofertas, emitidaEn: sin.emitidaEn, nonce: sin.nonce, claveEfimera: sin.claveEfimera, cuenta: sin.cuenta, clavePublica: sin.clavePublica, neuronaId: sin.neuronaId, version: sin.version };
    expect(bytesAFirmar(barajada)).toEqual(bytesAFirmar(sin));
    expect(new TextDecoder().decode(bytesAFirmar(sin))).not.toContain(firma);
  });
  it("cambia si cambia cualquier campo", () => {
    expect(bytesAFirmar({ ...sin, ofertas: ["otra"] })).not.toEqual(bytesAFirmar(sin));
  });
});

describe("verificar", () => {
  const ahora = base.emitidaEn + 10_000;
  it("acepta una tarjeta vigente con firma buena", () => {
    expect(verificar(base, ahora, ok, new Set())).toEqual({ ok: true });
  });
  it("rechaza firma mala y verificador que lanza", () => {
    expect(verificar(base, ahora, no, new Set())).toEqual({ ok: false, motivo: "firma" });
    const lanza: VerificadorFirma = () => { throw new Error("x"); };
    expect(verificar(base, ahora, lanza, new Set())).toEqual({ ok: false, motivo: "firma" });
  });
  it("pasa al verificador el mensaje, la firma y la clave pública", () => {
    let visto = "";
    verificar(base, ahora, (m, f, k) => { visto = `${f.length}|${k}|${m.length > 0}`; return true; }, new Set());
    expect(visto).toBe(`128|${base.clavePublica}|true`);
  });
  it("caduca pasados 30 s y no antes", () => {
    expect(verificar(base, base.emitidaEn + VALIDEZ_MS, ok, new Set()).ok).toBe(true);
    expect(verificar(base, base.emitidaEn + VALIDEZ_MS + 1, ok, new Set())).toEqual({ ok: false, motivo: "caducada" });
  });
  it("rechaza tarjetas del futuro con 2 s de tolerancia", () => {
    expect(verificar(base, base.emitidaEn - 2_000, ok, new Set()).ok).toBe(true);
    expect(verificar(base, base.emitidaEn - 2_001, ok, new Set())).toEqual({ ok: false, motivo: "futura" });
  });
  it("rechaza un nonce ya visto", () => {
    expect(verificar(base, ahora, ok, new Set([base.nonce]))).toEqual({ ok: false, motivo: "repetida" });
  });
  it("rechaza forma inválida antes de mirar la firma", () => {
    expect(verificar({ ...base, firma: "x" }, ahora, ok, new Set())).toEqual({ ok: false, motivo: "formato" });
  });
});
