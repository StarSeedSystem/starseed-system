import type { Pestana, Visibilidad } from "./modelo";

// SES1116B · Permisos del espacio de entidad (contrato §3.1 y §3.2).
// Una pestaña NUNCA es más abierta que la sesión que enlaza: la visibilidad
// efectiva es la más cerrada de las dos. Ser listado en `p.roles` deja VER,
// nunca gestionar: para cambiar visibilidad manda el rango en la entidad.

export type Rango = 0 | 1 | 2 | 3 | 4;

export interface ContextoVisor {
    rango: number;
    roles: string[];
    anonimo: boolean;
}

export type AccesoSesion = "privada" | "entidad" | "publica";

// MISMA tabla que `access_role_rank`
// (supabase/migrations/20260806120000_profile_sharing.sql:135-150).
const RANGO_POR_ROL: Record<string, Rango> = {
    total: 4,
    owner: 4,
    gestor: 3,
    admin: 3,
    colaborador: 2,
    editor: 2,
    observador: 1,
    viewer: 1,
};

export function rangoDeRol(rol: string | null): Rango {
    const clave = typeof rol === "string" ? rol.trim().toLowerCase() : "";
    return RANGO_POR_ROL[clave] ?? 0;
}

// Apertura de cada visibilidad: 0 = más cerrada, 3 = más abierta
// (orden del tipo: publica | entidad | roles | privada, §3.2).
const APERTURA: Record<Visibilidad | AccesoSesion, number> = {
    privada: 0,
    roles: 1,
    entidad: 2,
    publica: 3,
};

function visibilidadEfectiva(p: Pestana, accesoSesion: AccesoSesion): Visibilidad {
    const masCerrada = Math.min(APERTURA[p.visibilidad], APERTURA[accesoSesion]);
    const orden: Visibilidad[] = ["privada", "roles", "entidad", "publica"];
    return orden[masCerrada];
}

export function puedeVerPestana(
    p: Pestana,
    ctx: ContextoVisor,
    accesoSesion: AccesoSesion,
): boolean {
    const efectiva = visibilidadEfectiva(p, accesoSesion);

    if (ctx.anonimo) {
        return efectiva === "publica" && p.accesoPublico === "ver";
    }

    switch (efectiva) {
        case "publica":
            return true;
        case "entidad":
            return ctx.rango >= 1;
        case "roles":
            return ctx.roles.some((rol) => p.roles?.includes(rol)) || ctx.rango >= 3;
        case "privada":
            return ctx.rango >= 3;
    }
}

export function puedeGestionarEspacio(rango: number): boolean {
    return rango >= 3;
}

export interface VeredictoCambio {
    permitido: boolean;
    aviso: boolean;
}

export function cambioDeVisibilidad(
    rango: number,
    de: Visibilidad,
    a: Visibilidad,
): VeredictoCambio {
    if (rango < 3) return { permitido: false, aviso: false };
    // Abrir (más abierta) exige decir a la persona lo que se verá.
    const aviso = APERTURA[a] > APERTURA[de];
    return { permitido: true, aviso };
}
