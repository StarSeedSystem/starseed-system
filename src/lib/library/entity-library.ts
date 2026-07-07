"use client";

/*
 * entity-library — Biblioteca por ENTIDAD (usuario, perfil, página, grupo,
 * comunidad, evento, E.F., partido…): lo que esa entidad HA GUARDADO.
 * Distinta de la Librería (catálogo en línea, src/lib/library/packages.ts).
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md (§3, §6).
 * Modelo: referencias (Entidad Única), nunca copias. Carpetas propias por
 * biblioteca, espejo estructural de la Librería (carpetas/categorías).
 *
 * Persistencia:
 *   · Cache local  `starseed.entitylib.<kind>.<id>.v1`   (fuente de verdad offline)
 *   · Nube         entity_state(key="library")            (LWW por rev)
 *   · Realtime     subscribeEntityState → actualiza cache + emite evento
 *
 * Local-first y tolerante sin sesión: toda escritura funciona en local aunque
 * la sincronización a Supabase falle o no haya `ref` de nube disponible.
 *
 * ── MODELO v2 (Adenda 64, §6) ──────────────────────────────────────────────
 * · Carpetas ANIDADAS (ya lo estaban desde v1: `parentId`); ahora expuesto
 *   con helper `moveFolder` para re-anidar sin duplicar lógica.
 * · Tipos de item nuevos: `alias` (acceso directo → apunta a otro item por
 *   `targetItemId`) y `branch` (ramificación VINCULADA: refleja el original
 *   vía `refKind`/`refId` — Entidad Única real; `duplicateItem` en cambio
 *   crea una copia independiente normal, sin vínculo).
 * · `acl` por ítem: `{ read: ACLEntry[], write: ACLEntry[] }`. Ausente o
 *   ambas listas vacías = visible/editable por todo el que ya puede ver la
 *   biblioteca (comportamiento v1, sin cambios). La UI oculta a no-dueños
 *   los ítems con `read` no vacío que no los incluya, y deshabilita edición
 *   sin `write`.
 * · Migración v1→v2 NORMALIZADORA: los documentos guardados hoy (sin
 *   `tags`/`acl` en folders, sin `version` de doc) se completan con valores
 *   por defecto al leer, de forma perezosa e idempotente. No hace falta
 *   ninguna migración de Supabase: mismo `jsonb`, solo más claves opcionales.
 */

import {
    currentUserRef,
    getEntityState,
    setEntityState,
    subscribeEntityState,
    type EntityKind as SyncEntityKind,
    type EntityRef,
} from "@/lib/sync/entity-state";
import { createClient } from "@/utils/supabase/client";
import { useCallback, useEffect, useState } from "react";

// ─────────────────────────── Tipos ───────────────────────────

/** Tipo de referencia guardada (qué es lo que se apunta). */
export type SavedItemType =
    | "package"
    | "post"
    | "file"
    | "page"
    | "route"
    | "external"
    /** Acceso directo: no tiene contenido propio, apunta a `targetItemId`. */
    | "alias"
    /** Ramificación vinculada: refleja el original (`refKind`/`refId`) en vivo. */
    | "branch"
    /** v2.1 (Adenda 65, §17): repo GIT externo conectado (metadatos cacheados en `connectedRepo`). */
    | "repo"
    /** v2.1 (Adenda 69, §19): enlace/nota/imagen guardado desde "Marcadores" (src/lib/library/bookmarks.ts). */
    | "bookmark";

/** Entrada de control de acceso: un usuario o un grupo (por id/slug). */
export interface ACLEntry {
    kind: "user" | "group";
    /** uuid (user) o slug (group). */
    id: string;
    /** Etiqueta legible para mostrar en UI (username/display_name o nombre de grupo). */
    label?: string;
}

/** Lista de control de acceso de un ítem. Ausente/vacía = sin restricción (v1). */
export interface ItemACL {
    read: ACLEntry[];
    write: ACLEntry[];
}

function emptyAcl(): ItemACL {
    return { read: [], write: [] };
}

/** v2.1 (§13): snapshot de un estado anterior de un ítem, para historial/restaurar/comparar. */
export interface ItemVersionEntry {
    id: string;
    at: string;
    by: string;
    /** Etiqueta legible opcional (p.ej. "antes de fusionar rama"). */
    label?: string;
    title: string;
    note?: string;
    content?: string;
    url?: string;
    mime?: string;
    language?: string;
    description?: string;
}

/** v2.1 (§17): instantánea cacheada de un repositorio GIT externo conectado (GitHub, lectura pública). */
export interface ConnectedRepoMeta {
    provider: "github";
    owner: string;
    repo: string;
    fullName: string;
    description?: string;
    htmlUrl: string;
    homepage?: string;
    stars: number;
    forks: number;
    language?: string;
    license?: string;
    topics: string[];
    defaultBranch: string;
    ownerLogin: string;
    ownerAvatar?: string;
    readme?: string | null;
    releases: Array<{ tag: string; name?: string; body?: string; publishedAt?: string; htmlUrl?: string }>;
    syncedAt: string;
}

/** v2.1 (§16): entrada de "release" de un repositorio propio (changelog con nota). */
export interface RepoRelease {
    id: string;
    tag: string;
    note: string;
    createdAt: string;
    by: string;
    /** true si esta release también se volcó a `library_public_items` (repo público). */
    published?: boolean;
}

/** v2.1 (§16): metadatos de un repositorio creado por el usuario (folder-repo, estilo GitHub). */
export interface RepoMeta {
    description?: string;
    visibility: "privado" | "publico";
    category?: string;
    license?: string;
    topics: string[];
    /** Contenido Markdown editable del README.md del repo. */
    readme: string;
    releases: RepoRelease[];
    /** Si nació de "Replicar" (fork) sobre otro repo, propio o ajeno. */
    forkedFrom?: { kind: SyncEntityKind; id: string; folderId: string } | null;
    createdAt: string;
    /** Última vez que se publicó (o republicó) al catálogo público, si aplica. */
    lastPublishedAt?: string;
}

