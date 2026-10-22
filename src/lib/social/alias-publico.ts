// src/lib/social/alias-publico.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALIAS PÚBLICO — el nombre que se muestra en la red cuando la cuenta no tiene
// un nombre de perfil público.
//
// El email es un dato de CUENTA (privado). Usarlo como nombre público confunde
// Cuenta con Perfil y expone un dato sensible sin consentimiento (hallazgo de
// la imaginación profunda 2026-09-29 · SP092939). Aquí el alias anónimo
// sustituye SIEMPRE al email.
//
// Módulo PURO: sin red, sin disco, sin procesos. Recibe los metadatos de la
// sesión y devuelve el nombre publicable — el email ni siquiera entra como
// argumento, así que no puede filtrarse por accidente.
// ─────────────────────────────────────────────────────────────────────────────

/** Alias anónimo por defecto (el mismo que usa el resto del OS). */
export const ALIAS_ANONIMO = "Ciudadano StarSeed";

/** Claves de metadata donde la persona guarda el nombre que ELIGI mostrar. */
const CLAVES_NOMBRE = ["full_name", "name", "display_name", "user_name"] as const;

/** Longitud máxima de un nombre mostrado (evita cadenas absurdas en la UI). */
const MAX_LARGO = 64;

/** ¿El texto parece un correo electrónico? (dato de cuenta, no nombre público). */
export function pareceCorreo(valor: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

/** Recorta espacios, aplana saltos de línea y limita el largo. */
function limpiar(valor: string): string {
    return valor.replace(/\s+/g, " ").trim().slice(0, MAX_LARGO);
}

/**
 * Nombre PÚBLICO de la persona a partir de los metadatos de su cuenta.
 *
 * Orden: `full_name` → `name` → `display_name` → `user_name` (los nombres que
 * la persona eligió publicar). Si no hay ninguno, o el único candidato parece
 * un correo electrónico, devuelve el ALIAS ANÓNIMO.
 */
export function nombrePublicoDesdeMetadata(
    metadata: Record<string, unknown> | null | undefined,
): string {
    for (const clave of CLAVES_NOMBRE) {
        const crudo = metadata?.[clave];
        if (typeof crudo !== "string") continue;
        const limpio = limpiar(crudo);
        if (!limpio) continue;
        if (pareceCorreo(limpio)) continue; // el email nunca es nombre público
        return limpio;
    }
    return ALIAS_ANONIMO;
}
