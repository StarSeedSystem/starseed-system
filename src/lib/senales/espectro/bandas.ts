/**
 * bandas — tabla de bandas conocidas con rangos y conversiones canal ↔ frecuencia (MAP1116B).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cada número lleva su fuente en comentario. Si no hay fuente fiable, la banda queda FUERA.
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { Medio } from "./tipos";

/** Banda de frecuencia conocida con su rango en kHz y anchos típicos. */
export interface BandaConocida {
  /** Identificador único (p. ej. "wifi-2.4", "lora-eu868"). */
  id: string;
  /** Medio al que pertenece. */
  medio: Medio;
  /** Etiqueta legible (p. ej. "Wi-Fi 2,4 GHz", "LoRa EU 868"). */
  etiqueta: string;
  /** Frecuencia central en kHz. */
  centroKhz: number;
  /** Inicio del rango en kHz (inclusive). */
  inicioKhz: number;
  /** Fin del rango en kHz (inclusive). */
  finKhz: number;
  /** Anchos de banda típicos en kHz (p. ej. [20000, 40000]). */
  anchosTipicosKhz: readonly number[];
  /** Fuente de los números (especificación, medición, declaración). */
  fuente: string;
  /** Región o variante (p. ej. "EU_868", "US", "channels-1-14"). */
  region?: string;
  /** Canales válidos si aplica (p. ej. 1-14 para Wi-Fi 2.4 GHz). */
  canales?: { inicio: number; fin: number };
}

