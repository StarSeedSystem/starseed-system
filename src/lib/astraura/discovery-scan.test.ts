import { describe, it, expect } from "vitest";
import { DISCOVERY_SCAN_LIMITE_DEFECTO, discoveryScanPath, recortarDiscoveryScan, type DiscoveryScanResponse } from "@/lib/astraura/discovery-scan";

describe("discoveryScanPath", () => {
  it("añade limite válido como query", () => {
    expect(discoveryScanPath(25)).toBe("/api/discovery/scan?limite=25");
  });
  it("redondea límites no enteros", () => {
    expect(discoveryScanPath(9.9)).toBe("/api/discovery/scan?limite=9");
  });
  it("sin límite válido devuelve la ruta pelada", () => {
    expect(discoveryScanPath(undefined)).toBe("/api/discovery/scan");
    expect(discoveryScanPath(0)).toBe("/api/discovery/scan");
    expect(discoveryScanPath(-3)).toBe("/api/discovery/scan");
    expect(discoveryScanPath(Number.NaN)).toBe("/api/discovery/scan");
  });
});

describe("recortarDiscoveryScan", () => {
  it("conserva intacta una respuesta dentro del límite (misma referencia)", () => {
    const data = { devices: [{ id: "a" }, { id: "b" }], extra: 1 };
    expect(recortarDiscoveryScan(data, 5)).toBe(data);
  });
  it("recorta el exceso de dispositivos al límite", () => {
    const devices = Array.from({ length: 40 }, (_, i) => ({ id: String(i) }));
    const corta = recortarDiscoveryScan({ devices, total: 40 }, 25);
    expect(corta.devices).toHaveLength(25);
    expect(corta.devices?.[24]).toEqual({ id: "24" });
    expect(corta.total).toBe(40);
  });
  it("usa el límite por defecto sin límite explícito", () => {
    const devices = Array.from({ length: DISCOVERY_SCAN_LIMITE_DEFECTO + 10 }, (_, i) => ({ id: i }));
    const corta = recortarDiscoveryScan({ devices });
    expect(corta.devices).toHaveLength(DISCOVERY_SCAN_LIMITE_DEFECTO);
  });
  it("tolera respuesta sin lista de dispositivos", () => {
    const data = { nota: "sin devices" };
    expect(recortarDiscoveryScan(data)).toBe(data);
  });
  it("maneja array de dispositivos vacío", () => {
    const data = { devices: [], total: 0 };
    expect(recortarDiscoveryScan(data, 10)).toBe(data);
    expect(recortarDiscoveryScan(data, 10).devices).toEqual([]);
  });
  it("maneja limite menor o igual a cero", () => {
    const devices = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    const input = { devices };
    const result = recortarDiscoveryScan(input, 0);
    expect(result.devices).toHaveLength(10);
    expect(result).toEqual(input);
    expect(recortarDiscoveryScan(input, -5).devices).toHaveLength(10);
  });
  it("no muta el array original", () => {
    const original = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const data = { devices: original };
    const result = recortarDiscoveryScan(data, 2);
    expect(result.devices).toHaveLength(2);
    expect(original).toHaveLength(3);
  });
});
