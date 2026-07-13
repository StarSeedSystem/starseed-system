'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Desktop Store (Escritorios ilimitados por perfil)
// ----------------------------------------------------------------
// Modelo + persistencia soberana de los ESCRITORIOS del usuario:
//   • localStorage `starseed.desktops.v1` es la FUENTE DE VERDAD.
//   • Espejo best-effort en la cuenta (Supabase user_settings.prefs.desktops)
//     imitando el patrón NO invasivo de src/lib/dashboards-sync.ts:
//     local manda; la nube es red de seguridad (restaura SOLO si vacío).
//   • SSR-safe vía useSyncExternalStore + snapshot vacío estable.
//   • Lienzo Universal: los iconos REFERENCIAN entidades (apps del
//     catálogo, widgets del registry, recursos de la Biblioteca) por id,
//     nunca las copian.
// ════════════════════════════════════════════════════════════════

import { useSyncExternalStore, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

// ── Tipos del modelo ─────────────────────────────────────────────
export type DesktopIconKind = "app" | "file" | "folder" | "widget" | "link";
export type DesktopIconSize = "sm" | "md" | "lg";
export type DesktopIconViewMode = "icon" | "preview";

/**
 * Apariencia personalizable de un widget (icono en vista previa viva o
 * ventana). Todo opcional: sin `appearance`, el widget usa el cristal por
 * defecto del sistema. Aditivo — no afecta a apps/archivos/folders.
 */
export interface DesktopWidgetAppearance {
    /** Opacidad del fondo cristal (0.2..1). */
    opacity?: number;
    /** Tinte hex sobre el cristal (sustituye al accent por defecto). */
    tint?: string;
    /** Radio de esquina en px (12..32). */
    radius?: number;
}

/**
 * Huella en celdas de rejilla para widgets con vista previa (1x1..4x4).
 * Independiente de DesktopIconSize (que sigue rigiendo el tile clásico).
 */
export interface DesktopWidgetSpan {
    cols: 1 | 2 | 3 | 4;
    rows: 1 | 2 | 3 | 4;
}

export interface DesktopIcon {
    id: string;
    kind: DesktopIconKind;
    /** Referencia a la Entidad Única: id de app del catálogo, widget_type, id de recurso… */
    refId?: string;
    /** URL para kind 'file' | 'link'. */
    url?: string;
    name: string;
    /** Icono oficial (p. ej. /app-icons/*.png). Si falla, cae a Lucide/iniciales. */
    iconUrl?: string;
    /** Posición como FRACCIÓN 0..1 del lienzo de iconos. */
    x: number;
    y: number;
    size: DesktopIconSize;
    viewMode: DesktopIconViewMode;
    accent?: string;
    /** Pista de ContentKind para 'file' (image, video, pdf…). */
    fileKind?: string;
    /** Miniatura opcional (URL) para archivos: imagen, portada de vídeo/pdf… */
    thumbUrl?: string;
    /** Texto embebido para notas rápidas ('file' con fileKind 'note'). */
    text?: string;
    /** Marca temporal de creación (ms) — habilita ordenar por fecha. */
    createdAt?: number;
    /**
     * Folders: contenido. Desde v1.1 admite ANIDAR folders (ramificación
     * jerárquica ilimitada). Retrocompatible: el contenido antiguo se conserva.
     */
    children?: DesktopIcon[];
    /** Widgets: apariencia personalizada del cristal (v1.2, opcional). */
    appearance?: DesktopWidgetAppearance;
    /** Widgets con preview: huella en celdas 1x1..4x4 (v1.2, opcional). */
    widgetSpan?: DesktopWidgetSpan;
}

export type DesktopWindowContentType = "app" | "file" | "widget" | "browser" | "folder";

export interface DesktopWindowContentRef {
    type: DesktopWindowContentType;
    /** app id · widget_type · url de archivo · url inicial · id de icono folder. */
    ref: string;
    name?: string;
    meta?: Record<string, string | undefined>;
}

export interface DesktopWindowRect { x: number; y: number; w: number; h: number; }

export interface DesktopWindow extends DesktopWindowRect {
    id: string;
    contentRef: DesktopWindowContentRef;
    z: number;
    minimized: boolean;
    maximized: boolean;
    /** Rect previo para restaurar al des-maximizar. */
    prev?: DesktopWindowRect;
}

export interface DesktopWallpaper {
    type: "inherit" | "custom";
    /** URL de imagen o cadena CSS de gradiente (solo 'custom'). */
    value?: string;
}

/** Criterios de ordenación automática de iconos. */
export type DesktopSortMode = "manual" | "name" | "type" | "date";
/** Densidad de la rejilla del escritorio (afecta separación de celdas). */
export type DesktopDensity = "cozy" | "compact" | "spacious";
/** Tema/tinte cristalino por escritorio (acento del lienzo). */
export type DesktopTheme = "auto" | "azure" | "emerald" | "amber" | "crimson" | "violet";

/**
 * Preferencias de diseño y vista POR escritorio. Todas opcionales para
 * retrocompatibilidad: un escritorio antiguo sin `view` usa los valores
 * por defecto (DEFAULT_DESKTOP_VIEW) y sigue funcionando igual.
 */
export interface DesktopView {
    /** Tamaño base de los iconos del escritorio. */
    iconSize?: DesktopIconSize;
    /** Muestra el patrón de rejilla del lienzo. */
    showGrid?: boolean;
    /** Densidad de la rejilla (separación entre celdas). */
    density?: DesktopDensity;
    /** Criterio de ordenación (manual conserva posiciones libres). */
    sortMode?: DesktopSortMode;
    /** Tema/tinte del escritorio. */
    theme?: DesktopTheme;
    /** Snap de VENTANAS a mitades/cuartos al arrastrar a los bordes (v1.2). */
    windowSnap?: boolean;
}

export const DEFAULT_DESKTOP_VIEW: Required<DesktopView> = {
    iconSize: "md",
    showGrid: false,
    density: "cozy",
    sortMode: "manual",
    theme: "auto",
    windowSnap: true,
};

export interface Desktop {
    id: string;
    name: string;
    wallpaper?: DesktopWallpaper;
    icons: DesktopIcon[];
    windows: DesktopWindow[];
    /** Preferencias de vista/diseño (opcional; ver DEFAULT_DESKTOP_VIEW). */
    view?: DesktopView;
}

export interface DesktopsState {
    desktops: Desktop[];
    activeId: string;
    /** Rejilla magnética de iconos (opcional, conmutable). */
    snap: boolean;
    savedAt: number;
}

// ── Constantes ───────────────────────────────────────────────────
const LS_KEY = "starseed.desktops.v1";
const DESKTOPS_EVENT = "starseed:desktops";
export const DESKTOPS_RESTORED_EVENT = "starseed:desktops:restored";

const PUSH_DEBOUNCE_MS = 1800;
const POLL_INTERVAL_MS = 30_000;

const EMPTY_STATE: DesktopsState = { desktops: [], activeId: "", snap: true, savedAt: 0 };

// ── Helpers de bajo nivel ────────────────────────────────────────
function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

let _seq = 0;
export function newId(prefix: string): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch { /* noop */ }
    return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

function num(v: unknown, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
    return typeof v === "string" && v.length > 0 ? v : fallback;
}

// ── Normalización defensiva (datos locales o restaurados de la nube) ──
/** Límite de profundidad de anidamiento (defensivo contra ciclos/datos corruptos). */
const MAX_FOLDER_DEPTH = 8;

function normalizeWidgetAppearance(raw: unknown): DesktopWidgetAppearance | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as Record<string, unknown>;
    const out: DesktopWidgetAppearance = {};
    if (typeof r.opacity === "number" && Number.isFinite(r.opacity)) out.opacity = Math.min(1, Math.max(0.2, r.opacity));
    if (typeof r.tint === "string" && r.tint) out.tint = r.tint;
    if (typeof r.radius === "number" && Number.isFinite(r.radius)) out.radius = Math.min(32, Math.max(8, r.radius));
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeWidgetSpan(raw: unknown): DesktopWidgetSpan | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as Record<string, unknown>;
    const cols = num(r.cols, 0);
    const rows = num(r.rows, 0);
    if (cols < 1 || cols > 4 || rows < 1 || rows > 4) return undefined;
    return { cols: Math.round(cols) as 1 | 2 | 3 | 4, rows: Math.round(rows) as 1 | 2 | 3 | 4 };
}

