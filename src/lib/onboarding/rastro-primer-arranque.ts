/**
 * Rastro de consola para los catch de primer-arranque.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 227, src/lib/onboarding/onboarding.ts) Un fallo invisible dejaba el rito
 * en bucle. Aquí la misma cura para el componente: cada catch deja rastro en
 * consola para que la próxima vez se vea a la primera — sin bucles, sin red.
 * Sin React ni navegador: se prueba en Node.
 */

/** Mensaje legible y seguro de un error desconocido. Nunca lanza. */
export function textoDelError(error: unknown): string {
    try {
        if (error instanceof Error) return error.message || error.name;
        if (typeof error === "string") return error;
        const m = (error as { message?: unknown } | null)?.message;
        if (typeof m === "string" && m) return m;
        if (error === null || error === undefined) return "error desconocido";
        return String(error);
    } catch {
        return "error desconocido";
    }
}

/** Rastro de consola: `[primer-arranque] no se pudo <donde>: <detalle>`. */
export function rastroPrimerArranque(donde: string, error: unknown): string {
    return `[primer-arranque] no se pudo ${donde}: ${textoDelError(error)}`;
}
