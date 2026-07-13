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
 *   · Realtime     watchLibrary → canal COMPARTIDO por entidad (refcount) que
 *                  actualiza la cache y emite 'starseed:entitylib' +
 *                  'starseed:library-updated' (los consumidores se refrescan solos)
 *   · Pendientes   `starseed.library.pending.v1` — push fallidos (offline/sin
 *                  sesión/RLS) se encolan y REINTENTAN al volver 'online' y cada
 *                  ~30s. Nunca se pierde un ítem por estar sin conexión.
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
    setEntityStateChecked,
    subscribeEntityState,
    type EntityKind as SyncEntityKind,
    type EntityRef,
} from "@/lib/sync/entity-state";
// Historial de versiones, ramas y registro en la NUBE (Adenda 66 §2 · tablas
// `os_versions` / `os_access_log`). Cada guardado real crea una revisión; nunca
// bloquea el guardado (se invoca con `void`).
import { logAccess, quickChecksum, recordVersion } from "@/lib/versions/versions";
// Seguridad integrada (Adenda 63 §13): escaneo de secretos/PII al guardar/
// compartir e instalar/importar ítems — ver saveItemSecure/importItemSecure.
import { redactText, scanDeep, summarize, type Finding } from "@/lib/security/scanner";
// Señal en vivo SIN DDL (Adenda 63 §4 · "Sync sin DDL: broadcast primero"):
// `postgres_changes` exige que `entity_state` esté en la publicación
// `supabase_realtime` (migración que puede no estar aplicada). El broadcast no
// exige nada, así que es el camino PRINCIPAL y postgres_changes queda como
// camino redundante — deduplicados entre sí con changeKey/shouldProcessChange.
// (alias: este módulo ya tiene su propio `emitChange` local para eventos window)
import {
    changeKey,
    emitChange as emitLiveChange,
    libraryTopic,
    onChange as onLiveChange,
    shouldProcessChange,
} from "@/lib/sync/live-signal";
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
    | "bookmark"
    /** v2.2 (Adenda 63, §11): personalidad de Aurora como archivo de configuración
     *  (JSON en `content`, ver src/lib/aurora/personalities.ts) — compartible e
     *  instalable entre cuentas desde la Biblioteca. */
    | "personality";

/** Entrada de control de acceso: un usuario o un grupo (por id/slug). */
export interface ACLEntry {
    kind: "user" | "group";
    /** uuid (user) o slug (group). */
    id: string;
    /** Etiqueta legible para mostrar en UI (username/display_name o nombre de grupo). */
    label?: string;
}

/** Rol de un acceso concedido (v3). Espejo de AccessRole en src/lib/sharing/access.ts. */
export type AclGrantRole = "view" | "comment" | "edit" | "admin";

/** Destinatario de un acceso concedido (v3). Espejo de AccessGrant en access.ts. */
export interface AclGrant {
    granteeKind: "profile" | "account" | "group" | "page" | "link";
    /** uuid de perfil/cuenta · slug de grupo/página · 'public' (link). */
    granteeId: string;
    role: AclGrantRole;
    label?: string;
    sections?: string[];
}

/**
 * Lista de control de acceso de un nodo (biblioteca · folder · ítem).
 *
 * v1/v2 — `read`/`write`: listas de usuarios/grupos. Ausente o AMBAS vacías =
 * sin restricción propia (lo hereda todo del padre / de la biblioteca).
 *
 * v3 (Adenda 66 §3) — campos OPCIONALES y aditivos que convierten la ACL en el
 * modelo universal de `src/lib/sharing/access.ts` (ámbito + roles):
 *   · `scope`  — ámbito propio del nodo. **Su presencia es la que distingue una
 *     ACL PROPIA de una HEREDADA**: sin `scope` ni grants ni listas, el nodo
 *     hereda del padre.
 *   · `grants` — accesos con rol (view/comment/edit/admin).
 *   · `showInProfile` — §4: este nodo aparece en la Biblioteca pública del perfil.
 * `read`/`write` se siguen escribiendo SIEMPRE como espejo (los consume el
 * Finder en finder-types.ts y las políticas RLS legadas).
 */
export interface ItemACL {
    read: ACLEntry[];
    write: ACLEntry[];
    /** v3: ámbito propio — private|account|profile|profiles|groups|pages|custom|public. */
    scope?: string;
    /** v3: accesos concedidos con rol. */
    grants?: AclGrant[];
    /** v3 (§4): mostrar este nodo en la Biblioteca pública del perfil. */
    showInProfile?: boolean;
    /** v3: marca temporal del último cambio de permisos (LWW en el diálogo). */
    updatedAt?: string;
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
    /**
     * v3 (Adenda 66 §2) · RELOJ LWW del ítem. Cambia en CADA edición (renombrar,
     * mover, etiquetar, editar contenido, ACL…). Antes el merge usaba `addedAt`,
     * que NO cambia al editar: por eso un renombrado o un movimiento nunca ganaba
     * la fusión y "volvía" al valor viejo de la nube. Ver `mergeDocs`.
     */
    updatedAt?: string;
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
    /** v3 (Adenda 66 §2): reloj LWW del folder (cambia al renombrar/mover/ACL/repo). */
    updatedAt?: string;
}

/**
 * v3 (Adenda 66 §2) · LÁPIDAS (tombstones): `id → fecha ISO del borrado`.
 *
 * Sin ellas, `mergeDocs` (que es una UNIÓN por id) RESUCITABA todo lo borrado:
 * el dispositivo A borraba un ítem y subía el doc sin él, pero el dispositivo B
 * fusionaba su caché (que aún lo tenía) con lo remoto y lo devolvía a la vida —
 * el borrado no se propagaba NUNCA. Con lápidas, el borrado es un dato más que
 * viaja por la nube y gana la fusión por fecha, como cualquier otra edición.
 */
export type Tombstones = Record<string, string>;

export interface EntityLibraryDoc {
    items: SavedItem[];
    folders: LibraryFolder[];
    /** Revisión local incremental (solo referencia informativa; el LWW real usa entity_state.rev). */
    rev: number;
    updatedAt: string;
    /** Versión del esquema del documento. v1/v2 (undefined/2) se normalizan en lectura. */
    version?: 3;
    /**
     * v3 (Adenda 66 §3): ACL de la BIBLIOTECA ENTERA (nodo raíz). Los folders y
     * los ítems heredan de aquí si no definen la suya. Ausente = privada de su
     * entidad dueña (comportamiento previo, sin cambios).
     * La RLS de `entity_state` la lee con `es_doc_acl_allows(value, …)`
     * (migración 20260712100100_account_profile_access.sql).
     */
    acl?: ItemACL;
    /** v3 (Adenda 66 §2): ítems borrados (id → ISO). Ver `Tombstones`. */
    deletedItems?: Tombstones;
    /** v3 (Adenda 66 §2): folders borrados (id → ISO). Ver `Tombstones`. */
    deletedFolders?: Tombstones;
}

