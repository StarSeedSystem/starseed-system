"use client";

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ASTRAURA · SISTEMA UNIFICADO ADAPTATIVO DE INTELIGENCIA (Adenda 71-bis)
 * ----------------------------------------------------------------------------
 * El usuario pidió que el catálogo NO viva solo en `free-catalog.ts` ni dependa
 * de un fetch puntual, sino que sea un SISTEMA UNIFICADO que integre:
 *
 *   (1) Catálogo curado estático (FREE_CATALOG) — fuente de verdad de
 *       metadatos honestos (límites/why/flags).
 *   (2) Catálogo VIVO de OpenRouter :free (openrouter-live-catalog) — ya
 *       muta FREE_CATALOG en runtime; se combina aquí también.
 *   (3) FUENTES INSTALADAS DESDE LA BIBLIOTECA (starseed.library.installed.v1
 *       → kind 'ai-source' → payload.catalogSourceId) — cualquier API/librería que
 *       el usuario instale se registra aquí y queda DISPONIBLE para Astraura y
 *       para los ajustes de personalidad por área, sin tocar código.
 *   (4) Listas comunitarias de descubrimiento — DOS fuentes independientes:
 *       · free-llm-sync / awesome-freellm-apis → telemetría (cuántas APIs
 *         gratis hay "ahí fuera", solo un contador).
 *       · free-sources-sync / cheahjs/free-llm-api-resources → PARSEADA de
 *         verdad: extrae proveedores, límites y enlace de clave, cruza contra
 *         FREE_CATALOG para no duplicar, y anota los nuevos como candidatos
 *         (`registerHuggingBayCandidate`). `freeSourceSuggestions()` expone el
 *         resultado para Ajustes → Inteligencia ("fuentes gratis disponibles
 *         con enlace para clave"). Ver cabecera de `free-sources-sync.ts` para
 *         el porqué de huggingbay.xyz NO ser una tercera fuente aquí (es un
 *         catálogo de metadatos de modelos, no un proveedor de inferencia).
 *
 * TODO se resuelve con un ROUTER ADAPTATIVO: `getUnifiedCatalog()` devuelve
 * TODAS las fuentes combinadas; `availability.detectAvailability` itera ESTE
 * catálogo unificado (no solo FREE_CATALOG), así que `rankCandidates` del
 * router, `intelligencePinFor` (pins por área) y la UI ven TODAS las fuentes
 * y eligen la MEJOR `:free`/sin-clave por tarea, con fallback automático
 * entre fuentes (si una cae en cooldown, la siguiente mejor entra sola).
 *
 * El pin de personalidad admite ahora modo "auto": `intelligencePinFor` resuelve
 * vía `resolveAutoModel(sense)` → la mejor fuente/modelo `:free` del catálogo
 * unificado para ese sentido (código/razonamiento/visión/chat). Así "usar
 * OpenRouter como motor" se entiende como "usar el mejor motor :free disponible
 * del ecosistema unificado", ajustable por área.
 *
 * REGLAS DURAS: nunca lanza; sin red en SSR; el catálogo estático SIEMPRE
 * es el respaldo; solo modelos :free / sin-clave (coste 0) entran al ranking
 * automático (los de pago solo vía pin explícito con permitirPago).
 * ═════════════════════════════════════════════════════════════════════════
 */

import { FREE_CATALOG, findSource, type CatalogSource, type CatalogModel, type TaskKind } from "./free-catalog";
import { liveOpenRouterSource } from "./openrouter-live-catalog";
import { readFreeLlmHint } from "./free-llm-sync";
import {
  refreshFreeSourcesFromLists,
  getFreeSourceSuggestions,
  type FreeSourceSuggestion,
} from "./free-sources-sync";

/* ───────────────────── Claves y eventos ───────────────────── */

export const UNIFIED_EVENT = "starseed:unified-intelligence";

/* ───────────────────── Estado en memoria (singleton) ───────────────────── */

/** Fuentes registradas en runtime desde la Biblioteca (id → fuente). */
const librarySources = new Map<string, CatalogSource>();
let started = false;

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emit(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent(UNIFIED_EVENT, { detail: librarySources.size }));
  } catch {
    /* noop */
  }
}

/** Suscripción simple para la UI. */
export function subscribeUnified(cb: () => void): () => void {
  if (!isClient()) return () => {};
  window.addEventListener(UNIFIED_EVENT, cb);
  return () => window.removeEventListener(UNIFIED_EVENT, cb);
}

/* ───────────────────── Registro desde la Biblioteca ───────────────────── */

