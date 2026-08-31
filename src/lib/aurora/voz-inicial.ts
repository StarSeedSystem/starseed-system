"use client";

/**
 * VOZ DESDE EL INICIO (Adenda 194) — femenina · masculina · neutra · autónoma.
 * ----------------------------------------------------------------------------
 * La bienvenida solo ofrecía «voz» o «texto», y la voz que salía era la que el
 * navegador rankeara: en el equipo de Alex, masculina. Ahora la elección es
 * explícita y las TRES suenan bien sin tocar un solo ajuste:
 *   · se elige la mejor voz del sistema DE ESE GÉNERO (ranking por calidad,
 *     idioma y nombre; ver `browser-voices.ts`),
 *   · se aplica una modulación fina por género (tono y ritmo) para que ninguna
 *     suene forzada,
 *   · la elección se ESCRIBE en la personalidad activa de Aurora (`generoVoz`),
 *     así queda vinculada a ella y es intercambiable desde su editor.
 *
 * Modo AUTÓNOMO: la voz deja de ser un ajuste fijo y se modula sola a partir de
 * lo que la personalidad es (sus rasgos) y del entorno (hora del día, ritmo de
 * la sesión). Honesto: no «aprende» de datos que no tiene — deriva de señales
 * reales y observables, y cualquier personalidad o agente puede activarlo por
 * su cuenta.
 */

import type { VoiceGender } from "@/lib/aurora/personalities";

export type ModoVoz = VoiceGender | "autonoma";

const LS_MODO = "starseed.voz.modo.v1";
export const VOZ_MODO_EVENT = "starseed:voz-modo";

export const MODOS_VOZ: { id: ModoVoz; label: string; desc: string }[] = [
  { id: "femenina", label: "Femenina", desc: "Cálida y clara. La voz clásica de Astraura." },
  { id: "masculina", label: "Masculina", desc: "Grave y serena, con la misma cadencia." },
  { id: "neutra", label: "Neutra", desc: "Sin marca de género: timbre equilibrado." },
  { id: "autonoma", label: "Autónoma", desc: "Se modula sola según su carácter y el momento." },
];

/** Modulación base por género: hace que las tres suenen naturales de fábrica. */
export function ajustesVoz(modo: ModoVoz): { pitch: number; rate: number } {
  switch (modo) {
    case "masculina": return { pitch: 0.88, rate: 1.0 };
    case "neutra": return { pitch: 1.0, rate: 1.0 };
    case "autonoma": return { pitch: 1.0, rate: 1.0 }; // el modulador decide encima
    case "femenina":
    default: return { pitch: 1.06, rate: 1.02 };
  }
}

/** Modo de voz elegido en esta neurona (por defecto, femenina). */
export function getModoVoz(): ModoVoz {
  if (typeof window === "undefined") return "femenina";
  try {
    const v = window.localStorage.getItem(LS_MODO) as ModoVoz | null;
    return v && (["femenina", "masculina", "neutra", "autonoma"] as string[]).includes(v) ? v : "femenina";
  } catch {
    return "femenina";
  }
}

/** ¿Está la voz en modo autónomo (se modula sola)? */
export function vozAutonomaActiva(): boolean {
  return getModoVoz() === "autonoma";
}

/** Género EFECTIVO para elegir la voz del sistema (el autónomo parte de neutra). */
export function generoEfectivo(modo: ModoVoz = getModoVoz()): VoiceGender {
  return modo === "autonoma" ? "neutra" : modo;
}

export function suscribirModoVoz(cb: (m: ModoVoz) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb(getModoVoz());
  window.addEventListener(VOZ_MODO_EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(VOZ_MODO_EVENT, h);
    window.removeEventListener("storage", h);
  };
}

/**
 * Fija el modo de voz: persiste, lo VINCULA a la personalidad activa de Aurora
 * (`generoVoz`, editable luego en su editor) y suelta cualquier voz fijada a
 * mano, que si no seguiría mandando por encima de la elección nueva.
 */
export async function setModoVoz(modo: ModoVoz): Promise<void> {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_MODO, modo); } catch { /* sesión en memoria */ }
  // Suelta el pin de voz del navegador: una voz fijada antes ganaría siempre.
  try {
    const vc = await import("@/lib/aurora/tts-oss/voice-config");
    vc.setVoiceConfig?.({ browserVoiceURI: "" } as never);
  } catch { /* sin config unificada: el ranking decide igual */ }
  // Vincula la elección a la personalidad ACTIVA (la predeterminada de Aurora).
  try {
    const pers = await import("@/lib/aurora/personalities");
    const activa = pers.getActivePersonality?.();
    if (activa) {
      await pers.savePersonalityProfile?.({ ...activa, generoVoz: generoEfectivo(modo) });
    }
  } catch { /* la voz funciona igual; la vinculación se reintenta al guardar */ }
  try { window.dispatchEvent(new CustomEvent(VOZ_MODO_EVENT, { detail: modo })); } catch { /* */ }
}

/**
 * MODULACIÓN AUTÓNOMA — solo con señales REALES y observables:
 *   · los rasgos de la personalidad activa (calidez, energía, calma…),
 *   · la hora del dispositivo (de noche baja el ritmo y el tono).
 * Devuelve multiplicadores suaves; nunca deforma la voz.
 */
export function modulacionAutonoma(traits?: Record<string, number> | null): { pitch: number; rate: number } {
  let pitch = 1;
  let rate = 1;
  try {
    const t = traits ?? {};
    const num = (k: string, def = 50) => (typeof t[k] === "number" ? t[k] : def);
    // Energía/entusiasmo → algo más rápido y brillante; calma → lo contrario.
    const energia = (num("energia") + num("entusiasmo") + num("expresividad")) / 3;
    const calma = (num("calma") + num("serenidad") + num("paciencia")) / 3;
    rate += ((energia - 50) / 100) * 0.12 - ((calma - 50) / 100) * 0.08;
    pitch += ((energia - 50) / 100) * 0.06;
    // Hora local: de 22:00 a 7:00, media voz.
    const h = new Date().getHours();
    if (h >= 22 || h < 7) { rate -= 0.05; pitch -= 0.03; }
  } catch { /* señales no disponibles → sin modulación */ }
  return {
    pitch: Math.max(0.7, Math.min(1.4, pitch)),
    rate: Math.max(0.7, Math.min(1.35, rate)),
  };
}

/**
 * Ajustes FINALES de la voz para esta neurona: base por género y, en modo
 * autónomo, la modulación viva encima. Lo consume el motor al hablar.
 */
export function ajustesVozEfectivos(traits?: Record<string, number> | null): { pitch: number; rate: number } {
  const modo = getModoVoz();
  const base = ajustesVoz(modo);
  if (modo !== "autonoma") return base;
  const m = modulacionAutonoma(traits);
  return {
    pitch: Math.max(0.6, Math.min(1.6, base.pitch * m.pitch)),
    rate: Math.max(0.6, Math.min(1.6, base.rate * m.rate)),
  };
}