const DOC_VERSION = 3 as const;

/** Las lápidas se podan a los 90 días (para entonces el borrado ya llegó a todo dispositivo vivo). */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const EMPTY_DOC: EntityLibraryDoc = {
    items: [],
    folders: [],
    rev: 0,
    updatedAt: "",
    version: DOC_VERSION,
    deletedItems: {},
    deletedFolders: {},
};

function emptyDoc(): EntityLibraryDoc {
    return {
        items: [],
        folders: [],
        rev: 0,
        updatedAt: new Date(0).toISOString(),
        version: DOC_VERSION,
        deletedItems: {},
        deletedFolders: {},
    };
}

/** Reloj LWW de un ítem: su `updatedAt` (v3) o, en su defecto, `addedAt` (v1/v2). */
function itemClock(it: SavedItem): number {
    return Date.parse(it.updatedAt || it.addedAt || "") || 0;
}

/** Reloj LWW de un folder: su `updatedAt` (v3) o, en su defecto, `createdAt` (v1/v2). */
function folderClock(f: LibraryFolder): number {
    return Date.parse(f.updatedAt || f.createdAt || "") || 0;
}

function isTombstoneMap(v: unknown): v is Tombstones {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function pruneTombstones(t: unknown): Tombstones {
    if (!isTombstoneMap(t)) return {};
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    const out: Tombstones = {};
    for (const [id, at] of Object.entries(t)) {
        if (typeof at === "string" && (Date.parse(at) || 0) >= cutoff) out[id] = at;
    }
    return out;
}

/** Marca un id como borrado (lápida) sobre una copia del mapa. */
function withTombstone(t: Tombstones | undefined, id: string, at: string): Tombstones {
    return { ...(t ?? {}), [id]: at };
}

/**
 * Migración normalizadora v1/v2→v3: completa campos nuevos con defaults seguros.
 * Idempotente (aplicarla dos veces no cambia nada) y aditiva (nunca borra datos
 * v1/v2). Los docs guardados hoy (sin `updatedAt` por nodo y sin lápidas) siguen
 * funcionando igual: el reloj LWW cae con elegancia a `addedAt`/`createdAt` hasta
 * la primera edición nueva. No hace falta migración de Supabase: mismo `jsonb`,
 * solo más claves opcionales.
 */
function normalizeDoc(raw: Partial<EntityLibraryDoc> | null | undefined): EntityLibraryDoc {
    if (!raw) return emptyDoc();
    const items = Array.isArray(raw.items) ? raw.items : [];
    const folders = Array.isArray(raw.folders) ? raw.folders : [];
    const deletedItems = pruneTombstones(raw.deletedItems);
    const deletedFolders = pruneTombstones(raw.deletedFolders);
    return {
        // La lápida manda sobre la lista: si un doc antiguo aún arrastra algo ya
        // borrado, aquí desaparece (nada resucita por la puerta de atrás).
        items: items
            .filter((it) => it?.id && !(it.id in deletedItems))
            .map((it) => ({
                ...it,
                tags: Array.isArray(it?.tags) ? it.tags : [],
                folderId: it?.folderId ?? null,
            })),
        folders: folders
            .filter((f) => f?.id && !(f.id in deletedFolders))
            .map((f) => ({
                ...f,
                parentId: f?.parentId ?? null,
            })),
        rev: typeof raw.rev === "number" ? raw.rev : 0,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        version: DOC_VERSION,
        // v3 (§3): ACL de la biblioteca entera. Se preserva tal cual (ausente = sin ACL propia).
        acl: raw.acl,
        deletedItems,
        deletedFolders,
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
/** Evento window PÚBLICO para consumidores externos (Adenda 63 §4): detail = { kind, id }. */
export const LIBRARY_UPDATED_EVENT = "starseed:library-updated";
/** Evento window cuando cambia la cola de pendientes de sincronizar: detail = { count }. */
export const LIBRARY_PENDING_EVENT = "starseed:library-pending";

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
        const detail = { kind: ref.kind, id: ref.id };
        window.dispatchEvent(new CustomEvent(LIBRARY_EVENT, { detail }));
        // Evento público (mismo detail) para consumidores fuera de este módulo.
        window.dispatchEvent(new CustomEvent(LIBRARY_UPDATED_EVENT, { detail }));
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

// ─────────────────────────── Cola de pendientes de sincronizar ───────────────────────────
// Push fallidos (offline, sin sesión, RLS, red) se ANOTAN aquí por entidad.
// La cache local YA contiene el documento completo, así que solo guardamos QUÉ
// bibliotecas tienen cambios sin subir; el reintento vuelve a leer la cache y
// re-empuja el doc entero (LWW + mergeDocs hacen el resto). Adenda 63 §4.

const PENDING_KEY = "starseed.library.pending.v1";

interface PendingSyncEntry {
    kind: SyncEntityKind;
    id: string;
    queuedAt: string;
    attempts: number;
    /** v3 (Adenda 66 §2): MOTIVO real del último fallo, para poder MOSTRARLO. */
    lastError?: string;
    lastTriedAt?: string;
}

function pendingKeyOf(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

function readPendingMap(): Record<string, PendingSyncEntry> {
    if (!isClient()) return {};
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, PendingSyncEntry>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writePendingMap(map: Record<string, PendingSyncEntry>): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(map));
    } catch {
        /* cuota / modo privado: la cache local sigue intacta */
    }
    try {
        window.dispatchEvent(
            new CustomEvent(LIBRARY_PENDING_EVENT, { detail: { count: Object.keys(map).length } }),
        );
    } catch {
        /* noop */
    }
}

/** Nº total de bibliotecas con cambios sin subir a la nube. */
export function pendingSyncCount(): number {
    return Object.keys(readPendingMap()).length;
}

/** true si ESTA biblioteca tiene cambios pendientes de subir. */
export function hasPendingSync(ref: EntityRef): boolean {
    return pendingKeyOf(ref) in readPendingMap();
}

/**
 * MOTIVO del último fallo de subida de esta biblioteca (o null si va todo bien).
 * Existe para que el fallo NUNCA sea mudo: la UI lo enseña tal cual.
 */
export function lastSyncError(ref: EntityRef): string | null {
    return readPendingMap()[pendingKeyOf(ref)]?.lastError ?? null;
}

function enqueuePendingSync(ref: EntityRef, error?: string): void {
    if (!isClient()) return;
    const map = readPendingMap();
    const key = pendingKeyOf(ref);
    const prev = map[key];
    map[key] = {
        kind: ref.kind,
        id: ref.id,
        queuedAt: prev?.queuedAt ?? new Date().toISOString(),
        attempts: (prev?.attempts ?? 0) + 1,
        lastError: error ?? prev?.lastError,
        lastTriedAt: new Date().toISOString(),
    };
    writePendingMap(map);
    ensureRetryLoop();
}

function clearPendingSync(ref: EntityRef): void {
    if (!isClient()) return;
    const map = readPendingMap();
    const key = pendingKeyOf(ref);
    if (!(key in map)) return;
    delete map[key];
    writePendingMap(map);
}

let _flushing = false;

/**
 * Reintenta subir TODAS las bibliotecas pendientes (doc completo desde cache).
 * Segura de llamar en cualquier momento (no-op sin pendientes / en SSR / si ya
 * hay un flush en curso). Devuelve cuántas se subieron y cuántas quedan.
 */
export async function flushPendingLibrarySync(): Promise<{ flushed: number; remaining: number }> {
    if (!isClient() || _flushing) return { flushed: 0, remaining: pendingSyncCount() };
    _flushing = true;
    let flushed = 0;
    try {
        const map = readPendingMap();
        for (const entry of Object.values(map)) {
            const ref: EntityRef = { kind: entry.kind, id: entry.id };
            try {
                const doc = readCache(ref);
                const { row, error } = await setEntityStateChecked(ref, LIBRARY_KEY, doc);
                if (row) {
                    clearPendingSync(ref);
                    // Subida diferida (venía de offline/sin sesión): también hay que
                    // anunciarla en vivo al resto de dispositivos y cuentas con acceso.
                    signalLibraryChange(ref, row.updated_at);
                    // Y dejar constancia de la revisión que no se pudo registrar en su momento.
                    void recordLibraryVersion(ref, doc, {
                        message: "Sincronización diferida (cambios hechos sin conexión)",
                        action: "sync",
                    });
                    flushed++;
                } else {
                    // Sigue fallando: se conserva el MOTIVO actualizado y visible.
                    enqueuePendingSync(ref, error ?? "No se pudo guardar en la nube.");
                }
            } catch (e) {
                enqueuePendingSync(ref, (e as Error)?.message || "Error de red al reintentar la subida.");
            }
        }
    } finally {
        _flushing = false;
    }
    return { flushed, remaining: pendingSyncCount() };
}

let _retryLoopStarted = false;

/** Arranca (una sola vez por pestaña) el reintento automático: 'online' + cada ~30s. */
function ensureRetryLoop(): void {
    if (!isClient() || _retryLoopStarted) return;
    _retryLoopStarted = true;
    try {
        window.addEventListener("online", () => {
            void flushPendingLibrarySync();
        });
        window.setInterval(() => {
            if (pendingSyncCount() === 0) return;
            if (typeof navigator !== "undefined" && navigator.onLine === false) return;
            void flushPendingLibrarySync();
        }, 30_000);
    } catch {
        /* noop */
    }
}

// ─────────────────────────── Merge LWW (nube ↔ local) ───────────────────────────

/**
 * Fusiona dos documentos NODO A NODO (Adenda 66 §2). Reescrito porque el merge
 * anterior tenía dos fallos que hacían que la sincronización "no funcionara"
 * aunque la nube respondiera bien:
 *
 *  1. **Los borrados resucitaban.** Era una UNIÓN por id: lo que faltaba en un
 *     lado se recuperaba del otro. Borrar algo no se propagaba jamás. → Ahora
 *     las LÁPIDAS (`deletedItems`/`deletedFolders`) viajan en el doc y ganan a
 *     cualquier versión del nodo que sea ANTERIOR al borrado.
 *  2. **Renombrar/mover se perdía.** El reloj LWW era `addedAt`/`createdAt`, que
 *     NO cambian al editar; con el desempate `>=`, el nodo remoto ganaba SIEMPRE
 *     y toda edición local aún no subida se revertía sola en la siguiente
 *     lectura. → Ahora el reloj es `updatedAt` por nodo (`itemClock`/`folderClock`),
 *     que cambia en cada edición real.
 *
 * `b` solo gana los empates exactos de reloj (misma marca temporal): es el orden
 * de llamada quien decide, y todos los llamadores pasan lo REMOTO como `b`.
 */
function mergeDocs(a: EntityLibraryDoc, b: EntityLibraryDoc): EntityLibraryDoc {
    // Lápidas: la unión de ambos lados (un borrado nunca se "des-borra"), con la
    // fecha MÁS RECIENTE si el mismo id se borró en los dos.
    const deletedItems: Tombstones = { ...(a.deletedItems ?? {}) };
    for (const [id, at] of Object.entries(b.deletedItems ?? {})) {
        const prev = deletedItems[id];
        if (!prev || (Date.parse(at) || 0) > (Date.parse(prev) || 0)) deletedItems[id] = at;
    }
    const deletedFolders: Tombstones = { ...(a.deletedFolders ?? {}) };
    for (const [id, at] of Object.entries(b.deletedFolders ?? {})) {
        const prev = deletedFolders[id];
        if (!prev || (Date.parse(at) || 0) > (Date.parse(prev) || 0)) deletedFolders[id] = at;
    }

    /** Un nodo sobrevive si NO tiene lápida, o si se editó DESPUÉS de que lo borraran (resurrección explícita). */
    const survives = (tombs: Tombstones, id: string, clock: number): boolean => {
        const at = tombs[id];
        if (!at) return true;
        return clock > (Date.parse(at) || 0);
    };

    const itemMap = new Map<string, SavedItem>();
    for (const it of a.items) itemMap.set(it.id, it);
    for (const it of b.items) {
        const existing = itemMap.get(it.id);
        if (!existing || itemClock(it) >= itemClock(existing)) itemMap.set(it.id, it);
    }
    const folderMap = new Map<string, LibraryFolder>();
    for (const f of a.folders) folderMap.set(f.id, f);
    for (const f of b.folders) {
        const existing = folderMap.get(f.id);
        if (!existing || folderClock(f) >= folderClock(existing)) folderMap.set(f.id, f);
    }

    // ACL de la biblioteca entera (v3): gana la del doc más reciente que la traiga.
    const aAt = Date.parse(a.updatedAt || "") || 0;
    const bAt = Date.parse(b.updatedAt || "") || 0;
    const acl = bAt >= aAt ? (b.acl ?? a.acl) : (a.acl ?? b.acl);

    return {
        items: Array.from(itemMap.values()).filter((it) => survives(deletedItems, it.id, itemClock(it))),
        folders: Array.from(folderMap.values()).filter((f) => survives(deletedFolders, f.id, folderClock(f))),
        rev: Math.max(a.rev, b.rev),
        updatedAt: new Date().toISOString(),
        version: DOC_VERSION,
        acl,
        deletedItems: pruneTombstones(deletedItems),
        deletedFolders: pruneTombstones(deletedFolders),
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

/**
 * Anuncia por BROADCAST que esta biblioteca cambió (tras un push con ÉXITO).
 * Llega a los demás dispositivos de la cuenta (canal `acct:<uid>`) y, por el
 * canal de entidad `ent:<kind>:<id>`, a las OTRAS cuentas con acceso (grupos,
 * páginas, comunidades…). No requiere DDL ni publicación `supabase_realtime`.
 *
 * `id` + `updatedAt` son la clave de deduplicación: el camino redundante de
 * postgres_changes (watchLibrary) construye exactamente la misma clave, así que
 * el cambio se procesa UNA sola vez llegue por donde llegue.
 */
function signalLibraryChange(ref: EntityRef, updatedAt?: string | null): void {
    try {
        void emitLiveChange(libraryTopic(ref), {
            id: `${ref.kind}:${ref.id}`,
            updatedAt: updatedAt ?? undefined,
            entity: { kind: ref.kind, id: ref.id },
        });
    } catch {
        /* best-effort: la señal nunca debe romper el guardado */
    }
}

/**
 * Sube el documento a la nube y DEVUELVE si lo consiguió. En fallo (offline,
 * sin sesión, RLS) encola la entidad en la cola de pendientes — la copia local
 * sigue siendo válida y el reintento automático la subirá en cuanto pueda.
 *
 * Adenda 66 §2: el motivo REAL del fallo ya no se traga. Se guarda en la cola
 * (`lastError`) y se emite `LIBRARY_PENDING_EVENT` para que la UI lo MUESTRE.
 * Si la nube rechaza algo, el usuario tiene que verlo — nunca un fallo mudo.
 */
async function pushCloud(
    ref: EntityRef,
    doc: EntityLibraryDoc,
    audit?: AuditEntry,
): Promise<{ ok: boolean; error?: string }> {
    try {
        const { row, error } = await setEntityStateChecked(ref, LIBRARY_KEY, doc);
        if (row) {
            clearPendingSync(ref);
            signalLibraryChange(ref, row.updated_at);
            // Historial en la nube (§2): cada guardado REAL crea una revisión.
            // No bloqueante: si el versionado falla, el guardado ya está hecho.
            if (audit) void recordLibraryVersion(ref, doc, audit);
            return { ok: true };
        }
        enqueuePendingSync(ref, error ?? "No se pudo guardar en la nube.");
        return { ok: false, error: error ?? "No se pudo guardar en la nube." };
    } catch (e) {
        const msg = (e as Error)?.message || "Error inesperado al guardar en la nube.";
        enqueuePendingSync(ref, msg);
        return { ok: false, error: msg };
    }
}

// ─────────────────────────── Historial en la nube (§2) ───────────────────────────

/** Qué cambió exactamente en esta escritura (alimenta `os_versions` y `os_access_log`). */
export interface AuditEntry {
    /** Acción legible en español ("Crear folder «Ideas»"). */
    message: string;
    /** Verbo para el registro: create · edit · rename · move · delete · tags · permisos… */
    action: string;
    /** Qué nodo cambió (para versionar el folder/archivo concreto, no solo la biblioteca). */
    node?: { kind: "folder" | "file"; id: string };
}

/**
 * Registra la revisión de este guardado. Versiona SIEMPRE la biblioteca entera
 * (snapshot del doc, que es la unidad real de `entity_state`) y, si el cambio
 * afectó a un folder o a un archivo concretos, ANOTA además su propia línea de
 * historial para que "Historial" sobre ese nodo tenga sentido.
 */
async function recordLibraryVersion(ref: EntityRef, doc: EntityLibraryDoc, audit: AuditEntry): Promise<void> {
    try {
        const snapshot = { items: doc.items, folders: doc.folders } as unknown as Record<string, unknown>;
        const serialized = JSON.stringify(snapshot);
        await recordVersion({
            kind: "library",
            resourceId: LIBRARY_KEY,
            ref,
            message: audit.message,
            snapshot,
            size: serialized.length,
            checksum: quickChecksum(serialized),
        });

        if (audit.node) {
            const nodeSnapshot: Record<string, unknown> =
                audit.node.kind === "folder"
                    ? { folder: doc.folders.find((f) => f.id === audit.node?.id) ?? null }
                    : { item: doc.items.find((it) => it.id === audit.node?.id) ?? null };
            const nodeSerialized = JSON.stringify(nodeSnapshot);
            await recordVersion({
                kind: audit.node.kind,
                resourceId: audit.node.id,
                ref,
                message: audit.message,
                snapshot: nodeSnapshot,
                size: nodeSerialized.length,
                checksum: quickChecksum(nodeSerialized),
            });
            void logAccess({
                kind: audit.node.kind,
                resourceId: audit.node.id,
                ref,
                action: audit.action,
                detail: { message: audit.message },
            });
        }

        void logAccess({
            kind: "library",
            resourceId: LIBRARY_KEY,
            ref,
            action: audit.action,
            detail: { message: audit.message },
        });
    } catch {
        /* el historial NUNCA impide guardar (§2: es una garantía, no un peaje) */
    }
}

// ─────────────────────────── Realtime compartido por entidad ───────────────────────────
// Un ÚNICO canal Supabase por entidad, compartido por refcount entre todos los
// consumidores montados (panel de biblioteca, tarjeta de perfil, explorador de
// /library, docks…). Al recibir un cambio remoto: merge LWW sobre la cache y
// emisión de eventos → todas las listas se actualizan EN VIVO sin recargar.

const activeWatchers = new Map<string, { count: number; unsub: () => void }>();

/**
 * Vigila en tiempo real la biblioteca de una entidad. Devuelve función de
 * limpieza. Reutiliza el canal si la entidad ya está vigilada (refcount).
 * SSR-safe: en el servidor es un no-op.
 *
 * DOS CAMINOS REDUNDANTES (Adenda 63 §4 · "Sync sin DDL: broadcast primero"):
 *   (a) BROADCAST — no requiere DDL ni la publicación `supabase_realtime`: es
 *       el camino que SIEMPRE funciona. Cubre otros dispositivos de la cuenta
 *       y otras cuentas con acceso a la entidad compartida.
 *   (b) postgres_changes — solo funciona si `entity_state` está en la
 *       publicación. Se mantiene porque sobrevive a reconexiones y a clientes
 *       que estaban cerrados cuando se emitió el broadcast.
 * Ambos se deduplican con la MISMA clave (`changeKey`), así que un cambio se
 * procesa una única vez aunque llegue por las dos vías.
 */
export function watchLibrary(ref: EntityRef): () => void {
    if (!isClient()) return () => {};
    const key = `${ref.kind}:${ref.id}`;
    const existing = activeWatchers.get(key);
    if (existing) {
        existing.count += 1;
    } else {
        const topic = libraryTopic(ref);

        /** Trae la versión de la nube y la funde con la cache local (LWW). */
        const pullAndMerge = async () => {
            const remote = await pullCloud(ref);
            if (!remote) return;
            const merged = mergeDocs(readCache(ref), remote);
            writeCache(ref, merged); // emite 'starseed:entitylib' + 'starseed:library-updated'
        };

        // (a) BROADCAST: señal → repull. `entity` hace que también escuchemos el
        //     canal de la entidad, así que los cambios de OTRAS cuentas con
        //     acceso (grupo/página/comunidad) también llegan en vivo aquí.
        const unsubLive = onLiveChange(topic, () => void pullAndMerge(), { entity: { kind: ref.kind, id: ref.id } });

        // (b) postgres_changes (redundante, requiere la migración de publicación).
        const unsubPg = subscribeEntityState<EntityLibraryDoc>(ref, LIBRARY_KEY, (change) => {
            if (change.self) return; // anti-eco: este dispositivo ya aplicó el cambio local
            // Si el mismo cambio ya entró por broadcast, no lo procesamos otra vez.
            if (!shouldProcessChange(changeKey(topic, key, change.updated_at))) return;
            const remote = normalizeDoc({
                ...change.value,
                rev: change.rev,
                updatedAt: change.updated_at,
            });
            const merged = mergeDocs(readCache(ref), remote);
            writeCache(ref, merged);
        });

        const unsub = () => {
            try {
                unsubLive();
            } catch {
                /* noop */
            }
            try {
                unsubPg();
            } catch {
                /* noop */
            }
        };
        activeWatchers.set(key, { count: 1, unsub });
    }
    // Al montar cualquier vigía: activa el reintento y aprovecha para vaciar pendientes.
    ensureRetryLoop();
    if (pendingSyncCount() > 0) void flushPendingLibrarySync();
    return () => {
        const w = activeWatchers.get(key);
        if (!w) return;
        w.count -= 1;
        if (w.count <= 0) {
            activeWatchers.delete(key);
            try {
                w.unsub();
            } catch {
                /* noop */
            }
        }
    };
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

/** Marca de tiempo del cambio actual (reloj LWW de los nodos tocados en esta mutación). */
function now(): string {
    return new Date().toISOString();
}

/** Aplica un parche a un ítem TOCANDO su reloj LWW (`updatedAt`). Usar SIEMPRE al editar. */
function touchItem(it: SavedItem, patch: Partial<SavedItem>, at: string): SavedItem {
    return { ...it, ...patch, updatedAt: at };
}

/** Aplica un parche a un folder TOCANDO su reloj LWW (`updatedAt`). Usar SIEMPRE al editar. */
function touchFolder(f: LibraryFolder, patch: Partial<LibraryFolder>, at: string): LibraryFolder {
    return { ...f, ...patch, updatedAt: at };
}

/**
 * Aplica un cambio: cache local (instantáneo, local-first) + subida a la nube en
 * segundo plano. Si `audit` viene, el guardado con éxito CREA UNA REVISIÓN en
 * `os_versions` y una entrada en `os_access_log` (Adenda 66 §2) — nunca bloquea.
 * Si la nube falla, `pushCloud` encola la entidad CON EL MOTIVO y el reintento
 * automático la sube; la UI muestra el error (nada de fallos mudos).
 */
async function mutate(
    ref: EntityRef,
    fn: (doc: EntityLibraryDoc) => EntityLibraryDoc,
    audit?: AuditEntry,
): Promise<EntityLibraryDoc> {
    const current = readCache(ref);
    const next = fn(current);
    writeCache(ref, next);
    void pushCloud(ref, next, audit);
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
    const at = now();
    let resultId = "";
    await mutate(
        ref,
        (doc) => {
            const existing = doc.items.find((it) => dedupOf(it) === key);
            if (existing) {
                resultId = existing.id;
                // Ya guardado: solo actualiza carpeta/nota si se pasaron explícitamente.
                const next = doc.items.map((it) =>
                    it.id === existing.id
                        ? touchItem(
                              it,
                              {
                                  folderId: folderId !== undefined ? folderId : it.folderId,
                                  note: item.note !== undefined ? item.note : it.note,
                              },
                              at,
                          )
                        : it,
                );
                return { ...doc, items: next, updatedAt: at };
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
                addedAt: at,
                addedBy: who,
                mime: item.mime,
                thumbnail: item.thumbnail,
                content: item.content,
                language: item.language,
                description: item.description,
                connectedRepo: item.connectedRepo,
                updatedAt: at,
            };
            resultId = entry.id;
            // La lápida de un id reutilizado se levanta: este ítem vuelve a existir.
            const deletedItems = { ...(doc.deletedItems ?? {}) };
            delete deletedItems[entry.id];
            return { ...doc, items: [entry, ...doc.items], deletedItems, updatedAt: at };
        },
        { message: `Guardar «${item.title}»`, action: "create" },
    );
    return { ok: true, id: resultId };
}

// ─────────────────────────── Seguridad al guardar/compartir/instalar (Adenda 63 §13) ───────────────────────────

/**
 * Escanea los CAMPOS DE TEXTO de un ítem (título, nota, contenido, url,
 * descripción) en busca de secretos/PII. Nunca lanza; devuelve [] si no hay nada.
 */
export function scanItemInput(item: Partial<SaveItemInput> | Partial<SavedItem>): Finding[] {
    try {
        return scanDeep({
            title: item?.title ?? "",
            note: item?.note ?? "",
            content: item?.content ?? "",
            url: item?.url ?? "",
            description: item?.description ?? "",
        });
    } catch {
        return [];
    }
}

export interface SecureSaveResult {
    ok: boolean;
    id: string;
    /** TODOS los hallazgos detectados (aunque no se hayan redactado). */
    findings: Finding[];
    /** Nº de secretos críticos redactados antes de guardar. */
    redactedCount: number;
    /** Aviso en español para que la UI confirme/informe (undefined = limpio). */
    aviso?: string;
}

/**
 * GUARDAR/COMPARTIR con verificación (estilo Strix): escanea los campos de
 * texto del ítem y, por defecto, REDACTA los hallazgos de severidad `critical`
 * (claves API, service_role, cadenas de conexión…) sustituyéndolos por
 * «[REDACTADO:tipo]». No bloquea nunca en silencio: siempre guarda y devuelve
 * los `findings` para que la UI informe/confirme. Con `allowCritical: true`
 * ("compartir igualmente", decisión explícita) guarda el contenido intacto.
 */
export async function saveItemSecure(
    ref: EntityRef,
    item: SaveItemInput,
    folderId?: string | null,
    opts?: { allowCritical?: boolean },
): Promise<SecureSaveResult> {
    let toSave = item;
    let findings: Finding[] = [];
    let redactedCount = 0;
    try {
        findings = scanItemInput(item);
        if (findings.length && !opts?.allowCritical) {
            const redactField = (v: string | undefined) => {
                if (!v) return { v, n: 0 };
                const r = redactText(v, { minSeverity: "critical" });
                return { v: r.text, n: r.redactedCount };
            };
            const title = redactField(item.title);
            const note = redactField(item.note);
            const content = redactField(item.content);
            const url = redactField(item.url);
            const description = redactField(item.description);
            redactedCount = title.n + note.n + content.n + url.n + description.n;
            if (redactedCount > 0) {
                toSave = {
                    ...item,
                    title: title.v ?? item.title,
                    note: note.v,
                    content: content.v,
                    url: url.v,
                    description: description.v,
                };
            }
        }
    } catch {
        /* el escaneo JAMÁS impide guardar */
    }
    const res = await saveItem(ref, toSave, folderId);
    const s = summarize(findings);
    return {
        ...res,
        findings,
        redactedCount,
        aviso: s.clean
            ? undefined
            : redactedCount > 0
              ? `Se redactaron ${redactedCount} dato(s) crítico(s) antes de guardar (puedes rehacerlo con «compartir igualmente»). ${s.message}`
              : opts?.allowCritical
                ? `Guardado SIN redactar por decisión explícita. ${s.message}`
                : `Este ítem contiene datos sensibles: ${s.message}`,
    };
}

/**
 * IMPORTAR/INSTALAR con verificación: mismo contrato que `saveItemSecure`
 * (alias semántico para instalaciones desde bibliotecas compartidas o la
 * Librería). Escanea, redacta `critical` por defecto y devuelve los hallazgos.
 */
export async function importItemSecure(
    ref: EntityRef,
    item: SaveItemInput,
    folderId?: string | null,
    opts?: { allowCritical?: boolean },
): Promise<SecureSaveResult> {
    return saveItemSecure(ref, item, folderId, opts);
}

/**
 * Quita un ítem. Deja LÁPIDA (`deletedItems`) para que el borrado VIAJE a los
 * demás dispositivos: sin ella, el merge (unión) lo resucitaba desde la caché
 * del otro dispositivo y el borrado no se propagaba nunca (Adenda 66 §2).
 */
export async function removeItem(ref: EntityRef, itemId: string): Promise<void> {
    const at = now();
    const title = readCache(ref).items.find((it) => it.id === itemId)?.title ?? itemId;
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            items: doc.items.filter((it) => it.id !== itemId),
            deletedItems: withTombstone(doc.deletedItems, itemId, at),
            updatedAt: at,
        }),
        { message: `Quitar «${title}»`, action: "delete", node: { kind: "file", id: itemId } },
    );
}

export async function moveItem(
    ref: EntityRef,
    itemId: string,
    folderId: string | null,
): Promise<void> {
    const at = now();
    const title = readCache(ref).items.find((it) => it.id === itemId)?.title ?? itemId;
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            items: doc.items.map((it) => (it.id === itemId ? touchItem(it, { folderId }, at) : it)),
            updatedAt: at,
        }),
        { message: `Mover «${title}»`, action: "move", node: { kind: "file", id: itemId } },
    );
}

