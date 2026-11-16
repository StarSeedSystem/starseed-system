"use client";

/**
 * aurora-guide-voice — puente DEFENSIVO a Aurora para la guía + comandos de voz.
 * ----------------------------------------------------------------------------
 * NO importa el provider ni el motor de Aurora. Voz fusionada (VZF1015J): pasa
 * por `hablar()` de `voz-unica.ts` con contexto 'guia'. Conserva la API pública
 * (`auroraBridge`, `auroraCanSpeak`, etc.) para no tocar a quien la consuma.
 */

// Forma mínima del puente que consumimos (subconjunto de la API v5 del provider).
type AuroraBridgeLite = {
  speak?: (text: string) => void;
  toggle?: () => void;
  start?: () => void;
  stop?: () => void;
  setEnabled?: (v: boolean) => void;
  interrupt?: () => void;
  pauseSpeech?: () => void;
  resumeSpeech?: () => void;
  requestAccess?: (opts?: { wantFullscreen?: boolean }) => unknown;
  getState?: () => {
    enabled?: boolean;
    speaking?: boolean;
    listening?: boolean;
    transcript?: string;
    interim?: string;
  } | null;
};

import { callar as callarUnica, hablar as hablarUnica } from "@/lib/aurora/voz-unica";

/** Devuelve el puente global de Aurora, o null si no está disponible. */
export function auroraBridge(): AuroraBridgeLite | null {
  if (typeof window === "undefined") return null;
  try {
    const api = (window as unknown as { STARSEED_AURORA?: AuroraBridgeLite }).STARSEED_AURORA;
    return api && typeof api === "object" ? api : null;
  } catch {
    return null;
  }
}

// ── LECTURA DE LA VOZ, CLASIFICADA (sin catch silencioso) ────────────────────
// (IMG · «catch silencioso en auroraTranscript») Antes, `auroraTranscript()`
// envolvía la lectura del puente en un `catch` mudo que devolvía "": un motor
// caído era INDISTINGUIBLE de «Aurora todavía no ha hablado», y la guía seguía
// con el badge «Escuchando» mintiendo. Ahora la lectura se CLASIFICA y el aviso
// sale de verdad: la persona sabe que la voz no está y sigue con los botones.

/** El estado que publica el puente (solo lo que la guía necesita). */
export type EstadoVozCrudo =
  | {
      enabled?: boolean;
      speaking?: boolean;
      listening?: boolean;
      transcript?: string;
      interim?: string;
    }
  | null
  | undefined;

/** Lo mínimo del puente para poder leer la voz. */
export type PuenteVozLite = { getState?: () => EstadoVozCrudo };

/** La lectura de la voz: dice si Aurora escucha, si no está o si falló. */
export type LecturaVoz = {
  estado: "ok" | "sin-puente" | "fallo";
  /** Lo que se ha oído ("" si nada). */
  texto: string;
  /** ¿El puente dice que está escuchando? */
  escuchando: boolean;
  /** Por qué no es una lectura normal (vacío cuando `estado` es "ok"). */
  motivo?: string;
};

/** El texto oído: lo dicho + lo provisional, sin espacios de sobra. */
export function componerTranscript(
  transcript: string | undefined,
  interim: string | undefined,
): string {
  return [transcript ?? "", interim ?? ""]
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .join(" ");
}

/** El motivo de un fallo, en una frase corta (sin volcar la pila a la cara). */
function motivoDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message.slice(0, 140);
  if (typeof e === "string" && e.trim()) return e.trim().slice(0, 140);
  return "Aurora no ha respondido.";
}

/**
 * Lee el estado de la voz SIN TRAGARSE los fallos: si el puente revienta, la
 * lectura lo dice («fallo») en vez de devolver un vacío indistinguible del
 * silencio. Nunca lanza.
 *
 * · "ok" → el puente respondió (aunque todavía no haya hablado).
 * · "sin-puente" → no hay Aurora en este aparato: no hay voz, pero no es un fallo.
 * · "fallo" → el puente existe y ha petado: el motivo viaja en `motivo`.
 */
export function leerEstadoVoz(puente: PuenteVozLite | null | undefined): LecturaVoz {
  if (!puente) {
    return {
      estado: "sin-puente",
      texto: "",
      escuchando: false,
      motivo: "Aurora no está disponible en este aparato.",
    };
  }
  const leer = puente.getState;
  // Un puente sin lector no es un fallo: no hay nada que avisar.
  if (typeof leer !== "function") return { estado: "ok", texto: "", escuchando: false };
  try {
    const s = leer();
    if (!s) return { estado: "ok", texto: "", escuchando: false };
    return {
      estado: "ok",
      texto: componerTranscript(s.transcript, s.interim),
      escuchando: s.listening === true,
    };
  } catch (e) {
    return { estado: "fallo", texto: "", escuchando: false, motivo: motivoDeError(e) };
  }
}

