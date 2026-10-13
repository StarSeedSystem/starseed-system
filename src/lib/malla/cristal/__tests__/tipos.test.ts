import { describe, it, expect } from "vitest";
import {
  MEDIOS, CLASES_DATO, TIPOS_DATO,
  esMedio, esClaseDato,
  coordinacionDe, claveSenal, COORDINACION_BASE,
} from "../tipos";
import type { NeuronaReticula, SenalMedida } from "../tipos";

// Import adicional del tipo para evitar errores de referencia
// (no se usa directamente, solo confirma que los tipos compilan)

describe("guardas de tipo", () => {
  it("esMedio acepta valores válidos", () => {
    expect(esMedio("lora")).toBe(true);
    expect(esMedio("wifi-lan")).toBe(true);
    expect(esMedio("nfc")).toBe(true);
  });

  it("esMedio rechaza valores no válidos", () => {
    expect(esMedio("bluetooth")).toBe(false);
    expect(esMedio(42)).toBe(false);
    expect(esMedio(null)).toBe(false);
    expect(esMedio(undefined)).toBe(false);
    expect(esMedio({})).toBe(false);
  });

  it("esClaseDato acepta valores válidos", () => {
    expect(esClaseDato("interno")).toBe(true);
    expect(esClaseDato("privado")).toBe(true);
    expect(esClaseDato("publico")).toBe(true);
  });

  it("esClaseDato rechaza valores no válidos", () => {
    expect(esClaseDato("secreto")).toBe(false);
    expect(esClaseDato(1)).toBe(false);
    expect(esClaseDato([])).toBe(false);
  });
});

describe("coordinacionDe", () => {
  const baseNeuron = (extra: Partial<NeuronaReticula> = {}): NeuronaReticula => ({
    id: "n1",
    cuenta: "c1",
    capacidad: { ramGb: 4, bateriaPct: 50, cargando: false },
    medios: ["wifi-lan"],
    ...extra,
  });

  it("router: 6", () => {
    const n = baseNeuron({ esRouter: true });
    expect(coordinacionDe(n)).toBe(6);
  });

  it("batería baja (<20 %) y no cargando: 2", () => {
    const n = baseNeuron({ capacidad: { ramGb: 4, bateriaPct: 15, cargando: false } });
    expect(coordinacionDe(n)).toBe(2);
  });

  it("batería baja pero cargando: no aplica batería baja (falla a 4 o a ram)", () => {
    const n = baseNeuron({ capacidad: { ramGb: 4, bateriaPct: 10, cargando: true } });
    expect(coordinacionDe(n)).toBe(COORDINACION_BASE);
  });

  it("ram < 2 Gb: 3", () => {
    const n = baseNeuron({ capacidad: { ramGb: 1.5, bateriaPct: 50, cargando: false } });
    expect(coordinacionDe(n)).toBe(3);
  });

  it("base por defecto: 4", () => {
    const n = baseNeuron({ capacidad: { ramGb: 8, bateriaPct: 80, cargando: false } });
    expect(coordinacionDe(n)).toBe(4);
    expect(coordinacionDe(n)).toBe(COORDINACION_BASE);
  });
});

describe("claveSenal", () => {
  it("es igual en los dos sentidos", () => {
    const s1: SenalMedida = {
      de: "A",
      a: "B",
      medio: "wifi-lan",
      vistaEn: 100,
    };
    const s2: SenalMedida = {
      de: "B",
      a: "A",
      medio: "wifi-lan",
      vistaEn: 100,
    };
    expect(claveSenal(s1)).toBe(claveSenal(s2));
  });

  it("contiene de ordenado, a ordenado y medio", () => {
    const s: SenalMedida = {
      de: "z",
      a: "m",
      medio: "ble",
      vistaEn: 10,
    };
    expect(claveSenal(s)).toBe("m|z|ble");
  });
});
