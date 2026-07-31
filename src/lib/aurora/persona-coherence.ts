"use client";

/**
 * StarSeed OS — COHERENCIA DE PERSONA / VOZ al cambiar de modelo (Adenda 112).
 * ============================================================================
 * Una PERSONA PORTÁTIL (model-agnóstica) es la fuente de verdad del carácter de
 * una voz: emoción, tono, energía, ritmo, timbre y una REFERENCIA de audio
 * opcional. Se "resuelve" sobre CUALQUIER motor de voz activo preservando el
 * carácter — si el motor sabe clonar, se le pasa la referencia; si no, se aplican
 * los parámetros equivalentes para que el personaje suene coherente igual. Así,
 * aunque cambie el sistema de voz (o el LLM) por neurona o dentro de una neurona,
 * el tono, el carácter y la actitud se mantienen automáticamente.
 *
 * Se integra con la modulación viva existente emitiendo el mismo evento
 * `starseed:aurora-voice-style` que consume `voice-style.ts`. Trae PRESETS de voz
 * de referencia por defecto, usables por cualquier modelo y personalidad.
 *
 * Módulo LIVIANO: solo importa TIPOS del motor de voz (se borran en compilación);
 * el motor actual se pasa como argumento. Nunca lanza. SSR-safe.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import type { AuroraVoiceStyle, AuroraVoiceEmotion, AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";

/** Mismo canal de modulación viva que emite Personalidades y consume voice-style. */
export const AURORA_VOICE_STYLE_EVENT = "starseed:aurora-voice-style";
export const PERSONA_COHERENCE_KEY = "starseed.aurora.persona-coherence.v1";
export const PERSONA_COHERENCE_EVENT = "starseed:aurora-persona-coherence";

export interface PortablePersona {
  id: string;
  name: string;
  emotion: AuroraVoiceEmotion;
  tone: string;
  energy: number; // 0..100
  rate: number;   // 0.5..2
  pitch: number;  // 0.5..2
  /** Id de voz del catálogo usado como REFERENCIA de audio (si el motor clona). */
  audioRefId?: string;
  description?: string;
}

/** Motores que aceptan una referencia de audio para clonar/guiar la voz. */
export const ENGINE_SUPPORTS_REF: Record<AuroraVoiceEngine, boolean> = {
  browser: false, kokoro: false, kitten: false, bark: false, xai: false,
  voxcpm: true, voicebox: true, "gpt-sovits": true, omnivoice: true, openvoice2: true,
};

export function engineSupportsRef(engine: AuroraVoiceEngine): boolean {
  return ENGINE_SUPPORTS_REF[engine] === true;
}

/** Presets de voz de referencia integrados por defecto (usables por cualquier motor). */
export const PERSONA_REFERENCE_PRESETS: PortablePersona[] = [
  { id: "calida", name: "Cálida", emotion: "dulce", tone: "cercana y afectuosa", energy: 55, rate: 0.98, pitch: 1.04, audioRefId: "kokoro-af-bella", description: "Voz cercana, dulce y acogedora." },
  { id: "serena", name: "Serena", emotion: "serena", tone: "tranquila y clara", energy: 45, rate: 0.95, pitch: 1.0, audioRefId: "openvoice-f-aurora", description: "Calma y claridad, ritmo pausado." },
  { id: "energica", name: "Enérgica", emotion: "entusiasta", tone: "vibrante y motivadora", energy: 80, rate: 1.08, pitch: 1.06, audioRefId: "kokoro-af-sky", description: "Chispa y entusiasmo, ritmo ágil." },
  { id: "sabia", name: "Sabia", emotion: "seria", tone: "reflexiva y profunda", energy: 50, rate: 0.92, pitch: 0.96, audioRefId: "kokoro-am-michael", description: "Tono reposado y con autoridad amable." },
  { id: "juguetona", name: "Juguetona", emotion: "juguetona", tone: "brillante y traviesa", energy: 72, rate: 1.05, pitch: 1.1, audioRefId: "kokoro-af-sarah", description: "Ligera, curiosa y divertida." },
  { id: "empatica", name: "Empática", emotion: "empatica", tone: "comprensiva y suave", energy: 52, rate: 0.96, pitch: 1.02, audioRefId: "openvoice-f-aurora", description: "Escucha cálida, presencia atenta." },
  { id: "misteriosa", name: "Misteriosa", emotion: "misteriosa", tone: "envolvente y sugerente", energy: 48, rate: 0.9, pitch: 0.94, audioRefId: "gptsovits-f-selene", description: "Grave, envolvente, con matices." },
  { id: "alegre", name: "Alegre", emotion: "alegre", tone: "luminosa y positiva", energy: 70, rate: 1.03, pitch: 1.05, audioRefId: "kokoro-af-nicole", description: "Optimista y luminosa." },
  { id: "orion", name: "Orion (masc.)", emotion: "serena", tone: "firme y sereno", energy: 55, rate: 0.97, pitch: 0.9, audioRefId: "openvoice-m-orion", description: "Voz masculina firme y clara." },
  { id: "neutra", name: "Neutra", emotion: "serena", tone: "equilibrada y versátil", energy: 50, rate: 1.0, pitch: 1.0, audioRefId: "kokoro-am-onyx", description: "Neutra y versátil, base para cualquier motor." },
];

