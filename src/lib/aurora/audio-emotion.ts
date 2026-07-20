"use client";

/**
 * StarSeed OS — OÍDO EMOCIONAL: análisis de PROSODIA de la voz del usuario (Adenda 77-voz).
 * ============================================================================
 * Mientras Aurora escucha (micrófono activo), este módulo estima el TONO/EMOCIÓN
 * de quien habla a partir de la prosodia — energía (RMS), brillo espectral
 * (proxy de pitch), variabilidad y ritmo — SIN reconocer palabras y SIN enviar
 * nada a ningún servidor. 100% local y en vivo.
 *
 * REUTILIZA la infraestructura de micrófono del orbe (`acquireMicAnalyser`):
 *   · UN solo `getUserMedia` compartido (refcount) → cero competencia con el STT.
 *   · GUARD MÓVIL respetado: en móvil `acquireMicAnalyser` devuelve null (el
 *     micrófono tiene un solo dueño) → el oído emocional queda inactivo. Por eso
 *     el sentido nace OFF en móvil.
 *
 * Emite `starseed:user-voice-emotion` (throttle 1 s) con
 *   { mood, confidence, energy, pitchLevel, variability, rhythm, at }
 * y mantiene una instantánea consultable (`getLastUserVoiceEmotion`). El motor de
 * Aurora / los paneles la consumen sin acoplarse a este módulo.
 *
 * SSR-safe, defensivo. NUNCA lanza.
 */

import { acquireMicAnalyser, type MicAnalyser } from "@/lib/aurora/aurora-orb-bus";
import { getActiveSenses } from "@/lib/senses/senses";

/** Evento del DOM con la emoción percibida del usuario (throttle 1 s). */
export const USER_VOICE_EMOTION_EVENT = "starseed:user-voice-emotion";
/** Id del sentido nuevo "Oído emocional" (catálogo en senses.ts). */
export const EMOTIONAL_HEARING_SENSE_ID = "oido-emocional";

/** Estados de ánimo percibidos de la voz del usuario. */
export type UserVoiceMood =
  | "alegre"
  | "sereno"
  | "tenso"
  | "triste"
  | "enérgico"
  | "neutral";

export interface UserVoiceEmotion {
  mood: UserVoiceMood;
  /** Confianza 0..1 (baja con poca señal → mood "neutral"). */
  confidence: number;
  /** Energía 0..1 (RMS medio de la ventana). */
  energy: number;
  /** Nivel de tono 0..1 (proxy por brillo espectral: agudo↔grave). */
  pitchLevel: number;
  /** Variabilidad 0..1 (cuánto oscila la energía). */
  variability: number;
  /** Ritmo: acentos/segundo aprox. */
  rhythm: number;
  /** Marca de tiempo (ms). */
  at: number;
}

/** Adorno bonito por ánimo (para chips de UI). */
export const MOOD_LABEL: Record<UserVoiceMood, { label: string; glyph: string }> = {
  alegre: { label: "alegre", glyph: "✦" },
  sereno: { label: "sereno", glyph: "◦" },
  tenso: { label: "tenso", glyph: "⟁" },
  triste: { label: "triste", glyph: "˖" },
  enérgico: { label: "enérgico", glyph: "⚡" },
  neutral: { label: "neutral", glyph: "·" },
};

// ── Estado del módulo ────────────────────────────────────────────────────────

interface Sample {
  level: number;
  centroid: number; // 0..1 (proxy de pitch)
  t: number;
}

let mic: MicAnalyser | null = null;
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let emitTimer: ReturnType<typeof setInterval> | null = null;
let starting = false;
const windowSamples: Sample[] = [];
const WINDOW_MS = 2_000;
const SAMPLE_EVERY_MS = 140;
const EMIT_EVERY_MS = 1_000;

