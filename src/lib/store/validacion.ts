// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Tienda · Validación de entrada para publicación
// ------------------------------------------------------------------------------
// Valida y sanitiza los datos que entran por /api/publish-item antes de
// guardarlos en Supabase. Evita inyección de rutas, XSS y valores malintencionados.
// ════════════════════════════════════════════════════════════════════════════

const VALID_CATEGORIES = new Set([
    "app",
    "widget",
    "tema",
    "plantilla",
    "personalidad",
    "cerebro",
    "recurso",
    "calendario",
]);

export function esCategoriaValida(categoria: unknown): categoria is string {
    return typeof categoria === "string" && VALID_CATEGORIES.has(categoria);
}

export function esTituloValido(titulo: unknown): boolean {
    if (typeof titulo !== "string") return false;
    if (titulo.length === 0 || titulo.length > 200) return false;
    return true;
}

export function sanitizarTitulo(titulo: string): string {
    return titulo.trim().replace(/[<>]/g, "");
}