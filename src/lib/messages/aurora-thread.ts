"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Aurora opcional POR HILO de mensajes
 * ---------------------------------------------------------------------------
 * Conecta un hilo de `os_dm_threads` (kind='dm'|'group', agent jsonb) con el
 * router de Astraura (gratis-primero) ya existente en `src/ai/astraura/`.
 * NO añade infraestructura nueva: reutiliza `astrauraChat` tal cual.
 *
 * Uso: cuando `thread.agent.enabled`, la UI puede:
 *   · Ofrecer el botón "Preguntar a Aurora" → `askAuroraInThread(...)`.
 *   · Auto-responder cuando un mensaje menciona "@aurora" (ver `mentionsAurora`
 *     en dm.ts) → también llama a `askAuroraInThread(...)`.
 *
 * La respuesta se publica como mensaje `kind='agent'` (sender = quien invocó,
 * el hilo la muestra con estilo distintivo de "Aurora del hilo").
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import { listMessages, sendMessage, type DmMessage, type ThreadAgentConfig } from "@/lib/messages/dm";

/** Cuántos mensajes previos del hilo se pasan como contexto a Aurora. */
const CONTEXT_WINDOW = 20;

/** Convierte los últimos mensajes del hilo en `ChatMessage[]` para el router. */
function threadToContext(messages: DmMessage[], myUserId: string | null): ChatMessage[] {
    return messages
        .filter((m) => !m.deleted && m.body.trim())
        .slice(-CONTEXT_WINDOW)
        .map((m): ChatMessage => ({
            role: m.kind === "agent" ? "assistant" : m.sender === myUserId ? "user" : "user",
            content: m.kind === "agent" ? m.body : `${m.sender ?? "Alguien"}: ${m.body}`,
        }));
}

export interface AskAuroraOptions {
    /** Id del usuario que invoca (para el rol de contexto). */
    invokerId: string | null;
    /** Configuración del agente del hilo (persona/nombre). */
    agent: ThreadAgentConfig | null;
    /** Pregunta explícita del usuario (si viene del botón "Preguntar a Aurora"). */
    prompt?: string;
    /** Estado de progreso opcional (para mostrar "Aurora está pensando…"). */
    onStatus?: (status: string) => void;
}

export interface AskAuroraResult {
    ok: boolean;
    message?: DmMessage;
    error?: string;
}

/**
 * Genera una respuesta de Aurora para un hilo (usando sus últimos ~20 mensajes
 * como contexto) y la publica como mensaje `kind='agent'`. Nunca lanza: ante
 * cualquier fallo del router devuelve `{ ok: false, error }` sin romper el chat.
 */
export async function askAuroraInThread(threadId: string, opts: AskAuroraOptions): Promise<AskAuroraResult> {
    if (!threadId) return { ok: false, error: "Hilo inválido." };
    try {
        const history = await listMessages(threadId);
        const context = threadToContext(history, opts.invokerId);

        const persona = opts.agent?.persona?.trim();
        const agentName = opts.agent?.name?.trim() || "Aurora";
        const systemPrompt = [
            `Eres ${agentName}, el agente Aurora de este hilo de mensajes de StarSeed OS.`,
            persona ? `Estilo/persona configurada para este hilo: ${persona}` : "",
            "Responde de forma breve, útil y natural, como un participante más del chat. No repitas el historial completo.",
        ]
            .filter(Boolean)
            .join(" ");

        const messages: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            ...context,
            ...(opts.prompt?.trim() ? [{ role: "user", content: opts.prompt.trim() } as ChatMessage] : []),
        ];

        const res = await astrauraChat({
            messages,
            taskHint: "chat",
            onStatus: opts.onStatus,
        });

        const text = String(res?.text ?? "").trim();
        if (!text) return { ok: false, error: "Aurora no generó respuesta." };

        const sender = opts.invokerId ?? null;
        const saved = await sendMessage(threadId, {
            body: text,
            kind: "agent",
            senderOverride: sender,
        });
        if (!saved) return { ok: false, error: "No se pudo publicar la respuesta de Aurora." };
        return { ok: true, message: saved };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error al consultar a Aurora." };
    }
}
