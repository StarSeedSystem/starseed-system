"use client";

/**
 * astraura-158-malla — Astraura 1.58 servida por OTRA neurona de la MISMA
 * cuenta a través del canal WebRTC de la malla de neuronas (Ola 367), sin
 * pasar por el túnel de Cloudflare ni por ningún servidor de terceros. Ver
 * `src/lib/network/astraura-por-malla.ts` (protocolo + rol cliente/servidor)
 * y `architecture/astraura-158-sistema-primario.md` §17.
 *
 * Reutiliza las mismas funciones puras que `astraura-158.ts` (selección de
 * personalidad, menciones `@nombre`, preferencias) para que un turno servido
 * por la malla sea indistinguible en comportamiento de uno servido local o en
 * la nube — solo cambia el TRANSPORTE.
 */

import type { ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo } from "./types";
import {
  ASTRAURA_158_AUTO_MODEL,
  ASTRAURA_158_MODEL_PREFIX,
  ASTRAURA_158_PERSONAS,
  applyMentions158,
  buildAstraura158Prompt,
  detectMentions158,
  lastUserText,
  mentionsSystemNote,
  modelToPersona158,
  preferencesFor,
} from "./astraura-158";
import { pedirAstrauraPorMalla, type AstrauraMallaError } from "@/lib/network/astraura-por-malla";

const info: ProviderInfo = {
  id: "astraura-158-malla",
  label: "Astraura 1.58 (malla P2P)",
  description:
    "Astraura 1.58 servida por otra neurona de tu cuenta a través del canal WebRTC de la malla — sin túnel ni servidor externo.",
  requiresKey: false,
  local: true,
  defaultBaseUrl: "malla://astraura-158",
  defaultModels: [ASTRAURA_158_AUTO_MODEL, ...ASTRAURA_158_PERSONAS.map((p) => `${ASTRAURA_158_MODEL_PREFIX}${p.id}`)],
};

async function chat(_config: DecryptedProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  const modelPersona = modelToPersona158(options.model) ?? "astraura_prime";
  // Menciones @persona SOLO del turno actual — igual que en `astraura-158.ts`.
  const mentions = detectMentions158(lastUserText(messages));
  const applied = applyMentions158(preferencesFor(modelPersona, options), modelPersona, mentions);
  const persona = applied.persona;
  const preferences = applied.prefs;
  const built = buildAstraura158Prompt(messages);
  if (!built.prompt.trim()) throw new Error("Astraura 1.58 (malla) error: no hay mensaje del usuario.");
  const note = mentionsSystemNote(mentions, persona);
  const systemPrompt = note ? [built.system_prompt, note].filter(Boolean).join("\n\n") : built.system_prompt;

  const text = await pedirAstrauraPorMalla({
    cuerpo: {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      system_prompt: systemPrompt,
      preferences: preferences as unknown as Record<string, unknown>,
      persona_id: persona,
    },
    signal: options.signal,
    onTexto: options.onChunk,
  }).catch((e: unknown) => {
    const err = e as AstrauraMallaError;
    // Mismo mensaje ("ocupado" + "retry after Ns") que `astraura-158.ts`: el
    // enrutador (`router.ts`) enfría esta fuente con la misma regla que a
    // local/nube, sin necesitar ningún caso especial para la malla.
    throw new Error(err?.message || "Astraura 1.58 (malla) error desconocido.");
  });
  return { text };
}

async function listModels(): Promise<string[]> {
  return [...info.defaultModels];
}

export const astraura158MallaProvider: Provider = { info, chat, listModels };