function normalizeIcon(raw: unknown, depth = 0): DesktopIcon | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const kind = r.kind;
    if (kind !== "app" && kind !== "file" && kind !== "folder" && kind !== "widget" && kind !== "link") return null;
    const icon: DesktopIcon = {
        id: str(r.id, newId("icon")),
        kind,
        refId: typeof r.refId === "string" ? r.refId : undefined,
        url: typeof r.url === "string" ? r.url : undefined,
        name: str(r.name, "Sin nombre"),
        iconUrl: typeof r.iconUrl === "string" ? r.iconUrl : undefined,
        x: Math.min(0.98, Math.max(0, num(r.x, 0.05))),
        y: Math.min(0.98, Math.max(0, num(r.y, 0.05))),
        size: r.size === "sm" || r.size === "lg" ? r.size : "md",
        viewMode: r.viewMode === "preview" ? "preview" : "icon",
        accent: typeof r.accent === "string" ? r.accent : undefined,
        fileKind: typeof r.fileKind === "string" ? r.fileKind : undefined,
        thumbUrl: typeof r.thumbUrl === "string" ? r.thumbUrl : undefined,
        text: typeof r.text === "string" ? r.text : undefined,
        createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : undefined,
        appearance: normalizeWidgetAppearance(r.appearance),
        widgetSpan: normalizeWidgetSpan(r.widgetSpan),
    };
    // Folders: ramificación jerárquica. Admite folders anidados (v1.1) pero
    // conserva intactos los datos antiguos (que solo tenían hijos no-folder).
    if (kind === "folder" && Array.isArray(r.children) && depth < MAX_FOLDER_DEPTH) {
        icon.children = r.children
            .map((c) => normalizeIcon(c, depth + 1))
            .filter((c): c is DesktopIcon => c !== null);
    } else if (kind === "folder") {
        icon.children = [];
    }
    return icon;
}

