"use client";

/*
 * group-faces — FACETA por GRUPO (dualidad Cuenta/Perfil, CLAUDE.md §6).
 *
 * El ciudadano elige QUÉ faceta pública (os_account_profiles) le representa en
 * un grupo concreto. Es ADITIVO y de PURA PRESENTACIÓN:
 *
 *   · La MEMBRESÍA y el censo "una persona, un voto" NO cambian: siguen keyed
 *     POR CUENTA en `os_memberships (user_id, group_slug)` vía os-social.ts. Esta
 *     capa jamás alimenta el censo ni la votación — solo dice con qué CARA se
 *     muestra un usuario dentro del grupo.
 *   · Backend: tabla `os_membership_faces (user_id, group_slug, profile_id,
 *     updated_at)` PK(user_id, group_slug), en la base del OS
 *     (nxstilnyidvkqeosofuh). RLS: SELECT público (la cara es visible para
 *     todos); INSERT/UPDATE/DELETE solo del dueño (user_id = auth.uid()).
 *   · Sin FK a os_account_profiles: el `profile_id` se valida aquí (getProfile),
 *     y si la faceta ya no existe se degrada al perfil por defecto.
 *
 * Distinto del PERFIL ACTIVO por dispositivo (profiles.ts, localStorage
 * `starseed.profile.active.v1`): eso es global al dispositivo; esto es por grupo
 * y viaja con la cuenta (Supabase).
 *
 * Local-first y defensivo: sin sesión, SSR o error, todas las funciones degradan
 * a null / {} / {ok:false} sin lanzar NUNCA.
 */

import { createClient } from "@/utils/supabase/client";
import { useCallback, useEffect, useState } from "react";
import {
    getProfile,
    getDefaultProfile,
    listMyProfiles,
    PROFILES_LIST_EVENT,
    type AccountProfile,
} from "@/lib/profiles/profiles";
import { getCurrentUserId } from "@/lib/os-social";

/** Tabla de mapeo (cuenta, grupo) → faceta pública. */
const TABLE = "os_membership_faces";

/* ─────────────────────────── Lectura ─────────────────────────── */

/**
 * Faceta (profile_id) con la que el usuario actual se muestra en este grupo, o
 * null si no ha elegido ninguna / no hay sesión. Nunca lanza.
 */
export async function getMyGroupFace(groupSlug: string): Promise<string | null> {
    try {
        const uid = await getCurrentUserId();
        if (!uid || !groupSlug) return null;
        const supabase = createClient();
        const { data, error } = await supabase
            .from(TABLE)
            .select("profile_id")
            .eq("user_id", uid)
            .eq("group_slug", groupSlug)
            .maybeSingle();
        if (error || !data) return null;
        const pid = (data as { profile_id?: unknown }).profile_id;
        return typeof pid === "string" && pid ? pid : null;
    } catch {
        return null;
    }
}

/**
 * Faceta elegida por cada usuario en este grupo, en lote (uid → profile_id).
 * Lectura pública (RLS): sirve para pintar las caras del resto de miembros.
 * Solo incluye a quienes han elegido cara explícita. Nunca lanza.
 */
export async function getGroupFaces(
    groupSlug: string,
    userIds: string[],
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    try {
        const ids = Array.from(new Set((userIds || []).filter(Boolean)));
        if (!groupSlug || ids.length === 0) return out;
        const supabase = createClient();
        const { data, error } = await supabase
            .from(TABLE)
            .select("user_id, profile_id")
            .eq("group_slug", groupSlug)
            .in("user_id", ids);
        if (error || !Array.isArray(data)) return out;
        for (const row of data as { user_id?: unknown; profile_id?: unknown }[]) {
            const uid = row.user_id;
            const pid = row.profile_id;
            if (typeof uid === "string" && typeof pid === "string" && uid && pid) {
                out[uid] = pid;
            }
        }
        return out;
    } catch {
        return out;
    }
}

