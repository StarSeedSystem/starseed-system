"use client";

/*
 * media-brains — CEREBROS DE CONTEXTO por folder/archivo de la Galería.
 * ═══════════════════════════════════════════════════════════════════════════
 * Mismo patrón que src/lib/library/library-brains.ts (SOP §12), pero con
 * clave COMPUESTA por ítem: `targetId` es el id de una LibraryFolder o de un
 * SavedItem concreto de la biblioteca de media (Cámara/Galería).
 *
 * Persistencia: entity_state(ref, `media-brains:<targetId>`) =
 *   { mode: 'all' | 'selected', brains: string[] (ids de Brain) }
 *
 * DEFECTO distinto a library-brains.ts a propósito: mode:'all' aquí resuelve
 * a "todos los cerebros PRIVADOS" (Brain.scope === 'account'), NO absolutamente
 * todos — un folder de fotos personal no debería filtrar automáticamente a
 * cerebros compartidos de un grupo/página. Si el usuario elige `mode:'selected'`
 * puede escoger cualquier cerebro (privado o compartido) explícitamente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import {
    getEntityState,
    setEntityState,
    subscribeEntityState,
    type EntityRef,
} from "@/lib/sync/entity-state";
import { listBrains, type Brain } from "@/lib/brains/brains";

export interface MediaBrainsDoc {
    mode: "all" | "selected";
    brains: string[];
}

export function defaultMediaBrainsDoc(): MediaBrainsDoc {
    return { mode: "all", brains: [] };
}

function keyFor(targetId: string): string {
    return `media-brains:${targetId}`;
}

function normalizeDoc(raw: unknown): MediaBrainsDoc {
    if (!raw || typeof raw !== "object") return defaultMediaBrainsDoc();
    const r = raw as Record<string, unknown>;
    const mode = r.mode === "selected" ? "selected" : "all";
    const brains = Array.isArray(r.brains) ? r.brains.filter((b): b is string => typeof b === "string") : [];
    return { mode, brains };
}

/** Filtra a los cerebros PRIVADOS de la cuenta (scope === 'account'). */
function privateOnly(brains: Brain[]): Brain[] {
    return brains.filter((b) => b.scope === "account");
}

export async function getMediaBrainsConfig(ref: EntityRef, targetId: string): Promise<MediaBrainsDoc> {
    try {
        const row = await getEntityState<MediaBrainsDoc>(ref, keyFor(targetId));
        if (!row || !row.value) return defaultMediaBrainsDoc();
        return normalizeDoc(row.value);
    } catch {
        return defaultMediaBrainsDoc();
    }
}

export async function setMediaBrainsConfig(ref: EntityRef, targetId: string, doc: MediaBrainsDoc): Promise<void> {
    try {
        await setEntityState(ref, keyFor(targetId), doc);
    } catch {
        /* best-effort: la UI ya aplicó el cambio de forma optimista */
    }
}

/**
 * ENGANCHE para Aurora/Astraura: resuelve la lista de Brain (ya cargados) que
 * deben dar contexto al folder/archivo `targetId`. Sin `targetId`/`ref`, o
 * en mode='all', devuelve los cerebros PRIVADOS de la cuenta. mode='selected'
 * devuelve exactamente los ids elegidos (privados o compartidos).
 */
export async function getMediaBrains(ref: EntityRef | null, targetId: string | null): Promise<Brain[]> {
    const all = await listBrains();
    if (!ref || !targetId) return privateOnly(all);
    const config = await getMediaBrainsConfig(ref, targetId);
    if (config.mode === "all") return privateOnly(all);
    const allowed = new Set(config.brains);
    return all.filter((b) => allowed.has(b.id));
}

/* ─────────────────────────── Hook reactivo ─────────────────────────── */

export interface UseMediaBrains {
    config: MediaBrainsDoc;
    brains: Brain[];
    loading: boolean;
    setMode: (mode: "all" | "selected") => void;
    toggleBrain: (brainId: string) => void;
}

/** Hook: config del ítem + catálogo completo de cerebros, con realtime + escritura optimista. */
export function useMediaBrains(ref: EntityRef | null, targetId: string | null): UseMediaBrains {
    const [config, setConfig] = useState<MediaBrainsDoc>(defaultMediaBrainsDoc());
    const [brains, setBrains] = useState<Brain[]>([]);
    const [loading, setLoading] = useState<boolean>(!!targetId);

    const refKind = ref?.kind ?? "";
    const refId = ref?.id ?? "";

    useEffect(() => {
        let alive = true;
        void listBrains().then((list) => {
            if (alive) setBrains(list);
        });
        if (!ref || !targetId) {
            setConfig(defaultMediaBrainsDoc());
            setLoading(false);
            return;
        }
        setLoading(true);
        void getMediaBrainsConfig(ref, targetId).then((doc) => {
            if (alive) {
                setConfig(doc);
                setLoading(false);
            }
        });
        const unsub = subscribeEntityState<MediaBrainsDoc>(ref, keyFor(targetId), (change) => {
            if (change.self || !alive) return;
            setConfig(normalizeDoc(change.value));
        });
        return () => {
            alive = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refKind/refId/targetId identifican ref+target de forma estable
    }, [refKind, refId, targetId]);

    const persist = useCallback(
        (next: MediaBrainsDoc) => {
            setConfig(next);
            if (ref && targetId) void setMediaBrainsConfig(ref, targetId, next);
        },
        [ref, targetId],
    );

    const setMode = useCallback((mode: "all" | "selected") => persist({ ...config, mode }), [config, persist]);

    const toggleBrain = useCallback(
        (brainId: string) => {
            const set = new Set(config.brains);
            if (set.has(brainId)) set.delete(brainId);
            else set.add(brainId);
            persist({ ...config, brains: Array.from(set) });
        },
        [config, persist],
    );

    return { config, brains, loading, setMode, toggleBrain };
}
