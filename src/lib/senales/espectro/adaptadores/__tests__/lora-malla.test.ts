/**
 * Pruebas del adaptador LoRa y malla (MAP1116B).
 * Cubre: sin radio → sinFuente; con radio y región EU → señal declarada + nodos medidos; enlaces malla sin frecuencia ni banda inventadas.
 */

import { describe, it, expect } from "vitest";
import { bandaDeRegion, anchoDePreset, crearSenalRadio, crearSenalesNodos, sinFuenteLoRa, adaptarLoRa, adaptarMalla } from "../lora-malla";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { EnlaceMapa } from "@/lib/senales/tipos-vivo";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";

const AHORA = 1_700_000_000_000;

const loraBase = (estado: SenalesMedio["lora"]["estado"], nodos = 0, transporte: SenalesMedio["lora"]["transporte"] = "serial") => ({ estado, nodos, transporte });

const nodoDetectado = (id: string, snr: number | null, rssi: number | null, simulated = false): DetectedSignal => {
  const metrics = [];
  if (snr != null) metrics.push({ label: "SNR", value: `${snr.toFixed(1)} dB` });
  if (rssi != null) metrics.push({ label: "RSSI", value: `${Math.round(rssi)} dBm` });
  return { id: `lora:${id}`, antenna: "lora", antennaLabel: "Malla LoRa (Meshtastic)", signalType: "LoRa · Meshtastic", label: `Nodo ${id}`, detail: "", quality: null, qualityDetail: "", metrics, compatible: true, compatDetail: "", starseed: null, placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "sector", distanceM: null, accuracyM: null, detail: "" }, lastHeard: AHORA, actions: [], simulated, color: "#34d399" };
};

const enlaceMapa = (clase: EnlaceMapa["clase"], latenciaMs: number | null = 50): EnlaceMapa => ({
  clase, etiqueta: "Enlace de prueba", latenciaMs,
  ruta: clase.startsWith("p2p") ? { clase: "misma-red-local" as const, tipoLocal: null, tipoRemoto: null, protocolo: null, rttMs: latenciaMs ?? 0, bytesEnviados: null, bytesRecibidos: null, medidoEn: AHORA } : null,
});

describe("bandaDeRegion", () => {
  it("mapea EU_868→lora-868, US_915→lora-915, LORA_24→lora-2.4, UNKNOWN→null", () => {
    expect(bandaDeRegion("EU_868")).toBe("lora-868");
    expect(bandaDeRegion("US_915")).toBe("lora-915");
    expect(bandaDeRegion("LORA_24")).toBe("lora-2.4");
    expect(bandaDeRegion("UNKNOWN")).toBeNull();
  });
});

describe("anchoDePreset", () => {
  it("LONG_FAST→125k, SHORT_FAST→250k, UNKNOWN→null, null→null", () => {
    expect(anchoDePreset("LONG_FAST")).toBe(125000);
    expect(anchoDePreset("SHORT_FAST")).toBe(250000);
    expect(anchoDePreset("UNKNOWN")).toBeNull();
    expect(anchoDePreset(null)).toBeNull();
  });
});

describe("crearSenalRadio", () => {
  it("null sin radio y null sin región", () => {
    expect(crearSenalRadio(loraBase("sin-radio"), "EU_868", "LONG_FAST", AHORA)).toBeNull();
    expect(crearSenalRadio(loraBase("ready", 3), null, "LONG_FAST", AHORA)).toBeNull();
  });
  it("crea señal declarada EU_868 con ancho del preset", () => {
    const s = crearSenalRadio(loraBase("ready", 3), "EU_868", "LONG_FAST", AHORA);
    expect(s).not.toBeNull();
    expect(s!.medio).toBe("lora");
    expect(s!.origen).toBe("declarada");
    expect(s!.banda).toBe("LoRa 868 MHz");
    expect(s!.frecuenciaKhz).toBe(868500);
    expect(s!.anchoKhz).toBe(125000);
  });
  it("usa ancho típico si preset desconocido", () => {
    expect(crearSenalRadio(loraBase("ready"), "EU_868", "UNKNOWN", AHORA)!.anchoKhz).toBe(125000);
  });
});

