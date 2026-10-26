/**
 * Elección del formato de la grabación (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * `MediaRecorder` no tiene un formato único: Chrome/Edge/Firefox graban WebM (VP9/VP8), Safari y
 * Chrome reciente también MP4 (H.264). Se prueba, en orden, lo que el propio navegador dice
 * soportar (`MediaRecorder.isTypeSupported`) y se usa el primero.
 *
 * Orden «auto»: WebM primero (VP9 da más calidad por MB, y la Biblioteca admite 50 MB); si el
 * navegador solo sabe MP4 (Safari), MP4. Orden «mp4»: MP4 primero, porque se reproduce en
 * cualquier aparato sin convertir (a costa de un archivo algo mayor).
 */

import { BPS_AUDIO, CALIDADES, type CalidadGrabacion, type PreferenciaFormato } from "./tipos";

export interface FormatoElegido {
  /** Tipo completo con códecs; `undefined` = que el navegador decida. */
  mimeType: string | undefined;
  extension: "webm" | "mp4";
  contenedor: "webm" | "mp4";
}

export function candidatosDeVideo(conAudio: boolean, preferencia: PreferenciaFormato): string[] {
  const webm = conAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=h264,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm;codecs=h264", "video/webm"];
  const mp4 = conAudio
    ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"]
    : ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"];
  return preferencia === "mp4" ? [...mp4, ...webm] : [...webm, ...mp4];
}

/** «video/mp4;codecs=…» → «mp4»; «video/webm» → «webm»; lo desconocido → «webm». */
export function extensionDeMime(mime: string | null | undefined): "webm" | "mp4" {
  return /mp4|quicktime/i.test(mime ?? "") ? "mp4" : "webm";
}

/** Quita los parámetros: «video/webm;codecs=vp9,opus» → «video/webm». */
export function mimeBase(mime: string | null | undefined, porDefecto = "video/webm"): string {
  const base = (mime ?? "").split(";")[0].trim().toLowerCase();
  return base || porDefecto;
}

/**
 * Primer formato que el navegador soporta. Sin `esSoportado` (navegador muy viejo) o sin ninguna
 * coincidencia, `mimeType` queda indefinido y el navegador usa el suyo (la extensión final sale
 * del `mimeType` REAL del grabador, no de aquí).
 */
export function elegirFormato(
  esSoportado: ((mime: string) => boolean) | null | undefined,
  conAudio: boolean,
  preferencia: PreferenciaFormato = "auto",
): FormatoElegido {
  if (typeof esSoportado === "function") {
    for (const candidato of candidatosDeVideo(conAudio, preferencia)) {
      let vale = false;
      try {
        vale = esSoportado(candidato) === true;
      } catch {
        vale = false;
      }
      if (vale) {
        const ext = extensionDeMime(candidato);
        return { mimeType: candidato, extension: ext, contenedor: ext };
      }
    }
  }
  return { mimeType: undefined, extension: "webm", contenedor: "webm" };
}

/** ¿El navegador sabe grabar MP4 Y WebM? (si solo uno, no tiene sentido ofrecer la preferencia). */
export function ofreceAmbosFormatos(esSoportado: ((mime: string) => boolean) | null | undefined): boolean {
  if (typeof esSoportado !== "function") return false;
  const prueba = (m: string) => {
    try {
      return esSoportado(m) === true;
    } catch {
      return false;
    }
  };
  return prueba("video/mp4") && prueba("video/webm");
}

/** Bytes por minuto aproximados de una calidad (vídeo + audio opcional). */
export function bytesPorMinuto(calidad: CalidadGrabacion, conAudio: boolean): number {
  const bps = CALIDADES[calidad].bps + (conAudio ? BPS_AUDIO : 0);
  return Math.round((bps / 8) * 60);
}

/** Minutos que caben en `limiteBytes` con esa calidad (un decimal). */
export function minutosHastaElLimite(calidad: CalidadGrabacion, conAudio: boolean, limiteBytes: number): number {
  return Math.round((limiteBytes / bytesPorMinuto(calidad, conAudio)) * 10) / 10;
}
