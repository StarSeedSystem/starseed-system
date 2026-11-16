import type { Pestana, Visibilidad, AccesoPublico } from "./modelo";

/**
 * Devuelve el rango numérico de un rol, igual que la función SQL `access_role_rank`.
 * total/owner = 4, gestor/admin = 3, colaborador/editor = 2, observador/viewer = 1, resto = 0.
 */
export function rangoDeRol(rol: string | null): 0 | 1 | 2 | 3 | 4 {
    if (!rol) return 0;
    const r = rol.trim().toLowerCase();
    switch (r) {
        case "total":
        case "owner":
            return 4;
        case "gestor":
        case "admin":
            return 3;
        case "colaborador":
        case "editor":
            return 2;
        case "observador":
        case "viewer":
            return 1;
        default:
            return 0;
    }
}

/**
 * Comprueba si un contexto puede ver una pestaña dada una visibilidad concreta.
 * No aplica la regla de "la más cerrada" — esa la hace `puedeVerPestana` llamando a esta
 * función dos veces (una para la pestaña, otra para la sesión).
 */
function puedeVerConVisibilidad(
    visibilidad: Visibilidad,
    p: Pestana,
    ctx: { rango: number; roles: string[]; anonimo: boolean }
): boolean {
    if (ctx.anonimo) {
        if (visibilidad !== "publica") return false;
        return p.accesoPublico === "ver";
    }

    switch (visibilidad) {
        case "publica":
            return ctx.rango >= 1 || p.accesoPublico === "ver";
        case "entidad":
            return ctx.rango >= 1;
        case "roles":
            if (ctx.rango >= 3) return true;
            if (!p.roles || p.roles.length === 0) return false;
            return ctx.roles.some((r) => p.roles!.includes(r));
        case "privada":
            return ctx.rango >= 3;
    }
}

/**
 * Comprueba si un contexto puede ver una pestaña.
 * Regla: la pestaña NUNCA es más abierta que su sesión.
 * Para un usuario concreto, esto significa que debe poder verla TANTO bajo la visibilidad
 * de la pestaña COMO bajo la de la sesión (la más restrictiva para ese usuario).
 * - `publica`: anónimo la ve SOLO si `accesoPublico === "ver"`; usuarios con rango >= 1 siempre.
 * - `entidad`: rango >= 1.
 * - `roles`: alguno de `ctx.roles` en `p.roles` O rango >= 3.
 * - `privada`: rango >= 3.
 */
export function puedeVerPestana(
    p: Pestana,
    ctx: { rango: number; roles: string[]; anonimo: boolean },
    accesoSesion: "privada" | "entidad" | "publica"
): boolean {
    // Debe pasar ambos filtros: el de la pestaña y el de la sesión
    return (
        puedeVerConVisibilidad(p.visibilidad, p, ctx) &&
        puedeVerConVisibilidad(accesoSesion, p, ctx)
    );
}

/**
 * ¿Puede gestionar el espacio (cambiar visibilidad, anfitrión, suplentes, capacidad)?
 * Requiere rango >= 3 (gestor/admin o superior).
 */
export function puedeGestionarEspacio(rango: number): boolean {
    return rango >= 3;
}

/**
 * Comprueba si un cambio de visibilidad está permitido.
 * - Exige rango >= 3 en ambos sentidos.
 * - Hacerla MÁS abierta lleva `aviso: true` (hay que avisar a la persona lo que se verá).
 * - Hacerla MENOS abierta lleva `aviso: false`.
 * - Un rol no puede subir nada por encima del rango que ya tiene en la entidad.
 * Orden: privada < entidad < roles < publica
 */
export function cambioDeVisibilidad(
    rango: number,
    de: Visibilidad,
    a: Visibilidad
): { permitido: boolean; aviso: boolean } {
    if (rango < 3) return { permitido: false, aviso: false };
    if (de === a) return { permitido: true, aviso: false };

    const orden: Record<Visibilidad, number> = {
        privada: 0,
        entidad: 1,
        roles: 2,
        publica: 3,
    };

    const esMasAbierto = orden[a] > orden[de];
    return { permitido: true, aviso: esMasAbierto };
}