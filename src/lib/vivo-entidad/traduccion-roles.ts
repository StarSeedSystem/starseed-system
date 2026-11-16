/**
 * Traducción de roles de entidad a rango de sesión (SES1115Q · §3.1).
 *
 * Una sola matriz que reemplaza los cinco vocabularios existentes en la capa de sesión.
 * La traducción se hace en código, no en migración de datos.
 */

export type RangoSesion =
    | "ver"
    | "comentar"
    | "editar"
    | "moderar"
    | "gestionar"
    | "dueno";

export interface ContextoRango {
    rolEntidad: string | null;
    esDuenoSesion: boolean;
    esComentarista: boolean;
    conEnlacePublico: boolean;
}

/**
 * Convierte el contexto de permisos al rango de sesión único.
 *
 * @param ctx - Contexto con rol de entidad, dueño de sesión, comentarista y enlace público
 * @returns Rango de sesión o null si no puede entrar
 */
export function rangoDeSesion(ctx: ContextoRango): RangoSesion | null {
    const { rolEntidad, esDuenoSesion, esComentarista, conEnlacePublico } = ctx;

    // Dueño de la sesión/entidad (rango 4)
    if (esDuenoSesion) return "dueno";

    // Moderador (rol explícito "moderador")
    if (rolEntidad === "moderador") return "moderar";

    // Dueño de la entidad (rango 4 en access_role_rank: total/owner)
    if (rolEntidad === "total" || rolEntidad === "owner") {
        return "dueno";
    }

    // Gestor/admin (rango 3 en access_role_rank)
    if (rolEntidad === "gestor" || rolEntidad === "admin") {
        return "gestionar";
    }

    // Colaborador/editor (rango 2 en access_role_rank)
    if (rolEntidad === "colaborador" || rolEntidad === "editor") {
        return "editar";
    }

    // Observador/viewer (rango 1 en access_role_rank)
    if (rolEntidad === "observador" || rolEntidad === "viewer" || rolEntidad === "miembro") {
        return "ver";
    }

    // Invitado comentarista (PermisoVivo comentar)
    if (esComentarista) return "comentar";

    // Visitante anónimo con enlace público
    if (conEnlacePublico) return "ver";

    // Sin rol y sin enlace = no entra
    return null;
}

/**
 * Indica si un rango permite editar la sesión.
 * `editar`, `moderar`, `gestionar` o `dueno`
 */
export function puedeEditarSesion(rango: RangoSesion | null): boolean {
    if (!rango) return false;
    return rango === "editar" || rango === "moderar" || rango === "gestionar" || rango === "dueno";
}

/**
 * Indica si un rango permite moderar la sesión.
 * `moderar`, `gestionar` o `dueno`
 */
export function puedeModerar(rango: RangoSesion | null): boolean {
    if (!rango) return false;
    return rango === "moderar" || rango === "gestionar" || rango === "dueno";
}

/**
 * Indica si un rango permite gestionar la sesión.
 * `gestionar` o `dueno`
 */
export function puedeGestionar(rango: RangoSesion | null): boolean {
    if (!rango) return false;
    return rango === "gestionar" || rango === "dueno";
}