export async function createFolder(ref: EntityRef, name: string, parentId: string | null = null): Promise<string> {
    const who = (await currentUserRef())?.id ?? "anon";
    const at = now();
    let newId = "";
    const trimmed = name.trim() || "Folder";
    await mutate(
        ref,
        (doc) => {
            const dup = doc.folders.find((f) => f.parentId === parentId && f.name.toLowerCase() === trimmed.toLowerCase());
            if (dup) {
                newId = dup.id;
                return doc;
            }
            const folder: LibraryFolder = {
                id: makeId("folder"),
                name: trimmed,
                parentId,
                createdAt: at,
                createdBy: who,
                updatedAt: at,
            };
            newId = folder.id;
            const deletedFolders = { ...(doc.deletedFolders ?? {}) };
            delete deletedFolders[folder.id];
            return { ...doc, folders: [...doc.folders, folder], deletedFolders, updatedAt: at };
        },
        { message: `Crear folder «${trimmed}»`, action: "create" },
    );
    return newId;
}

export async function renameFolder(ref: EntityRef, folderId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const at = now();
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            folders: doc.folders.map((f) => (f.id === folderId ? touchFolder(f, { name: trimmed }, at) : f)),
            updatedAt: at,
        }),
        { message: `Renombrar folder a «${trimmed}»`, action: "rename", node: { kind: "folder", id: folderId } },
    );
}

