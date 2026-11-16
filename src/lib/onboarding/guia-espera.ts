/**
 * Espera de la guía de Aurora (rito · no interrumpir la navegación).
 * ═══════════════════════════════════════════════════════════════════════════
 * La guía NO debe abrirse encima de alguien que está actuando: cada clic, scroll,
 * tecla o movimiento del puntero reinicia la espera. Este módulo es la parte pura
 * (entrada → salida, sin DOM ni temporizadores) y `use-timeout-interaction.ts` la
 * conecta a los eventos reales del navegador.
 */

/** Tiempo de quietud que debe pasar antes de abrir algo por iniciativa propia. */
export const PACIENCIA_GUIA_MS = 3_000;

/**
 * ¿Hubo una interacción lo bastante reciente como para no interrumpir?
 * Sin interacción previa (`null`) no hay nada que respetar. Una marca futura
 * (reloj que retrocede) tampoco interrumpe: se trata como «no reciente».
 */
export function interaccionReciente(
  ultimaInteraccionMs: number | null,
  ahoraMs: number,
  pacienciaMs: number = PACIENCIA_GUIA_MS,
): boolean {
  if (ultimaInteraccionMs === null) return false;
  if (!Number.isFinite(ultimaInteraccionMs) || !Number.isFinite(ahoraMs)) return false;
  const transcurrido = ahoraMs - ultimaInteraccionMs;
  if (transcurrido < 0) return false;
  return transcurrido < pacienciaMs;
}

/**
 * Milisegundos que faltan para que se cumpla la quietud exigida. Nunca devuelve
 * un número negativo: si la paciencia ya pasó (o es inválida), se dispara ya.
 */
export function esperaHastaSilencio(
  ultimaInteraccionMs: number | null,
  ahoraMs: number,
  pacienciaMs: number = PACIENCIA_GUIA_MS,
): number {
  const paciencia = Number.isFinite(pacienciaMs) ? Math.max(0, pacienciaMs) : PACIENCIA_GUIA_MS;
  if (ultimaInteraccionMs === null) return paciencia;
  if (!Number.isFinite(ultimaInteraccionMs) || !Number.isFinite(ahoraMs)) return paciencia;
  const transcurrido = ahoraMs - ultimaInteraccionMs;
  // Marca futura (reloj que retrocede): no hay quietud que esperar.
  if (transcurrido < 0) return 0;
  return Math.max(0, paciencia - transcurrido);
}
