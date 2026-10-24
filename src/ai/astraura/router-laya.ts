// (Ola 1018L · Tarea F «Planificador con Laya») Capa PURA que afina el perfil
// de tarea del router con las respuestas de Laya del punto «plan.dificultad»
// (architecture/laya-y-habilidades.md §4): el planificador consulta a Laya la
// DIFICULTAD (score baja/media/alta) y si BASTA UN MODELO PEQUENO (noul), y
// ajusta `difficulty` solo cuando la confianza de cada pregunta (la calibrada
// `answer_confidence`) alcanza el umbral del punto. Sin red, sin disco, sin
// reloj: la petición YA trae las respuestas — nunca se espera a Laya aquí.
import type { TaskProfile } from "./router";
import { puntoDecision, UMBRAL_POR_DEFECTO } from "@/lib/astraura/laya/puntos-decision";

/** Una respuesta individual de Laya/Jev, con su forma real de sistema uno. */
export interface RespuestaLaya {
  type?: unknown;
  choice?: unknown;
  score?: unknown;
  noul?: unknown;
  probabilities?: unknown;
  /** La calibrada: la ÚNICA que decide. */
  answer_confidence?: unknown;
  /** De OpenRouter, NO calibrada: se ignora siempre (decidir nunca con ella). */
  confidence?: unknown;
}

/** Respuestas de Laya por nombre de pregunta («dificultad», «basta_pequeno»). */
export type RespuestasLaya = Readonly<Record<string, RespuestaLaya>>;

export const DIFICULTAD_POR_NIVEL: Readonly<Record<string, number>> = {
  baja: 0.2,
  media: 0.5,
  alta: 0.85,
};
/** p del noul «¿basta un modelo pequeño?» que pasa de seguro a acotar. */
export const BASTA_PEQUENO_ARRIBA = 0.7;
/** p del noul por debajo de la cual Laya afirma que pequeño NO basta. */
export const BASTA_PEQUENO_ABAJO = 0.3;
/** Tope de dificultad cuando Laya asegura que basta un modelo pequeño. */
const TECHO_MODELO_PEQUENO = 0.4;
/** Suelo de dificultad cuando Laya asegura que pequeño NO basta. */
const SUELO_MODELO_FUERTE = 0.65;
/** Respuestas del punto del planificador; el umbral sale del catálogo de puntos. */
const PUNTO_PLAN = puntoDecision("plan.dificultad");
export const UMBRAL_PLANIFICADOR = PUNTO_PLAN?.umbral ?? UMBRAL_POR_DEFECTO;

/** Devuelve la respuesta de una pregunta, o null si no trae forma de Laya. */
function respuestaDe(respuestas: RespuestasLaya, pregunta: string): RespuestaLaya | null {
  const r = respuestas[pregunta];
  return r && typeof r === "object" ? r : null;
}

/** La calibrada `answer_confidence`: la ÚNICA que sirve para decidir (no `confidence`). */
function confianzaDe(r: RespuestaLaya): number | null {
  if (typeof r.answer_confidence === "number" && Number.isFinite(r.answer_confidence)) {
    return r.answer_confidence;
  }
  return null;
}

/** Nivel elegido del score: la cadena de `score` o, por tolerancia, la opción mayor de `probabilities`. */
function nivelDe(r: RespuestaLaya): string | null {
  if (typeof r.score === "string" && r.score) return r.score;
  const probs = r.probabilities;
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    const pares = Object.entries(probs).filter(([, v]) => typeof v === "number");
    const mayor = pares.sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    if (mayor && typeof mayor[0] === "string" && mayor[0]) return mayor[0];
  }
  return null;
}

/** p del noul: el número `noul` o, por tolerancia, la probabilidad de «sí». */
export function valorNoul(r: RespuestaLaya): number | null {
  if (typeof r.noul === "number" && Number.isFinite(r.noul)) return r.noul;
  const probs = r.probabilities;
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    const si = (probs as Record<string, unknown>)["sí"] ?? (probs as Record<string, unknown>)["si"];
    if (typeof si === "number" && Number.isFinite(si)) return si;
  }
  return null;
}

/** La decisión de una pregunta solo vale si su `answer_confidence` alcanza el umbral. */
function decidida(respuestas: RespuestasLaya, pregunta: string) {
  const r = respuestaDe(respuestas, pregunta);
  if (!r) return null;
  const confianza = confianzaDe(r);
  if (confianza === null || confianza < UMBRAL_PLANIFICADOR) return null;
  return { r, confianza };
}

/**
 * Afina la clasificación del router con las respuestas de Laya que YA trae la
 * petición (el planificador NO espera a Laya: en CPU tarda segundos y nunca
 * bloquea la primera palabra — contrato §2). Regla:
 *  · score «dificultad» decidido → Laya FIJA la dificultad por nivel.
 *  · noul «basta_pequeno» decidido: p ≥ 0,7 acota la dificultad hacia lo
 *    pequeño (techo 0,4); p ≤ 0,3 la empuja hacia lo fuerte (suelo 0,65).
 * NUNCA cambia la privacidad (`needsVision`) ni el contexto (`chars`), nunca
 * cambia el `kind` (eso lo deciden las reglas de `classifyTask`), y nunca lanza:
 * una respuesta de forma rara se ignora. Sin Laya (null/objeto sin decisiones
 * válidas) devuelve la clasificación TAL CUAL.
 */
export function refinarConLaya(
  clasificacion: TaskProfile,
  respuestasLaya: RespuestasLaya | null | undefined,
): TaskProfile {
  try {
    if (!respuestasLaya || typeof respuestasLaya !== "object" || Array.isArray(respuestasLaya)) {
      return clasificacion;
    }
    // Soporta tanto el mapa plano de respuestas como el sobre `{ answers: … }`.
    const brutas = (respuestasLaya as { answers?: unknown }).answers;
    const respuestas: RespuestasLaya =
      brutas && typeof brutas === "object" && !Array.isArray(brutas)
        ? (brutas as RespuestasLaya)
        : (respuestasLaya as RespuestasLaya);
    let dificultad = clasificacion.difficulty;
    const nivel = decidida(respuestas, "dificultad");
    if (nivel) {
      const objetivo = DIFICULTAD_POR_NIVEL[nivelDe(nivel.r) ?? ""];
      if (typeof objetivo === "number") dificultad = objetivo;
    }
    const basta = decidida(respuestas, "basta_pequeno");
    if (basta) {
      const p = valorNoul(basta.r);
      if (p !== null) {
        if (p >= BASTA_PEQUENO_ARRIBA) dificultad = Math.min(dificultad, TECHO_MODELO_PEQUENO);
        else if (p <= BASTA_PEQUENO_ABAJO) dificultad = Math.max(dificultad, SUELO_MODELO_FUERTE);
      }
    }
    const final = Math.max(0, Math.min(1, dificultad));
    if (final === clasificacion.difficulty) return clasificacion;
    return { ...clasificacion, difficulty: final };
  } catch {
    return clasificacion;
  }
}
