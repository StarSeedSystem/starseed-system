/**
 * High-level client-side chat entry point. Picks the active provider, decrypts
 * the user's key in-memory, and calls the provider adapter. Designed to be the
 * ONE function the rest of the app calls when talking to an AI.
 */

"use client";

import { getProvider, type ChatMessage, type ChatOptions, type ChatResponse } from "../providers";
import { decryptKey } from "./keyStorage";
import { loadConfigs, getActiveProviderId } from "./providerStore";

export interface ChatRequest {
  messages: ChatMessage[];
  /** Override the active provider. If omitted, uses the user's selected one. */
  providerId?: string;
  /** Override the provider's default model. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Passphrase used to decrypt the API key. Empty string for the default key. */
  passphrase?: string;
  /** AbortController.signal */
  signal?: AbortSignal;
  /** Streaming callback. */
  onChunk?: (delta: string) => void;
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const configs = loadConfigs();
  const targetId = (req.providerId ?? getActiveProviderId()) as string | null;
  const config =
    configs.find((c) => c.enabled && (targetId ? c.id === targetId : true)) ??
    configs.find((c) => c.enabled);

  if (!config) {
    throw new Error(
      "No tienes ningún proveedor de IA activado. Configura uno en Ajustes → IA & Modelos."
    );
  }

  const provider = getProvider(config.id);
  const apiKey = config.encryptedKey
    ? await decryptKey(config.encryptedKey, req.passphrase ?? "")
    : "";

  const options: ChatOptions = {
    model: req.model || config.defaultModel,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    signal: req.signal,
    onChunk: req.onChunk,
  };

  return provider.chat({ ...config, apiKey }, req.messages, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// chatSmart() — OPT-IN Mixture-of-Agents entry point.
//
// This is an ADDITIVE sibling of chat(). It NEVER changes chat()'s behaviour and
// is only reached by call sites that explicitly choose to use it. Internally it
// delegates to the MoA runtime, which itself falls back to the very chat() above
// whenever the active MoA mode is 'single' OR fewer than 2 providers are usable.
// Net effect: users with a single provider (the vast majority) get byte-for-byte
// the same path as chat(); multi-provider users who enabled a MoA mode get the
// orchestrated answer. On ANY internal error the runtime degrades to chat(), so
// this function carries the same failure semantics as the existing path.
//
// The runMoA import is dynamic to (a) keep this module's static import graph
// unchanged for existing chat() callers and (b) avoid any module-evaluation
// circular-import edge between chat.ts and moa/runtime.ts. If the runtime can't
// be loaded for any reason, we fall straight back to chat().
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatSmartRequest extends ChatRequest {
  /** When set, the runtime honours this brain's per-brain MoA override. */
  brainId?: string;
}

export async function chatSmart(req: ChatSmartRequest): Promise<ChatResponse> {
  try {
    const { runMoA } = await import("../moa/runtime");
    return await runMoA(req.messages, {
      brainId: req.brainId,
      model: req.model,
      maxTokens: req.maxTokens,
      passphrase: req.passphrase,
      signal: req.signal,
      onChunk: req.onChunk,
    });
  } catch {
    // Runtime unavailable or threw before its own guards — use the existing
    // single-provider path verbatim so behaviour is identical to chat().
    return chat(req);
  }
}
