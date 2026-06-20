'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Library Store (persistencia local: guardar + instalar)
// ----------------------------------------------------------------
// Capa de PERSISTENCIA mínima y soberana sobre localStorage. Dos
// colecciones del usuario:
//   • starseed.library.saved   → recursos guardados en Biblioteca.
//   • starseed.apps.installed   → apps instaladas en el Launcher.
//
// Principios respetados:
//   • Identidad Soberana: los datos viven en el dispositivo del usuario.
//   • Singularidad del contenido: dedup por (url + título) para no
//     duplicar la misma Entidad Única al guardarla varias veces.
//
// SSR-SAFE: toda lectura/escritura de window/localStorage está
// guardada. Los hooks usan useSyncExternalStore con un
// getServerSnapshot que devuelve un array vacío estable (no rompe la
// hidratación). Tras cualquier mutación se emite el evento
// `starseed:library` y también se escucha `storage` para sincronizar
// instancias del mismo widget abiertas en varias pestañas.
// ════════════════════════════════════════════════════════════════

import { useCallback, useSyncExternalStore } from "react";

// ── Tipos ────────────────────────────────────────────────────────
export interface SavedResource {
    id: string;
    kind: string;
    title: string;
    url?: string;
    origin?: string;
    savedAt: number;
}

export interface InstalledApp {
    id: string;
    name: string;
    installedAt: number;
}

// ── Constantes ───────────────────────────────────────────────────
const SAVED_KEY = "starseed.library.saved";
const INSTALLED_KEY = "starseed.apps.installed";
const LIBRARY_EVENT = "starseed:library";

// Snapshot vacío ESTABLE (misma referencia) para SSR / primer arranque.
// useSyncExternalStore exige que getSnapshot devuelva una referencia
// estable cuando nada cambió, o React entra en bucle de renders.
const EMPTY_SAVED: SavedResource[] = [];
const EMPTY_INSTALLED: InstalledApp[] = [];

// Caché de snapshots por clave: se renueva SOLO cuando cambia el valor
// serializado en localStorage, garantizando estabilidad referencial.
const cache: {
    saved: { raw: string; value: SavedResource[] };
    installed: { raw: string; value: InstalledApp[] };
} = {
    saved: { raw: "", value: EMPTY_SAVED },
    installed: { raw: "", value: EMPTY_INSTALLED },
};

// ── Helpers de bajo nivel ────────────────────────────────────────
function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRaw(key: string): string {
    if (!isClient()) return "";
    try {
        return localStorage.getItem(key) ?? "";
    } catch {
        return "";
    }
}

function parseArray<T>(raw: string): T[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function readSavedSnapshot(): SavedResource[] {
    const raw = readRaw(SAVED_KEY);
    if (raw === cache.saved.raw) return cache.saved.value;
    cache.saved = { raw, value: raw ? parseArray<SavedResource>(raw) : EMPTY_SAVED };
    return cache.saved.value;
}

function readInstalledSnapshot(): InstalledApp[] {
    const raw = readRaw(INSTALLED_KEY);
    if (raw === cache.installed.raw) return cache.installed.value;
    cache.installed = { raw, value: raw ? parseArray<InstalledApp>(raw) : EMPTY_INSTALLED };
    return cache.installed.value;
}

function writeSaved(items: SavedResource[]): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(items));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    emitChange();
}

function writeInstalled(items: InstalledApp[]): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(INSTALLED_KEY, JSON.stringify(items));
    } catch {
        /* noop */
    }
    emitChange();
}

function emitChange(): void {
    if (!isClient()) return;
    try {
        window.dispatchEvent(new Event(LIBRARY_EVENT));
    } catch {
        /* noop */
    }
}

let _seq = 0;
function makeId(prefix: string): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch {
        /* noop */
    }
    return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

/** Clave de deduplicación: misma url+título => misma Entidad Única. */
function dedupKey(r: { url?: string; title: string }): string {
    return `${(r.url ?? "").trim().toLowerCase()}::${r.title.trim().toLowerCase()}`;
}

// ── API imperativa (utilizable desde fuera de React) ─────────────
export function getSaved(): SavedResource[] {
    return readSavedSnapshot();
}

export function getInstalled(): InstalledApp[] {
    return readInstalledSnapshot();
}

/**
 * Guarda un recurso en la Biblioteca. Deduplica por (url + título):
 * si ya existe, NO crea un duplicado (Singularidad del Contenido).
 */
export function saveResource(r: {
    id?: string;
    kind: string;
    title: string;
    url?: string;
    origin?: string;
}): void {
    const current = readSavedSnapshot();
    const key = dedupKey(r);
    if (current.some((x) => dedupKey(x) === key)) return; // ya guardado
    const entry: SavedResource = {
        id: r.id && r.id.trim() ? r.id : makeId("saved"),
        kind: r.kind,
        title: r.title,
        url: r.url,
        origin: r.origin,
        savedAt: Date.now(),
    };
    writeSaved([entry, ...current]);
}

/**
 * Instala una app en el Launcher. Deduplica por id (si ya está
 * instalada, refresca el nombre pero no duplica).
 */
export function installApp(a: { id: string; name: string }): void {
    const current = readInstalledSnapshot();
    const existing = current.find((x) => x.id === a.id);
    if (existing) {
        if (existing.name === a.name) return;
        writeInstalled(current.map((x) => (x.id === a.id ? { ...x, name: a.name } : x)));
        return;
    }
    const entry: InstalledApp = { id: a.id, name: a.name, installedAt: Date.now() };
    writeInstalled([entry, ...current]);
}

export function removeSaved(id: string): void {
    const current = readSavedSnapshot();
    const next = current.filter((x) => x.id !== id);
    if (next.length !== current.length) writeSaved(next);
}

export function uninstallApp(id: string): void {
    const current = readInstalledSnapshot();
    const next = current.filter((x) => x.id !== id);
    if (next.length !== current.length) writeInstalled(next);
}

// ── Suscripción al store (para useSyncExternalStore) ─────────────
function subscribe(callback: () => void): () => void {
    if (!isClient()) return () => {};
    const onChange = () => callback();
    const onStorage = (e: StorageEvent) => {
        if (e.key === SAVED_KEY || e.key === INSTALLED_KEY || e.key === null) callback();
    };
    window.addEventListener(LIBRARY_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(LIBRARY_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

// ── Hooks ────────────────────────────────────────────────────────
export interface UseSavedLibrary {
    items: SavedResource[];
    save: (r: { id?: string; kind: string; title: string; url?: string; origin?: string }) => void;
    remove: (id: string) => void;
}

export function useSavedLibrary(): UseSavedLibrary {
    const items = useSyncExternalStore(subscribe, readSavedSnapshot, () => EMPTY_SAVED);
    const save = useCallback<UseSavedLibrary["save"]>((r) => saveResource(r), []);
    const remove = useCallback((id: string) => removeSaved(id), []);
    return { items, save, remove };
}

export interface UseInstalledApps {
    apps: InstalledApp[];
    install: (a: { id: string; name: string }) => void;
    uninstall: (id: string) => void;
}

export function useInstalledApps(): UseInstalledApps {
    const apps = useSyncExternalStore(subscribe, readInstalledSnapshot, () => EMPTY_INSTALLED);
    const install = useCallback((a: { id: string; name: string }) => installApp(a), []);
    const uninstall = useCallback((id: string) => uninstallApp(id), []);
    return { apps, install, uninstall };
}
