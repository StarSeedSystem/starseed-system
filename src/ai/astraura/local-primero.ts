/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · LOCAL PRIMERO (Ola 1003 · §19 «Local preferente»)
 * ---------------------------------------------------------------------------
 * Decisión de Alex (2026-10-03): «que sea preferente el uso local».
 * Dos piezas PURAS, sin red ni disco:
 *   · `localPrimeroDelta` — empujón aditivo (+4) en el ranking para CUALQUIER
 *     fuente de tier "local" (no solo Astraura 1.58, que ya tiene su propio
 *     boost en `local158PriorityDelta`). Se retira en tareas difíciles o de
 *     visión, igual que el boost 1.58.
 *   · `migrarLocalPrimero` — migración única de ajustes persistidos: apaga
 *     OmniRoute (gateway externo) una sola vez para que el arranque por
 *     defecto sea local. Idempotente con la marca `migracionLocal: 1`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Empujón aditivo del ranking para fuentes locales cuando «local preferente» está ON. */
export const EMPUJON_LOCAL = 4;

/**
 * Boost «local primero»: suma `EMPUJON_LOCAL` a las fuentes de tier local en
 * tareas normales. Devuelve 0 (sin nota) cuando NO aplica: preferencia apagada,
 * fuente que no es local, fuentes `astraura-158*` (ya tienen
 * `local158PriorityDelta`, no se duplica), tareas de visión o difíciles
 * (`difficulty >= strongThreshold`). Pura y defensiva.
 */
export function localPrimeroDelta(o: {
  tier: string;
  sourceId: string;
  difficulty: number;
  needsVision: boolean;
  strongThreshold: number;
  preferirLocal: boolean;
}): { delta: number; note?: string } {
  if (!o.preferirLocal) return { delta: 0 };
  if (o.tier !== "local") return { delta: 0 };
  if (o.sourceId.startsWith("astraura-158")) return { delta: 0 }; // ya tiene su boost propio
  if (o.needsVision) return { delta: 0 };
  const hi = Math.max(0.3, Math.min(0.95, o.strongThreshold));
  if (o.difficulty >= hi) return { delta: 0 };
  return { delta: EMPUJON_LOCAL, note: "local primero" };
}

/**
 * Migración única «local preferente»: si el objeto persistido aún no tiene
 * `migracionLocal === 1`, devuelve una copia con `omniRoute.enabled: false`
 * (conservando el resto de subclaves, p. ej. `endpoint`) y la marca puesta.
 * Si ya está migrado, devuelve el mismo objeto sin tocar. Pura.
 */
export function migrarLocalPrimero(p: Record<string, unknown>): Record<string, unknown> {
  if (p.migracionLocal === 1) return p;
  const omni = (p.omniRoute && typeof p.omniRoute === "object" ? p.omniRoute : {}) as Record<string, unknown>;
  return { ...p, omniRoute: { ...omni, enabled: false }, migracionLocal: 1 };
}
