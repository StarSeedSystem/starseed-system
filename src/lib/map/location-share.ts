"use client";

// src/lib/map/location-share.ts
// ─────────────────────────────────────────────────────────────────────────────
// UBICACIÓN COMPARTIDA CON PERMISOS para el Mapa del Hub (SOP §12).
//
// Modos:  off  → no se emite nada (por defecto: privacidad primero).
//         red  → se emite al canal público 'map:red' (toda la red).
//         custom → solo a los canales de los grupos ('map:g:<slug>') y/o
//                  usuarios ('map:u:<userId>') seleccionados.
//
// Transporte: Supabase Realtime PRESENCE (mismo stack que realtime-sync.ts /
// spaces.ts). Presence encaja mejor que broadcast aquí: al cerrar la pestaña
// o perder la sesión, el marcador desaparece solo (leave automático), y cada
// re-track actualiza la posición sin acumular mensajes.
//
// ⚠️ Alcance MVP, dicho honestamente:
//   · Los topics de Realtime NO llevan ACL en esta fase: un cliente con la
//     anon key podría suscribirse a 'map:g:<slug>' sin ser miembro. Es
//     privacidad COOPERATIVA (la UI solo escucha lo que le corresponde), no
//     criptográfica. El endurecimiento natural es Realtime Authorization
//     (políticas RLS sobre canales privados de Supabase) — pendiente.
//   · 'map:u:<userId>' es el buzón del RECEPTOR: quien comparte "con usuarios
//     concretos" emite presencia en el canal de cada destinatario, y cada
//     cliente escucha su propio buzón. Simple y sin tabla nueva.
//   · La posición solo sale del dispositivo mientras la pestaña del mapa está
//     abierta y el modo lo permite (no hay tracking en segundo plano).
//
// Persistencia de la config del usuario: `starseed.map.location.v1`
// (candidata a SYNCED_KEYS — se añade en settings-sync por integración).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { MAP_LOCATION_KEY } from "@/lib/map/map-config";

// ── Config persistida ────────────────────────────────────────────────────────

export type LocationShareMode = "off" | "red" | "custom";

export interface SharedUserRef {
    userId: string;
    username: string;
    displayName: string;
}

export interface LocationShareConfig {
    mode: LocationShareMode;
    /** Usuarios concretos con los que comparto (modo custom). */
    users: SharedUserRef[];
    /** Slugs de grupos con los que comparto (modo custom). */
    groups: string[];
}

export const DEFAULT_SHARE_CONFIG: LocationShareConfig = { mode: "off", users: [], groups: [] };

/** Evento local que se despacha al guardar la config (para refrescar UI). */
export const SHARE_CONFIG_EVENT = "starseed:map:share-config";

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadShareConfig(): LocationShareConfig {
    if (!isClient()) return { ...DEFAULT_SHARE_CONFIG };
    try {
        const raw = localStorage.getItem(MAP_LOCATION_KEY);
        if (!raw) return { ...DEFAULT_SHARE_CONFIG };
        const parsed = JSON.parse(raw) as Partial<LocationShareConfig>;
        const mode: LocationShareMode =
            parsed.mode === "red" || parsed.mode === "custom" ? parsed.mode : "off";
        return {
            mode,
            users: Array.isArray(parsed.users)
                ? parsed.users.filter((u) => u && typeof u.userId === "string")
                : [],
            groups: Array.isArray(parsed.groups)
                ? parsed.groups.filter((g) => typeof g === "string" && g)
                : [],
        };
    } catch {
        return { ...DEFAULT_SHARE_CONFIG };
    }
}

export function saveShareConfig(cfg: LocationShareConfig): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(MAP_LOCATION_KEY, JSON.stringify(cfg));
        window.dispatchEvent(new Event(SHARE_CONFIG_EVENT));
    } catch { /* noop */ }
}

// ── Topics ───────────────────────────────────────────────────────────────────

/** Canales donde EMITO mi posición según el modo (vacío = no emitir). */
export function topicsForSharing(cfg: LocationShareConfig): string[] {
    if (cfg.mode === "red") return ["map:red"];
    if (cfg.mode === "custom") {
        const t = [
            ...cfg.groups.map((slug) => `map:g:${slug}`),
            ...cfg.users.map((u) => `map:u:${u.userId}`),
        ];
        return Array.from(new Set(t));
    }
    return [];
}

/**
 * Canales que ESCUCHO para ver a otros: siempre la red pública + mi buzón
 * personal + los grupos que tengo seleccionados (ver ≠ emitir: mirar el mapa
 * nunca publica mi posición).
 */
export function topicsForWatching(cfg: LocationShareConfig, myUserId: string | null): string[] {
    const t = ["map:red", ...cfg.groups.map((slug) => `map:g:${slug}`)];
    if (myUserId) t.push(`map:u:${myUserId}`);
    return Array.from(new Set(t));
}

// ── Presencia ────────────────────────────────────────────────────────────────

export interface MapPeer {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    lat: number;
    lng: number;
    /** Epoch ms del último latido de posición ("hace X min" en la UI). */
    at: number;
    /** Canal por el que llegó (map:red / map:g:… / map:u:…). */
    topic: string;
}

export interface MapPresenceHandle {
    /** Reconfigura qué canales se escuchan y en cuáles se emite. */
    setTopics(watch: string[], share: string[]): void;
    /** Publica/actualiza mi posición en TODOS los canales de emisión activos. */
    updatePosition(lat: number, lng: number): void;
    /** Deja de emitir (mantiene la escucha). */
    stopSharing(): void;
    /** Cierra todos los canales. */
    stop(): void;
}