function normalizeWindow(raw: unknown): DesktopWindow | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const cr = r.contentRef as Record<string, unknown> | undefined;
    const type = cr?.type;
    if (type !== "app" && type !== "file" && type !== "widget" && type !== "browser" && type !== "folder") return null;
    return {
        id: str(r.id, newId("win")),
        contentRef: {
            type,
            ref: str(cr?.ref, ""),
            name: typeof cr?.name === "string" ? cr.name : undefined,
            meta: cr?.meta && typeof cr.meta === "object" ? (cr.meta as Record<string, string | undefined>) : undefined,
        },
        x: num(r.x, 64),
        y: num(r.y, 40),
        w: Math.max(280, num(r.w, 760)),
        h: Math.max(200, num(r.h, 520)),
        z: Math.max(1, num(r.z, 1)),
        minimized: r.minimized === true,
        maximized: r.maximized === true,
        prev: r.prev && typeof r.prev === "object"
            ? {
                x: num((r.prev as Record<string, unknown>).x, 64),
                y: num((r.prev as Record<string, unknown>).y, 40),
                w: Math.max(280, num((r.prev as Record<string, unknown>).w, 760)),
                h: Math.max(200, num((r.prev as Record<string, unknown>).h, 520)),
            }
            : undefined,
    };
}

function normalizeView(raw: unknown): DesktopView | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const v = raw as Record<string, unknown>;
    const out: DesktopView = {};
    if (v.iconSize === "sm" || v.iconSize === "md" || v.iconSize === "lg") out.iconSize = v.iconSize;
    if (typeof v.showGrid === "boolean") out.showGrid = v.showGrid;
    if (v.density === "cozy" || v.density === "compact" || v.density === "spacious") out.density = v.density;
    if (v.sortMode === "manual" || v.sortMode === "name" || v.sortMode === "type" || v.sortMode === "date") out.sortMode = v.sortMode;
    if (
        v.theme === "auto" || v.theme === "azure" || v.theme === "emerald" ||
        v.theme === "amber" || v.theme === "crimson" || v.theme === "violet"
    ) out.theme = v.theme;
    if (typeof v.windowSnap === "boolean") out.windowSnap = v.windowSnap;
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeDesktop(raw: unknown): Desktop | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const wp = r.wallpaper as Record<string, unknown> | undefined;
    return {
        id: str(r.id, newId("desk")),
        name: str(r.name, "Escritorio"),
        wallpaper: wp && (wp.type === "custom" || wp.type === "inherit")
            ? { type: wp.type, value: typeof wp.value === "string" ? wp.value : undefined }
            : undefined,
        icons: Array.isArray(r.icons)
            ? r.icons.map((i) => normalizeIcon(i)).filter((i): i is DesktopIcon => i !== null)
            : [],
        windows: Array.isArray(r.windows)
            ? r.windows.map((w) => normalizeWindow(w)).filter((w): w is DesktopWindow => w !== null)
            : [],
        view: normalizeView(r.view),
    };
}

export function normalizeState(raw: unknown): DesktopsState | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.desktops)) return null;
    const desktops = r.desktops
        .map((d) => normalizeDesktop(d))
        .filter((d): d is Desktop => d !== null);
    const activeId =
        typeof r.activeId === "string" && desktops.some((d) => d.id === r.activeId)
            ? r.activeId
            : (desktops[0]?.id ?? "");
    return {
        desktops,
        activeId,
        snap: r.snap !== false,
        savedAt: num(r.savedAt, 0),
    };
}

// ── Snapshot cacheado (estabilidad referencial para React) ──────
let cache: { raw: string; value: DesktopsState } = { raw: "", value: EMPTY_STATE };

function readRaw(): string {
    if (!isClient()) return "";
    try {
        return localStorage.getItem(LS_KEY) ?? "";
    } catch {
        return "";
    }
}

export function readDesktopsSnapshot(): DesktopsState {
    const raw = readRaw();
    if (raw === cache.raw) return cache.value;
    let value: DesktopsState = EMPTY_STATE;
    if (raw) {
        try {
            value = normalizeState(JSON.parse(raw)) ?? EMPTY_STATE;
        } catch {
            value = EMPTY_STATE;
        }
    }
    cache = { raw, value };
    return value;
}

function emitChange(): void {
    if (!isClient()) return;
    try {
        window.dispatchEvent(new Event(DESKTOPS_EVENT));
    } catch { /* noop */ }
}

function write(state: DesktopsState): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    emitChange();
}

function mutate(fn: (s: DesktopsState) => DesktopsState): void {
    write(fn(readDesktopsSnapshot()));
}

function mutateDesktop(desktopId: string, fn: (d: Desktop) => Desktop): void {
    mutate((s) => ({
        ...s,
        desktops: s.desktops.map((d) => (d.id === desktopId ? fn(d) : d)),
    }));
}

// ── Posicionamiento: hueco libre en rejilla virtual (fracciones) ──
const GRID = { x0: 0.015, y0: 0.03, dx: 0.121, dy: 0.19, cols: 8, rows: 5 };

