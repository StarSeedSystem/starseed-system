"use client";

/**
 * ── hub-social/phase-oikos — Fase evolutiva y Oikos/biorregión ───────────────
 *
 * Cada entidad puede declarar su FASE del plan maestro (Semilla · Fruto ·
 * Cosecha, CLAUDE.md §5) y su OIKOS/biorregión (el hogar común, §9). Como no hay
 * DDL ni columna `config` en `os_pages/os_groups`, el dato se resuelve así, con
 * total honestidad:
 *
 *   1. Heurística sobre las ETIQUETAS públicas de la entidad (`tags`) — visible
 *      para todos, sin coste. Una entidad etiquetada «semilla» o «oikos:sur»
 *      declara su fase/hogar de forma abierta.
 *   2. DECLARACIÓN del dueño — guardada en `entity_state` (local-first + nube):
 *      · un documento por-cuenta (owner_kind="user", key="hub-entity-meta") con
 *        las declaraciones de MIS entidades — siempre legible por mí, y
 *      · un espejo best-effort en el ámbito de la propia entidad
 *        (owner_kind="page|group|event") para que miembros/dueños lo lean.
 *
 * El filtro del Hub usa (1) para toda la red y (2) para lo que es mío/visible.
 * Lo que no declara nada aparece honestamente como «sin fase declarada».
 */

import { useCallback, useEffect, useState } from "react";
import { Sprout, Leaf, Wheat, type LucideIcon } from "lucide-react";
import { safeGet, safeSet } from "@/lib/safe-storage";
import {
    getEntityState, setEntityState, subscribeEntityState, currentUserRef,
    type EntityKind as StateEntityKind,
} from "@/lib/sync/entity-state";
import { emitChange, onChange } from "@/lib/sync/live-signal";
import type { ConnType } from "@/lib/hub-social/meta";

export type Phase = "semilla" | "fruto" | "cosecha";

export interface PhaseMeta {
    label: string;
    icon: LucideIcon;
    color: string;
    blurb: string;
}

export const PHASE_META: Record<Phase, PhaseMeta> = {
    semilla: { label: "Semilla", icon: Sprout, color: "#34d399", blurb: "Génesis cultural y magnética." },
    fruto: { label: "Fruto", icon: Leaf, color: "#E9C46A", blurb: "Materialización y arraigo." },
    cosecha: { label: "Cosecha", icon: Wheat, color: "#f59e0b", blurb: "Plenitud sistémica." },
};

export const PHASES: readonly Phase[] = ["semilla", "fruto", "cosecha"] as const;

// ── Heurística sobre etiquetas públicas ─────────────────────────────────────

const PHASE_TAG_RE: Record<Phase, RegExp> = {
    semilla: /\b(semilla|génesis|genesis|seed|siembra)\b/i,
    fruto: /\b(fruto|fruta|materializaci[oó]n|arraigo|fruit)\b/i,
    cosecha: /\b(cosecha|plenitud|harvest|abundancia)\b/i,
};

export function derivePhaseFromTags(tags: string[]): Phase | null {
    for (const t of tags) {
        for (const p of PHASES) {
            if (PHASE_TAG_RE[p].test(t)) return p;
        }
    }
    return null;
}

const OIKOS_TAG_RE = /^(oikos|biorregi[oó]n|biorregion)[:\-\s]+(.+)$/i;

export function deriveOikosFromTags(tags: string[]): string | null {
    for (const t of tags) {
        const m = t.match(OIKOS_TAG_RE);
        if (m && m[2]) return m[2].trim();
    }
    return null;
}

// ── Declaraciones del dueño (entity_state) ──────────────────────────────────

export interface EntityDecl {
    phase?: Phase;
    oikos?: string;
}
export type EntityMetaMap = Record<string, EntityDecl>;

const CACHE_KEY = "starseed.hub.entity-meta.v1";
const ES_KEY = "hub-entity-meta";
export const ENTITY_META_TOPIC = "hub:entity-meta";
export const ENTITY_META_EVENT = "starseed:hub-entity-meta";

function readCache(): EntityMetaMap {
    try {
        const raw = safeGet(CACHE_KEY);
        if (!raw) return {};
        const p = JSON.parse(raw) as EntityMetaMap;
        return p && typeof p === "object" ? p : {};
    } catch { return {}; }
}
function writeCache(map: EntityMetaMap): void {
    try { safeSet(CACHE_KEY, JSON.stringify(map)); } catch { /* noop */ }
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ENTITY_META_EVENT)); } catch { /* noop */ }
}

