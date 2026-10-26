/**
 * StarSeed OS — Oído ambiental (earshot) · decisión de envío (EAR1023B).
 * Contrato: architecture/repos-3d-oido-agentes-1023.md §3 (reglas duras).
 *
 * Decisión PURA: dado el estado de los sentidos, la detección de voz del
 * flujo (src/lib/aurora/stt-oss/oido-flujo.ts) y la energía del fragmento,
 * dice si un tramo de audio va al servicio de oído (EAR1023A). Sin red,
 * sin disco, sin procesos: entrada → salida.
 *
 * Reglas: solo con los sentidos encendidos y la escucha activa; solo
 * fragmentos SIN voz (la voz la lleva el reconocimiento de habla); solo
 * sobre un umbral de energía; como mucho uno cada N segundos; nada sale
 * de las neuronas de la persona.
 */

export interface EstadoSentidos {
  /** Ajuste de sentidos del agente o de la orbe flotante. */
  encendidos: boolean;
  /** «Siempre escuchando»: sin esto no hay oído ambiental en ningún caso. */
  siempreEscuchando: boolean;
}

export interface DecisionOido {
  /** Enviar el tramo al servicio de oído (EAR1023A). */
  enviar: boolean;
  /** Motivo de la decisión, en español, para el registro del agente. */
  motivo: string;
}

export interface EntradaOido {
  sentidos: EstadoSentidos;
  /** Detección de voz del flujo: si hay voz, el tramo NO va al oído. */
  hayVoz: boolean;
  /** Energía (RMS normalizada 0–1) del fragmento. */
  energia: number;
  /** Umbral debajo del cual un fragmento es silencio y no interesa. */
  umbralEnergia: number;
  /** Segundos desde el último envío al servicio de oído. */
  tiempoDesdeUltimoEnvio: number;
  /** Separación mínima en segundos entre envíos (ahorro de CPU). */
  intervaloMinimoSegundos: number;
}

export function decidirEnvioOido(entrada: EntradaOido): DecisionOido {
  if (!entrada.sentidos.encendidos) {
    return { enviar: false, motivo: "sentidos apagados" };
  }
  if (!entrada.sentidos.siempreEscuchando) {
    return { enviar: false, motivo: "sin escucha activa" };
  }
  if (entrada.hayVoz) {
    return { enviar: false, motivo: "el tramo lleva voz: va por el reconocimiento de habla" };
  }
  if (!Number.isFinite(entrada.energia) || entrada.energia < entrada.umbralEnergia) {
    return { enviar: false, motivo: "por debajo del umbral de energía (silencio)" };
  }
  if (entrada.tiempoDesdeUltimoEnvio < entrada.intervaloMinimoSegundos) {
    return {
      enviar: false,
      motivo: `aún no pasan ${entrada.intervaloMinimoSegundos} s desde el último envío`,
    };
  }
  return { enviar: true, motivo: "tramo sin voz, con energía suficiente y a separación regulada" };
}
