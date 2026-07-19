"use client";

/**
 * StarSeed OS — DICTADO por voz reutilizable (Adenda 71-ter · I1)
 * ============================================================================
 * STT ligero de "rellenar campo" para superficies que quieren un micrófono como
 * el del orbe SIN instanciar el motor supervisado siempre-activo de Aurora
 * (que además habla y ejecuta acciones). Reutiliza la MISMA corrección fonética
 * de términos StarSeed (`normalizeStarseedTerms`) y el mismo patrón de
 * `SpeechRecognition` del engine. SSR-safe; nunca lanza.
 *
 * Uso típico (mic de `/agent`):
 *   const dict = startDictation({
 *     onInterim: (t) => setInput(t),
 *     onFinal:   (t) => { setInput(t); handleSend(); },
 *     onEnd:     () => setListening(false),
 *   });
 *   // …para detener: dict.stop();
 */

import { normalizeStarseedTerms } from "@/lib/aurora/term-normalizer";

export interface DictationHandle {
  /** Detiene el reconocimiento (idempotente). */
  stop: () => void;
  /** ¿Sigue escuchando? */
  active: () => boolean;
}

export interface DictationOptions {
  /** Texto parcial mientras habla (para previsualizar en el campo). */
  onInterim?: (text: string) => void;
  /** Texto final de una frase completa (corregido fonéticamente). */
  onFinal?: (text: string) => void;
  /** Reconocimiento terminado (por silencio, stop, o error). */
  onEnd?: () => void;
  /** Error legible (permiso denegado, no soportado…). */
  onError?: (message: string) => void;
  /** Idioma BCP-47. Por defecto "es-ES". */
  lang?: string;
  /** Continuo (varias frases) o una sola. Por defecto false (una frase). */
  continuous?: boolean;
}

/** ¿El navegador soporta dictado por voz? */
export function isDictationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/**
 * Arranca un reconocimiento de voz de "rellenar campo". Devuelve un handle para
 * detenerlo. Si no hay soporte, invoca `onError` y devuelve un handle no-op.
 */
export function startDictation(opts: DictationOptions = {}): DictationHandle {
  if (typeof window === "undefined") {
    return { stop: () => {}, active: () => false };
  }
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) {
    opts.onError?.("Tu navegador no soporta dictado por voz.");
    opts.onEnd?.();
    return { stop: () => {}, active: () => false };
  }

  let stopped = false;
  let rec: any = null;
  try {
    rec = new SR();
    rec.lang = opts.lang || "es-ES";
    rec.continuous = !!opts.continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev: any) => {
      let interim = "";
      let final = "";
      try {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const txt = r[0]?.transcript ?? "";
          if (r.isFinal) final += txt;
          else interim += txt;
        }
      } catch { /* */ }
      if (interim && opts.onInterim) {
        try { opts.onInterim(normalizeStarseedTerms(interim.trim())); } catch { opts.onInterim(interim.trim()); }
      }
      if (final && opts.onFinal) {
        let clean = final.trim();
        try { clean = normalizeStarseedTerms(clean); } catch { /* */ }
        if (clean) opts.onFinal(clean);
        if (!opts.continuous) {
          try { rec.stop(); } catch { /* */ }
        }
      }
    };
    rec.onerror = (ev: any) => {
      const code = ev?.error || "";
      // 'no-speech'/'aborted' son normales (silencio o stop): no son fallos reales.
      if (code && code !== "no-speech" && code !== "aborted") {
        const msg = code === "not-allowed" || code === "service-not-allowed"
          ? "Permiso de micrófono denegado."
          : `Error de dictado (${code}).`;
        opts.onError?.(msg);
      }
    };
    rec.onend = () => {
      if (!stopped) { stopped = true; opts.onEnd?.(); }
    };
    rec.start();
  } catch {
    opts.onError?.("No pude iniciar el dictado.");
    opts.onEnd?.();
    return { stop: () => {}, active: () => false };
  }

  return {
    stop: () => {
      if (stopped) return;
      try { rec?.stop?.(); } catch { /* */ }
    },
    active: () => !stopped,
  };
}

export default startDictation;
