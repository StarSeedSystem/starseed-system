'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Profile Display Store (configuración por handle)
// ----------------------------------------------------------------
// Persistencia LOCAL y soberana (Identidad Soberana: los ajustes de
// presentación del perfil viven en el dispositivo del usuario) bajo
// UNA sola clave de localStorage:
//
//   starseed.profile.display.v1  →  { [handle]: ProfileDisplayConfig }
//
// Guarda, POR HANDLE:
//   • blocks   → qué bloques del display principal se muestran y en qué orden.
//   • sections → orden/visibilidad de las secciones en el modo "Libre".
//   • links    → sección "Enlaces" (título + URL configurados por el dueño).
//   • mode     → último modo de vista elegido (clasico | libre | vr).
//
// SSR-safe: useSyncExternalStore con snapshot de servidor estable y
// caché por contenido serializado (misma referencia si nada cambió),
// siguiendo el patrón de src/lib/library-store.ts. Sincroniza entre
// pestañas vía evento `storage` + evento propio en la misma pestaña.
// ════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useSyncExternalStore } from "react";

// ── Tipos ────────────────────────────────────────────────────────

/** Bloques del display principal (header). El orden aquí es el orden por defecto. */
export const PROFILE_BLOCK_IDS = [
    "comunidades",
    "ef",
    "grupos",
    "aportaciones",
    "publicaciones",
    "enlaces",
    "archivos",
] as const;
export type ProfileBlockId = (typeof PROFILE_BLOCK_IDS)[number];

/** Secciones de la página de perfil (modo Libre). Orden = orden por defecto. */
export const PROFILE_SECTION_IDS = [
    "dashboard",
    "gobierno",
    "agenda",
    "posts",
    "connections",
    "library",
    "collections",
    "enlaces",
    "discusion",
    // Aditivo (Formatos de perfil): contenido público sincronizado vía
    // entity-layout.ts (entity_state 'layout', kind='user') — a diferencia de
    // blocks/sections/links de más arriba, que son SOLO locales a este
    // dispositivo. Solo orden/visibilidad se guardan aquí; el CONTENIDO vive
    // en entity_state.
    "sobremi",
    "galeria",
    "secciones",
] as const;
export type ProfileSectionId = (typeof PROFILE_SECTION_IDS)[number];

export type ProfileViewMode = "clasico" | "libre" | "vr";

export interface ProfileLink {
    id: string;
    title: string;
    url: string;
}

export interface ProfileBlockPref {
    id: ProfileBlockId;
    visible: boolean;
}

export interface ProfileSectionPref {
    id: ProfileSectionId;
    visible: boolean;
}

export interface ProfileDisplayConfig {
    blocks: ProfileBlockPref[];
    sections: ProfileSectionPref[];
    links: ProfileLink[];
    mode: ProfileViewMode;
}

type StoredMap = Record<string, Partial<ProfileDisplayConfig>>;

// ── Constantes ───────────────────────────────────────────────────
const STORAGE_KEY = "starseed.profile.display.v1";
const CHANGE_EVENT = "starseed:profile-display";

// ── Utilidades ───────────────────────────────────────────────────

/** Normaliza un handle a clave estable: sin '@', decodificado y en minúsculas. */
export function normalizeHandleKey(handle: string | null | undefined): string {
    let h = handle ?? "";
    try {
        h = decodeURIComponent(h);
    } catch {
        /* se queda como venga */
    }
    return h.trim().replace(/^@+/, "").toLowerCase();
}

/** Normaliza una URL introducida a mano: añade https:// si falta esquema (respeta rutas internas). */
export function normalizeLinkUrl(url: string): string {
    const u = url.trim();
    if (!u) return u;
    if (u.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    return `https://${u}`;
}

function genId(): string {
    return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Lectura con caché estable (SSR-safe) ─────────────────────────
const EMPTY_MAP: StoredMap = {};
let cacheRaw: string | null = null;
let cacheValue: StoredMap = EMPTY_MAP;

function readAll(): StoredMap {
    if (typeof window === "undefined") return EMPTY_MAP;
    let raw = "";
    try {
        raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
        return EMPTY_MAP;
    }
    if (raw === cacheRaw) return cacheValue;
    let parsed: StoredMap = {};
    if (raw) {
        try {
            const v: unknown = JSON.parse(raw);
            if (v && typeof v === "object" && !Array.isArray(v)) parsed = v as StoredMap;
        } catch {
            parsed = {};
        }
    }
    cacheRaw = raw;
    cacheValue = parsed;
    return parsed;
}

function writeAll(next: StoredMap): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        /* cuota llena / navegación privada: degradar sin romper */
    }
    try {
        window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
        /* no-op */
    }
}

function subscribe(onChange: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = () => onChange();
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener("storage", handler);
    };
}

// ── Materialización (parcial guardado → config completa) ─────────

function isBlockId(v: unknown): v is ProfileBlockId {
    return typeof v === "string" && (PROFILE_BLOCK_IDS as readonly string[]).includes(v);
}
function isSectionId(v: unknown): v is ProfileSectionId {
    return typeof v === "string" && (PROFILE_SECTION_IDS as readonly string[]).includes(v);
}

/**
 * Fusiona lo guardado con los valores por defecto: respeta orden y visibilidad
 * de los ids conocidos, descarta ids desconocidos y añade al final los bloques
 * nuevos que no existían cuando se guardó la config (migración suave).
 */
