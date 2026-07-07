// ════════════════════════════════════════════════════════════════════════════
// finder-types — tipos y helpers compartidos del Finder de Bibliotecas
// ----------------------------------------------------------------------------
// Puro (sin JSX, sin "use client" necesario salvo por el hook de clipboard que
// toca window/localStorage). Consumido por finder-view.tsx y sus subcomponentes.
// SOP: architecture/libreria-biblioteca-sync.md (§6)
// ════════════════════════════════════════════════════════════════════════════

import type { EntityLibraryDoc, LibraryFolder, SavedItem, ItemACL } from "@/lib/library/entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";

/** Modo de visualización del Finder. */
export type FinderViewMode = "iconos" | "lista" | "columnas";

/** Criterio de ordenación de ítems/carpetas. */
export type FinderSort = "nombre" | "fecha" | "tipo";

export const FINDER_VIEW_KEY = "starseed.entitylib.view.v1";
export const FINDER_SORT_KEY = "starseed.entitylib.sort.v1";

// ─────────────────────────── Árbol de carpetas ───────────────────────────

export interface FolderNode {
    folder: LibraryFolder;
    children: FolderNode[];
    depth: number;
}

/** Construye el árbol de carpetas anidadas (parentId) a partir de la lista plana. */
export function buildFolderTree(folders: LibraryFolder[]): FolderNode[] {
    const byParent = new Map<string | null, LibraryFolder[]>();
    for (const f of folders) {
        const key = f.parentId ?? null;
        const arr = byParent.get(key) ?? [];
        arr.push(f);
        byParent.set(key, arr);
    }
    function build(parentId: string | null, depth: number): FolderNode[] {
        const kids = (byParent.get(parentId) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "es"));
        return kids.map((folder) => ({ folder, children: build(folder.id, depth + 1), depth }));
    }
    return build(null, 0);
}

/** Todos los descendientes (ids) de una carpeta, incluyéndose a sí misma. */
export function folderSubtreeIds(folders: LibraryFolder[], rootId: string): Set<string> {
    const ids = new Set<string>([rootId]);
    let frontier = [rootId];
    while (frontier.length) {
        const next: string[] = [];
        for (const f of folders) {
            if (f.parentId && frontier.includes(f.parentId) && !ids.has(f.id)) {
                ids.add(f.id);
                next.push(f.id);
            }
        }
        frontier = next;
    }
    return ids;
}

/** Ruta (breadcrumb) de nombres desde la raíz hasta la carpeta dada, inclusive. */
export function folderPath(folders: LibraryFolder[], folderId: string | null): LibraryFolder[] {
    const byId = new Map(folders.map((f) => [f.id, f] as const));
    const path: LibraryFolder[] = [];
    let cursor = folderId;
    const seen = new Set<string>();
    while (cursor) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const f = byId.get(cursor);
        if (!f) break;
        path.unshift(f);
        cursor = f.parentId;
    }
    return path;
}

// ─────────────────────────── Permisos (ACL) ───────────────────────────

/** Contexto de quién mira: el propio dueño ve/edita todo; el resto respeta ACL. */
export interface AclViewerContext {
    /** true si el usuario actual es el dueño/gestor de esta biblioteca (bypass total). */
    isOwner: boolean;
    /** uid del usuario actual (o null sin sesión). */
    userId: string | null;
    /** slugs de grupo a los que pertenece el usuario actual (para ACL de tipo "group"). */
    groupSlugs: string[];
}

function aclAllows(acl: ItemACL | undefined, list: "read" | "write", ctx: AclViewerContext): boolean {
    if (ctx.isOwner) return true;
    const entries = acl?.[list] ?? [];
    if (entries.length === 0) {
        // Sin restricción explícita en esa lista: "read" vacío = visible para todos con
        // acceso a la biblioteca; "write" vacío = editable por todos con acceso (v1 compat).
        return true;
    }
    if (!ctx.userId) return false;
    return entries.some(
        (e) => (e.kind === "user" && e.id === ctx.userId) || (e.kind === "group" && ctx.groupSlugs.includes(e.id)),
    );
}

