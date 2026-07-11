/**
 * Provider configurations live in localStorage. The user keeps full sovereignty
 * over which providers they enable and which models they use. Nothing is
 * synced to a remote server; the user can export/import their config from the
 * Privacy panel.
 */

import type { ProviderConfig, ProviderId } from "../providers/types";
import { PROVIDERS } from "../providers";

const STORAGE_KEY = "starseed.ai.providers";
const ACTIVE_KEY = "starseed.ai.activeProvider";

export function loadConfigs(): ProviderConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfigs();
    const parsed = JSON.parse(raw) as ProviderConfig[];
    if (!Array.isArray(parsed) || !parsed.length) return defaultConfigs();
    
    // Auto-migrate: add any missing default providers that were introduced in later versions
    const defaults = defaultConfigs();
    for (const def of defaults) {
      if (!parsed.find((p) => p.id === def.id)) {
        parsed.push(def);
      }
    }
    return parsed;
  } catch {
    return defaultConfigs();
  }
}

export function saveConfigs(configs: ProviderConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

export function getActiveProviderId(): ProviderId | null {
  if (typeof window === "undefined") return null;
  return (window.localStorage.getItem(ACTIVE_KEY) as ProviderId | null) || null;
}

export function setActiveProviderId(id: ProviderId | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(ACTIVE_KEY, id);
  else window.localStorage.removeItem(ACTIVE_KEY);
}

/**
 * The default config bundle: Ollama enabled (no key needed) so the user can
 * start using the AI immediately if they have Ollama installed locally.
 */
export function defaultConfigs(): ProviderConfig[] {
  return [
    {
      id: "starseed",
      label: PROVIDERS.starseed.info.label,
      baseUrl: PROVIDERS.starseed.info.defaultBaseUrl,
      encryptedKey: "",
      models: [...PROVIDERS.starseed.info.defaultModels],
      defaultModel: PROVIDERS.starseed.info.defaultModels[0],
      enabled: true,
    },
    {
      id: "ollama",
      label: PROVIDERS.ollama.info.label,
      baseUrl: PROVIDERS.ollama.info.defaultBaseUrl,
      encryptedKey: "",
      models: [...PROVIDERS.ollama.info.defaultModels],
      defaultModel: PROVIDERS.ollama.info.defaultModels[0],
      enabled: false,
    },
    {
      id: "openrouter",
      label: PROVIDERS.openrouter.info.label,
      baseUrl: PROVIDERS.openrouter.info.defaultBaseUrl,
      encryptedKey: "",
      models: [...PROVIDERS.openrouter.info.defaultModels],
      defaultModel: PROVIDERS.openrouter.info.defaultModels[0],
      enabled: false,
    },
  ];
}

export function wipeProviderStore(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_KEY);
}

/** Returns a JSON blob the user can download as a backup. */
export function exportProviderConfig(): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      providers: loadConfigs(),
      activeProvider: getActiveProviderId(),
    },
    null,
    2
  );
}

export function importProviderConfig(json: string): void {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed?.providers)) throw new Error("Formato de import inválido.");
  saveConfigs(parsed.providers);
  if (parsed.activeProvider) setActiveProviderId(parsed.activeProvider);
}