export function materializeConfig(partial?: Partial<ProfileDisplayConfig>): ProfileDisplayConfig {
    const storedBlocks = partial && Array.isArray(partial.blocks) ? partial.blocks : [];
    const blocks: ProfileBlockPref[] = storedBlocks
        .filter((b) => b && isBlockId(b.id))
        .map((b) => ({ id: b.id, visible: b.visible !== false }));
    for (const id of PROFILE_BLOCK_IDS) {
        if (!blocks.some((b) => b.id === id)) blocks.push({ id, visible: true });
    }

    const storedSections = partial && Array.isArray(partial.sections) ? partial.sections : [];
    const sections: ProfileSectionPref[] = storedSections
        .filter((s) => s && isSectionId(s.id))
        .map((s) => ({ id: s.id, visible: s.visible !== false }));
    for (const id of PROFILE_SECTION_IDS) {
        if (!sections.some((s) => s.id === id)) sections.push({ id, visible: true });
    }

    const storedLinks = partial && Array.isArray(partial.links) ? partial.links : [];
    const links: ProfileLink[] = storedLinks
        .filter((l) => l && typeof l.url === "string" && l.url.trim() !== "")
        .map((l) => ({
            id: typeof l.id === "string" && l.id ? l.id : genId(),
            title: typeof l.title === "string" && l.title.trim() ? l.title.trim() : l.url,
            url: l.url,
        }));

    const mode: ProfileViewMode =
        partial?.mode === "libre" || partial?.mode === "vr" ? partial.mode : "clasico";

    return { blocks, sections, links, mode };
}

// ── Escritura por handle ─────────────────────────────────────────

function patchConfig(
    handleKey: string,
    updater: (current: ProfileDisplayConfig) => Partial<ProfileDisplayConfig>,
): void {
    const all = readAll();
    const current = materializeConfig(all[handleKey]);
    const next: ProfileDisplayConfig = { ...current, ...updater(current) };
    writeAll({ ...all, [handleKey]: next });
}

/** Reordena una lista de prefs según el array de ids dado (los que falten van al final). */
function reorderPrefs<T extends { id: string }>(prefs: T[], orderedIds: readonly string[]): T[] {
    const byId = new Map(prefs.map((p) => [p.id, p]));
    const next: T[] = [];
    for (const id of orderedIds) {
        const p = byId.get(id);
        if (p) {
            next.push(p);
            byId.delete(id);
        }
    }
    for (const p of prefs) if (byId.has(p.id)) next.push(p);
    return next;
}

// ── Hook público ─────────────────────────────────────────────────

export interface UseProfileDisplay {
    /** Config completa (defaults + guardado) para este handle. */
    config: ProfileDisplayConfig;
    setMode: (mode: ProfileViewMode) => void;
    toggleBlock: (id: ProfileBlockId) => void;
    reorderBlocks: (orderedIds: ProfileBlockId[]) => void;
    toggleSection: (id: ProfileSectionId) => void;
    reorderSections: (orderedIds: ProfileSectionId[]) => void;
    addLink: (title: string, url: string) => void;
    removeLink: (id: string) => void;
}

/**
 * Configuración de presentación del perfil identificado por `handle`
 * (con o sin '@'). Reactiva entre componentes y pestañas.
 */
export function useProfileDisplay(handle: string): UseProfileDisplay {
    const key = normalizeHandleKey(handle) || "me";
    const all = useSyncExternalStore(subscribe, readAll, () => EMPTY_MAP);
    const config = useMemo(() => materializeConfig(all[key]), [all, key]);

    const setMode = useCallback(
        (mode: ProfileViewMode) => patchConfig(key, () => ({ mode })),
        [key],
    );

    const toggleBlock = useCallback(
        (id: ProfileBlockId) =>
            patchConfig(key, (cfg) => ({
                blocks: cfg.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)),
            })),
        [key],
    );

    const reorderBlocks = useCallback(
        (orderedIds: ProfileBlockId[]) =>
            patchConfig(key, (cfg) => ({ blocks: reorderPrefs(cfg.blocks, orderedIds) })),
        [key],
    );

    const toggleSection = useCallback(
        (id: ProfileSectionId) =>
            patchConfig(key, (cfg) => ({
                sections: cfg.sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
            })),
        [key],
    );

    const reorderSections = useCallback(
        (orderedIds: ProfileSectionId[]) =>
            patchConfig(key, (cfg) => ({ sections: reorderPrefs(cfg.sections, orderedIds) })),
        [key],
    );

    const addLink = useCallback(
        (title: string, url: string) => {
            const cleanUrl = normalizeLinkUrl(url);
            if (!cleanUrl) return;
            patchConfig(key, (cfg) => ({
                links: [
                    ...cfg.links,
                    { id: genId(), title: title.trim() || cleanUrl, url: cleanUrl },
                ],
            }));
        },
        [key],
    );

    const removeLink = useCallback(
        (id: string) =>
            patchConfig(key, (cfg) => ({ links: cfg.links.filter((l) => l.id !== id) })),
        [key],
    );

    return {
        config,
        setMode,
        toggleBlock,
        reorderBlocks,
        toggleSection,
        reorderSections,
        addLink,
        removeLink,
    };
}
