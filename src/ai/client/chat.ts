/**
 * High-level client-side chat entry point. Picks the active provider, decrypts
 * the user's key in-memory, and calls the provider adapter. Designed to be the
 * ONE function the rest of the app calls when talking to an AI.
 */

"use client";

import { getProvider, type ChatMessage, type ChatOptions, type ChatResponse, type ProviderId, type DecryptedProviderConfig } from "../providers";
import { decryptKey } from "./keyStorage";
import { loadConfigs, getActiveProviderId } from "./providerStore";

/**
 * Ad-hoc provider override (ADDITIVE / OPTIONAL).
 *
 * When a caller already knows EXACTLY which provider + endpoint + key to use
 * (e.g. a per-chat selector with a custom Ollama base URL, or a bring-your-own
 * custom API), it can pass this and bypass the stored-config lookup entirely.
 * The key here is provided in PLAINTEXT in-memory (never persisted by chat()).
 *
 * This is purely opt-in: when `providerOverride` is absent, chat() behaves
 * byte-for-byte as before (resolve the active/stored provider config).
 */
export interface ChatProviderOverride {
  /** Which adapter to use. Defaults to "openai-compatible" when a baseUrl is set. */
  providerId?: ProviderId;
  /** Endpoint base URL (e.g. http://localhost:11434 for Ollama, or any custom API). */
  baseUrl?: string;
  /** Model id to request. */
  model?: string;
  /** Plaintext API key (optional — local providers need none). */
  apiKey?: string;
  /** Optional label, purely informational. */
  label?: string;
}

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
  /**
   * OPTIONAL ad-hoc provider+endpoint+key. When present, chat() talks to this
   * exact provider instead of resolving one from the stored config. Backward
   * compatible: existing callers that never set it are completely unaffected.
   */
  providerOverride?: ChatProviderOverride;
}

/**
 * Build a fully-formed, in-memory DecryptedProviderConfig from an ad-hoc
 * override so we can call a provider adapter directly. Never throws on its own;
 * resolves sensible defaults for the chosen adapter.
 */
function configFromOverride(ov: ChatProviderOverride): { config: DecryptedProviderConfig; provider: ReturnType<typeof getProvider>; model: string } {
  // If a baseUrl is supplied but no providerId, assume an OpenAI-compatible API
  // (the common case for "any custom service / API"). Otherwise honour the id.
  const providerId: ProviderId =
    ov.providerId ?? (ov.baseUrl ? "openai-compatible" : "starseed");
  const provider = getProvider(providerId);
  const baseUrl = (ov.baseUrl && ov.baseUrl.trim()) || provider.info.defaultBaseUrl;
  const model = (ov.model && ov.model.trim()) || provider.info.defaultModels[0];
  const config: DecryptedProviderConfig = {
    id: providerId,
    label: ov.label || provider.info.label,
    baseUrl,
    apiKey: ov.apiKey || "",
    models: model ? [model] : [...provider.info.defaultModels],
    defaultModel: model,
    enabled: true,
  };
  return { config, provider, model };
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  // ── Ad-hoc provider override path (opt-in) ────────────────────────────────
  if (req.providerOverride && (req.providerOverride.providerId || req.providerOverride.baseUrl)) {
    const { config, provider, model } = configFromOverride(req.providerOverride);
    const options: ChatOptions = {
      model: req.model || model,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
      onChunk: req.onChunk,
    };
    return provider.chat(config, req.messages, options);
  }

  // ── Existing stored-config path (unchanged) ───────────────────────────────
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
  /**
   * OPTIONAL explicit MoA mode. When provided it takes precedence over the
   * resolved global/brain config for THIS call only. Used by per-chat sessions
   * to request "single" (a fixed provider) vs "auto" (let Aurora route).
   */
  moaMode?: "single" | "router" | "moa" | "crew";
  /**
   * OPTIONAL list of memory-root ids to inject as context for THIS call,
   * independent of any brain. Reuses the same memory-context injection as
   * brains. Absent → no extra context (identical to before).
   */
  memoryRootIds?: string[];
  /**
   * OPTIONAL progress breadcrumbs from the MoA runtime (mode chosen, proposer
   * counts, aggregation, fallbacks). Purely informational for the caller's UI/
   * telemetry. Absent → no-op (identical to before). Never user-facing by
   * default; the runtime keeps the final streamed answer on `onChunk`.
   */
  onProgress?: (stage: string, detail?: string) => void;
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
      providerOverride: req.providerOverride,
      moaModeOverride: req.moaMode,
      memoryRootIds: req.memoryRootIds,
      temperature: req.temperature,
      onProgress: req.onProgress,
    });
  } catch {
    // Runtime unavailable or threw before its own guards — use the existing
    // single-provider path verbatim so behaviour is identical to chat().
    return chat(req);
  }
}