/**
 * Elimina un folder; sus items pasan a la raíz (folderId=null), nunca se borran
 * referencias. Deja LÁPIDA del folder para que el borrado se propague.
 */
export async function removeFolder(ref: EntityRef, folderId: string): Promise<void> {
    const at = now();
    const name = readCache(ref).folders.find((f) => f.id === folderId)?.name ?? folderId;
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            folders: doc.folders.filter((f) => f.id !== folderId),
            items: doc.items.map((it) => (it.folderId === folderId ? touchItem(it, { folderId: null }, at) : it)),
            deletedFolders: withTombstone(doc.deletedFolders, folderId, at),
            updatedAt: at,
        }),
        { message: `Eliminar folder «${name}»`, action: "delete", node: { kind: "folder", id: folderId } },
    );
}

/**
 * Mueve/re-anida un folder bajo otro (o a la raíz con `parentId=null`).
 * Rechaza en silencio (no-op) si el destino crearía un ciclo (mover un folder
 * dentro de sí mismo o de uno de sus propios descendientes).
 */
export async function moveFolder(ref: EntityRef, folderId: string, parentId: string | null): Promise<void> {
    const at = now();
    const name = readCache(ref).folders.find((f) => f.id === folderId)?.name ?? folderId;
    await mutate(
        ref,
        (doc) => {
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
                folders: doc.folders.map((f) => (f.id === folderId ? touchFolder(f, { parentId }, at) : f)),
                updatedAt: at,
            };
        },
        { message: `Mover folder «${name}»`, action: "move", node: { kind: "folder", id: folderId } },
    );
}

