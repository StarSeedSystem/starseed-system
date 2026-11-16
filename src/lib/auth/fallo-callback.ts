/**
 * Por qué falló el callback de acceso (`/auth/callback`) — PURO.
 *
 * (IMG-profunda-catch-vacio-en-exchangecodefors) El `catch` de `exchangeCodeForSession` se tragaba
 * el error: la persona acababa en `/login?error=auth-callback` y en el registro del servidor no
 * quedaba ni una línea que dijera si el código había caducado, si el enlace ya se había usado o si
 * Supabase no respondió. Este módulo separa el MOTIVO (lo único que viaja en la URL y siempre es
 * un valor fijo de esta lista) del DETALLE (texto para el registro). El `?code=` NUNCA se registra:
 * es de un solo uso, pero sigue siendo material de sesión.
 */

export type MotivoFalloCallback = "auth-sin-codigo" | "auth-codigo-rechazado" | "auth-callback";

export interface EntradaFalloCallback {
    /** El `?code=` de la URL, tal cual (puede faltar). */
    code?: string | null;
    /** El `error` que devuelve `exchangeCodeForSession`, si lo hubo. */
    error?: { message?: string; code?: string; status?: number } | null;
    /** Lo lanzado por el intercambio (red caída, cliente sin configurar…). */
    excepcion?: unknown;
}

export interface FalloCallback {
    motivo: MotivoFalloCallback;
    /** Línea para el registro del servidor; describe la causa sin secretos. */
    detalle: string;
}

function texto(valor: unknown): string {
    return typeof valor === "string" ? valor.trim() : "";
}

function detalleDelError(error: EntradaFalloCallback["error"]): string {
    if (!error) return "";
    return [
        texto(error.message),
        texto(error.code),
        typeof error.status === "number" ? `estado ${error.status}` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

function detalleDeLaExcepcion(excepcion: unknown): string {
    if (excepcion === undefined || excepcion === null) return "";
    if (excepcion instanceof Error) {
        const mensaje = texto(excepcion.message);
        return mensaje ? `${excepcion.name}: ${mensaje}` : excepcion.name || "Error";
    }
    return texto(excepcion) || "excepción sin mensaje";
}

export function describirFalloCallback(entrada: EntradaFalloCallback): FalloCallback {
    const code = texto(entrada.code);
    const error = entrada.error ?? null;
    const detalle =
        (error ? detalleDelError(error) : "") ||
        detalleDeLaExcepcion(entrada.excepcion);
    // Sin `code` no hay nada que intercambiar: el enlace llegó incompleto o repetido.
    if (!code) return { motivo: "auth-sin-codigo", detalle };
    // Con `code` y respuesta de Supabase, el código no vale (caducado, ya usado, otro cliente).
    if (error) return { motivo: "auth-codigo-rechazado", detalle };
    // Con `code` y sin respuesta: el intercambio se cayó por el camino (red, cliente, servidor).
    return { motivo: "auth-callback", detalle };
}
