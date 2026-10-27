/**
 * SENTIDO DE OÍDO AMBIENTAL — puerta de decisión pura (Ola 1023X · EAR1023B)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato `architecture/repos-3d-oido-agentes-1023.md` §3: el oído (earshot)
 * solo con los sentidos ENCIendidos y la escucha ACTIVA; a EAR1023A van SOLO
 * fragmentos SIN voz (la voz ya la lleva el reconocimiento de habla del flujo
 * `src/lib/aurora/stt-oss/oido-flujo.ts`), solo si suena algo de verdad
 * (energía sobre el umbral) y como mucho uno cada N segundos para no gastar
 * CPU. Este módulo decide SI enviar; nada abre red ni disco ni guarda audio.
 */

export interface Sentidos {
  /** Ajuste de sentidos del agente de Astraura o de la orbe flotante. */
  encendidos: boolean;
  /** «Siempre escuchando»: sin esto el oído ambiental tampoco oye. */
  siempreEscuchando: boolean;
}

export interface TramoOido {
  /** Energía medida del tramo (RMS, 0…1). */
  energia: number;
  /** Detección de voz del flujo de habla: un partial/final llegó a captarse. */
  tieneVoz: boolean;
  /** Marca temporal del fragmento, en ms (viaja: sin reloj del sistema). */
  marcaMs: number;
}

export type MotivoOido =
  | "sin-tramo"
  | "sentidos-apagados"
  | "sin-escucha"
  | "con-voz"
  | "silencio-bajo"
  | "demasiado-pronto"
  | "tramo-limpio";

export interface DecisionOido {
  enviar: boolean;
  motivo: MotivoOido;
}

export const UMBAJO_ENERGIA = 0.06;
export const INTERVALO_MINIMO_MS = 30_000;

/**
 * Decide si un tramo de audio va al servicio de oído (EAR1023A). Pura:
 * entrada → salida, sin red, sin disco y sin reloj del sistema (la marca
 * del tramo y la del último envío viajan como argumentos).
 *
 * Orden de los cortes (cada uno audible en su `motivo`):
 *   1. tramo inexistente            → sin-tramo
 *   2. sentidos apagados            → sentidos-apagados
 *   3. sin «siempre escuchando»     → sin-escucha
 *   4. con voz (el flujo la lleva)  → con-voz
 *   5. energía bajo el umbral       → silencio-bajo
 *   6. menos de N segundos del anterior → demasiado-pronto
 *   7. todo dio paso                → tramo-limpio
 */
export function decidirEnvioOido(
  sentidos: Sentidos,
  tramo: TramoOido | null,
  ultimoEnviadoMs: number,
): DecisionOido {
  if (!tramo || !Number.isFinite(tramo.marcaMs)) {
    return { enviar: false, motivo: "sin-tramo" };
  }
  if (!sentidos.encendidos) {
    return { enviar: false, motivo: "sentidos-apagados" };
  }
  if (!sentidos.siempreEscuchando) {
    return { enviar: false, motivo: "sin-escucha" };
  }
  if (tramo.tieneVoz) {
    // La voz va al reconocimiento de habla, NUNCA al oído ambiental.
    return { enviar: false, motivo: "con-voz" };
  }
  if (!(tramo.energia > UMBAJO_ENERGIA)) {
    return { enviar: false, motivo: "silencio-bajo" };
  }
  const transcurrido = tramo.marcaMs - ultimoEnviadoMs;
  // `ultimoEnviadoMs` 0 o menos = nunca se envió nada aún.
  if (ultimoEnviadoMs > 0 && transcurrido < INTERVALO_MINIMO_MS) {
    return { enviar: false, motivo: "demasiado-pronto" };
  }
  return { enviar: true, motivo: "tramo-limpio" };
}

/**
 * Energía RMS de un tramo de muestras (−1…1): con silencio da 0 y con una
 * onda de amplitud constante da esa amplitud. Es lo que alimenta
 * `tramo.energia` antes de la decisión, sin tocar el audio en sí.
 */
export function energiaDe(muestras: Float32Array): number {
  if (muestras.length === 0) return 0;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) {
    suma += muestras[i] * muestras[i];
  }
  return Math.sqrt(suma / muestras.length);
}
