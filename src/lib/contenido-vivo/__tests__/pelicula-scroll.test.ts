import { describe, it, expect } from "vitest";
import { fraccionDePelicula, cuadroDePelicula, resumirJank } from "../pelicula-scroll";

describe("fracción de la película", () => {
  it("vale 0 cuando la sección empieza arriba de la ventana", () => {
    expect(fraccionDePelicula(0, 2000, 800)).toBe(0);
  });

  it("avanza con el recorrido de la sección", () => {
    expect(fraccionDePelicula(-600, 2000, 800)).toBeCloseTo(0.5);
  });

  it("se limita entre 0 y 1 aunque el scroll se pase", () => {
    expect(fraccionDePelicula(400, 2000, 800)).toBe(0);
    expect(fraccionDePelicula(-5000, 2000, 800)).toBe(1);
  });

  it("no divide por cero en una sección más corta que la ventana", () => {
    expect(Number.isFinite(fraccionDePelicula(-10, 400, 800))).toBe(true);
  });
});

describe("fundido entre fotogramas", () => {
  it("reparte la fracción entre el actual y el siguiente", () => {
    const cuadro = cuadroDePelicula(0.5, 4);
    expect(cuadro.actual).toBe(1);
    expect(cuadro.siguiente).toBe(2);
    expect(cuadro.opacidadActual).toBe(1);
    expect(cuadro.opacidadSiguiente).toBeCloseTo(0.5);
  });

  it("sin fundido solo se ve el fotograma actual", () => {
    const cuadro = cuadroDePelicula(0.5, 4, { fundido: false });
    expect(cuadro.opacidadActual).toBe(1);
    expect(cuadro.opacidadSiguiente).toBe(0);
  });

  it("en el último fotograma no hay siguiente que mezclar", () => {
    const cuadro = cuadroDePelicula(1, 4);
    expect(cuadro.actual).toBe(3);
    expect(cuadro.siguiente).toBe(3);
    expect(cuadro.opacidadSiguiente).toBe(0);
  });

  it("con un solo fotograma no se sale del índice 0", () => {
    const cuadro = cuadroDePelicula(0.7, 1);
    expect(cuadro.actual).toBe(0);
    expect(cuadro.siguiente).toBe(0);
  });
});

describe("modo apagado", () => {
  it("muestra el último fotograma sin mezcla", () => {
    expect(cuadroDePelicula(0, 5, { apagado: true })).toEqual({
      actual: 4,
      siguiente: 4,
      opacidadActual: 1,
      opacidadSiguiente: 0,
    });
  });

  it("el apagado manda sobre cualquier fracción de scroll", () => {
    expect(cuadroDePelicula(0.3, 5, { apagado: true }).actual).toBe(4);
    expect(cuadroDePelicula(1, 5, { apagado: true }).actual).toBe(4);
  });
});

describe("jank por fotograma", () => {
  it("resume el p95 y el máximo de milisegundos", () => {
    expect(resumirJank([10, 20, 30, 40, 50])).toEqual({ p95: 50, maximo: 50, muestras: 5 });
  });

  it("sin muestras devuelve ceros", () => {
    expect(resumirJank([])).toEqual({ p95: 0, maximo: 0, muestras: 0 });
  });
});
