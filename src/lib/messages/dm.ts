"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Mensajes (os_dm_threads / os_dm_members / os_dm_messages)
 * ---------------------------------------------------------------------------
 * Capa de datos REAL para la mensajería estilo WhatsApp/Telegram: DMs y grupos,
 * adjuntos de cualquier formato, responder-citando, editar/borrar propios,
 * Aurora opcional por hilo. Backend YA APLICADO en Supabase (dzkjapinnewkxzjltadv):
 *
 *   os_dm_threads(id, kind 'dm'|'group', title, avatar_url, created_by,
 *                 agent jsonb, meta jsonb, last_msg_at, created_at)
 *   os_dm_members(thread_id, user_id, role, joined_at)
 *   os_dm_messages(id, thread_id, sender, body, attachments jsonb[], reply_to,
 *                  kind 'user'|'agent'|'system', edited_at, deleted, created_at)
 *
 * RLS por membresía (is_dm_member security definer); realtime ON en threads y
 * messages. ADITIVO: coexiste con `src/lib/messages/messages-store.ts` (tablas
 * legacy `conversations`/`messages`) sin tocarlo — es una superficie distinta.
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada a []/null sin sesión/red.
 * SOP: architecture/libreria-biblioteca-sync.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export type ThreadKind = "dm" | "group";
export type MessageKind = "user" | "agent" | "system";

/** Configuración de Aurora opcional para un hilo (thread.agent jsonb). */
export interface ThreadAgentConfig {
    enabled: boolean;
    /** Nombre visible del agente en el hilo (por defecto "Aurora"). */
    name?: string;
    /** Persona/tono opcional que se antepone al contexto al invocarla. */
    persona?: string;
    /** Auto-responder mensajes que mencionen @aurora (por defecto true si enabled). */
    autoReplyOnMention?: boolean;
}

export interface DmThread {
    id: string;
    kind: ThreadKind;
    title: string | null;
    avatarUrl: string | null;
    createdBy: string | null;
    agent: ThreadAgentConfig | null;
    meta: Record<string, unknown> | null;
    lastMsgAt: string | null;
    createdAt: string;
}

export interface DmMember {
    threadId: string;
    userId: string;
    role: string;
    joinedAt: string;
}

/** Adjunto de cualquier formato: dataURL inline (pequeño) o referencia/enlace. */
export interface DmAttachment {
    kind: "image" | "audio" | "video" | "file" | "ref" | string;
    /** Nombre legible del adjunto. */
    name?: string;
    /** MIME type si se conoce. */
    mime?: string;
    /** dataURL (solo adjuntos pequeños) o URL remota. */
    url?: string;
    /** Tamaño en bytes si se conoce (informativo). */
    size?: number;
    /** Referencia a otra entidad del sistema (paquete/publicación/servidor…). */
    refKind?: "package" | "post" | "server" | "file" | "route" | string;
    refId?: string;
    /** Ruta in-app de la referencia (para renderizar el enlace directamente). */
    route?: string;
}

export interface DmMessage {
    id: string;
    threadId: string;
    sender: string | null;
    body: string;
    attachments: DmAttachment[];
    replyTo: string | null;
    kind: MessageKind;
    editedAt: string | null;
    deleted: boolean;
    createdAt: string;
}

/** Hilo enriquecido con último mensaje + contador de no-leídos (para la lista). */
export interface DmThreadSummary extends DmThread {
    lastMessage: DmMessage | null;
    unreadCount: number;
    /** Miembros del hilo (perfiles resueltos aparte por el llamador si hace falta). */
    memberIds: string[];
}

/* ────────────────────────────── Helpers ────────────────────────────────── */

interface ThreadRow {
    id: string;
    kind: string;
    title: string | null;
    avatar_url: string | null;
    created_by: string | null;
    agent: unknown;
    meta: unknown;
    last_msg_at: string | null;
    created_at: string;
}

interface MessageRow {
    id: string;
    thread_id: string;
    sender: string | null;
    body: string | null;
    attachments: unknown;
    reply_to: string | null;
    kind: string | null;
    edited_at: string | null;
    deleted: boolean | null;
    created_at: string;
}

function normalizeAgent(raw: unknown): ThreadAgentConfig | null {
    if (!raw || typeof raw !== "object") return null;
    const a = raw as Record<string, unknown>;
    if (typeof a.enabled !== "boolean") return null;
    return {
        enabled: a.enabled,
        name: typeof a.name === "string" ? a.name : "Aurora",
        persona: typeof a.persona === "string" ? a.persona : undefined,
        autoReplyOnMention: a.autoReplyOnMention !== false,
    };
}

