/**
 * Anti-bucle de voz (2026-09-27): detector puro de eco propio, bucles y
 * repeticiones. Sin React, sin DOM, sin reloj propio: el tiempo entra por
 * parámetro para que las pruebas sean deterministas.
 *
 * Contexto: en la tablet la cola de la propia voz de Astraura entra por el
 * micro como si fuera el usuario y responde a sus propias palabras (bucle).
 * Además BitNet 2B sin penalización de repetición a veces genera la misma
 * frase varias veces seguidas.
 */

/** Segundos que se recuerda lo dicho por Astraura. */
const MEMORIA_DICHOS_MS = 45_000;
/** Máximo de textos dichos que se conservan. */
const MAX_DICHOS = 20;
/** Palabras mínimas para que una transcripción pueda considerarse eco. */
const MIN_PALABRAS_ECO = 3;
/** Porcentaje mínimo de palabras compartidas para considerar eco parcial. */
const RATIO_ECO = 0.6;
/** Tramo de palabras seguidas que delata el eco. */
const TRAMO_ECO = 4;
/** Turnos de voz seguidos tras los que se corta el bucle. */
const MAX_TURNOS_VOZ = 3;
/** Silencio máximo después de que ella calló para sospechar rebote. */
const REBOTE_MS = 4_000;
/** Parecido Jaccard mínimo entre una respuesta y una anterior para cortar. */
const JACCARD_REPETICION = 0.8;
/** Respuestas anteriores contra las que se compara la repetición. */
const RESPUESTAS_COMPARADAS = 2;
/** Tramo mínimo de palabras para detectar generación degenerada. */
const TRAMO_DEGENERADO = 6;
/** Repeticiones mínimas del tramo para considerar el texto degenerado. */
const VECES_DEGENERADO = 3;

export interface TurnoVoz {
  origen: "voz" | "texto";
  msDesdeQueCalló: number | null;
  respuesta: string;
  ahora: number;
}

export interface VeredictoTurno {
  cortar: boolean;
  motivo?: string;
}

export interface DetectorBucle {
  anotarTurno(turno: TurnoVoz): VeredictoTurno;
  reiniciar(): void;
}

export function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
