"use client";

/**
 * StarSeed XR · lectura de MIEMBROS de un grupo (contrato §3 f, «este grupo de amigos»).
 * Fuente REAL del OS: `os_memberships` por slug (`membersFromMemberships`: la misma fuente
 * de censo del motor de gobernanza, paginada y con resolución uuid→slug) + nombres públicos
 * (`fetchProfilesByIds`). No duplica `acciones-vivo.ts#miembrosDeGrupo` (tope 500 y solo ids):
 * aquí van los miembros con nombre visible, que es lo que la tarjeta de voz enseña.
 * Nunca inventa gente: lectura vacía o fallida → `[]`, y el ejecutor lo dice de forma honesta.
 */
import { membersFromMemberships } from "@/lib/governance/membership";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";

export interface MiembroGrupo { id: string; nombre: string }

export async function miembrosDeGrupo(grupoId: string): Promise<MiembroGrupo[]> {
    const ids = (await membersFromMemberships(grupoId ?? "")).filter((x) => typeof x === "string" && x.length > 0);
    if (!ids.length) return [];
    const perfiles = await fetchProfilesByIds(ids);
    return ids.map((id) => ({ id, nombre: perfiles[id]?.displayName?.trim() || "Miembro" }));
}
