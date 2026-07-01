"use client";

/**
 * StarSeed OS — Bus del Orbe de Aurora
 * ----------------------------------------------------------------------------
 * Estado compartido y utilidades SSR-safe para el nuevo Orbe (esfera + estrella
 * de 4 puntas) de Aurora:
 *
 *   1. POSICIÓN  — persistida en localStorage; el orbe es movible y se recuerda
 *      dónde lo dejó el usuario en cualquier ruta/tamaño.
 *   2. VISIBILIDAD — el orbe puede arrastrarse a una zona de descarte y ocultarse;
 *      se reactiva desde el Exocórtex (sección "Chat de Aurora"). Un pequeño bus
 *      de eventos mantiene sincronizados el orbe y la sección de reactivación,
 *      incluso entre pestañas (evento `storage`).
 *   3. GLOW REACTIVO — helpers para (a) suscribirse a los eventos de voz que el
 *      motor emite al hablar (`aurora:speak`), y (b) conectar de forma opcional y
 *      defensiva un `AnalyserNode` al micrófono mientras Aurora escucha, para que
 *      la iluminación del orbe responda a amplitud/tono reales. Todo degrada con
 *      gracia: sin permiso de micro o sin Web Audio, el orbe respira suavemente.
 *
 * 100% aditivo y defensivo: nada aquí rompe el funcionamiento actual de Aurora.
 */

// ── Claves de localStorage ───────────────────────────────────────────────────
export const AURORA_ORB_POS_KEY = "starseed.aurora.orb.pos.v1";
export const AURORA_ORB_HIDDEN_KEY = "starseed.aurora.orb.hidden.v1";

// ── Eventos internos (mismo tab) ─────────────────────────────────────────────
export const AURORA_ORB_VISIBILITY_EVENT = "starseed:aurora-orb-visibility";
/** Evento de voz emitido por el motor (engine.ts) para animar el glow. */
export const AURORA_SPEAK_EVENT = "aurora:speak";

export type AuroraSpeakPhase = "start" | "boundary" | "end";

export interface AuroraOrbPosition {
  /** Posición como fracción del viewport (0..1), robusta ante cambios de tamaño. */
  xRatio: number;
  yRatio: number;
}

/** Posición por defecto: esquina inferior-derecha (como el FAB clásico). */
export const DEFAULT_ORB_POSITION: AuroraOrbPosition = { xRatio: 0.9, yRatio: 0.88 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── Posición ─────────────────────────────────────────────────────────────────
export function readOrbPosition(): AuroraOrbPosition {
  if (typeof window === "undefined") return { ...DEFAULT_ORB_POSITION };
  try {
    const raw = window.localStorage.getItem(AURORA_ORB_POS_KEY);
    if (!raw) return { ...DEFAULT_ORB_POSITION };
    const p = JSON.parse(raw) as Partial<AuroraOrbPosition>;
    if (typeof p?.xRatio === "number" && typeof p?.yRatio === "number") {
      return { xRatio: clamp01(p.xRatio), yRatio: clamp01(p.yRatio) };
    }
  } catch {
    /* defensivo */
  }
  return { ...DEFAULT_ORB_POSITION };
}

export function writeOrbPosition(pos: AuroraOrbPosition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AURORA_ORB_POS_KEY,
      JSON.stringify({ xRatio: clamp01(pos.xRatio), yRatio: clamp01(pos.yRatio) }),
    );
  } catch {
    /* defensivo */
  }
}

// ── Visibilidad (ocultar / reactivar) ────────────────────────────────────────
export function readOrbHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AURORA_ORB_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Oculta o muestra el orbe y avisa a los suscriptores (orbe + Exocórtex). */
export function setOrbHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AURORA_ORB_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    /* defensivo */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<boolean>(AURORA_ORB_VISIBILITY_EVENT, { detail: hidden }),
    );
  } catch {
    /* defensivo */
  }
}

/**
 * Suscribe un callback a los cambios de visibilidad del orbe (mismo tab vía
 * CustomEvent, otros tabs vía `storage`). Devuelve la función de limpieza.
 */
