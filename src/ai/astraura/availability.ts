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
import { chromeAiAvailable, webgpuAvailable } from "./builtin-engines";

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

  for (const source of FREE_CATALOG) {
    const userConfig = userConfigForSource(source, configs);

    if (source.baseUrl === "builtin://chrome-ai") {
      const ok = fast ? typeof window !== "undefined" && !!(window as any).LanguageModel : await chromeAiAvailable();
      out.push({ source, ready: ok, reason: ok ? undefined : "Este navegador no trae la Prompt API (Chrome 148+)." });
      continue;
    }
    if (source.baseUrl === "builtin://webllm") {
      const ok = webgpuAvailable();
      out.push({ source, ready: ok, reason: ok ? undefined : "Sin WebGPU en este navegador." });
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
      // Instant cloud (Pollinations): siempre listo salvo que estemos offline.
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

/** Resumen legible de lo detectado (para el panel y para Aurora al presentarse). */
export function summarizeAvailability(list: SourceAvailability[]): string {
  const ready = list.filter((a) => a.ready && a.source.tier !== "paid").map((a) => a.source.label);
  const missing = list.filter((a) => !a.ready && a.source.tier === "free-key").map((a) => a.source.label);
  const parts: string[] = [];
  if (ready.length) parts.push(`Listas: ${ready.join(", ")}.`);
  if (missing.length) parts.push(`Gratis con clave (sin conectar): ${missing.join(", ")}.`);
  return parts.join(" ") || "Sin fuentes detectadas todavía.";
}
