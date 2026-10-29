// Prueba de src/lib/variaciones/claves-ajustes.ts — módulo puro: sin red,
// sin disco y sin mock. Solo se leen los índices estáticos de Ajustes
// (buscador de /ajustes y lienzo) y se comprueba el formato canónico de las
// claves con `leerClave`, la misma validación que usa el anfitrión global.
import { describe, it, expect } from "vitest";

import {
  idCanonicoDeAjuste,
  esAjusteRegistrado,
  claveDeAjuste,
  clavesDeAjustes,
} from "../claves-ajustes";
import { leerClave } from "../clave-elemento";

// Ids reales de los dos índices: «tema-apariencia» del buscador de Ajustes y
// «displacementScale» (camelCase) de los ajustes del lienzo.
const BUSCADO = "tema-apariencia";
const DEL_LIENZO = "displacementScale";
const CLAVE_BUSCADA = `ajuste:${BUSCADO}`;
const CLAVE_LIENZO = "ajuste:displacement-scale";

describe("idCanonicoDeAjuste", () => {
  it("canoniza camelCase a kebab-case y conserva los ids ya canónicos", () => {
    expect(idCanonicoDeAjuste(DEL_LIENZO)).toBe("displacement-scale");
    expect(idCanonicoDeAjuste("baseSize")).toBe("base-size");
    expect(idCanonicoDeAjuste(BUSCADO)).toBe(BUSCADO);
  });

  it("devuelve null para un id vacío o sin contenido útil", () => {
    expect(idCanonicoDeAjuste("")).toBeNull();
    expect(idCanonicoDeAjuste("   ")).toBeNull();
    expect(idCanonicoDeAjuste("---")).toBeNull();
  });
});

describe("claveDeAjuste", () => {
  it("devuelve la clave canónica de un ajuste del buscador de Ajustes", () => {
    expect(claveDeAjuste(BUSCADO)).toBe(CLAVE_BUSCADA);
  });

  it("canoniza los ids camelCase del lienzo y acepta su forma canonizada", () => {
    expect(claveDeAjuste(DEL_LIENZO)).toBe(CLAVE_LIENZO);
    expect(claveDeAjuste("displacement-scale")).toBe(CLAVE_LIENZO);
  });

  it("devuelve null para un id que ningún índice conoce o vacío", () => {
    expect(claveDeAjuste("ajuste-inventado")).toBeNull();
    expect(claveDeAjuste("")).toBeNull();
    expect(claveDeAjuste(" ")).toBeNull();
  });
});

describe("esAjusteRegistrado", () => {
  it("reconoce ids de los dos índices y rechaza los desconocidos", () => {
    expect(esAjusteRegistrado(BUSCADO)).toBe(true);
    expect(esAjusteRegistrado("displacement-scale")).toBe(true);
    expect(esAjusteRegistrado("no-esta")).toBe(false);
  });
});

describe("clavesDeAjustes", () => {
  it("genera claves de los dos índices, cada ajuste una sola vez", () => {
    const claves = clavesDeAjustes();
    expect(claves.length).toBeGreaterThan(0);
    expect(claves).toContain(CLAVE_BUSCADA);
    expect(claves).toContain(CLAVE_LIENZO);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("todas las claves pasan la validación canónica del contrato", () => {
    const claves = clavesDeAjustes();
    expect(claves.length).toBeGreaterThan(0);
    for (const clave of claves) {
      expect(leerClave(clave)).not.toBeNull();
      expect(clave.startsWith("ajuste:")).toBe(true);
    }
  });
});