/**
 * Registra (o actualiza) una fuente venida de un paquete `ai-source` instalado
 * desde la Biblioteca. `catalogSourceId` puede ser:
 *   · un id YA en FREE_CATALOG (p.ej. "openrouter-free") → se reactiva/marca
 *     `fromLibrary` y se respeta su definición curada;
 *   · un id NUEVO (p.ej. una API propia del usuario) → se crea una fuente
 *     mínima válida (providerId+baseUrl+models) para que Astraura la use.
 * Idempotente: registrar dos veces la misma id la actualiza, no duplica.
 */
export function registerLibrarySource(opts: {
  catalogSourceId: string;
  label?: string;
  providerId?: string;
  baseUrl?: string;
  models?: string[];
  requiresKey?: boolean;
  tier?: CatalogSource["tier"];
  privacy?: CatalogSource["privacy"];
  why?: string;
  limits?: string;
}): boolean {
  if (!opts?.catalogSourceId) return false;
  try {
    const id = opts.catalogSourceId;
    const existing = findSource(id);
    const src: CatalogSource = existing
      ? { ...existing, fromLibrary: true }
      : {
          id,
          label: opts.label || id,
          tier: opts.tier || (opts.requiresKey ? "free-key" : "instant"),
          providerId: (opts.providerId as CatalogSource["providerId"]) || "openai-compatible",
          baseUrl: opts.baseUrl || "https://openrouter.ai/api/v1",
          requiresKey: opts.requiresKey ?? true,
          preferFreeModels: true,
          privacy: opts.privacy || "cloud",
          weight: 1,
          limits: opts.limits || "Fuente instalada desde la Biblioteca.",
          why: opts.why || "Instalada por el usuario desde la Biblioteca de StarSeed.",
          models: (opts.models && opts.models.length
            ? opts.models.map((m) => ({ id: m, label: m, strengths: ["chat" as TaskKind], quality: 6 }))
            : [{ id: "openrouter/free", label: "OpenRouter free", strengths: ["chat" as TaskKind], quality: 6 }]) as CatalogModel[],
          fromLibrary: true,
        };
    librarySources.set(id, src);
    emit();
    return true;
  } catch {
    return false;
  }
}

/** Quita una fuente de Biblioteca (al desinstalar el paquete). */
export function unregisterLibrarySource(catalogSourceId: string): void {
  if (librarySources.delete(catalogSourceId)) emit();
}

/** ¿Está una fuente registrada desde la Biblioteca? */
export function isLibrarySource(id: string): boolean {
  return librarySources.has(id);
}

/* ───────────────────── Catálogo unificado ───────────────────── */

/**
 * Devuelve TODAS las fuentes disponibles combinadas:
 *   FREE_CATALOG (ya mutado con OpenRouter vivo en runtime) + fuentes de
 *   Biblioteca registradas. Es lo que `availability.detectAvailability` itera,
 *   así que el router, los pins por área y la UI ven el ecosistema completo.
 * Defensivo: si el catálogo vivo no está listo, FREE_CATALOG sigue siendo
 * válido (openrouter-live-catalog hace fallback al estático en su export).
 */
export function getUnifiedCatalog(): CatalogSource[] {
  const base = FREE_CATALOG;
  if (librarySources.size === 0) return base;
  // Asegura que la fuente openrouter-free del catálogo base sea la VIVA.
  const out: CatalogSource[] = [];
  for (const s of base) {
    if (s.id === "openrouter-free") {
      const live = liveOpenRouterSource();
      out.push(live && live.models.length ? live : s);
    } else {
      out.push(s);
    }
  }
  for (const s of librarySources.values()) out.push(s);
  return out;
}

/** Nº de fuentes de Biblioteca activas (para telemetría/UI). */
export function librarySourceCount(): number {
  return librarySources.size;
}

/* ───────────────────── Router adaptativo por tarea ───────────────────── */

export type UnifiedSense = "chat" | "code" | "reasoning" | "vision" | "voice" | "global";

/**
 * Resuelve el mejor { fuente, modelo } `:free`/sin-clave del catálogo
 * unificado para un sentido dado. Usado por `intelligencePinFor` cuando el
 * pin de personalidad es modo "auto" (el usuario quiere "el mejor motor
 * disponible", no uno fijado a mano). Con fallback: si el primero no está
 * listo, elige el siguiente mejor de esa tarea.
 */
