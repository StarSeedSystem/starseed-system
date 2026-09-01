"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Correos internos REALES (os-mail) — sobre os_dm_* existente
 * ---------------------------------------------------------------------------
 * Contexto honesto: el "Correos" anterior (`@/lib/mail/starseed-mail.ts`,
 * tablas `ss_mail` / `account_emails` / `starseed_mail_config`) referencia
 * tablas que NO EXISTEN en la base real del OS —que es
 * **`nxstilnyidvkqeosofuh`**; esta cabecera decía `dzkjapinnewkxzjltadv`, que es
 * la de Nexus/Café (ref corregida el 2026-07-12)— verificado
 * por consulta directa a information_schema. Esa capa degrada en silencio a
 * vacío (nunca lanza) pero nunca ha llegado a enviar ni recibir un correo
 * real. Esta capa nueva construye el correo interno sobre la infraestructura
 * que SÍ existe en la base del OS desde el 2026-07-12 (creada por la migración
 * `20260712090200_missing_core_tables_messages.sql`): `os_dm_threads` / `os_dm_members` /
 * `os_dm_messages` (la misma de Mensajes, ver `@/lib/messages/dm.ts`).
 *
 * Un "correo" es un hilo os_dm_threads normal marcado con `meta.mail = true`
 * y `meta.subject`. Reutiliza TODO lo que ya existe y funciona:
 *   · multi-destinatario  → os_dm_members (igual que un grupo de chat)
 *   · adjuntos            → os_dm_messages.attachments (DmAttachment[])
 *   · responder           → sendMessage() a un hilo existente (reply_to)
 *   · marcar leído         → markRead() de dm.ts (local + meta.readMarks)
 *   · tiempo real          → subscribeThread() / subscribeThreadsList()
 *
 * Lo NUEVO que añade esta capa (no existe en dm.ts):
 *   · asunto              → meta.subject
 *   · bandejas            → derivadas de meta.creatorId + meta.flags[uid]
 *     (Recibidos = no soy el creador · Enviados = soy el creador ·
 *      Destacados/Archivados = meta.flags[uid].{starred,archived})
 *   · reenviar             → nuevo hilo "Fwd: …" citando el original
 *   · correo externo (mailto:) → registra una copia en Enviados con
 *     `meta.external = true` (hilo de un solo miembro: quien lo redactó).
 *   · correo externo vinculado → user_settings.prefs.externalEmail (tabla
 *     REAL, a diferencia de account_emails que no existe).
 *
 * IMPORTANTE (cero regresiones): como los hilos de correo viven en la MISMA
 * tabla `os_dm_threads` que los chats, `dm.ts#listThreads()` excluye ahora
 * los hilos con `meta.mail === true` (un filtro de una línea, aditivo — ver
 * comentario en ese archivo) para que Mensajes y Correos no se mezclen.
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada a []/null sin sesión.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import {
    sendMessage,
    listMessages,
    subscribeThread as subscribeMailThread,
    subscribeThreadsList as subscribeMailThreadsList,
    markRead as markMailRead,
    messageFromRealtimeRow,
    type DmAttachment,
    type DmMessage,
} from "@/lib/messages/dm";

export type { DmAttachment, DmMessage };
export { subscribeMailThread, subscribeMailThreadsList, markMailRead, messageFromRealtimeRow };

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export type MailFolder = "inbox" | "sent" | "starred" | "archived";

export interface MailFlags {
    starred: boolean;
    archived: boolean;
}

export interface MailThreadSummary {
    id: string;
    subject: string;
    memberIds: string[];
    creatorId: string;
    external: boolean;
    externalTo: string | null;
    createdAt: string;
    lastMsgAt: string;
    lastMessage: DmMessage | null;
    unread: boolean;
    flags: MailFlags;
}

export interface MailThreadDetail {
    id: string;
    subject: string;
    memberIds: string[];
    creatorId: string;
    external: boolean;
    externalTo: string | null;
    flags: MailFlags;
}

interface MailMeta {
    mail?: boolean;
    subject?: string;
    creatorId?: string;
    external?: boolean;
    externalTo?: string;
    flags?: Record<string, Partial<MailFlags>>;
    readMarks?: Record<string, string>;
    [k: string]: unknown;
}

