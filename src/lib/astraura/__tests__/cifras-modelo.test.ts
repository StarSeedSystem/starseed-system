import { describe, expect, it } from "vitest";

import {
  SIN_DATO,
  formatearCifrasModelo,
  formatearGb,
  formatearQuant,
  formatearTokS,
} from "../cifras-modelo";

describe("formatearGb", () => {
  it("formatea con una decimal y coma", () => {
    expect(formatearGb(3.2)).toBe("3,2 GB");
    expect(formatearGb(10)).toBe("10,0 GB");
    expect(formatearGb(0.5)).toBe("0,5 GB");
  });

  it("devuelve 'sin dato' para undefined, null, NaN", () => {
    expect(formatearGb(undefined)).toBe(SIN_DATO);
    expect(formatearGb(null)).toBe(SIN_DATO);
    expect(formatearGb(NaN)).toBe(SIN_DATO);
    expect(formatearGb(Infinity)).toBe(SIN_DATO);
  });
});

describe("formatearTokS", () => {
  it("redondea a entero con prefijo ~", () => {
    expect(formatearTokS(18.3)).toBe("~18 tok/s");
    expect(formatearTokS(18.7)).toBe("~19 tok/s");
    expect(formatearTokS(0)).toBe("~0 tok/s");
    expect(formatearTokS(1234.5)).toBe("~1235 tok/s");
  });

  it("devuelve 'sin dato' para undefined, null, NaN, negativo", () => {
    expect(formatearTokS(undefined)).toBe(SIN_DATO);
    expect(formatearTokS(null)).toBe(SIN_DATO);
    expect(formatearTokS(NaN)).toBe(SIN_DATO);
    expect(formatearTokS(-5)).toBe(SIN_DATO);
  });
});

describe("formatearCifrasModelo", () => {
  it("combina GB y tok/s con ' · '", () => {
    expect(formatearCifrasModelo({ gb: 3.2, tokS: 18 })).toBe("3,2 GB · ~18 tok/s");
    expect(formatearCifrasModelo({ gb: 1.5, tokS: 42.7 })).toBe("1,5 GB · ~43 tok/s");
  });

  it("solo GB si falta tok/s", () => {
    expect(formatearCifrasModelo({ gb: 2.0 })).toBe("2,0 GB");
    expect(formatearCifrasModelo({ gb: 2.0, tokS: undefined })).toBe("2,0 GB");
    expect(formatearCifrasModelo({ gb: 2.0, tokS: null })).toBe("2,0 GB");
  });

  it("solo tok/s si falta GB", () => {
    expect(formatearCifrasModelo({ tokS: 25 })).toBe("~25 tok/s");
    expect(formatearCifrasModelo({ gb: undefined, tokS: 25 })).toBe("~25 tok/s");
    expect(formatearCifrasModelo({ gb: null, tokS: 25 })).toBe("~25 tok/s");
  });

  it("'sin dato' si faltan ambos", () => {
    expect(formatearCifrasModelo({})).toBe(SIN_DATO);
    expect(formatearCifrasModelo({ gb: undefined, tokS: undefined })).toBe(SIN_DATO);
    expect(formatearCifrasModelo({ gb: null, tokS: null })).toBe(SIN_DATO);
    expect(formatearCifrasModelo({ gb: NaN, tokS: NaN })).toBe(SIN_DATO);
  });
});

describe("formatearQuant", () => {
  it("devuelve la cuantización recortada", () => {
    expect(formatearQuant("Q4_K_M")).toBe("Q4_K_M");
    expect(formatearQuant("Q6_K")).toBe("Q6_K");
    expect(formatearQuant("  Q5_K_M  ")).toBe("Q5_K_M");
  });

  it("devuelve 'sin dato' para undefined, null, vacío o solo espacios", () => {
    expect(formatearQuant(undefined)).toBe(SIN_DATO);
    expect(formatearQuant(null)).toBe(SIN_DATO);
    expect(formatearQuant("")).toBe(SIN_DATO);
    expect(formatearQuant("   ")).toBe(SIN_DATO);
  });
});