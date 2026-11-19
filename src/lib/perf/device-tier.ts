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
 * El MODO puede forzarse desde Ajustes → Rendimiento ('auto' | 'alto' | 'eco' | 'eficiente').
 * Ahora integra con modo-rendimiento.ts para fases de potenciación y `data-rendimiento`.
 */

import {
  type ModoRendimiento,
  type FasePotenciacion,
  MODOS,
  MODO_KEY,
  MODO_CHANGED_EVENT,
  leerModo,
  configDeModo,
  faseActiva,
  migrarConfiguracionAntigua,
} from "./modo-rendimiento";

export type PerfTier = "high" | "mid" | "low";
export type PerfMode = ModoRendimiento;
/** Lo que efectivamente aplica el sistema (legacy): 'high' | 'mid' | 'eco'. */
export type PerfApplied = "high" | "mid" | "eco";

export const PERF_CHANGED_EVENT = "starseed:perf-changed";

/** Lee el modo guardado (con migración de valores legacy). */
export function getPerfMode(): PerfMode {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(MODO_KEY);
    return migrarConfiguracionAntigua(v);
  } catch {
    return "auto";
  }
}

/** Guarda el modo y aplica tanto data-perf (legacy) como data-rendimiento (nuevo). */
export function setPerfMode(mode: PerfMode): void {
  try {
    window.localStorage.setItem(MODO_KEY, mode);
  } catch {
    /* noop */
  }
  applyPerf();
  applyRendimiento();
  try {
    window.dispatchEvent(new CustomEvent(PERF_CHANGED_EVENT));
    window.dispatchEvent(new CustomEvent(MODO_CHANGED_EVENT));
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
    if (mem <= 3 || cores <= 3) return "low";
    if (coarse && (mem <= 6 || cores <= 6)) return "mid";
    if (mem <= 4 || cores <= 4) return "mid";
    return "high";
  } catch {
    return "high";
  }
}

/** Combina el modo elegido con el tier detectado → lo que se aplica de verdad (legacy). */
export function resolveApplied(): PerfApplied {
  const mode = getPerfMode();
  if (mode === "alto") return "high";
  if (mode === "eco") return "eco";
  if (mode === "eficiente") return "eco"; // eficiente se mapea a eco en legacy
  const tier = detectTier();
  return tier === "low" ? "eco" : tier;
}

/** ¿Deben montarse los fondos animados pesados? (false en eco/eficiente) */
export function allowHeavyFx(): boolean {
  const applied = resolveApplied();
  return applied !== "eco";
}

/** ¿Modo de máxima riqueza? (WebGL/Spline plenos) */
export function allowFullFx(): boolean {
  return resolveApplied() === "high";
}

/** Escribe `data-perf` en <html> para compatibilidad legacy. */
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

/** Escribe `data-rendimiento` en <html> con el modo actual para CSS nuevo. */
export function applyRendimiento(): ModoRendimiento {
  const mode = getPerfMode();
  try {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-rendimiento", mode);
    }
  } catch {
    /* noop */
  }
  return mode;
}

/** Comprueba si una fase de potenciación está activa en el modo actual. */
export function faseActivaModo(fase: FasePotenciacion): boolean {
  return faseActiva(getPerfMode(), fase);
}

/** Obtiene el FPS objetivo para canvas/WebGL/rAF según el modo actual. */
export function fpsObjetivoModo(): number {
  return configDeModo(getPerfMode()).fpsObjetivo;
}

/** Obtiene la escala de fondo según el modo actual. */
export function escalaFondoModo(): number {
  return configDeModo(getPerfMode()).escalaFondo;
}

/** Obtiene la configuración completa del modo actual. */
export function configModoActual() {
  return configDeModo(getPerfMode());
}

/** Inicializa ambos atributos al cargar (llamar desde layout o provider). */
export function inicializarRendimiento(): { perf: PerfApplied; rendimiento: ModoRendimiento } {
  return { perf: applyPerf(), rendimiento: applyRendimiento() };
}