interface RawThreadRow {
    id: string;
    meta: unknown;
    created_by: string | null;
    created_at: string;
    last_msg_at: string | null;
}

interface RawMessageRow {
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

/* ────────────────────────────── Helpers ────────────────────────────────── */

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

function mailMetaOf(row: { meta: unknown }): MailMeta {
    return (row.meta && typeof row.meta === "object" ? (row.meta as MailMeta) : {}) ?? {};
}

function isMailRow(row: RawThreadRow): boolean {
    return mailMetaOf(row).mail === true;
}

function normalizeAttachments(raw: unknown): DmAttachment[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((a) => a && typeof a === "object") as DmAttachment[];
}

function normalizeMessageLite(row: RawMessageRow): DmMessage {
    return {
        id: row.id,
        threadId: row.thread_id,
        sender: row.sender,
        body: row.body || "",
        attachments: normalizeAttachments(row.attachments),
        replyTo: row.reply_to,
        kind: (row.kind as DmMessage["kind"]) || "user",
        editedAt: row.edited_at,
        deleted: !!row.deleted,
        createdAt: row.created_at,
    };
}

/** Lee-modifica-escribe el `meta` de un hilo (mismo patrón que dm.ts#markRead). */
async function patchMailMeta(threadId: string, updater: (meta: MailMeta) => MailMeta): Promise<boolean> {
    try {
        const supabase = createClient();
        const { data } = await supabase.from("os_dm_threads").select("meta").eq("id", threadId).maybeSingle();
        const current = mailMetaOf((data as { meta: unknown }) || { meta: {} });
        const next = updater(current);
        const { error } = await supabase.from("os_dm_threads").update({ meta: next }).eq("id", threadId);
        return !error;
    } catch {
        return false;
    }
}

/* ───────────────────────────── Bandejas ────────────────────────────────── */

/**
 * Lista los correos de una bandeja del usuario actual. Recibidos/Enviados se
 * derivan de si soy el creador del hilo; Destacados/Archivados de mis propias
 * marcas en `meta.flags[uid]`. Los archivados no aparecen en Recibidos/Enviados
 * (como en cualquier bandeja de correo). Nunca lanza: [] sin sesión/error.
 */
export async function listMailThreads(folder: MailFolder): Promise<MailThreadSummary[]> {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    try {
        const supabase = createClient();
        const { data: memberRows } = await supabase.from("os_dm_members").select("thread_id").eq("user_id", uid);
        const threadIds = ((memberRows as { thread_id: string }[]) || []).map((r) => r.thread_id);
        if (!threadIds.length) return [];

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

        const mailThreads = ((threadRows as RawThreadRow[]) || []).filter(isMailRow);

        const withFolder = mailThreads.filter((t) => {
            const meta = mailMetaOf(t);
            const myFlags = (meta.flags && meta.flags[uid]) || {};
            const archived = !!myFlags.archived;
            const starred = !!myFlags.starred;
            if (folder === "archived") return archived;
            if (folder === "starred") return starred;
            if (archived) return false;
            const isMine = (meta.creatorId || t.created_by) === uid;
            return folder === "sent" ? isMine : !isMine;
        });

        const lastMessages = await Promise.all(
            withFolder.map(async (t) => {
                try {
                    const { data } = await supabase
                        .from("os_dm_messages")
                        .select("*")
                        .eq("thread_id", t.id)
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    return data ? normalizeMessageLite(data as RawMessageRow) : null;
                } catch {
                    return null;
                }
            }),
        );

        return withFolder
            .map((t, i) => {
                const meta = mailMetaOf(t);
                const myFlags = (meta.flags && meta.flags[uid]) || {};
                const readSince = (meta.readMarks && meta.readMarks[uid]) || null;
                const last = lastMessages[i];
                const unread =
                    !!last &&
                    last.sender !== uid &&
                    (!readSince || new Date(last.createdAt).getTime() > new Date(readSince).getTime());
                return {
                    id: t.id,
                    subject: meta.subject || "(sin asunto)",
                    memberIds: membersByThread.get(t.id) ?? [],
                    creatorId: meta.creatorId || t.created_by || "",
                    external: !!meta.external,
                    externalTo: meta.externalTo || null,
                    createdAt: t.created_at,
                    lastMsgAt: t.last_msg_at || t.created_at,
                    lastMessage: last,
                    unread,
                    flags: { starred: !!myFlags.starred, archived: !!myFlags.archived },
                } as MailThreadSummary;
            })
            .sort((a, b) => new Date(b.lastMsgAt).getTime() - new Date(a.lastMsgAt).getTime());
    } catch {
        return [];
    }
}

/** Detalle de un hilo de correo (para el lector + cabecera de respuesta/reenvío). */
export async function getMailThread(threadId: string): Promise<MailThreadDetail | null> {
    const uid = await getCurrentUserId();
    if (!uid || !threadId) return null;
    try {
        const supabase = createClient();
        const [{ data: threadRow }, { data: memberRows }] = await Promise.all([
            supabase.from("os_dm_threads").select("*").eq("id", threadId).maybeSingle(),
            supabase.from("os_dm_members").select("user_id").eq("thread_id", threadId),
        ]);
        if (!threadRow) return null;
        const meta = mailMetaOf(threadRow as RawThreadRow);
        const myFlags = (meta.flags && meta.flags[uid]) || {};
        return {
            id: threadId,
            subject: meta.subject || "(sin asunto)",
            memberIds: ((memberRows as { user_id: string }[]) || []).map((m) => m.user_id),
            creatorId: meta.creatorId || (threadRow as RawThreadRow).created_by || "",
            external: !!meta.external,
            externalTo: meta.externalTo || null,
            flags: { starred: !!myFlags.starred, archived: !!myFlags.archived },
        };
    } catch {
        return null;
    }
}

/** Mensajes de un correo (orden ascendente) — reutiliza dm.ts sin cambios. */
export async function getMailMessages(threadId: string): Promise<DmMessage[]> {
    return listMessages(threadId);
}

/* ───────────────────────────── Redactar ────────────────────────────────── */

export interface ComposeMailResult {
    ok: boolean;
    needsAuth?: boolean;
    threadId?: string;
    error?: string;
}

/** Redacta un correo interno nuevo a uno o varios destinatarios de la red. */
export async function composeMail(params: {
    recipientIds: string[];
    subject: string;
    body: string;
    attachments?: DmAttachment[];
}): Promise<ComposeMailResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const recipients = Array.from(new Set(params.recipientIds.filter((id) => id && id !== uid)));
    if (!recipients.length) return { ok: false, error: "Añade al menos un destinatario." };