/** ¿Puede este visitante LEER (ver) el ítem/carpeta? */
export function canRead(acl: ItemACL | undefined, ctx: AclViewerContext): boolean {
    return aclAllows(acl, "read", ctx);
}

/** ¿Puede este visitante EDITAR (mover/etiquetar/borrar/permisos) el ítem/carpeta? */
export function canWrite(acl: ItemACL | undefined, ctx: AclViewerContext): boolean {
    return aclAllows(acl, "write", ctx);
}

/** Filtra items/carpetas visibles para el contexto dado (oculta los de lectura restringida). */
export function visibleFor(doc: EntityLibraryDoc, ctx: AclViewerContext): EntityLibraryDoc {
    if (ctx.isOwner) return doc;
    return {
        ...doc,
        items: doc.items.filter((it) => canRead(it.acl, ctx)),
        folders: doc.folders.filter((f) => canRead(f.acl, ctx)),
    };
}

// ─────────────────────────── Portapapeles interno ───────────────────────────

export type ClipboardMode = "copiar" | "cortar";

export interface ClipboardEntry {
    ref: EntityRef;
    itemIds: string[];
    mode: ClipboardMode;
    at: string;
}

const CLIPBOARD_KEY = "starseed.clipboard.v1";

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Lee el portapapeles interno de StarSeed (compartido entre toda la sesión del navegador). */
export function readClipboard(): ClipboardEntry | null {
    if (!isClient()) return null;
    try {
        const raw = localStorage.getItem(CLIPBOARD_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as ClipboardEntry;
    } catch {
        return null;
    }
}

/** Escribe el portapapeles interno (copiar referencias de ítems para pegar en otra carpeta/biblioteca). */
export function writeClipboard(entry: ClipboardEntry): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(entry));
        window.dispatchEvent(new Event("starseed:clipboard"));
    } catch {
        /* cuota / modo privado: no-op, la acción de pegar simplemente no tendrá nada */
    }
}

export function clearClipboard(): void {
    if (!isClient()) return;
    try {
        localStorage.removeItem(CLIPBOARD_KEY);
        window.dispatchEvent(new Event("starseed:clipboard"));
    } catch {
        /* noop */
    }
}

// ─────────────────────────── Ordenación ───────────────────────────

const TYPE_ORDER: Record<SavedItem["type"], number> = {
    branch: 0, alias: 1, package: 2, post: 3, file: 4, page: 5, route: 6, external: 7,
};

export function sortItems(items: SavedItem[], sort: FinderSort): SavedItem[] {
    const arr = items.slice();
    switch (sort) {
        case "fecha":
            return arr.sort((a, b) => Date.parse(b.addedAt || "") - Date.parse(a.addedAt || ""));
        case "tipo":
            return arr.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.title.localeCompare(b.title, "es"));
        case "nombre":
        default:
            return arr.sort((a, b) => a.title.localeCompare(b.title, "es"));
    }
}

export function sortFolders(folders: LibraryFolder[], sort: FinderSort): LibraryFolder[] {
    const arr = folders.slice();
    if (sort === "fecha") return arr.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
    return arr.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// ─────────────────────────── Enlace profundo de compartir ───────────────────────────

/** Enlace profundo de un ítem de biblioteca: /library?area=biblioteca&e=<kind>:<id>&item=<id> */
export function deepLinkFor(ref: EntityRef, itemId: string): string {
    if (typeof window === "undefined") {
        return `/library?area=biblioteca&e=${ref.kind}:${ref.id}&item=${itemId}`;
    }
    const url = new URL("/library", window.location.origin);
    url.searchParams.set("area", "biblioteca");
    url.searchParams.set("e", `${ref.kind}:${ref.id}`);
    url.searchParams.set("item", itemId);
    return url.toString();
}
