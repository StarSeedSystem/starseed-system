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
    /** Solo carpetas: contenido (un nivel, sin carpetas anidadas). */
    children?: DesktopIcon[];
}

export type DesktopWindowContentType = "app" | "file" | "widget" | "browser" | "folder";

export interface DesktopWindowContentRef {
    type: DesktopWindowContentType;
    /** app id · widget_type · url de archivo · url inicial · id de icono carpeta. */
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

export interface Desktop {
    id: string;
    name: string;
    wallpaper?: DesktopWallpaper;
    icons: DesktopIcon[];
    windows: DesktopWindow[];
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
function normalizeIcon(raw: unknown, allowChildren = true): DesktopIcon | null {
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
    };
    if (allowChildren && kind === "folder" && Array.isArray(r.children)) {
        icon.children = r.children
            .map((c) => normalizeIcon(c, false))
            .filter((c): c is DesktopIcon => c !== null && c.kind !== "folder");
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

// ── Acciones: iconos ─────────────────────────────────────────────
export interface NewIconInput {
    kind: DesktopIconKind;
    name: string;
    refId?: string;
    url?: string;
    iconUrl?: string;
    accent?: string;
    fileKind?: string;
    size?: DesktopIconSize;
    viewMode?: DesktopIconViewMode;
    x?: number;
    y?: number;
}

/** Añade un icono al escritorio (o dentro de una carpeta). Devuelve su id. */
export function addIcon(desktopId: string, input: NewIconInput, folderId?: string): string {
    const id = newId("icon");
    mutateDesktop(desktopId, (d) => {
        const spot = input.x !== undefined && input.y !== undefined
            ? { x: input.x, y: input.y }
            : findFreeSpot(d);
        const icon: DesktopIcon = {
            id,
            kind: input.kind,
            refId: input.refId,
            url: input.url,
            name: input.name,
            iconUrl: input.iconUrl,
            accent: input.accent,
            fileKind: input.fileKind,
            x: spot.x,
            y: spot.y,
            size: input.size ?? "md",
            viewMode: input.viewMode ?? "icon",
            ...(input.kind === "folder" ? { children: [] } : {}),
        };
        if (folderId && input.kind !== "folder") {
            // Dentro de una carpeta (un solo nivel; sin carpetas anidadas).
            return {
                ...d,
                icons: d.icons.map((i) =>
                    i.id === folderId && i.kind === "folder"
                        ? { ...i, children: [...(i.children ?? []), icon] }
                        : i,
                ),
            };
        }
        return { ...d, icons: [...d.icons, icon] };
    });
    return id;
}

export function updateIcon(desktopId: string, iconId: string, patch: Partial<DesktopIcon>): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        icons: d.icons.map((i) => {
            if (i.id === iconId) return { ...i, ...patch, id: i.id, kind: i.kind };
            if (i.kind === "folder" && i.children?.some((c) => c.id === iconId)) {
                return {
                    ...i,
                    children: i.children.map((c) =>
                        c.id === iconId ? { ...c, ...patch, id: c.id, kind: c.kind } : c,
                    ),
                };
            }
            return i;
        }),
    }));
}

export function moveIcon(desktopId: string, iconId: string, x: number, y: number): void {
    updateIcon(desktopId, iconId, {
        x: Math.min(0.98, Math.max(0, x)),
        y: Math.min(0.98, Math.max(0, y)),
    });
}

export function removeIcon(desktopId: string, iconId: string): void {
    mutateDesktop(desktopId, (d) => ({
        ...d,
        icons: d.icons
            .filter((i) => i.id !== iconId)
            .map((i) =>
                i.kind === "folder" && i.children
                    ? { ...i, children: i.children.filter((c) => c.id !== iconId) }
                    : i,
            ),
        // Si era una carpeta con ventana abierta, cerramos su ventana huérfana.
        windows: d.windows.filter((w) => !(w.contentRef.type === "folder" && w.contentRef.ref === iconId)),
    }));
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