/** Todas las bandas conocidas, indexadas por id. */
export const BANDAS_CONOCIDAS: Readonly<Record<string, BandaConocida>> = {
  // Wi-Fi 2,4 GHz (canales 1-14, centros según IEEE 802.11)
  "wifi-2.4": {
    id: "wifi-2.4",
    medio: "wifi",
    etiqueta: "Wi-Fi 2,4 GHz",
    centroKhz: 2442000,
    inicioKhz: 2401000,
    finKhz: 2483000,
    anchosTipicosKhz: [20000, 40000],
    fuente: "IEEE 802.11: canales 1-14 en 2401-2483 MHz; centros: ch1=2412, ch6=2437, ch11=2462, ch14=2484 MHz (Japón).",
    region: "global",
    canales: { inicio: 1, fin: 14 },
  },
  // Wi-Fi 5 GHz (canales 36-177, UNII-1/2/3/4)
  "wifi-5": {
    id: "wifi-5",
    medio: "wifi",
    etiqueta: "Wi-Fi 5 GHz",
    centroKhz: 5500000,
    inicioKhz: 5150000,
    finKhz: 5850000,
    anchosTipicosKhz: [20000, 40000, 80000, 160000],
    fuente: "IEEE 802.11: UNII-1 (36-48, 5150-5250), UNII-2A (52-64, 5250-5350), UNII-2C (100-144, 5470-5725), UNII-3 (149-165, 5725-5850), UNII-4 (169-177, 5850-5925) MHz.",
    region: "global",
    canales: { inicio: 36, fin: 177 },
  },
  // Wi-Fi 6 GHz (canales 1-233, 5925-7125 MHz)
  "wifi-6": {
    id: "wifi-6",
    medio: "wifi",
    etiqueta: "Wi-Fi 6 GHz (Wi-Fi 6E/7)",
    centroKhz: 6525000,
    inicioKhz: 5925000,
    finKhz: 7125000,
    anchosTipicosKhz: [20000, 40000, 80000, 160000, 320000],
    fuente: "IEEE 802.11ax/be: 5925-7125 MHz (canales 1-233, centros cada 5 MHz desde 5935 MHz).",
    region: "global (requiere soporte regulatorio)",
    canales: { inicio: 1, fin: 233 },
  },
  // Bluetooth/BLE 2,4 GHz (40 canales BLE de 2 MHz, 79 clásicos de 1 MHz)
  "ble-2.4": {
    id: "ble-2.4",
    medio: "bluetooth",
    etiqueta: "Bluetooth / BLE 2,4 GHz",
    centroKhz: 2441000,
    inicioKhz: 2402000,
    finKhz: 2480000,
    anchosTipicosKhz: [1000, 2000],
    fuente: "Bluetooth Core Spec: BLE 40 canales (0-39) a 2 MHz cada uno, centros 2402 + k·2 MHz; clásico 79 canales a 1 MHz, centros 2402 + k·1 MHz.",
    region: "global",
    canales: { inicio: 0, fin: 39 },
  },
  // LoRa 433 MHz (EU_433, UA_433, MY_433)
  "lora-433": {
    id: "lora-433",
    medio: "lora",
    etiqueta: "LoRa 433 MHz",
    centroKhz: 433500,
    inicioKhz: 433000,
    finKhz: 434700,
    anchosTipicosKhz: [125000, 250000, 500000],
    fuente: "Meshtastic REGION_BANDS (antennas.ts): EU_433 433-434 MHz, UA_433 433-434.7 MHz, MY_433 433-435 MHz; anchos 125/250/500 kHz según preset.",
    region: "EU_433, UA_433, MY_433",
  },
  // LoRa 868 MHz (EU_868, UA_868, RU, IN, NZ_865)
  "lora-868": {
    id: "lora-868",
    medio: "lora",
    etiqueta: "LoRa 868 MHz",
    centroKhz: 868500,
    inicioKhz: 863000,
    finKhz: 870000,
    anchosTipicosKhz: [125000, 250000, 500000],
    fuente: "Meshtastic REGION_BANDS (antennas.ts): EU_868 869.4-869.65 MHz, UA_868 868-868.6 MHz, RU 868.7-869.2 MHz (LBT), IN 865-867 MHz, NZ_865 864-868 MHz; anchos 125/250/500 kHz.",
    region: "EU_868, UA_868, RU, IN, NZ_865",
  },
  // LoRa 915 MHz (US, ANZ, KR, TW, MY_919, SG_923, TH, CN parcial, JP)
  "lora-915": {
    id: "lora-915",
    medio: "lora",
    etiqueta: "LoRa 915 MHz",
    centroKhz: 915000,
    inicioKhz: 902000,
    finKhz: 928000,
    anchosTipicosKhz: [125000, 250000, 500000],
    fuente: "Meshtastic REGION_BANDS (antennas.ts): US 902-928, ANZ 915-928, KR 920-923, TW 920-925, MY_919 919-924, SG_923 917-925, TH 920-925 (duty 10 %), JP 920.5-923.5; anchos 125/250/500 kHz.",
    region: "US, ANZ, KR, TW, MY_919, SG_923, TH, JP",
  },
  // LoRa 2,4 GHz (SX128x)
  "lora-2.4": {
    id: "lora-2.4",
    medio: "lora",
    etiqueta: "LoRa 2,4 GHz (SX128x)",
    centroKhz: 2441750,
    inicioKhz: 2400000,
    finKhz: 2483500,
    anchosTipicosKhz: [203000, 406000, 812000, 1625000],
    fuente: "Meshtastic REGION_BANDS (antennas.ts): LORA_24 2400-2483.5 MHz; anchos variables SX128x (203/406/812/1625 kHz aprox.).",
    region: "LORA_24",
  },
  // Celular: bandas LTE/NR más comunes por número (3GPP TS 38.101 / 36.101)
  "celular-b1": {
    id: "celular-b1",
    medio: "celular",
    etiqueta: "Banda 1 (2100 MHz) — FDD",
    centroKhz: 2140000,
    inicioKhz: 2110000,
    finKhz: 2170000,
    anchosTipicosKhz: [1400, 3000, 5000, 10000, 15000, 20000],
    fuente: "3GPP TS 36.101/38.101: B1 UL 1920-1980 / DL 2110-2170 MHz; anchos de canal LTE/NR 1,4/3/5/10/15/20 MHz.",
    region: "global",
  },
  "celular-b3": {
    id: "celular-b3",
    medio: "celular",
    etiqueta: "Banda 3 (1800 MHz) — FDD",
    centroKhz: 1842500,
    inicioKhz: 1805000,
    finKhz: 1880000,
    anchosTipicosKhz: [1400, 3000, 5000, 10000, 15000, 20000],
    fuente: "3GPP: B3 UL 1710-1785 / DL 1805-1880 MHz; anchos LTE/NR 1,4/3/5/10/15/20 MHz.",
    region: "global",
  },
  "celular-b7": {
    id: "celular-b7",
    medio: "celular",
    etiqueta: "Banda 7 (2600 MHz) — FDD",
    centroKhz: 2655000,
    inicioKhz: 2620000,
    finKhz: 2690000,
    anchosTipicosKhz: [5000, 10000, 15000, 20000],
    fuente: "3GPP: B7 UL 2500-2570 / DL 2620-2690 MHz; anchos LTE/NR 5/10/15/20 MHz.",
    region: "global",
  },
  "celular-b8": {
    id: "celular-b8",
    medio: "celular",
    etiqueta: "Banda 8 (900 MHz) — FDD",
    centroKhz: 942500,
    inicioKhz: 925000,
    finKhz: 960000,
    anchosTipicosKhz: [1400, 3000, 5000, 10000],
    fuente: "3GPP: B8 UL 880-915 / DL 925-960 MHz; anchos LTE/NR 1,4/3/5/10 MHz.",
    region: "global",
  },
  "celular-b20": {
    id: "celular-b20",
    medio: "celular",
    etiqueta: "Banda 20 (800 MHz DD) — FDD",
    centroKhz: 806000,
    inicioKhz: 791000,
    finKhz: 821000,
    anchosTipicosKhz: [1400, 3000, 5000, 10000, 15000, 20000],
    fuente: "3GPP: B20 UL 832-862 / DL 791-821 MHz; anchos LTE/NR 1,4/3/5/10/15/20 MHz (Digital Dividend EU).",
    region: "EU",
  },
  "celular-b28": {
    id: "celular-b28",
    medio: "celular",
    etiqueta: "Banda 28 (700 MHz APT) — FDD",
    centroKhz: 758000,
    inicioKhz: 758000,
    finKhz: 803000,
    anchosTipicosKhz: [3000, 5000, 10000, 15000, 20000],
    fuente: "3GPP: B28 UL 703-748 / DL 758-803 MHz; anchos LTE/NR 3/5/10/15/20 MHz (APT 700).",
    region: "APAC, LATAM, EU parcial",
  },
  "celular-n78": {
    id: "celular-n78",
    medio: "celular",
    etiqueta: "Banda n78 (3500 MHz) — TDD NR",
    centroKhz: 3500000,
    inicioKhz: 3300000,
    finKhz: 3800000,
    anchosTipicosKhz: [10000, 15000, 20000, 40000, 50000, 60000, 80000, 100000],
    fuente: "3GPP TS 38.101: n78 3300-3800 MHz TDD; anchos NR 10/15/20/40/50/60/80/100 MHz (5G mid-band principal).",
    region: "global (5G principal)",
  },
  "celular-n1": {
    id: "celular-n1",
    medio: "celular",
    etiqueta: "Banda n1 (2100 MHz) — FDD NR",
    centroKhz: 2140000,
    inicioKhz: 2110000,
    finKhz: 2170000,
    anchosTipicosKhz: [5000, 10000, 15000, 20000, 25000, 30000, 40000],
    fuente: "3GPP TS 38.101: n1 2110-2170 MHz DL / 1920-1980 UL; anchos NR 5/10/15/20/25/30/40 MHz.",
    region: "global",
  },
  "celular-n3": {
    id: "celular-n3",
    medio: "celular",
    etiqueta: "Banda n3 (1800 MHz) — FDD NR",
    centroKhz: 1842500,
    inicioKhz: 1805000,
    finKhz: 1880000,
    anchosTipicosKhz: [5000, 10000, 15000, 20000, 25000, 30000, 40000],
    fuente: "3GPP: n3 1805-1880 MHz DL / 1710-1785 UL; anchos NR 5/10/15/20/25/30/40 MHz.",
    region: "global",
  },
  "celular-n28": {
    id: "celular-n28",
    medio: "celular",
    etiqueta: "Banda n28 (700 MHz) — FDD NR",
    centroKhz: 758000,
    inicioKhz: 758000,
    finKhz: 803000,
    anchosTipicosKhz: [5000, 10000, 15000, 20000, 25000, 30000],
    fuente: "3GPP: n28 758-803 MHz DL / 703-748 UL; anchos NR 5/10/15/20/25/30 MHz.",
    region: "APAC, LATAM, EU parcial",
  },
  "celular-n41": {
    id: "celular-n41",
    medio: "celular",
    etiqueta: "Banda n41 (2500 MHz) — TDD NR",
    centroKhz: 2593000,
    inicioKhz: 2496000,
    finKhz: 2690000,
    anchosTipicosKhz: [10000, 15000, 20000, 40000, 50000, 60000, 80000, 100000],
    fuente: "3GPP: n41 2496-2690 MHz TDD; anchos NR 10/15/20/40/50/60/80/100 MHz.",
    region: "global (EE. UU., JP, CN, otros)",
  },
  "celular-n77": {
    id: "celular-n77",
    medio: "celular",
    etiqueta: "Banda n77 (3700 MHz) — TDD NR",
    centroKhz: 3700000,
    inicioKhz: 3300000,
    finKhz: 4200000,
    anchosTipicosKhz: [10000, 15000, 20000, 40000, 50000, 60000, 80000, 100000],
    fuente: "3GPP: n77 3300-4200 MHz TDD (superconjunto de n78); anchos NR 10/15/20/40/50/60/80/100 MHz.",
    region: "EE. UU., CN, JP, otros",
  },
  "celular-n79": {
    id: "celular-n79",
    medio: "celular",
    etiqueta: "Banda n79 (4700 MHz) — TDD NR",
    centroKhz: 4700000,
    inicioKhz: 4400000,
    finKhz: 5000000,
    anchosTipicosKhz: [10000, 15000, 20000, 40000, 50000, 60000, 80000, 100000],
    fuente: "3GPP: n79 4400-5000 MHz TDD; anchos NR 10/15/20/40/50/60/80/100 MHz.",
    region: "JP, CN, otros",
  },
};

