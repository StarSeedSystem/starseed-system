/**
 * Plazo local aprendido para la ventana de carrera de Astraura (Ola 364 · Tarea TR1).
 *
 * Módulo PURO: sin I/O, sin red, sin claves. Aprende el plazo que
 * /api/astraura/conversacion debe esperar al primer token de BitNet (local)
 * antes de abrir la carrera con la nube, calculándolo con el percentil 80 de
 * los msPrimerToken de los turnos LOCALES de las últimas 40 medidas.
 */

/** Medida de un turno de conversación. */
export interface MedidaPlazo {
  /** true cuando el turno se atendió en el BitNet local de esta máquina. */
  local: boolean;
  /** Milisegundos hasta el primer token; null si no se obtuvo. */
  msPrimerToken: number | null;
}

/** Plazo por defecto al inicio, antes de aprender nada. */
export const PLAZO_DEFECTO_MS = 2800;

/** Límite inferior del plazo aprendido. */
export const PLAZO_MIN_MS = 1200;

/** Límite superior del plazo aprendido. */
export const PLAZO_MAX_MS = 6000;

/** Número máximo de medidas que se conservan. */
export const MAX_MEDIDAS = 40;

/** Mínimo de medidas locales con valor para confiar en el percentil. */
export const MIN_MEDIDAS_APRENDIZAJE = 5;

/**
 * Añade una medida a la lista y la recorta a `max`, dejando las más recientes.
 * Devuelve una nueva lista (no mutate la entrada).
 */
export function registrarMedida(
  lista: MedidaPlazo[],
  medida: MedidaPlazo,
  max: number = MAX_MEDIDAS,
): MedidaPlazo[] {
  const resultado = [...lista, medida];
  return resultado.length > max
    ? resultado.slice(resultado.length - max)
    : resultado;
}

/**
 * Percentil 80 por el método de rango próximo: ordena ascendentemente y
 * toma el valor en la posición ceil(0.8 · n) (1-indexado). Determinista y
 * sin interpolación: siempre devuelve un valor real de la muestra.
 */
function percentil80(valores: number[]): number {
  if (valores.length === 0) return NaN;
  const sorted = [...valores].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = Math.ceil(0.8 * n);
  const index = Math.max(0, Math.min(n - 1, rank - 1));
  return sorted[index];
}

/**
 * Plazo aprendido: percentil 80 de los msPrimerToken de los turnos LOCALES
 * de las últimas 40 medidas, acotado a [PLAZO_MIN_MS, PLAZO_MAX_MS].
 *
 * Con menos de MIN_MEDIDAS_APRENDIZAJE medidas locales con valor, devuelve
 * PLAZO_DEFECTO_MS (2800).
 */
export function plazoAprendido(medidas: MedidaPlazo[]): number {
  const recientes = medidas.slice(-MAX_MEDIDAS);
  const valores = recientes
    .filter(
      (m): m is MedidaPlazo & { msPrimerToken: number } =>
        m.local && typeof m.msPrimerToken === "number",
    )
    .map((m) => m.msPrimerToken);
  if (valores.length < MIN_MEDIDAS_APRENDIZAJE) return PLAZO_DEFECTO_MS;
  const p80 = percentil80(valores);
  return Math.min(PLAZO_MAX_MS, Math.max(PLAZO_MIN_MS, p80));
}