/**
 * Resuelve la faceta EFECTIVA del usuario en este grupo: la elegida (si sigue
 * existiendo) o, en su defecto, el perfil por defecto de la cuenta. null si no
 * hay ni cara ni perfiles. Nunca lanza.
 */
export async function resolveGroupFace(groupSlug: string): Promise<AccountProfile | null> {
    try {
        const faceId = await getMyGroupFace(groupSlug);
        if (faceId) {
            const chosen = await getProfile(faceId);
            if (chosen) return chosen;
        }
        return await getDefaultProfile();
    } catch {
        return null;
    }
}

/* ─────────────────────────── Escritura ─────────────────────────── */

/**
 * Fija la faceta del usuario actual en este grupo (upsert de SU fila; RLS valida
 * user_id = auth.uid()). Presentación pura: NO toca membresía ni censo.
 */
export async function setGroupFace(
    groupSlug: string,
    profileId: string,
): Promise<{ ok: boolean }> {
    try {
        const uid = await getCurrentUserId();
        if (!uid || !groupSlug || !profileId) return { ok: false };
        const supabase = createClient();
        const { error } = await supabase.from(TABLE).upsert(
            {
                user_id: uid,
                group_slug: groupSlug,
                profile_id: profileId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,group_slug" },
        );
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}

/**
 * Elimina la faceta elegida por el usuario actual en este grupo (vuelve a
 * mostrarse con su perfil por defecto). No afecta la membresía. Nunca lanza.
 */
export async function clearGroupFace(groupSlug: string): Promise<{ ok: boolean }> {
    try {
        const uid = await getCurrentUserId();
        if (!uid || !groupSlug) return { ok: false };
        const supabase = createClient();
        const { error } = await supabase
            .from(TABLE)
            .delete()
            .eq("user_id", uid)
            .eq("group_slug", groupSlug);
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}

/* ─────────────────────────── Hook reactivo ─────────────────────────── */

export interface UseGroupFace {
    /** profile_id elegido en este grupo, o null (aún sin elegir). */
    face: string | null;
    /** Todas las facetas de la cuenta (para poblar el selector). */
    profiles: AccountProfile[];
    loading: boolean;
    /** Cambia la faceta del grupo y refleja el cambio en el estado local. */
    setFace: (id: string) => Promise<void>;
}

/**
 * Hook: faceta del grupo + lista de facetas de la cuenta + cambiarla. Espeja el
 * patrón de useActiveProfile en profiles.ts. SSR-safe (efecto guardado) y nunca
 * lanza. Se refresca si cambia la lista de perfiles (PROFILES_LIST_EVENT).
 */
export function useGroupFace(groupSlug: string): UseGroupFace {
    const [face, setFaceState] = useState<string | null>(null);
    const [profiles, setProfiles] = useState<AccountProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // SSR-guard: sin window no hay cliente Supabase ni sesión que consultar.
        if (typeof window === "undefined") return;
        let alive = true;
        setLoading(true);

        void (async () => {
            const [list, myFace] = await Promise.all([
                listMyProfiles(),
                getMyGroupFace(groupSlug),
            ]);
            if (!alive) return;
            setProfiles(list);
            setFaceState(myFace);
            setLoading(false);
        })();

        // Si la LISTA de facetas cambia (crear/editar/borrar en otra superficie),
        // refresca las opciones — mismo patrón reactivo que useMyProfiles.
        const onList = () => {
            void listMyProfiles().then((list) => {
                if (alive) setProfiles(list);
            });
        };
        window.addEventListener(PROFILES_LIST_EVENT, onList);

        return () => {
            alive = false;
            window.removeEventListener(PROFILES_LIST_EVENT, onList);
        };
    }, [groupSlug]);

    const setFace = useCallback(
        async (id: string) => {
            const res = await setGroupFace(groupSlug, id);
            if (res.ok) setFaceState(id);
        },
        [groupSlug],
    );

    return { face, profiles, loading, setFace };
}
