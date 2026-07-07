"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Formato de entidad (entity-layout) — personalización aditiva
 * ---------------------------------------------------------------------------
 * Capa de datos sobre `entity_state` (key = 'layout'), reutilizable para
 * páginas, grupos Y perfiles propios (misma forma, distinto EntityRef):
 *
 *   grupo/[slug]   → { kind: "group", id: slug }
 *   pagina/[slug]  → { kind: "page",  id: slug }
 *   perfil propio  → { kind: "user",  id: uid }
 *
 * Qué guarda (todo OPCIONAL — sin capa guardada, todo se comporta EXACTAMENTE
 * igual que antes: cero regresiones):
 *   · accent/coverUrl → override de personalización visual (no sustituye los
 *     campos reales de la entidad — que se editan en EntityEditorDialog para
 *     página/grupo — sino una capa de estilo adicional para quien quiera
 *     matizar sin tocar la identidad "oficial" de la entidad).
 *   · tabs      → orden y visibilidad de las pestañas (grupo/página).
 *   · sections  → bloques "Sección libre" de contenido markdown.
 *   · integrations → activación de herramientas sugeridas (Educación /
 *     Gobernanza / Galería) según el tipo de entidad.
 *   · gallery   → imágenes destacadas (usado por "Galería" y por el perfil).
 *
 * RLS de `entity_state` (verificada en Supabase): dueño de página/grupo O
 * miembro (os_memberships) puede leer/escribir el ámbito; el propio usuario
 * para su ámbito 'user'. La UI, además, solo MUESTRA el editor a quien la
 * página ya considera propietario/a (useEntityOwner) — igual que el resto del
 * repo (EntityEditorDialog también se gatea así, sin un rol "admin" aparte).
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada a defaults sin sesión.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    getEntityState,
    setEntityState,
    subscribeEntityState,
    type EntityRef,
} from "@/lib/sync/entity-state";

export type { EntityRef };

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export interface TabPref {
    id: string;
    visible: boolean;
}

export interface FreeSection {
    id: string;
    title: string;
    /** Cuerpo en markdown. */
    body: string;
    createdAt: string;
    updatedAt: string;
}

export interface GalleryImage {
    url: string;
    caption?: string;
}

export interface EntityLayout {
    accent: string | null;
    coverUrl: string | null;
    tabs: TabPref[];
    sections: FreeSection[];
    integrations: Record<string, boolean>;
    gallery: GalleryImage[];
    /** Texto largo opcional ("Sobre mí ampliado" en perfiles). */
    aboutExtended: string;
}

const LAYOUT_KEY = "layout";

function emptyLayout(): EntityLayout {
    return { accent: null, coverUrl: null, tabs: [], sections: [], integrations: {}, gallery: [], aboutExtended: "" };
}

function normalizeLayout(raw: unknown): EntityLayout {
    const v = (raw && typeof raw === "object" ? raw : {}) as Partial<EntityLayout>;
    return {
        accent: typeof v.accent === "string" && v.accent ? v.accent : null,
        coverUrl: typeof v.coverUrl === "string" && v.coverUrl ? v.coverUrl : null,
        tabs: Array.isArray(v.tabs) ? v.tabs.filter((t) => t && typeof t.id === "string") : [],
        sections: Array.isArray(v.sections)
            ? v.sections.filter((s) => s && typeof s.id === "string" && typeof s.body === "string")
            : [],
        integrations: v.integrations && typeof v.integrations === "object" ? v.integrations : {},
        gallery: Array.isArray(v.gallery) ? v.gallery.filter((g) => g && typeof g.url === "string") : [],
        aboutExtended: typeof v.aboutExtended === "string" ? v.aboutExtended : "",
    };
}

function genId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ────────────────────────────── Lectura/escritura ───────────────────────── */

export async function getEntityLayout(ref: EntityRef): Promise<EntityLayout> {
    const row = await getEntityState<Partial<EntityLayout>>(ref, LAYOUT_KEY);
    return normalizeLayout(row?.value);
}

