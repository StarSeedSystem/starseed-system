/**
 * calidad — cálculos de calidad para el adaptador Wi-Fi (MAP1116B).
 * Puro: sin React, sin red, sin `node:*`.
 */

/** Convierte un rssi dBm a calidad 0..1 (aproximación típica Wi-Fi). */
export function calidadDeRssi(rssi: number): number {
  if (rssi >= -30) return 1;
  if (rssi <= -90) return 0;
  return (rssi + 90) / 60;
}

/** Convierte un rttMs a calidad 0..1 (reutiliza la lógica de malla). */
export function calidadDeRtt(rttMs: number): number {
  if (rttMs <= 10) return 1;
  if (rttMs >= 500) return 0;
  return 1 - (rttMs - 10) / 490;
}