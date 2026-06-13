// ════════════════════════════════════════════════════════════════
// StarSeed — Sincronización y compartición de widgets (Biblioteca)
// ----------------------------------------------------------------
// Permite publicar un widget a la biblioteca en línea, sincronizarlo,
// compartirlo entre usuarios, replicar cualquier entidad de la red
// (Lienzo Universal: se referencia, no se duplica), y abrir sesiones
// de edición compartida o bloqueada.
//
// PRINCIPIO CONSTITUCIONAL (invariante): las entidades de la red y los
// datos de OTROS usuarios son inmutables salvo permiso explícito. La
// réplica crea una *referencia* local editable que apunta a la entidad
// origen; nunca altera el original.
//
// Source-agnostic: hoy persiste en localStorage y emite eventos. Una
// capa real (Supabase / IPFS / federación ActivityPub) puede sustituir
// `transport` sin tocar los consumidores (registerSyncTransport).
// ════════════════════════════════════════════════════════════════

import type { WidgetType } from "@/components/dashboard/dashboard-types";

export type ShareVisibility = "privado" | "enlace" | "red";
export type EditMode = "bloqueado" | "compartido";

export interface SharedWidgetMeta {
    /** id de la entidad en la biblioteca (Lienzo Universal) */
    entityId: string;
    widgetType: WidgetType;
    title: string;
    description?: string;
    author: string;            // handle del autor (origen)
    authorDid?: string;        // identidad descentralizada opcional
    visibility: ShareVisibility;
    editMode: EditMode;
    /** true si esta instancia es una réplica que referencia a un origen de la red */
    isReplica: boolean;
    /** entityId del origen si es réplica (la entidad referenciada, inmutable) */
    sourceEntityId?: string;
    /** ¿el contenido proviene de la red (no editable salvo permiso)? */
    networkLocked: boolean;
    settings: Record<string, unknown>;
    version: number;
    createdTs: number;
    updatedTs: number;
}

export interface CollabSession {
    entityId: string;
    mode: EditMode;
    participants: { handle: string; role: "owner" | "editor" | "viewer" }[];
    lockedBy?: string;         // handle que tiene el lock si editMode = "bloqueado"
    startedTs: number;
}

const LS_LIBRARY = "starseed_widget_library_v1";   // entidades publicadas/replicadas localmente
const LS_SESSIONS = "starseed_widget_sessions_v1"; // sesiones de edición activas

// ── Transport (intercambiable por red real) ────────────────────
export interface SyncTransport {
    publish(meta: SharedWidgetMeta): Promise<void>;
    pull(entityId: string): Promise<SharedWidgetMeta | null>;
    list(): Promise<SharedWidgetMeta[]>;
}

// Transport por defecto: local (simula la biblioteca en línea).
const localTransport: SyncTransport = {
    async publish(meta) { upsertLocal(meta); },
    async pull(entityId) { return readLibrary().find((m) => m.entityId === entityId) ?? null; },
    async list() { return readLibrary(); },
};

let transport: SyncTransport = localTransport;
export function registerSyncTransport(t: SyncTransport) { transport = t; }

