"use client";

/*
 * badges — Capa de datos de INSIGNIAS Y LOGROS (Módulo 7) para StarSeed OS.
 * ------------------------------------------------------------------------------
 * El mérito en la red se reconoce con INSIGNIAS. Cada insignia premia una forma
 * concreta de participación (publicar en la Tienda, desplegar una app o un
 * cerebro, contribuir conocimiento, verificar identidad…). Las insignias no son
 * solo estética: desbloquean capacidades y reputación dentro del ecosistema.
 *
 * Tablas (Supabase, ya creadas + sembradas + con realtime):
 *   • badges(id, code, name, description, icon, area, criteria jsonb)
 *       sembradas: verified, creator, legislator, mediator, scholar, builder
 *   • profile_badges(profile_id, badge_id, awarded_at, awarded_by)
 *       PK(profile_id, badge_id)
 *   • profiles(id, user_id, handle, display_name, badges jsonb)
 *
 * Principios (alineados con CLAUDE.md):
 *   - TOLERANTE A FALLOS: sin sesión, sin tabla o ante error de red NUNCA lanza;
 *     devuelve valores seguros ([] / null / false). El que consume nunca rompe.
 *   - DATOS DEL USUARIO, PROPIEDAD DEL USUARIO: las escrituras pasan por RLS
 *     (awarded_by = auth.uid()).
 *   - IDEMPOTENTE: otorgar una insignia ya existente no duplica (on conflict).
 *   - SSR-SAFE: las consultas se hacen tras `getUser()` en el cliente.
 *
 * Esta capa SOLO expone datos + `awardBadge`. Los "ganchos" que otorgan
 * insignias tras una acción (publicar, desplegar, contribuir…) viven en sus
 * propios módulos y pueden llamar a `awardBadge` cuando corresponda; aquí
 * documentamos el mapeo en `BADGE_TRIGGERS` con fines informativos.
 */

import { createClient } from "@/utils/supabase/client";

// ----------------------------- Tipos ----------------------------------------

/** Áreas en las que se agrupan las insignias en el catálogo. */
export type BadgeArea = "general" | "politica" | "educacion" | "cultura";

export interface Badge {
    id: string;
    code: string;
    name: string;
    description: string | null;
    /** Nombre de icono (lucide) o emoji; el render decide cómo pintarlo. */
    icon: string | null;
    /** Área temática. Si la fila no la trae, se trata como "general". */
    area: string | null;
    /** Criterio de obtención (JSON libre). */
    criteria: Record<string, any> | null;
}

export interface ProfileBadge extends Badge {
    /** ISO timestamp de cuándo se otorgó al perfil. */
    awarded_at: string | null;
    /** uid de quien la otorgó (o sistema). */
    awarded_by: string | null;
}

// ------------------------- Helpers internos ---------------------------------

function isClient(): boolean {
    return typeof window !== "undefined";
}

/** uid de la sesión actual o null. Nunca lanza. */
async function getUid(): Promise<string | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

// ------------------------------- Lecturas -----------------------------------

/**
 * Catálogo completo de insignias (`badges`), ordenado por área y nombre.
 * Devuelve [] si no hay sesión/tabla o ante error.
 */
