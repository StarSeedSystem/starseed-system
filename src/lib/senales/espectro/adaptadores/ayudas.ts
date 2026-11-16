/**
 * ayudas — utilidades básicas del adaptador Wi-Fi (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { Medio } from "../modelo";

/** Genera un id determinista para una señal. */
export function generarId(medio: Medio, fuente: string, medidoEn: number): string {
  return `${medio}-${fuente}-${medidoEn}`.replace(/\s+/g, "-").toLowerCase();
}

/** Determina la banda Wi-Fi a partir de frecuencia en kHz (rangos amplios para cubrir bordes como ch14). */
export function bandaWifiDeKhz(khz: number): "2.4" | "5" | "6" | null {
  if (khz >= 2400000 && khz <= 2500000) return "2.4";
  if (khz >= 5150000 && khz <= 5850000) return "5";
  if (khz >= 5925000 && khz <= 7125000) return "6";
  return null;
}