/** Sustituye por completo las etiquetas de un ítem. */
export async function setItemTags(ref: EntityRef, itemId: string, tags: string[]): Promise<void> {
    const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
    const at = now();
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            items: doc.items.map((it) => (it.id === itemId ? touchItem(it, { tags: cleaned }, at) : it)),
            updatedAt: at,
        }),
        { message: `Etiquetas: ${cleaned.join(", ") || "(ninguna)"}`, action: "tags", node: { kind: "file", id: itemId } },
    );
}

/** Establece (sustituye) la ACL de lectura/escritura de un ítem. `null` limpia la ACL (sin restricción, v1). */
export async function setItemAcl(ref: EntityRef, itemId: string, acl: ItemACL | null): Promise<void> {
    const at = now();
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            items: doc.items.map((it) => (it.id === itemId ? touchItem(it, { acl: acl ?? undefined }, at) : it)),
            updatedAt: at,
        }),
        { message: "Cambiar permisos del ítem", action: "permisos", node: { kind: "file", id: itemId } },
    );
}

/** Establece (sustituye) la ACL de un folder. `null` limpia la ACL. */
export async function setFolderAcl(ref: EntityRef, folderId: string, acl: ItemACL | null): Promise<void> {
    const at = now();
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            folders: doc.folders.map((f) => (f.id === folderId ? touchFolder(f, { acl: acl ?? undefined }, at) : f)),
            updatedAt: at,
        }),
        { message: "Cambiar permisos del folder", action: "permisos", node: { kind: "folder", id: folderId } },
    );
}

