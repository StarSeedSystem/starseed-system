"use client";

/**
 * SONIFICACIÓN SUTIL DE LOS SISTEMAS DE ASTRAURA (Adenda 149 · ola 3).
 * ============================================================================
 * SOP: `architecture/astraura-config-sistemas-neurona.md` · idea 2.13:182.
 *
 * La ventana «Sistemas de Astraura en esta neurona» persiste al instante y en
 * SILENCIO absoluto. Este módulo añade —solo si el usuario lo pide— una nota
 * brevísima por sistema al guardar un ajuste, y la MISMA nota descendente al
 * volver a auto. No sustituye al toast con «Deshacer»: lo acompaña.
 *
 * Reglas duras (accesibilidad e higiene sonora):
 *   · APAGADO por defecto  (`starseed.astraura.chime.v1`, ausente ⇒ off).
 *   · Ganancia ≤ 0.04 y duración ~120 ms: nunca tapa la voz de Aurora ni un
 *     vídeo; se oye como un "tick" cristalino, no como una notificación.
 *   · MUDO si el documento está oculto o si el usuario redujo el movimiento
 *     (`reduceMotion==='always'` / `prefers-reduced-motion` / `pauseAnimations`):
 *     quien pide menos estímulo tampoco quiere estímulo sonoro.
 *   · Sin librerías: WebAudio nativo, un oscilador y una envolvente.
 *
 * SSR-safe y defensivo: sin `window`/WebAudio no hace absolutamente nada y
 * NUNCA lanza (el guardado jamás puede fallar por culpa de un sonido).
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { A11Y_STORAGE_KEY } from "@/lib/a11y/apply";

/** Clave de preferencia (entra en el catch-all `starseed.astraura.*` de sync). */
export const CHIME_KEY = "starseed.astraura.chime.v1";
/** Evento para que cualquier interruptor abierto se entere del cambio. */
export const CHIME_EVENT = "starseed:astraura-chime";

/** Los cinco sistemas de la ventana 149 (mismas claves que el store). */
export type ChimeSystem = "llm" | "astraura" | "voz" | "cerebro" | "senales";
/** «set» = se guardó un ajuste propio · «clear» = volvió a automático. */
export type ChimeKind = "set" | "clear";

/**
 * PENTATÓNICA MAYOR de Do (Do·Re·Mi·Sol·La): cualquier par de notas suena
 * consonante, así que encadenar varios cambios seguidos nunca chirría.
 */
const NOTE_HZ: Record<ChimeSystem, number> = {
  llm: 523.25,      // Do5  · cian
  astraura: 587.33, // Re5  · ámbar
  voz: 659.25,      // Mi5  · fucsia
  cerebro: 783.99,  // Sol5 · violeta
  senales: 880.0,   // La5  · esmeralda
};

const DURATION_S = 0.12;
const PEAK_GAIN = 0.04;

/* ─────────────────────── Preferencia (off por defecto) ─────────────────────── */

/** ¿Están activados los sonidos sutiles del sistema? (defecto: NO). */
export function chimeEnabled(): boolean {
  try {
    return safeGet(CHIME_KEY) === "1";
  } catch {
    return false;
  }
}

/** Activa/desactiva los sonidos sutiles y avisa a la UI abierta. */
export function setChimeEnabled(on: boolean): void {
  try {
    safeSet(CHIME_KEY, on ? "1" : "0");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHIME_EVENT, { detail: { enabled: on } }));
    }
  } catch {
    /* best-effort: la preferencia no es crítica */
  }
}

/* ─────────────────────── Gate compartido de movimiento ─────────────────────── */

/**
 * ¿El usuario pidió MENOS movimiento? Lee las tres fuentes reales del OS:
 * las clases que `a11y/apply.ts` pone en <html>, el ajuste guardado
 * (`reduceMotion` / `pauseAnimations`) y la media query del sistema.
 *
 * Compartido a propósito: la constelación de la 149 usa el MISMO gate que el
 * sonido, para que «reducir movimiento» silencie también el latido.
 */
export function reducedMotionActive(): boolean {
  if (typeof window === "undefined") return true; // SSR: nada de estímulos
  try {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (root?.classList.contains("a11y-reduce-motion")) return true;
    if (root?.classList.contains("a11y-pause-animations")) return true;
  } catch { /* */ }
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { reduceMotion?: string; pauseAnimations?: boolean };
      if (s?.pauseAnimations === true) return true;
      if (s?.reduceMotion === "always") return true;
      if (s?.reduceMotion === "never") return false;
    }
  } catch { /* */ }
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/* ─────────────────────────────── Síntesis ─────────────────────────────── */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (ctx && ctx.state !== "closed") return ctx;
    const Ctor: AudioCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Toca la nota de un sistema. `kind`:
 *   · "set"   → nota estable con un levísimo ascenso (algo se fijó).
 *   · "clear" → la MISMA nota cayendo una quinta (algo se soltó: vuelve a auto).
 *
 * No hace nada si el usuario no lo activó, si la pestaña está oculta o si pidió
 * movimiento reducido. Nunca lanza: el sonido jamás bloquea un guardado.
 */
export function playSystemChime(system: ChimeSystem, kind: ChimeKind = "set"): void {
  try {
    if (typeof window === "undefined") return;
    if (!chimeEnabled()) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (reducedMotionActive()) return;

    const ac = audioContext();
    if (!ac) return;
    if (ac.state === "suspended") { try { void ac.resume(); } catch { /* */ } }

    const base = NOTE_HZ[system] ?? NOTE_HZ.llm;
    const t0 = ac.currentTime;
    const t1 = t0 + DURATION_S;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t0);
    // "set" sube un pelín (1.12 ≈ un tono); "clear" cae una quinta justa (÷1.5).
    osc.frequency.exponentialRampToValueAtTime(kind === "clear" ? base / 1.5 : base * 1.12, t1);

    // Envolvente suave: sin clic de ataque ni corte seco al final.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, t0 + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* */ }
    };
  } catch {
    /* nunca lanza */
  }
}

export default playSystemChime;
