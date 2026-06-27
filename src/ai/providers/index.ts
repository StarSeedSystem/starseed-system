/**
 * Provider registry. Centralized lookup so call sites stay provider-agnostic.
 */

import type { Provider, ProviderId } from "./types";
import { starseedProvider } from "./starseed";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";
import { deepseekProvider } from "./deepseek";
import { groqProvider } from "./groq";

export const PROVIDERS: Record<ProviderId, Provider> = {
  starseed: starseedProvider,
  ollama: ollamaProvider,
  openai: openaiProvider,
  // OpenAI-compatible reuses the OpenAI adapter with a different base URL.
  "openai-compatible": openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  deepseek: deepseekProvider,
  groq: groqProvider,
};

/** Ordered for the picker UI: privacy-first first. */
export const PROVIDER_ORDER: ProviderId[] = [
  "starseed",
  "ollama",
  "deepseek",
  "groq",
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
