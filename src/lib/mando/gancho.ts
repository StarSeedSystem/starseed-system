/**
 * Lógica pura del gancho HTTP de los Flujos de Genesis (§3 del contrato).
 *
 * La ruta `POST /api/flujos/gancho/[ruta]` solo decide y escribe; aquí vive lo
 * comprobable sin red ni disco: la verificación HMAC (idéntica a la de
 * `scripts/puente/produccion_webhooks.verificar_firma`), el saneado del nombre
 * de ruta y la construcción del evento que `disparadores.py` consume.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const CABECERA_FIRMA = "x-starseed-firma";
const PREFIJO = "sha256=";

/** HMAC-SHA256 hexadecimal del cuerpo con el secreto (la firma esperada). */
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
 * El parámetro `[ruta]` se reduce a letras, dígitos, «-» y «_»; cualquier otra
 * cosa (puntos, separadores de carpeta…) devuelve null: nunca toca el disco.
 */
export function sanitizarRuta(ruta: string): string | null {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ruta)) return null;
    return ruta;
}

/** Nombre del archivo de entrada: `<ts>-<ruta>.json`. */
export function nombreArchivoEntrada(ruta: string, epochMs: number): string {
    return `${Math.trunc(epochMs)}-${ruta}.json`;
}

export interface EventoGancho {
    ruta: string;
    recibido: string;
    cuerpo: unknown;
}

/** El evento que se guarda para el motor: cuerpo más su procedencia. */
export function construirEvento(ruta: string, cuerpo: unknown, ahora = new Date()): EventoGancho {
    return { ruta, recibido: ahora.toISOString(), cuerpo };
}