export interface SavedItem {
    id: string;
    type: SavedItemType;
    /** Id del recurso original en su propio sistema (paquete, publicación…). */
    refId?: string;
    /** Ruta interna del OS para abrir el recurso (si aplica). */
    route?: string;
    /** URL externa (si aplica). */
    url?: string;
    title: string;
    note?: string;
    tags: string[];
    folderId?: string | null;
    addedAt: string;
    addedBy: string;
    /** v2: metadatos de formato para vista previa embebida (opcional, tolerante). */
    mime?: string;
    thumbnail?: string;
    content?: string;
    language?: string;
    description?: string;
    /** v2 (`type==="alias"`): id del item real al que apunta este acceso directo. */
    targetItemId?: string;
    /** v2 (`type==="branch"`): de qué se ramificó (Entidad Única reflejada en vivo). */
    refKind?: SavedItemType;
    refId2?: string;
    /** v2.1 (§14): id LOCAL (dentro de esta biblioteca) del ítem inmediato del que se ramificó
     *  (lineage sin ambigüedad; `refId2` apunta al recurso externo, no siempre resoluble aquí). */
    branchOf?: string;
    /** v2: permisos por ítem (ausente = visible/editable por todos con acceso a la biblioteca). */
    acl?: ItemACL;
    /** v2.1 (§13): historial de versiones (snapshots previos), acotado — ver `updateItemContent`. */
    versions?: ItemVersionEntry[];
    /** v2.1 (§17, `type==="repo"`): instantánea cacheada de un repo GIT externo conectado. */
    connectedRepo?: ConnectedRepoMeta;
}

export interface LibraryFolder {
    id: string;
    name: string;
    /** Carpeta padre (null = raíz), permite anidar como categorías. */
    parentId: string | null;
    createdAt: string;
    createdBy: string;
    /** v2: categoría libre (espejo de PackageKind de la Librería, opcional). */
    category?: string;
    /** v2: permisos por carpeta (aplica a la carpeta en sí; los ítems tienen el suyo propio). */
    acl?: ItemACL;
    /** v2.1 (§16): presencia = esta carpeta es la raíz de un repositorio estilo GitHub. */
    repo?: RepoMeta;
}

export interface EntityLibraryDoc {
    items: SavedItem[];
    folders: LibraryFolder[];
    /** Revisión local incremental (solo referencia informativa; el LWW real usa entity_state.rev). */
    rev: number;
    updatedAt: string;
    /** Versión del esquema del documento. v1 (undefined) se normaliza en lectura. */
    version?: 2;
}

const DOC_VERSION = 2 as const;

const EMPTY_DOC: EntityLibraryDoc = { items: [], folders: [], rev: 0, updatedAt: "", version: DOC_VERSION };

function emptyDoc(): EntityLibraryDoc {
    return { items: [], folders: [], rev: 0, updatedAt: new Date(0).toISOString(), version: DOC_VERSION };
}

/**
 * Migración normalizadora v1→v2: completa campos nuevos con defaults seguros.
 * Idempotente (aplicarla dos veces no cambia nada) y aditiva (nunca borra datos
 * v1). Los docs guardados hoy en v1 (sin `tags` en folders, sin `acl`, sin
 * `version`) siguen funcionando exactamente igual tras pasar por aquí.
 */
function normalizeDoc(raw: Partial<EntityLibraryDoc> | null | undefined): EntityLibraryDoc {
    if (!raw) return emptyDoc();
    const items = Array.isArray(raw.items) ? raw.items : [];
    const folders = Array.isArray(raw.folders) ? raw.folders : [];
    return {
        items: items.map((it) => ({
            ...it,
            tags: Array.isArray(it?.tags) ? it.tags : [],
            folderId: it?.folderId ?? null,
        })),
        folders: folders.map((f) => ({
            ...f,
            parentId: f?.parentId ?? null,
        })),
        rev: typeof raw.rev === "number" ? raw.rev : 0,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        version: DOC_VERSION,
    };
}

// ─────────────────────────── Ref pública del panel ───────────────────────────
// El vocabulario de EntityKind del panel de biblioteca (usuario/perfil/página/
// grupo/comunidad/evento/E.F./partido) coincide 1:1 con el de entity-state; se
// re-exporta para que los consumidores de la UI no tengan que importar de dos
// sitios. `kind==="user"` usa el uid como id; el resto usa el slug de la entidad.
export type { EntityRef, SyncEntityKind as LibraryEntityKind };

export function libraryRef(kind: SyncEntityKind, id: string): EntityRef {
    return { kind, id };
}

const LIBRARY_KEY = "library";
const LIBRARY_EVENT = "starseed:entitylib";

// ─────────────────────────── Cache local ───────────────────────────

function cacheKey(ref: EntityRef): string {
    return `starseed.entitylib.${ref.kind}.${ref.id}.v1`;
}

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readCache(ref: EntityRef): EntityLibraryDoc {
    if (!isClient()) return emptyDoc();
    try {
        const raw = localStorage.getItem(cacheKey(ref));
        if (!raw) return emptyDoc();
        const parsed = JSON.parse(raw) as Partial<EntityLibraryDoc>;
        return normalizeDoc(parsed);
    } catch {
        return emptyDoc();
    }
}

function writeCache(ref: EntityRef, doc: EntityLibraryDoc): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(cacheKey(ref), JSON.stringify(doc));
    } catch {
        /* cuota / modo privado: degradamos en silencio, la sesión sigue en memoria */
    }
    emitChange(ref);
}

