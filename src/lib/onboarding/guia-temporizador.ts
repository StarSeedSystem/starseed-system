/**
 * IMG-agentes-reimaginada-profunda-corregir-te-d1 (parte 1) — temporizador de
 * apertura automática de la guía de Aurora.
 *
 * Antes la guía se abría sola con un temporizador FIJO: expiraba y saltaba
 * encima de lo que la persona estuviera haciendo (navegando, escribiendo,
 * desplazando), sin su consentimiento. Ahora la apertura automática solo llega
 * cuando el aparato lleva un RESPIRO sin interacción: cada acción de la
 * persona (clic, tecla, rueda, toque, movimiento del ratón, desplazamiento)
 * rearma el temporizador, así que nadie navega con la guía abriéndose encima.
 * La guía sigue disponible a demanda (botón flotante, evento y helper global).
 *
 * Módulo puro: sin window, sin red, sin disco. El cableado de los oyentes vive
 * en `aurora-guide.tsx`.
 */

/** Respiro sin interacción que se pide antes de una apertura automática (ms). */
export const RESPIRO_APERTURA_MS = 900;

/** Eventos que cuentan como «la persona está usando el aparato». */
export const EVENTOS_INTERACCION = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "mousemove",
  "scroll",
] as const;

export type EventoInteraccion = (typeof EVENTOS_INTERACCION)[number];

/** ¿Este tipo de evento cuenta como interacción de la persona? */
export function esEventoInteraccion(tipo: string): boolean {
  return (EVENTOS_INTERACCION as readonly string[]).includes(tipo);
}

/**
 * ¿Puede la guía abrirse sola ahora mismo? Solo si la última interacción
 * conocida lleva al menos `umbralMs` atrás. Sin señal de interacción
 * (marcador a 0 o null — p. ej. antes de montar) se mantiene el comportamiento
 * de siempre: abrir. Un umbral inválido nunca da luz verde.
 */
export function puedeAbrirGuiaSola(
  ultimaInteraccionMs: number | null,
  ahoraMs: number,
  umbralMs: number = RESPIRO_APERTURA_MS,
): boolean {
  if (!Number.isFinite(umbralMs) || umbralMs < 0) return false;
  if (
    ultimaInteraccionMs === null ||
    !Number.isFinite(ultimaInteraccionMs) ||
    ultimaInteraccionMs <= 0
  ) {
    return true;
  }
  return ahoraMs - ultimaInteraccionMs >= umbralMs;
}