    const subject = params.subject.trim() || "(sin asunto)";
    try {
        const supabase = createClient();
        const { data: threadRow, error } = await supabase
            .from("os_dm_threads")
            .insert({
                kind: recipients.length > 1 ? "group" : "dm",
                title: subject,
                created_by: uid,
                meta: {
                    mail: true,
                    subject,
                    creatorId: uid,
                    flags: {},
                    readMarks: { [uid]: new Date().toISOString() },
                },
            })
            .select("*")
            .single();
        if (error || !threadRow) throw error ?? new Error("No se pudo crear el correo.");
        const threadId = (threadRow as { id: string }).id;

        const memberRows = [
            { thread_id: threadId, user_id: uid, role: "owner" },
            ...recipients.map((id) => ({ thread_id: threadId, user_id: id, role: "member" })),
        ];
        const { error: memErr } = await supabase.from("os_dm_members").insert(memberRows);
        if (memErr) throw memErr;

        const sent = await sendMessage(threadId, { body: params.body || "", attachments: params.attachments || [] });
        if (!sent) throw new Error("El correo se creó pero no se pudo guardar el mensaje.");

        return { ok: true, threadId };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "No se pudo enviar el correo." };
    }
}

/** Responde dentro del mismo hilo (cita opcional vía `replyTo`). Reutiliza sendMessage. */
export async function replyToMail(
    threadId: string,
    body: string,
    attachments: DmAttachment[] = [],
    replyTo?: string | null,
): Promise<DmMessage | null> {
    return sendMessage(threadId, { body, attachments, replyTo: replyTo ?? null });
}

