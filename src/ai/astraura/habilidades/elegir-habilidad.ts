// Habilidades de ingeniería · Laya elige cuál aplica y el tamaño sale de la capa
// que responde (Ola 1018L · LYS1018K; contrato architecture/laya-y-habilidades.md
// §4 y §5). `preguntaHabilidad` arma la pregunta «choice» del punto
// «habilidad.elegir» (el «cuando» de cada habilidad + «ninguna»);
// `bloqueHabilidad` decide con la `answer_confidence` CALIBRADA (nunca
// `confidence`, nunca `score` ni `noul`) y devuelve el texto a inyectar según la
// capa que va a responder: la TARJETA (≤ 60 palabras) para reflejo y palabra
// pequeña, el RESUMEN (≤ 120 palabras) para palabra/razón, y para las capas
// profunda y nube la referencia a la guía completa. Módulo PURO: sin red, sin
// disco, sin reloj; Laya nunca bloquea aquí — la respuesta YA viene en la
// petición (en CPU tarda segundos: nunca bloquea la primera palabra, §2).
import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { Capa } from "@/lib/astraura/capas/catalogo";
import { puntoDecision, UMBRAL_POR_DEFECTO } from "@/lib/astraura/laya/puntos-decision";
import { HABILIDADES_INGENIERIA, type HabilidadIngenieria } from "../skills-ingenieria";

/** Opción de salida cuando ninguna habilidad encaja (igual criterio que el catálogo). */
export const NINGUNA = "ninguna";
export const CRITERIO_NINGUNA = "Ninguna habilidad: responder sin aplicar ninguna";

/** Umbral del punto «habilidad.elegir» del catálogo, sobre la calibrada. */
export const UMBRAL_HABILIDAD =
  puntoDecision("habilidad.elegir")?.umbral ?? UMBRAL_POR_DEFECTO;

/** Tamaños de §5: cada capa tiene su ventana. El planificador puede pedir un
 *  tamaño menor (palabra pequeña), no uno mayor que su capa. */
export type TamanoHabilidad = "tarjeta" | "resumen" | "completa";
export const TAMANO_POR_CAPA: Record<Capa, TamanoHabilidad> = {
  reflejo: "tarjeta", juicio: "tarjeta", memoria: "tarjeta", voz: "tarjeta",
  adaptador: "tarjeta", palabra: "resumen", razon: "resumen", profunda: "completa",
};

/** Respuesta individual de Laya/Jev con su forma real de systemone, sin normalizar. */
export interface RespuestaHabilidad {
  type?: unknown;
  choice?: unknown;
  /** De un noul/score: presentes si la respuesta no era una choice; se ignoran. */
  noul?: unknown;
  score?: unknown;
  probabilities?: unknown;
  /** La calibrada: la ÚNICA que decide con umbral (carrera §1). */
  answer_confidence?: unknown;
  /** De OpenRouter, NO calibrada: se ignora siempre (nunca decide). */
  confidence?: unknown;
}

/** La pregunta «choice» del punto «habilidad.elegir»; criterio = «cuando» de cada una. */
export function preguntaHabilidad(
  habilidades: readonly HabilidadIngenieria[] = HABILIDADES_INGENIERIA,
): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = `${h.nombre}: ${h.cuando}`;
  criteria[NINGUNA] = CRITERIO_NINGUNA;
  return {
    type: "choice",
    instructions: "¿Qué habilidad conviene aplicar a esta tarea?",
    criteria,
  };
}

/** El elegido: la cadena `choice` o, por tolerancia, la opción mayor de `probabilities`. */
function elegidoDe(r: RespuestaHabilidad): string | null {
  if (typeof r.choice === "string" && r.choice.trim()) return r.choice;
  const probs = r.probabilities;
  if (!probs || typeof probs !== "object" || Array.isArray(probs)) return null;
  const pares = Object.entries(probs).filter((x): x is [string, number] =>
    typeof x[1] === "number" && Number.isFinite(x[1]));
  if (!pares.length) return null;
  const mayor = pares.sort((a, b) => b[1] - a[1])[0];
  return typeof mayor[0] === "string" && mayor[0].trim() ? mayor[0] : null;
}

/** El texto a inyectar, del tamaño pedido: tarjeta, resumen o referencia completa. */
function textoBloque(h: HabilidadIngenieria, tamano: TamanoHabilidad): string {
  if (tamano === "completa") {
    return (
      `Aplica la habilidad «${h.id}» (${h.nombre}) con su GUÍA COMPLETA en ` +
      `${h.rutaCompleta}: léela entera y sigue sus pasos; el texto íntegro lo pide tu capa.`
    );
  }
  const texto = tamano === "tarjeta" ? h.tarjeta : h.resumen;
  return `Habilidad «${h.id}» · ${h.nombre}: ${texto} (${h.autor}, ${h.licencia}).`;
}

/** Decisión del punto «habilidad.elegir»: `null` = nada que inyectar (no lanzamos).
 *  Regla: sin `answer_confidence` calibrada, o por debajo del umbral, o «ninguna»,
 *  o un id desconocido (forma rara ignorada) → `null`. El tamaño sale de la capa
 *  (`TAMANO_POR_CAPA`) y `tamano` lo abajo si una palabra pequeña pide tarjeta. */
export function bloqueHabilidad(
  respuesta: RespuestaHabilidad | null | undefined,
  capa: Capa,
  umbral: number = UMBRAL_HABILIDAD,
  tamano?: TamanoHabilidad,
): string | null {
  try {
    if (!respuesta || typeof respuesta !== "object") return null;
    const c = respuesta.answer_confidence;
    if (typeof c !== "number" || !Number.isFinite(c) || c < umbral) return null;
    const elegido = elegidoDe(respuesta);
    if (!elegido || elegido === NINGUNA) return null;
    const h = HABILIDADES_INGENIERIA.find((x) => x.id === elegido);
    if (!h) return null;
    return textoBloque(h, tamano ?? TAMANO_POR_CAPA[capa] ?? "tarjeta");
  } catch {
    return null;
  }
}
