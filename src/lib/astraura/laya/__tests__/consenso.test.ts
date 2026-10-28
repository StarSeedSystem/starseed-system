import { describe, it, expect } from "vitest";
import { consensuar } from "../consenso";

describe("consensuar", () => {
  it("acepta cuando ambos coinciden", () => {
    const pequeño = { respuesta: "a", confianza: 0.9, motor: "needle" };
    const laya = { respuesta: "a", answer_confidence: 0.95 };
    const resultado = consensuar(pequeño, laya, 0.8);
    expect(resultado.quien).toBe("ambos");
    expect(resultado.accion).toBe("aceptar");
  });

  it("acepta a Laya si no coinciden y Laya tiene alta confianza", () => {
    const pequeño = { respuesta: "a", confianza: 0.5, motor: "needle" };
    const laya = { respuesta: "b", answer_confidence: 0.9 };
    const resultado = consensuar(pequeño, laya, 0.8);
    expect(resultado.quien).toBe("laya");
    expect(resultado.accion).toBe("aceptar");
  });

  it("acepta a pequeño si Laya no llega a tiempo o baja confianza, y pequeño tiene alta confianza", () => {
    const pequeño = { respuesta: "a", confianza: 0.9, motor: "needle" };
    const laya = null;
    const resultado = consensuar(pequeño, laya, 0.8);
    expect(resultado.quien).toBe("pequeño");
    expect(resultado.accion).toBe("aceptar");
  });

  it("escala si ninguno tiene alta confianza", () => {
    const pequeño = { respuesta: "a", confianza: 0.5, motor: "needle" };
    const laya = { respuesta: "b", answer_confidence: 0.6 };
    const resultado = consensuar(pequeño, laya, 0.8);
    expect(resultado.accion).toBe("escalar");
  });
});
