/**
 * `snapXToNearestEdge` (aurora-orb-bus.ts) — lógica pura de "pegar al borde
 * lateral más cercano" que usa el orbe de Aurora en móvil (<640px): al soltar
 * un arrastre, o al pintar una posición guardada que no está en un borde, la
 * X se pega al mínimo (0.04, izquierda) o al máximo (0.96, derecha) según de
 * qué lado del centro de la pantalla esté.
 */

import { describe, expect, it } from "vitest";
import { snapXToNearestEdge } from "@/lib/aurora/aurora-orb-bus";

describe("snapXToNearestEdge", () => {
  it("pega al borde IZQUIERDO (0.04) cualquier X de la mitad izquierda", () => {
    expect(snapXToNearestEdge(0)).toBe(0.04);
    expect(snapXToNearestEdge(0.04)).toBe(0.04);
    expect(snapXToNearestEdge(0.2)).toBe(0.04);
    expect(snapXToNearestEdge(0.49)).toBe(0.04);
  });

  it("pega al borde DERECHO (0.96) cualquier X de la mitad derecha (incluido el centro exacto)", () => {
    expect(snapXToNearestEdge(0.5)).toBe(0.96);
    expect(snapXToNearestEdge(0.51)).toBe(0.96);
    expect(snapXToNearestEdge(0.8)).toBe(0.96);
    expect(snapXToNearestEdge(0.96)).toBe(0.96);
    expect(snapXToNearestEdge(1)).toBe(0.96);
  });

  it("es idempotente sobre un valor ya pegado a un borde", () => {
    expect(snapXToNearestEdge(snapXToNearestEdge(0.3))).toBe(0.04);
    expect(snapXToNearestEdge(snapXToNearestEdge(0.7))).toBe(0.96);
  });
});
