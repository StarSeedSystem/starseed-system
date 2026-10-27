/**
 * OÍDO AMBIENTAL — decisión pura de qué tramos de audio van al servicio de oído
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato: `architecture/repos-3d-oido-agentes-1023.md` §3.
 *
 * El servicio de oído (earshot, tarea EAR1023A) no reconoce voz: eso ya lo hace
 * `src/lib/aurora/stt-oss/oido-flujo.ts`. Aquí solo se decide si un fragmento
 * SIN voz merece viajar a la neurona que etiqueta sonidos, con cuatro frenos:
 *
 *  1. Los sentidos deben estar encendidos y la escucha activa (`siempreEscuchando`).
 *  2. El fragmento no puede contener voz (la voz es privada y ya tiene su flujo).
 *  3. Su energía debe superar el umbral (silencio no gasta CPU).
 *  4. Como mucho uno cada N milisegundos (el modelo es caro en CPU).
 *
 * Módulo PURO: sin `node:*`, sin red, sin disco. El llamador guarda el
 * `timestamp` del último envío aceptado y lo pasa como `ultimoEnvio`.
 */

export interface EstadoSentidos {
  /** Interruptor global de los sentidos del agente o de la orbe. */
  encendidos: boolean;
  /** Escucha continua: sin ella no hay oído ambiental en segundo plano. */
  siempreEscuchando: boolean;
}

export interface FragmentoAudio {
  /** Identificador del tramo, para trazar sin guardar el audio. */
  id: string;
  /** Detección de voz del flujo de `oido-flujo` (true = hay habla). */
  contieneVoz: boolean;
  /** Energía media normalizada del tramo (0…1). */
  energia: number;
  /** Instante del fragmento en milisegundos (mismo reloj que `ultimoEnvio`). */
  timestamp: number;
}

/** Motivo tipado del rechazo; nunca incluye audio ni datos de la persona. */
export type RazonNoEnviar =
  | "sentidos-apagados"
  | "escucha-inactiva"
  | "fragmento-invalido"
  | "contiene-voz"
  | "energia-insuficiente"
  | "intervalo-corto";

export interface DecisionOido {
  /** ¿El tramo va al servicio de oído? */
  enviarAlServicio: boolean;
  /** Presente solo cuando no se envía. */
  razon?: RazonNoEnviar;
}

/** Umbral de energía por defecto: por debajo es ruido de fondo o silencio. */
export const UMBRAL_ENERGIA_POR_DEFECTO = 0.02;

/** Intervalo por defecto entre envíos: 4 s bastan para etiquetar el ambiente. */
export const INTERVALO_MINIMO_MS_POR_DEFECTO = 4000;

/** Rechazo con su motivo, en una sola forma para que la UI sepa qué decir. */
function no(razon: RazonNoEnviar): DecisionOido {
  return { enviarAlServicio: false, razon };
}

/**
 * Decide si un fragmento de audio va al servicio de oído.
 *
 * @param estado            Sentidos del agente o de la orbe.
 * @param fragmento         Tramo ya analizado (sin subir audio a ninguna nube).
 * @param ultimoEnvio       `timestamp` del último envío aceptado, o `null`.
 * @param umbralEnergia     Energía mínima para considerar que hay sonido.
 * @param intervaloMinimoMs Espacio mínimo entre dos envíos (freno de CPU).
 */
export function decidirEnvioAlOido(
  estado: EstadoSentidos,
  fragmento: FragmentoAudio,
  ultimoEnvio: number | null,
  umbralEnergia: number = UMBRAL_ENERGIA_POR_DEFECTO,
  intervaloMinimoMs: number = INTERVALO_MINIMO_MS_POR_DEFECTO
): DecisionOido {
  // 1. Privacidad primero: sin sentidos o sin escucha continua, no se oye nada.
  if (!estado.encendidos) return no("sentidos-apagados");
  if (!estado.siempreEscuchando) return no("escucha-inactiva");

  // 2. Un tramo con números rotos no se manda: no se puede razonar sobre él.
  if (!Number.isFinite(fragmento.energia) || !Number.isFinite(fragmento.timestamp)) {
    return no("fragmento-invalido");
  }

  // 3. La voz ya viaja por el reconocimiento de habla; aquí nunca se duplica.
  if (fragmento.contieneVoz) return no("contiene-voz");

  // 4. Silencio o ruido muy bajo: no merece gastar CPU en la neurona.
  const umbral = Number.isFinite(umbralEnergia) ? umbralEnergia : UMBRAL_ENERGIA_POR_DEFECTO;
  if (fragmento.energia < umbral) return no("energia-insuficiente");

  // 5. Freno de frecuencia: un envío como mucho cada `intervaloMinimoMs`.
  const intervalo = Number.isFinite(intervaloMinimoMs) ? Math.max(0, intervaloMinimoMs) : 0;
  if (
    ultimoEnvio !== null &&
    Number.isFinite(ultimoEnvio) &&
    fragmento.timestamp - ultimoEnvio < intervalo
  ) {
    return no("intervalo-corto");
  }

  return { enviarAlServicio: true };
}
