/**
 * Callback de acceso (`/auth/callback`): decidir destino y qué contar del fallo — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * El `catch` del canje de PKCE estaba vacío: un 402 de cuota o una red caída acababan en
 * `/login?error=auth-callback` sin dejar rastro. Aquí se distinguen los tres fallos y se
 * prepara una línea de log que NO incluye el `code` (es credencial de un solo uso).
 */

export const LARGO_MAX_DETALLE = 240;

export type MotivoCallback = "ok" | "sin-codigo" | "codigo-rechazado" | "fallo-red";

export interface EntradaCallback {
    origen: string;
    next: string;
    codigo: string | null;
    error?: { message?: string } | null;
    excepcion?: unknown;
}

export interface ResultadoCallback {
    destino: string;
    motivo: MotivoCallback;
    errorParaLog: string | null;
}

/** Un detalle legible: sin saltos de línea, recortado y sin volcar objetos enteros. */
function detalleSeguro(valor: unknown): string {
    let texto: string;
    if (typeof valor === "string") texto = valor;
    else if (valor instanceof Error) texto = valor.message || valor.name;
    else if (valor && typeof valor === "object" && "message" in valor) {
        const m = (valor as { message?: unknown }).message;
        texto = typeof m === "string" ? m : "";
    } else texto = "";
    const plano = texto.replace(/\s+/g, " ").trim();
    return (plano || "fallo desconocido").slice(0, LARGO_MAX_DETALLE);
}

export function resolverCallback(entrada: EntradaCallback): ResultadoCallback {
    const fallo = { destino: `${entrada.origen}/login?error=auth-callback`, errorParaLog: null };
    if (!entrada.codigo) return { ...fallo, motivo: "sin-codigo" };
    if (entrada.excepcion !== undefined && entrada.excepcion !== null) {
        return {
            ...fallo,
            motivo: "fallo-red",
            errorParaLog: `Excepción al canjear el código: ${detalleSeguro(entrada.excepcion)}`,
        };
    }
    if (entrada.error) {
        return {
            ...fallo,
            motivo: "codigo-rechazado",
            errorParaLog: `Supabase rechazó el código: ${detalleSeguro(entrada.error.message)}`,
        };
    }
    return { destino: `${entrada.origen}${entrada.next}`, motivo: "ok", errorParaLog: null };
}