let lastEmotion: UserVoiceEmotion = {
  mood: "neutral",
  confidence: 0,
  energy: 0,
  pitchLevel: 0,
  variability: 0,
  rhythm: 0,
  at: 0,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** ¿Está habilitado el sentido "Oído emocional" para Aurora? */
export function isEmotionalHearingEnabled(): boolean {
  try {
    return getActiveSenses("aurora").includes(EMOTIONAL_HEARING_SENSE_ID);
  } catch {
    return false;
  }
}

// ── Cálculo de la emoción a partir de la ventana de prosodia ─────────────────

/**
 * Clasifica la ventana de muestras en { mood, confidence, energy, pitchLevel,
 * variability, rhythm }. Heurística honesta (no un modelo): energía + brillo +
 * variabilidad + ritmo bastan para distinguir estados amplios. Nunca lanza.
 */
export function computeEmotion(samples: Sample[], now: number): UserVoiceEmotion {
  const n = samples.length;
  if (n < 3) {
    return { mood: "neutral", confidence: 0, energy: 0, pitchLevel: 0, variability: 0, rhythm: 0, at: now };
  }
  let sumL = 0;
  let sumC = 0;
  for (const s of samples) {
    sumL += s.level;
    sumC += s.centroid;
  }
  const meanL = sumL / n;
  const meanC = sumC / n;
  // Desviación típica de la energía (variabilidad relativa).
  let varAcc = 0;
  for (const s of samples) varAcc += (s.level - meanL) * (s.level - meanL);
  const std = Math.sqrt(varAcc / n);
  const variability = clamp(std / (meanL + 0.02), 0, 1);

  // Energía normalizada: la voz típica queda ~0.1..0.5 en el `level` del bus.
  const energy = clamp(meanL * 2.2, 0, 1);
  const pitchLevel = clamp(meanC, 0, 1);

  // Ritmo: acentos = subidas por encima de (media + 0.6·σ), por segundo.
  const thresh = meanL + 0.6 * std;
  let onsets = 0;
  let above = false;
  for (const s of samples) {
    if (!above && s.level > thresh) {
      onsets += 1;
      above = true;
    } else if (above && s.level < meanL) {
      above = false;
    }
  }
  const spanMs = Math.max(1, samples[n - 1].t - samples[0].t);
  const rhythm = clamp((onsets * 1000) / spanMs, 0, 8);

  // Confianza: sube con energía; casi muda → neutral con poca confianza.
  const confidence = clamp(energy * 1.6, 0, 1);

  let mood: UserVoiceMood = "neutral";
  if (energy < 0.14 || confidence < 0.18) {
    mood = "neutral";
  } else if (energy < 0.3 && variability < 0.28 && pitchLevel < 0.45) {
    mood = "triste";
  } else if (energy < 0.34 && variability < 0.3) {
    mood = "sereno";
  } else if (rhythm >= 3.2 && variability < 0.42 && pitchLevel < 0.55) {
    mood = "tenso";
  } else if (energy >= 0.36 && variability >= 0.34 && pitchLevel >= 0.52) {
    mood = "alegre";
  } else if (energy >= 0.42 && (variability >= 0.3 || rhythm >= 2.6)) {
    mood = "enérgico";
  } else {
    mood = "neutral";
  }

  return {
    mood,
    confidence: Math.round(confidence * 100) / 100,
    energy: Math.round(energy * 100) / 100,
    pitchLevel: Math.round(pitchLevel * 100) / 100,
    variability: Math.round(variability * 100) / 100,
    rhythm: Math.round(rhythm * 10) / 10,
    at: now,
  };
}

function emitEmotion(e: UserVoiceEmotion): void {
  lastEmotion = e;
  if (typeof window === "undefined") return;
  try {
    (window as unknown as { STARSEED_userVoiceEmotion?: UserVoiceEmotion }).STARSEED_userVoiceEmotion = e;
  } catch {
    /* */
  }
  try {
    window.dispatchEvent(new CustomEvent(USER_VOICE_EMOTION_EVENT, { detail: e }));
  } catch {
    /* */
  }
}

// ── Ciclo de captura ─────────────────────────────────────────────────────────

function tickSample(): void {
  const m = mic;
  if (!m) return;
  try {
    const { level, bands } = m.read();
    // Brillo espectral (centroide simple de 3 bandas) → proxy de pitch 0..1.
    const [bass, midB, treble] = bands;
    const total = bass + midB + treble;
    const centroid = total > 0.001 ? clamp((midB + treble * 2) / (total * 2), 0, 1) : 0;
    const now = Date.now();
    windowSamples.push({ level, centroid, t: now });
    // Poda de la ventana.
    const cutoff = now - WINDOW_MS;
    while (windowSamples.length && windowSamples[0].t < cutoff) windowSamples.shift();
  } catch {
    /* una lectura fallida no rompe el ciclo */
  }
}

function tickEmit(): void {
  try {
    emitEmotion(computeEmotion(windowSamples, Date.now()));
  } catch {
    /* */
  }
}

/**
 * Arranca el oído emocional: adquiere el analizador COMPARTIDO del micrófono y
 * empieza a estimar/emitir. Idempotente. No hace NADA si el sentido está
 * deshabilitado o si el micrófono no está disponible (móvil/permiso) — en cuyo
 * caso el orbe/STT no se ven afectados. NUNCA lanza.
 */
export async function startUserVoiceEmotion(opts: { force?: boolean } = {}): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (mic || starting) return true;
  if (!opts.force && !isEmotionalHearingEnabled()) return false;
  starting = true;
  try {
    const m = await acquireMicAnalyser(); // respeta guard móvil + refcount + cooldown
    if (!m) {
      starting = false;
      return false;
    }
    mic = m;
    windowSamples.length = 0;
    sampleTimer = setInterval(tickSample, SAMPLE_EVERY_MS);
    emitTimer = setInterval(tickEmit, EMIT_EVERY_MS);
    starting = false;
    return true;
  } catch {
    starting = false;
    stopUserVoiceEmotion();
    return false;
  }
}

