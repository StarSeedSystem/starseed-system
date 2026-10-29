import { describe, it, expect } from "vitest";
import {
  acotar,
  fraccionDeScroll,
  planDeDibujo,
  rangoDeScroll,
  resolverModo,
  resumenJank,
} from "../pelicula-scroll";

describe("fracción de scroll", () => {
  it("acota entre 0 y 1", () => {
    expect(fraccionDeScroll({ scrollY: 0, inicio: 100, recorrido: 200 })).toBe(0);
    expect(fraccionDeScroll({ scrollY: 200, inicio: 100, recorrido: 200 })).toBeCloseTo(0.5);
    expect(fraccionDeScroll({ scrollY: 900, inicio: 100, recorrido: 200 })).toBe(1);
  });

  it("devuelve 0 cuando no hay recorrido", () => {
    expect(fraccionDeScroll({ scrollY: 300, inicio: 100, recorrido: 0 })).toBe(0);
    expect(fraccionDeScroll({ scrollY: 300, inicio: 100, recorrido: -40 })).toBe(0);
  });

  it("calcula el rango fijo del trozo alto y el de entrada y salida del bajo", () => {
    expect(rangoDeScroll({ top: 500, altura: 900, viewport: 700 })).toEqual({ inicio: 500, recorrido: 200 });
    expect(rangoDeScroll({ top: 500, altura: 300, viewport: 700 })).toEqual({ inicio: -200, recorrido: 1000 });
  });

  it("acota cualquier valor al intervalo", () => {
    expect(acotar(-3, 0, 1)).toBe(0);
    expect(acotar(0.4, 0, 1)).toBe(0.4);
    expect(acotar(9, 0, 1)).toBe(1);
  });
});

describe("fundido de fotogramas", () => {
  it("reparte la fracción entre el fotograma actual y el siguiente", () => {
    expect(planDeDibujo({ modo: "animada", fraccion: 0.625, total: 5, fundido: true }))
      .toEqual({ actual: 2, siguiente: 3, opacidadSiguiente: 0.5 });
  });

  it("no se pasa del último fotograma", () => {
    expect(planDeDibujo({ modo: "animada", fraccion: 1, total: 5, fundido: true }))
      .toEqual({ actual: 4, siguiente: 4, opacidadSiguiente: 0 });
  });

  it("sin fundido pinta solo el fotograma actual", () => {
    expect(planDeDibujo({ modo: "animada", fraccion: 0.5, total: 5, fundido: false }))
      .toEqual({ actual: 2, siguiente: 2, opacidadSiguiente: 0 });
  });

  it("con un solo fotograma no intenta fundir", () => {
    expect(planDeDibujo({ modo: "animada", fraccion: 0.7, total: 1, fundido: true }))
      .toEqual({ actual: 0, siguiente: 0, opacidadSiguiente: 0 });
  });

  it("empieza en el primero y termina con opacidad cero", () => {
    expect(planDeDibujo({ modo: "animada", fraccion: 0, total: 3, fundido: true }))
      .toEqual({ actual: 0, siguiente: 1, opacidadSiguiente: 0 });
    expect(planDeDibujo({ modo: "animada", fraccion: 1, total: 3, fundido: true }))
      .toEqual({ actual: 2, siguiente: 2, opacidadSiguiente: 0 });
  });
});

describe("modo apagado", () => {
  it("se apaga con la opción, con movimiento reducido o sin fotogramas", () => {
    expect(resolverModo({ apagado: true, total: 5 })).toBe("ultimo-fotograma");
    expect(resolverModo({ movimientoReducido: true, total: 5 })).toBe("ultimo-fotograma");
    expect(resolverModo({ total: 0 })).toBe("ultimo-fotograma");
    expect(resolverModo({ total: 5 })).toBe("animada");
  });

  it("muestra el último fotograma a pantalla completa, sin fundido", () => {
    expect(planDeDibujo({ modo: "ultimo-fotograma", fraccion: 0.2, total: 5, fundido: true }))
      .toEqual({ actual: 4, siguiente: 4, opacidadSiguiente: 0 });
  });
});

describe("jank", () => {
  it("resume el p95 y el máximo de milisegundos por fotograma", () => {
    const muestras = Array.from({ length: 20 }, (_, indice) => indice + 1);
    const resumen = resumenJank(muestras);
    expect(resumen.muestras).toBe(20);
    expect(resumen.p95).toBe(19);
    expect(resumen.maximo).toBe(20);
  });

  it("ignora valores inválidos y resume una lista vacía en ceros", () => {
    expect(resumenJank([])).toEqual({ muestras: 0, p95: 0, maximo: 0 });
    expect(resumenJank([Number.NaN, -2])).toEqual({ muestras: 0, p95: 0, maximo: 0 });
  });
});
