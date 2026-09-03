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
import { openrouterProvider } from "./openrouter";
import { nvidiaProvider } from "./nvidia";
import { astraura158Provider } from "./astraura-158";

export const PROVIDERS: Record<ProviderId, Provider> = {
  // Astraura 1.58-bit (Adenda 153): backend soberano propio, PRIMARIO por defecto.
  "astraura-158": astraura158Provider,
  starseed: starseedProvider,
  ollama: ollamaProvider,
  openai: openaiProvider,
  // OpenAI-compatible reuses the OpenAI adapter with a different base URL.
  "openai-compatible": openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  deepseek: deepseekProvider,
  groq: groqProvider,
  // OpenRouter tiene adaptador PROPIO desde la Adenda 67 (P0-2): envía las
  // cabeceras `HTTP-Referer`/`X-Title` que OpenRouter espera de una app web,
  // ignora los keep-alive SSE (": OPENROUTER PROCESSING") y prioriza `:free`.
  // Antes era un `openaiProvider` con otra `info` → sin cabeceras, y con ids de
  // modelo por defecto obsoletos (`google/gemini-pro` ya no existe).
  openrouter: openrouterProvider,
  // NVIDIA NIM (Adenda 219): 80+ modelos abiertos en GPUs de NVIDIA; acceso
  // comunitario por /api/ai/nvidia (clave compartida solo en el servidor).
  nvidia: nvidiaProvider,
};

/** Ordered for the picker UI: privacy-first first. */
export const PROVIDER_ORDER: ProviderId[] = [
  "astraura-158",
  "starseed",
  "ollama",
  "deepseek",
  "groq",
  "openrouter",
  "nvidia",
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
