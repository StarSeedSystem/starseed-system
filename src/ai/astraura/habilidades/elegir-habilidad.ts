import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { HabilidadIngenieria } from "./ingenieria-a";
import { HABILIDADES_INGENIERIA_A } from "./ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "./ingenieria-b";

/**
 * Elegir habilidad · Laya elige cuál aplica y el tamaño sale de la capa
 * ----------------------------------------------------------------------
 * (Ola 1018L · LYS1018K · contrato architecture/laya-y-habilidades.md §5.)
 * `preguntaHabilidad` arma la pregunta «choice» de Laya: criterio = el `cuando`
 * de cada habilidad + «ninguna». `bloqueHabilidad` devuelve el texto a inyectar
 * según la capa que responde: TARJETA (≤ 60 palabras) para reflejo y palabra
 * pequeña (Needle y BitNet), RESUMEN (≤ 120) para palabra y razón (Bonsai) y la
 * referencia al texto COMPLETO para profunda y nube; devuelve "" cuando Laya
 * elige «ninguna», cuando su `answer_confidence` (la calibrada) cae bajo el
 * umbral o cuando la respuesta no responde esta pregunta.
 * Módulo PURO: sin red, disco ni reloj (sirve en cliente y servidor).
 */

/** Id de la opción «no aplica ninguna». */
export const NINGUNA_HABILIDAD = "ninguna";

/** Las habilidades de ingeniería (A + B): el catálogo por defecto de Laya. */
export const HABILIDADES_INGENIERIA: HabilidadIngenieria[] = [
  ...HABILIDADES_INGENIERIA_A,
  ...HABILIDADES_INGENIERIA_B,
];

/** Capa del planificador que pide un bloque de habilidad. */
export type CapaHabilidad = "reflejo" | "palabra-pequena" | "palabra" | "razon" | "profunda" | "nube";

/** Tamaño del texto de la habilidad que le toca a cada capa que responde. */
export const TAMANO_POR_CAPA: Record<CapaHabilidad, "tarjeta" | "resumen" | "completa"> = {
  reflejo: "tarjeta",
  "palabra-pequena": "tarjeta",
  palabra: "resumen",
  razon: "resumen",
  profunda: "completa",
  nube: "completa",
};

/** Lo mínimo que hace falta de una habilidad para elegirla e inyectarla. */
export interface HabilidadElegible {
  id: string;
  nombre: string;
  /** Una frase con cuándo aplica (el criterio de la pregunta de Laya). */
  cuando: string;
  /** ≤ 60 palabras, para reflejo y palabra pequeña (Needle y BitNet). */
  tarjeta: string;
  /** ≤ 120 palabras, para palabra y razón (Bonsai). */
  resumen: string;
  /** Ruta relativa del texto completo (el SKILL.md original). */
  rutaCompleta: string;
}

/** Respuesta de Laya a la pregunta de habilidades, en su forma REAL (formato
 *  system_one: `choice` + `probabilities` + `answer_confidence`calibrada) o ya
 *  normalizada (`Decision` de decisiones.ts: tipo/valor/confianza). */
export interface RespuestaLayaHabilidad {
  type?: string;
  tipo?: string;
  choice?: unknown;
  valor?: unknown;
  noul?: unknown;
  score?: unknown;
  answer_confidence?: unknown;
  confidence?: unknown;
  confianza?: unknown;
  probabilities?: Record<string, number>;
}

/** Arma la pregunta «choice» de Laya para elegir qué habilidad aplica. */
export function preguntaHabilidad(habilidades: HabilidadElegible[]): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = `${h.nombre}: ${h.cuando}`;
  criteria[NINGUNA_HABILIDAD] =
    "Ninguna: la situación no casa con ninguna habilidad registrada y se actúa sin inyectar ninguna.";
  return { type: "choice", instructions: "¿Qué habilidad aplica a esta situación?", criteria };
}

/** La opción elegida: `choice` (o `valor`, ya normalizada) o, sin ellos, la
 *  primera clave de `probabilities`, como hace `leerRespuesta`. */
function opcionElegida(r: RespuestaLayaHabilidad): string {
  if (typeof r.choice === "string") return r.choice;
  if (typeof r.valor === "string") return r.valor;
  const probs = r.probabilities;
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    const primera = Object.keys(probs)[0];
    if (primera) return primera;
  }
  return "";
}

/** La confianza de decisión: `answer_confidence` (la calibrada de Laya) primero;
 *  `confidence`/`confianza` solo de respaldo defensivo. Sin ninguna, 0. */
function confianzaDe(r: RespuestaLayaHabilidad): number {
  for (const v of [r.answer_confidence, r.confidence, r.confianza]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

/** Bloque a inyectar en la capa `capa`, o "" cuando no toca: Laya eligió
 *  «ninguna», su confianza calibrada queda bajo `umbral`, la respuesta no es de
 *  esta pregunta (noul/score) o el id elegido no está en el catálogo. */
export function bloqueHabilidad(
  respuesta: RespuestaLayaHabilidad,
  capa: CapaHabilidad,
  umbral: number,
  habilidades: HabilidadElegible[] = HABILIDADES_INGENIERIA,
): string {
  const tamano = TAMANO_POR_CAPA[capa];
  if (!tamano) throw new Error(`capa desconocida para bloqueHabilidad: «${String(capa)}»`);
  const tipo =
    typeof respuesta.type === "string" ? respuesta.type
    : typeof respuesta.tipo === "string" ? respuesta.tipo
    : "choice";
  if (tipo !== "choice") return "";
  const eleccion = opcionElegida(respuesta);
  if (!eleccion || eleccion === NINGUNA_HABILIDAD) return "";
  if (confianzaDe(respuesta) < umbral) return "";
  const elegida = habilidades.find((h) => h.id === eleccion);
  if (!elegida) return "";
  if (tamano === "completa") {
    return `Habilidad aplicada · ${elegida.nombre}: lee el texto completo en ${elegida.rutaCompleta} antes de actuar.`;
  }
  return `Habilidad aplicada · ${elegida.nombre}: ${elegida[tamano]}`;
}