function normalizeThread(row: ThreadRow): DmThread {
    return {
        id: row.id,
        kind: row.kind === "group" ? "group" : "dm",
        title: row.title,
        avatarUrl: row.avatar_url,
        createdBy: row.created_by,
        agent: normalizeAgent(row.agent),
        meta: (row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {}) ?? {},
        lastMsgAt: row.last_msg_at,
        createdAt: row.created_at,
    };
}

function normalizeAttachments(raw: unknown): DmAttachment[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((a) => a && typeof a === "object")
        .map((a) => a as DmAttachment);
}

function normalizeMessage(row: MessageRow): DmMessage {
    return {
        id: row.id,
        threadId: row.thread_id,
        sender: row.sender,
        body: row.body || "",
        attachments: normalizeAttachments(row.attachments),
        replyTo: row.reply_to,
        kind: (row.kind as MessageKind) || "user",
        editedAt: row.edited_at,
        deleted: !!row.deleted,
        createdAt: row.created_at,
    };
}

function isClient(): boolean {
    return typeof window !== "undefined";
}

async function getCurrentUserId(): Promise<string | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

/* ───────────────────────── Lectura: hilos + no-leídos ──────────────────── */

const READ_MARKS_KEY = "starseed.dm.readmarks.v1";

/** Marca local de lectura por hilo: threadId → ISO timestamp del último visto. */
function readMarks(): Record<string, string> {
    if (!isClient()) return {};
    try {
        const raw = window.localStorage.getItem(READ_MARKS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

/** Marca un hilo como leído HASTA AHORA (local; ver también `markRead` con meta remota). */
export function markThreadReadLocal(threadId: string): void {
    if (!isClient() || !threadId) return;
    try {
        const marks = readMarks();
        marks[threadId] = new Date().toISOString();
        window.localStorage.setItem(READ_MARKS_KEY, JSON.stringify(marks));
    } catch {
        /* noop */
    }
}

function lastReadAt(threadId: string): string | null {
    return readMarks()[threadId] ?? null;
}

/**
 * Marca un hilo como leído: guarda la marca local (instantánea, siempre
 * disponible) y, best-effort, también en `meta.readMarks[uid]` del hilo en
 * Supabase para que "no leídos" sea coherente entre dispositivos de la misma
 * cuenta. Nunca lanza.
 */
export async function markRead(threadId: string): Promise<void> {
    markThreadReadLocal(threadId);
    const uid = await getCurrentUserId();
    if (!uid || !threadId) return;
    try {
        const supabase = createClient();
        const { data } = await supabase
            .from("os_dm_threads")
            .select("meta")
            .eq("id", threadId)
            .maybeSingle();
        const meta = (data?.meta && typeof data.meta === "object" ? data.meta : {}) as Record<string, unknown>;
        const readMarksRemote = (meta.readMarks && typeof meta.readMarks === "object" ? meta.readMarks : {}) as Record<
            string,
            string
        >;
        readMarksRemote[uid] = new Date().toISOString();
        await supabase
            .from("os_dm_threads")
            .update({ meta: { ...meta, readMarks: readMarksRemote } })
            .eq("id", threadId);
    } catch {
        /* best-effort: la marca local ya quedó guardada */
    }
}

/**
 * Lista los hilos del usuario actual (vía membresía `os_dm_members`), con el
 * último mensaje y un contador de no-leídos básico (mensajes posteriores a la
 * última marca de lectura local que no sean del propio usuario). Ordenado por
 * `last_msg_at` desc. Nunca lanza: [] sin sesión o ante cualquier error.
 */
export async function listThreads(): Promise<DmThreadSummary[]> {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    try {
        const supabase = createClient();
        const { data: memberRows, error: memberErr } = await supabase
            .from("os_dm_members")
            .select("thread_id")
            .eq("user_id", uid);
        if (memberErr || !Array.isArray(memberRows) || memberRows.length === 0) return [];
        const threadIds = memberRows.map((r: { thread_id: string }) => r.thread_id);

        const [{ data: threadRows }, membersRes] = await Promise.all([
            supabase
                .from("os_dm_threads")
                .select("*")
                .in("id", threadIds)
                .order("last_msg_at", { ascending: false, nullsFirst: false }),
            supabase.from("os_dm_members").select("thread_id, user_id").in("thread_id", threadIds),
        ]);

        const membersByThread = new Map<string, string[]>();
        for (const row of (membersRes.data as { thread_id: string; user_id: string }[]) || []) {
            const list = membersByThread.get(row.thread_id) ?? [];
            list.push(row.user_id);
            membersByThread.set(row.thread_id, list);
        }

        // Excluye los hilos de Correos (marcados con meta.mail=true por
        // `@/lib/mail/os-mail.ts`, que reutiliza esta MISMA tabla): Mensajes y
        // Correos son superficies distintas del mismo backend. Aditivo — ningún
        // hilo de chat existente tiene `meta.mail`, así que no cambia nada más.
        const threads = ((threadRows as ThreadRow[]) || [])
            .map(normalizeThread)
            .filter((t) => (t.meta as { mail?: boolean } | null)?.mail !== true);

        // Último mensaje de cada hilo (una consulta por hilo, en paralelo, acotada
        // a los hilos del usuario — lista personal, tamaño razonable).
        const lastMessages = await Promise.all(
            threads.map(async (t) => {
                try {
                    const { data } = await supabase
                        .from("os_dm_messages")
                        .select("*")
                        .eq("thread_id", t.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    return data ? normalizeMessage(data as MessageRow) : null;
                } catch {
                    return null;
                }
            }),
        );

        // No-leídos: mensajes de otros posteriores a mi última marca de lectura.
        const unreadCounts = await Promise.all(
            threads.map(async (t) => {
                const since = lastReadAt(t.id);
                try {
                    let q = supabase
                        .from("os_dm_messages")
                        .select("id", { count: "exact", head: true })
                        .eq("thread_id", t.id)
                        .neq("sender", uid)
                        .eq("deleted", false);
                    if (since) q = q.gt("created_at", since);
                    const { count } = await q;
                    return count ?? 0;
                } catch {
                    return 0;
                }
            }),
        );

        return threads
            .map((t, i) => ({
                ...t,
                lastMessage: lastMessages[i],
                unreadCount: unreadCounts[i],
                memberIds: membersByThread.get(t.id) ?? [],
            }))
            .sort((a, b) => {
                const at = a.lastMsgAt || a.createdAt;
                const bt = b.lastMsgAt || b.createdAt;
                return new Date(bt).getTime() - new Date(at).getTime();
            });
    } catch {
        return [];
    }
}

/** Suscripción realtime a la lista de hilos del usuario (INSERT/UPDATE en threads). */
export function subscribeThreadsList(onChange: () => void): () => void {
    return onTableChange("os_dm_threads", { event: "*" }, () => onChange());
}

/* ───────────────────────────── createDm / createGroup ──────────────────── */

export interface CreateThreadResult {
    ok: boolean;
    needsAuth?: boolean;
    thread?: DmThread;
    error?: string;
}

/** ¿Ya existe un DM 1:1 entre el usuario actual y `userId`? Si sí, lo devuelve. */
async function findExistingDm(uid: string, otherUserId: string): Promise<DmThread | null> {
    try {
        const supabase = createClient();
        const { data: mine } = await supabase.from("os_dm_members").select("thread_id").eq("user_id", uid);
        const myThreadIds = ((mine as { thread_id: string }[]) || []).map((r) => r.thread_id);
        if (!myThreadIds.length) return null;

        const { data: theirs } = await supabase
            .from("os_dm_members")
            .select("thread_id")
            .eq("user_id", otherUserId)
            .in("thread_id", myThreadIds);
        const sharedIds = ((theirs as { thread_id: string }[]) || []).map((r) => r.thread_id);
        if (!sharedIds.length) return null;

        const { data: threadRows } = await supabase
            .from("os_dm_threads")
            .select("*")
            .in("id", sharedIds)
            .eq("kind", "dm");
        const candidates = ((threadRows as ThreadRow[]) || []).map(normalizeThread);
        // Un DM 1:1 tiene exactamente 2 miembros; confirma para no reusar un grupo.
        for (const t of candidates) {
            const { count } = await supabase
                .from("os_dm_members")
                .select("user_id", { count: "exact", head: true })
                .eq("thread_id", t.id);
            if (count === 2) return t;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Crea (o reutiliza) un DM 1:1 con `userId`. Si ya existe un hilo `dm` entre
 * ambos, lo devuelve en vez de duplicar. Exige sesión.
 */
export async function createDm(userId: string): Promise<CreateThreadResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    if (!userId || userId === uid) return { ok: false, error: "Destinatario inválido." };

    const existing = await findExistingDm(uid, userId);
    if (existing) return { ok: true, thread: existing };

    try {
        const supabase = createClient();
        const { data: threadRow, error } = await supabase
            .from("os_dm_threads")
            .insert({ kind: "dm", created_by: uid })
            .select("*")
            .single();
        if (error || !threadRow) throw error ?? new Error("No se pudo crear el hilo.");
        const thread = normalizeThread(threadRow as ThreadRow);

        const { error: memErr } = await supabase.from("os_dm_members").insert([
            { thread_id: thread.id, user_id: uid, role: "owner" },
            { thread_id: thread.id, user_id: userId, role: "member" },
        ]);
        if (memErr) throw memErr;

        return { ok: true, thread };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

/** Crea un grupo con título y miembros iniciales (además del creador). */
export async function createGroup(title: string, members: string[]): Promise<CreateThreadResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    try {
        const supabase = createClient();
        const { data: threadRow, error } = await supabase
            .from("os_dm_threads")
            .insert({ kind: "group", title: title?.trim() || "Nuevo grupo", created_by: uid })
            .select("*")
            .single();
        if (error || !threadRow) throw error ?? new Error("No se pudo crear el grupo.");
        const thread = normalizeThread(threadRow as ThreadRow);

        const uniqueMembers = Array.from(new Set(members.filter((m) => m && m !== uid)));
        const rows = [
            { thread_id: thread.id, user_id: uid, role: "owner" },
            ...uniqueMembers.map((m) => ({ thread_id: thread.id, user_id: m, role: "member" })),
        ];
        const { error: memErr } = await supabase.from("os_dm_members").insert(rows);
        if (memErr) throw memErr;

        return { ok: true, thread };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

/** Añade miembros a un grupo existente (best-effort; ignora duplicados). */
export async function addMembers(threadId: string, userIds: string[]): Promise<boolean> {
    if (!threadId || !userIds.length) return false;
    try {
        const supabase = createClient();
        const rows = userIds.map((u) => ({ thread_id: threadId, user_id: u, role: "member" }));
        const { error } = await supabase.from("os_dm_members").upsert(rows, { onConflict: "thread_id,user_id" });
        return !error;
    } catch {
        return false;
    }
}

/** Miembros de un hilo (para la cabecera / panel de info). */
export async function listMembers(threadId: string): Promise<DmMember[]> {
    if (!threadId) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_dm_members").select("*").eq("thread_id", threadId);
        if (error || !Array.isArray(data)) return [];
        return (data as { thread_id: string; user_id: string; role: string; joined_at: string }[]).map((r) => ({
            threadId: r.thread_id,
            userId: r.user_id,
            role: r.role,
            joinedAt: r.joined_at,
        }));
    } catch {
        return [];
    }
}

/* ─────────────────────── Vínculo hilo ↔ entidad (grupo/comunidad) ───────── */
//
// Cuando un grupo de chat TAMBIÉN crea una comunidad/grupo de la red (Adenda
// jul-2026, @/components/messages/dm/new-chat-dialog.tsx: opción "crear
// también comunidad/grupo de la red"), el vínculo vive en
// `thread.meta.entityLink = { kind: "group"|"page", slug }` — mismo patrón de
// lectura-modificación-escritura que `markRead`/`setThreadAgent` arriba. Deja
// acceder directamente a la página de la entidad desde la cabecera del hilo
// (@/components/messages/dm/thread-view.tsx).

export interface ThreadEntityLink {
    kind: "group" | "page";
    slug: string;
}

/** Lee el vínculo hilo↔entidad de un hilo ya cargado (sin red adicional). */
export function threadEntityLink(thread: Pick<DmThread, "meta">): ThreadEntityLink | null {
    const raw = (thread.meta as { entityLink?: unknown } | null)?.entityLink;
    if (!raw || typeof raw !== "object") return null;
    const link = raw as Partial<ThreadEntityLink>;
    if ((link.kind === "group" || link.kind === "page") && typeof link.slug === "string" && link.slug) {
        return { kind: link.kind, slug: link.slug };
    }
    return null;
}

/** Vincula un hilo a la entidad de red recién creada (best-effort; nunca lanza). */
export async function setThreadEntityLink(threadId: string, link: ThreadEntityLink): Promise<boolean> {
    if (!threadId) return false;
    try {
        const supabase = createClient();
        const { data } = await supabase.from("os_dm_threads").select("meta").eq("id", threadId).maybeSingle();
        const meta = (data?.meta && typeof data.meta === "object" ? (data.meta as Record<string, unknown>) : {}) ?? {};
        const { error } = await supabase
            .from("os_dm_threads")
            .update({ meta: { ...meta, entityLink: link } })
            .eq("id", threadId);
        return !error;
    } catch {
        return false;
    }
}

/* ───────────────────────────── Mensajes ────────────────────────────────── */

/** Lista mensajes de un hilo (ascendente), excluyendo los borrados del cuerpo (se mantiene el registro con `deleted`). */
export async function listMessages(threadId: string, limit = 200): Promise<DmMessage[]> {
    if (!threadId) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_dm_messages")
            .select("*")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: true })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        return (data as MessageRow[]).map(normalizeMessage);
    } catch {
        return [];
    }
}

export interface SendMessageInput {
    body: string;
    attachments?: DmAttachment[];
    replyTo?: string | null;
    kind?: MessageKind;
    /** Remitente explícito (por defecto el usuario actual; usado por Aurora al responder). */
    senderOverride?: string | null;
}

/**
 * Envía un mensaje a un hilo y "toca" `last_msg_at` para reordenar la lista.
 * Exige sesión (RLS valida membresía). Devuelve el mensaje insertado o null.
 */
export async function sendMessage(threadId: string, input: SendMessageInput): Promise<DmMessage | null> {
    if (!threadId) return null;
    const uid = await getCurrentUserId();
    if (!uid) return null;
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_dm_messages")
            .insert({
                thread_id: threadId,
                sender: input.senderOverride ?? uid,
                body: input.body ?? "",
                attachments: input.attachments ?? [],
                reply_to: input.replyTo ?? null,
                kind: input.kind ?? "user",
            })
            .select("*")
            .single();
        if (error || !data) return null;

        try {
            await supabase.from("os_dm_threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
        } catch {
            /* best-effort */
        }

        return normalizeMessage(data as MessageRow);
    } catch {
        return null;
    }
}

/** Edita un mensaje propio (RLS valida sender = auth.uid()). */
export async function editMessage(messageId: string, body: string): Promise<boolean> {
    if (!messageId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_dm_messages")
            .update({ body, edited_at: new Date().toISOString() })
            .eq("id", messageId);
        return !error;
    } catch {
        return false;
    }
}

/** Borra (soft-delete) un mensaje propio: conserva la fila pero vacía el cuerpo y marca `deleted`. */
export async function softDeleteMessage(messageId: string): Promise<boolean> {
    if (!messageId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_dm_messages")
            .update({ deleted: true, body: "" })
            .eq("id", messageId);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Suscripción realtime a los mensajes de UN hilo concreto (postgres_changes
 * filtrado por `thread_id`). Devuelve función de limpieza. SSR-safe/no-op sin
 * `window`.
 */
export function subscribeThread(threadId: string, cb: (payload: RealtimePayload<MessageRow>) => void): () => void {
    if (!threadId) return () => {};
    return onTableChange<MessageRow>("os_dm_messages", { filter: `thread_id=eq.${threadId}` }, cb);
}

/** Convierte una fila cruda de realtime (`payload.new`) en `DmMessage` normalizado. */
export function messageFromRealtimeRow(row: MessageRow | null | undefined): DmMessage | null {
    if (!row) return null;
    try {
        return normalizeMessage(row);
    } catch {
        return null;
    }
}

/* ───────────────────────────── Aurora por hilo ─────────────────────────── */

/** Activa/desactiva (o configura) el agente Aurora de un hilo. Solo dueño/miembro con permiso; RLS lo valida. */
export async function setThreadAgent(threadId: string, agent: ThreadAgentConfig | null): Promise<boolean> {
    if (!threadId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase.from("os_dm_threads").update({ agent }).eq("id", threadId);
        return !error;
    } catch {
        return false;
    }
}

/** ¿El texto menciona a Aurora? (para auto-respuesta cuando el hilo tiene el agente activo). */
export function mentionsAurora(text: string): boolean {
    return /@aurora\b/i.test(text || "");
}
