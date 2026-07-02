"use client";

/**
 * device-tier — nivel de rendimiento del dispositivo (SSR-safe).
 * ----------------------------------------------------------------------------
 * El OS montaba 7 capas de fondo pesadas a la vez (WebGL, Spline, iframe
 * Audiomorphic, psicodélico líquido, materia viva…), lo que traba móviles.
 * Este módulo clasifica el dispositivo y publica `data-perf` en <html> para que
 * los fondos y el CSS decidan cuánto renderizar.
 *
 *   tier 'high' → todo.  'mid' → animaciones reducidas.  'low' → estático.
 *
 * El MODO puede forzarse desde Ajustes → Rendimiento ('auto' | 'high' | 'eco').
 */

export type PerfTier = "high" | "mid" | "low";
export type PerfMode = "auto" | "high" | "eco";
/** Lo que efectivamente aplica el sistema: 'high' | 'mid' | 'eco'. */
export type PerfApplied = "high" | "mid" | "eco";

const MODE_KEY = "starseed.perf.v1";
export const PERF_CHANGED_EVENT = "starseed:perf-changed";

export function getPerfMode(): PerfMode {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === "high" || v === "eco" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setPerfMode(mode: PerfMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* noop */
  }
  applyPerf();
  try {
    window.dispatchEvent(new CustomEvent(PERF_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

/** Clasifica el dispositivo por memoria, núcleos, puntero y reduced-motion. */
export function detectTier(): PerfTier {
  if (typeof navigator === "undefined") return "high";
  try {
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number };
    const mem = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
    const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8;
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) return "low";
    // Gama baja: poca RAM o pocos núcleos.
    if (mem <= 3 || cores <= 3) return "low";
    // Móvil/tablet de gama media: coarse con recursos moderados.
    if (coarse && (mem <= 6 || cores <= 6)) return "mid";
    if (mem <= 4 || cores <= 4) return "mid";
    return "high";
  } catch {
    return "high";
  }
}

/** Combina el modo elegido con el tier detectado → lo que se aplica de verdad. */
export function resolveApplied(): PerfApplied {
  const mode = getPerfMode();
  if (mode === "high") return "high";
  if (mode === "eco") return "eco";
  // auto:
  const tier = detectTier();
  return tier === "low" ? "eco" : tier; // 'high' | 'mid' | 'eco'
}

/** ¿Deben montarse los fondos animados pesados? (false en eco) */
export function allowHeavyFx(): boolean {
  return resolveApplied() !== "eco";
}

/** ¿Modo de máxima riqueza? (WebGL/Spline plenos) */
export function allowFullFx(): boolean {
  return resolveApplied() === "high";
}

/** Escribe `data-perf` en <html> para que el CSS y los fondos reaccionen. */
export function applyPerf(): PerfApplied {
  const applied = resolveApplied();
  try {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-perf", applied);
    }
  } catch {
    /* noop */
  }
  return applied;
}