export function findFreeSpot(desktop: Desktop): { x: number; y: number } {
    const taken = (fx: number, fy: number) =>
        desktop.icons.some((i) => Math.abs(i.x - fx) < 0.06 && Math.abs(i.y - fy) < 0.095);
    for (let r = 0; r < GRID.rows; r++) {
        for (let c = 0; c < GRID.cols; c++) {
            const fx = GRID.x0 + c * GRID.dx;
            const fy = GRID.y0 + r * GRID.dy;
            if (!taken(fx, fy)) return { x: fx, y: fy };
        }
    }
    const n = desktop.icons.length;
    return {
        x: Math.min(0.9, GRID.x0 + (n % GRID.cols) * GRID.dx * 0.5),
        y: Math.min(0.85, GRID.y0 + (Math.floor(n / GRID.cols) % GRID.rows) * GRID.dy * 0.5 + 0.04),
    };
}

// ── Helpers de árbol de iconos (ramificación jerárquica) ─────────
/** Recorre el árbol de iconos aplicando `fn` a cada nodo (incluye hijos). */
function mapIconTree(icons: DesktopIcon[], fn: (i: DesktopIcon) => DesktopIcon): DesktopIcon[] {
    return icons.map((i) => {
        const mapped = fn(i);
        if (mapped.kind === "folder" && mapped.children && mapped.children.length > 0) {
            return { ...mapped, children: mapIconTree(mapped.children, fn) };
        }
        return mapped;
    });
}

/** Elimina el nodo `id` en cualquier nivel del árbol. */
function removeFromTree(icons: DesktopIcon[], id: string): DesktopIcon[] {
    return icons
        .filter((i) => i.id !== id)
        .map((i) =>
            i.kind === "folder" && i.children
                ? { ...i, children: removeFromTree(i.children, id) }
                : i,
        );
}

/** Busca un icono por id en cualquier nivel. */
export function findIconInTree(icons: DesktopIcon[], id: string): DesktopIcon | null {
    for (const i of icons) {
        if (i.id === id) return i;
        if (i.kind === "folder" && i.children) {
            const hit = findIconInTree(i.children, id);
            if (hit) return hit;
        }
    }
    return null;
}

/** ¿`ancestorId` contiene (directa o indirectamente) a `nodeId`? Evita ciclos. */
function isDescendant(icons: DesktopIcon[], ancestorId: string, nodeId: string): boolean {
    const anc = findIconInTree(icons, ancestorId);
    if (!anc || anc.kind !== "folder" || !anc.children) return false;
    return findIconInTree(anc.children, nodeId) !== null;
}

/** Inserta `node` como hijo del folder `folderId` (en cualquier nivel). */
function insertIntoFolder(icons: DesktopIcon[], folderId: string, node: DesktopIcon): DesktopIcon[] {
    return icons.map((i) => {
        if (i.id === folderId && i.kind === "folder") {
            return { ...i, children: [...(i.children ?? []), node] };
        }
        if (i.kind === "folder" && i.children) {
            return { ...i, children: insertIntoFolder(i.children, folderId, node) };
        }
        return i;
    });
}

// ── Acciones: escritorios ────────────────────────────────────────
function makeDesktop(name: string): Desktop {
    return { id: newId("desk"), name, icons: [], windows: [] };
}

/** Siembra el primer escritorio si no hay ninguno (solo cliente). */
export function seedIfEmpty(): void {
    if (!isClient()) return;
    const s = readDesktopsSnapshot();
    if (s.desktops.length > 0) return;
    const first = makeDesktop("Escritorio 1");
    write({ desktops: [first], activeId: first.id, snap: true, savedAt: Date.now() });
}

export function createDesktop(name?: string): string {
    const d = makeDesktop(name?.trim() || `Escritorio ${readDesktopsSnapshot().desktops.length + 1}`);
    mutate((s) => ({ ...s, desktops: [...s.desktops, d], activeId: d.id }));
    return d.id;
}

export function renameDesktop(id: string, name: string): void {
    const clean = name.trim();
    if (!clean) return;
    mutate((s) => ({
        ...s,
        desktops: s.desktops.map((d) => (d.id === id ? { ...d, name: clean } : d)),
    }));
}

export function deleteDesktop(id: string): void {
    mutate((s) => {
        if (s.desktops.length <= 1) return s; // siempre queda al menos uno
        const desktops = s.desktops.filter((d) => d.id !== id);
        return {
            ...s,
            desktops,
            activeId: s.activeId === id ? (desktops[0]?.id ?? "") : s.activeId,
        };
    });
}

export function setActiveDesktop(id: string): void {
    mutate((s) => (s.desktops.some((d) => d.id === id) ? { ...s, activeId: id } : s));
}

export function setWallpaper(desktopId: string, wallpaper: DesktopWallpaper | undefined): void {
    mutateDesktop(desktopId, (d) => ({ ...d, wallpaper }));
}

export function setSnap(snap: boolean): void {
    mutate((s) => ({ ...s, snap }));
}

