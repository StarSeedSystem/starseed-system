/**
 * StarSeed OS — Red Mesh · ANTENAS, BANDAS Y SELECTOR INTELIGENTE (Adenda 98).
 * ============================================================================
 * Catálogo PURO de las bandas de radiofrecuencia reales del ecosistema mesh
 * (regiones LoRa del firmware oficial de Meshtastic, jul-2026) y de los presets
 * del módem con su compromiso alcance ↔ capacidad ↔ velocidad, más el SELECTOR
 * INTELIGENTE que recomienda (y puede aplicar) la banda/preset adecuada
 * AUTOMÁTICAMENTE según lo que la malla está viendo: SNR de la vecindad,
 * densidad de nodos y utilización del canal.
 *
 * HONESTIDAD RADICAL (Ciberdelia): un navegador NO puede emitir por las antenas
 * celulares/Wi-Fi del dispositivo a voluntad (ninguna Web API lo permite — y es
 * bueno que así sea). Lo que SÍ es real y está aquí: los radios LoRa conectados
 * (USB/BLE/daemon) emiten y reciben en su banda regional SIN ninguna compañía
 * telefónica; el Wi-Fi/Bluetooth del dispositivo se usan como TRANSPORTE hacia
 * el radio y como red externa. Este módulo modela exactamente eso.
 *
 * Módulo PURO (sin react/navegador) y testeable. NUNCA lanza.
 */

import type { TrafficClass } from "./types";

/* ── Bandas por región LoRa (del firmware oficial: RadioInterface.cpp) ─────── */

export interface RegionBand {
  key: string;
  /** Rango de frecuencia real (MHz). */
  freqStartMhz: number;
  freqEndMhz: number;
  /** Duty cycle legal (%; 100 = sin límite de duty, aplican otras reglas). */
  dutyPct: number;
  /** Potencia máxima legal (dBm). */
  powerDbm: number;
  /** Nota honesta para la UI. */
  note?: string;
}

export const REGION_BANDS: Record<string, RegionBand> = {
  US: { key: "US", freqStartMhz: 902, freqEndMhz: 928, dutyPct: 100, powerDbm: 30 },
  EU_433: { key: "EU_433", freqStartMhz: 433, freqEndMhz: 434, dutyPct: 10, powerDbm: 10 },
  EU_868: { key: "EU_868", freqStartMhz: 869.4, freqEndMhz: 869.65, dutyPct: 10, powerDbm: 27 },
  CN: { key: "CN", freqStartMhz: 470, freqEndMhz: 510, dutyPct: 100, powerDbm: 19 },
  JP: { key: "JP", freqStartMhz: 920.5, freqEndMhz: 923.5, dutyPct: 100, powerDbm: 13 },
  ANZ: { key: "ANZ", freqStartMhz: 915, freqEndMhz: 928, dutyPct: 100, powerDbm: 30 },
  KR: { key: "KR", freqStartMhz: 920, freqEndMhz: 923, dutyPct: 100, powerDbm: 23 },
  TW: { key: "TW", freqStartMhz: 920, freqEndMhz: 925, dutyPct: 100, powerDbm: 27 },
  RU: { key: "RU", freqStartMhz: 868.7, freqEndMhz: 869.2, dutyPct: 100, powerDbm: 20, note: "usa LBT" },
  IN: { key: "IN", freqStartMhz: 865, freqEndMhz: 867, dutyPct: 100, powerDbm: 30 },
  NZ_865: { key: "NZ_865", freqStartMhz: 864, freqEndMhz: 868, dutyPct: 100, powerDbm: 36 },
  TH: { key: "TH", freqStartMhz: 920, freqEndMhz: 925, dutyPct: 10, powerDbm: 27 },
  UA_433: { key: "UA_433", freqStartMhz: 433, freqEndMhz: 434.7, dutyPct: 10, powerDbm: 10 },
  UA_868: { key: "UA_868", freqStartMhz: 868, freqEndMhz: 868.6, dutyPct: 1, powerDbm: 14, note: "la más estricta" },
  MY_433: { key: "MY_433", freqStartMhz: 433, freqEndMhz: 435, dutyPct: 100, powerDbm: 20 },
  MY_919: { key: "MY_919", freqStartMhz: 919, freqEndMhz: 924, dutyPct: 100, powerDbm: 27 },
  SG_923: { key: "SG_923", freqStartMhz: 917, freqEndMhz: 925, dutyPct: 100, powerDbm: 20 },
  LORA_24: { key: "LORA_24", freqStartMhz: 2400, freqEndMhz: 2483.5, dutyPct: 100, powerDbm: 10, note: "2,4 GHz (SX128x)" },
  UNSET: { key: "UNSET", freqStartMhz: 902, freqEndMhz: 928, dutyPct: 100, powerDbm: 30, note: "región sin configurar" },
};

