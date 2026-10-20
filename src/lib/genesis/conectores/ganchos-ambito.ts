/**
 * Lógica pura del gancho firmado por ámbito para conectores externos.
 *
 * Firma HMAC-SHA256 con secreto propio por ámbito (guardado en la bóveda),
 * ventana anti-repetición de 5 minutos, cabecera `X-StarSeed-Firma: sha256=...`
 * y destino en el ámbito (no en el disco de la Mac).
 *
 * Contracto: `architecture/genesis-conectores-abiertos.md` §7.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const CABECERA_FIRMA = "x-starseed-firma";
const PREFIJO_FIRMA = "sha256=";
const VENTANA_ANTIREPETICION_MIN = 5 * 60 * 1000; // 5 minutos en ms

export interface SecretosAmbito {
  ambitoId: string;
  secreto: string;
  actualizado: string;
}

/**
 * Firma HMAC-SHA256 del cuerpo con el secreto del ámbito.
 * Solo nombres de variable, nunca el valor del secreto.
 */
export function firmarCuerpoAmbito(
  cuerpo: string | Uint8Array,
  secreto: string,
): string {
  return createHmac("sha256", secreto).update(cuerpo).digest("hex");
}

/**
 * Verifica firma HMAC-SHA256 y ventana anti-repetición (5 min).
 * Nunca lanza: formato de cabecera inválido o ventana anti-repetición es falso.
 * Comparación en tiempo constante para firma.
 */
export function verificarFirmaAmbito(
  cuerpo: string | Uint8Array,
  cabecera: string | null,
  secreto: string | undefined,
  timestamp?: number,
): boolean {
  if (!secreto || !cabecera || !cabecera.startsWith(PREFIJO_FIRMA)) return false;
  const recibida = cabecera.slice(PREFIJO_FIRMA.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recibida)) return false;

  const esperada = firmarCuerpoAmbito(cuerpo, secreto);
  const firmaValida = timingSafeEqual(
    Buffer.from(recibida, "hex"),
    Buffer.from(esperada, "hex")
  );
  if (!firmaValida) return false;

  // Anti-replay: si se proporcionó timestamp, verifícalo
  if (timestamp !== undefined) {
    const ahora = Date.now();
    const edad = ahora - timestamp;
    if (edad < 0 || edad > VENTANA_ANTIREPETICION_MIN) return false;
  }

  return true;
}

/**
 * La ruta `[ruta]` se reduce a letras, dígitos, «-» y «_»; cualquier otra
 * cosa (puntos, separadores de carpeta…) devuelve null: nunca toca el disco.
 */
export function sanitizarRutaAmbito(ruta: string): string | null {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ruta)) return null;
  return ruta;
}

/** Nombre del evento: `<ts>-<ambitoId>-<ruta>.json`. */
export function nombreArchivoEventoAmbito(
  ambitoId: string,
  ruta: string,
  epochMs: number,
): string {
  const ambitoSanitizado = ambitoId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const rutaSanitizada = sanitizarRutaAmbito(ruta);
  if (!rutaSanitizada) throw new Error("Ruta inválida para archivo de evento");
  return `${Math.trunc(epochMs)}-${ambitoSanitizado}-${rutaSanitizada}.json`;
}

export interface EventoGanchoAmbito {
  ambitoId: string;
  ruta: string;
  recibido: string;
  cuerpo: unknown;
  timestamp: number;
}

/** El evento que se guarda para el motor: cuerpo más su procedencia. */
export function construirEventoAmbito(
  ambitoId: string,
  ruta: string,
  cuerpo: unknown,
  ahora = new Date(),
): EventoGanchoAmbito {
  return {
    ambitoId,
    ruta,
    recibido: ahora.toISOString(),
    cuerpo,
    timestamp: ahora.getTime(),
  };
}