/** Duplica un escritorio completo (iconos con nuevas identidades, sin ventanas). */
export function duplicateDesktop(id: string): string | null {
    const src = readDesktopsSnapshot().desktops.find((d) => d.id === id);
    if (!src) return null;
    const newDeskId = newId("desk");
    const cloneTree = (node: DesktopIcon): DesktopIcon => ({
        ...node,
        id: newId("icon"),
        children: node.children?.map(cloneTree),
    });
    const clone: Desktop = {
        id: newDeskId,
        name: `${src.name} (copia)`,
        wallpaper: src.wallpaper ? { ...src.wallpaper } : undefined,
        view: src.view ? { ...src.view } : undefined,
        icons: src.icons.map(cloneTree),
        windows: [],
    };
    mutate((s) => {
        const idx = s.desktops.findIndex((d) => d.id === id);
        const desktops = [...s.desktops];
        desktops.splice(idx + 1, 0, clone);
        return { ...s, desktops, activeId: newDeskId };
    });
    return newDeskId;
}

/** Reordena un escritorio de `fromIndex` a `toIndex` (drag de pestañas/lista). */
export function reorderDesktops(fromIndex: number, toIndex: number): void {
    mutate((s) => {
        if (
            fromIndex < 0 || toIndex < 0 ||
            fromIndex >= s.desktops.length || toIndex >= s.desktops.length ||
            fromIndex === toIndex
        ) return s;
        const desktops = [...s.desktops];
        const [moved] = desktops.splice(fromIndex, 1);
        desktops.splice(toIndex, 0, moved);
        return { ...s, desktops };
    });
}

/** Fija (mezcla) las preferencias de vista/diseño de un escritorio. */
export function setDesktopView(desktopId: string, patch: Partial<DesktopView>): void {
    mutateDesktop(desktopId, (d) => ({ ...d, view: { ...(d.view ?? {}), ...patch } }));
}

// ── Acciones: iconos ─────────────────────────────────────────────
export interface NewIconInput {
    kind: DesktopIconKind;
    name: string;
    refId?: string;
    url?: string;
    iconUrl?: string;
    accent?: string;
    fileKind?: string;
    thumbUrl?: string;
    text?: string;
    size?: DesktopIconSize;
    viewMode?: DesktopIconViewMode;
    x?: number;
    y?: number;
}

/** Construye un DesktopIcon a partir de un input (posición ya resuelta). */
function buildIcon(input: NewIconInput, id: string, spot: { x: number; y: number }): DesktopIcon {
    return {
        id,
        kind: input.kind,
        refId: input.refId,
        url: input.url,
        name: input.name,
        iconUrl: input.iconUrl,
        accent: input.accent,
        fileKind: input.fileKind,
        thumbUrl: input.thumbUrl,
        text: input.text,
        createdAt: Date.now(),
        x: spot.x,
        y: spot.y,
        size: input.size ?? "md",
        viewMode: input.viewMode ?? "icon",
        ...(input.kind === "folder" ? { children: [] } : {}),
    };
}

/**
 * Añade un icono al escritorio (o DENTRO de un folder, en cualquier nivel).
 * Desde v1.1 se admiten folders dentro de folders (ramificación). Devuelve su id.
 */
export function addIcon(desktopId: string, input: NewIconInput, folderId?: string): string {
    const id = newId("icon");
    mutateDesktop(desktopId, (d) => {
        const spot = input.x !== undefined && input.y !== undefined
            ? { x: input.x, y: input.y }
            : findFreeSpot(d);
        const icon = buildIcon(input, id, spot);
        if (folderId && findIconInTree(d.icons, folderId)?.kind === "folder") {
            return { ...d, icons: insertIntoFolder(d.icons, folderId, icon) };
        }
        return { ...d, icons: [...d.icons, icon] };
    });
    return id;
}

export function updateIcon(desktopId: string, iconId: string, patch: Partial<DesktopIcon>): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        icons: mapIconTree(d.icons, (i) =>
            i.id === iconId ? { ...i, ...patch, id: i.id, kind: i.kind } : i,
        ),
    }));
}

/** Fija (mezcla) la apariencia personalizada de un widget (icono con preview). */
export function setWidgetAppearance(desktopId: string, iconId: string, patch: Partial<DesktopWidgetAppearance>): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        icons: mapIconTree(d.icons, (i) =>
            i.id === iconId ? { ...i, appearance: { ...(i.appearance ?? {}), ...patch } } : i,
        ),
    }));
}

/** Restablece la apariencia de un widget al cristal por defecto del sistema. */
export function resetWidgetAppearance(desktopId: string, iconId: string): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        icons: mapIconTree(d.icons, (i) => (i.id === iconId ? { ...i, appearance: undefined } : i)),
    }));
}

/** Fija la huella en celdas (1x1..4x4) de un widget con vista previa viva. */
export function setWidgetSpan(desktopId: string, iconId: string, span: DesktopWidgetSpan): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        icons: mapIconTree(d.icons, (i) => (i.id === iconId ? { ...i, widgetSpan: span } : i)),
    }));
}

export function moveIcon(desktopId: string, iconId: string, x: number, y: number): void {
    updateIcon(desktopId, iconId, {
        x: Math.min(0.98, Math.max(0, x)),
        y: Math.min(0.98, Math.max(0, y)),
    });
}

