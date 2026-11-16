// (Ola 1018L · Tarea F «Planificador con Laya») Capa PURA que envuelve `preguntarALaya`
// específicamente para el punto `plan.dificultad`. El planificador llama a esta función
// con el texto de la tarea y los deps inyectados; llama a `preguntarALaya` y devuelve
// SOLO las respuestas (answers) o null si Laya no llegó a tiempo. Nunca espera más que
// el plazo del medio (contrato §2). Sin red, sin disco, sin reloj propio.
import { puntoDecision } from "./puntos-decision";
import { preguntarALaya, type DepsLaya, type PeticionClienteLaya } from "./cliente-laya";
import type { MedioLaya } from "./puntos-decision";
import type { RespuestasLaya } from "@/ai/astraura/router-laya";

/** Punto de decisión para el planificador. */
const PUNTO_PLANIFICADOR = "plan.dificultad";

/** Plazo máximo por medio para preguntas de planificación. */
const PLAZO_POR_MEDIO: Record<MedioLaya, number> = {
  a1: 8_000,
  mac: 8_000,
  navegador: 10_000,
  malla: 12_000,
};

/**
 * Pregunta a Laya por el punto de dificultad del planificador.
 *
 * @param textoTarea El texto completo de la tarea (se pasa como estado).
 * @param deps Dependencias inyectadas: fetch, clock, y opcionalmente relé de malla.
 * @param medio El medio donde corre (determina el plazo). Por defecto usa a1.
 * @param conversacion Si true, se añade X-Prioridad.
 * @returns Las respuestas de Laya (answers) o null si no llegó a tiempo, o si hubo error.
 *
 * Contrato §2: nunca espera más que el plazo del medio; si Laya no llega, devuelve null.
 */
export async function respuestasParaPlan(
  textoTarea: string,
  deps: DepsLaya,
  medio?: MedioLaya,
  conversacion: boolean = false,
): Promise<RespuestasLaya | null> {
  const punto = puntoDecision(PUNTO_PLANIFICADOR);
  if (!punto) return null;

  const medioDefecto: MedioLaya = "a1";
  const medioFinal = medio ?? medioDefecto;
  const plazo = PLAZO_POR_MEDIO[medioFinal] ?? punto.plazoMsPorMedio[medioFinal];

  const peticion: PeticionClienteLaya = {
    punto: PUNTO_PLANIFICADOR,
    estado: textoTarea,
    medio: medioFinal,
    ...(conversacion ? { conversacion: true } : {}),
  };

  const salida = await preguntarALaya(peticion, deps);

  if (!salida.respuestas || salida.donde === null) {
    return null;
  }

  return salida.respuestas as RespuestasLaya;
}

const NIVELES_VALIDOS = ["baja", "media", "alta"] as const;
type NivelDificultad = typeof NIVELES_VALIDOS[number];

/**
 * Extrae la dificultad (nivel: "baja", "media", "alta") de las respuestas de Laya.
 *
 * @param respuestas Las respuestas de Laya (deben contener la pregunta "dificultad" con tipo "score").
 * @returns El nivel de dificultad o null si no está en las respuestas.
 */
export function nivelDeDificultad(respuestas: RespuestasLaya | null): NivelDificultad | null {
  if (!respuestas || typeof respuestas !== "object") return null;
  const d = respuestas.dificultad;
  if (!d || typeof d !== "object") return null;
  const score = (d as { score?: unknown }).score;
  if (typeof score === "string" && NIVELES_VALIDOS.includes(score as NivelDificultad)) {
    return score as NivelDificultad;
  }
  return null;
}

/**
 * Extrae si basta un modelo pequeño del noul de Laya.
 * El noul es el número `noul` o, por tolerancia, la probabilidad de «sí».
 *
 * @param respuestas Las respuestas de Laya (deben contener la pregunta "basta_pequeno" con tipo "noul").
 * @returns El valor del noul (0-1) o null si no está en las respuestas.
 */
export function valorNoulBasta(respuestas: RespuestasLaya | null): number | null {
  if (!respuestas || typeof respuestas !== "object") return null;
  const b = respuestas.basta_pequeno;
  if (!b || typeof b !== "object") return null;
  const noul = (b as { noul?: unknown }).noul;
  if (typeof noul === "number" && Number.isFinite(noul)) return noul;
  const probs = (b as { probabilities?: unknown }).probabilities;
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    const si = (probs as Record<string, unknown>)["sí"] ?? (probs as Record<string, unknown>)["si"];
    if (typeof si === "number" && Number.isFinite(si)) return si;
  }
  return null;
}