export async function saveEntityLayout(ref: EntityRef, patch: Partial<EntityLayout>): Promise<EntityLayout> {
    const current = await getEntityLayout(ref);
    const next = normalizeLayout({ ...current, ...patch });
    await setEntityState(ref, LAYOUT_KEY, next);
    return next;
}

/** Aplica orden/visibilidad guardados a una lista base de pestañas (ids conocidos). Aditivo:
 *  sin `tabs` guardados, devuelve `base` tal cual (mismo orden/visibilidad de siempre). */
export function applyTabLayout<T extends { id: string }>(base: T[], tabs: TabPref[]): Array<T & { visible: boolean }> {
    if (!tabs.length) return base.map((b) => ({ ...b, visible: true }));
    const byId = new Map(base.map((b) => [b.id, b]));
    const seen = new Set<string>();
    const ordered: Array<T & { visible: boolean }> = [];
    for (const pref of tabs) {
        const b = byId.get(pref.id);
        if (b && !seen.has(pref.id)) {
            ordered.push({ ...b, visible: pref.visible !== false });
            seen.add(pref.id);
        }
    }
    // Pestañas nuevas (añadidas por el código después de guardar el layout) van al final, visibles.
    for (const b of base) {
        if (!seen.has(b.id)) ordered.push({ ...b, visible: true });
    }
    return ordered;
}

/* ────────────────────────────────── Hook ────────────────────────────────── */

export interface UseEntityLayout {
    layout: EntityLayout;
    loading: boolean;
    /** Guarda un parche (merge superficial) y refleja el resultado localmente. */
    patch: (p: Partial<EntityLayout>) => Promise<void>;
    setAccent: (accent: string | null) => Promise<void>;
    setCoverUrl: (url: string | null) => Promise<void>;
    reorderTabs: (orderedIds: string[]) => Promise<void>;
    setTabVisible: (id: string, visible: boolean) => Promise<void>;
    addSection: (title: string, body: string) => Promise<void>;
    updateSection: (id: string, patch: Partial<Pick<FreeSection, "title" | "body">>) => Promise<void>;
    removeSection: (id: string) => Promise<void>;
    toggleIntegration: (key: string, on: boolean) => Promise<void>;
    addGalleryImage: (url: string, caption?: string) => Promise<void>;
    removeGalleryImage: (index: number) => Promise<void>;
    setAboutExtended: (text: string) => Promise<void>;
}

/**
 * Estado de formato/personalización de una entidad, sincronizado en tiempo
 * real entre dispositivos/co-editores. `ref` puede ser null mientras el slug
 * o el uid aún no están resueltos (se degrada a layout vacío, sin escrituras).
 */
