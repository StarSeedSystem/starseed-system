/**
 * Provider registry. Centralized lookup so call sites stay provider-agnostic.
 */

import type { Provider, ProviderId } from "./types";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";

export const PROVIDERS: Record<ProviderId, Provider> = {
  ollama: ollamaProvider,
  openai: openaiProvider,
  // OpenAI-compatible reuses the OpenAI adapter with a different base URL.
  "openai-compatible": openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
};

/** Ordered for the picker UI: privacy-first first. */
export const PROVIDER_ORDER: ProviderId[] = [
  "ollama",
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
];

export function getProvider(id: ProviderId): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export * from "./types";