/** Reenvía un correo: crea un hilo NUEVO ("Fwd: …") citando el mensaje original. */
export async function forwardMail(params: {
    originalSubject: string;
    originalBody: string;
    originalSenderLabel: string;
    originalCreatedAt: string;
    attachments?: DmAttachment[];
    recipientIds: string[];
    note?: string;
}): Promise<ComposeMailResult> {
    const subjectBase = params.originalSubject.replace(/^\s*(Fwd:\s*)+/i, "");
    const subject = `Fwd: ${subjectBase}`;
    const lines = [
        params.note?.trim() || "",
        "---",
        `**Mensaje reenviado** de ${params.originalSenderLabel} · ${new Date(params.originalCreatedAt).toLocaleString("es-ES")}`,
        "",
        params.originalBody,
    ];
    const quoted = lines.filter((l, i) => !(i === 0 && !l)).join("\n");
    return composeMail({
        recipientIds: params.recipientIds,
        subject,
        body: quoted,
        attachments: params.attachments || [],
    });
}

/* ───────────────────────── Destacar / Archivar ─────────────────────────── */

export async function setMailStarred(threadId: string, on: boolean): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid) return false;
    return patchMailMeta(threadId, (meta) => ({
        ...meta,
        flags: { ...(meta.flags || {}), [uid]: { ...(meta.flags?.[uid] || {}), starred: on } },
    }));
}

export async function setMailArchived(threadId: string, on: boolean): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid) return false;
    return patchMailMeta(threadId, (meta) => ({
        ...meta,
        flags: { ...(meta.flags || {}), [uid]: { ...(meta.flags?.[uid] || {}), archived: on } },
    }));
}

/* ─────────────────────── Correo externo (honesto) ──────────────────────── */
//
// Sin SMTP propio: "enviar externo" abre un borrador `mailto:` en el cliente
// del propio usuario y guarda una COPIA en Enviados etiquetada `external`.
// El envío/recepción real con proveedores (Gmail, etc.) requiere una
// integración futura (conector). Ver nota honesta también en /cuenta.

/** Construye un `mailto:` con asunto y cuerpo codificados. */
export function buildMailtoHref(to: string, subject: string, body: string): string {
    const qs = new URLSearchParams();
    if (subject) qs.set("subject", subject);
    if (body) qs.set("body", body);
    const query = qs.toString();
    return `mailto:${encodeURIComponent(to.trim())}${query ? `?${query}` : ""}`;
}

export interface SendExternalMailResult {
    ok: boolean;
    needsAuth?: boolean;
    href?: string;
    threadId?: string;
    error?: string;
    /** (Adenda 200) true si SALIÓ de verdad por el proveedor de envío. */
    enviadoDeVerdad?: boolean;
    /** Dirección pública desde la que salió. */
    desde?: string;
}

/** (Adenda 200) Mi dirección pública `handle@dominio`, o "" si aún no hay. */
export async function miDireccionPublica(): Promise<string> {
    try {
        const uid = await getCurrentUserId();
        if (!uid) return "";
        const supabase = createClient();
        const { data } = await supabase.from("profiles").select("handle").eq("user_id", uid).maybeSingle();
        const handle = ((data as { handle?: string } | null)?.handle || "").replace(/^@/, "").trim();
        return handle;
    } catch {
        return "";
    }
}

/** ¿Puede este despliegue enviar correo real a internet? (cacheado por sesión) */
let _envioReal: { disponible: boolean; dominio: string | null } | null = null;
export async function envioExternoDisponible(): Promise<{ disponible: boolean; dominio: string | null }> {
    if (_envioReal) return _envioReal;
    try {
        const r = await fetch("/api/mail/enviar", { method: "GET" });
        const j = (await r.json()) as { disponible?: boolean; dominio?: string | null };
        _envioReal = { disponible: !!j?.disponible, dominio: j?.dominio ?? null };
    } catch {
        _envioReal = { disponible: false, dominio: null };
    }
    return _envioReal;
}

/**
 * (Adenda 200) Intenta el envío REAL por el proveedor del servidor. Devuelve
 * null si no hay proveedor (entonces quien llama cae al `mailto:`).
 */
