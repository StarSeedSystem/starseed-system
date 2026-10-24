// Tests del consenso con los modelos de 1,58 bits (tarea C de la Ola 1018L). Solo módulos puros:
// respuestas de Laya de ejemplo con la forma real (choice/score/noul → probabilities y answer_confidence),
// sin red, sin disco y sin cargar modelos.
import { describe, it, expect } from "vitest";
import { consensuar, UMBRAL_CONSENSO, type EntradaConsenso, type RespuestaLayaConsenso, type RespuestaPequeno } from "../consenso";

/** Respuesta del motor pequeño (BitNet/Bonsai/Needle) para las pruebas; la confianza llega explícita. */
const pequeno = (respuesta: string, confianza?: number, motor = "bitnet-b1.58-2b"): RespuestaPequeno =>
  ({ respuesta, confianza, motor });

/** Respuesta de Laya con la forma real de una choice calibrada: probabilities + answer_confidence. */
const laya = (respuesta: string, answer_confidence: number): RespuestaLayaConsenso =>
  ({ respuesta, answer_confidence, probabilities: [answer_confidence, 1 - answer_confidence] });

/** Respuesta de Laya a un noul («¿contiene datos privados?»): la calibrada manda, la cruda `confidence` no cuenta. */
const noul = (respuesta: string, answer_confidence: number): RespuestaLayaConsenso =>
  ({ respuesta, answer_confidence, confidence: 0.99, probabilities: [1 - answer_confidence, answer_confidence] });

const entrada = (cambios: Partial<EntradaConsenso>): EntradaConsenso => ({
  pequeno: pequeno("Mantener el ritmo"), laya: laya("Ajustar el ritmo", 0.92), umbral: 0.6, ...cambios,
});

describe("umbral del catálogo", () => {
  it("por defecto usa el umbral del punto «basico.consenso»", () => {
    expect(UMBRAL_CONSENSO).toBe(0.6);
  });
});

describe("rama 1 · si coinciden, vale", () => {
  it("acepta la respuesta compartida y lo dice", () => {
    const r = consensuar(entrada({ laya: laya("Mantener el ritmo", 0.95) }));
    expect(r).toEqual({
      decision: "Mantener el ritmo", quien: "ambos", accion: "aceptar",
      motivo: "Coincide la respuesta con Laya y bitnet-b1.58-2b: «Mantener el ritmo».",
    });
  });

  it("coincide aunque llegue con mayúsculas o espacios distintos", () => {
    expect(consensuar(entrada({ laya: laya("  mantener  el ritmo ", 0.8) })).quien).toBe("ambos");
  });

  it("dos cadenas vacías no cuentan como coincidencia: nadie decidió", () => {
    const r = consensuar(entrada({ pequeno: pequeno("  ", 0.9), laya: laya("", 0.1) }));
    expect(r.quien).toBe("ninguno");
    expect(r.accion).toBe("escalar");
    expect(r.decision).toBeNull();
  });

  it("coinciden aunque Laya llegue dudosa: la coincidencia vale", () => {
    expect(consensuar(entrada({ laya: laya("Mantener el ritmo", 0.3) })).accion).toBe("aceptar");
  });
});

describe("rama 2 · discrepan y manda Laya solo con answer_confidence ≥ umbral", () => {
  it("manda Laya cuando su confianza calibrada pasa el umbral", () => {
    const r = consensuar(entrada({}));
    expect(r).toEqual({
      decision: "Ajustar el ritmo", quien: "laya", accion: "aceptar",
      motivo: "Discrepan Laya y bitnet-b1.58-2b; manda Laya (answer_confidence 0.92 ≥ 0.60): «Ajustar el ritmo».",
    });
  });

  it("con un umbral más exigente, una Laya que antes mandaba ahora duda y se escala", () => {
    const r = consensuar(entrada({ umbral: 0.95 }));
    expect(r.quien).toBe("ninguno");
    expect(r.decision).toBeNull();
    expect(r.motivo).toContain("Laya duda (answer_confidence 0.92 < 0.95)");
  });

  it("un noul de Laya calibrado bajo el umbral (como pasa en español) se escala", () => {
    const r = consensuar(entrada({ laya: noul("no", 0.45) }));
    expect(r.motivo).toContain("Laya duda (answer_confidence 0.45 < 0.60)");
  });

  it("sin calibrada, el noul de Laya no decide: la regla determinista mide al pequeño", () => {
    const r = consensuar(entrada({ laya: { respuesta: "no", confidence: 0.99 } }));
    expect(r.quien).toBe("pequeno");
    expect(r.motivo).toContain("Laya llegó sin answer_confidence calibrada");
  });
});

describe("rama 3 · Laya no llegó y la regla determinista mide al pequeño", () => {
  it("acepta la respuesta pequeña si su confianza pasa el umbral", () => {
    const r = consensuar(entrada({ laya: null }));
    expect(r).toEqual({
      decision: "Mantener el ritmo", quien: "pequeno", accion: "aceptar",
      motivo: "Laya no llegó a tiempo; la regla determinista acepta a bitnet-b1.58-2b (confianza 0.90 ≥ 0.60): «Mantener el ritmo».",
    });
  });

  it("con la calibrada ausente de Laya, el pequeño puede decidir (no llegó útil)", () => {
    const r = consensuar(entrada({ laya: {} as unknown as RespuestaLayaConsenso }));
    expect(r.quien).toBe("pequeno");
  });
});

describe("rama 4 · nadie lo afirma con seguridad: se escala", () => {
  it("sube la pregunta si Laya no llegó y el pequeño no dio confianza", () => {
    const r = consensuar(entrada({ laya: null, pequeno: pequeno("Mantener el ritmo") }));
    expect(r).toEqual({
      decision: null, quien: "ninguno", accion: "escalar",
      motivo: "Laya no llegó a tiempo y bitnet-b1.58-2b no dio confianza: se escala («basico.consenso»).",
    });
  });

  it("sube la pregunta si Laya no llegó y la confianza del pequeño queda baja", () => {
    const r = consensuar(entrada({ laya: null, pequeno: pequeno("Mantener el ritmo", 0.3) }));
    expect(r.decision).toBeNull();
    expect(r.motivo).toContain("queda baja (0.30 < 0.60)");
  });

  it("la desconfianza del motor pequeño pesa contra su sí (BitNet 1.58 aplasta la confianza)", () => {
    expect(consensuar(entrada({ laya: null, pequeno: pequeno("Mantener el ritmo", 0.59) })).accion).toBe("escalar");
  });
});
