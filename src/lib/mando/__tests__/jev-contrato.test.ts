import { describe, it, expect } from "vitest";
import { validarPeticion, normalizarPreguntas, formatearRespuesta, decidirAcceso } from "../jev-contrato";

describe("jev-contrato puro", () => {
  it("cuerpo valido pasa", () => {
    const r = validarPeticion({ state: "x", questions: [{ id: "q1", type: "noul", question: "¿sí?" }] });
    expect(r.ok).toBe(true);
  });
  it("falta questions -> error", () => {
    expect(validarPeticion({ state: "x" }).ok).toBe(false);
  });
  it("type desconocido -> error", () => {
    expect(validarPeticion({ state: "x", questions: [{ id: "q", type: "otro", question: "?" }] }).ok).toBe(false);
  });
  it("state > 8000 -> error", () => {
    expect(validarPeticion({ state: "a".repeat(8001), questions: [{ id: "q", type: "noul", question: "?" }] }).ok).toBe(false);
  });
  it("formatearRespuesta normaliza probs a suma 1", () => {
    const res = formatearRespuesta({ answers: [{ id: "a", answer: "A", probs: { A: 2, B: 3 }, confidence: 0.9 }] });
    expect(res.answers[0].probs.A + res.answers[0].probs.B).toBeCloseTo(1, 4);
  });
  it("formatearRespuesta dice el medio que de verdad contestó", () => {
    const una = { id: "a", answer: "sí", probs: { "sí": 0.8, no: 0.2 }, confidence: 0.8 };
    expect(formatearRespuesta({ answers: [una], medio: "openrouter" }, "local").medio).toBe("openrouter");
    expect(formatearRespuesta({ answers: [una] }, "local").medio).toBe("local");
    expect(formatearRespuesta({ answers: [], medio: null }, "local").medio).toBe("ninguno");
  });
  it("decidirAcceso: sin token env", () => {
    expect(decidirAcceso(undefined, "x")).toBe("sin-token");
    expect(decidirAcceso("", "x")).toBe("sin-token");
  });
  it("decidirAcceso: cabecera ausente", () => {
    expect(decidirAcceso("t", undefined)).toBe("no-autorizado");
    expect(decidirAcceso("t", "")).toBe("no-autorizado");
  });
  it("decidirAcceso: cabecera correcta", () => {
    expect(decidirAcceso("t", "t")).toBe("ok");
  });
  it("decidirAcceso: cabecera incorrecta", () => {
    expect(decidirAcceso("t", "mal")).toBe("no-autorizado");
  });
  it("decidirAcceso: sin variable, ausente, correcta (una prueba)", () => {
    expect(decidirAcceso(undefined, "t")).toBe("sin-token");
    expect(decidirAcceso("t", undefined)).toBe("no-autorizado");
    expect(decidirAcceso("t", "t")).toBe("ok");
  });
});
