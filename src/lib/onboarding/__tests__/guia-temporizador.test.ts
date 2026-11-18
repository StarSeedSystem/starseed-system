/**
 * IMG-agentes-reimaginada-profunda-corregir-te-d1 (parte 1) — temporizador de
 * apertura automática de la guía. Funciones puras: decidir si la guía puede
 * abrirse sola exige que el aparato lleve un respiro sin interacción, y qué
 * eventos cuentan como «la persona está usando el aparato». Sin red, sin
 * disco, sin window.
 */
import { describe, expect, it } from "vitest";
import {
  EVENTOS_INTERACCION,
  RESPIRO_APERTURA_MS,
  esEventoInteraccion,
  puedeAbrirGuiaSola,
} from "../guia-temporizador";

describe("puedeAbrirGuiaSola", () => {
  it("con el respiro completo sin interacción, la guía puede abrirse sola", () => {
    const ahora = 10_000;
    expect(puedeAbrirGuiaSola(ahora - RESPIRO_APERTURA_MS, ahora, RESPIRO_APERTURA_MS)).toBe(true);
  });

  it("con interacción reciente NO se abre sola: no interrumpe la navegación", () => {
    const ahora = 10_000;
    expect(puedeAbrirGuiaSola(ahora - 100, ahora, RESPIRO_APERTURA_MS)).toBe(false);
  });

  it("justo en el límite del respiro ya se considera quieta la máquina", () => {
    const ahora = 10_000;
    expect(puedeAbrirGuiaSola(ahora - RESPIRO_APERTURA_MS, ahora, RESPIRO_APERTURA_MS)).toBe(true);
    expect(puedeAbrirGuiaSola(ahora - RESPIRO_APERTURA_MS + 1, ahora, RESPIRO_APERTURA_MS)).toBe(false);
  });

  it("sin señal de interacción (0/null) mantiene el comportamiento de siempre: abrir", () => {
    expect(puedeAbrirGuiaSola(0, 10_000, RESPIRO_APERTURA_MS)).toBe(true);
    expect(puedeAbrirGuiaSola(null, 10_000, RESPIRO_APERTURA_MS)).toBe(true);
  });

  it("un umbral inválido nunca da luz verde", () => {
    expect(puedeAbrirGuiaSola(0, 10_000, -1)).toBe(false);
    expect(puedeAbrirGuiaSola(0, 10_000, Number.NaN)).toBe(false);
  });
});

describe("esEventoInteraccion", () => {
  it("los eventos del catálogo cuentan como interacción", () => {
    for (const tipo of EVENTOS_INTERACCION) {
      expect(esEventoInteraccion(tipo)).toBe(true);
    }
  });

  it("eventos ajenos no cuentan (ni resetean el temporizador)", () => {
    expect(esEventoInteraccion("animationstart")).toBe(false);
    expect(esEventoInteraccion("")).toBe(false);
  });

  it("el catálogo incluye las señales del enunciado: clic, tecla, rueda, toque, ratón y desplazamiento", () => {
    expect(EVENTOS_INTERACCION).toContain("pointerdown");
    expect(EVENTOS_INTERACCION).toContain("keydown");
    expect(EVENTOS_INTERACCION).toContain("wheel");
    expect(EVENTOS_INTERACCION).toContain("touchstart");
    expect(EVENTOS_INTERACCION).toContain("mousemove");
    expect(EVENTOS_INTERACCION).toContain("scroll");
  });

  it("el respiro es el mismo de 900 ms que ya usaba la guía", () => {
    expect(RESPIRO_APERTURA_MS).toBe(900);
  });
});
