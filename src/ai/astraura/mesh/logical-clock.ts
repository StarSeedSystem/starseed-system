"use client";

/**
 * StarSeed OS — RELOJ LÓGICO (Lamport) para orden entre pares (Adenda 115).
 * ============================================================================
 * Los relojes de pared de las neuronas se desincronizan; la marca de agua por
 * `at` (epoch ms) puede reordenar mal. Un reloj lógico de Lamport da un orden
 * causal estable: se incrementa en cada evento local (`tick`) y, al recibir un
 * valor remoto, se avanza a `max(local, remoto) + 1` (`observe`). Se estampa en
 * los envelopes salientes y se observa en la recepción; el receptor/servidor
 * puede ordenar por `lc` cuando está presente (con `at` como desempate).
 *
 * Persistido para sobrevivir recargas. Módulo LIVIANO. SSR-safe. Nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const LOGICAL_CLOCK_KEY = "starseed.mesh.lclock.v1";

let counter = -1; // -1 = aún no cargado

function load(): number {
  if (counter >= 0) return counter;
  try {
    const raw = safeGet(LOGICAL_CLOCK_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    counter = Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    counter = 0;
  }
  return counter;
}

function persist(): void {
  try { safeSet(LOGICAL_CLOCK_KEY, String(counter)); } catch { /* */ }
}

/** Evento local: incrementa y devuelve el nuevo valor (para estampar salientes). */
export function tick(): number {
  load();
  counter += 1;
  persist();
  return counter;
}

/** Recepción de un valor remoto: clock = max(local, remoto) + 1. Devuelve el nuevo. */
export function observe(remote: number): number {
  load();
  const r = Number.isFinite(remote) ? Math.max(0, Math.floor(remote)) : 0;
  counter = Math.max(counter, r) + 1;
  persist();
  return counter;
}

/** Valor actual sin incrementar. */
export function current(): number {
  return load();
}

/** Comparador causal estable: por `lc` y `at` como desempate. */
export function compareLamport(
  a: { lc?: number; at?: number },
  b: { lc?: number; at?: number },
): number {
  const la = typeof a.lc === "number" ? a.lc : -1;
  const lb = typeof b.lc === "number" ? b.lc : -1;
  if (la !== lb) return la - lb;
  return (a.at ?? 0) - (b.at ?? 0);
}

/** Solo pruebas: reinicia el reloj. */
export function _reset(v = 0): void {
  counter = Math.max(0, v);
  persist();
}
