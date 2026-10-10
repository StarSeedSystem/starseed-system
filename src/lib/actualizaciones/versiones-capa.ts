/**
 * Versión de cada capa que declara un medio (contrato §5 «Cada aparato dice qué tiene»).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Cada medio anuncia en la presencia en vivo (`src/lib/neurons/presencia.ts`, campo `v`) la
 * versión que tiene de cada capa. Llega de otros aparatos: se sanea siempre y una neurona con
 * varios medios declara, por capa, la versión más alta que tenga alguno de ellos.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import type { VersionesPorCapa } from "./capas";
import { CAPAS_ORDEN, NOMBRE_CAPA, compararVersiones, type CapaActualizacion } from "./manifiesto";

const VALIDA = /^[0-9A-Za-z._+-]{1,40}$/;

/** Solo capas conocidas con una versión corta y sin caracteres raros. Lo demás se descarta. */
export function sanearVersionesCapa(x: unknown): VersionesPorCapa {
  const out: VersionesPorCapa = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return out;
  for (const capa of CAPAS_ORDEN) {
    const v = (x as Record<string, unknown>)[capa];
    if (typeof v === "string" && VALIDA.test(v.trim())) out[capa] = v.trim();
  }
  return out;
}

/** Por capa, la versión más alta que declare alguno de los medios de una neurona. */
export function fusionarVersionesMedios(medios: readonly { v?: unknown }[]): VersionesPorCapa {
  const out: VersionesPorCapa = {};
  for (const m of medios) {
    const v = sanearVersionesCapa(m?.v);
    for (const capa of Object.keys(v) as CapaActualizacion[]) {
      const ya = out[capa];
      if (!ya || compararVersiones(v[capa] as string, ya) > 0) out[capa] = v[capa];
    }
  }
  return out;
}

/** «Datos 2026.10.10 · Interfaz 2026.10.10 · Sin conexión sin dato…», en el orden fijo de las capas. */
export function resumenVersionesTexto(v: VersionesPorCapa, capas: readonly CapaActualizacion[] = CAPAS_ORDEN): string {
  return capas.map((c) => `${NOMBRE_CAPA[c]} ${v[c] ?? "sin dato"}`).join(" · ");
}

/** Firma corta para saber si cambió algo (la presencia solo reenvía si cambia). */
export function firmaVersiones(v: VersionesPorCapa): string {
  return CAPAS_ORDEN.map((c) => v[c] ?? "").join("|");
}
