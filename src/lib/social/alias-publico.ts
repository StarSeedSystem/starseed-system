// src/lib/social/alias-publico.ts
// ─────────────────────────────────────────────────────────────────────────────
// Nombre PÚBLICO de quien comenta: manda el PERFIL, la CUENTA no se filtra.
//
// Por qué (imaginación profunda 2026-09-29 · social × coherencia-triada):
// el composer de comentarios tomaba el email de la sesión como nombre por
// defecto. Eso mezcla la CUENTA (privada) con el PERFIL (público) y pone un
// dato sensible delante de cualquiera que abra el hilo, sin que la persona
// lo haya consentido.
//
// Este módulo es PURO (sin red, sin disco, sin procesos): decide el nombre
// público a partir de lo que la persona eligió mostrar y, si no hay nada,
// devuelve el alias anónimo. El email NO entra en la función: así no puede
// colarse por accidente.
// ─────────────────────────────────────────────────────────────────────────────

/** Alias anónimo para quien no ha elegido un nombre público. */
export const ALIAS_ANONIMO = "Ciudadano StarSeed";

/** Claves de `user_metadata` donde la persona guarda el nombre que eligió. */
const CLAVES_NOMBRE = ["full_name", "name", "display_name"] as const;

/** Un texto con forma de email no sirve como nombre público. */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lo que se sabe de quien comenta, SIN datos sensibles de la cuenta. */
export interface FuenteNombrePublico {
    /** Nombre público del PERFIL (`os_profiles.display_name`). */
    nombrePerfil?: string | null;
    /** Metadatos de la CUENTA (`user_metadata`): de aquí solo se leen nombres. */
    metadata?: Record<string, unknown> | null;
}

/** ¿Ese texto parece un email? Entonces no es un nombre público. */
export function pareceEmail(valor: string): boolean {
    return RE_EMAIL.test(valor.trim());
}

/** Recorta un valor y lo devuelve como texto ("" si no es texto). */
function texto(valor: unknown): string {
    return typeof valor === "string" ? valor.trim() : "";
}

/**
 * ¿Ese texto sirve como nombre público? Debe traer información: no vale el
 * alias (no identifica a nadie) ni un email (es dato privado, no nombre).
 */
function esNombreUtil(nombre: string): boolean {
    return nombre.length > 0 && nombre !== ALIAS_ANONIMO && !pareceEmail(nombre);
}

/**
 * Nombre público de quien comenta: PERFIL → nombre elegido en la CUENTA →
 * alias anónimo. Nunca un email, pase lo que pase.
 *
 * El PERFIL manda porque es la identidad pública de la persona (lo que ve el
 * resto de la red y lo que ella puede editar). De la CUENTA solo se lee un
 * nombre que la persona eligió al registrarse; si no hay ninguno, se firma
 * con el alias anónimo en vez de filtrar el correo.
 */
export function nombrePublicoParaComentario(fuente: FuenteNombrePublico): string {
    const delPerfil = texto(fuente.nombrePerfil);
    if (esNombreUtil(delPerfil)) return delPerfil;

    const meta = fuente.metadata ?? {};
    for (const clave of CLAVES_NOMBRE) {
        const nombre = texto(meta[clave]);
        if (esNombreUtil(nombre)) return nombre;
    }
    return ALIAS_ANONIMO;
}