function emitChange(ref: EntityRef): void {
    if (!isClient()) return;
    try {
        window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail: { kind: ref.kind, id: ref.id } }));
    } catch {
        /* noop */
    }
}

function subscribeCache(ref: EntityRef, cb: () => void): () => void {
    if (!isClient()) return () => {};
    const onChange = (e: Event) => {
        const detail = (e as CustomEvent<{ kind: string; id: string } | undefined>).detail;
        if (!detail || (detail.kind === ref.kind && detail.id === ref.id)) cb();
    };
    const onStorage = (e: StorageEvent) => {
        if (e.key === cacheKey(ref) || e.key === null) cb();
    };
    window.addEventListener(LIBRARY_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(LIBRARY_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

// ─────────────────────────── Merge LWW (nube ↔ local) ───────────────────────────

/** Fusiona dos documentos por id de item/carpeta; el más reciente (por addedAt/createdAt) gana. */
function mergeDocs(a: EntityLibraryDoc, b: EntityLibraryDoc): EntityLibraryDoc {
    const itemMap = new Map<string, SavedItem>();
    for (const it of a.items) itemMap.set(it.id, it);
    for (const it of b.items) {
        const existing = itemMap.get(it.id);
        if (!existing || Date.parse(it.addedAt || "") >= Date.parse(existing.addedAt || "")) {
            itemMap.set(it.id, it);
        }
    }
    const folderMap = new Map<string, LibraryFolder>();
    for (const f of a.folders) folderMap.set(f.id, f);
    for (const f of b.folders) {
        const existing = folderMap.get(f.id);
        if (!existing || Date.parse(f.createdAt || "") >= Date.parse(existing.createdAt || "")) {
            folderMap.set(f.id, f);
        }
    }
    return {
        items: Array.from(itemMap.values()),
        folders: Array.from(folderMap.values()),
        rev: Math.max(a.rev, b.rev),
        updatedAt: new Date().toISOString(),
    };
}

// ─────────────────────────── Sync a la nube (best-effort) ───────────────────────────

async function pullCloud(ref: EntityRef): Promise<EntityLibraryDoc | null> {
    try {
        const row = await getEntityState<EntityLibraryDoc>(ref, LIBRARY_KEY);
        if (!row || !row.value) return null;
        const normalized = normalizeDoc(row.value);
        return { ...normalized, rev: row.rev ?? 0, updatedAt: row.updated_at ?? "" };
    } catch {
        return null;
    }
}

async function pushCloud(ref: EntityRef, doc: EntityLibraryDoc): Promise<void> {
    try {
        await setEntityState(ref, LIBRARY_KEY, doc);
    } catch {
        /* sin sesión o sin permisos: la copia local sigue siendo válida */
    }
}

let _idSeq = 0;
function makeId(prefix: string): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch {
        /* noop */
    }
    return `${prefix}-${Date.now().toString(36)}-${(_idSeq++).toString(36)}`;
}

// ─────────────────────────── API imperativa ───────────────────────────

/** Lee la biblioteca de una entidad: cache local inmediata + refresco desde la nube en segundo plano. */
export async function listLibrary(ref: EntityRef): Promise<EntityLibraryDoc> {
    const local = readCache(ref);
    const cloud = await pullCloud(ref);
    if (!cloud) return local;
    const merged = mergeDocs(local, cloud);
    writeCache(ref, merged);
    return merged;
}

/** Snapshot síncrono (solo cache local; para hooks/lecturas inmediatas). */
export function readLibrarySnapshot(ref: EntityRef): EntityLibraryDoc {
    return readCache(ref);
}

async function mutate(
    ref: EntityRef,
    fn: (doc: EntityLibraryDoc) => EntityLibraryDoc,
): Promise<EntityLibraryDoc> {
    const current = readCache(ref);
    const next = fn(current);
    writeCache(ref, next);
    // Push a la nube en segundo plano (no bloquea la UI local-first).
    void pushCloud(ref, next);
    return next;
}

export interface SaveItemInput {
    type: SavedItemType;
    refId?: string;
    route?: string;
    url?: string;
    title: string;
    note?: string;
    tags?: string[];
    folderId?: string | null;
    /** v2.1 (§16-17): metadatos de formato/contenido, para que forks/copias entre bibliotecas
     *  (p.ej. `forkRepo` en user-repos.ts) no pierdan el contenido inline de los ítems. */
    mime?: string;
    thumbnail?: string;
    content?: string;
    language?: string;
    description?: string;
    /** v2.1 (§17): pasa la instantánea cacheada al guardar/copiar un ítem `type:"repo"`. */
    connectedRepo?: ConnectedRepoMeta;
}

/** Guarda una referencia en la biblioteca de la entidad. Deduplica por (type+refId|route|url). */
export async function saveItem(
    ref: EntityRef,
    item: SaveItemInput,
    folderId?: string | null,
): Promise<{ ok: boolean; id: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    const dedupOf = (it: { type: string; refId?: string; route?: string; url?: string }) =>
        `${it.type}::${it.refId ?? ""}::${it.route ?? ""}::${it.url ?? ""}`;
    const key = dedupOf(item);
    let resultId = "";
    await mutate(ref, (doc) => {
        const existing = doc.items.find((it) => dedupOf(it) === key);
        if (existing) {
            resultId = existing.id;
            // Ya guardado: solo actualiza carpeta/nota si se pasaron explícitamente.
            const next = doc.items.map((it) =>
                it.id === existing.id
                    ? {
                          ...it,
                          folderId: folderId !== undefined ? folderId : it.folderId,
                          note: item.note !== undefined ? item.note : it.note,
                      }
                    : it,
            );
            return { ...doc, items: next, updatedAt: new Date().toISOString() };
        }
        const entry: SavedItem = {
            id: makeId("item"),
            type: item.type,
            refId: item.refId,
            route: item.route,
            url: item.url,
            title: item.title,
            note: item.note,
            tags: item.tags ?? [],
            folderId: folderId ?? item.folderId ?? null,
            addedAt: new Date().toISOString(),
            addedBy: who,
            mime: item.mime,
            thumbnail: item.thumbnail,
            content: item.content,
            language: item.language,
            description: item.description,
            connectedRepo: item.connectedRepo,
        };
        resultId = entry.id;
        return { ...doc, items: [entry, ...doc.items], updatedAt: new Date().toISOString() };
    });
    return { ok: true, id: resultId };
}

export async function removeItem(ref: EntityRef, itemId: string): Promise<void> {
    await mutate(ref, (doc) => ({
        ...doc,
        items: doc.items.filter((it) => it.id !== itemId),
        updatedAt: new Date().toISOString(),
    }));
}

export async function moveItem(
    ref: EntityRef,
    itemId: string,
    folderId: string | null,
): Promise<void> {
    await mutate(ref, (doc) => ({
        ...doc,
        items: doc.items.map((it) => (it.id === itemId ? { ...it, folderId } : it)),
        updatedAt: new Date().toISOString(),
    }));
}

export async function createFolder(ref: EntityRef, name: string, parentId: string | null = null): Promise<string> {
    const who = (await currentUserRef())?.id ?? "anon";
    let newId = "";
    await mutate(ref, (doc) => {
        const trimmed = name.trim() || "Carpeta";
        const dup = doc.folders.find((f) => f.parentId === parentId && f.name.toLowerCase() === trimmed.toLowerCase());
        if (dup) {
            newId = dup.id;
            return doc;
        }
        const folder: LibraryFolder = {
            id: makeId("folder"),
            name: trimmed,
            parentId,
            createdAt: new Date().toISOString(),
            createdBy: who,
        };
        newId = folder.id;
        return { ...doc, folders: [...doc.folders, folder], updatedAt: new Date().toISOString() };
    });
    return newId;
}

export async function renameFolder(ref: EntityRef, folderId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await mutate(ref, (doc) => ({
        ...doc,
        folders: doc.folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
        updatedAt: new Date().toISOString(),
    }));
}

/** Elimina una carpeta; sus items pasan a la raíz (folderId=null), nunca se borran referencias. */
export async function removeFolder(ref: EntityRef, folderId: string): Promise<void> {
    await mutate(ref, (doc) => ({
        ...doc,
        folders: doc.folders.filter((f) => f.id !== folderId),
        items: doc.items.map((it) => (it.folderId === folderId ? { ...it, folderId: null } : it)),
        updatedAt: new Date().toISOString(),
    }));
}

/**
 * Mueve/re-anida una carpeta bajo otra (o a la raíz con `parentId=null`).
 * Rechaza en silencio (no-op) si el destino crearía un ciclo (mover una
 * carpeta dentro de sí misma o de uno de sus propios descendientes).
 */
export async function moveFolder(ref: EntityRef, folderId: string, parentId: string | null): Promise<void> {
    await mutate(ref, (doc) => {
        if (folderId === parentId) return doc;
        if (parentId) {
            // Detecta ciclo: recorre ancestros de `parentId`; si llega a `folderId`, es inválido.
            const byId = new Map(doc.folders.map((f) => [f.id, f] as const));
            let cursor: string | null = parentId;
            const seen = new Set<string>();
            while (cursor) {
                if (cursor === folderId) return doc; // ciclo: no-op
                if (seen.has(cursor)) break;
                seen.add(cursor);
                cursor = byId.get(cursor)?.parentId ?? null;
            }
        }
        return {
            ...doc,
            folders: doc.folders.map((f) => (f.id === folderId ? { ...f, parentId } : f)),
            updatedAt: new Date().toISOString(),
        };
    });
}

/** Sustituye por completo las etiquetas de un ítem. */
export async function setItemTags(ref: EntityRef, itemId: string, tags: string[]): Promise<void> {
    const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
    await mutate(ref, (doc) => ({
        ...doc,
        items: doc.items.map((it) => (it.id === itemId ? { ...it, tags: cleaned } : it)),
        updatedAt: new Date().toISOString(),
    }));
}

/** Establece (sustituye) la ACL de lectura/escritura de un ítem. `null` limpia la ACL (sin restricción, v1). */
export async function setItemAcl(ref: EntityRef, itemId: string, acl: ItemACL | null): Promise<void> {
    await mutate(ref, (doc) => ({
        ...doc,
        items: doc.items.map((it) => (it.id === itemId ? { ...it, acl: acl ?? undefined } : it)),
        updatedAt: new Date().toISOString(),
    }));
}

/** Establece (sustituye) la ACL de una carpeta. `null` limpia la ACL. */
export async function setFolderAcl(ref: EntityRef, folderId: string, acl: ItemACL | null): Promise<void> {
    await mutate(ref, (doc) => ({
        ...doc,
        folders: doc.folders.map((f) => (f.id === folderId ? { ...f, acl: acl ?? undefined } : f)),
        updatedAt: new Date().toISOString(),
    }));
}

/**
 * Crea un ACCESO DIRECTO (alias) a un ítem existente de la MISMA biblioteca.
 * El alias no tiene contenido propio: al abrirlo, la UI resuelve `targetItemId`
 * y muestra/abre el ítem real. Vive donde se coloque (puede estar en otra
 * carpeta que el original) sin moverlo.
 */
export async function createAlias(
    ref: EntityRef,
    targetItemId: string,
    folderId: string | null = null,
): Promise<{ ok: boolean; id: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let newId = "";
    await mutate(ref, (doc) => {
        const target = doc.items.find((it) => it.id === targetItemId);
        if (!target) return doc;
        const alias: SavedItem = {
            id: makeId("alias"),
            type: "alias",
            title: target.title,
            tags: [],
            folderId,
            addedAt: new Date().toISOString(),
            addedBy: who,
            targetItemId,
        };
        newId = alias.id;
        return { ...doc, items: [alias, ...doc.items], updatedAt: new Date().toISOString() };
    });
    return { ok: !!newId, id: newId };
}

/**
 * REPLICAR (rama/branch): crea una copia VINCULADA al original (Entidad
 * Única — refleja actualizaciones futuras del original vía `refKind`/`refId2`).
 * A diferencia de `alias`, una rama SÍ lleva su propio snapshot de metadatos
 * (título/preview) para poder listarse offline, pero conceptualmente sigue
 * apuntando al mismo recurso raíz que el ítem original apuntaba (`refId`).
 */
export async function replicateItem(
    ref: EntityRef,
    sourceItemId: string,
    folderId: string | null = null,
): Promise<{ ok: boolean; id: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let newId = "";
    await mutate(ref, (doc) => {
        const source = doc.items.find((it) => it.id === sourceItemId);
        if (!source) return doc;
        const branch: SavedItem = {
            ...source,
            id: makeId("branch"),
            type: "branch",
            folderId,
            addedAt: new Date().toISOString(),
            addedBy: who,
            refKind: source.type,
            refId2: source.refId ?? source.id,
            // v2.1 (§14): lineage local sin ambigüedad — ver branchesOf()/mergeBranch() en finder-types.ts.
            branchOf: source.id,
            // La rama nace con su propia ACL/historial (no hereda restricciones ni versiones del origen).
            acl: undefined,
            versions: undefined,
        };
        newId = branch.id;
        return { ...doc, items: [branch, ...doc.items], updatedAt: new Date().toISOString() };
    });
    return { ok: !!newId, id: newId };
}

/**
 * DUPLICAR: copia independiente normal (rompe el vínculo). El nuevo ítem no
 * refleja cambios futuros del original — es una entrada nueva con su propio
 * id, libre para editar (tags/nota/carpeta) sin afectar al original.
 */
export async function duplicateItem(
    ref: EntityRef,
    sourceItemId: string,
    folderId: string | null = null,
): Promise<{ ok: boolean; id: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let newId = "";
    await mutate(ref, (doc) => {
        const source = doc.items.find((it) => it.id === sourceItemId);
        if (!source) return doc;
        const copy: SavedItem = {
            ...source,
            id: makeId("item"),
            folderId,
            addedAt: new Date().toISOString(),
            addedBy: who,
            acl: undefined, // la copia nace sin restricciones propias
            versions: undefined, // ni con el historial de ediciones del origen
            branchOf: undefined,
        };
        newId = copy.id;
        return { ...doc, items: [copy, ...doc.items], updatedAt: new Date().toISOString() };
    });
    return { ok: !!newId, id: newId };
}

// ─────────────────────────── Versiones (§13) ───────────────────────────

const MAX_ITEM_VERSIONS = 25;
const VERSIONABLE_FIELDS = ["title", "note", "content", "url", "mime", "language", "description"] as const;
type VersionableField = (typeof VERSIONABLE_FIELDS)[number];
export type VersionablePatch = Partial<Pick<SavedItem, VersionableField>>;

function snapshotVersion(item: SavedItem, who: string, label?: string): ItemVersionEntry {
    return {
        id: makeId("ver"),
        at: new Date().toISOString(),
        by: who,
        label,
        title: item.title,
        note: item.note,
        content: item.content,
        url: item.url,
        mime: item.mime,
        language: item.language,
        description: item.description,
    };
}

function versionableFieldsChanged(item: SavedItem, patch: VersionablePatch): boolean {
    return VERSIONABLE_FIELDS.some((f) => f in patch && patch[f] !== item[f]);
}

/**
 * Edita título/nota/contenido/url/mime/idioma/descripción de un ítem YA guardado.
 * Si algún campo versionable cambia de verdad, empuja el estado ANTERIOR al
 * historial (`versions`, FIFO acotado a MAX_ITEM_VERSIONS) antes de aplicar `patch`.
 */
export async function updateItemContent(
    ref: EntityRef,
    itemId: string,
    patch: VersionablePatch,
    opts?: { label?: string },
): Promise<{ ok: boolean }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let ok = false;
    await mutate(ref, (doc) => {
        const item = doc.items.find((it) => it.id === itemId);
        if (!item) return doc;
        ok = true;
        const changed = versionableFieldsChanged(item, patch);
        const versions = changed
            ? [snapshotVersion(item, who, opts?.label), ...(item.versions ?? [])].slice(0, MAX_ITEM_VERSIONS)
            : item.versions;
        const nextItem: SavedItem = { ...item, ...patch, versions };
        return {
            ...doc,
            items: doc.items.map((it) => (it.id === itemId ? nextItem : it)),
            updatedAt: new Date().toISOString(),
        };
    });
    return { ok };
}

/** Restaura una versión anterior. Snapshotea el estado ACTUAL antes (para poder deshacer la restauración). */
export async function restoreItemVersion(ref: EntityRef, itemId: string, versionId: string): Promise<{ ok: boolean }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let ok = false;
    await mutate(ref, (doc) => {
        const item = doc.items.find((it) => it.id === itemId);
        if (!item) return doc;
        const version = (item.versions ?? []).find((v) => v.id === versionId);
        if (!version) return doc;
        ok = true;
        const preRestoreSnapshot = snapshotVersion(item, who, "antes de restaurar");
        const nextItem: SavedItem = {
            ...item,
            title: version.title,
            note: version.note,
            content: version.content,
            url: version.url,
            mime: version.mime,
            language: version.language,
            description: version.description,
            versions: [preRestoreSnapshot, ...(item.versions ?? [])].slice(0, MAX_ITEM_VERSIONS),
        };
        return {
            ...doc,
            items: doc.items.map((it) => (it.id === itemId ? nextItem : it)),
            updatedAt: new Date().toISOString(),
        };
    });
    return { ok };
}