// ── helpers locales ─────────────────────────────────────────────
function readLibrary(): SharedWidgetMeta[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(LS_LIBRARY) || "[]"); } catch { return []; }
}
function writeLibrary(items: SharedWidgetMeta[]) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(LS_LIBRARY, JSON.stringify(items));
        window.dispatchEvent(new CustomEvent("starseed:widget-library-changed"));
    } catch { /* noop */ }
}
function upsertLocal(meta: SharedWidgetMeta) {
    const items = readLibrary();
    const i = items.findIndex((m) => m.entityId === meta.entityId);
    if (i >= 0) items[i] = meta; else items.push(meta);
    writeLibrary(items);
}
function uid(prefix: string) {
    return `${prefix}-${(typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

// ── API pública ─────────────────────────────────────────────────

/** Publica un widget del usuario a la biblioteca en línea (Lienzo Universal). */
export async function shareWidget(args: {
    widgetType: WidgetType;
    title: string;
    description?: string;
    author: string;
    visibility?: ShareVisibility;
    editMode?: EditMode;
    settings?: Record<string, unknown>;
}): Promise<SharedWidgetMeta> {
    const now = Date.now();
    const meta: SharedWidgetMeta = {
        entityId: uid("ent"),
        widgetType: args.widgetType,
        title: args.title,
        description: args.description,
        author: args.author,
        visibility: args.visibility ?? "enlace",
        editMode: args.editMode ?? "bloqueado",
        isReplica: false,
        networkLocked: false,           // es del usuario: editable por él
        settings: args.settings ?? {},
        version: 1,
        createdTs: now,
        updatedTs: now,
    };
    await transport.publish(meta);
    return meta;
}

/**
 * Replica cualquier entidad de la red en el entorno del usuario.
 * Crea una REFERENCIA local (no duplica ni altera el origen). El contenido
 * de red queda `networkLocked` salvo que el origen permita edición compartida.
 */
export async function replicateEntity(sourceEntityId: string, asUser: string): Promise<SharedWidgetMeta | null> {
    const source = await transport.pull(sourceEntityId);
    if (!source) return null;
    const now = Date.now();
    const replica: SharedWidgetMeta = {
        ...source,
        entityId: uid("rep"),
        isReplica: true,
        sourceEntityId: source.entityId,
        author: asUser,
        // si el origen es de la red y no es edición compartida → bloqueado
        networkLocked: source.visibility === "red" && source.editMode !== "compartido",
        version: source.version,
        createdTs: now,
        updatedTs: now,
    };
    upsertLocal(replica);
    return replica;
}

/** Sincroniza una réplica con su entidad origen (trae cambios; respeta inmutabilidad). */
export async function syncReplica(entityId: string): Promise<SharedWidgetMeta | null> {
    const items = readLibrary();
    const local = items.find((m) => m.entityId === entityId);
    if (!local?.sourceEntityId) return local ?? null;
    const source = await transport.pull(local.sourceEntityId);
    if (!source) return local;
    // Singularidad del contenido: la referencia refleja la última versión del origen.
    const updated: SharedWidgetMeta = {
        ...local,
        title: source.title,
        description: source.description,
        settings: source.networkLocked || local.networkLocked ? source.settings : local.settings,
        version: source.version,
        updatedTs: Date.now(),
    };
    upsertLocal(updated);
    return updated;
}

/** Abre (o reanuda) una sesión de edición compartida o bloqueada. */
export function openCollabSession(entityId: string, mode: EditMode, me: string): CollabSession {
    const sessions = readSessions();
    let s = sessions.find((x) => x.entityId === entityId);
    if (!s) {
        s = { entityId, mode, participants: [{ handle: me, role: "owner" }], startedTs: Date.now() };
        sessions.push(s);
    } else {
        s.mode = mode;
        if (!s.participants.some((p) => p.handle === me)) s.participants.push({ handle: me, role: "editor" });
    }
    if (mode === "bloqueado") s.lockedBy = me;
    writeSessions(sessions);
    return s;
}

/** ¿Puede el usuario editar ahora esta entidad? Aplica límites de red y locks. */
export function canEditEntity(entityId: string, me: string): boolean {
    const meta = readLibrary().find((m) => m.entityId === entityId);
    if (meta?.networkLocked) return false;     // contenido de la red: inmutable salvo permiso
    const s = readSessions().find((x) => x.entityId === entityId);
    if (!s) return true;
    if (s.mode === "bloqueado") return s.lockedBy === me;
    return true;                                // edición compartida: todos pueden
}

export function closeCollabSession(entityId: string) {
    writeSessions(readSessions().filter((s) => s.entityId !== entityId));
}

export async function listLibrary(): Promise<SharedWidgetMeta[]> {
    return transport.list();
}

function readSessions(): CollabSession[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(LS_SESSIONS) || "[]"); } catch { return []; }
}
function writeSessions(items: CollabSession[]) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(LS_SESSIONS, JSON.stringify(items));
        window.dispatchEvent(new CustomEvent("starseed:widget-sessions-changed"));
    } catch { /* noop */ }
}