export function useEntityLayout(ref: EntityRef | null): UseEntityLayout {
    const [layout, setLayout] = useState<EntityLayout>(emptyLayout());
    const [loading, setLoading] = useState(true);

    const refKey = ref ? `${ref.kind}:${ref.id}` : null;

    const reload = useCallback(async () => {
        if (!ref) { setLayout(emptyLayout()); setLoading(false); return; }
        setLoading(true);
        const next = await getEntityLayout(ref);
        setLayout(next);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey]);

    useEffect(() => { void reload(); }, [reload]);

    useEffect(() => {
        if (!ref) return () => {};
        return subscribeEntityState<Partial<EntityLayout>>(ref, LAYOUT_KEY, (change) => {
            if (change.self) return;
            setLayout(normalizeLayout(change.value));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey]);

    const patch = useCallback(
        async (p: Partial<EntityLayout>) => {
            if (!ref) return;
            const next = normalizeLayout({ ...layout, ...p });
            setLayout(next); // optimista
            await setEntityState(ref, LAYOUT_KEY, next);
        },
        [ref, layout],
    );

    const setAccent = useCallback((accent: string | null) => patch({ accent }), [patch]);
    const setCoverUrl = useCallback((coverUrl: string | null) => patch({ coverUrl }), [patch]);

    const reorderTabs = useCallback(
        (orderedIds: string[]) => {
            const byId = new Map(layout.tabs.map((t) => [t.id, t]));
            const next: TabPref[] = orderedIds.map((id) => byId.get(id) ?? { id, visible: true });
            return patch({ tabs: next });
        },
        [layout.tabs, patch],
    );

    const setTabVisible = useCallback(
        (id: string, visible: boolean) => {
            const has = layout.tabs.some((t) => t.id === id);
            const next = has
                ? layout.tabs.map((t) => (t.id === id ? { ...t, visible } : t))
                : [...layout.tabs, { id, visible }];
            return patch({ tabs: next });
        },
        [layout.tabs, patch],
    );

    const addSection = useCallback(
        (title: string, body: string) => {
            const now = new Date().toISOString();
            const section: FreeSection = { id: genId("sec"), title: title.trim() || "Sección libre", body, createdAt: now, updatedAt: now };
            return patch({ sections: [...layout.sections, section] });
        },
        [layout.sections, patch],
    );

    const updateSection = useCallback(
        (id: string, p: Partial<Pick<FreeSection, "title" | "body">>) => {
            const next = layout.sections.map((s) => (s.id === id ? { ...s, ...p, updatedAt: new Date().toISOString() } : s));
            return patch({ sections: next });
        },
        [layout.sections, patch],
    );

    const removeSection = useCallback(
        (id: string) => patch({ sections: layout.sections.filter((s) => s.id !== id) }),
        [layout.sections, patch],
    );

    const toggleIntegration = useCallback(
        (key: string, on: boolean) => patch({ integrations: { ...layout.integrations, [key]: on } }),
        [layout.integrations, patch],
    );

    const addGalleryImage = useCallback(
        (url: string, caption?: string) => patch({ gallery: [...layout.gallery, { url, caption }] }),
        [layout.gallery, patch],
    );

    const removeGalleryImage = useCallback(
        (index: number) => patch({ gallery: layout.gallery.filter((_, i) => i !== index) }),
        [layout.gallery, patch],
    );

    const setAboutExtended = useCallback((text: string) => patch({ aboutExtended: text }), [patch]);

    return useMemo(
        () => ({
            layout, loading, patch, setAccent, setCoverUrl, reorderTabs, setTabVisible,
            addSection, updateSection, removeSection, toggleIntegration,
            addGalleryImage, removeGalleryImage, setAboutExtended,
        }),
        [layout, loading, patch, setAccent, setCoverUrl, reorderTabs, setTabVisible, addSection, updateSection, removeSection, toggleIntegration, addGalleryImage, removeGalleryImage, setAboutExtended],
    );
}

/* ─────────────────────── Integraciones sugeridas por kind ──────────────── */

export type IntegrationKey = "educacion" | "gobernanza" | "galeria";

export interface IntegrationSuggestion {
    key: IntegrationKey;
    label: string;
}

const ALL_SUGGESTIONS: IntegrationSuggestion[] = [
    { key: "educacion", label: "Educación" },
    { key: "gobernanza", label: "Gobernanza" },
    { key: "galeria", label: "Galería" },
];

/**
 * Sugerencias de integración para un tipo de entidad. Solo se ofrecen cuando
 * la entidad NO tiene ya un toolkit propio que cubra ese terreno (evita
 * duplicar Educación/Gobernanza donde GrupoToolkit/EF/Partido/Asamblea ya las
 * traen). Hoy eso deja fuera a "personal" y "pagina" (kind sin toolkit) — las
 * candidatas más flexibles, y las que hoy no ofrecen NINGUNA de estas tres.
 */
export function suggestedIntegrations(hasOwnToolkit: boolean): IntegrationSuggestion[] {
    return hasOwnToolkit ? [] : ALL_SUGGESTIONS;
}