export function presetById(id: string | undefined): PortablePersona | undefined {
  return id ? PERSONA_REFERENCE_PRESETS.find((p) => p.id === id) : undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

/** Convierte la persona portátil al estilo de voz que consume el motor (vivo). */
export function personaToStyle(p: PortablePersona): AuroraVoiceStyle {
  return {
    emotion: p.emotion,
    tone: p.tone,
    persona: p.name,
    rate: clamp(p.rate, 0.5, 2),
    pitch: clamp(p.pitch, 0.5, 2),
    energy: clamp(p.energy, 0, 100),
  };
}

export interface PersonaResolution {
  engine: AuroraVoiceEngine;
  /** Emoción/tono/rate/pitch/energy — SIEMPRE preservado (coherencia de carácter). */
  style: AuroraVoiceStyle;
  /** Referencia de audio SOLO si el motor sabe clonar. */
  audioRef?: string;
  usesRef: boolean;
  coherenceNote: string;
}

/** Resuelve una persona portátil sobre un motor concreto preservando el carácter. */
export function resolvePersonaForEngine(p: PortablePersona, engine: AuroraVoiceEngine): PersonaResolution {
  const style = personaToStyle(p);
  const usesRef = !!p.audioRefId && engineSupportsRef(engine);
  const coherenceNote = usesRef
    ? `Carácter y referencia de voz aplicados (${engine} clona la referencia).`
    : `Carácter (tono/emoción/energía) aplicado; ${engine} usa su voz con estos parámetros, sin referencia de audio.`;
  return { engine, style, audioRef: usesRef ? p.audioRefId : undefined, usesRef, coherenceNote };
}

/**
 * Aplica una persona sobre el motor dado: emite el estilo por el canal de
 * modulación viva (efecto inmediato en la voz) y devuelve la resolución. El motor
 * activo lo pasa quien llama (p.ej. `getVoiceEngine()` desde la UI).
 */
export function applyPersona(p: PortablePersona, engine: AuroraVoiceEngine): PersonaResolution {
  const res = resolvePersonaForEngine(p, engine);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AURORA_VOICE_STYLE_EVENT, { detail: res.style }));
    }
  } catch {
    /* */
  }
  return res;
}

/* ── Estado (preset + persona personalizada + idioma por chat) ───────────────── */
export interface PersonaCoherenceState {
  presetId?: string;
  custom?: PortablePersona;
  /** "" = idioma automático; código (es/en/…) = fijo. */
  langMode: string;
}

export const DEFAULT_PERSONA_COHERENCE: PersonaCoherenceState = { presetId: "serena", langMode: "" };

export function getPersonaCoherence(): PersonaCoherenceState {
  try {
    const raw = safeGet(PERSONA_COHERENCE_KEY);
    if (!raw) return { ...DEFAULT_PERSONA_COHERENCE };
    const p = JSON.parse(raw) as Partial<PersonaCoherenceState>;
    return {
      presetId: typeof p.presetId === "string" ? p.presetId : undefined,
      custom: p.custom && typeof p.custom === "object" ? (p.custom as PortablePersona) : undefined,
      langMode: typeof p.langMode === "string" ? p.langMode : "",
    };
  } catch {
    return { ...DEFAULT_PERSONA_COHERENCE };
  }
}

export function setPersonaCoherence(patch: Partial<PersonaCoherenceState>): PersonaCoherenceState {
  const next = { ...getPersonaCoherence(), ...patch };
  try {
    safeSet(PERSONA_COHERENCE_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PERSONA_COHERENCE_EVENT, { detail: next }));
  } catch {
    /* */
  }
  return next;
}

export function subscribePersonaCoherence(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(PERSONA_COHERENCE_EVENT, h);
  return () => window.removeEventListener(PERSONA_COHERENCE_EVENT, h);
}

/** La persona activa (custom si existe, si no el preset, si no la neutra). */
export function activePersona(state: PersonaCoherenceState = getPersonaCoherence()): PortablePersona {
  return state.custom ?? presetById(state.presetId) ?? PERSONA_REFERENCE_PRESETS.find((p) => p.id === "neutra") ?? PERSONA_REFERENCE_PRESETS[0];
}
