"use client";

/**
 * ── hub-social/presence — Presencia en vivo del Hub ──────────────────────────
 *
 * Canal Supabase Presence NATIVO `hub:presence` (sin DDL). Al montar el Hub, el
 * perfil activo se "trackea" con su identidad pública (id, nombre, avatar) y los
 * slugs de sus grupos, que permiten detectar CONEXIÓN por co-membresía sin
 * lecturas cruzadas de base de datos (respeto a la privacidad, CLAUDE.md §6).
 *
 * Se muestran SOLO las conexiones: peers que comparten al menos un grupo
 * contigo. Los presentes sin vínculo no se listan (privacidad + honestidad).
 *
 * PRIVACIDAD — opt-out: si el usuario lo desactiva, NO se trackea (queda
 * invisible). La preferencia se guarda local-first (por dispositivo) con espejo
 * best-effort en la cuenta.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import { getCurrentUserId } from "@/lib/os-social";
import type { ActiveProfileLite } from "@/lib/hub-social/graph";

const OPTOUT_KEY = "starseed.hub.presence.optout.v1";
export const PRESENCE_OPTOUT_EVENT = "starseed:hub-presence-optout";

/** ¿El usuario ha desactivado su presencia en el Hub? (local-first). */
export function getPresenceOptOut(): boolean {
    try { return safeGet(OPTOUT_KEY) === "1"; } catch { return false; }
}

/** Fija la preferencia de presencia (local + espejo best-effort en la cuenta). */
export function setPresenceOptOut(optOut: boolean): void {
    try { safeSet(OPTOUT_KEY, optOut ? "1" : "0"); } catch { /* noop */ }
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PRESENCE_OPTOUT_EVENT)); } catch { /* noop */ }
    void (async () => {
        try {
            const uid = await getCurrentUserId();
            if (uid) await mergeUserPrefs({ [OPTOUT_KEY]: optOut });
        } catch { /* espejo opcional */ }
    })();
}

interface PresenceMeta {
    profileId: string;
    name: string;
    avatar: string | null;
    groups: string[];
    at: number;
}

export interface PresencePeer {
    key: string;
    profileId: string;
    name: string;
    avatar: string | null;
    /** Grupos compartidos contigo (co-membresía). */
    sharedGroups: string[];
    isConnection: boolean;
}

export interface UseHubPresence {
    /** Conexiones presentes ahora (co-membresía). */
    connections: PresencePeer[];
    /** Total de ciudadanos presentes (incluye no-conexiones). */
    totalPresent: number;
    /** ¿Estás visible (trackeando)? */
    tracking: boolean;
    optOut: boolean;
}

/**
 * Suscribe al canal de presencia del Hub. Trackea el perfil activo (salvo
 * opt-out) y devuelve las conexiones presentes.
 */
export function useHubPresence(
    profile: ActiveProfileLite | null,
    myGroupSlugs: string[],
    optOut: boolean,
): UseHubPresence {
    const [connections, setConnections] = useState<PresencePeer[]>([]);
    const [totalPresent, setTotalPresent] = useState(0);
    const [tracking, setTracking] = useState(false);

    // Serializa los grupos para estabilizar el efecto.
    const groupsKey = myGroupSlugs.slice().sort().join(",");

    useEffect(() => {
        if (typeof window === "undefined") { setConnections([]); return; }
        let removed = false;
        let supabase: ReturnType<typeof createClient> | null = null;
        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
        const mySet = new Set(groupsKey ? groupsKey.split(",") : []);
        const willTrack = !optOut && !!profile;

        try {
            supabase = createClient();
            const key = profile?.id || `anon-${Math.random().toString(36).slice(2, 10)}`;
            channel = supabase.channel("hub:presence", { config: { presence: { key } } });

            channel.on("presence", { event: "sync" }, () => {
                if (removed || !channel) return;
                try {
                    const state = channel.presenceState() as unknown as Record<string, PresenceMeta[]>;
                    const peers: PresencePeer[] = [];
                    let total = 0;
                    for (const [pkey, metas] of Object.entries(state)) {
                        if (!metas || metas.length === 0) continue;
                        total += 1;
                        if (profile && pkey === profile.id) continue; // no me cuento a mí mismo como conexión
                        const meta = metas[0];
                        const theirGroups = Array.isArray(meta.groups) ? meta.groups : [];
                        const sharedGroups = theirGroups.filter((g) => mySet.has(g));
                        peers.push({
                            key: pkey,
                            profileId: meta.profileId || pkey,
                            name: meta.name || "Ciudadano StarSeed",
                            avatar: meta.avatar ?? null,
                            sharedGroups,
                            isConnection: sharedGroups.length > 0,
                        });
                    }
                    setTotalPresent(total);
                    setConnections(peers.filter((p) => p.isConnection));
                } catch {
                    /* degrada sin presencia */
                }
            });

            channel.subscribe((status: string) => {
                if (removed || status !== "SUBSCRIBED" || !channel) return;
                if (willTrack && profile) {
                    const meta: PresenceMeta = {
                        profileId: profile.id,
                        name: profile.name,
                        avatar: profile.avatarUrl,
                        groups: groupsKey ? groupsKey.split(",") : [],
                        at: Date.now(),
                    };
                    void channel.track(meta);
                    setTracking(true);
                } else {
                    setTracking(false);
                }
            });
        } catch {
            setConnections([]);
            setTotalPresent(0);
        }

        return () => {
            removed = true;
            try { if (supabase && channel) supabase.removeChannel(channel); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.id, profile?.name, profile?.avatarUrl, groupsKey, optOut]);

    return { connections, totalPresent, tracking, optOut };
}