/** Detiene el oído emocional y libera la referencia del micrófono. Nunca lanza. */
export function stopUserVoiceEmotion(): void {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  if (emitTimer) {
    clearInterval(emitTimer);
    emitTimer = null;
  }
  if (mic) {
    try {
      mic.stop();
    } catch {
      /* */
    }
    mic = null;
  }
  windowSamples.length = 0;
  // Estado en reposo (neutral) para que los chips se apaguen con gracia.
  const reset: UserVoiceEmotion = { mood: "neutral", confidence: 0, energy: 0, pitchLevel: 0, variability: 0, rhythm: 0, at: Date.now() };
  emitEmotion(reset);
}

/** ¿Está activo el oído emocional ahora mismo? */
export function isUserVoiceEmotionActive(): boolean {
  return !!mic;
}

/** Última emoción percibida (instantánea consultable). Nunca lanza. */
export function getLastUserVoiceEmotion(): UserVoiceEmotion {
  return lastEmotion;
}

/** Suscribe a la emoción percibida (evento del DOM). Devuelve la baja. SSR-safe. */
export function subscribeUserVoiceEmotion(cb: (e: UserVoiceEmotion) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (ev: Event) => {
    try {
      cb((ev as CustomEvent).detail as UserVoiceEmotion);
    } catch {
      /* */
    }
  };
  window.addEventListener(USER_VOICE_EMOTION_EVENT, on);
  return () => window.removeEventListener(USER_VOICE_EMOTION_EVENT, on);
}

/**
 * Nota BREVE en español para inyectar al contexto del siguiente turno de Aurora
 * ("El usuario suena alegre."). "" si la confianza es baja o el estado es neutro.
 * Es el punto de EXTENSIÓN para el pipeline (composeAuroraSystem/router leen los
 * sentidos; esta nota se apoya en la emoción viva sin acoplar módulos). Nunca lanza.
 */
export function describeUserVoiceEmotionForPrompt(): string {
  const e = lastEmotion;
  if (!e || e.confidence < 0.35 || e.mood === "neutral") return "";
  return `Tono de voz percibido del usuario: suena ${MOOD_LABEL[e.mood].label} (confianza ${Math.round(
    e.confidence * 100,
  )}%). Ten en cuenta su estado al responder, con tacto y sin mencionarlo salvo que venga a cuento.`;
}

// ── Autostart atado a la ESCUCHA de Aurora (no invasivo) ─────────────────────

let autostartInstalled = false;

/**
 * Instala (una vez) el arranque/parada automático del oído emocional atado a la
 * ESCUCHA de Aurora, usando el puente global `window.STARSEED_AURORA` (getState/
 * subscribe → evento `starseed:aurora-state`) SIN tocar engine.ts. Cuando Aurora
 * escucha y el sentido está habilitado → arranca; si deja de escuchar o se
 * deshabilita → para. También reacciona a cambios de sentidos. Nunca lanza.
 */
export function installUserVoiceEmotionAutostart(): void {
  if (typeof window === "undefined" || autostartInstalled) return;
  autostartInstalled = true;

  const sync = () => {
    try {
      const bridge = (window as unknown as {
        STARSEED_AURORA?: { getState?: () => { listening?: boolean } | null };
      }).STARSEED_AURORA;
      const listening = !!bridge?.getState?.()?.listening;
      const enabled = isEmotionalHearingEnabled();
      if (listening && enabled) {
        void startUserVoiceEmotion();
      } else if (!listening || !enabled) {
        if (isUserVoiceEmotionActive()) stopUserVoiceEmotion();
      }
    } catch {
      /* */
    }
  };

  try {
    // Estado de Aurora (incluye `listening`) y cambios de sentidos.
    window.addEventListener("starseed:aurora-state", sync);
    window.addEventListener("starseed:senses", sync);
  } catch {
    autostartInstalled = false;
  }
}
