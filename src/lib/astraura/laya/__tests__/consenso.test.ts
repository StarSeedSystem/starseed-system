// Pruebas del consenso Laya / pequeño (tarea C, Ola 1018L · LYS1018C).
// Solo funciones puras exportadas; sin red ni modelos cargados; respuestas de ejemplo con forma real.
import { describe, it, expect } from "vitest";
import { consensuar, type EntradaConsenso, type ResultadoConsenso } from "../consenso";

const umbral = 0.7;

const pequeno = (respuesta: string, confianza?: number, motor = "needle") => ({ respuesta, confianza, motor });

const laya = (respuesta: string, answer_confidence: number) => ({ respuesta, answer_confidence });

describe("consensuar · cuatro ramas del contrato", () => {
  it("rama 1: coinciden → aceptar por ambos", () => {
    const r = consensuar({
      pequeno: pequeno("sí"),
      laya: laya("sí", 0.85),
      umbral,
    } as EntradaConsenso);
    expect(r).toMatchObject({ decision: "sí", quien: "ambos", accion: "aceptar" } as Partial<ResultadoConsenso>);
    expect(r.motivo).toContain("Coinciden");
  });

  it("rama 2: no coinciden, Laya llega con confianza ≥ umbral → acepta Laya", () => {
    const r = consensuar({
      pequeno: pequeno("no", 0.9),
      laya: laya("sí", 0.82),
      umbral,
    } as EntradaConsenso);
    expect(r).toMatchObject({ decision: "sí", quien: "laya", accion: "aceptar" } as Partial<ResultadoConsenso>);
    expect(r.motivo).toContain("Laya manda");
  });

  it("rama 3: Laya no llega a tiempo, pequeño con confianza ≥ umbral → acepta pequeño", () => {
    const r = consensuar({
      pequeno: pequeno("sí", 0.75),
      laya: null,
      umbral,
    } as EntradaConsenso);
    expect(r).toMatchObject({ decision: "sí", quien: "pequeno", accion: "aceptar" } as Partial<ResultadoConsenso>);
    expect(r.motivo).toContain("pequeño");
  });

  it("rama 4: Laya no llega y pequeño con confianza baja → escala, nadie decide", () => {
    const r = consensuar({
      pequeno: pequeno("quizás", 0.3),
      laya: null,
      umbral,
    } as EntradaConsenso);
    expect(r).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" } as Partial<ResultadoConsenso>);
    expect(r.motivo).toContain("Ninguno");
  });

  it("Laya llega pero con confianza baja y pequeño también baja: escala, nadie decide", () => {
    const r = consensuar({
      pequeno: pequeno("sí", 0.65),
      laya: laya("no", 0.55),
      umbral,
    } as EntradaConsenso);
    expect(r).toMatchObject({ decision: null, quien: "ninguno", accion: "escalar" } as Partial<ResultadoConsenso>);
    expect(r.motivo).toContain("dudó");
  });

  it("usa answer_confidence calibrada, no confidence genérica", () => {
    const r = consensuar({
      pequeno: pequeno("a"),
      laya: { respuesta: "b", answer_confidence: 0.95 },
      umbral: 0.9,
    } as EntradaConsenso);
    expect(r.quien).toBe("laya");
  });
});
