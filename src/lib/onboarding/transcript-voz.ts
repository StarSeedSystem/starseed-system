/**
 * Transcript de voz de Aurora para la guía — módulo PURO.
 *
 * `auroraTranscript()` leía el estado del puente dentro de un `catch` mudo: si
 * el puente lanzaba, la guía se quedaba sin comandos de voz y nadie sabía por
 * qué. Además concatenaba siempre un espacio, así que sin estado devolvía `" "`
 * (verdadero) y el sondeo creía que había texto nuevo.
 *
 * Aquí se decide, sin window, sin red y sin disco, cómo combinar las partes del
 * transcript y qué dejar en la consola cuando la lectura falla. Regla del rito:
 * nunca dejar al usuario en bucle — la guía sigue con sus botones.
 */

export const AVISO_TRANSCRIPT =
  "No pude leer la voz de Aurora; sigue con los botones para avanzar.";

export interface EstadoTranscript {
  transcript?: unknown;
  interim?: unknown;
}

export interface FalloTranscript {
  /** Línea para la consola del navegador. */
  diagnostico: string;
  /** Texto breve para la persona (la guía no se bloquea). */
  aviso: string;
}

const MAX_MENSAJE = 200;

/** Solo texto útil: recorta y descarta cualquier valor que no sea string. */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Combina `transcript` + `interim` en una sola cadena, sin espacios sobrantes.
 * Sin partes devuelve `""` (nunca `" "`), para que el sondeo sepa que no hay
 * nada nuevo que interpretar.
 */
export function combinarTranscript(
  estado: EstadoTranscript | null | undefined,
): string {
  if (!estado || typeof estado !== "object") return "";
  const transcript = texto(estado.transcript);
  const interim = texto(estado.interim);
  return [transcript, interim].filter(Boolean).join(" ");
}

function mensajeDe(error: unknown): string {
  if (typeof error === "string") return error.trim().slice(0, MAX_MENSAJE);
  if (error && typeof error === "object") {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") return m.trim().slice(0, MAX_MENSAJE);
  }
  return "";
}

/** Describe un fallo al leer el transcript: traza para consola y aviso breve. */
export function describirFalloTranscript(error: unknown): FalloTranscript {
  const mensaje = mensajeDe(error);
  return {
    aviso: AVISO_TRANSCRIPT,
    diagnostico: `[guia] no se pudo leer el transcript de Aurora${
      mensaje ? `: ${mensaje}` : ""
    }`,
  };
}