// ─────────────────────────── Ramas: linaje + fusión (§14) ───────────────────────────

/**
 * Resuelve el ítem ORIGEN de una rama. Prioriza `branchOf` (lineage local,
 * sin ambigüedad). Fallback de mejor esfuerzo para ramas anteriores a v2.1
 * (sin `branchOf`): busca otro ítem cuyo `refId`/`id` coincida con `refId2`.
 */
export function resolveBranchOrigin(doc: EntityLibraryDoc, branch: SavedItem): SavedItem | undefined {
    if (branch.branchOf) {
        const byId = doc.items.find((it) => it.id === branch.branchOf);
        if (byId) return byId;
    }
    if (branch.refId2) {
        return doc.items.find((it) => it.id !== branch.id && (it.refId === branch.refId2 || it.id === branch.refId2));
    }
    return undefined;
}

/**
 * Fusiona una RAMA con su ítem ORIGEN: escribe los campos actuales de la rama
 * (título/nota/contenido/url/mime/idioma/descripción/tags) sobre el origen,
 * snapshoteando antes el estado previo del origen en su propio historial de
 * versiones (§13) — la fusión es reversible con "Restaurar". `removeBranchAfter`
 * (por defecto false, no destructivo) borra la rama tras fusionar con éxito.
 */
export async function mergeBranch(
    ref: EntityRef,
    branchItemId: string,
    opts?: { removeBranchAfter?: boolean },
): Promise<{ ok: boolean; originId?: string; message?: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let result: { ok: boolean; originId?: string; message?: string } = { ok: false, message: "No se encontró la rama." };
    await mutate(ref, (doc) => {
        const branch = doc.items.find((it) => it.id === branchItemId);
        if (!branch || branch.type !== "branch") {
            result = { ok: false, message: "Ese ítem no es una rama." };
            return doc;
        }
        const origin = resolveBranchOrigin(doc, branch);
        if (!origin) {
            result = { ok: false, message: "No se pudo resolver el ítem de origen de esta rama (quizás ya se eliminó)." };
            return doc;
        }
        const originSnapshot = snapshotVersion(origin, who, "antes de fusionar rama");
        const mergedOrigin: SavedItem = {
            ...origin,
            title: branch.title,
            note: branch.note,
            content: branch.content,
            url: branch.url,
            mime: branch.mime,
            language: branch.language,
            description: branch.description,
            tags: branch.tags,
            versions: [originSnapshot, ...(origin.versions ?? [])].slice(0, MAX_ITEM_VERSIONS),
        };
        let items = doc.items.map((it) => (it.id === origin.id ? mergedOrigin : it));
        if (opts?.removeBranchAfter) items = items.filter((it) => it.id !== branchItemId);
        result = { ok: true, originId: origin.id };
        return { ...doc, items, updatedAt: new Date().toISOString() };
    });
    return result;
}

