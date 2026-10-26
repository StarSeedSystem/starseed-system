import { describe, it, expect } from "vitest";
import { consensuar } from "../consenso";

describe("consenso", () => {
  it("acepta cuando coinciden ambas respuestas", () => {
    const resultado = consensuar({
      pequeno: { respuesta: "sí", confianza: 0.7, motor: "bitnet" },
      laya: { respuesta: "sí", answer_confidence: 0.8 },
      umbral: 0.6,
    });

    expect(resultado.accion).toBe("aceptar");
    expect(resultado.quien).toBe("ambos");
    expect(resultado.decision).toBe("sí");
    expect(resultado.motivo).toContain("Coinciden");
  });

  it("acepta Laya cuando difieren y su confianza supera umbral", () => {
    const resultado = consensuar({
      pequeno: { respuesta: "no", confianza: 0.7, motor: "bonsai" },
      laya: { respuesta: "sí", answer_confidence: 0.85 },
      umbral: 0.7,
    });

    expect(resultado.accion).toBe("aceptar");
    expect(resultado.quien).toBe("laya");
    expect(resultado.decision).toBe("sí");
    expect(resultado.motivo).toContain("Laya decide");
  });

  it("escala cuando Laya difiere y su confianza no alcanza umbral", () => {
    const resultado = consensuar({
      pequeno: { respuesta: "no", confianza: 0.7, motor: "needle" },
      laya: { respuesta: "sí", answer_confidence: 0.5 },
      umbral: 0.7,
    });

    expect(resultado.accion).toBe("escalar");
    expect(resultado.quien).toBe("ninguno");
    expect(resultado.decision).toBeNull();
    expect(resultado.motivo).toContain("Laya duda");
  });

  it("acepta modelo pequeño cuando Laya no llega y su confianza supera umbral", () => {
    const resultado = consensuar({
      pequeno: { respuesta: "tal vez", confianza: 0.75, motor: "bitnet" },
      laya: null,
      umbral: 0.7,
    });

    expect(resultado.accion).toBe("aceptar");
    expect(resultado.quien).toBe("pequeno");
    expect(resultado.decision).toBe("tal vez");
    expect(resultado.motivo).toContain("Modelo pequeño decide");
  });

  it("escala cuando Laya no llega y modelo pequeño carece de confianza", () => {
    const resultado = consensuar({
      pequeno: { respuesta: "no sé", confianza: 0.4, motor: "bonsai" },
      laya: null,
      umbral: 0.7,
    });

    expect(resultado.accion).toBe("escalar");
    expect(resultado.quien).toBe("ninguno");
    expect(resultado.decision).toBeNull();
    expect(resultado.motivo).toContain("sin confianza suficiente");
  });
});