/** Mis declaraciones (nube mezclada con caché local). Nunca lanza. */
export async function loadMyEntityMeta(): Promise<EntityMetaMap> {
    const local = readCache();
    try {
        const ref = await currentUserRef();
        if (!ref) return local;
        const row = await getEntityState<EntityMetaMap>(ref, ES_KEY);
        if (row?.value && typeof row.value === "object") {
            const merged = { ...local, ...row.value };
            writeCache(merged);
            return merged;
        }
    } catch { /* sin sesión / sin nube: usa caché */ }
    return local;
}

/** Mapea el tipo de conexión al owner_kind de entity_state (para el espejo). */
function stateKindOf(type: ConnType): StateEntityKind | null {
    switch (type) {
        case "pagina": return "page";
        case "grupo": return "group";
        case "evento": return "event";
        default: return null; // E.F./partidos son datos de muestra: sin ámbito real
    }
}

/**
 * Declara/actualiza la fase u oikos de una entidad propia. Escribe:
 *   · el documento por-cuenta (siempre), y
 *   · el espejo en el ámbito de la entidad (best-effort, para páginas/grupos/eventos).
 * Difunde la señal en vivo. Nunca lanza.
 */
export async function declareEntityMeta(slug: string, patch: EntityDecl, type: ConnType): Promise<EntityMetaMap> {
    const current = await loadMyEntityMeta();
    const nextDecl: EntityDecl = { ...current[slug], ...patch };
    // Limpia claves vacías.
    if (!nextDecl.phase) delete nextDecl.phase;
    if (!nextDecl.oikos) delete nextDecl.oikos;
    const next: EntityMetaMap = { ...current };
    if (Object.keys(nextDecl).length === 0) delete next[slug];
    else next[slug] = nextDecl;
    writeCache(next);
    try {
        const ref = await currentUserRef();
        if (ref) {
            await setEntityState(ref, ES_KEY, next);
            void emitChange(ENTITY_META_TOPIC, { data: { slug } });
        }
    } catch { /* la caché local ya lo tiene */ }
    // Espejo en la entidad (best-effort; RLS decide si se puede escribir).
    const kind = stateKindOf(type);
    if (kind) {
        try {
            await setEntityState({ kind, id: slug }, "hub-meta", { ...nextDecl, at: new Date().toISOString() });
        } catch { /* espejo opcional */ }
    }
    return next;
}

// ── Resolución para el filtro ───────────────────────────────────────────────

/** Fase efectiva: declaración del dueño (si la tengo) → heurística de etiquetas. */
export function resolvePhase(slug: string, tags: string[], myMeta: EntityMetaMap): Phase | null {
    return myMeta[slug]?.phase ?? derivePhaseFromTags(tags);
}
export function resolveOikos(slug: string, tags: string[], myMeta: EntityMetaMap): string | null {
    return myMeta[slug]?.oikos ?? deriveOikosFromTags(tags);
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface UseEntityMeta {
    meta: EntityMetaMap;
    loading: boolean;
    declare: (slug: string, patch: EntityDecl, type: ConnType) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useEntityMeta(): UseEntityMeta {
    const [meta, setMeta] = useState<EntityMetaMap>({});
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const m = await loadMyEntityMeta();
        setMeta(m);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setMeta(readCache());
        void refresh();
        const onLocal = () => setMeta(readCache());
        window.addEventListener(ENTITY_META_EVENT, onLocal);
        let unsub: (() => void) | undefined;
        void currentUserRef().then((ref) => {
            if (!ref) return;
            const stop = subscribeEntityState<EntityMetaMap>(ref, ES_KEY, () => { void refresh(); });
            const stopBroadcast = onChange(ENTITY_META_TOPIC, () => { void refresh(); });
            unsub = () => { stop(); stopBroadcast(); };
        });
        return () => {
            window.removeEventListener(ENTITY_META_EVENT, onLocal);
            unsub?.();
        };
    }, [refresh]);

    const declare = useCallback(async (slug: string, patch: EntityDecl, type: ConnType) => {
        const next = await declareEntityMeta(slug, patch, type);
        setMeta(next);
    }, []);

    return { meta, loading, declare, refresh };
}
