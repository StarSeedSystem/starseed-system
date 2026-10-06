import { describe, it, expect } from "vitest";
import {
  debePublicarResumenFederado,
  reducirResumenParaFederacion,
} from "../federation";
import { construirResumenRadar, type ResumenRadar } from "@/lib/network/radar-por-malla";
import type { DetectedSignal } from "../signals";

const YO = { neuronId: "n-yo", nombre: "Neurona A" };
const AHORA = 1_000_000_000;

function senal(id: string, antenna: DetectedSignal["antenna"], label: string): DetectedSignal {
  return {
    id, antenna, antennaLabel: label, signalType: "x", label,
    detail: "", quality: null, qualityDetail: "", metrics: [],
    compatible: false, compatDetail: "", starseed: null,
    placement: { angleRad: 0, radiusFrac: 0, accuracyFrac: 0, mode: "sector", distanceM: null, accuracyM: null, detail: "" },
    lastHeard: null, actions: [], simulated: false, color: "#fff",
  };
}

function resumenCon(ids: Array<[string, DetectedSignal["antenna"]]>): ResumenRadar {
  return construirResumenRadar(ids.map(([id, a]) => senal(id, a, `nombre-secreto-${id}`)), YO, AHORA);
}

describe("reducirResumenParaFederacion", () => {
  it("reduce Wi-Fi y Bluetooth a recuentos sin nombres", () => {
    const r = resumenCon([
      ["ip:1", "ip"], ["ip:2", "ip"], ["ip:3", "ip"],
      ["ble:1", "ble"], ["ble:2", "ble"],
      ["lora:1", "lora"],
    ]);
    const red = reducirResumenParaFederacion(r);
    expect(red.senales).toHaveLength(3);
    const wifi = red.senales.find((s) => s.id === "conteo:wifi");
    const ble = red.senales.find((s) => s.id === "conteo:ble");
    expect(wifi?.label).toBe("3 redes cercanas");
    expect(ble?.label).toBe("2 dispositivos Bluetooth");
    expect(red.senales.some((s) => s.id === "lora:1")).toBe(true);
    const texto = JSON.stringify(red);
    expect(texto).not.toContain("nombre-secreto-ip:1");
    expect(texto).not.toContain("nombre-secreto-ble:1");
    // La señal lora conserva su etiqueta (no es una red ajena).
    expect(texto).toContain("nombre-secreto-lora:1");
  });

  it("singular en los recuentos de uno", () => {
    const r = resumenCon([["ip:1", "ip"], ["ble:1", "ble"]]);
    const red = reducirResumenParaFederacion(r);
    expect(red.senales.find((s) => s.id === "conteo:wifi")?.label).toBe("1 red cercana");
    expect(red.senales.find((s) => s.id === "conteo:ble")?.label).toBe("1 dispositivo Bluetooth");
  });

  it("sin wifi ni ble no añade conteos", () => {
    const r = resumenCon([["lora:1", "lora"], ["serial:1", "serial"]]);
    const red = reducirResumenParaFederacion(r);
    expect(red.senales).toHaveLength(2);
    expect(red.senales.some((s) => s.id.startsWith("conteo:"))).toBe(false);
  });
});

describe("debePublicarResumenFederado", () => {
  it("la primera publicación siempre sale", () => {
    expect(debePublicarResumenFederado("h1", null, 0, AHORA)).toBe(true);
  });

  it("nunca más de una vez cada 5 minutos, aunque cambie la huella", () => {
    expect(debePublicarResumenFederado("h2", "h1", AHORA - 60_000, AHORA)).toBe(false);
  });

  it("con huella nueva y 5 min pasados, publica", () => {
    expect(debePublicarResumenFederado("h2", "h1", AHORA - 6 * 60_000, AHORA)).toBe(true);
  });

  it("con la misma huella espera 15 minutos (latido)", () => {
    expect(debePublicarResumenFederado("h1", "h1", AHORA - 10 * 60_000, AHORA)).toBe(false);
    expect(debePublicarResumenFederado("h1", "h1", AHORA - 16 * 60_000, AHORA)).toBe(true);
  });
});
