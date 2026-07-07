"use client";

/*
 * public-catalog — Catálogo PÚBLICO de la Librería (Adenda 64, §7).
 * ----------------------------------------------------------------------------
 * Distinto de `entity-library.ts` (lo GUARDADO por una entidad, privado/grupal)
 * y de `packages.ts` (paquetes instalables built-in + repos por URL). Esta capa
 * es la sección "Comunidad": cualquier usuario puede PUBLICAR un archivo suyo
 * (de su Biblioteca) en una carpeta pública de una categoría, navegable por
 * todo el mundo, con lectura sin sesión.
 *
 * Tabla Supabase `public.library_public_items` (ya aplicada):
 *   id uuid PK · owner uuid · category text · folder text · name text ·
 *   kind text · payload jsonb · tags text[] · created_at · updated_at
 *   RLS: lectura pública, escritura solo del autor (`owner = auth.uid()`).
 *   Realtime ON.
 *
 * `payload` lleva la forma de previsualización (FileLike de file-preview.tsx)
 * más `ref: { entityKind, entityId, itemId }` — el ítem original de la
 * Biblioteca del autor, para que "Guardar en biblioteca" desde la Comunidad
 * cree una referencia enlazada, nunca una copia ciega.
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md (§7).
 * Tolerante sin sesión (lectura funciona siempre); escritura exige sesión.
 */

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState, useCallback } from "react";
import type { EntityKind as SyncEntityKind } from "@/lib/sync/entity-state";
import type { SavedItem, LibraryFolder } from "@/lib/library/entity-library";

const TABLE = "library_public_items";

/** Categoría del catálogo público. Espejo libre de PackageKind (packages.ts)
 *  más "otro" para lo que no encaje limpio en ningún tipo de paquete. */
export type PublicCategory =
    | "app" | "widget" | "page" | "publication" | "board" | "research"
    | "project" | "design" | "animation" | "function" | "ai-source" | "repo"
    | "agent" | "otro";

export const PUBLIC_CATEGORIES: PublicCategory[] = [
    "publication", "research", "design", "animation", "board", "project",
    "app", "widget", "page", "function", "ai-source", "agent", "repo", "otro",
];

/** Referencia al ítem original de la Biblioteca del autor (Entidad Única). */
export interface PublicItemBackRef {
    entityKind: SyncEntityKind;
    entityId: string;
    itemId: string;
}

export interface PublicPayload {
    /** Forma compatible con FileLike (file-preview.tsx) para vista previa embebida. */
    url?: string;
    route?: string;
    mime?: string;
    type?: string;
    thumbnail?: string;
    content?: string;
    language?: string;
    description?: string;
    /** Vínculo al original — el catálogo publica referencias, nunca copias ciegas. */
    ref?: PublicItemBackRef;
}

export interface PublicItem {
    id: string;
    owner: string;
    category: PublicCategory;
    /** Ruta de carpeta pública dentro de la categoría (p.ej. "diseño/temas"). "" = raíz. */
    folder: string;
    name: string;
    /** Tipo de contenido original (SavedItemType) para elegir icono/preview. */
    kind: string;
    payload: PublicPayload;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}

function isClient(): boolean {
    return typeof window !== "undefined";
}

function normalizeFolder(folder: string | null | undefined): string {
    return (folder ?? "").replace(/^\/+|\/+$/g, "").trim();
}

function rowToItem(row: Record<string, unknown>): PublicItem {
    return {
        id: String(row.id ?? ""),
        owner: String(row.owner ?? ""),
        category: (String(row.category ?? "otro") as PublicCategory) || "otro",
        folder: normalizeFolder(row.folder as string | null | undefined),
        name: String(row.name ?? "Sin nombre"),
        kind: String(row.kind ?? "file"),
        payload: (row.payload as PublicPayload) ?? {},
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
    };
}

/** Lista ítems públicos, opcionalmente filtrados por categoría y/o carpeta exacta. */
export async function listPublicItems(opts?: {
    category?: PublicCategory;
    folder?: string;
}): Promise<PublicItem[]> {
    try {
        const supabase = createClient();
        let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false });
        if (opts?.category) query = query.eq("category", opts.category);
        if (opts?.folder !== undefined) query = query.eq("folder", normalizeFolder(opts.folder));
        const { data, error } = await query;
        if (error || !data) return [];
        return (data as Record<string, unknown>[]).map(rowToItem);
    } catch {
        return [];
    }
}