export function subscribeOrbVisibility(cb: (hidden: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<boolean>).detail;
    cb(!!detail);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_ORB_HIDDEN_KEY) cb(readOrbHidden());
  };
  window.addEventListener(AURORA_ORB_VISIBILITY_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AURORA_ORB_VISIBILITY_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

// ── Glow: eventos de voz del motor (TTS) ─────────────────────────────────────
/**
 * Emite un pulso de voz para el glow del orbe. Lo llama el motor (engine.ts) en
 * el arranque/fin de la síntesis y en cada límite de palabra (`onboundary`), de
 * modo que el orbe LATA al ritmo del habla aunque el TTS no exponga amplitud.
 * Seguro de llamar en cualquier entorno.
 */
export function emitAuroraSpeak(phase: AuroraSpeakPhase): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<AuroraSpeakPhase>(AURORA_SPEAK_EVENT, { detail: phase }),
    );
  } catch {
    /* defensivo */
  }
}

export function subscribeAuroraSpeak(
  cb: (phase: AuroraSpeakPhase) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (e: Event) => cb((e as CustomEvent<AuroraSpeakPhase>).detail);
  window.addEventListener(AURORA_SPEAK_EVENT, on);
  return () => window.removeEventListener(AURORA_SPEAK_EVENT, on);
}

// ── Glow: analizador de micrófono (amplitud + bandas reales) ─────────────────
export interface MicAnalyser {
  /**
   * Lee el nivel actual: `level` 0..1 (amplitud RMS) y `bands` con energía por
   * banda (graves/medios/agudos) 0..1 para desplazar color/forma del orbe.
   */
  read: () => { level: number; bands: [number, number, number] };
  stop: () => void;
}

/**
 * Conecta un `AnalyserNode` al micrófono para alimentar el glow con audio REAL
 * mientras Aurora escucha. Requiere permiso de micrófono (gesto/consentimiento);
 * si algo falla, resuelve `null` y el orbe usa el latido por eventos/respiración.
 *
 * No compite con el reconocimiento de voz: sólo lee amplitud/espectro del mismo
 * flujo de entrada. El stream se cierra al llamar `stop()`.
 */
export async function createMicAnalyser(): Promise<MicAnalyser | null> {
  if (typeof window === "undefined") return null;
  try {
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const md = navigator?.mediaDevices;
    if (!AudioCtx || !md || typeof md.getUserMedia !== "function") return null;

    const stream = await md.getUserMedia({ audio: true });
    const ctx = new AudioCtx();
    // Algunos navegadores arrancan el contexto suspendido.
    try { if (ctx.state === "suspended") await ctx.resume(); } catch { /* */ }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const bins = analyser.frequencyBinCount;
    const freq = new Uint8Array(bins);
    const time = new Uint8Array(bins);

    const read = () => {
      try {
        analyser.getByteTimeDomainData(time);
        analyser.getByteFrequencyData(freq);
        // Amplitud RMS (0..1) del dominio temporal.
        let sum = 0;
        for (let i = 0; i < bins; i++) {
          const v = (time[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.sqrt(sum / bins) * 2.2);
        // Tres bandas simples (graves/medios/agudos) del espectro.
        const third = Math.max(1, Math.floor(bins / 3));
        const bandAvg = (from: number, to: number) => {
          let s = 0;
          const a = Math.max(0, from);
          const b = Math.min(bins, to);
          for (let i = a; i < b; i++) s += freq[i];
          return (b - a > 0 ? s / (b - a) : 0) / 255;
        };
        const bands: [number, number, number] = [
          bandAvg(0, third),
          bandAvg(third, third * 2),
          bandAvg(third * 2, bins),
        ];
        return { level, bands };
      } catch {
        return { level: 0, bands: [0, 0, 0] as [number, number, number] };
      }
    };

    const stop = () => {
      try { source.disconnect(); } catch { /* */ }
      try { analyser.disconnect(); } catch { /* */ }
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
      try { void ctx.close(); } catch { /* */ }
    };

    return { read, stop };
  } catch {
    return null;
  }
}
