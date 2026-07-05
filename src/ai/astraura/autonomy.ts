"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · AUTONOMÍA (Aurora mejora sus propias capacidades)
 * ---------------------------------------------------------------------------
 * Aurora busca de forma natural la MEJOR experiencia para cada contexto:
 *   1. Re-sondea qué fuentes tiene disponibles (nuevas claves, Ollama recién
 *      arrancado, WebGPU…) y qué se ha agotado.
 *   2. Genera SUGERENCIAS contextuales, priorizando SIEMPRE lo gratis y local
 *      de código abierto, con mejor resultado por menor coste.
 *   3. Aprende de las búsquedas e instalaciones del usuario (señales) para que
 *      la Biblioteca reordene sus recomendaciones.
 *
 * Esto es el "cerebro de mejora continua": no descarga nada por su cuenta ni
 * cambia ajustes sin permiso — PROPONE, y el usuario decide (soberanía). Las
 * novedades de repos/programas de todo internet se consultan a través de la
 * Biblioteca (paquetes/repos) y de este módulo de señales.
 *
 * localStorage, SSR-safe, defensivo. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { detectAvailability, summarizeAvailability } from "./availability";
import { getIntelligenceSettings } from "./router";
import { activeCooldowns, allUsageToday, dailyPercent } from "./usage";
import { freeSources, paidSuggestionsFor, type TaskKind } from "./free-catalog";

export const SIGNALS_KEY = "starseed.astraura.signals.v1";
export const SUGGESTIONS_EVENT = "starseed:astraura-suggestions";

/* ───────────────────── Señales de preferencia ───────────────────── */
// La Biblioteca y Aurora suman "señales" (búsquedas, instalaciones, usos por
// área/contexto) para personalizar qué se recomienda primero a cada usuario.

interface Signals {
  /** término de búsqueda → veces. */
  searches: Record<string, number>;
  /** id de paquete/fuente → veces instalado/activado. */
  installs: Record<string, number>;
  /** contexto/área (ruta) → veces usada con IA. */
  contexts: Record<string, number>;
  /** tarea → veces. */
  tasks: Partial<Record<TaskKind, number>>;
}

