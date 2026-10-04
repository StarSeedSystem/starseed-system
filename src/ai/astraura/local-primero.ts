/**
 * LOCAL PRIMERO (Ola 1003 · decisión de Alex 2026-10-03: «que sea preferente el
 * uso local»). Empujón aditivo genérico a las fuentes con tier "local" del
 * catálogo (las 1.58 ya tienen su propio boost en `local158PriorityDelta` y
 * quedan fuera para no duplicar) y migración de una sola vez que apaga
 * OmniRoute por defecto. Puro: sin I/O ni imports del router.
 */
export const EMPUJON_LOCAL = 4;

/**
 * Delta del ranking para empujar las fuentes LOCALES genéricas cuando
 * `preferirLocal` está activo. Devuelve `{ delta: 0 }` si:
 *  · el usuario apagó la preferencia (`preferirLocal: false`),
 *  · la fuente no es de tier "local",
 *  · la fuente es 1.58 (`astraura-158-*`, esas usan `local158PriorityDelta`),
 *  · la tarea necesita visión, o
 *  · la tarea es difícil (`difficulty >= strongThreshold`) — ahí mandan los
 *    modelos fuertes vía `difficultyAdjustment`.
 * En otro caso: `{ delta: EMPUJON_LOCAL, note: "local primero" }`.
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
  if (o.sourceId.startsWith("astraura-158")) return { delta: 0 };
  if (o.needsVision) return { delta: 0 };
  const hi = Math.max(0.3, Math.min(0.95, o.strongThreshold));
  if (o.difficulty >= hi) return { delta: 0 };
  return { delta: EMPUJON_LOCAL, note: "local primero" };
}

/**
 * Migración de una sola vez: si `p.migracionLocal !== 1`, devuelve una COPIA
 * de los ajustes con `omniRoute.enabled: false` (conservando el endpoint y
 * demás subclaves) y `migracionLocal: 1`; si ya migró, devuelve `p` igual.
 */
export function migrarLocalPrimero(p: Record<string, unknown>): Record<string, unknown> {
  if (p.migracionLocal === 1) return p;
  const omni = p.omniRoute && typeof p.omniRoute === "object" ? (p.omniRoute as Record<string, unknown>) : {};
  return { ...p, omniRoute: { ...omni, enabled: false }, migracionLocal: 1 };
}