/**
 * v3 (Adenda 66 §3): establece (sustituye) la ACL de la BIBLIOTECA ENTERA — el
 * nodo raíz del que heredan folders e ítems. `null` la limpia (vuelve a ser
 * privada de su entidad dueña). Es la ACL que la RLS de `entity_state` lee en
 * `value->'acl'`.
 */
export async function setLibraryAcl(ref: EntityRef, acl: ItemACL | null): Promise<void> {
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            acl: acl ?? undefined,
            updatedAt: now(),
        }),
        { message: "Cambiar permisos de la biblioteca", action: "permisos" },
    );
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
    const at = now();
    let newId = "";
    await mutate(
        ref,
        (doc) => {
            const target = doc.items.find((it) => it.id === targetItemId);
            if (!target) return doc;
            const alias: SavedItem = {
                id: makeId("alias"),
                type: "alias",
                title: target.title,
                tags: [],
                folderId,
                addedAt: at,
                addedBy: who,
                targetItemId,
                updatedAt: at,
            };
            newId = alias.id;
            return { ...doc, items: [alias, ...doc.items], updatedAt: at };
        },
        { message: "Crear acceso directo", action: "create" },
    );
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
    const at = now();
    let newId = "";
    await mutate(
        ref,
        (doc) => {
            const source = doc.items.find((it) => it.id === sourceItemId);
            if (!source) return doc;
            const branch: SavedItem = {
                ...source,
                id: makeId("branch"),
                type: "branch",
                folderId,
                addedAt: at,
                addedBy: who,
                refKind: source.type,
                refId2: source.refId ?? source.id,
                // v2.1 (§14): lineage local sin ambigüedad — ver branchesOf()/mergeBranch() en finder-types.ts.
                branchOf: source.id,
                // La rama nace con su propia ACL/historial (no hereda restricciones ni versiones del origen).
                acl: undefined,
                versions: undefined,
                updatedAt: at,
            };
            newId = branch.id;
            return { ...doc, items: [branch, ...doc.items], updatedAt: at };
        },
        { message: "Replicar (rama)", action: "branch" },
    );
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
    const at = now();
    let newId = "";
    await mutate(
        ref,
        (doc) => {
            const source = doc.items.find((it) => it.id === sourceItemId);
            if (!source) return doc;
            const copy: SavedItem = {
                ...source,
                id: makeId("item"),
                folderId,
                addedAt: at,
                addedBy: who,
                acl: undefined, // la copia nace sin restricciones propias
                versions: undefined, // ni con el historial de ediciones del origen
                branchOf: undefined,
                updatedAt: at,
            };
            newId = copy.id;
            return { ...doc, items: [copy, ...doc.items], updatedAt: at };
        },
        { message: "Duplicar ítem", action: "create" },
    );
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
    const at = now();
    let ok = false;
    let title = itemId;
    await mutate(
        ref,
        (doc) => {
            const item = doc.items.find((it) => it.id === itemId);
            if (!item) return doc;
            ok = true;
            title = item.title;
            const changed = versionableFieldsChanged(item, patch);
            const versions = changed
                ? [snapshotVersion(item, who, opts?.label), ...(item.versions ?? [])].slice(0, MAX_ITEM_VERSIONS)
                : item.versions;
            const nextItem: SavedItem = touchItem(item, { ...patch, versions }, at);
            return {
                ...doc,
                items: doc.items.map((it) => (it.id === itemId ? nextItem : it)),
                updatedAt: at,
            };
        },
        { message: opts?.label ?? `Editar «${title}»`, action: "edit", node: { kind: "file", id: itemId } },
    );
    return { ok };
}

