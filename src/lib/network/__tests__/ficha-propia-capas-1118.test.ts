/**
 * AUD1118 — capa y tok/s MEDIDOS de las capacidades de esta neurona.
 *
 * Prueba capa y tok/s MATREADOS MEDIDOS por esta neurona: sin campos da [] y null;
 * capas ['bitnet-1.58@1','needle@2'] y tokS {'bitnet-1.58@1': 12.5, 'otra@1': 3, 'needle@2': -1}
 * sale ambas capas y tokS {'bitnet-1.58@1': 12.5}; duplicados y vacios descartados;
 * la plataforma Linux x86_64 da medio 'linux'.
 * Mockea navigator.getBattery si es necesario.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { medirFichaPropia } from "../ficha-propia";
import type { DispositivoFicha } from "../ficha-propia";
import { medioDesdePlataforma } from "../ficha-propia";

/**
 * Mock del API de batería del navegador para pruebas deterministas.
 * Constructor compatible con navigator.getBattery().
 */
function mockBatteryApi(level: number | undefined = undefined) {
  if (typeof window === "undefined") return;

  const batteryAPI = {
    level: level !== undefined ? level : undefined,
  };

  Object.defineProperty(navigator, "getBattery", {
    value: () =>
      new Promise<{ level?: number }>(resolve => {
        resolve(batteryAPI as { level?: number });
      }),
    configurable: true,
  });
}

/** Reinicializa mocks entre tests */
function cleanBrowserMocks() {
  if (typeof window === "undefined") return;

  delete (navigator as any).getBattery;
}

/** Crea un DispositivoFicha con los campos dados */
function makeDevice(overrides: Partial<DispositivoFicha> = {}): DispositivoFicha {
  return {
    id: "test-device",
    platform: "Linux x86_64",
    capas: [],
    tokS: null,
    ...overrides,
  };
}

describe("medirFichaPropia capa y tok/s sanitizado", () => {
  beforeEach(() => {
    cleanBrowserMocks();
  });

  it("sin campos, la ficha tiene capas [] y tokS null", async () => {
    const device = makeDevice();
    const ficha = await medirFichaPropia(device);
    expect(ficha.capas).toEqual([]);
    expect(ficha.tokS).toBeNull();
  });

  it("con capas ['bitnet-1.58@1','needle@2'] y tokS {'bitnet-1.58@1': 12.5, 'otra@1': 3, 'needle@2': -1} salen las dos capas y tokS {'bitnet-1.58@1': 12.5}", async () => {
    const device = makeDevice({
      capas: ["bitnet-1.58@1", "needle@2"],
      tokS: { "bitnet-1.58@1": 12.5, "otra@1": 3, "needle@2": -1 },
    });
    const ficha = await medirFichaPropia(device);
    expect(ficha.capas).toEqual(["bitnet-1.58@1", "needle@2"]);
    expect(ficha.tokS).toEqual({ "bitnet-1.58@1": 12.5 });
  });

  it("duplicados y vacios se descartan", async () => {
    const device = makeDevice({
      capas: ["bitnet-1.58@1", "", "  ", "bitnet-1.58@1", "needle@2"],
      tokS: { "bitnet-1.58@1": 5, "": -1, "needle@2": 0, "otro": 2 },
    });
    const ficha = await medirFichaPropia(device);
    expect(ficha.capas).toEqual(["bitnet-1.58@1", "needle@2"]);
    expect(ficha.tokS).toEqual({ "bitnet-1.58@1": 5 });
  });

  it("la plataforma 'Linux x86_64' da medio 'linux'", () => {
    expect(medioDesdePlataforma("Linux x86_64")).toBe("linux");
  });

  it("capa recortada a 80 caracteres", async () => {
    const capa = "a".repeat(100);
    const device = makeDevice({ capas: [capa] });
    const ficha = await medirFichaPropia(device);
    expect(ficha.capas).toHaveLength(1);
    expect(ficha.capas[0].length).toBe(80);
    expect(ficha.capas[0]).toBe("a".repeat(80));
  });

  it("max 32 capas", async () => {
    const capas = Array.from({ length: 50 }, (_, i) => `capa-${i}`);
    const device = makeDevice({ capas });
    const ficha = await medirFichaPropia(device);
    expect(ficha.capas).toHaveLength(32);
  });

  it("tokS sin keys de capas se descarta", async () => {
    const device = makeDevice({
      capas: ["bitnet-1.58@1"],
      tokS: { "bitnet-1.58@1": 5, "no-en-capa": 10 },
    });
    const ficha = await medirFichaPropia(device);
    expect(ficha.tokS).toEqual({ "bitnet-1.58@1": 5 });
  });

  it("tokS valores finitos <= 0 se descartan", async () => {
    const device = makeDevice({
      capas: ["a", "b", "c"],
      tokS: { "a": 5, "b": 0, "c": -1, "d": Infinity, "e": -Infinity },
    });
    const ficha = await medirFichaPropia(device);
    expect(ficha.tokS).toEqual({ "a": 5 });
  });

  it("tokS vacio (no hay capas válidas) resulta null", async () => {
    const device = makeDevice({
      capas: [],
      tokS: null,
    });
    const ficha = await medirFichaPropia(device);
    expect(ficha.capas).toEqual([]);
    expect(ficha.tokS).toBeNull();
  });
});