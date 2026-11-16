/**
 * Tests de normalizarSenal (MRA2/MAP1116).
 */

import { describe, it, expect } from "vitest";
import { normalizarSenal, type SenalEspectro, type Compatibilidad } from "../modelo";

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

describe("normalizarSenal", () => {
  it("normaliza una señal válida recortando textos", () => {
    const raw = {
      ...senalBase(),
      banda: "a".repeat(50),
      fuente: "b".repeat(200),
      zona: "  ZONA1  ",
    };
    const out = normalizarSenal(raw);
    expect(out).not.toBeNull();
    expect(out!.banda.length).toBeLessThanOrEqual(32);
    expect(out!.fuente.length).toBeLessThanOrEqual(128);
    expect(out!.zona).toBe("ZONA1");
  });

  it("rechaza frecuencia ≤ 0", () => {
    expect(normalizarSenal({ ...senalBase(), frecuenciaKhz: 0 })).toBeNull();
    expect(normalizarSenal({ ...senalBase(), frecuenciaKhz: -100 })).toBeNull();
  });

  it("rechaza ancho ≤ 0", () => {
    expect(normalizarSenal({ ...senalBase(), anchoKhz: 0 })).toBeNull();
    expect(normalizarSenal({ ...senalBase(), anchoKhz: -1 })).toBeNull();
  });

  it("rechaza zona > 5 caracteres", () => {
    expect(normalizarSenal({ ...senalBase(), zona: "ABCDEF" })).toBeNull();
  });

  it("rechaza zona con forma de coordenadas lat,lon", () => {
    expect(normalizarSenal({ ...senalBase(), zona: "40.4168,-3.7038" })).toBeNull();
    expect(normalizarSenal({ ...senalBase(), zona: "-33.123,151.456" })).toBeNull();
    expect(normalizarSenal({ ...senalBase(), zona: "  12.34,  -56.78  " })).toBeNull();
  });

  it("acepta zona válida ≤5 chars", () => {
    expect(normalizarSenal({ ...senalBase(), zona: "A1" }))?.not.toBeNull();
    expect(normalizarSenal({ ...senalBase(), zona: "ZONA1" }))?.not.toBeNull();
    expect(normalizarSenal({ ...senalBase(), zona: null }))?.not.toBeNull();
  });

  it("rechaza origen inválido", () => {
    expect(normalizarSenal({ ...senalBase(), origen: "inventado" })).toBeNull();
  });

  it("rechaza capa inválida", () => {
    expect(normalizarSenal({ ...senalBase(), capa: "otra" })).toBeNull();
  });

  it("rechaza medio inválido", () => {
    expect(normalizarSenal({ ...senalBase(), medio: "infrarrojo" })).toBeNull();
  });

  it("valida y recorta vinculo", () => {
    const out = normalizarSenal({
      ...senalBase(),
      vinculo: { tipo: "antena", id: "a".repeat(100) },
    });
    expect(out).not.toBeNull();
    expect(out!.vinculo?.tipo).toBe("antena");
    expect(out!.vinculo?.id.length).toBeLessThanOrEqual(64);
  });

  it("ignora vinculo con tipo inválido", () => {
    const out = normalizarSenal({
      ...senalBase(),
      vinculo: { tipo: "invalido", id: "x" },
    });
    expect(out).not.toBeNull();
    expect(out!.vinculo).toBeUndefined();
  });

  it("filtra compatibles inválidos y recorta los válidos", () => {
    const compatibles: Compatibilidad[] = [
      { con: "bluetooth", que: "emparejamiento", posible: true, motivo: "m".repeat(200) },
      { con: "infrarrojo", que: "x", posible: true, motivo: "x" } as Compatibilidad,
      { con: "lora", que: "y".repeat(100), posible: false, motivo: "no" },
      { con: "invalido", que: "falta-con", posible: true, motivo: "x" } as Compatibilidad,
    ];
    const out = normalizarSenal({ ...senalBase(), compatibles });
    expect(out).not.toBeNull();
    expect(out!.compatibles.length).toBe(2);
    expect(out!.compatibles[0].motivo.length).toBeLessThanOrEqual(128);
    expect(out!.compatibles[1].que.length).toBeLessThanOrEqual(64);
  });

  it("devuelve null para entrada no válida", () => {
    expect(normalizarSenal("no-objeto")).toBeNull();
    expect(normalizarSenal(123)).toBeNull();
    expect(normalizarSenal(null)).toBeNull();
  });
});