import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";

import { leerNegativa, guardarNegativa } from "../almacen-negativa-sugerencia";

const crearAlmacen = () => {
  const almacen: Record<string, string> = {};
  return {
    getItem: (clave: string) => almacen[clave] ?? null,
    setItem: (clave: string, valor: string) => {
      almacen[clave] = valor;
    },
  };
};

afterEach(() => {
  localStorage.clear();
});

describe("almacenNegativaSugerencia", () => {
  it("lee null cuando no hay nada guardado", () => {
    const almacen = crearAlmacen();
    expect(leerNegativa(almacen)).toBeNull();
  });

  it("guarda y lee negativa", () => {
    const almacen = crearAlmacen();
    const negativa = { en: 1740000000000, conexion: "starseed.malla.internet.v1" };
    expect(guardarNegativa(almacen, negativa)).toBe(true);
    expect(leerNegativa(almacen)).toEqual(negativa);
  });

  it("guarda null", () => {
    const almacen = crearAlmacen();
    expect(guardarNegativa(almacen, null)).toBe(true);
    expect(leerNegativa(almacen)).toBeNull();
  });

  it("lee negativa inválida y devuelve null", () => {
    const almacen = crearAlmacen();
    const negativaInvalida = { en: "incorrecto", conexion: 123 };
    expect(guardarNegativa(almacen, negativaInvalida as any)).toBe(true);
    expect(leerNegativa(almacen)).toBeNull();
  });

  it("lee si es válido", () => {
    const almacen = crearAlmacen();
    const negativaValida = { en: Date.now(), conexion: "starseed.malla.internet.v1" };
    expect(guardarNegativa(almacen, negativaValida)).toBe(true);
    expect(leerNegativa(almacen)).toEqual(negativaValida);
  });

  it("lee entero inválido (number NaN)", () => {
    const almacen = crearAlmacen();
    const negativaInvalida = { en: NaN, conexion: "starseed.malla.internet.v1" };
    expect(guardarNegativa(almacen, negativaInvalida as any)).toBe(true);
    expect(leerNegativa(almacen)).toBeNull();
  });

  it("lee entero inválido (number Infinity)", () => {
    const almacen = crearAlmacen();
    const negativaInvalida = { en: Infinity, conexion: "starseed.malla.internet.v1" };
    expect(guardarNegativa(almacen, negativaInvalida as any)).toBe(true);
    expect(leerNegativa(almacen)).toBeNull();
  });

  it("lee entero inválido (number < 0)", () => {
    const almacen = crearAlmacen();
    const negativaInvalida = { en: -1, conexion: "starseed.malla.internet.v1" };
    expect(guardarNegativa(almacen, negativaInvalida as any)).toBe(true);
    expect(leerNegativa(almacen)).toBeNull();
  });

  it("lee null cuando falta clave", () => {
    const almacen = crearAlmacen();
    expect(leerNegativa(almacen)).toBeNull();
  });
});