// ─────────────────────────── Repositorios: folder-repo (§16) ───────────────────────────

/** Establece (sustituye) los metadatos de repositorio de una carpeta. `null` la des-marca como repo. */
export async function setFolderRepoMeta(ref: EntityRef, folderId: string, repo: RepoMeta | null): Promise<void> {
    await mutate(ref, (doc) => ({
        ...doc,
        folders: doc.folders.map((f) => (f.id === folderId ? { ...f, repo: repo ?? undefined } : f)),
        updatedAt: new Date().toISOString(),
    }));
}

// ─────────────────────────── Repos externos conectados (§17) ───────────────────────────

/** Guarda una referencia (ítem `type:"repo"`) a un repo GIT externo, con su ficha cacheada. */
export async function addConnectedRepoItem(
    ref: EntityRef,
    meta: ConnectedRepoMeta,
    folderId: string | null = null,
): Promise<{ ok: boolean; id: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    let newId = "";
    await mutate(ref, (doc) => {
        const item: SavedItem = {
            id: makeId("repo"),
            type: "repo",
            title: meta.fullName,
            url: meta.htmlUrl,
            tags: meta.topics.slice(0, 8),
            folderId,
            addedAt: new Date().toISOString(),
            addedBy: who,
            description: meta.description,
            connectedRepo: meta,
        };
        newId = item.id;
        return { ...doc, items: [item, ...doc.items], updatedAt: new Date().toISOString() };
    });
    return { ok: !!newId, id: newId };
}