describe("crearSenalesNodos", () => {
  it("filtra solo lora no simulados", () => {
    const r = crearSenalesNodos([nodoDetectado("1", 5, -90), nodoDetectado("2", 3, -95, true), nodoDetectado("3", -2, -105)], AHORA);
    expect(r).toHaveLength(2);
    expect(r.every(s => s.id !== "lora:2")).toBe(true);
  });
  it("calidad combinada SNR+RSSI, solo SNR, solo RSSI", () => {
    const a = crearSenalesNodos([nodoDetectado("1", 10, -50)], AHORA)[0];
    expect(a.calidad).not.toBeNull(); expect(a.origen).toBe("medida"); expect(a.fuerzaDbm).toBe(-50);
    expect(crearSenalesNodos([nodoDetectado("1", 5, null)], AHORA)[0].calidad).not.toBeNull();
    expect(crearSenalesNodos([nodoDetectado("1", null, -80)], AHORA)[0].calidad).not.toBeNull();
  });
});

describe("sinFuenteLoRa", () => {
  it("sin-radio→sinFuente, ready→null", () => {
    const sf = sinFuenteLoRa(loraBase("sin-radio"));
    expect(sf).not.toBeNull(); expect(sf!.medio).toBe("lora"); expect(sf!.motivo).toBe("no hay radio LoRa conectada");
    expect(sinFuenteLoRa(loraBase("ready"))).toBeNull();
  });
});

describe("adaptarLoRa", () => {
  it("sin radio → sinFuente y sin señales", () => {
    const r = adaptarLoRa(loraBase("sin-radio"), null, null, [], AHORA);
    expect(r.sinFuente).not.toBeNull(); expect(r.senalRadio).toBeNull(); expect(r.senalesNodos).toHaveLength(0);
  });
  it("con radio EU_868 → declarada + nodos medidos", () => {
    const r = adaptarLoRa(loraBase("ready", 2), "EU_868", "LONG_FAST", [nodoDetectado("1", 8, -85), nodoDetectado("2", -5, -100)], AHORA);
    expect(r.sinFuente).toBeNull(); expect(r.senalRadio!.origen).toBe("declarada"); expect(r.senalRadio!.banda).toBe("LoRa 868 MHz");
    expect(r.senalesNodos).toHaveLength(2); expect(r.senalesNodos.every(s => s.origen === "medida")).toBe(true);
  });
});

describe("adaptarMalla", () => {
  it("ignora sin-enlace", () => expect(adaptarMalla([enlaceMapa("sin-enlace"), enlaceMapa("p2p-red-local", 30)], AHORA).senalesEnlaces).toHaveLength(1));
  it("sin frecuencia ni banda inventadas", () => {
    const r = adaptarMalla([enlaceMapa("p2p-red-local", 40), enlaceMapa("directo-sin-internet", 20)], AHORA);
    expect(r.senalesEnlaces).toHaveLength(2);
    r.senalesEnlaces.forEach(s => { expect(s.medio).toBe("malla"); expect(s.frecuenciaKhz).toBeNull(); expect(s.banda).toBe("malla propia"); expect(s.anchoKhz).toBeNull(); expect(s.origen).toBe("medida"); expect(s.capa).toBe("propia"); });
  });
  it("calidad inversa a latencia", () => {
    const r = adaptarMalla([enlaceMapa("p2p-red-local", 10), enlaceMapa("p2p-internet", 500)], AHORA);
    expect(r.senalesEnlaces[0].calidad!).toBeGreaterThan(r.senalesEnlaces[1].calidad!);
  });
  it("incluye compatibilidad con ruta medida", () => {
    const r = adaptarMalla([enlaceMapa("p2p-red-local", 30)], AHORA);
    expect(r.senalesEnlaces[0].compatibles.length).toBeGreaterThan(0);
    expect(r.senalesEnlaces[0].compatibles[0].con).toBe("wifi");
  });
});