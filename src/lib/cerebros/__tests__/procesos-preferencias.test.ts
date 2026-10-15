import { describe, expect, it } from "vitest";
import { normalizarPreferencias, type PreferenciasProcesos, type UmbralesProcesos } from "../procesos-preferencias";
import type { TipoProceso } from "./procesos";

describe("normalizarPreferencias", () => {
  it("valores fuera de rango van a por defecto", () => {
    const r = normalizarPreferencias({
      intervaloSeg: 300,
      umbrales: { cpu: 200, ram: 50, disco: 0, bateria: 150 },
    });
    expect(r.intervaloSeg).toBe(120);
    expect(r.umbrales.cpu).toBe(100);
    expect(r.umbrales.disco).toBe(1);
    expect(r.umbrales.bateria).toBe(100);
  });

  it("basura → defaults (vacíos)", () => {
    const r = normalizarPreferencias({
      intervaloSeg: "nope",
      umbrales: "string",
      tipos: null,
      ocultos: undefined,
    });
    expect(r.intervaloSeg).toBe(15);
    expect(r.umbrales.cpu).toBe(85);
    expect(r.tipos).toEqual([]);
    expect(r.ocultos).toEqual([]);
  });

  it("valores válidos se preservan", () => {
    const r = normalizarPreferencias({
      tipos: ["genesis", "sueno"],
      intervaloSeg: 30,
      umbrales: { cpu: 80, ram: 85, disco: 95, bateria: 10 },
      ocultos: ["genesis"],
    });
    expect(r.tipos).toEqual(["genesis", "sueno"] as TipoProceso[]);
    expect(r.intervaloSeg).toBe(30);
    expect(r.umbrales.cpu).toBe(80);
    expect(r.umbrales.ram).toBe(85);
    expect(r.umbrales.disco).toBe(95);
    expect(r.umbrales.bateria).toBe(10);
    expect(r.ocultos).toEqual(["genesis"]);
  });

  it("tipos deben ser TipoProceso o filtrarse", () => {
    const r = normalizarPreferencias({ tipos: ["genesis", 123, "descarga", null, ""] });
    expect(r.tipos).toEqual(["genesis", "descarga"] as TipoProceso[]);
  });

  it("umbral negativo → 1", () => {
    const r = normalizarPreferencias({ umbrales: { cpu: -5, ram: 0, disco: 50, bateria: 200 } });
    expect(r.umbrales.cpu).toBe(1);
    expect(r.umbrales.ram).toBe(1);
    expect(r.umbrales.bateria).toBe(100);
  });

  it("ocultos no-string se filtran", () => {
    const r = normalizarPreferencias({ ocultos: ["genesis", 123, null, "", "sueno"] });
    expect(r.ocultos).toEqual(["genesis", "sueno"]);
  });
});