/** Lista plana de todas las bandas para iteración. */
export const LISTA_BANDAS: readonly BandaConocida[] = Object.values(BANDAS_CONOCIDAS);

/** Devuelve la banda que contiene la frecuencia (kHz), o null si ninguna. */
export function bandaDeFrecuencia(khz: number): BandaConocida | null {
  if (!Number.isFinite(khz) || khz <= 0) return null;
  for (const banda of LISTA_BANDAS) {
    if (khz >= banda.inicioKhz && khz <= banda.finKhz) return banda;
  }
  return null;
}

/** Convierte canal Wi-Fi a frecuencia central en kHz. */
export function frecuenciaDeCanalWifi(banda: "2.4" | "5" | "6", canal: number): number | null {
  if (!Number.isInteger(canal) || canal <= 0) return null;
  if (banda === "2.4") {
    if (canal < 1 || canal > 14) return null;
    // Centro = 2407 + 5 * canal (MHz) → kHz; canal 14 = 2484 MHz (Japón)
    const centroMhz = canal === 14 ? 2484 : 2407 + 5 * canal;
    return centroMhz * 1000;
  }
  if (banda === "5") {
    // Canales 5 GHz: centro = 5000 + 5 * canal (MHz)
    if (canal < 36 || canal > 177) return null;
    // Solo canales válidos (múltiplos de 4 en UNII, pero aceptamos cualquier 36-177)
    const centroMhz = 5000 + 5 * canal;
    return centroMhz * 1000;
  }
  if (banda === "6") {
    // Canales 6 GHz: centro = 5935 + 5 * (canal - 1) (MHz), canal 1 = 5935 MHz
    if (canal < 1 || canal > 233) return null;
    const centroMhz = 5935 + 5 * (canal - 1);
    return centroMhz * 1000;
  }
  return null;
}

