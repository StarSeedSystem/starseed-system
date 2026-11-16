/**
 * Tests de esSenalValida (MRA2/MAP1116).
 */

import { describe, it, expect } from "vitest";
import { esSenalValida, type SenalEspectro } from "../modelo";

const AHORA = 1_700_000_000_000;

function senalBase(overrides: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id: "s1",
    medio: "wifi",
    banda: "2.4 GHz",
    frecuenciaKhz: 2437000,
    anchoKhz: 20000,
    fuerzaDbm: -45,
    calidad: 0.8,
    origen: "medida",
    capa: "propia",
    fuente: "escaneo de Wi-Fi del sistema",
    medidoEn: AHORA - 60_000,
    zona: "A1",
    compatibles: [],
    ...overrides,
  };
}

describe("esSenalValida", () => {
  it("acepta una señal completa y válida", () => {
    expect(esSenalValida(senalBase())).toBe(true);
  });

  it("rechaza null/undefined", () => {
    expect(esSenalValida(null)).toBe(false);
    expect(esSenalValida(undefined)).toBe(false);
  });

  it("rechaza objetos sin campos requeridos", () => {
    expect(esSenalValida({})).toBe(false);
    expect(esSenalValida({ id: "x" })).toBe(false);
  });

  it("rechaza tipos incorrectos en campos numéricos", () => {
    expect(esSenalValida({ ...senalBase(), frecuenciaKhz: "2437000" })).toBe(false);
    expect(esSenalValida({ ...senalBase(), calidad: "alta" })).toBe(false);
  });

  it("acepta null en campos opcionales numéricos", () => {
    expect(esSenalValida({ ...senalBase(), frecuenciaKhz: null, anchoKhz: null, fuerzaDbm: null, calidad: null })).toBe(true);
  });

  it("rechaza compatibles no array", () => {
    expect(esSenalValida({ ...senalBase(), compatibles: "no-array" })).toBe(false);
  });
});