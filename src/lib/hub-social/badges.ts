"use client";

/**
 * ── hub-social/badges — Insignias de participación multicultural ─────────────
 *
 * Calcula, del GRAFO REAL del perfil (`GraphMetrics`), un conjunto de insignias
 * que reconocen cómo la persona teje la red a través de los 4 sistemas de
 * StarSeed. Cada insignia tiene tres niveles evolutivos — semilla · brote · flor
 * — con umbrales crecientes, un anillo de progreso y una explicación clara de
 * cómo subir de nivel.
 *
 * Insignias (todas derivadas de datos reales, nunca inventadas):
 *   · Puente     — conexiones repartidas por varios SISTEMAS (político/educativo/
 *                  cultural/social). Es el tejedor intercultural.
 *   · Polinizador— sigues/participas en varios TIPOS de entidad (páginas, grupos,
 *                  eventos, E.F., partidos). Llevas polen entre formas de vínculo.
 *   · Raíz       — miembro fundador / administrador de entidades. Sostienes.
 *   · Sinapsis   — vínculos recíprocos (sigues Y participas en la misma entidad).
 *
 * PERSISTENCIA DE DESBLOQUEOS (patrón settings-sync): el nivel más alto jamás
 * alcanzado de cada insignia se guarda en `user_settings.prefs` bajo una clave
 * dedicada, vía la puerta atómica `mergeUserPrefs` (no pisa las claves de nadie).
 * Espejo local en `safe-storage` para arranque instantáneo y offline.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Waypoints, Flower2, Sprout, GitMerge, type LucideIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getCurrentUserId } from "@/lib/os-social";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import { safeGet, safeSet } from "@/lib/safe-storage";
import type { GraphMetrics } from "@/lib/hub-social/graph";

export type BadgeId = "puente" | "polinizador" | "raiz" | "sinapsis";
export type BadgeLevel = "none" | "semilla" | "brote" | "flor";

/** Orden de niveles (índice = fuerza). */
export const LEVEL_ORDER: BadgeLevel[] = ["none", "semilla", "brote", "flor"];
export const LEVEL_LABEL: Record<BadgeLevel, string> = {
    none: "Por despertar", semilla: "Semilla", brote: "Brote", flor: "Flor",
};
/** Color por nivel (Crystal Liquid Glass — verdes que florecen). */
export const LEVEL_COLOR: Record<BadgeLevel, string> = {
    none: "#64748b", semilla: "#22d3ee", brote: "#34d399", flor: "#E9C46A",
};

export interface BadgeDef {
    id: BadgeId;
    label: string;
    icon: LucideIcon;
    color: string;
    /** Qué reconoce, en una frase. */
    description: string;
    /** Etiqueta de la unidad que se cuenta (para «3 de 4 sistemas»). */
    unit: string;
    /** Umbrales [semilla, brote, flor]. */
    thresholds: [number, number, number];
    /** Extrae el valor bruto de las métricas del grafo. */
    metric: (m: GraphMetrics) => number;
    /** El máximo teórico de la unidad (para textos «de N»). */
    max: number;
}

export const BADGE_DEFS: BadgeDef[] = [
    {
        id: "puente", label: "Puente", icon: Waypoints, color: "#3B9EFF",
        description: "Tejes vínculos a través de varios sistemas de la sociedad.",
        unit: "sistemas", thresholds: [2, 3, 4], max: 4,
        metric: (m) => m.systemsPresent.length,
    },
    {
        id: "polinizador", label: "Polinizador", icon: Flower2, color: "#c084fc",
        description: "Llevas polen entre distintos tipos de entidad de la red.",
        unit: "tipos", thresholds: [2, 3, 4], max: 5,
        metric: (m) => m.typesPresent.length,
    },
    {
        id: "raiz", label: "Raíz", icon: Sprout, color: "#34d399",
        description: "Fundas y sostienes entidades como administrador o fundador.",
        unit: "administradas", thresholds: [1, 3, 5], max: 5,
        metric: (m) => m.adminCount,
    },
    {
        id: "sinapsis", label: "Sinapsis", icon: GitMerge, color: "#E9C46A",
        description: "Vínculos recíprocos: sigues y participas en la misma entidad.",
        unit: "recíprocos", thresholds: [1, 3, 6], max: 6,
        metric: (m) => m.reciprocalCount,
    },
];

export interface ComputedBadge {
    def: BadgeDef;
    value: number;
    level: BadgeLevel;
    levelIndex: number;
    /** Umbral del siguiente nivel, o null si ya es flor. */
    nextThreshold: number | null;
    /** Cuántas unidades faltan para el siguiente nivel (0 si flor). */
    toNext: number;
    /** Progreso hacia el siguiente nivel, 0-100 (100 si flor). */
    progressPct: number;
    /** Explicación accionable de cómo subir. */
    howToLevelUp: string;
    /** ¿Está recién desbloqueado en esta sesión respecto a lo persistido? */
    isNew: boolean;
}

function levelIndexOf(value: number, [t1, t2, t3]: [number, number, number]): number {
    if (value >= t3) return 3;
    if (value >= t2) return 2;
    if (value >= t1) return 1;
    return 0;
}

function howTo(def: BadgeDef, value: number, levelIndex: number, nextThreshold: number | null): string {
    if (nextThreshold == null) return "Nivel máximo alcanzado. Eres flor plena en esta virtud.";
    const faltan = nextThreshold - value;
    const plural = faltan === 1 ? "" : "s";
    switch (def.id) {
        case "puente":
            return `Conecta con ${faltan} sistema${plural} más (político, educativo, cultural o social) para florecer como Puente.`;
        case "polinizador":
            return `Vincúlate con ${faltan} tipo${plural} de entidad más (páginas, grupos, eventos, E.F. o partidos).`;
        case "raiz":
            return `Funda o administra ${faltan} entidad${faltan === 1 ? "" : "es"} más para arraigar tu Raíz.`;
        case "sinapsis":
            return `Crea ${faltan} vínculo${plural} recíproco${plural} más: sigue Y únete a la misma entidad.`;
        default:
            return `Suma ${faltan} más para subir de nivel.`;
    }
}

