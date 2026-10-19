/**
 * Lógica pura de los ganchos HTTP firmados por ámbito de Genesis.
 *
 * Similar a `src/lib/mando/gancho.ts` pero con:
 * - Secreto propio por ámbito (proporcionado como argumento).
 * - Firma `X-StarSeed-Firma: sha256=...` de entrada y de salida.
 * - Ventana anti-repetición de 5 minutos con marca de tiempo.
 * - Destino en el ámbito (no en el disco de la Mac).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const CABECERA_FIRMA = "x-starseed-firma";
export const CABECERA_TIMESTAMP = "x-starseed-timestamp";
export const PREFIJO = "sha256=";
const VENTANA_ANTI_REPETICION_MS = 5 * 60 * 1000; // 5 minutos

/**
 * HMAC-SHA256 hexadecimal del cuerpo con el secreto (la firma esperada).
 */
export function firmarCuerpo(cuerpo: string | Uint8Array, secreto: string): string {
    return createHmac("sha256", secreto).update(cuerpo).digest("hex");
}

/**
 * True si `cabecera` («sha256=<hex>») firma `cuerpo` con `secreto`.
 * Nunca lanza: cabecera ausente, secreto vacío o formato inesperado son False.
 * Comparación en tiempo constante.
 */
export function verificarFirma(
    cuerpo: string | Uint8Array,
    cabecera: string | null,
    secreto: string | undefined,
): boolean {
    if (!secreto || !cabecera || !cabecera.startsWith(PREFIJO)) return false;
    const recibida = cabecera.slice(PREFIJO.length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(recibida)) return false;
    const esperada = firmarCuerpo(cuerpo, secreto);
    return timingSafeEqual(Buffer.from(recibida, "hex"), Buffer.from(esperada, "hex"));
}

/**
 * Extrae y valida el timestamp de la cabecera.
 * Devuelve el timestamp en milisegundos si es válido y dentro de la ventana anti-repetición,
 * o null en caso contrario.
 */
export function validarTimestamp(
    cabeceraTimestamp: string | null,
    ahora = Date.now()
): number | null {
    if (!cabeceraTimestamp) return null;
    const tsNum = Number(cabeceraTimestamp);
    if (Number.isNaN(tsNum)) return null;
    const diff = Math.abs(ahora - tsNum);
    return diff <= VENTANA_ANTI_REPETICION_MS ? tsNum : null;
}

/**
 * Construye la cabecera de firma a partir del cuerpo y el secreto.
 */
export function construirCabeceraFirma(cuerpo: string | Uint8Array, secreto: string): string {
    return `${CABECERA_FIRMA}: ${PREFIJO}${firmarCuerpo(cuerpo, secreto)}`;
}

/**
 * Construye la cabecera de timestamp a partir de la fecha actual.
 */
export function construirCabeceraTimestamp(ahora = new Date()): string {
    return `${CABECERA_TIMESTAMP}: ${ahora.getTime()}`;
}