import { describe, it, expect } from "vitest";
import {
  avanzarCabezal,
  cuadroDePelicula,
  fraccionDeSeccion,
  recorteCubrir,
  resumenJank,
} from "../pelicula-scroll";

describe("película de scroll · fracción de la sección", () => {
  it("mide el recorrido entre el tope de la sección y su final visible", () => {
    const seccion = { tope: 100, alto: 3000 };
    expect(fraccionDeSeccion(100, seccion, 1000)).toBe(0);
    expect(fraccionDeSeccion(1100, seccion, 1000)).toBeCloseTo(0.5);
    expect(fraccionDeSeccion(2100, seccion, 1000)).toBe(1);
  });

  it("recorta fuera de rango y tolera una sección más baja que la ventana", () => {
    expect(fraccionDeSeccion(-500, { tope: 0, alto: 3000 }, 1000)).toBe(0);
    expect(fraccionDeSeccion(9000, { tope: 0, alto: 3000 }, 1000)).toBe(1);
    expect(fraccionDeSeccion(50, { tope: 0, alto: 600 }, 1000)).toBe(1);
  });
});

describe("película de scroll · fundido", () => {
  it("reparte la fracción entre el fotograma actual y el siguiente", () => {
    expect(cuadroDePelicula(0, { total: 5 })).toEqual({ actual: 0, siguiente: 1, opacidad: 0 });
    expect(cuadroDePelicula(0.625, { total: 5 })).toEqual({ actual: 2, siguiente: 3, opacidad: 0.5 });
    expect(cuadroDePelicula(1, { total: 5 })).toEqual({ actual: 4, siguiente: null, opacidad: 0 });
  });

  it("sin fundido salta al fotograma más cercano y no dibuja el siguiente", () => {
    expect(cuadroDePelicula(0.6, { total: 5, fundido: false })).toEqual({ actual: 2, siguiente: null, opacidad: 0 });
  });

  it("acepta total cero y total uno sin romperse", () => {
    expect(cuadroDePelicula(0.4, { total: 0 })).toEqual({ actual: 0, siguiente: null, opacidad: 0 });
    expect(cuadroDePelicula(0.4, { total: 1 })).toEqual({ actual: 0, siguiente: null, opacidad: 0 });
  });
});

describe("película de scroll · modo apagado", () => {
  it("muestra el último fotograma con cualquier fracción y sin fundido", () => {
    const seccion = { tope: 0, alto: 3000 };
    const fraccion = fraccionDeSeccion(500, seccion, 1000);
    expect(cuadroDePelicula(fraccion, { total: 12, quieto: true })).toEqual({ actual: 11, siguiente: null, opacidad: 0 });
    expect(cuadroDePelicula(1, { total: 12, quieto: true })).toEqual({ actual: 11, siguiente: null, opacidad: 0 });
  });
});

describe("película de scroll · cabezal, recorte y jank", () => {
  it("acerca el cabezal al objetivo según la inercia", () => {
    expect(avanzarCabezal(0, 1, 0.09)).toBeCloseTo(0.09);
    expect(avanzarCabezal(0.5, 1, 1)).toBe(1);
    expect(avanzarCabezal(0.5, 1, 0)).toBeLessThan(0.51);
  });

  it("recorta cubriendo el lienzo sin deformar la imagen", () => {
    expect(recorteCubrir(1000, 1000, 2000, 1000)).toEqual({ x: 500, y: 0, ancho: 1000, alto: 1000 });
    expect(recorteCubrir(0, 1000, 2000, 1000)).toEqual({ x: 0, y: 0, ancho: 0, alto: 0 });
  });

  it("resume el jank con el p95 y el máximo de los fotogramas medidos", () => {
    const muestras = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(resumenJank(muestras)).toEqual({ p95: 96, maximo: 100 });
    expect(resumenJank([])).toEqual({ p95: 0, maximo: 0 });
    expect(resumenJank([3, -1, Number.NaN, 9])).toEqual({ p95: 9, maximo: 9 });
  });
});
