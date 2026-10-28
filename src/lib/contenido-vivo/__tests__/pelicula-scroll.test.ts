import { describe, expect, it } from "vitest";
import {
  acotar,
  cuadroApagado,
  cuadroDeFraccion,
  encaje,
  fraccionDeScroll,
  fraccionDeSeccion,
  resumenJank,
} from "../pelicula-scroll-puro";

describe("fracción de la película", () => {
  it("recorre la sección de 0 a 1 y no se sale", () => {
    expect(fraccionDeScroll(0, 0, 1000)).toBe(0);
    expect(fraccionDeScroll(500, 0, 1000)).toBe(0.5);
    expect(fraccionDeScroll(1000, 0, 1000)).toBe(1);
    expect(fraccionDeScroll(2000, 0, 1000)).toBe(1);
    expect(fraccionDeScroll(-100, 0, 1000)).toBe(0);
  });

  it("admite un inicio desplazado y una sección sin alto útil", () => {
    expect(fraccionDeScroll(1500, 1000, 1000)).toBe(0.5);
    expect(fraccionDeScroll(500, 0, 0)).toBe(0);
    expect(fraccionDeScroll(500, 0, Number.NaN)).toBe(0);
  });

  it("lee el rectángulo de la sección contra la ventana", () => {
    expect(fraccionDeSeccion({ top: 0, height: 2000 }, 1000)).toBe(0);
    expect(fraccionDeSeccion({ top: -500, height: 2000 }, 1000)).toBe(0.5);
    expect(fraccionDeSeccion({ top: -1500, height: 2000 }, 1000)).toBe(1);
  });

  it("acota cualquier entrada al rango pedido", () => {
    expect(acotar(Number.POSITIVE_INFINITY)).toBe(0);
    expect(acotar(-2)).toBe(0);
    expect(acotar(2)).toBe(1);
    expect(acotar(0.4, 0, 2)).toBe(0.4);
  });
});

describe("fundido de fotogramas", () => {
  it("reparte la fracción entre el actual y el siguiente", () => {
    expect(cuadroDeFraccion(0, 5)).toEqual({ actual: 0, siguiente: 1, mezcla: 0 });
    expect(cuadroDeFraccion(0.25, 5)).toEqual({ actual: 1, siguiente: 2, mezcla: 0 });
    expect(cuadroDeFraccion(1, 5)).toEqual({ actual: 4, siguiente: 4, mezcla: 0 });
  });

  it("la mezcla es la parte fraccionaria del recorrido", () => {
    const cuadro = cuadroDeFraccion(0.3, 5);
    expect(cuadro.actual).toBe(1);
    expect(cuadro.siguiente).toBe(2);
    expect(cuadro.mezcla).toBeCloseTo(0.2, 9);
  });

  it("sin fundido no mezcla y los extremos no se salen del total", () => {
    expect(cuadroDeFraccion(0.3, 5, false)).toEqual({ actual: 1, siguiente: 2, mezcla: 0 });
    const casiFinal = cuadroDeFraccion(0.999, 2);
    expect(casiFinal.actual).toBe(0);
    expect(casiFinal.siguiente).toBe(1);
    expect(casiFinal.mezcla).toBeCloseTo(0.999, 9);
    expect(cuadroDeFraccion(2, 5).actual).toBe(4);
    expect(cuadroDeFraccion(0.5, 1)).toEqual({ actual: 0, siguiente: 0, mezcla: 0 });
    expect(cuadroDeFraccion(0.5, 0)).toEqual({ actual: 0, siguiente: 0, mezcla: 0 });
  });
});

describe("modo apagado o movimiento reducido", () => {
  it("se queda el último fotograma sin fundido", () => {
    expect(cuadroApagado(8)).toEqual({ actual: 7, siguiente: 7, mezcla: 0 });
    expect(cuadroApagado(1)).toEqual({ actual: 0, siguiente: 0, mezcla: 0 });
    expect(cuadroApagado(0)).toEqual({ actual: 0, siguiente: 0, mezcla: 0 });
  });
});

describe("encaje de la imagen en el lienzo", () => {
  it("cubre o contiene sin deformar y siempre centrado", () => {
    expect(encaje(100, 100, 200, 100, true)).toEqual({ x: 0, y: -50, w: 200, h: 200 });
    expect(encaje(100, 100, 200, 100, false)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(encaje(0, 0, 200, 100, true)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
});

describe("jank por fotograma", () => {
  it("calcula p95 y máximo e ignora muestras inválidas", () => {
    const cien = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(resumenJank(cien)).toEqual({ p95: 95, maximo: 100, muestras: 100 });
    expect(resumenJank([])).toEqual({ p95: 0, maximo: 0, muestras: 0 });
    expect(resumenJank([3, Number.NaN, -1, 9, 5])).toEqual({ p95: 9, maximo: 9, muestras: 3 });
  });
});