function readSignals(): Signals {
  if (typeof window === "undefined") return { searches: {}, installs: {}, contexts: {}, tasks: {} };
  try {
    const raw = window.localStorage.getItem(SIGNALS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return {
      searches: p?.searches ?? {},
      installs: p?.installs ?? {},
      contexts: p?.contexts ?? {},
      tasks: p?.tasks ?? {},
    };
  } catch {
    return { searches: {}, installs: {}, contexts: {}, tasks: {} };
  }
}

function writeSignals(s: Signals): void {
  try { window.localStorage.setItem(SIGNALS_KEY, JSON.stringify(s)); } catch { /* */ }
}

/** Registra una señal (la Biblioteca/Aurora la llaman al buscar/instalar/usar). */
export function recordSignal(kind: keyof Signals, key: string, weight = 1): void {
  if (typeof window === "undefined" || !key) return;
  const s = readSignals();
  const bucket = s[kind] as Record<string, number>;
  bucket[key] = (bucket[key] ?? 0) + weight;
  writeSignals(s);
}

/** Los términos/áreas/paquetes más frecuentes (para reordenar recomendaciones). */
export function topSignals(kind: keyof Signals, n = 5): { key: string; count: number }[] {
  const s = readSignals();
  const bucket = s[kind] as Record<string, number>;
  return Object.entries(bucket)
    .map(([key, count]) => ({ key, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/* ───────────────────── Sugerencias contextuales ───────────────────── */

export type SuggestionKind = "connect-free" | "local-power" | "quota" | "upgrade" | "vision" | "voice" | "tip";

export interface Suggestion {
  kind: SuggestionKind;
  title: string;
  detail: string;
  /** Acción recomendada (ruta interna o enlace externo). */
  href?: string;
  external?: boolean;
  /** Prioridad 1-10 (mayor = más arriba). */
  priority: number;
}

/**
 * Calcula sugerencias para el contexto actual. Prioriza SIEMPRE lo gratis y
 * local. No cambia nada: solo propone. `context` es la ruta/área actual.
 */
export async function computeSuggestions(context?: string): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  if (typeof window === "undefined") return out;

  const prefs = getIntelligenceSettings();
  const avail = await detectAvailability(true);
  const readyFree = avail.filter((a) => a.ready && a.source.tier !== "paid");
  const missingFreeKey = avail.filter((a) => !a.ready && a.source.tier === "free-key");

  // 1) Cuota: si una fuente en uso está cerca del límite o en cooldown → avisar.
  for (const c of activeCooldowns()) {
    out.push({
      kind: "quota",
      title: `${c.label} agotada por ahora`,
      detail: `He cambiado automáticamente a otra fuente gratuita para no dejar de funcionar. Se reactiva en ~${c.minutesLeft} min.`,
      href: "/settings",
      priority: 9,
    });
  }
  for (const u of allUsageToday()) {
    const pct = dailyPercent(u.sourceId);
    if (pct != null && pct >= 80) {
      out.push({
        kind: "quota",
        title: `${u.label}: ${pct}% del límite gratis de hoy`,
        detail: `Llevas ${u.usage.requests} peticiones. Si se agota, seguiré con una alternativa local/gratuita automáticamente.`,
        href: "/settings",
        priority: 7,
      });
    }
  }

  // 2) Sin ninguna fuente con clave: sugiere conectar una gratis potente.
  if (!readyFree.some((a) => a.source.tier === "free-key") && missingFreeKey.length) {
    const best = missingFreeKey[0];
    out.push({
      kind: "connect-free",
      title: `Activa ${best.source.label} (gratis)`,
      detail: `${best.source.why} Consigue una clave gratuita y pégala en Ajustes → Inteligencia para respuestas más potentes.`,
      href: best.source.getKeyUrl,
      external: true,
      priority: 8,
    });
  }

  // 3) Poder local: si no hay IA local lista, invita a Ollama/WebGPU (privacidad).
  const hasLocal = readyFree.some((a) => a.source.privacy === "local" || a.source.privacy === "browser");
  if (!hasLocal) {
    out.push({
      kind: "local-power",
      title: "Añade inteligencia local (privada y gratis)",
      detail: "Con Ollama o un navegador con WebGPU puedo pensar sin enviar nada a la nube. Instálalo desde la Biblioteca.",
      href: "/library",
      priority: 6,
    });
  }

  // 4) Visión: si el contexto sugiere imágenes/pantalla y no hay visión lista.
  const visionReady = readyFree.some((a) => a.source.models.some((m) => m.vision));
  if (!visionReady) {
    out.push({
      kind: "vision",
      title: "Dale ojos a Aurora (visión local)",
      detail: "Instala SmolVLM2 desde la Biblioteca para que pueda ver imágenes, tu pantalla o la cámara, 100% en tu dispositivo.",
      href: "/library",
      priority: 5,
    });
  }

  // 5) Mejora premium opcional (solo se muestra; nunca se activa sola).
  if (!prefs.freeFirst) {
    const paid = paidSuggestionsFor("reasoning")[0];
    if (paid) {
      out.push({
        kind: "upgrade",
        title: `Opción premium: ${paid.source.label}`,
        detail: `Para tareas exigentes, ${paid.model.label} da máxima calidad. Es de pago y solo se usa si tú lo activas.`,
        href: paid.source.getKeyUrl,
        external: true,
        priority: 2,
      });
    }
  }

  if (context) recordSignal("contexts", context);
  return out.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

/** Frase-resumen del estado de inteligencia para que Aurora la diga si se le pide. */
export async function intelligenceStatusLine(): Promise<string> {
  const avail = await detectAvailability(true);
  const free = freeSources().length;
  return `${summarizeAvailability(avail)} Tengo ${free} fuentes gratuitas en catálogo y siempre elijo la mejor para cada tarea, cambiando sola si alguna se agota.`;
}

/* ───────────────────── Auto-chequeo periódico ───────────────────── */

let autotimer: ReturnType<typeof setInterval> | null = null;

/**
 * Arranca el latido de auto-mejora: cada `minutes` recalcula sugerencias y
 * emite SUGGESTIONS_EVENT para que la UI (barra de Aurora) las muestre. No
 * descarga ni cambia nada. Idempotente.
 */
export function startAutonomy(minutes = 30): void {
  if (typeof window === "undefined" || autotimer) return;
  const tick = async () => {
    try {
      const s = await computeSuggestions();
      window.dispatchEvent(new CustomEvent(SUGGESTIONS_EVENT, { detail: s }));
    } catch { /* */ }
  };
  void tick();
  autotimer = setInterval(tick, Math.max(5, minutes) * 60_000);
}

export function stopAutonomy(): void {
  if (autotimer) { clearInterval(autotimer); autotimer = null; }
}
