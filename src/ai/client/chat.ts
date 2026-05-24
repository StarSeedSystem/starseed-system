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
