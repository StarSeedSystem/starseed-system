/**
 * El temporizador de calma de la guía (IMG-agentes, 2026-11-16).
 * La guía no debe abrirse encima de quien navega: `esperaHastaDisparo` dice
 * cuánto falta para poder disparar según la última interacción del usuario.
 */
import { describe, it, expect } from "vitest";
import { EVENTOS_INTERACCION, esperaHastaDisparo } from "../use-timeout-interaction";

describe("esperaHastaDisparo · temporizador de calma", () => {
  it("sin interacción previa espera el retardo entero", () => {
    expect(esperaHastaDisparo(null, 1_000, 900)).toBe(900);
  });

  it("una interacción reciente aplaza el disparo lo que falte", () => {
    expect(esperaHastaDisparo(1_000, 1_000, 900)).toBe(900);
    expect(esperaHastaDisparo(1_000, 1_300, 900)).toBe(600);
  });

  it("justo al cumplirse el retardo, dispara (0)", () => {
    expect(esperaHastaDisparo(1_000, 1_900, 900)).toBe(0);
  });

  it("pasado el retardo nunca devuelve un valor negativo", () => {
    expect(esperaHastaDisparo(1_000, 5_000, 900)).toBe(0);
  });

  it("los gestos que reinician el temporizador son los de navegación", () => {
    expect(EVENTOS_INTERACCION).toContain("scroll");
    expect(EVENTOS_INTERACCION).toContain("pointerdown");
    expect(EVENTOS_INTERACCION).toContain("mousemove");
    expect(EVENTOS_INTERACCION).toContain("keydown");
  });
});
