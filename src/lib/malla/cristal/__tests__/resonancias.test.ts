import { describe, it, expect } from "vitest";
import {
  actualizarConfianza,
  CONFIANZA_INICIAL,
  Nivel,
  VeredictoCompartido,
  decisionPorResonancia
} from "../resonancias";

describe("resonancias (módulo puro)", () => {
  describe("actualizarConfianza", () => {
    it.each([
      ['firma-ok', 0.02],
      ['firma-mala', -0.3],
      ['trama-corrupta', -0.15],
      ['veredicto-confirmado', 0.05],
      ['veredicto-desmentido', -0.2]
    ])("incremento %s", (e, inc) => {
      const c = CONFIANZA_INICIAL;
      const r = actualizarConfianza(c, e);
      const exp = Math.max(0, Math.min(1, c + inc));
      expect(r).toBeCloseTo(exp, 10);
    });

    it("recorta a [0,1]", () => {
      expect(actualizarConfianza(0, 'firma-mala')).toBe(0);
      expect(actualizarConfianza(1, 'firma-ok')).toBeCloseTo(1, 10);
    });

    it("parte de 0.5", () => {
      expect(CONFIANZA_INICIAL).toBe(0.5);
    });
  });

  describe("decisionPorResonancia", () => {
    const ahora = Date.now();
    const u = 0.4;
    const cb = { n1: 0.5, n2: 0.5, n3: 0.5 };
    const v = (c: string, n: string, l: Nivel, f = true, t = ahora) => ({
      hash: "h", nivel: l, nodo: n, cuenta: c, firmaOk: f, t
    });

    it("sin datos válidos -> sin-datos", () => {
      const r = decisionPorResonancia("h", [], cb, u);
      expect(r.decision).toBe("sin-datos");
      expect(r.cuentas).toBe(0);
    });

    it("ignora firmaOk = false", () => {
      const vs = [v("c1", "n1", Nivel.PELIGROSO, false)];
      const r = decisionPorResonancia("h", vs, cb, u);
      expect(r.decision).toBe("sin-datos");
    });

    it("ignora confianza < umbral", () => {
      const vs = [v("c1", "n1", Nivel.PELIGROSO, true)];
      const cbBaja = { n1: 0.3 };
      const r = decisionPorResonancia("h", vs, cbBaja, u);
      expect(r.decision).toBe("sin-datos");
    });

    it("usa el más reciente por cuenta", () => {
      const vs = [
        v("c1", "n1", Nivel.LIMPIO, true, ahora-1000),
        v("c1", "n1", Nivel.PELIGROSO, true, ahora)
      ];
      const r = decisionPorResonancia("h", vs, cb, u);
      expect(r.decision).toBe("aviso");
      expect(r.cuentas).toBe(1);
    });

    it.each([
      [["c1:n1:NPE","c2:n2:NPE"], "cuarentena", 2],
      [["c1:n1:NPE"], "aviso", 1],
      [["c1:n1:NSO","c2:n2:NSO"], "aviso", 2],
      [["c1:n1:LIM","c2:n2:LIM"], "limpio", 2],
      [["c1:n1:LIM"], "sin-datos", 1],
      [["c1:n1:NSO"], "sin-datos", 1],
      [["c1:n1:LIM","c2:n2:NSO"], "sin-datos", 2]
    ])("decide correctamente", (cases, expDec, expCtas) => {
      const vs = cases.map(s => {
        const [c, n, l] = s.split(':');
        return v(c, n, l === "NPE" ? Nivel.PELIGROSO : l === "NSO" ? Nivel.SOSPECHOSO : Nivel.LIMPIO);
      });
      const r = decisionPorResonancia("h", vs, cb, u);
      expect(r.decision).toBe(expDec);
      expect(r.cuentas).toBe(expCtas);
    });

    it("una cuenta múltiple nodos no da cuarentena", () => {
      const vs = [
        v("c1", "n1", Nivel.PELIGROSO, true),
        v("c1", "n2", Nivel.PELIGROSO, true),
        v("c1", "n3", Nivel.PELIGROSO, true)
      ];
      const r = decisionPorResonancia("h", vs, cb, u);
      expect(r.decision).toBe("aviso");
      expect(r.cuentas).toBe(1);
    });

    it("usa umbral por defecto", () => {
      const vs = [v("c1", "n1", Nivel.PELIGROSO)];
      const r = decisionPorResonancia("h", vs, {n1:0.4});
      expect(r.decision).toBe("aviso");
    });
  });
});