/* ── Presets del módem (bitrate/alcance REALES del firmware) ───────────────── */

export interface PresetSpec {
  key: string;
  label: string;
  /** Bitrate bruto real (kbps) según SF/BW/CR del firmware. */
  kbps: number;
  /** Alcance RELATIVO 1..10 (más SF/menos BW = más lejos). Editorial honesto. */
  range: number;
  /** Capacidad RELATIVA 1..10 (más bitrate = más mensajes/minuto en la malla). */
  capacity: number;
  /** ¿Aplicable en cualquier región? (500 kHz no es legal en todas). */
  universal: boolean;
}

export const PRESET_SPECS: Record<string, PresetSpec> = {
  SHORT_TURBO: { key: "SHORT_TURBO", label: "Short Turbo", kbps: 21.88, range: 2, capacity: 10, universal: false },
  SHORT_FAST: { key: "SHORT_FAST", label: "Short Fast", kbps: 10.94, range: 3, capacity: 9, universal: true },
  SHORT_SLOW: { key: "SHORT_SLOW", label: "Short Slow", kbps: 6.25, range: 4, capacity: 8, universal: true },
  MEDIUM_FAST: { key: "MEDIUM_FAST", label: "Medium Fast", kbps: 3.52, range: 5, capacity: 6, universal: true },
  MEDIUM_SLOW: { key: "MEDIUM_SLOW", label: "Medium Slow", kbps: 1.95, range: 6, capacity: 5, universal: true },
  LONG_TURBO: { key: "LONG_TURBO", label: "Long Turbo", kbps: 1.34, range: 7, capacity: 4, universal: false },
  LONG_FAST: { key: "LONG_FAST", label: "Long Fast (defecto)", kbps: 1.07, range: 8, capacity: 3, universal: true },
  LONG_MODERATE: { key: "LONG_MODERATE", label: "Long Moderate", kbps: 0.34, range: 9, capacity: 2, universal: true },
  LONG_SLOW: { key: "LONG_SLOW", label: "Long Slow (legado)", kbps: 0.18, range: 10, capacity: 1, universal: true },
};

/** Orden canónico para la UI (de más velocidad a más alcance). */
export const PRESET_ORDER: readonly string[] = [
  "SHORT_TURBO", "SHORT_FAST", "SHORT_SLOW", "MEDIUM_FAST", "MEDIUM_SLOW",
  "LONG_TURBO", "LONG_FAST", "LONG_MODERATE", "LONG_SLOW",
];

/* ── Inventario de antenas de la neurona (lo real, dicho claro) ────────────── */

export interface AntennaInfo {
  id: string;
  label: string;
  /** Banda(s) que usa de verdad. */
  bands: string;
  /** Papel en la malla StarSeed. */
  role: string;
  /** true = el OS la controla de verdad; false = solo informativa. */
  controllable: boolean;
  note?: string;
}

/**
 * Inventario de las vías de radio de una neurona con radio LoRa en `region`.
 * Honesto: las antenas celulares del dispositivo NO son controlables desde la
 * web (y no fingimos que lo sean); la telecom sin compañías la da el radio LoRa.
 */
export function antennaInventory(region: string | null, hasRadio: boolean): AntennaInfo[] {
  const band = REGION_BANDS[region ?? "UNSET"] ?? REGION_BANDS.UNSET;
  const out: AntennaInfo[] = [];
  out.push({
    id: "lora",
    label: hasRadio ? "Radio LoRa (malla P2P)" : "Radio LoRa (sin conectar)",
    bands: `${band.freqStartMhz}–${band.freqEndMhz} MHz (${band.key})`,
    role: "Telecomunicación SIN compañías: mensajes, alertas y sync por radio libre",
    controllable: hasRadio,
    note: band.note,
  });
  out.push({
    id: "wifi",
    label: "Wi-Fi del dispositivo",
    bands: "2,4 / 5 / 6 GHz (según hardware)",
    role: "Red externa (router) y transporte hacia nodos WiFi/daemon de la malla",
    controllable: false,
    note: "el navegador ve estado y velocidad, no puede cambiar de banda",
  });
  out.push({
    id: "bluetooth",
    label: "Bluetooth / BLE",
    bands: "2,4 GHz",
    role: "Transporte hacia radios LoRa por BLE y periféricos",
    controllable: true,
  });
  out.push({
    id: "cellular",
    label: "Antena celular (si existe)",
    bands: "700 MHz – 3,5 GHz (operador)",
    role: "Red externa de datos móviles — NO controlable desde la web",
    controllable: false,
    note: "la malla LoRa es la vía sin operadores; esta antena queda como respaldo externo",
  });
  return out;
}

/* ── SELECTOR INTELIGENTE de banda/preset ──────────────────────────────────── */

export type BandGoal = "auto" | "distancia" | "equilibrio" | "velocidad";

