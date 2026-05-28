/**
 * Connection Priority — selector inteligente de proveedor IA / servicio.
 *
 * Reglas por defecto (en orden):
 *   1. IA local (Ollama, vLLM, LM Studio) — gratis, soberana
 *   2. Skills locales del stack — gratis
 *   3. Claude API con key del usuario
 *   4. OpenAI / Gemini con key del usuario
 *   5. OpenRouter / Groq (free tier)
 *
 * Configurable: el usuario puede reordenar o forzar uno específico.
 * Las decisiones quedan loggeadas para el AI Studio.
 */

export type ProviderTier = 'local-free' | 'skill-free' | 'byok' | 'free-tier' | 'paid';
export type ProviderKey = 'ollama' | 'vllm' | 'lmstudio' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'groq' | 'skill';

export interface ProviderCapability {
  key: ProviderKey;
  label: string;
  tier: ProviderTier;
  /** ¿Disponible ahora? (presencia de key, server local up, etc.) */
  available: boolean;
  /** Latencia media en ms. */
  avgLatencyMs?: number;
  /** Coste estimado por 1k tokens en USD. */
  costPer1kUsd?: number;
  /** Capacidades soportadas. */
  capabilities: ('chat' | 'embed' | 'vision' | 'tool_use' | 'streaming' | 'voice')[];
}

const STORAGE_KEY = 'starseed.connection-priority.v1';

const DEFAULT_PRIORITY: ProviderKey[] = ['ollama', 'lmstudio', 'vllm', 'skill', 'anthropic', 'openai', 'gemini', 'openrouter', 'groq'];

export function loadPriority(): ProviderKey[] {
  if (typeof window === 'undefined') return DEFAULT_PRIORITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* noop */ }
  return DEFAULT_PRIORITY;
}

export function savePriority(order: ProviderKey[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch { /* noop */ }
}

/**
 * Selecciona el mejor provider disponible. Devuelve el primero que pasa
 * el filtro `requiresCapability` y esté disponible, en el orden configurado.
 */
export function selectBestProvider(
  capabilities: ProviderCapability[],
  requiresCapability?: ProviderCapability['capabilities'][number],
): ProviderCapability | null {
  const order = loadPriority();
  for (const key of order) {
    const cap = capabilities.find((c) => c.key === key);
    if (!cap || !cap.available) continue;
    if (requiresCapability && !cap.capabilities.includes(requiresCapability)) continue;
    return cap;
  }
  return null;
}

/** Detecta capacidades disponibles examinando localStorage + APIs del navegador. */
export function detectCapabilities(): ProviderCapability[] {
  // En cliente real, leeríamos del providerStore. Stub:
  return [
    { key: 'ollama',    label: 'Ollama (local)',     tier: 'local-free', available: false, capabilities: ['chat', 'embed', 'streaming', 'tool_use'], costPer1kUsd: 0 },
    { key: 'lmstudio',  label: 'LM Studio (local)',  tier: 'local-free', available: false, capabilities: ['chat', 'streaming'], costPer1kUsd: 0 },
    { key: 'skill',     label: 'Skill local',        tier: 'skill-free', available: true,  capabilities: ['tool_use'], costPer1kUsd: 0 },
    { key: 'anthropic', label: 'Anthropic Claude',   tier: 'byok',       available: false, capabilities: ['chat', 'vision', 'tool_use', 'streaming'], costPer1kUsd: 0.003 },
    { key: 'openai',    label: 'OpenAI compat.',     tier: 'byok',       available: false, capabilities: ['chat', 'embed', 'vision', 'tool_use', 'streaming', 'voice'], costPer1kUsd: 0.002 },
    { key: 'gemini',    label: 'Google Gemini',      tier: 'byok',       available: false, capabilities: ['chat', 'vision', 'streaming'], costPer1kUsd: 0.001 },
    { key: 'openrouter',label: 'OpenRouter free',    tier: 'free-tier',  available: false, capabilities: ['chat'], costPer1kUsd: 0 },
    { key: 'groq',      label: 'Groq free tier',     tier: 'free-tier',  available: false, capabilities: ['chat', 'streaming'], costPer1kUsd: 0 },
  ];
}
