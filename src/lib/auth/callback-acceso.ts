/**
 * Resultado del callback de acceso (`/auth/callback`) — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-11-19) El canje de `?code=` por sesión podía fallar de dos maneras —
 * Supabase devuelve `error` o el cliente lanza— y el `catch` vacío se las
 * tragaba las dos sin dejar rastro. Aquí se decide, sin tocar red ni cookies,
 * si hay sesión y qué línea debe quedar en el registro del servidor.
 *
 * Reglas del aviso:
 *  · sin código no se anota nada (abrir `/auth/callback` a mano no es un error);
 *  · el mensaje del fallo se recorta, se deja en una línea y se tapan los
 *    valores de `code`, `token`, `access_token` y `refresh_token` (nunca
 *    pueden acabar en un log);
 *  · el código que llega por la URL no se incluye jamás en el aviso.
 */

export type ResultadoIntercambio =
    | { tipo: "exito" }
    | { tipo: "rechazado"; error: unknown }
    | { tipo: "excepcion"; error: unknown };

export interface EvaluacionCallback {
    /** Hay sesión: se puede entrar a `next`. */
    exito: boolean;
    /** Línea para el registro del servidor; `null` si no hay nada que anotar. */
    aviso: string | null;
}

/** Decide el destino del callback a partir del resultado del canje. */
export function evaluarCallback(
    code: string | null,
    resultado: ResultadoIntercambio | null,
): EvaluacionCallback {
    if (!code) return { exito: false, aviso: null };
    if (!resultado) {
        return { exito: false, aviso: "callback de acceso: el canje no devolvió resultado" };
    }
    if (resultado.tipo === "exito") return { exito: true, aviso: null };
    if (resultado.tipo === "rechazado") {
        return { exito: false, aviso: conDetalle("callback de acceso: Supabase rechazó el canje", resultado.error) };
    }
    return { exito: false, aviso: conDetalle("callback de acceso: excepción al canjear el código", resultado.error) };
}

function conDetalle(base: string, error: unknown): string {
    const detalle = mensajeCorto(error);
    return detalle ? `${base} («${detalle}»)` : base;
}

const LARGO_AVISO = 160;
const SECRETOS = /(access_token|refresh_token|code|token)=[^&\s"']+/gi;

function textoDe(error: unknown): string {
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const mensaje = (error as { message?: unknown }).message;
        if (typeof mensaje === "string") return mensaje;
    }
    return "";
}

/** Un mensaje de una sola línea, sin secretos y sin pasarse de largo. */
function mensajeCorto(error: unknown): string {
    const limpio = textoDe(error)
        .replace(SECRETOS, "$1=***")
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!limpio) return "";
    return limpio.length > LARGO_AVISO ? `${limpio.slice(0, LARGO_AVISO - 1)}…` : limpio;
}