/** Restaura una versión anterior. Snapshotea el estado ACTUAL antes (para poder deshacer la restauración). */
export async function restoreItemVersion(ref: EntityRef, itemId: string, versionId: string): Promise<{ ok: boolean }> {
    const who = (await currentUserRef())?.id ?? "anon";
    const at = now();
    let ok = false;
    await mutate(
        ref,
        (doc) => {
            const item = doc.items.find((it) => it.id === itemId);
            if (!item) return doc;
            const version = (item.versions ?? []).find((v) => v.id === versionId);
            if (!version) return doc;
            ok = true;
            const preRestoreSnapshot = snapshotVersion(item, who, "antes de restaurar");
            const nextItem: SavedItem = touchItem(
                item,
                {
                    title: version.title,
                    note: version.note,
                    content: version.content,
                    url: version.url,
                    mime: version.mime,
                    language: version.language,
                    description: version.description,
                    versions: [preRestoreSnapshot, ...(item.versions ?? [])].slice(0, MAX_ITEM_VERSIONS),
                },
                at,
            );
            return {
                ...doc,
                items: doc.items.map((it) => (it.id === itemId ? nextItem : it)),
                updatedAt: at,
            };
        },
        { message: "Restaurar versión anterior", action: "restore", node: { kind: "file", id: itemId } },
    );
    return { ok };
}

/**
 * Aplica al ítem el SNAPSHOT de una revisión de `os_versions` (historial en la
 * nube, Adenda 66 §2). Complementa `restoreItemVersion` (snapshots locales):
 * `restoreVersion()` de versions.ts devuelve el snapshot y esto lo escribe en la
 * biblioteca, con lo que la restauración también se propaga a todos los dispositivos.
 */
export async function applyItemSnapshot(
    ref: EntityRef,
    itemId: string,
    snapshot: Record<string, unknown> | null | undefined,
): Promise<{ ok: boolean }> {
    const raw = (snapshot?.item ?? null) as Partial<SavedItem> | null;
    if (!raw) return { ok: false };
    const at = now();
    let ok = false;
    await mutate(
        ref,
        (doc) => {
            const item = doc.items.find((it) => it.id === itemId);
            if (!item) return doc;
            ok = true;
            const nextItem = touchItem(
                item,
                {
                    title: raw.title ?? item.title,
                    note: raw.note,
                    content: raw.content,
                    url: raw.url,
                    mime: raw.mime,
                    language: raw.language,
                    description: raw.description,
                    tags: Array.isArray(raw.tags) ? raw.tags : item.tags,
                },
                at,
            );
            return {
                ...doc,
                items: doc.items.map((it) => (it.id === itemId ? nextItem : it)),
                updatedAt: at,
            };
        },
        { message: "Restaurar revisión del historial", action: "restore", node: { kind: "file", id: itemId } },
    );
    return { ok };
}