/** Re-sincroniza los metadatos cacheados de un repo conectado ("Sincronizar metadatos"). */
export async function resyncConnectedRepoItem(
    ref: EntityRef,
    itemId: string,
    meta: ConnectedRepoMeta,
): Promise<{ ok: boolean }> {
    let ok = false;
    await mutate(ref, (doc) => {
        const item = doc.items.find((it) => it.id === itemId);
        if (!item || item.type !== "repo") return doc;
        ok = true;
        const next: SavedItem = {
            ...item,
            title: meta.fullName,
            url: meta.htmlUrl,
            description: meta.description,
            connectedRepo: meta,
        };
        return { ...doc, items: doc.items.map((it) => (it.id === itemId ? next : it)), updatedAt: new Date().toISOString() };
    });
    return { ok };
}

// ─────────────────────────── Hook reactivo ───────────────────────────

export interface UseEntityLibrary {
    doc: EntityLibraryDoc;
    loading: boolean;
    reload: () => void;
    saveItem: (item: SaveItemInput, folderId?: string | null) => Promise<{ ok: boolean; id: string }>;
    removeItem: (itemId: string) => Promise<void>;
    moveItem: (itemId: string, folderId: string | null) => Promise<void>;
    createFolder: (name: string, parentId?: string | null) => Promise<string>;
    renameFolder: (folderId: string, name: string) => Promise<void>;
    removeFolder: (folderId: string) => Promise<void>;
    /** v2 */
    moveFolder: (folderId: string, parentId: string | null) => Promise<void>;
    setItemTags: (itemId: string, tags: string[]) => Promise<void>;
    setItemAcl: (itemId: string, acl: ItemACL | null) => Promise<void>;
    setFolderAcl: (folderId: string, acl: ItemACL | null) => Promise<void>;
    createAlias: (targetItemId: string, folderId?: string | null) => Promise<{ ok: boolean; id: string }>;
    replicateItem: (sourceItemId: string, folderId?: string | null) => Promise<{ ok: boolean; id: string }>;
    duplicateItem: (sourceItemId: string, folderId?: string | null) => Promise<{ ok: boolean; id: string }>;
    /** v2.1 (§13) */
    updateItemContent: (itemId: string, patch: VersionablePatch, opts?: { label?: string }) => Promise<{ ok: boolean }>;
    restoreItemVersion: (itemId: string, versionId: string) => Promise<{ ok: boolean }>;
    /** v2.1 (§14) */
    mergeBranch: (branchItemId: string, opts?: { removeBranchAfter?: boolean }) => Promise<{ ok: boolean; originId?: string; message?: string }>;
    /** v2.1 (§16) */
    setFolderRepoMeta: (folderId: string, repo: RepoMeta | null) => Promise<void>;
    /** v2.1 (§17) */
    addConnectedRepoItem: (meta: ConnectedRepoMeta, folderId?: string | null) => Promise<{ ok: boolean; id: string }>;
    resyncConnectedRepoItem: (itemId: string, meta: ConnectedRepoMeta) => Promise<{ ok: boolean }>;
}

