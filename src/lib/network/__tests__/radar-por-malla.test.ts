import { describe, it, expect } from "vitest";
import type { AntennaKind, DetectedSignal } from "../../../ai/astraura/mesh/signals";
import {
  MSG_RADAR, RADAR_RESUMEN_TTL_MS,
  construirResumenRadar, esMensajeRadar, huellaResumen, senalesVistasPorOtras,
  type ResumenRadar,
} from "../radar-por-malla";

const AHORA = 1_800_000_000_000;
const YO = { neuronId: "n1", nombre: "Mac de Alex" };

function senal(parcial: Partial<DetectedSignal> & { id: string }): DetectedSignal {
  return {
    antenna: "lora",
    antennaLabel: "Malla LoRa (Meshtastic)",
    signalType: "LoRa · Meshtastic",
    label: "nodo",
    detail: "detalle",
    quality: 0.8,
    qualityDetail: "SNR medido",
    metrics: [{ label: "SNR", value: "5 dB" }],
    compatible: true,
    compatDetail: "compatible",
    starseed: null,
    placement: {
      angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1, mode: "sector",
      distanceM: 120, accuracyM: null, detail: "sector",
    },
    lastHeard: AHORA - 1000,
    actions: [],
    simulated: false,
    color: "#34d399",
    ...parcial,
  };
}

describe("construirResumenRadar", () => {
  it("solo incluye antenas locales y nunca ids remotos", () => {
    const r = construirResumenRadar([
      senal({ id: "lora:5" }),
      senal({ id: "ble:x", antenna: "ble" }),
      senal({ id: "ip:external", antenna: "ip" }),
      senal({ id: "serial:0", antenna: "serial" }),
      senal({ id: "beacon:a", antenna: "relay" }),
      senal({ id: "neuron:b", antenna: "account" }),
      senal({ id: "remoto:n2:lora:5" }),
    ], YO, AHORA);
    expect(r.v).toBe(1);
    expect(r.at).toBe(AHORA);
    expect(r.senales.map((s) => s.id).sort()).toEqual(["ble:x", "ip:external", "lora:5", "serial:0"]);
  });

  it("limita a 40 señales ordenadas por calidad y a 10 métricas", () => {
    const muchas = Array.from({ length: 60 }, (_, i) =>
      senal({ id: `lora:${i}`, quality: i / 60 }));
    const r = construirResumenRadar(muchas, YO, AHORA);
    expect(r.senales).toHaveLength(40);
    expect(r.senales[0].quality).toBeGreaterThanOrEqual(r.senales[39].quality ?? 0);
    const metricas = Array.from({ length: 15 }, (_, i) => ({ label: `M${i}`, value: `${i}` }));
    const r2 = construirResumenRadar([senal({ id: "lora:1", metrics: metricas })], YO, AHORA);
    expect(r2.senales[0].metrics).toHaveLength(10);
  });

  it("descarta métricas privadas (MAC, dirección, ID de sync)", () => {
    const r = construirResumenRadar([senal({
      id: "lora:7",
      metrics: [
        { label: "MAC", value: "aa:bb" },
        { label: "Dirección IP", value: "x" },
        { label: "ID de sync", value: "y" },
        { label: "SNR", value: "5 dB" },
      ],
    })], YO, AHORA);
    expect(r.senales[0].metrics).toEqual([{ label: "SNR", value: "5 dB" }]);
  });
});

function resumenValido(): ResumenRadar {
  return construirResumenRadar([senal({ id: "lora:9" })], YO, AHORA);
}

describe("esMensajeRadar", () => {
  it("acepta un mensaje bien formado y rechaza basura", () => {
    expect(esMensajeRadar({ t: MSG_RADAR, resumen: resumenValido() })).toBe(true);
    expect(esMensajeRadar(null)).toBe(false);
    expect(esMensajeRadar("radar:resumen")).toBe(false);
    expect(esMensajeRadar({ t: "otro:tipo", resumen: resumenValido() })).toBe(false);
    expect(esMensajeRadar({ t: MSG_RADAR })).toBe(false);
    expect(esMensajeRadar({ t: MSG_RADAR, resumen: { v: 2 } })).toBe(false);
    expect(esMensajeRadar({ t: MSG_RADAR, resumen: { ...resumenValido(), senales: "x" } })).toBe(false);
  });

  it("rechaza >60 señales y cadenas de >200 caracteres", () => {
    const demasiadas = { ...resumenValido(), senales: Array(61).fill(resumenValido().senales[0]) };
    expect(esMensajeRadar({ t: MSG_RADAR, resumen: demasiadas })).toBe(false);
    const larga = { ...resumenValido(), nombre: "x".repeat(201) };
    expect(esMensajeRadar({ t: MSG_RADAR, resumen: larga })).toBe(false);
    const senalLarga = { ...resumenValido(), senales: [{ ...resumenValido().senales[0], id: "y".repeat(201) }] };
    expect(esMensajeRadar({ t: MSG_RADAR, resumen: senalLarga })).toBe(false);
  });
});

describe("huellaResumen", () => {
  it("es estable e ignora at y lastHeard, pero cambia con el contenido", () => {
    const a = resumenValido();
    const b: ResumenRadar = {
      ...a, at: a.at + 5000,
      senales: a.senales.map((s) => ({ ...s, lastHeard: AHORA })),
    };
    expect(huellaResumen(a)).toBe(huellaResumen(b));
    const c: ResumenRadar = { ...a, senales: a.senales.map((s) => ({ ...s, label: "otro" })) };
    expect(huellaResumen(a)).not.toBe(huellaResumen(c));
  });
});

describe("senalesVistasPorOtras", () => {
  const REMOTA = { neuronId: "n2", nombre: "Tablet" };

  it("convierte un resumen fresco en señales remotas honestas", () => {
    const r = construirResumenRadar([senal({ id: "lora:3" })], REMOTA, AHORA - 60_000);
    const out = senalesVistasPorOtras([r], AHORA);
    expect(out).toHaveLength(1);
    const s = out[0];
    expect(s.id).toBe("remoto:n2:lora:3");
    expect(s.signalType).toContain("la oye Tablet");
    expect(s.detail).toContain("Esta neurona no la oye");
    expect(s.placement.detail).toContain("la oye otra neurona");
    expect(s.starseed).toBeNull();
    expect(s.compatible).toBe(true);
    expect(s.actions).toEqual([]);
    const frescura = 1 - 60_000 / RADAR_RESUMEN_TTL_MS;
    expect(s.quality).toBeCloseTo(0.8 * frescura, 6);
  });

  it("compatible solo para lora", () => {
    const r = construirResumenRadar([
      senal({ id: "ble:z", antenna: "ble" }),
      senal({ id: "lora:1" }),
    ], REMOTA, AHORA);
    const out = senalesVistasPorOtras([r], AHORA);
    expect(out.find((s) => s.id.endsWith("ble:z"))?.compatible).toBe(false);
    expect(out.find((s) => s.id.endsWith("lora:1"))?.compatible).toBe(true);
  });

  it("descarta resúmenes caducados (>5 min) o del futuro", () => {
    const viejo = construirResumenRadar([senal({ id: "lora:1" })], REMOTA, AHORA - RADAR_RESUMEN_TTL_MS - 1);
    const futuro = construirResumenRadar([senal({ id: "lora:1" })], REMOTA, AHORA + 1000);
    expect(senalesVistasPorOtras([viejo], AHORA)).toEqual([]);
    expect(senalesVistasPorOtras([futuro], AHORA)).toEqual([]);
  });
});
