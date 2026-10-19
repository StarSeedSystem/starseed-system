import { describe, expect, it } from "vitest";
import { puntosDeDecision, validarPuntos } from "../puntos-decision";

describe("puntos-decision", () => {
  it("should validate the points", () => {
    expect(validarPuntos(puntosDeDecision)).toBe(true);
  });

  it("should have unique ids", () => {
    const ids = puntosDeDecision.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have umbral in range [0,1] if defined", () => {
    for (const punto of puntosDeDecision) {
      if (punto.umbral !== undefined) {
        expect(punto.umbral).toBeGreaterThanOrEqual(0);
        expect(punto.umbral).toBeLessThanOrEqual(1);
      }
    }
  });

  it("should have criteria for choice questions", () => {
    for (const punto of puntosDeDecision) {
      for (const [key, pregunta] of Object.entries(punto.preguntas)) {
        if (pregunta.type === 'choice') {
          expect(pregunta.criteria).toBeDefined();
          expect(Object.keys(pregunta.criteria).length).toBeGreaterThan(0);
        }
      }
    }
  });
});