export function resolveAutoModel(sense: string): { fuente: string; modelo: string } | null {
  try {
    const taskForSense: Record<string, TaskKind> = {
      chat: "chat",
      code: "code",
      reasoning: "reasoning",
      vision: "vision",
      voice: "fast",
      global: "chat",
    };
    const task = taskForSense[sense] || "chat";
    const catalog = getUnifiedCatalog();
    const ranked: { src: CatalogSource; model: CatalogModel; score: number }[] = [];
    for (const src of catalog) {
      // Solo gratis: excluimos paid (requiere clave de pago). Las fuentes
      // sin-clave (OVHcloud anónimo, Pollinations…) y free-key (:free)
      // SÍ entran — el ecosistema es gratis-primero.
      if (src.requiresKey && src.tier === "paid") continue;
      for (const m of src.models || []) {
        let score = (m.quality || 6) * 2;
        if ((m.strengths || []).includes(task)) score += 12;
        if (task === "vision" && m.vision) score += 8;
        if (src.requiresKey === false) score += 3; // sin-clave preferible
        if (m.context && m.context >= 200_000) score += 2;
        // (Adenda 71-bis) OpenRouter es el MOTOR de modelos: prioridad base
        // para que el catálogo unificado lo use por defecto y solo caa a
        // otras fuentes gratis si OpenRouter no cubre la tarea.
        if (src.id === "openrouter-free") score += 15;
        ranked.push({ src, model: m, score });
      }
    }
    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return null;
    return { fuente: best.src.id, modelo: best.model.id };
  } catch {
    return null;
  }
}

/* ───────────────────── Arranque (enganche al auto-update del OS) ───────────────────── */

/**
 * Arranca el sistema unificado: se engancha al mismo sistema de auto-update
 * del OS que el catálogo vivo (refresco periódico + evento de Biblioteca).
 * Relee las fuentes instaladas de la Biblioteca y las registra. Idempotente.
 */
export function startUnifiedIntelligence(): void {
  if (!isClient() || started) return;
  started = true;
  try {
    // (1) Carga inicial desde la Biblioteca (best-effort, defensivo).
    reindexLibrarySources();
    // (2) Reindexa cada vez que la Biblioteca cambia (instalar/desinstalar).
    window.addEventListener("starseed:library", () => reindexLibrarySources());
    // (3) Descubrimiento de fuentes gratis (cheahjs/free-llm-api-resources):
    //     red best-effort, nunca bloquea el arranque ni lanza.
    void refreshFreeSourcesFromLists();
  } catch {
    /* noop */
  }
}

/** Relee starseed.library.installed.v1 y registra los ai-source. */
function reindexLibrarySources(): void {
  try {
    const raw = window.localStorage.getItem("starseed.library.installed.v1");
    if (!raw) return;
    const installed = JSON.parse(raw) as Record<string, { kind?: string; version?: string }>;
    for (const [pkgId, entry] of Object.entries(installed)) {
      if (entry?.kind !== "ai-source") continue;
      // El catalogSourceId vive en el payload del paquete, no en el registro
      // de instalados (que solo guarda kind/version). Lo derivamos del id del
      // paquete: los ai-source se siembran como `ai-<catalogId>`.
      const m = /^ai-(.+)$/.exec(pkgId);
      if (!m) continue;
      const catalogSourceId = m[1];
      // Si YA está en el catálogo curado, basta con marcarlo disponible;
      // si no, lo registramos mínimo para que Astraura pueda usarlo.
      if (!findSource(catalogSourceId)) {
        registerLibrarySource({ catalogSourceId });
      } else if (!librarySources.has(catalogSourceId)) {
        // Fuente curada instalada: la marcamos como de Biblioteca para la UI.
        registerLibrarySource({ catalogSourceId });
      }
    }
  } catch {
    /* noop */
  }
}

/** Telemetría de descubrimiento (lista comunitaria awesome-freellm-apis). */
export function communityHint(): { count: number; at: number } | null {
  return readFreeLlmHint();
}

/**
 * Fuentes gratis descubiertas en `cheahjs/free-llm-api-resources`, listas para
 * que Ajustes → Inteligencia las muestre ("fuentes gratis disponibles con
 * enlace para clave"). Solo datos — nunca activa nada por su cuenta; las
 * fuentes que requieren clave se SUGIEREN (ver `free-sources-sync.ts`).
 * Por defecto excluye "créditos de prueba" (no son un tier gratis permanente).
 */
export function freeSourceSuggestions(includeTrialCredits = false): FreeSourceSuggestion[] {
  return getFreeSourceSuggestions({ includeTrialCredits });
}
