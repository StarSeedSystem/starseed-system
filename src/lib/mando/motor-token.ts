import { createHash } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { aleatorios, aB64url } from "@/lib/bloqueo/b64url";

/**
 * Motor-token — token de motor para Mando para todos (PT1007D)
 * ------------------------------------------------------------
 *
 * El token SOLO se enseña una vez; en la base de datos solo vive su hash.
 * Módulo puro: sin red, sin disco, sin procesos lanzados, sin red.
 * Navega en el navegador, sirve en Node, sin `any`, defensivo (nunca lanza).
 */

export const CAPACIDADES_MOTOR = ["reportar", "recoger-tareas", "medidores", "chat-motor"] as const;

/** Formato exacto: ssm_ + base64url sin relleno de 32 bytes aleatorios (43 caracteres). */
const RE_FORMATO_TOKEN = /^ssm_[A-Za-z0-9_-]{43}$/;

/**
 * Crea un nuevo token, su hash SHA-256 en hex y la huella (primeros 8 chars del hash).
 * Devuelve el token (para mostrar), el hash (para guardar en DB) y la huella (para mostrar).
 */
export function crearTokenMotor(): { token: string; hash: string; huella: string } {
    const bytes = aleatorios(32);
    const token = `ssm_${aB64url(bytes)}`;
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    const huella = hash.slice(0, 8);
    return { token, hash, huella };
}

/**
 * Devuelve el hash SHA-256 en hex de un token (puro).
 */
export function hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * ¿El token coincide con el formato exacto `ssm_` + base64url de 32 bytes (43 chars)?
 */
export function formatoTokenValido(token: unknown): token is string {
    return typeof token === "string" && RE_FORMATO_TOKEN.test(token);
}

/**
     * ¿El hash SHA-256 de `token` coincide con `hash` esperado? Usa `timingSafeEqual`.
     * Nunca lanza: formato inválido, longitudes distintas, tipos raros → false.
     */
    export function verificarToken(token: unknown, hash: unknown): boolean {
        if (!formatoTokenValido(token) || typeof hash !== "string" || hash.length !== 64 || !/^[0-9a-f]{64}$/.test(hash)) {
            return false;
        }
        const hashCalculado = hashToken(token);
        if (hashCalculado.length !== 64) return false;
        const hashBytes = Buffer.from(hash, "hex");
        const hashCalculadoBytes = Buffer.from(hashCalculado, "hex");
        return timingSafeEqual(hashBytes, hashCalculadoBytes);
    }

/**
 * ¿Las capacidades pedidas son un subconjunto válido de las capacidades de motor?
 */
export function capacidadesMotorValidas(pedidas: unknown): { ok: boolean; invalidas: string[] } {
    if (!Array.isArray(pedidas) || !pedidas.every((c) => typeof c === "string")) {
        return { ok: false, invalidas: ["formato inválido"] };
    }
    const pedidasStr = pedidas as string[];
    const invalidas = pedidasStr.filter((c) => !CAPACIDADES_MOTOR.includes(c as (typeof CAPACIDADES_MOTOR)[number]));
    return { ok: invalidas.length === 0, invalidas };
}