export function removeIcon(desktopId: string, iconId: string): void {
    mutateDesktop(desktopId, (d) => {
        // Recolecta ids de la subrama borrada (para cerrar ventanas de folder huérfanas).
        const target = findIconInTree(d.icons, iconId);
        const orphanIds = new Set<string>([iconId]);
        const collect = (node: DesktopIcon) => {
            if (node.kind === "folder" && node.children) {
                node.children.forEach((c) => { orphanIds.add(c.id); collect(c); });
            }
        };
        if (target) collect(target);
        return {
            ...d,
            icons: removeFromTree(d.icons, iconId),
            windows: d.windows.filter(
                (w) => !(w.contentRef.type === "folder" && orphanIds.has(w.contentRef.ref)),
            ),
        };
    });
}

/**
 * Mueve un icono existente DENTRO de un folder (o al raíz si folderId es null).
 * Evita ciclos (no permite meter un folder dentro de sí mismo o de su
 * descendencia). Retrocompatible y aditivo.
 */
export function moveIconToFolder(desktopId: string, iconId: string, folderId: string | null): void {
    mutateDesktop(desktopId, (d) => {
        if (folderId === iconId) return d;
        const node = findIconInTree(d.icons, iconId);
        if (!node) return d;
        // Destino folder explícito pero inválido (no es folder) → no-op.
        if (folderId !== null && findIconInTree(d.icons, folderId)?.kind !== "folder") return d;
        // No mover un folder a su propia descendencia.
        if (node.kind === "folder" && folderId && isDescendant(d.icons, iconId, folderId)) return d;
        const stripped = removeFromTree(d.icons, iconId);
        if (folderId) {
            return { ...d, icons: insertIntoFolder(stripped, folderId, node) };
        }
        // Al raíz (folderId === null): recolócalo en un hueco libre.
        const spot = findFreeSpot({ ...d, icons: stripped });
        return { ...d, icons: [...stripped, { ...node, x: spot.x, y: spot.y }] };
    });
}

/** Duplica un icono (misma referencia; nueva identidad y posición). */
export function duplicateIcon(desktopId: string, iconId: string): string | null {
    const src = findIconInTree(readDesktopsSnapshot().desktops.find((d) => d.id === desktopId)?.icons ?? [], iconId);
    if (!src) return null;
    const newIconId = newId("icon");
    const cloneTree = (node: DesktopIcon): DesktopIcon => ({
        ...node,
        id: node.id === src.id ? newIconId : newId("icon"),
        createdAt: Date.now(),
        children: node.children?.map(cloneTree),
    });
    mutateDesktop(desktopId, (d) => {
        const spot = findFreeSpot(d);
        const clone = { ...cloneTree(src), x: spot.x, y: spot.y, name: `${src.name} (copia)` };
        return { ...d, icons: [...d.icons, clone] };
    });
    return newIconId;
}

// ── Organización de iconos (opciones tipo computadora) ───────────
/** Peso de tipo para ordenar (folders primero, luego apps, widgets…). */
function kindRank(k: DesktopIconKind): number {
    switch (k) {
        case "folder": return 0;
        case "app": return 1;
        case "widget": return 2;
        case "link": return 3;
        case "file": return 4;
        default: return 5;
    }
}

function iconComparator(mode: DesktopSortMode): (a: DesktopIcon, b: DesktopIcon) => number {
    if (mode === "name") return (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    if (mode === "type") return (a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name, "es");
    if (mode === "date") return (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.name.localeCompare(b.name, "es");
    // manual: conserva el orden espacial (arriba-izquierda → abajo-derecha)
    return (a, b) => a.y - b.y || a.x - b.x;
}

/** Recoloca los iconos raíz en la rejilla virtual siguiendo el orden dado. */
function layoutInGrid(icons: DesktopIcon[]): DesktopIcon[] {
    return icons.map((icon, n) => {
        const c = n % GRID.cols;
        const r = Math.floor(n / GRID.cols);
        return { ...icon, x: GRID.x0 + c * GRID.dx, y: GRID.y0 + r * GRID.dy };
    });
}

/**
 * Ordena los iconos raíz por el criterio dado y los recoloca en rejilla.
 * Guarda el criterio en la vista del escritorio (persistente).
 */
export function sortIcons(desktopId: string, mode: DesktopSortMode): void {
    mutateDesktop(desktopId, (d) => {
        const sorted = [...d.icons].sort(iconComparator(mode));
        return {
            ...d,
            icons: layoutInGrid(sorted),
            view: { ...(d.view ?? {}), sortMode: mode },
        };
    });
}

/** Auto-organiza los iconos raíz en rejilla conservando su orden espacial. */
export function autoArrangeIcons(desktopId: string): void {
    mutateDesktop(desktopId, (d) => {
        const ordered = [...d.icons].sort((a, b) => a.y - b.y || a.x - b.x);
        return { ...d, icons: layoutInGrid(ordered) };
    });
}

/** Crea una nota rápida como icono-archivo con texto embebido. */
export function createNoteIcon(desktopId: string, name = "Nota", text = "", folderId?: string): string {
    return addIcon(
        desktopId,
        { kind: "file", name, fileKind: "note", text, accent: "#FBBF24", viewMode: "icon" },
        folderId,
    );
}

// ── Acciones: ventanas ───────────────────────────────────────────
function nextZ(d: Desktop): number {
    return d.windows.reduce((m, w) => Math.max(m, w.z), 0) + 1;
}

/** Renormaliza z cuando crece demasiado (evita números infinitos). */
function rebaseZ(windows: DesktopWindow[]): DesktopWindow[] {
    const sorted = [...windows].sort((a, b) => a.z - b.z);
    return windows.map((w) => ({ ...w, z: sorted.indexOf(w) + 1 }));
}

export interface OpenWindowOptions {
    w?: number;
    h?: number;
    /** Si true, NO reutiliza una ventana existente con el mismo contenido. */
    allowDuplicate?: boolean;
}

/** Abre una ventana (o enfoca la existente con el mismo contenido). Devuelve su id. */
export function openWindow(
    desktopId: string,
    contentRef: DesktopWindowContentRef,
    opts?: OpenWindowOptions,
): string {
    let resultId = newId("win");
    mutateDesktop(desktopId, (d) => {
        const dedupe = !opts?.allowDuplicate && contentRef.type !== "browser";
        const existing = dedupe
            ? d.windows.find((w) => w.contentRef.type === contentRef.type && w.contentRef.ref === contentRef.ref)
            : undefined;
        if (existing) {
            resultId = existing.id;
            const z = nextZ(d);
            return {
                ...d,
                windows: d.windows.map((w) =>
                    w.id === existing.id ? { ...w, minimized: false, z } : w,
                ),
            };
        }
        const vw = isClient() ? window.innerWidth : 1280;
        const vh = isClient() ? window.innerHeight : 800;
        const w = Math.min(opts?.w ?? 760, Math.max(300, vw - 48));
        const h = Math.min(opts?.h ?? 520, Math.max(220, vh - 150));
        const idx = d.windows.length;
        const win: DesktopWindow = {
            id: resultId,
            contentRef,
            x: Math.max(8, Math.min(48 + (idx % 6) * 36, vw - w - 16)),
            y: Math.max(4, Math.min(20 + (idx % 6) * 30, vh - h - 120)),
            w,
            h,
            z: nextZ(d),
            minimized: false,
            maximized: false,
        };
        return { ...d, windows: [...d.windows, win] };
    });
    return resultId;
}

export function closeWindow(desktopId: string, winId: string): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        windows: d.windows.filter((w) => w.id !== winId),
    }));
}