export async function listBadges(): Promise<Badge[]> {
    if (!isClient()) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("badges")
            .select("id, code, name, description, icon, area, criteria")
            .order("area", { ascending: true })
            .order("name", { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data as Badge[];
    } catch {
        return [];
    }
}

/**
 * Insignias otorgadas a un perfil (join `profile_badges` → `badges`).
 * Devuelve [] si no hay perfil/tabla o ante error.
 */
export async function badgesForProfile(
    profileId: string | null | undefined,
): Promise<ProfileBadge[]> {
    if (!isClient() || !profileId) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("profile_badges")
            .select(
                "awarded_at, awarded_by, badges:badge_id ( id, code, name, description, icon, area, criteria )",
            )
            .eq("profile_id", profileId)
            .order("awarded_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];

        const out: ProfileBadge[] = [];
        for (const row of data as any[]) {
            // El embed puede llegar como objeto o (defensivo) como array.
            const b = Array.isArray(row?.badges) ? row.badges[0] : row?.badges;
            if (!b || !b.id) continue;
            out.push({
                id: b.id,
                code: b.code,
                name: b.name,
                description: b.description ?? null,
                icon: b.icon ?? null,
                area: b.area ?? null,
                criteria: b.criteria ?? null,
                awarded_at: row?.awarded_at ?? null,
                awarded_by: row?.awarded_by ?? null,
            });
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * `profiles.id` del usuario de la sesión (buscando por user_id = uid).
 * Devuelve null si no hay sesión/fila o ante error.
 */
export async function myProfileId(): Promise<string | null> {
    const uid = await getUid();
    if (!uid) return null;
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("profiles")
            .select("id")
            .eq("user_id", uid)
            .limit(1)
            .maybeSingle();
        if (error || !data) return null;
        return (data as { id?: string }).id ?? null;
    } catch {
        return null;
    }
}

/**
 * Resuelve una insignia por `code` y devuelve su id (o null).
 */
async function badgeIdByCode(code: string): Promise<string | null> {
    if (!isClient() || !code) return null;
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("badges")
            .select("id")
            .eq("code", code)
            .limit(1)
            .maybeSingle();
        if (error || !data) return null;
        return (data as { id?: string }).id ?? null;
    } catch {
        return null;
    }
}

/**
 * ¿Tiene el perfil la insignia con ese `code`? Nunca lanza.
 */
export async function hasBadge(
    profileId: string | null | undefined,
    code: string,
): Promise<boolean> {
    if (!isClient() || !profileId || !code) return false;
    try {
        const badgeId = await badgeIdByCode(code);
        if (!badgeId) return false;
        const supabase = createClient();
        const { data, error } = await supabase
            .from("profile_badges")
            .select("badge_id")
            .eq("profile_id", profileId)
            .eq("badge_id", badgeId)
            .limit(1)
            .maybeSingle();
        if (error || !data) return false;
        return true;
    } catch {
        return false;
    }
}

// ------------------------------ Escrituras ----------------------------------

/**
 * Otorga al perfil la insignia identificada por `badgeCode`.
 *  - Resuelve el badge por code.
 *  - Inserta en `profile_badges` (idempotente: on conflict no duplica).
 *  - awarded_by = uid de la sesión (puede ser null si no hay sesión).
 * Devuelve true si la insignia quedó otorgada (ya existía o se insertó),
 * false ante error/imposibilidad. NUNCA lanza.
 */
export async function awardBadge(
    profileId: string | null | undefined,
    badgeCode: string,
): Promise<boolean> {
    if (!isClient() || !profileId || !badgeCode) return false;
    try {
        const badgeId = await badgeIdByCode(badgeCode);
        if (!badgeId) return false;

        const uid = await getUid();
        const supabase = createClient();

        const { error } = await supabase
            .from("profile_badges")
            .upsert(
                {
                    profile_id: profileId,
                    badge_id: badgeId,
                    awarded_by: uid,
                },
                { onConflict: "profile_id,badge_id", ignoreDuplicates: true },
            );

        // Si el upsert con ignoreDuplicates choca por una carrera, lo tratamos
        // como éxito siempre que la insignia exista para el perfil.
        if (error) {
            return await hasBadge(profileId, badgeCode);
        }
        return true;
    } catch {
        return false;
    }
}

// ----------------------- Mapa informativo de disparadores --------------------
//
// QUÉ ACCIÓN GANA QUÉ INSIGNIA. Es documentación viva para los módulos que, en
// el futuro, llamen a `awardBadge(profileId, code)` cuando ocurra la acción.
// No se ejecuta nada aquí: es un mapa de referencia (action → badge code).

export interface BadgeTrigger {
    /** Acción del ecosistema que merece la insignia. */
    action: string;
    /** `code` de la insignia a otorgar (debe existir en `badges`). */
    badgeCode: string;
    /** Descripción legible del criterio. */
    description: string;
}

export const BADGE_TRIGGERS: Record<string, BadgeTrigger> = {
    verify_identity: {
        action: "verify_identity",
        badgeCode: "verified",
        description: "Verificar la identidad soberana de la cuenta.",
    },
    publish_to_store: {
        action: "publish_to_store",
        badgeCode: "creator",
        description: "Publicar un recurso o creación en la Tienda.",
    },
    deploy_app_or_brain: {
        action: "deploy_app_or_brain",
        badgeCode: "builder",
        description: "Desplegar una app o un cerebro (brain) en la red.",
    },
    contribute_knowledge: {
        action: "contribute_knowledge",
        badgeCode: "scholar",
        description: "Contribuir conocimiento (artículos, cursos, wiki).",
    },
    pass_legislation: {
        action: "pass_legislation",
        badgeCode: "legislator",
        description: "Impulsar una propuesta hasta convertirla en norma.",
    },
    mediate_conflict: {
        action: "mediate_conflict",
        badgeCode: "mediator",
        description: "Mediar y resolver un conflicto en la comunidad.",
    },
};

/** Devuelve el code de insignia asociado a una acción, o null. */
export function badgeCodeForAction(action: string): string | null {
    return BADGE_TRIGGERS[action]?.badgeCode ?? null;
}
