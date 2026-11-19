/**
 * Qué se hace cuando el callback de acceso no puede canjear el `?code=` — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * El `catch` del callback no puede quedarse vacío: si Supabase rechaza el código o la llamada
 * lanza (red caída, cookies), el alta por correo quedaría rota sin dejar rastro. Aquí se decide
 * a dónde volver y se obtiene un motivo breve y seguro para el registro del servidor y la URL.
 *
 * El motivo NUNCA es el mensaje del error: puede traer tokens o datos de la cuenta. Se usa el
 * `code` de Supabase o, si no lo hay, el nombre del error, recortado a `LARGO_MAX_MOTIVO`.
 */

export const RUTA_ERROR_CALLBACK = "/login?error=auth-callback";
export const LARGO_MAX_MOTIVO = 64;

/** Motivo breve y sin contenido sensible: `sin-codigo` si no hubo error que canjear. */
export function motivoFalloAuth(error: unknown): string {
    if (error == null) return "sin-codigo";
    if (error instanceof Error) {
        const codigo = (error as { code?: unknown }).code;
        if (typeof codigo === "string" && codigo.trim()) return codigo.trim().slice(0, LARGO_MAX_MOTIVO);
        return (error.name || "Error").slice(0, LARGO_MAX_MOTIVO);
    }
    return "desconocido";
}

/** Vuelta al acceso con el error y su motivo, listo para `NextResponse.redirect`. */
export function destinoFalloCallback(error?: unknown): string {
    return `${RUTA_ERROR_CALLBACK}&motivo=${encodeURIComponent(motivoFalloAuth(error))}`;
}
