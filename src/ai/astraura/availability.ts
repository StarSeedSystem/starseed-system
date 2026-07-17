"use client";

/**
 * ASTRAURA · Disponibilidad de fuentes de inteligencia.
 * -----------------------------------------------------
 * Aurora, desde el INICIO y para todos los usuarios, detecta qué servicios
 * tiene disponibles cada usuario/contexto (claves configuradas, Ollama o
 * LM Studio corriendo, WebGPU, IA integrada del navegador) para integrar
 * funcionalmente los servicios preferidos del usuario y, por defecto, elegir
 * las mejores opciones GRATUITAS.
 *
 * Sondas con timeout corto y caché en memoria (TTL) para no molestar.
 * Defensivo y SSR-safe: nunca lanza; sin red en SSR.
 */

import { loadConfigs } from "@/ai/client/providerStore";
import type { ProviderConfig } from "@/ai/providers/types";
import { FREE_CATALOG, type CatalogSource } from "./free-catalog";
// (Adenda 71-bis) Catálogo UNIFICADO: combina el curado + OpenRouter vivo
// + fuentes instaladas desde la Biblioteca. El router adaptativo itera ESTE.
import { getUnifiedCatalog } from "./unified-intelligence";
import { chromeAiAvailable, webgpuAvailable } from "./builtin-engines";
import { isDownloadableSource, isModelInstalled } from "./installed-models";

export interface SourceAvailability {
  source: CatalogSource;
  /** ¿Se puede usar AHORA MISMO? */
  ready: boolean;
  /** Config del usuario que la sirve (si la conectó él). */
  userConfig?: ProviderConfig;
  /** Motivo legible cuando no está lista (transparencia). */
  reason?: string;
}

const PROBE_TTL_MS = 60_000;
const probeCache = new Map<string, { at: number; ok: boolean }>();

async function probe(url: string, ms = 1200): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const hit = probeCache.get(url);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.ok;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    const ok = res.ok;
    probeCache.set(url, { at: Date.now(), ok });
    return ok;
  } catch {
    probeCache.set(url, { at: Date.now(), ok: false });
    return false;
  }
}

function norm(u: string): string {
  return (u || "").replace(/\/+$/, "").toLowerCase();
}

/** Busca una config del usuario que sirva a esta fuente (por provider/baseUrl). */
export function userConfigForSource(source: CatalogSource, configs?: ProviderConfig[]): ProviderConfig | undefined {
  const list = configs ?? loadConfigs();
  return list.find((c) => {
    if (!c.enabled) return false;
    if (norm(c.baseUrl) === norm(source.baseUrl)) return true;
    // Providers dedicados (groq/google/anthropic/openai/ollama) casan por id.
    if (source.providerId !== "openai-compatible" && source.providerId !== "starseed" && c.id === source.providerId) return true;
    return false;
  });
}

/**
 * Calcula la disponibilidad de TODAS las fuentes del catálogo.
 * `fast=true` evita sondas de red (solo claves + capacidades del navegador).
 */