export interface BandContext {
  /** SNR medio de la vecindad (dB) o null sin datos. */
  avgSnr: number | null;
  /** Nodos online al alcance. */
  onlineNodes: number;
  /** Utilización del canal (%) o null. */
  channelUtilPct: number | null;
  /** Región activa (limita presets no universales). */
  region: string;
}

export interface BandRecommendation {
  presetKey: string;
  /** Por qué (transparencia radical — se muestra al usuario). */
  reason: string;
  /** ¿Cambiaría algo respecto al preset actual? */
  changes: boolean;
}

/**
 * recomiendaPreset — el cerebro del selector: dado el objetivo y lo que la
 * malla VE (SNR de vecinos, densidad, congestión), elige el preset que da
 * mayor distancia, capacidad o velocidad según toque. Determinista y puro.
 *
 * Lógica AUTO (transparente):
 *   · Vecinos con SNR bajo (< −5 dB) o ninguno → prioriza ALCANCE (LongFast→
 *     LongModerate si es crítico).
 *   · Malla densa (≥ 6 nodos) con canal cargado (> 25 %) → prioriza CAPACIDAD
 *     (MediumFast/ShortSlow: menos airtime por mensaje = menos congestión —
 *     recomendación del propio blog oficial de Meshtastic).
 *   · Vecinos fuertes (SNR ≥ 5 dB) y pocos saltos → puede subir VELOCIDAD.
 *   · Sin datos → LONG_FAST (el defecto de fábrica, el más interoperable).
 */
export function recommendPreset(
  goal: BandGoal,
  ctx: BandContext,
  currentPreset: string | null,
): BandRecommendation {
  const cur = currentPreset && PRESET_SPECS[currentPreset] ? currentPreset : "LONG_FAST";
  const universalOnly = REGION_BANDS[ctx.region]?.dutyPct !== 100 || ctx.region === "UNSET";
  const allowed = PRESET_ORDER.filter((k) => !universalOnly || PRESET_SPECS[k].universal);

  const pick = (key: string, reason: string): BandRecommendation => {
    const presetKey = allowed.includes(key) ? key : "LONG_FAST";
    return { presetKey, reason, changes: presetKey !== cur };
  };

  if (goal === "distancia") {
    return pick(
      "LONG_MODERATE",
      "Objetivo alcance máximo: SF alto y banda estrecha llegan más lejos (a costa de velocidad).",
    );
  }
  if (goal === "velocidad") {
    return pick(
      universalOnly ? "SHORT_FAST" : "SHORT_TURBO",
      "Objetivo velocidad máxima: el preset más rápido legal en tu región.",
    );
  }
  if (goal === "equilibrio") {
    return pick("MEDIUM_FAST", "Equilibrio alcance/velocidad para mallas urbanas típicas.");
  }

  // AUTO — decide con lo que la malla está viendo.
  const snr = ctx.avgSnr;
  const util = ctx.channelUtilPct ?? 0;
  if (ctx.onlineNodes === 0 || (snr !== null && snr < -5)) {
    return pick(
      "LONG_FAST",
      snr !== null && snr < -12
        ? "Vecinos muy débiles (SNR < −12 dB): mantengo el preset de máximo alcance interoperable."
        : "Pocos vecinos o señal débil: alcance primero (LongFast, el estándar de la malla).",
    );
  }
  if (ctx.onlineNodes >= 6 && util > 25) {
    return pick(
      "MEDIUM_FAST",
      `Malla densa (${ctx.onlineNodes} nodos) con canal al ${Math.round(util)} %: más velocidad = menos airtime por mensaje = menos congestión.`,
    );
  }
  if (snr !== null && snr >= 5 && ctx.onlineNodes >= 2) {
    return pick(
      "MEDIUM_SLOW",
      `Vecindad fuerte (SNR ${snr.toFixed(1)} dB): se puede ganar capacidad sin perder el enlace.`,
    );
  }
  return pick("LONG_FAST", "Sin señales claras: LongFast, el preset interoperable por defecto.");
}

/* ── Estimación de distancia por radiofrecuencia (para el mapa 3D) ─────────── */

/**
 * Distancia ESTIMADA (metros) a un nodo por su SNR — modelo log-distancia
 * calibrado grueso para LoRa sub-GHz (SNR +10 dB ≈ 100 m · 0 dB ≈ 320 m ·
 * −10 dB ≈ 1 km · −20 dB ≈ 3,2 km). Es una ESTIMACIÓN honesta para ubicar en
 * el mapa a los nodos sin GPS; la UI la etiqueta siempre como "estimado por RF".
 */
export function estimateDistanceMeters(snr: number | null | undefined): number {
  if (typeof snr !== "number" || !Number.isFinite(snr)) return 800; // sin dato: anillo medio
  const d = 100 * Math.pow(10, (10 - snr) / 20);
  return Math.max(30, Math.min(6_000, Math.round(d)));
}
