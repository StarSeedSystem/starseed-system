/**
 * Tests de integración del modelo del espectrómetro (MRA2/MAP1116).
 */

import { describe, it, expect } from "vitest";
import {
  esSenalValida,
  normalizarSenal,
  claveSenal,
  POSICION_VIVA_MS,
  type SenalEspectro,
  type Compatibilidad,
  type SinFuente,
  type Medio,
  type OrigenDato,
  type CapaRed,
} from "../modelo";

const AHORA = 1_700_000_000_000;
const base: SenalEspectro = {
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
};

describe("Modelo del espectrómetro — integración", () => {
  it("exporta tipos y funciones", () => {
    expect(typeof normalizarSenal).toBe("function");
    expect(typeof esSenalValida).toBe("function");
    expect(typeof claveSenal).toBe("function");
    expect(POSICION_VIVA_MS).toBe(180_000);
  });

  it("tipos se instancian", () => {
    expect((({ con: "bluetooth", que: "emparejar", posible: true, motivo: "estándar" } as Compatibilidad).con)).toBe("bluetooth");
    expect((({ medio: "wifi", motivo: "sin adaptador" } as SinFuente).medio)).toBe("wifi");
  });

  describe("round-trip normalizarSenal → esSenalValida", () => {
    it("señal normalizada pasa validación y tiene origen/fuente", () => {
      const n = normalizarSenal({ ...base, banda: "a".repeat(50) });
      expect(n).not.toBeNull();
      expect(esSenalValida(n!)).toBe(true);
      expect(n!.origen).toBe("medida");
      expect(n!.fuente).toBe("escaneo de Wi-Fi del sistema");
    });

    it("rechaza zona con coordenadas lat,lon; frecuencia/ancho ≤0; zona >5", () => {
      expect(normalizarSenal({ ...base, zona: "40.4168,-3.7038" })).toBeNull();
      expect(normalizarSenal({ ...base, frecuenciaKhz: 0 })).toBeNull();
      expect(normalizarSenal({ ...base, anchoKhz: -1 })).toBeNull();
      expect(normalizarSenal({ ...base, zona: "ABCDEF" })).toBeNull();
    });

    it("acepta zona ≤5 chars y null", () => {
      expect(normalizarSenal({ ...base, zona: "ZONA1" }))?.not.toBeNull();
      expect(normalizarSenal({ ...base, zona: null }))?.not.toBeNull();
    });
  });

  it("valida todos los enums: medios, origenes, capas", () => {
    const medios: Medio[] = ["wifi", "bluetooth", "lora", "celular", "malla", "internet", "estacion", "sdr"];
    const origenes: OrigenDato[] = ["medida", "declarada", "estimada"];
    const capas: CapaRed[] = ["propia", "publica", "comunidad", "privada", "externa"];
    for (const m of medios) expect(normalizarSenal({ ...base, medio: m })).not.toBeNull();
    expect(normalizarSenal({ ...base, medio: "infrarrojo" })).toBeNull();
    for (const o of origenes) expect(normalizarSenal({ ...base, origen: o }))?.not.toBeNull();
    expect(normalizarSenal({ ...base, origen: "inventado" })).toBeNull();
    for (const c of capas) expect(normalizarSenal({ ...base, capa: c }))?.not.toBeNull();
    expect(normalizarSenal({ ...base, capa: "otra" })).toBeNull();
  });

  describe("claveSenal — estable para deduplicar", () => {
    it("idéntica para misma señal; cambia con campos clave", () => {
      expect(claveSenal(base)).toBe(claveSenal(base));
      expect(claveSenal({ ...base, medio: "wifi" })).not.toBe(claveSenal({ ...base, medio: "bluetooth" }));
      expect(claveSenal({ ...base, banda: "2.4 GHz" })).not.toBe(claveSenal({ ...base, banda: "5 GHz" }));
      expect(claveSenal({ ...base, frecuenciaKhz: 2437000 })).not.toBe(claveSenal({ ...base, frecuenciaKhz: 5180000 }));
      expect(claveSenal({ ...base, zona: "A1" })).not.toBe(claveSenal({ ...base, zona: "B2" }));
      expect(claveSenal({ ...base, vinculo: { tipo: "antena", id: "a1" } })).not.toBe(claveSenal({ ...base, vinculo: { tipo: "nodo", id: "n1" } }));
    });
    it("incluye nulls consistentemente", () => {
      const s1 = { ...base, frecuenciaKhz: null, anchoKhz: null, zona: null, vinculo: undefined };
      const s2 = { ...base, frecuenciaKhz: null, anchoKhz: null, zona: null, vinculo: undefined };
      expect(claveSenal(s1)).toBe(claveSenal(s2));
      expect(claveSenal(s1)).toContain("null|null|null|null|null");
    });
  });

  it("filtra compatibles inválidos y recorta; valida/recorta vinculo", () => {
    const out = normalizarSenal({
      ...base,
      compatibles: [
        { con: "bluetooth", que: "emparejamiento", posible: true, motivo: "m".repeat(200) },
        { con: "invalido", que: "x", posible: true, motivo: "x" },
        { con: "lora", que: "y".repeat(100), posible: false, motivo: "no" },
        { que: "falta-con", posible: true, motivo: "x" },
      ],
    });
    expect(out!.compatibles.length).toBe(2);
    expect(out!.compatibles[0].motivo.length).toBeLessThanOrEqual(128);
    expect(normalizarSenal({ ...base, vinculo: { tipo: "antena", id: "a".repeat(100) } })!.vinculo?.id.length).toBeLessThanOrEqual(64);
    expect(normalizarSenal({ ...base, vinculo: { tipo: "invalido", id: "x" } })!.vinculo).toBeUndefined();
  });

  it("entrada no objeto devuelve null", () => {
    expect(normalizarSenal("x")).toBeNull();
    expect(normalizarSenal(123)).toBeNull();
    expect(normalizarSenal(null)).toBeNull();
  });
});