/** Deriva la lista de subcarpetas únicas presentes en una categoría (para navegación). */
export function foldersOf(items: PublicItem[], category: PublicCategory): string[] {
    const set = new Set<string>();
    for (const it of items) {
        if (it.category !== category) continue;
        if (it.folder) set.add(it.folder);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

export interface PublishItemInput {
    category: PublicCategory;
    folder?: string;
    name: string;
    kind: string;
    payload: PublicPayload;
    tags?: string[];
}

/** Publica UN ítem en el catálogo público. Exige sesión (RLS: owner = auth.uid()). */
export async function publishItem(input: PublishItemInput): Promise<{ ok: boolean; id?: string; error?: string }> {
    try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return { ok: false, error: "Inicia sesión para publicar en la Librería." };

        const { data, error } = await supabase
            .from(TABLE)
            .insert({
                owner: uid,
                category: input.category,
                folder: normalizeFolder(input.folder),
                name: input.name,
                kind: input.kind,
                payload: input.payload as object,
                tags: input.tags ?? [],
            })
            .select("id")
            .single();
        if (error || !data) return { ok: false, error: error?.message ?? "No se pudo publicar." };
        return { ok: true, id: String((data as { id: string }).id) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Error al publicar." };
    }
}

/**
 * Publica una CARPETA completa de una Biblioteca (todos sus ítems directos,
 * más — si `recursive` — los de sus subcarpetas) conservando la estructura
 * carpeta→folder path bajo la categoría elegida. Los originales quedan
 * vinculados (`payload.ref`). No publica alias (no tienen contenido propio;
 * se resuelve su destino y se publica el ítem apuntado) ni ítems con `acl`
 * de lectura que excluya al publicador (defensivo, aunque siendo el propio
 * dueño rara vez aplica).
 */
export async function publishFolder(opts: {
    entityRef: { kind: SyncEntityKind; id: string };
    items: SavedItem[];
    folders: LibraryFolder[];
    sourceFolderId: string | null;
    category: PublicCategory;
    /** Carpeta pública destino (raíz de la categoría si se omite). */
    destFolder?: string;
    recursive?: boolean;
}): Promise<{ ok: boolean; count: number; error?: string }> {
    try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return { ok: false, count: 0, error: "Inicia sesión para publicar en la Librería." };

        const folderById = new Map(opts.folders.map((f) => [f.id, f] as const));

        // Recolecta el subárbol de carpetas a exportar (la propia + descendientes si recursive).
        const targetFolderIds = new Set<string>();
        if (opts.sourceFolderId) targetFolderIds.add(opts.sourceFolderId);
        if (opts.recursive && opts.sourceFolderId) {
            let frontier = [opts.sourceFolderId];
            while (frontier.length) {
                const next: string[] = [];
                for (const f of opts.folders) {
                    if (f.parentId && frontier.includes(f.parentId) && !targetFolderIds.has(f.id)) {
                        targetFolderIds.add(f.id);
                        next.push(f.id);
                    }
                }
                frontier = next;
            }
        }

        /** Ruta pública relativa (nombres de carpeta unidos por "/") de una carpeta local. */
        function pathOf(folderId: string | null): string {
            const parts: string[] = [];
            let cursor = folderId;
            const seen = new Set<string>();
            while (cursor) {
                if (seen.has(cursor)) break;
                seen.add(cursor);
                const f = folderById.get(cursor);
                if (!f) break;
                parts.unshift(f.name);
                cursor = f.parentId;
            }
            return parts.join("/");
        }

        const rootPath = pathOf(opts.sourceFolderId);
        const destBase = normalizeFolder(opts.destFolder);

        const candidateItems = opts.items.filter((it) => {
            if (it.type === "alias") return false; // los alias no tienen contenido propio
            const scope = opts.sourceFolderId === null ? it.folderId === null : targetFolderIds.has(it.folderId ?? "__none__");
            return scope;
        });

        if (candidateItems.length === 0) return { ok: true, count: 0 };

        const rows = candidateItems.map((it) => {
            const itemPath = it.folderId ? pathOf(it.folderId) : "";
            // Ruta relativa a la carpeta origen (quita el prefijo rootPath si aplica).
            const relative = rootPath && itemPath.startsWith(rootPath) ? itemPath.slice(rootPath.length).replace(/^\//, "") : itemPath;
            const folder = [destBase, relative].filter(Boolean).join("/");
            const payload: PublicPayload = {
                url: it.url,
                route: it.route,
                mime: it.mime,
                type: it.type,
                thumbnail: it.thumbnail,
                content: it.content,
                language: it.language,
                description: it.description,
                ref: { entityKind: opts.entityRef.kind, entityId: opts.entityRef.id, itemId: it.id },
            };
            return {
                owner: uid,
                category: opts.category,
                folder: normalizeFolder(folder),
                name: it.title,
                kind: it.type,
                payload: payload as object,
                tags: it.tags ?? [],
            };
        });

        const { error } = await supabase.from(TABLE).insert(rows);
        if (error) return { ok: false, count: 0, error: error.message };
        return { ok: true, count: rows.length };
    } catch (e) {
        return { ok: false, count: 0, error: e instanceof Error ? e.message : "Error al publicar la carpeta." };
    }
}

/** Retira (borra) una publicación propia. RLS ya impide borrar la de otros; validamos igual en cliente. */
export async function removePublicItem(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const supabase = createClient();
        const { error } = await supabase.from(TABLE).delete().eq("id", id);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Error al quitar." };
    }
}

/** Hook reactivo con realtime: lista + se refresca al vuelo con altas/bajas. */
export function usePublicCatalog(opts?: { category?: PublicCategory; folder?: string }): {
    items: PublicItem[];
    loading: boolean;
    reload: () => void;
} {
    const [items, setItems] = useState<PublicItem[]>([]);
    const [loading, setLoading] = useState(true);
    const category = opts?.category;
    const folder = opts?.folder;

    const reload = useCallback(() => {
        setLoading(true);
        listPublicItems({ category, folder }).then((list) => {
            setItems(list);
            setLoading(false);
        });
    }, [category, folder]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        listPublicItems({ category, folder }).then((list) => {
            if (alive) {
                setItems(list);
                setLoading(false);
            }
        });

        if (!isClient()) return () => { alive = false; };
        try {
            const supabase = createClient();
            const channel = supabase
                .channel(`public-catalog:${category ?? "all"}:${folder ?? "all"}`)
                .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
                    const row = payload.new ?? payload.old;
                    if (!row) return;
                    if (category && row.category !== category) return;
                    if (folder !== undefined && normalizeFolder(row.folder as string) !== normalizeFolder(folder)) return;
                    if (alive) reload();
                })
                .subscribe();
            return () => {
                alive = false;
                try {
                    supabase.removeChannel(channel);
                } catch {
                    /* noop */
                }
            };
        } catch {
            return () => {
                alive = false;
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- category/folder ya están en las deps explícitas de arriba
    }, [category, folder, reload]);

    return { items, loading, reload };
}
