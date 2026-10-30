/**
 * Interrupción por voz (Ola 1015V · Plática).
 *
 * Detector PURO por energía con histéresis: la persona que habla más de
 * `minimoMs` mientras Astraura habla debe cortarla. No lanza excepciones,
 * no toca red, disco ni procesos; respeta `esEcoPropio` / `ventanaEcoMs`
 * de `anti-bucle-voz.ts` para no cortarse con su propio eco.
 */

import { esEcoPropio, ventanaEcoMs } from "./anti-bucle-voz";

export interface EstadoInterrupcion {
  /** ¿Astraura está hablando? */
  hablando: boolean;
  /** Cuándo empezó a hablar esta frase (ms), o undefined. */
  inicioHablaMs?: number;
  /** Cuándo calló la última vez (ms), o undefined. */
  ultimoCalladoMs?: number;
  /** Si el último tramo detectado era eco propio. */
  esEco?: boolean;
}

export interface OpcionesInterrupcion {
  umbralDb: number;
  minimoMs: number;
}

/** Un tramo de audio capturado del micrófono mientras Astraura habla. */
export interface MuestraVoz {
  /** Energía normalizada del tramo (0..1). */
  energia: number;
  /** Marca temporal del tramo (ms desde un punto de referencia). */
  ms: number;
}

export function decidirInterrupcion(
  muestras: MuestraVoz[],
  estado: EstadoInterrupcion,
  opciones: OpcionesInterrupcion,
): boolean {
  // No interrumpe si Astraura no está hablando o si es eco propio.
  if (!estado.hablando) return false;
  if (estado.esEco) return false;

  const umbral = opciones.umbralDb;
  const minMs = opciones.minimoMs;
  let inicioSuperado: number | null = null;

  for (const m of muestras) {
    if (!Number.isFinite(m.energia) || !Number.isFinite(m.ms)) continue;
    if (m.energia > umbral) {
      if (inicioSuperado === null) inicioSuperado = m.ms;
      // Histéresis: mantenido por encima del umbral al menos `minimoMs`.
      if (m.ms - inicioSuperado >= minMs) {
        // Respetar ventana de eco tras callar (propio eco, no usuario).
        if (
          estado.ultimoCalladoMs !== undefined &&
          Number.isFinite(estado.ultimoCalladoMs)
        ) {
          try {
            const ventana = ventanaEcoMs({ movil: false });
            if (m.ms - estado.ultimoCalladoMs < ventana) {
              // Dentro del período de eco posible: no corta.
              return false;
            }
          } catch { /* ventana nunca bloquea la interrupción */ }
        }
        return true;
      }
    } else {
      // Baja del umbral: resetea la histéresis.
      inicioSuperado = null;
    }
  }
  return false;
}