/**
 * Hook local-first + nube + realtime para la biblioteca de una entidad.
 * `ref` puede ser null (p.ej. mientras se resuelve sesión): en ese caso
 * devuelve un documento vacío estable sin tocar red.
 */
export function useEntityLibrary(ref: EntityRef | null): UseEntityLibrary {
    const [doc, setDoc] = useState<EntityLibraryDoc>(() => (ref ? readCache(ref) : EMPTY_DOC));
    const [loading, setLoading] = useState<boolean>(!!ref);

    const refKind = ref?.kind ?? "";
    const refId = ref?.id ?? "";

    const reload = useCallback(() => {
        if (!ref) return;
        setDoc(readCache(ref));
    }, [ref]);

    useEffect(() => {
        if (!ref) {
            setDoc(EMPTY_DOC);
            setLoading(false);
            return;
        }
        let alive = true;
        setDoc(readCache(ref));
        setLoading(true);

        (async () => {
            const merged = await listLibrary(ref);
            if (alive) {
                setDoc(merged);
                setLoading(false);
            }
        })();

        const unsubCache = subscribeCache(ref, () => {
            if (alive) setDoc(readCache(ref));
        });
        const unsubRemote = subscribeEntityState<EntityLibraryDoc>(ref, LIBRARY_KEY, (change) => {
            if (change.self) return; // anti-eco: este dispositivo ya aplicó el cambio local
            if (!alive) return;
            const remote = normalizeDoc({ ...change.value, rev: change.rev, updatedAt: change.updated_at });
            const mergedLocal = mergeDocs(readCache(ref), remote);
            writeCache(ref, mergedLocal);
        });

        return () => {
            alive = false;
            unsubCache();
            unsubRemote();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refKind/refId identifican `ref` de forma estable
    }, [refKind, refId]);

    const boundSaveItem = useCallback(
        (item: SaveItemInput, folderId?: string | null) => {
            if (!ref) return Promise.resolve({ ok: false, id: "" });
            return saveItem(ref, item, folderId);
        },
        [ref],
    );
    const boundRemoveItem = useCallback(
        (itemId: string) => (ref ? removeItem(ref, itemId) : Promise.resolve()),
        [ref],
    );
    const boundMoveItem = useCallback(
        (itemId: string, folderId: string | null) => (ref ? moveItem(ref, itemId, folderId) : Promise.resolve()),
        [ref],
    );
    const boundCreateFolder = useCallback(
        (name: string, parentId: string | null = null) => (ref ? createFolder(ref, name, parentId) : Promise.resolve("")),
        [ref],
    );
    const boundRenameFolder = useCallback(
        (folderId: string, name: string) => (ref ? renameFolder(ref, folderId, name) : Promise.resolve()),
        [ref],
    );
    const boundRemoveFolder = useCallback(
        (folderId: string) => (ref ? removeFolder(ref, folderId) : Promise.resolve()),
        [ref],
    );
    const boundMoveFolder = useCallback(
        (folderId: string, parentId: string | null) => (ref ? moveFolder(ref, folderId, parentId) : Promise.resolve()),
        [ref],
    );
    const boundSetItemTags = useCallback(
        (itemId: string, tags: string[]) => (ref ? setItemTags(ref, itemId, tags) : Promise.resolve()),
        [ref],
    );
    const boundSetItemAcl = useCallback(
        (itemId: string, acl: ItemACL | null) => (ref ? setItemAcl(ref, itemId, acl) : Promise.resolve()),
        [ref],
    );
    const boundSetFolderAcl = useCallback(
        (folderId: string, acl: ItemACL | null) => (ref ? setFolderAcl(ref, folderId, acl) : Promise.resolve()),
        [ref],
    );
    const boundCreateAlias = useCallback(
        (targetItemId: string, folderId: string | null = null) =>
            ref ? createAlias(ref, targetItemId, folderId) : Promise.resolve({ ok: false, id: "" }),
        [ref],
    );
    const boundReplicateItem = useCallback(
        (sourceItemId: string, folderId: string | null = null) =>
            ref ? replicateItem(ref, sourceItemId, folderId) : Promise.resolve({ ok: false, id: "" }),
        [ref],
    );
    const boundDuplicateItem = useCallback(
        (sourceItemId: string, folderId: string | null = null) =>
            ref ? duplicateItem(ref, sourceItemId, folderId) : Promise.resolve({ ok: false, id: "" }),
        [ref],
    );
    const boundUpdateItemContent = useCallback(
        (itemId: string, patch: VersionablePatch, opts?: { label?: string }) =>
            ref ? updateItemContent(ref, itemId, patch, opts) : Promise.resolve({ ok: false }),
        [ref],
    );
    const boundRestoreItemVersion = useCallback(
        (itemId: string, versionId: string) => (ref ? restoreItemVersion(ref, itemId, versionId) : Promise.resolve({ ok: false })),
        [ref],
    );
    const boundMergeBranch = useCallback(
        (branchItemId: string, opts?: { removeBranchAfter?: boolean }) =>
            ref ? mergeBranch(ref, branchItemId, opts) : Promise.resolve({ ok: false, message: "Sin biblioteca activa." }),
        [ref],
    );
    const boundSetFolderRepoMeta = useCallback(
        (folderId: string, repo: RepoMeta | null) => (ref ? setFolderRepoMeta(ref, folderId, repo) : Promise.resolve()),
        [ref],
    );
    const boundAddConnectedRepoItem = useCallback(
        (meta: ConnectedRepoMeta, folderId: string | null = null) =>
            ref ? addConnectedRepoItem(ref, meta, folderId) : Promise.resolve({ ok: false, id: "" }),
        [ref],
    );
    const boundResyncConnectedRepoItem = useCallback(
        (itemId: string, meta: ConnectedRepoMeta) =>
            ref ? resyncConnectedRepoItem(ref, itemId, meta) : Promise.resolve({ ok: false }),
        [ref],
    );

    return {
        doc,
        loading,
        reload,
        saveItem: boundSaveItem,
        removeItem: boundRemoveItem,
        moveItem: boundMoveItem,
        createFolder: boundCreateFolder,
        renameFolder: boundRenameFolder,
        removeFolder: boundRemoveFolder,
        moveFolder: boundMoveFolder,
        setItemTags: boundSetItemTags,
        setItemAcl: boundSetItemAcl,
        setFolderAcl: boundSetFolderAcl,
        createAlias: boundCreateAlias,
        replicateItem: boundReplicateItem,
        duplicateItem: boundDuplicateItem,
        updateItemContent: boundUpdateItemContent,
        restoreItemVersion: boundRestoreItemVersion,
        mergeBranch: boundMergeBranch,
        setFolderRepoMeta: boundSetFolderRepoMeta,
        addConnectedRepoItem: boundAddConnectedRepoItem,
        resyncConnectedRepoItem: boundResyncConnectedRepoItem,
    };
}

// ─────────────────────────── Descubrimiento de bibliotecas disponibles ───────────────────────────
// "Mi biblioteca" (usuario) + entidades donde el usuario es dueño (owner_id) o
// miembro (os_memberships). Compartido por el selector de /library y por el
// popover "Guardar en biblioteca…" (save-to-library.tsx) para no duplicar la
// consulta. Solo se resuelve con sesión; sin sesión devuelve lista vacía.

export interface LibraryDestination {
    ref: EntityRef;
    label: string;
    hint?: string;
}

/** Resuelve, de una sola vez, todas las bibliotecas a las que el usuario tiene acceso. */
export async function myLibraryDestinations(): Promise<LibraryDestination[]> {
    try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return [];

        const out: LibraryDestination[] = [{ ref: libraryRef("user", uid), label: "Mi biblioteca" }];
        const seen = new Set<string>(["user:" + uid]);

        const [membershipsRes, ownedPagesRes, ownedGroupsRes] = await Promise.all([
            supabase.from("os_memberships").select("group_slug, role").eq("user_id", uid),
            supabase.from("os_pages").select("slug, name").eq("owner_id", uid),
            supabase.from("os_groups").select("slug, name").eq("owner_id", uid),
        ]);

        const push = (kind: SyncEntityKind, slug: string, label: string, hint?: string) => {
            const key = `${kind}:${slug}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ ref: libraryRef(kind, slug), label, hint });
        };

        for (const row of ownedPagesRes.data ?? []) {
            if (row?.slug) push("page", row.slug, row.name ?? row.slug, "Dueño/a");
        }
        for (const row of ownedGroupsRes.data ?? []) {
            if (row?.slug) push("group", row.slug, row.name ?? row.slug, "Dueño/a");
        }
        for (const row of membershipsRes.data ?? []) {
            if (row?.group_slug) push("group", row.group_slug, row.group_slug, row.role ?? "Miembro");
        }

        return out;
    } catch {
        return [];
    }
}

/** Hook reactivo (una carga) sobre `myLibraryDestinations`. */
export function useMyLibraryDestinations(): { destinations: LibraryDestination[]; loading: boolean } {
    const [destinations, setDestinations] = useState<LibraryDestination[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        myLibraryDestinations().then((list) => {
            if (alive) {
                setDestinations(list);
                setLoading(false);
            }
        });
        return () => {
            alive = false;
        };
    }, []);

    return { destinations, loading };
}
