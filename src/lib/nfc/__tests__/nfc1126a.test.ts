import { describe, it, expect } from "vitest";
import { ACCIONES, MAX_BYTES_TARJETA, RELACIONES, VALIDEZ_MS, type Relacion, type TarjetaNeurona } from "../tipos";
import { bytesAFirmar, codificar, decodificar, verificar } from "../tarjeta";
import { decidir } from "../decidir";
import { ignorar, preferenciasPorDefecto, recordar } from "../preferencias";

const h = (c: string, n: number) => c.repeat(n);
const AHORA = 1_000_000;
// Verificador de prueba: la «firma» válida es la que lleva la clave pública repetida.
const verificador = (_m: Uint8Array, firma: string, clave: string) => firma === clave + clave;
const tarjeta = (o: Partial<TarjetaNeurona> = {}): TarjetaNeurona => ({
  version: 1, neuronaId: "ajena", clavePublica: h("a", 64), cuenta: { modo: "alias", valor: "luna" },
  claveEfimera: h("b", 64), nonce: h("c", 32), emitidaEn: AHORA, ofertas: ["pagina"],
  transportes: [{ tipo: "ble", direccion: "x" }], firma: h("a", 128), ...o,
});
const propia = tarjeta({ neuronaId: "propia", clavePublica: h("e", 64), firma: h("e", 128) });

describe("tipos · punto de entrada", () => {
  it("expone el catálogo de acciones y las seis relaciones", () => {
    expect(ACCIONES).toHaveLength(16);
    expect([...RELACIONES]).toEqual(["misma_cuenta", "cuenta_reconocida", "cuenta_nueva", "nodo_propio", "nodo_publico", "etiqueta"]);
    expect(VALIDEZ_MS).toBe(30_000);
    expect(MAX_BYTES_TARJETA).toBe(1024);
  });
});

describe("flujo completo: codificar → decodificar → verificar → decidir", () => {
  it("una tarjeta válida llega intacta y produce una decisión", () => {
    const c = codificar(tarjeta());
    if (!c.ok) throw new Error(c.motivo);
    const d = decodificar(c.bytes);
    if (!d.ok) throw new Error(d.motivo);
    expect(d.tarjeta).toEqual(tarjeta());
    expect(verificar(d.tarjeta, AHORA + 1_000, verificador, new Set())).toEqual({ ok: true });
    const dec = decidir({ propia, ajena: d.tarjeta, relacion: "cuenta_nueva", prefs: preferenciasPorDefecto() });
    expect(dec.mostrar).toBe(true);
    expect(dec.automaticas).toEqual([]);
  });
  it("rechaza caducada, futura, repetida y firma falsa", () => {
    const t = tarjeta();
    expect(verificar(t, AHORA + VALIDEZ_MS + 1, verificador, new Set())).toEqual({ ok: false, motivo: "caducada" });
    expect(verificar(t, AHORA - 2_001, verificador, new Set())).toEqual({ ok: false, motivo: "futura" });
    expect(verificar(t, AHORA, verificador, new Set([t.nonce]))).toEqual({ ok: false, motivo: "repetida" });
    expect(verificar(tarjeta({ firma: h("f", 128) }), AHORA, verificador, new Set())).toEqual({ ok: false, motivo: "firma" });
  });
  it("cambiar un campo cambia los bytes que se firman", () => {
    const { firma: _f, ...a } = tarjeta();
    const { firma: _g, ...b } = tarjeta({ neuronaId: "otra" });
    expect(bytesAFirmar(a)).not.toEqual(bytesAFirmar(b));
  });
  it("una tarjeta de más de 1 KB no se codifica", () => {
    const grande = tarjeta({ ofertas: Array.from({ length: 80 }, (_, i) => `oferta-larga-numero-${i}`) });
    expect(codificar(grande).ok).toBe(false);
  });
});

describe("decidir · nunca automático con desconocidas, en todas las relaciones", () => {
  const desconocidas: Relacion[] = ["cuenta_nueva", "nodo_publico", "etiqueta"];
  for (const r of desconocidas) {
    it(`${r}: sin automáticas con preferencias por defecto`, () => {
      expect(decidir({ propia, ajena: tarjeta(), relacion: r, prefs: preferenciasPorDefecto() }).automaticas).toEqual([]);
    });
  }
  it("ignorada no se muestra; recordar la devuelve y pasa a cuenta reconocida", () => {
    const ign = decidir({ propia, ajena: tarjeta(), relacion: "cuenta_nueva", prefs: ignorar(preferenciasPorDefecto(), "ajena") });
    expect(ign.mostrar).toBe(false);
    expect(ign.motivoOculto).toBe("ignorada");
    const rec = decidir({ propia, ajena: tarjeta(), relacion: "cuenta_nueva", prefs: recordar(ignorar(preferenciasPorDefecto(), "ajena"), "ajena") });
    expect(rec.mostrar).toBe(true);
    expect(rec.relacion).toBe("cuenta_reconocida");
  });
  it("sin transporte común no se ofrece enviar archivo", () => {
    const sinCanal = tarjeta({ transportes: [{ tipo: "lan", direccion: "y" }] });
    const d = decidir({ propia, ajena: sinCanal, relacion: "cuenta_reconocida", prefs: preferenciasPorDefecto() });
    expect(d.ofrecidas).not.toContain("enviar_archivo");
    expect(d.noDisponibles).toContain("enviar_archivo");
  });
});
