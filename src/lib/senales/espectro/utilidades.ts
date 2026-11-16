/**
 * utilidades — funciones auxiliares del espectrómetro (MRA2/MAP1116).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin red, sin `node:*`.
 */

import { POSICION_VIVA_MS } from "../geo/modelo-geo";
import type { SenalEspectro } from "./tipos";

/** Antigüedad en ms de la señal (ahora - medidoEn). Null si no hay hora. */
export function antiguedadMs(s: SenalEspectro, ahora: number): number | null {
  if (s.medidoEn === null || !Number.isFinite(s.medidoEn) || !Number.isFinite(ahora)) return null;
  return ahora - s.medidoEn;
}

/** true si la señal se midió hace ≤ POSICION_VIVA_MS (3 min). */
export function esViva(s: SenalEspectro, ahora: number): boolean {
  const edad = antiguedadMs(s, ahora);
  return edad !== null && edad <= POSICION_VIVA_MS;
}

/** Clave estable para deduplicar: medio|banda|frecuencia|ancho|zona|vinculoTipo|vinculoId. */
export function claveSenal(s: SenalEspectro): string {
  const partes = [
    s.medio,
    s.banda,
    s.frecuenciaKhz?.toString() ?? "null",
    s.anchoKhz?.toString() ?? "null",
    s.zona ?? "null",
    s.vinculo?.tipo ?? "null",
    s.vinculo?.id ?? "null",
  ];
  return partes.join("|");
}