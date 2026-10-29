// Tests del consenso con los modelos de 1,58 bits (tarea C, Ola 1018L). Solo funciones puras:
// respuestas de Laya de ejemplo con la forma real del contrato (choice/noul, probabilities,
// answer_confidence calibrada), sin red, sin disco y sin cargar modelos.
import { describe, it, expect } from "vitest";
import {
  consensuar, mismaRespuesta, umbralConsenso,
  type EntradaConsenso, type LayaConsenso, type PequenoConsenso,
} from "../consenso";

/** Respuesta de Laya al noul «¿esta opción es la correcta?» con las probabilidades calibradas del §1. */
const laya = (respuesta: string, answer_confidence: number): LayaConsenso =>
  ({ respuesta, answer_confidence, probabilities: [answer_confidence, 1 - answer_confidence] });

const pequeno = (respuesta: string, confianza?: number, motor = "bitnet-b1.58"): PequenoConsenso =>
  ({ respuesta, confianza, motor });

const entrada = (cambios: Partial<EntradaConsenso>): EntradaConsenso =>
  ({ pequeno: pequeno("herramienta-de-archivo", 0.8), laya: laya("herramienta-de-archivo", 0.9), ...cambios });

describe("umbral y coincidencia", () => {
  it("usa el umbral del punto «basico.consenso» del catálogo", () => {
    expect(umbralConsenso()).toBe(0.6);
  });

  it("la coincidencia no distingue mayúsculas ni espacios sobrantes", () => {
    expect(mismaRespuesta("Publicar ahora", "  publicar ahora ")).toBe(true);
    expect(mismaRespuesta("publicar", "revisar")).toBe(false);
    expect(mismaRespuesta("", "")).toBe(true);
  });

  it("una respuesta vacía de Laya no decide: se escala por falta de contenido", () => {
    const r = consensuar(entrada({ pequeno: pequeno("publicar", 0.8), laya: laya("", 0.9) }));
    expect(r).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" });
    expect(r.motivo).toContain("sin respuesta utilizable");
  });
});

describe("rama 1 · coinciden → aceptar (ambos)", () => {
  it("con la misma respuesta acepta aunque las confianzas sean bajas: el acuerdo manda", () => {
    const r = consensuar(entrada({ pequeno: pequeno("publicar", 0.3), laya: laya("Publicar", 0.4) }));
    expect(r).toEqual({ decision: "publicar", quien: "ambos", accion: "aceptar",
      motivo: expect.stringContaining("misma respuesta") });
  });

  it("acepta una respuesta en mayúsculas o con espacios sobrantes como coincidente", () => {
    const r = consensuar(entrada({ pequeno: pequeno("  Publicar ahora "), laya: laya("publicar ahora", 0.5) }));
    expect(r.quien).toBe("ambos");
  });
});

describe("rama 2 · no coinciden y Laya es decisiva → manda Laya", () => {
  it("manda la respuesta de Laya cuando su answer_confidence calibrada llega al umbral", () => {
    const r = consensuar(entrada({ pequeno: pequeno("revisar", 0.9), laya: laya("publicar", 0.84) }));
    expect(r).toEqual({ decision: "publicar", quien: "laya", accion: "aceptar",
      motivo: expect.stringContaining("answer_confidence calibrada") });
  });

  it("el umbral es inclusivo: exactamente el valor del umbral también manda Laya", () => {
    const r = consensuar(entrada({ pequeno: pequeno("revisar"), laya: laya("publicar", 0.6) }));
    expect(r).toMatchObject({ quien: "laya", accion: "aceptar" });
  });

  it("respeta un umbral propio cuando se pasa en la llamada", () => {
    const r = consensuar(entrada({ pequeno: pequeno("publicar"), laya: laya("revisar", 0.7), umbral: 0.9 }));
    expect(r).toMatchObject({ quien: "ninguno", accion: "escalar" });
  });

  it("la confianza del pequeño no manda: la calibrada de Laya decide", () => {
    const r = consensuar(entrada({ pequeno: pequeno("publicar", 0.99), laya: laya("revisar", 0.95) }));
    expect(r.decision).toBe("revisar");
  });
});

describe("rama 3 · Laya no llegó → lo pequeño solo con confianza al umbral", () => {
  it("acepta lo pequeño si Laya no llegó a tiempo y la confianza del pequeño alcanza el umbral", () => {
    const r = consensuar(entrada({ laya: null, pequeno: pequeno("noul-sí", 0.75, "needle-3") }));
    expect(r).toMatchObject({ decision: "noul-sí", quien: "pequeno", accion: "aceptar" });
    expect(r.motivo).toContain("Laya no llegó a tiempo");
  });

  it("el límite del umbral también vale para lo pequeño: exactamente 0,6 acepta", () => {
    const r = consensuar(entrada({ laya: null, pequeno: pequeno("publicar", 0.6) }));
    expect(r).toMatchObject({ quien: "pequeno", accion: "aceptar" });
  });

  it("sin Laya y sin confianza del pequeño no hay quien decida: se escala", () => {
    const r = consensuar(entrada({ laya: null, pequeno: pequeno("publicar") }));
    expect(r).toEqual({ decision: null, quien: "ninguno", accion: "escalar",
      motivo: expect.stringContaining("no llegó") });
  });
});

describe("rama 4 · nada manda → escalar (ninguno)", () => {
  it("con criterios distintos y Laya dudosa (como pasa en español, §2) se escala", () => {
    const r = consensuar(entrada({ pequeno: pequeno("publicar", 0.9), laya: laya("revisar", 0.45) }));
    expect(r).toEqual({ decision: null, quien: "ninguno", accion: "escalar",
      motivo: expect.stringContaining("Laya duda (0.45 < 0.60)") });
  });

  it("si Laya llegó con respuesta pero sin answer_confidence se escala, y no manda la duda", () => {
    const r = consensuar(entrada({ pequeno: pequeno("publicar"),
      laya: { respuesta: "revisar" } as unknown as LayaConsenso }));
    expect(r).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" });
    expect(r.motivo).toContain("no dio answer_confidence");
  });

  it("el pequeño sin respuesta admite decidir: se escala la dudosa de Laya", () => {
    const r = consensuar(entrada({ pequeno: pequeno("", 0.9), laya: laya("revisar", 0.61) }));
    expect(r).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" });
    expect(r.motivo).toContain("respondió vacío");
  });
});