/** Aplica al folder el SNAPSHOT de una revisión de `os_versions` (nombre/ubicación/ACL/repo). */
export async function applyFolderSnapshot(
    ref: EntityRef,
    folderId: string,
    snapshot: Record<string, unknown> | null | undefined,
): Promise<{ ok: boolean }> {
    const raw = (snapshot?.folder ?? null) as Partial<LibraryFolder> | null;
    if (!raw) return { ok: false };
    const at = now();
    let ok = false;
    await mutate(
        ref,
        (doc) => {
            const folder = doc.folders.find((f) => f.id === folderId);
            if (!folder) return doc;
            ok = true;
            const nextFolder = touchFolder(
                folder,
                {
                    name: raw.name ?? folder.name,
                    parentId: raw.parentId ?? null,
                    category: raw.category,
                    acl: raw.acl,
                    repo: raw.repo,
                },
                at,
            );
            return {
                ...doc,
                folders: doc.folders.map((f) => (f.id === folderId ? nextFolder : f)),
                updatedAt: at,
            };
        },
        { message: "Restaurar revisión del folder", action: "restore", node: { kind: "folder", id: folderId } },
    );
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
    const at = now();
    let result: { ok: boolean; originId?: string; message?: string } = { ok: false, message: "No se encontró la rama." };
    await mutate(
        ref,
        (doc) => {
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
            const mergedOrigin: SavedItem = touchItem(
                origin,
                {
                    title: branch.title,
                    note: branch.note,
                    content: branch.content,
                    url: branch.url,
                    mime: branch.mime,
                    language: branch.language,
                    description: branch.description,
                    tags: branch.tags,
                    versions: [originSnapshot, ...(origin.versions ?? [])].slice(0, MAX_ITEM_VERSIONS),
                },
                at,
            );
            let items = doc.items.map((it) => (it.id === origin.id ? mergedOrigin : it));
            let deletedItems = doc.deletedItems;
            if (opts?.removeBranchAfter) {
                items = items.filter((it) => it.id !== branchItemId);
                deletedItems = withTombstone(doc.deletedItems, branchItemId, at);
            }
            result = { ok: true, originId: origin.id };
            return { ...doc, items, deletedItems, updatedAt: at };
        },
        { message: "Fusionar rama con su origen", action: "merge" },
    );
    return result;
}

// ─────────────────────────── Repositorios: folder-repo (§16) ───────────────────────────

/** Establece (sustituye) los metadatos de repositorio de un folder. `null` lo des-marca como repo. */
export async function setFolderRepoMeta(ref: EntityRef, folderId: string, repo: RepoMeta | null): Promise<void> {
    const at = now();
    await mutate(
        ref,
        (doc) => ({
            ...doc,
            folders: doc.folders.map((f) => (f.id === folderId ? touchFolder(f, { repo: repo ?? undefined }, at) : f)),
            updatedAt: at,
        }),
        { message: repo ? "Actualizar repositorio" : "Des-marcar como repositorio", action: "edit", node: { kind: "folder", id: folderId } },
    );
}

// ─────────────────────────── Repos externos conectados (§17) ───────────────────────────

/** Guarda una referencia (ítem `type:"repo"`) a un repo GIT externo, con su ficha cacheada. */
export async function addConnectedRepoItem(
    ref: EntityRef,
    meta: ConnectedRepoMeta,
    folderId: string | null = null,
): Promise<{ ok: boolean; id: string }> {
    const who = (await currentUserRef())?.id ?? "anon";
    const at = now();
    let newId = "";
    await mutate(
        ref,
        (doc) => {
            const item: SavedItem = {
                id: makeId("repo"),
                type: "repo",
                title: meta.fullName,
                url: meta.htmlUrl,
                tags: meta.topics.slice(0, 8),
                folderId,
                addedAt: at,
                addedBy: who,
                description: meta.description,
                connectedRepo: meta,
                updatedAt: at,
            };
            newId = item.id;
            return { ...doc, items: [item, ...doc.items], updatedAt: at };
        },
        { message: `Conectar repo «${meta.fullName}»`, action: "create" },
    );
    return { ok: !!newId, id: newId };
}

/** Re-sincroniza los metadatos cacheados de un repo conectado ("Sincronizar metadatos"). */
export async function resyncConnectedRepoItem(
    ref: EntityRef,
    itemId: string,
    meta: ConnectedRepoMeta,
): Promise<{ ok: boolean }> {
    const at = now();
    let ok = false;
    await mutate(
        ref,
        (doc) => {
            const item = doc.items.find((it) => it.id === itemId);
            if (!item || item.type !== "repo") return doc;
            ok = true;
            const next: SavedItem = touchItem(
                item,
                {
                    title: meta.fullName,
                    url: meta.htmlUrl,
                    description: meta.description,
                    connectedRepo: meta,
                },
                at,
            );
            return { ...doc, items: doc.items.map((it) => (it.id === itemId ? next : it)), updatedAt: at };
        },
        { message: `Sincronizar metadatos de «${meta.fullName}»`, action: "edit", node: { kind: "file", id: itemId } },
    );
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
    /** v3 (§3): ACL de la biblioteca entera (nodo raíz de la herencia). */
    setLibraryAcl: (acl: ItemACL | null) => Promise<void>;
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
        // Canal realtime COMPARTIDO por entidad (refcount): merge remoto → cache
        // → evento → subscribeCache re-lee. Todas las vistas se actualizan en vivo.
        const unsubRemote = watchLibrary(ref);

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
    const boundSetLibraryAcl = useCallback(
        (acl: ItemACL | null) => (ref ? setLibraryAcl(ref, acl) : Promise.resolve()),
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
        setLibraryAcl: boundSetLibraryAcl,
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

// ─────────────────────────── Hook de pendientes de sincronizar ───────────────────────────

export interface UseLibraryPendingSync {
    /** true si ESTA biblioteca (ref) tiene cambios sin subir a la nube. */
    pending: boolean;
    /** Nº total de bibliotecas con cambios pendientes (todas las entidades). */
    count: number;
    /**
     * MOTIVO del último rechazo de la nube (RLS, sin sesión, red…), o null.
     * Adenda 66 §2: si la nube rechaza algo, el usuario TIENE que verlo.
     */
    error: string | null;
    /** Fuerza un reintento inmediato de subida. */
    retryNow: () => void;
}

/**
 * Estado reactivo de la cola de pendientes (para avisos honestos en la UI:
 * "cambios pendientes de sincronizar" + el motivo real del fallo). SSR-safe.
 */
export function useLibraryPendingSync(ref: EntityRef | null): UseLibraryPendingSync {
    const [count, setCount] = useState(0);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refKind = ref?.kind ?? "";
    const refId = ref?.id ?? "";

    useEffect(() => {
        if (!isClient()) return;
        const update = () => {
            setCount(pendingSyncCount());
            const thisRef = refKind && refId ? { kind: refKind as SyncEntityKind, id: refId } : null;
            setPending(thisRef ? hasPendingSync(thisRef) : false);
            setError(thisRef ? lastSyncError(thisRef) : null);
        };
        update();
        window.addEventListener(LIBRARY_PENDING_EVENT, update);
        window.addEventListener("online", update);
        window.addEventListener("storage", update);
        return () => {
            window.removeEventListener(LIBRARY_PENDING_EVENT, update);
            window.removeEventListener("online", update);
            window.removeEventListener("storage", update);
        };
    }, [refKind, refId]);

    const retryNow = useCallback(() => {
        void flushPendingLibrarySync();
    }, []);

    return { pending, count, error, retryNow };
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