export function focusWindow(desktopId: string, winId: string): void {
    mutateDesktop(desktopId, (d) => {
        const target = d.windows.find((w) => w.id === winId);
        if (!target) return d;
        const top = d.windows.reduce((m, w) => Math.max(m, w.z), 0);
        if (target.z === top && !target.minimized) return d;
        let windows = d.windows.map((w) => (w.id === winId ? { ...w, z: top + 1 } : w));
        if (top + 1 > 500) windows = rebaseZ(windows);
        return { ...d, windows };
    });
}

export function setWindowMinimized(desktopId: string, winId: string, minimized: boolean): void {
    mutateDesktop(desktopId, (d) => {
        const z = minimized ? 0 : nextZ(d);
        return {
            ...d,
            windows: d.windows.map((w) =>
                w.id === winId ? { ...w, minimized, ...(minimized ? {} : { z }) } : w,
            ),
        };
    });
}

export function toggleWindowMaximized(desktopId: string, winId: string): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        windows: d.windows.map((w) => {
            if (w.id !== winId) return w;
            if (w.maximized) {
                const prev = w.prev;
                return {
                    ...w,
                    maximized: false,
                    prev: undefined,
                    ...(prev ? { x: prev.x, y: prev.y, w: prev.w, h: prev.h } : {}),
                };
            }
            return {
                ...w,
                maximized: true,
                prev: { x: w.x, y: w.y, w: w.w, h: w.h },
            };
        }),
    }));
}

export function setWindowRect(desktopId: string, winId: string, rect: Partial<DesktopWindowRect>): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        windows: d.windows.map((w) =>
            w.id === winId
                ? {
                    ...w,
                    ...(rect.x !== undefined ? { x: rect.x } : {}),
                    ...(rect.y !== undefined ? { y: rect.y } : {}),
                    ...(rect.w !== undefined ? { w: Math.max(280, rect.w) } : {}),
                    ...(rect.h !== undefined ? { h: Math.max(200, rect.h) } : {}),
                }
                : w,
        ),
    }));
}