/** Convierte frecuencia en kHz al canal Wi-Fi más cercano (null si fuera de rango). */
export function canalDeFrecuenciaWifi(banda: "2.4" | "5" | "6", khz: number): number | null {
  if (!Number.isFinite(khz) || khz <= 0) return null;
  const mhz = khz / 1000;
  if (banda === "2.4") {
    if (mhz < 2401 || mhz > 2484) return null;
    // Canal 14 especial (2484 MHz)
    if (mhz >= 2482) return 14;
    const canal = Math.round((mhz - 2407) / 5);
    return canal >= 1 && canal <= 13 ? canal : null;
  }
  if (banda === "5") {
    if (mhz < 5150 || mhz > 5850) return null;
    const canal = Math.round((mhz - 5000) / 5);
    return canal >= 36 && canal <= 177 ? canal : null;
  }
  if (banda === "6") {
    if (mhz < 5935 || mhz > 7115) return null;
    const canal = Math.round((mhz - 5935) / 5) + 1;
    return canal >= 1 && canal <= 233 ? canal : null;
  }
  return null;
}

/** true si dos rangos de frecuencia se solapan. */
export function solapan(
  a: { frecuenciaKhz: number; anchoKhz: number },
  b: { frecuenciaKhz: number; anchoKhz: number },
): boolean {
  const aIni = a.frecuenciaKhz - a.anchoKhz / 2;
  const aFin = a.frecuenciaKhz + a.anchoKhz / 2;
  const bIni = b.frecuenciaKhz - b.anchoKhz / 2;
  const bFin = b.frecuenciaKhz + b.anchoKhz / 2;
  return aIni < bFin && bIni < aFin;
}

/** Etiqueta legible: «2,437 GHz», «868,1 MHz», «2,4 GHz» si es centro de banda. */
export function etiquetaFrecuencia(khz: number): string {
  if (!Number.isFinite(khz) || khz <= 0) return "?";
  const mhz = khz / 1000;
  if (mhz >= 1000) {
    const ghz = mhz / 1000;
    // 3 decimales si < 10 GHz, 2 si >= 10 (no aplica aquí)
    return `${ghz.toFixed(3).replace(".", ",")} GHz`;
  }
  // MHz con 1 decimal
  return `${mhz.toFixed(1).replace(".", ",")} MHz`;
}