/**
 * El aviso honesto que ve la persona (null cuando todo va bien). Siempre dice
 * que la guía sigue en texto: nadie se queda esperando a una voz que no llega.
 */
export function textoAvisoVoz(lectura: LecturaVoz): string | null {
  if (lectura.estado === "ok") return null;
  if (lectura.estado === "sin-puente") {
    return "Aurora no está disponible ahora mismo en este aparato: la guía sigue en texto. Avanza con los botones.";
  }
  return `Aurora no ha respondido: ${lectura.motivo ?? "su motor está caído"}. La guía sigue en texto: avanza con los botones.`;
}

/** ¿Está el puente listo para hablar? */
export function auroraCanSpeak(): boolean {
  try {
    return true;
  } catch {
    return false;
  }
}

/** Hace hablar a Aurora (TTS) por la puerta única con contexto 'guia'. */
export function auroraSpeak(text: string): void {
  const t = (text ?? "").trim();
  if (!t) return;
  try {
    void hablarUnica(t, { contexto: "guia" });
  } catch {
    /* fail-open */
  }
}

/** Corta de inmediato lo que Aurora esté diciendo (para el "mute"). */
export function auroraStopSpeaking(): void {
  try {
    auroraBridge()?.interrupt?.();
  } catch {
    /* */
  }
  // Refuerzo por si el motor no expusiera interrupt: cancela la síntesis nativa.
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* */
  }
}

/** Enciende/apaga Aurora globalmente (mute duro que persiste en el motor). */
export function auroraSetEnabled(v: boolean): void {
  try {
    auroraBridge()?.setEnabled?.(v);
  } catch {
    /* */
  }
}

/** Pausa/reanuda la síntesis sin perder la sesión (mute suave). */
export function auroraPauseSpeech(pause: boolean): void {
  try {
    const api = auroraBridge();
    if (pause) api?.pauseSpeech?.();
    else api?.resumeSpeech?.();
  } catch {
    /* */
  }
}

/**
 * Pide micrófono (desde un gesto) y asegura la escucha en modo voz. Es
 * best-effort: si Aurora no expone requestAccess, intenta start(); si tampoco,
 * no hace nada. Nunca lanza.
 */
export function auroraEnsureListening(): void {
  try {
    const api = auroraBridge();
    if (api?.requestAccess) {
      api.requestAccess({ wantFullscreen: false });
    } else if (api?.start) {
      api.start();
    }
  } catch {
    /* */
  }
}

/**
 * Lee el transcript actual de la escucha de voz (o "" si no hay puente o si el
 * motor falla). El fallo ya NO se traga en silencio: la lectura va clasificada
 * (`leerEstadoVoz`) y quien la use puede decirlo en voz alta.
 */
export function auroraTranscript(): string {
  return leerEstadoVoz(auroraBridge()).texto;
}

/** ¿Aurora está actualmente encendida (enabled) según su estado? */
export function auroraIsEnabled(): boolean {
  try {
    return auroraBridge()?.getState?.()?.enabled === true;
  } catch {
    return false;
  }
}

// ── Detección de comandos de voz simples ─────────────────────────────────────

/** Palabras que hacen AVANZAR al siguiente paso. */
const NEXT_WORDS = ["siguiente", "continua", "continúa", "avanza", "next", "sigue", "adelante"];
/** Palabras que RETROCEDEN. */
const PREV_WORDS = ["anterior", "atras", "atrás", "vuelve", "previo", "back", "retrocede"];
/** Palabras que CIERRAN la guía. */
const CLOSE_WORDS = ["cerrar", "cierra", "salir", "termina", "terminar", "listo", "entendido"];

export type VoiceCommand = "next" | "prev" | "close" | null;

/** Normaliza (minúsculas + sin tildes) para comparar de forma robusta. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Interpreta un fragmento de transcript en un comando simple. Sólo mira el final
 * del texto (las últimas palabras dichas) para no re-disparar frases antiguas.
 */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const t = norm(transcript);
  if (!t) return null;
  // Nos quedamos con la cola del transcript (lo más reciente).
  const tail = t.split(/\s+/).slice(-4).join(" ");
  const has = (words: string[]) => words.some((w) => tail.includes(norm(w)));
  // Prioridad: cerrar > anterior > siguiente (para no avanzar al querer cerrar).
  if (has(CLOSE_WORDS)) return "close";
  if (has(PREV_WORDS)) return "prev";
  if (has(NEXT_WORDS)) return "next";
  return null;
}