/** Progreso hacia el siguiente nivel (proporción dentro del tramo actual). */
function progressToNext(value: number, thresholds: [number, number, number], levelIndex: number): number {
    if (levelIndex >= 3) return 100;
    const prev = levelIndex === 0 ? 0 : thresholds[levelIndex - 1];
    const next = thresholds[levelIndex];
    if (next <= prev) return 100;
    return Math.max(0, Math.min(100, Math.round(((value - prev) / (next - prev)) * 100)));
}

/** Registro persistido de desbloqueos: insignia → nivel más alto jamás alcanzado. */
export type BadgeUnlocks = Record<string, { level: BadgeLevel; at: string }>;

const PREF_KEY = "starseed.hub.badges.v1";

/** Lee los desbloqueos persistidos (nube con espejo local). Nunca lanza. */
export async function loadBadgeUnlocks(): Promise<BadgeUnlocks> {
    // Espejo local primero (instantáneo / offline).
    let local: BadgeUnlocks = {};
    try {
        const raw = safeGet(PREF_KEY);
        if (raw) local = JSON.parse(raw) as BadgeUnlocks;
    } catch { /* cache corrupta: ignora */ }
    try {
        const uid = await getCurrentUserId();
        if (!uid) return local;
        const supabase = createClient();
        const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", uid).maybeSingle();
        const prefs = (data?.prefs ?? {}) as Record<string, unknown>;
        const cloud = prefs[PREF_KEY];
        if (cloud && typeof cloud === "object") {
            const merged = { ...local, ...(cloud as BadgeUnlocks) };
            try { safeSet(PREF_KEY, JSON.stringify(merged)); } catch { /* noop */ }
            return merged;
        }
    } catch { /* sin sesión / sin tabla: usa el espejo local */ }
    return local;
}

/** Persiste (nube + local) los niveles más altos alcanzados. Best-effort. */
export async function persistBadgeUnlocks(next: BadgeUnlocks): Promise<void> {
    try { safeSet(PREF_KEY, JSON.stringify(next)); } catch { /* noop */ }
    try {
        const uid = await getCurrentUserId();
        if (!uid) return;
        await mergeUserPrefs({ [PREF_KEY]: next });
    } catch { /* la copia local ya lo tiene */ }
}

/** Computa las insignias a partir de las métricas + los desbloqueos persistidos. */
export function computeBadges(metrics: GraphMetrics, unlocks: BadgeUnlocks): ComputedBadge[] {
    return BADGE_DEFS.map((def) => {
        const value = def.metric(metrics);
        const levelIndex = levelIndexOf(value, def.thresholds);
        const level = LEVEL_ORDER[levelIndex];
        const nextThreshold = levelIndex >= 3 ? null : def.thresholds[levelIndex];
        const prevLevel = unlocks[def.id]?.level ?? "none";
        const prevIndex = LEVEL_ORDER.indexOf(prevLevel);
        return {
            def, value, level, levelIndex, nextThreshold,
            toNext: nextThreshold == null ? 0 : Math.max(0, nextThreshold - value),
            progressPct: progressToNext(value, def.thresholds, levelIndex),
            howToLevelUp: howTo(def, value, levelIndex, nextThreshold),
            isNew: levelIndex > 0 && levelIndex > prevIndex,
        };
    });
}

/** Deriva el registro de desbloqueos a persistir (máximo entre lo actual y lo previo). */
export function nextUnlocks(computed: ComputedBadge[], prev: BadgeUnlocks): BadgeUnlocks {
    const out: BadgeUnlocks = { ...prev };
    for (const b of computed) {
        const prevIndex = LEVEL_ORDER.indexOf(prev[b.def.id]?.level ?? "none");
        if (b.levelIndex > prevIndex && b.levelIndex > 0) {
            out[b.def.id] = { level: b.level, at: new Date().toISOString() };
        }
    }
    return out;
}

// ── Hook reactivo ───────────────────────────────────────────────────────────

export interface UseBadges {
    badges: ComputedBadge[];
    loading: boolean;
    /** Nº de insignias con algún nivel (≥ semilla). */
    achieved: number;
}

export function useBadges(metrics: GraphMetrics, ready: boolean): UseBadges {
    const [unlocks, setUnlocks] = useState<BadgeUnlocks>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        void loadBadgeUnlocks().then((u) => {
            if (alive) { setUnlocks(u); setLoading(false); }
        });
        return () => { alive = false; };
    }, []);

    const persistIfNeeded = useCallback(async (computed: ComputedBadge[], prev: BadgeUnlocks) => {
        const next = nextUnlocks(computed, prev);
        // ¿Cambió algo?
        if (JSON.stringify(next) !== JSON.stringify(prev)) {
            setUnlocks(next);
            await persistBadgeUnlocks(next);
        }
    }, []);

    const computed = computeBadges(metrics, unlocks);

    useEffect(() => {
        if (loading || !ready) return;
        void persistIfNeeded(computed, unlocks);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, ready, metrics.total, metrics.balanceIndex, metrics.reciprocalCount, metrics.adminCount]);

    return {
        badges: computed,
        loading,
        achieved: computed.filter((b) => b.levelIndex > 0).length,
    };
}
