'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Messages Store (conversaciones + mensajes reales)
// ----------------------------------------------------------------
// Capa de DATOS sobre Supabase para Mensajes "En la red". ADITIVA:
// convive con las conversaciones demo (en memoria) de la página;
// aquí sólo gestionamos las conversaciones REALES del usuario.
//
// Tablas (RLS: owner de la conversación):
//   • conversations(id, owner, title, kind, members jsonb, folder,
//                   updated_at, created_at)
//   • messages(id, conversation_id, sender, content jsonb, type,
//              created_at)
//
// Principios:
//   • Identidad Soberana: todo va con `owner = auth uid`.
//   • SSR-safe: cada operación resuelve la sesión vía getUser() antes
//     de consultar; en el servidor / sin sesión devuelve vacío.
//   • NUNCA lanza: ante cualquier error degradamos en silencio
//     (devolvemos [] / null) para no romper el comportamiento demo.
// ════════════════════════════════════════════════════════════════

import { createClient } from "@/utils/supabase/client";

// ── Tipos ────────────────────────────────────────────────────────

/** Tipo de canal de una conversación real. */
export type ConversationKind = "dm" | "group" | "ef" | "community" | string;

/** Forma del contenido de un mensaje (jsonb). Laxo a propósito:
 *  reutiliza la misma forma que `MessageFull['content']` de la demo. */
export interface MessageContent {
    type?: "text" | "image" | "file" | "canvas" | "poll" | string;
    text?: string;
    imageUrl?: string;
    imageHint?: string;
    file?: { name: string; size: string };
    canvas?: { title: string; content: string };
    poll?: { question: string; options: string[] };
    [key: string]: any;
}

/** Fila de `conversations` (owner-scoped). */
export interface Conversation {
    id: string;
    owner: string;
    title: string | null;
    kind: ConversationKind | null;
    members: any[] | null;
    folder: string | null;
    updated_at: string | null;
    created_at: string | null;
}

/** Fila de `messages`. */
export interface Message {
    id: string;
    conversation_id: string;
    sender: string | null;
    content: MessageContent | null;
    type: string | null;
    created_at: string | null;
}

// ── Helpers internos ─────────────────────────────────────────────

function isClient(): boolean {
    return typeof window !== "undefined";
}

/**
 * Resuelve `{ supabase, uid }` para el usuario autenticado. SSR-safe y
 * a prueba de errores: devuelve `null` en servidor, sin cliente, o sin
 * sesión. Nunca lanza.
 */
async function getCtx(): Promise<{ supabase: ReturnType<typeof createClient>; uid: string } | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (error || !uid) return null;
        return { supabase, uid };
    } catch {
        return null;
    }
}

// ── API: conversaciones ──────────────────────────────────────────

/**
 * Lista las conversaciones REALES del usuario (owner), ordenadas por
 * `updated_at` desc. Devuelve `[]` si no hay sesión o ante cualquier
 * error (degradación silenciosa).
 */
export async function listConversations(): Promise<Conversation[]> {
    const ctx = await getCtx();
    if (!ctx) return [];
    try {
        const { data, error } = await ctx.supabase
            .from("conversations")
            .select("*")
            .eq("owner", ctx.uid)
            .order("updated_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return data as Conversation[];
    } catch {
        return [];
    }
}

/**
 * Crea una nueva conversación propiedad del usuario y la devuelve.
 * `kind` por defecto `'group'`; `members` se persiste como jsonb.
 * Devuelve `null` si no hay sesión o ante error.
 */
export async function createConversation(input: {
    title: string;
    kind?: ConversationKind;
    members?: any[];
}): Promise<Conversation | null> {
    const ctx = await getCtx();
    if (!ctx) return null;
    try {
        const now = new Date().toISOString();
        const row = {
            owner: ctx.uid,
            title: (input.title ?? "").trim() || "Nueva conversación",
            kind: input.kind ?? "group",
            members: Array.isArray(input.members) ? input.members : [],
            updated_at: now,
        };
        const { data, error } = await ctx.supabase
            .from("conversations")
            .insert(row)
            .select("*")
            .single();
        if (error || !data) return null;
        return data as Conversation;
    } catch {
        return null;
    }
}

/**
 * Asigna (o limpia con `null`) la carpeta de una conversación propia.
 * Owner-scoped. No lanza; devuelve `false` ante error.
 */
export async function setFolder(
    conversationId: string,
    folder: string | null,
): Promise<boolean> {
    const ctx = await getCtx();
    if (!ctx || !conversationId) return false;
    try {
        const { error } = await ctx.supabase
            .from("conversations")
            .update({ folder })
            .eq("id", conversationId)
            .eq("owner", ctx.uid);
        return !error;
    } catch {
        return false;
    }
}

// ── API: mensajes ────────────────────────────────────────────────

/**
 * Lista los mensajes de una conversación, ascendente por `created_at`.
 * RLS garantiza que sólo el owner de la conversación los recibe.
 * Devuelve `[]` ante cualquier error.
 */
export async function listMessages(conversationId: string): Promise<Message[]> {
    if (!conversationId) return [];
    const ctx = await getCtx();
    if (!ctx) return [];
    try {
        const { data, error } = await ctx.supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data as Message[];
    } catch {
        return [];
    }
}

/**
 * Envía un mensaje a una conversación (sender = uid), persistiendo el
 * `content` como jsonb, y "toca" `conversation.updated_at` para que la
 * conversación suba en la lista. Devuelve la fila insertada o `null`.
 */
export async function sendMessage(
    conversationId: string,
    content: MessageContent,
    type: string = "text",
): Promise<Message | null> {
    if (!conversationId) return null;
    const ctx = await getCtx();
    if (!ctx) return null;
    try {
        const { data, error } = await ctx.supabase
            .from("messages")
            .insert({
                conversation_id: conversationId,
                sender: ctx.uid,
                content: content ?? {},
                type: type || "text",
            })
            .select("*")
            .single();
        if (error || !data) return null;

        // Touch updated_at (best-effort; no afecta al resultado del envío).
        try {
            await ctx.supabase
                .from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", conversationId)
                .eq("owner", ctx.uid);
        } catch {
            /* best-effort */
        }

        return data as Message;
    } catch {
        return null;
    }
}