interface PresenceMeta {
    userId?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    lat?: number;
    lng?: number;
    at?: number;
    [key: string]: unknown;
}

/**
 * Crea el gestor de presencia del mapa para el usuario `me`. `onPeers` recibe
 * la lista agregada (dedupe por userId, posición más reciente) cada vez que
 * cambia la presencia en cualquiera de los canales escuchados.
 * Nunca lanza; sin sesión/red degrada a silencio.
 */
export function createMapPresence(
    me: { userId: string; username: string; displayName: string; avatarUrl?: string },
    onPeers: (peers: MapPeer[]) => void,
): MapPresenceHandle {
    const channels = new Map<string, RealtimeChannel>();
    const shareTopics = new Set<string>();
    let lastPos: { lat: number; lng: number } | null = null;
    let stopped = false;

    function payload(): PresenceMeta | null {
        if (!lastPos) return null;
        return {
            userId: me.userId,
            username: me.username,
            displayName: me.displayName,
            avatarUrl: me.avatarUrl,
            lat: lastPos.lat,
            lng: lastPos.lng,
            at: Date.now(),
        };
    }

    function recomputePeers(): void {
        if (stopped) return;
        const byUser = new Map<string, MapPeer>();
        for (const [topic, ch] of channels) {
            let state: Record<string, PresenceMeta[]> = {};
            try {
                state = ch.presenceState() as Record<string, PresenceMeta[]>;
            } catch {
                continue;
            }
            for (const metas of Object.values(state)) {
                for (const m of metas ?? []) {
                    const uid = typeof m.userId === "string" ? m.userId : "";
                    const lat = typeof m.lat === "number" ? m.lat : NaN;
                    const lng = typeof m.lng === "number" ? m.lng : NaN;
                    if (!uid || uid === me.userId) continue; // yo no soy un "peer"
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
                    const at = typeof m.at === "number" ? m.at : Date.now();
                    const prev = byUser.get(uid);
                    if (prev && prev.at >= at) continue;
                    byUser.set(uid, {
                        userId: uid,
                        username: typeof m.username === "string" ? m.username : "starseeder",
                        displayName: typeof m.displayName === "string" && m.displayName ? m.displayName : "Ciudadano StarSeed",
                        avatarUrl: typeof m.avatarUrl === "string" ? m.avatarUrl : undefined,
                        lat,
                        lng,
                        at,
                        topic,
                    });
                }
            }
        }
        try { onPeers(Array.from(byUser.values())); } catch { /* listener roto: no tirar el motor */ }
    }

    function ensureChannel(topic: string): void {
        if (channels.has(topic)) return;
        try {
            const supabase = createClient();
            const ch = supabase.channel(topic, {
                config: { presence: { key: me.userId } },
            });
            ch.on("presence", { event: "sync" }, recomputePeers)
                .on("presence", { event: "join" }, recomputePeers)
                .on("presence", { event: "leave" }, recomputePeers)
                .subscribe((status: string) => {
                    // Al (re)conectar: si este canal es de emisión y ya hay posición,
                    // publica el estado actual.
                    if (status === "SUBSCRIBED" && shareTopics.has(topic)) {
                        const p = payload();
                        if (p) void ch.track(p).catch(() => { /* best-effort */ });
                    }
                });
            channels.set(topic, ch);
        } catch { /* sin realtime: el mapa sigue funcionando sin presencia */ }
    }

    function dropChannel(topic: string): void {
        const ch = channels.get(topic);
        if (!ch) return;
        channels.delete(topic);
        try { createClient().removeChannel(ch); } catch { /* noop */ }
    }

    return {
        setTopics(watch: string[], share: string[]): void {
            if (stopped) return;
            const needed = new Set([...watch, ...share]);
            // Cierra los canales que ya no interesan.
            for (const topic of Array.from(channels.keys())) {
                if (!needed.has(topic)) dropChannel(topic);
            }
            // Actualiza el set de emisión ANTES de abrir (el callback de subscribe lo lee).
            const prevShare = new Set(shareTopics);
            shareTopics.clear();
            for (const t of share) shareTopics.add(t);
            // Abre los nuevos.
            for (const topic of needed) ensureChannel(topic);
            // Canales que pasan de emitir → solo escuchar: retira mi presencia.
            for (const topic of prevShare) {
                if (!shareTopics.has(topic)) {
                    const ch = channels.get(topic);
                    if (ch) void ch.untrack().catch(() => { /* noop */ });
                }
            }
            // Canales que pasan a emitir y ya están abiertos: publica ya.
            const p = payload();
            if (p) {
                for (const topic of shareTopics) {
                    if (!prevShare.has(topic)) {
                        const ch = channels.get(topic);
                        if (ch) void ch.track(p).catch(() => { /* noop */ });
                    }
                }
            }
            recomputePeers();
        },

        updatePosition(lat: number, lng: number): void {
            if (stopped || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
            lastPos = { lat, lng };
            const p = payload();
            if (!p) return;
            for (const topic of shareTopics) {
                const ch = channels.get(topic);
                if (ch) void ch.track(p).catch(() => { /* noop */ });
            }
        },

        stopSharing(): void {
            for (const topic of shareTopics) {
                const ch = channels.get(topic);
                if (ch) void ch.untrack().catch(() => { /* noop */ });
            }
            shareTopics.clear();
        },

        stop(): void {
            stopped = true;
            shareTopics.clear();
            for (const topic of Array.from(channels.keys())) dropChannel(topic);
            try { onPeers([]); } catch { /* noop */ }
        },
    };
}