async function intentarEnvioReal(params: {
    to: string;
    subject: string;
    body: string;
}): Promise<{ ok: boolean; desde?: string; error?: string } | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return null;

        const r = await fetch("/api/mail/enviar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to: [params.to], subject: params.subject, text: params.body }),
        });
        const j = (await r.json().catch(() => ({}))) as {
            ok?: boolean; from?: string; error?: string; sinProveedor?: boolean; sinDominio?: boolean;
        };
        // Sin proveedor/dominio ⇒ no es un fallo del usuario: se cae al mailto:.
        if (j?.sinProveedor || j?.sinDominio) return null;
        return { ok: !!j?.ok, desde: j?.from, error: j?.error };
    } catch {
        return null;
    }
}

/**
 * "Envía" un correo externo: genera el `mailto:` (el llamador decide cuándo
 * navegar a `href`, p.ej. `window.location.href = href`) y registra una copia
 * en Enviados (hilo de un solo miembro: quien lo redacta) con
 * `meta.external = true` para que aparezca con su etiqueta distintiva.
 */
export async function sendExternalMail(params: {
    to: string;
    subject: string;
    body: string;
}): Promise<SendExternalMailResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const to = params.to.trim();
    if (!to.includes("@")) return { ok: false, error: "Escribe un correo externo válido." };

    const subject = params.subject.trim() || "(sin asunto)";
    const href = buildMailtoHref(to, subject, params.body || "");

    // (Adenda 200) Si el despliegue tiene proveedor de envío, el correo SALE de
    // verdad desde `tuhandle@<dominio público>`; el `mailto:` queda solo como
    // red de seguridad honesta cuando no hay proveedor configurado.
    const real = await intentarEnvioReal({ to, subject, body: params.body || "" });
    const salioDeVerdad = real?.ok === true;
    if (real && !real.ok) {
        return { ok: false, href, error: real.error || "No se pudo enviar el correo." };
    }

    try {
        const supabase = createClient();
        const { data: threadRow, error } = await supabase
            .from("os_dm_threads")
            .insert({
                kind: "dm",
                title: subject,
                created_by: uid,
                meta: {
                    mail: true,
                    subject,
                    creatorId: uid,
                    external: true,
                    externalTo: to,
                    flags: {},
                    readMarks: { [uid]: new Date().toISOString() },
                },
            })
            .select("*")
            .single();
        if (error || !threadRow) throw error ?? new Error("No se pudo registrar la copia.");
        const threadId = (threadRow as { id: string }).id;

        await supabase.from("os_dm_members").insert({ thread_id: threadId, user_id: uid, role: "owner" });
        await supabase
            .from("os_dm_messages")
            .insert({ thread_id: threadId, sender: uid, body: params.body || "", attachments: [], kind: "user" });

        return { ok: true, href, threadId, enviadoDeVerdad: salioDeVerdad, desde: real?.desde };
    } catch (e) {
        // El mailto: sigue siendo válido para el usuario aunque falle el registro.
        return { ok: true, href, error: (e as Error)?.message, enviadoDeVerdad: salioDeVerdad, desde: real?.desde };
    }
}

/* ─────────────────── Correo externo vinculado (identidad) ──────────────── */
//
// Persistido en `user_settings.prefs.externalEmail` — tabla REAL (a diferencia
// de `account_emails`, que no existe). Lee-modifica-escribe `prefs` para no
// pisar otras claves (p.ej. `prefs.capabilities`).

export async function getLinkedExternalEmail(): Promise<string> {
    const uid = await getCurrentUserId();
    if (!uid) return "";
    try {
        const supabase = createClient();
        const { data } = await supabase.from("user_settings").select("prefs").eq("user_id", uid).maybeSingle();
        const prefs = data?.prefs && typeof data.prefs === "object" ? (data.prefs as Record<string, unknown>) : {};
        return typeof prefs.externalEmail === "string" ? prefs.externalEmail : "";
    } catch {
        return "";
    }
}

export async function setLinkedExternalEmail(email: string): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid) return false;
    try {
        // Adenda 69 · A — antes: leer `prefs` + `upsert` de la COLUMNA ENTERA
        // (lost update: borraba lo que otros módulos hubieran escrito tras la
        // lectura). Ahora solo se manda nuestra clave, fusión atómica.
        const res = await mergeUserPrefs({ externalEmail: email.trim() }, { userId: uid });
        return res.ok;
    } catch {
        return false;
    }
}
