/**
 * Tests de utilidades: antiguedadMs, esViva, claveSenal (MRA2/MAP1116).
 */

import { describe, it, expect } from "vitest";
import { antiguedadMs, esViva, claveSenal, type SenalEspectro, POSICION_VIVA_MS } from "../modelo";

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

describe("antiguedadMs", () => {
  it("calcula la antigüedad correctamente", () => {
    const s = senalBase({ medidoEn: AHORA - 120_000 });
    expect(antiguedadMs(s, AHORA)).toBe(120_000);
  });

  it("devuelve null si medidoEn es null", () => {
    const s = senalBase({ medidoEn: null });
    expect(antiguedadMs(s, AHORA)).toBeNull();
  });

  it("devuelve null si ahora no es finito", () => {
    const s = senalBase({ medidoEn: AHORA - 1000 });
    expect(antiguedadMs(s, NaN)).toBeNull();
    expect(antiguedadMs(s, Infinity)).toBeNull();
  });
});

describe("esViva", () => {
  it("true si la señal tiene ≤ POSICION_VIVA_MS (3 min)", () => {
    const s = senalBase({ medidoEn: AHORA - 60_000 });
    expect(esViva(s, AHORA)).toBe(true);
  });

  it("true exactamente en el límite", () => {
    const s = senalBase({ medidoEn: AHORA - POSICION_VIVA_MS });
    expect(esViva(s, AHORA)).toBe(true);
  });

  it("false si supera POSICION_VIVA_MS", () => {
    const s = senalBase({ medidoEn: AHORA - POSICION_VIVA_MS - 1 });
    expect(esViva(s, AHORA)).toBe(false);
  });

  it("false si medidoEn es null", () => {
    const s = senalBase({ medidoEn: null });
    expect(esViva(s, AHORA)).toBe(false);
  });
});

describe("claveSenal", () => {
  it("genera clave estable para la misma señal", () => {
    const s = senalBase();
    expect(claveSenal(s)).toBe(claveSenal(s));
  });

  it("cambia si cambia medio", () => {
    const s1 = senalBase({ medio: "wifi" });
    const s2 = senalBase({ medio: "bluetooth" });
    expect(claveSenal(s1)).not.toBe(claveSenal(s2));
  });

  it("cambia si cambia banda", () => {
    const s1 = senalBase({ banda: "2.4 GHz" });
    const s2 = senalBase({ banda: "5 GHz" });
    expect(claveSenal(s1)).not.toBe(claveSenal(s2));
  });

  it("cambia si cambia frecuencia", () => {
    const s1 = senalBase({ frecuenciaKhz: 2437000 });
    const s2 = senalBase({ frecuenciaKhz: 5180000 });
    expect(claveSenal(s1)).not.toBe(claveSenal(s2));
  });

  it("cambia si cambia zona", () => {
    const s1 = senalBase({ zona: "A1" });
    const s2 = senalBase({ zona: "B2" });
    expect(claveSenal(s1)).not.toBe(claveSenal(s2));
  });

  it("cambia si cambia vinculo", () => {
    const s1 = senalBase({ vinculo: { tipo: "antena", id: "a1" } });
    const s2 = senalBase({ vinculo: { tipo: "nodo", id: "n1" } });
    expect(claveSenal(s1)).not.toBe(claveSenal(s2));
  });

  it("incluye nulls de forma consistente", () => {
    const s1 = senalBase({ frecuenciaKhz: null, anchoKhz: null, zona: null, vinculo: undefined });
    const s2 = senalBase({ frecuenciaKhz: null, anchoKhz: null, zona: null, vinculo: undefined });
    expect(claveSenal(s1)).toBe(claveSenal(s2));
    expect(claveSenal(s1)).toContain("null|null|null|null|null");
  });
});