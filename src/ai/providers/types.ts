/**
 * Multi-provider AI abstraction layer for the Exocórtex.
 *
 * Principle: the user is sovereign over their AI. The system must let them choose
 * any provider — local (Ollama), or any cloud API with their own key — without
 * lock-in. Keys never leave the user's device unencrypted.
 *
 * See: memory/principles.md §2.4 (Exocórtex) and memory/architecture.md.
 */

/**
 * `astraura-158` (Adenda 153): backend soberano Astraura 1.58-bit — el SISTEMA
 * PRIMARIO por defecto del OS. Ver architecture/astraura-158-sistema-primario.md.
 */
export type ProviderId = "astraura-158" | "starseed" | "ollama" | "openai" | "anthropic" | "google" | "openai-compatible" | "deepseek" | "groq" | "openrouter";

export interface ProviderInfo {
  id: ProviderId;
  /** Human-readable name. */
  label: string;
  /** Short description for the UI. */
  description: string;
  /** Whether this provider requires an API key. */
  requiresKey: boolean;
  /** Whether this provider runs locally (no data leaves the device). */
  local: boolean;
  /** Default base URL (can be overridden by the user). */
  defaultBaseUrl: string;
  /** Where to obtain a key, if any. */
  getKeyUrl?: string;
  /** Default models offered (the user can override). */
  defaultModels: string[];
}

export interface ProviderConfig {
  id: ProviderId;
  /** User-friendly label, can be set to differentiate multiple configs of the same provider. */
  label: string;
  /** Override base URL — useful for OpenAI-compatible providers (Groq, Together, LM Studio). */
  baseUrl: string;
  /** Encrypted API key (base64 ciphertext). Empty string for local providers. */
  encryptedKey: string;
  /** Models the user has enabled for this provider. */
  models: string[];
  /** Default model id when this provider is selected. */
  defaultModel: string;
  /** Whether the user has enabled this provider for chat. */
  enabled: boolean;
  /** Timestamp of last successful test connection (ms). */
  lastVerifiedAt?: number;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  /** Model identifier specific to the provider (e.g. "gpt-4o-mini", "claude-3-5-haiku", "llama3.2"). */
  model: string;
  /** Sampling temperature (0..2). */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** AbortSignal to cancel an in-flight request. */
  signal?: AbortSignal;
  /** Called for each streamed chunk (if streaming is supported). */
  onChunk?: (delta: string) => void;
}

export interface ChatResponse {
  /** Full text of the assistant's reply. */
  text: string;
  /** Provider-specific raw response, for debugging. */
  raw?: unknown;
  /** Token usage if reported by the provider. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/**
 * Adapter for a single AI provider. All providers must implement this contract,
 * keeping the call site in the rest of the app provider-agnostic.
 */
export interface Provider {
  info: ProviderInfo;
  /**
   * Send a chat completion to the provider.
   * @param config user's provider configuration (already decrypted)
   * @param messages full conversation history (caller is responsible for trimming)
   * @param options model selection + sampling parameters
   */
  chat(
    config: DecryptedProviderConfig,
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<ChatResponse>;
  /**
   * Optional: list models available on this provider (called on demand).
   */
  listModels?(config: DecryptedProviderConfig): Promise<string[]>;
}

/**
 * Same shape as ProviderConfig but with the key already decrypted in memory.
 * NEVER persist this — only pass to provider.chat() inside the user's session.
 */
export interface DecryptedProviderConfig extends Omit<ProviderConfig, "encryptedKey"> {
  apiKey: string;
}
