/**
 * (Ola 221 · T3F) Recordatorio «retoma tu guía».
 *
 * Módulo PURO: decide, a partir del estado del rito y de la hora actual, si
 * tiene sentido mostrar un recordatorio para retomar la guía pospuesta con
 * «Saltar por ahora». Sin red, sin disco, sin efectos: entrada → salida.
 *
 * Regla del rito: nunca dejar al usuario en bucle. Por eso el recordatorio
 * SOLO aplica a un rito pospuesto (`skipped === true` con `skippedAt`
 * válido); un rito completado o uno que nunca se saltó no recuerdan nada.
 */

export interface EstadoRitoParaRecordatorio {
  completed: boolean;
  skipped?: boolean;
  skippedAt?: string | null;
}

/** Horas mínimas desde «Saltar por ahora» antes de recordar (por defecto: 24 h). */
export const HORAS_UMBRAL_RECORDATORIO_POR_DEFECTO = 24;

/**
 * ¿Hay que ofrecer retomar la guía? Devuelve true solo cuando:
 *  - el rito NO está completado,
 *  - está pospuesto (`skipped === true`),
 *  - `skippedAt` es una fecha válida, y
 *  - han pasado al menos `umbralHoras` desde entonces.
 * Cualquier dato corrupto (fecha inválida, futura lejana, faltante) → false:
 * ante la duda, no molestamos a la persona.
 */
export function debeRecordarRetomarGuia(
  estado: EstadoRitoParaRecordatorio,
  ahora: Date = new Date(),
  umbralHoras: number = HORAS_UMBRAL_RECORDATORIO_POR_DEFECTO,
): boolean {
  if (estado.completed) return false;
  if (estado.skipped !== true) return false;
  if (!estado.skippedAt) return false;
  const ts = Date.parse(estado.skippedAt);
  if (!Number.isFinite(ts)) return false;
  const ms = ahora.getTime() - ts;
  if (ms < 0) return false;
  return ms >= umbralHoras * 60 * 60 * 1000;
}
