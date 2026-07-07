"use client";

/*
 * library-brains — CEREBROS DE CONTEXTO por biblioteca de PERFIL (SOP §12).
 * ═══════════════════════════════════════════════════════════════════════════
 * Cada biblioteca de perfil elige qué CEREBROS (src/lib/brains/brains.ts,
 * registro real de memorias/servidores) dan contexto a sus archivos.
 *
 * Persistencia: entity_state(profile:<id>, 'library-brains') =
 *   { mode: 'all' | 'selected', brains: string[] (ids de Brain) }
 * DEFECTO: mode:'all' — TODOS los cerebros disponibles, para TODOS los
 * perfiles de la cuenta (ver defaultLibraryBrainsDoc()).
 *
 * `getLibraryBrains(profileId)` es el enganche que Aurora/Astraura debe
 * llamar para resolver qué cerebros usar como contexto al actuar sobre la
 * biblioteca de un perfil concreto — devuelve la lista de `Brain` YA
 * resuelta (no solo ids), lista para pasar a assembleBrainBundle() o
 * similar. Documentado también en el SOP §12.
 */

import { useCallback, useEffect, useState } from "react";
import {
    getEntityState,
    setEntityState,
    subscribeEntityState,
    type EntityRef,
} from "@/lib/sync/entity-state";
import { listBrains, type Brain } from "@/lib/brains/brains";

const LIBRARY_BRAINS_KEY = "library-brains";

export interface LibraryBrainsDoc {
    mode: "all" | "selected";
    /** ids de Brain incluidos cuando mode==='selected'. */
    brains: string[];
}

export function defaultLibraryBrainsDoc(): LibraryBrainsDoc {
    return { mode: "all", brains: [] };
}

function normalizeDoc(raw: unknown): LibraryBrainsDoc {
    if (!raw || typeof raw !== "object") return defaultLibraryBrainsDoc();
    const r = raw as Record<string, unknown>;
    const mode = r.mode === "selected" ? "selected" : "all";
    const brains = Array.isArray(r.brains) ? r.brains.filter((b): b is string => typeof b === "string") : [];
    return { mode, brains };
}

function profileRef(profileId: string): EntityRef {
    return { kind: "profile", id: profileId };
}

/** Lee la config de cerebros de biblioteca de un perfil (nube; default 'all' si no existe fila). Nunca lanza. */
export async function getLibraryBrainsConfig(profileId: string): Promise<LibraryBrainsDoc> {
    try {
        const row = await getEntityState<LibraryBrainsDoc>(profileRef(profileId), LIBRARY_BRAINS_KEY);
        if (!row || !row.value) return defaultLibraryBrainsDoc();
        return normalizeDoc(row.value);
    } catch {
        return defaultLibraryBrainsDoc();
    }
}

/** Escribe (upsert) la config de cerebros de biblioteca de un perfil. */
export async function setLibraryBrainsConfig(profileId: string, doc: LibraryBrainsDoc): Promise<void> {
    try {
        await setEntityState(profileRef(profileId), LIBRARY_BRAINS_KEY, doc);
    } catch {
        /* best-effort: la UI ya aplicó el cambio de forma optimista */
    }
}

/**
 * ENGANCHE para Aurora/Astraura: resuelve la lista de Brain (ya cargados,
 * no solo ids) que deben dar contexto a la biblioteca de `profileId`.
 * mode='all' (o profileId nulo/sin config) ⇒ TODOS los cerebros disponibles
 * de la cuenta. mode='selected' ⇒ solo los ids listados (que sigan existiendo).
 *
 * Uso previsto donde se arma el contexto de Aurora para una biblioteca de
 * perfil (p. ej. src/ai/astraura/context.ts o equivalente — enganche
 * documentado aquí; conectar allí es una edición pequeña si ese archivo
 * arma el contexto por biblioteca/perfil).
 */
export async function getLibraryBrains(profileId: string | null | undefined): Promise<Brain[]> {
    const all = await listBrains();
    if (!profileId) return all;
    const config = await getLibraryBrainsConfig(profileId);
    if (config.mode === "all") return all;
    const allowed = new Set(config.brains);
    return all.filter((b) => allowed.has(b.id));
}

/* ─────────────────────────── Hook reactivo ─────────────────────────── */

export interface UseLibraryBrains {
    config: LibraryBrainsDoc;
    brains: Brain[];
    loading: boolean;
    setMode: (mode: "all" | "selected") => void;
    toggleBrain: (brainId: string) => void;
}

/** Hook: config + catálogo completo de cerebros disponibles, con realtime + escritura optimista. */
export function useLibraryBrains(profileId: string | null): UseLibraryBrains {
    const [config, setConfig] = useState<LibraryBrainsDoc>(defaultLibraryBrainsDoc());
    const [brains, setBrains] = useState<Brain[]>([]);
    const [loading, setLoading] = useState(!!profileId);

    useEffect(() => {
        let alive = true;
        void listBrains().then((list) => {
            if (alive) setBrains(list);
        });
        if (!profileId) {
            setConfig(defaultLibraryBrainsDoc());
            setLoading(false);
            return;
        }
        setLoading(true);
        void getLibraryBrainsConfig(profileId).then((doc) => {
            if (alive) {
                setConfig(doc);
                setLoading(false);
            }
        });
        const unsub = subscribeEntityState<LibraryBrainsDoc>(profileRef(profileId), LIBRARY_BRAINS_KEY, (change) => {
            if (change.self || !alive) return;
            setConfig(normalizeDoc(change.value));
        });
        return () => {
            alive = false;
            unsub();
        };
    }, [profileId]);

    const persist = useCallback(
        (next: LibraryBrainsDoc) => {
            setConfig(next);
            if (profileId) void setLibraryBrainsConfig(profileId, next);
        },
        [profileId],
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
