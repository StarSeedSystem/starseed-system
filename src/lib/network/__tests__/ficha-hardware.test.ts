// @vitest-environment jsdom
/**
 * F8 · la ficha de capacidades lleva GPU, almacenamiento libre y tipo de chip
 * cuando el aparato los mide. Sin dato no se rellena con cero ni con una familia
 * inventada. Sin red real: `fetch` rechaza y los sondeos nativos son best-effort.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { construirFicha } from "../malla-neuronas";
import type { Neuron } from "@/lib/neurons/neurons";

const neurona = (capabilities: Record<string, unknown>): Neuron =>
  ({ name: "Aparato de prueba", kind: "laptop", capabilities }) as unknown as Neuron;

describe("construirFicha · hardware de la ficha de capacidades", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red en las pruebas"))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("con dato: normaliza la GPU, calcula el almacenamiento libre y deduce el chip", async () => {
    const ficha = await construirFicha(neurona({
      platform: "Android",
      gpuRenderer: "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)",
      gpuVendor: "Qualcomm",
      storageQuotaGb: 20,
      storageUsedGb: 2,
    }));
    expect(ficha.gpu).toBe("adreno 730");
    expect(ficha.almacenamientoLibreGb).toBe(18);
    expect(ficha.chip).toBe("android-soc");
  });

  it("sin dato: no hay campos de hardware ni ceros inventados", async () => {
    const ficha = await construirFicha(neurona({ platform: "macOS" }));
    expect(ficha.gpu).toBeUndefined();
    expect(ficha.almacenamientoLibreGb).toBeUndefined();
    expect(ficha.chip).toBeUndefined();
  });
});