// ── Suscripción + hooks ──────────────────────────────────────────
function subscribe(callback: () => void): () => void {
    if (!isClient()) return () => { };
    const onChange = () => callback();
    const onStorage = (e: StorageEvent) => {
        if (e.key === LS_KEY || e.key === null) callback();
    };
    window.addEventListener(DESKTOPS_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(DESKTOPS_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

const getServerSnapshot = (): DesktopsState => EMPTY_STATE;

/** Estado completo de los escritorios (SSR-safe). */
export function useDesktopsState(): DesktopsState {
    return useSyncExternalStore(subscribe, readDesktopsSnapshot, getServerSnapshot);
}

/** Escritorio activo (o null durante SSR/arranque). */
export function useActiveDesktop(): Desktop | null {
    const s = useDesktopsState();
    return s.desktops.find((d) => d.id === s.activeId) ?? s.desktops[0] ?? null;
}

// ════════════════════════════════════════════════════════════════
// Espejo soberano en la cuenta — imita src/lib/dashboards-sync.ts
// (prefs.desktops · merge no destructivo · restaura SOLO si vacío)
// ════════════════════════════════════════════════════════════════

interface DesktopsBackup {
    desktops: unknown;
    activeId?: unknown;
    snap?: unknown;
    savedAt: number;
}

function hasLocalDesktops(): boolean {
    return readDesktopsSnapshot().desktops.length > 0;
}

function collectLocalBackup(): DesktopsBackup | null {
    const s = readDesktopsSnapshot();
    if (s.desktops.length === 0) return null;
    return { desktops: s.desktops, activeId: s.activeId, snap: s.snap, savedAt: Date.now() };
}

function isBackup(x: unknown): x is DesktopsBackup {
    return (
        typeof x === "object" && x !== null &&
        "desktops" in x && Array.isArray((x as DesktopsBackup).desktops)
    );
}

function restoreBackupToLocal(backup: DesktopsBackup): void {
    if (!isClient()) return;
    const normalized = normalizeState({
        desktops: backup.desktops,
        activeId: backup.activeId,
        snap: backup.snap,
        savedAt: backup.savedAt,
    });
    if (!normalized || normalized.desktops.length === 0) return;
    write(normalized);
    try {
        window.dispatchEvent(new Event(DESKTOPS_RESTORED_EVENT));
    } catch { /* noop */ }
}

async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

async function fetchRemoteBackup(userId: string): Promise<DesktopsBackup | null> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("user_settings")
            .select("prefs")
            .eq("user_id", userId)
            .maybeSingle();
        if (error || !data?.prefs || typeof data.prefs !== "object") return null;
        const prefs = data.prefs as Record<string, unknown>;
        return isBackup(prefs.desktops) ? (prefs.desktops as DesktopsBackup) : null;
    } catch {
        return null;
    }
}

async function pushBackup(userId: string): Promise<void> {
    try {
        const backup = collectLocalBackup();
        if (!backup) return;
        const supabase = createClient();

        // Lee prefs actual para NO pisar otras claves (dashboards, library…).
        let prefs: Record<string, unknown> = {};
        try {
            const { data } = await supabase
                .from("user_settings")
                .select("prefs")
                .eq("user_id", userId)
                .maybeSingle();
            if (data?.prefs && typeof data.prefs === "object") {
                prefs = { ...(data.prefs as Record<string, unknown>) };
            }
        } catch { /* mezclamos sobre objeto vacío si no se pudo leer */ }

        prefs.desktops = backup;

        await supabase
            .from("user_settings")
            .upsert(
                { user_id: userId, prefs, updated_at: new Date().toISOString() },
                { onConflict: "user_id" },
            );
    } catch {
        /* best-effort: nunca rompemos el escritorio por la nube */
    }
}

/**
 * useDesktopsBackup — móntalo UNA vez en la página /escritorios.
 *  - Con sesión y SIN escritorios locales pero CON respaldo → restaura
 *    (sin reload: el store emite y la UI se refresca sola).
 *  - Con escritorios locales → respaldo con debounce ante cambios,
 *    intervalo suave y cambios de sesión. Defensivo y SSR-safe.
 */
export function useDesktopsBackup(): void {
    useEffect(() => {
        if (!isClient()) return;

        let active = true;
        let pushTimer: ReturnType<typeof setTimeout> | null = null;
        let supabase: ReturnType<typeof createClient> | null = null;
        try {
            supabase = createClient();
        } catch {
            supabase = null;
        }

        const schedulePush = () => {
            if (pushTimer) clearTimeout(pushTimer);
            pushTimer = setTimeout(() => {
                void (async () => {
                    const userId = await getUserId();
                    if (!active || !userId) return;
                    if (!hasLocalDesktops()) return;
                    await pushBackup(userId);
                })();
            }, PUSH_DEBOUNCE_MS);
        };

        const bootstrap = async (userId: string) => {
            if (!active) return;
            if (!hasLocalDesktops()) {
                const remote = await fetchRemoteBackup(userId);
                if (active && remote) {
                    restoreBackupToLocal(remote);
                    return;
                }
            }
            if (active && hasLocalDesktops()) await pushBackup(userId);
        };

        void (async () => {
            const userId = await getUserId();
            if (!active || !userId) return;
            await bootstrap(userId);
        })();

        // Cambios locales (mismo tab) + otras pestañas → respaldo debounced.
        const onLocalChange = () => schedulePush();
        const onStorage = (e: StorageEvent) => {
            if (e.key === LS_KEY || e.key === null) schedulePush();
        };
        window.addEventListener(DESKTOPS_EVENT, onLocalChange);
        window.addEventListener("storage", onStorage);

        const poll = setInterval(() => schedulePush(), POLL_INTERVAL_MS);

        const sub = supabase
            ? supabase.auth.onAuthStateChange((_event, session) => {
                void (async () => {
                    if (!active) return;
                    const userId = session?.user?.id ?? null;
                    if (userId) await bootstrap(userId);
                })();
            })
            : null;

        return () => {
            active = false;
            if (pushTimer) clearTimeout(pushTimer);
            clearInterval(poll);
            window.removeEventListener(DESKTOPS_EVENT, onLocalChange);
            window.removeEventListener("storage", onStorage);
            try {
                sub?.data.subscription.unsubscribe();
            } catch { /* noop */ }
        };
    }, []);
}