export async function detectAvailability(fast = false): Promise<SourceAvailability[]> {
  const configs = typeof window === "undefined" ? [] : loadConfigs();
  const out: SourceAvailability[] = [];

  for (const source of getUnifiedCatalog()) {
    const userConfig = userConfigForSource(source, configs);

    // ── MODELOS DESCARGABLES (opt-in): NUNCA "ready" salvo que el usuario los
    //    haya INSTALADO. Así el router jamás dispara una descarga enorme solo y
    //    Aurora usa la mejor alternativa gratis mientras. El modal de instalación
    //    se ofrece aparte (installed-models + install-model-modal).
    if (isDownloadableSource(source.id)) {
      const installed = isModelInstalled(source.id);
      const hasEngine =
        source.baseUrl === "builtin://chrome-ai"
          ? (typeof window !== "undefined" && !!(window as any).LanguageModel)
          : webgpuAvailable();
      out.push({
        source,
        ready: installed && hasEngine,
        userConfig,
        reason: !hasEngine
          ? (source.baseUrl === "builtin://chrome-ai" ? "Este navegador no trae la Prompt API (Chrome 148+)." : "Sin WebGPU en este navegador.")
          : installed ? undefined : "Modelo local disponible — instálalo (opcional) para usarlo.",
      });
      continue;
    }
    // ── OmniRoute (proxy local, jul-2026): opt-in explícito vía
    //    IntelligenceSettings.omniRoute — nunca se sondea solo, a diferencia
    //    del resto de fuentes "local", porque requiere que el usuario active la
    //    capa a propósito (documentado en architecture/astraura-inteligencia.md §15.4).
    if (source.id === "omniroute-local") {
      let cfg: { enabled: boolean; endpoint: string } = { enabled: false, endpoint: source.baseUrl.replace(/\/v1$/, "") };
      try {
        const router = await import("./router");
        const settings = router.getIntelligenceSettings();
        if (settings.omniRoute) cfg = settings.omniRoute;
      } catch { /* defensivo: sin ajuste guardado, se trata como deshabilitado */ }
      if (!cfg.enabled) {
        out.push({ source, ready: false, userConfig, reason: "Desactivado (actívalo en Ajustes → Inteligencia si tienes OmniRoute corriendo)." });
        continue;
      }
      const endpoint = (cfg.endpoint || source.baseUrl.replace(/\/v1$/, "")).replace(/\/+$/, "");
      const ok = fast ? true : await probe(`${endpoint}/v1/models`);
      out.push({
        source, ready: ok, userConfig,
        reason: ok ? undefined : `OmniRoute no responde en ${endpoint} (¿está corriendo?).`,
      });
      continue;
    }
    if (source.tier === "local") {
      const probeUrl = source.id === "ollama-local"
        ? "http://localhost:11434/api/tags"
        : `${source.baseUrl}/models`;
      const ok = fast ? !!userConfig : await probe(probeUrl);
      out.push({
        source, ready: ok, userConfig,
        reason: ok ? undefined : `${source.label} no responde en este dispositivo.`,
      });
      continue;
    }
    if (!source.requiresKey) {
      // Instant cloud SIN CLAVE (Pollinations, OVHcloud anónimo, LLM7): la red
      // de seguridad universal. Siempre listas salvo que estemos offline.
      // `keyOptional` = si el usuario añadió una clave, se usa para subir
      // límites, pero JAMÁS es requisito para que la fuente esté disponible.
      const online = typeof navigator === "undefined" ? false : navigator.onLine !== false;
      out.push({ source, ready: online, userConfig, reason: online ? undefined : "Sin conexión." });
      continue;
    }
    // free-key / paid: listo si el usuario tiene una config habilitada con clave.
    const ok = !!userConfig && (!!userConfig.encryptedKey || !source.requiresKey);
    out.push({
      source, ready: ok, userConfig,
      reason: ok ? undefined : `Necesita clave gratuita (${source.getKeyUrl ?? "ver ajustes"}).`,
    });
  }
  return out;
}

/**
 * (Adenda 67 · P0-2) Disponibilidad BLINDADA: `detectAvailability()` se llama en
 * la ruta crítica de CADA respuesta de Aurora. Si lanzara (localStorage corrupto,
 * un `import()` que falla, una sonda que se cuelga), el throw escaparía del
 * failover y Aurora moriría con un error crudo.
 *
 * Esta envoltura garantiza que SIEMPRE se devuelve una lista utilizable:
 *   · con timeout global (las sondas locales nunca bloquean la conversación);
 *   · si todo falla, devuelve al menos las fuentes SIN CLAVE marcadas `ready`
 *     (Pollinations/OVH/LLM7), que es exactamente lo que necesita un invitado.
 * NUNCA lanza.
 */
export async function detectAvailabilitySafe(timeoutMs = 6000): Promise<SourceAvailability[]> {
  // Fallback defensivo: NO usa FREE_CATALOG crudo (estático), sino el catálogo
  // UNIFICADO (que ya incluye los modelos :free VIVOS si applyLiveOpenRouter()
  // corrió). Así la UI de ajustes por contexto refleja el catálogo real aunque
  // el sondeo/fetch falle. (Adenda 71-bis · 2026-07-17)
  const fallback = (): SourceAvailability[] =>
    getUnifiedCatalog().map((source) => ({
      source,
      ready: !source.requiresKey && source.privacy === "cloud" && source.tier !== "paid",
      reason: undefined,
    }));
  try {
    const timed = new Promise<SourceAvailability[]>((resolve) => {
      setTimeout(() => resolve(fallback()), timeoutMs);
    });
    const list = await Promise.race([detectAvailability().catch(() => fallback()), timed]);
    return Array.isArray(list) && list.length ? list : fallback();
  } catch {
    return fallback();
  }
}

/** Resumen legible de lo detectado (para el panel y para Aurora al presentarse). */
export function summarizeAvailability(list: SourceAvailability[]): string {
  const ready = list.filter((a) => a.ready && a.source.tier !== "paid").map((a) => a.source.label);
  const missing = list.filter((a) => !a.ready && a.source.tier === "free-key").map((a) => a.source.label);
  const parts: string[] = [];
  if (ready.length) parts.push(`Listas: ${ready.join(", ")}.`);
  if (missing.length) parts.push(`Gratis con clave (sin conectar): ${missing.join(", ")}.`);
  return parts.join(" ") || "Sin fuentes detectadas todavía.";
}
