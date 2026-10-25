// Habilidades de ingeniería · Laya elige cuál aplica y la capa que responde decide el tamaño
// (architecture/laya-y-habilidades.md §5, Ola 1018L · LYS1018K). Decide con `answer_confidence`
// (la calibrada), nunca `confidence`; inyecta tarjeta en reflejo/palabra pequeña, resumen en
// palabra/razón con Bonsai y la referencia a la guía completa en profunda/nube. Módulo PURO.
import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { Capa } from "@/lib/astraura/capas/catalogo";
import { UMBRAL_POR_DEFECTO, puntoDecision } from "@/lib/astraura/laya/puntos-decision";
import { HABILIDADES_INGENIERIA_A, type HabilidadIngenieria } from "./ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "./ingenieria-b";

/** Lo mínimo que necesita una habilidad para preguntarse, elegirse y dimensionarse. */
export type HabilidadElegible = Pick<HabilidadIngenieria,
  "id" | "nombre" | "cuando" | "tarjeta" | "resumen" | "rutaCompleta" | "autor" | "licencia">;

/** Capas que responden; «nube» es la capa final y «palabra-pequena» el modelo chico de palabra. */
export type CapaHabilidad = Capa | "nube" | "palabra-pequena";
export type TamanoHabilidad = "tarjeta" | "resumen" | "completa";

/** Respuesta real de Laya para una pregunta «choice» (forma del sistema uno). */
export interface RespuestaHabilidad {
  readonly type?: unknown;
  readonly choice?: unknown;
  readonly probabilities?: unknown;
  readonly answer_confidence?: unknown;
  readonly confidence?: unknown;
}

export const NINGUNA_HABILIDAD = "Ninguna habilidad: responder sin aplicar ninguna.";

/** Catálogo de ingeniería (I y J): las que Laya puede elegir. */
export const HABILIDADES_INGENIERIA: readonly HabilidadElegible[] =
  [...HABILIDADES_INGENIERIA_A, ...HABILIDADES_INGENIERIA_B];

/** Umbral del punto `habilidad.elegir`, sobre `answer_confidence` (la calibrada). */
export const UMBRAL_HABILIDAD = puntoDecision("habilidad.elegir")?.umbral ?? UMBRAL_POR_DEFECTO;

const HABILIDADES_POR_ID = new Map(HABILIDADES_INGENIERIA.map((h) => [h.id, h] as const));

const TAMANO_POR_CAPA: Readonly<Record<CapaHabilidad, TamanoHabilidad>> = {
  reflejo: "tarjeta", "palabra-pequena": "tarjeta", memoria: "tarjeta", voz: "tarjeta",
  adaptador: "tarjeta", palabra: "resumen", razon: "resumen",
  profunda: "completa", nube: "completa",
};

/** El tamaño que cabe en la capa que va a responder. */
export function tamanoParaCapa(capa: CapaHabilidad): TamanoHabilidad {
  return TAMANO_POR_CAPA[capa] ?? "tarjeta";
}

/** Arma la pregunta «choice» de Laya: el `cuando` de cada habilidad, más «ninguna». */
export function preguntaHabilidad(
  habilidades: readonly HabilidadElegible[] = HABILIDADES_INGENIERIA,
): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = h.cuando;
  criteria.ninguna = NINGUNA_HABILIDAD;
  return {
    type: "choice",
    instructions:
      "¿Qué habilidad de ingeniería conviene aplicar a esta tarea? Elige por su «cuando» o «ninguna».",
    criteria,
  };
}

/** La opción elegida: la cadena `choice` o, por tolerancia, la de mayor probabilidad. */
function opcionDe(respuesta: RespuestaHabilidad | null | undefined): string | null {
  if (!respuesta || typeof respuesta !== "object") return null;
  if (typeof respuesta.choice === "string" && respuesta.choice.trim()) return respuesta.choice;
  const probs = respuesta.probabilities;
  if (!probs || typeof probs !== "object" || Array.isArray(probs)) return null;
  let mejor: string | null = null;
  let valor = -Infinity;
  for (const [opcion, p] of Object.entries(probs as Record<string, unknown>)) {
    if (typeof p === "number" && Number.isFinite(p) && p > valor) {
      valor = p;
      mejor = opcion;
    }
  }
  return mejor;
}

/** `answer_confidence` (calibrada) o null: `confidence` de OpenRouter no decide nunca. */
function confianzaDe(respuesta: RespuestaHabilidad | null | undefined): number | null {
  if (!respuesta || typeof respuesta !== "object") return null;
  const c = respuesta.answer_confidence;
  return typeof c === "number" && Number.isFinite(c) ? c : null;
}

/** Texto con el tamaño pedido y su atribución, sin rutas absolutas ni datos sensibles. */
function textoDe(h: HabilidadElegible, tamano: TamanoHabilidad): string {
  const autor = `${h.autor}, ${h.licencia}`;
  if (tamano === "completa") {
    return `Habilidad de ingeniería «${h.nombre}»: guía completa en ${h.rutaCompleta} (${autor}).`;
  }
  const cuerpo = tamano === "tarjeta" ? h.tarjeta : h.resumen;
  return `Habilidad de ingeniería «${h.nombre}»: ${cuerpo} (${autor})`;
}

/** Texto a inyectar, o "" si Laya eligió «ninguna», no llegó o dudó por debajo del umbral. */
export function bloqueHabilidad(
  respuesta: RespuestaHabilidad | null | undefined,
  capa: CapaHabilidad,
  umbral: number = UMBRAL_HABILIDAD,
): string {
  try {
    const opcion = opcionDe(respuesta);
    if (!opcion || opcion === "ninguna") return "";
    const confianza = confianzaDe(respuesta);
    if (confianza === null || confianza < umbral) return "";
    const habilidad = HABILIDADES_POR_ID.get(opcion);
    if (!habilidad) return "";
    return textoDe(habilidad, tamanoParaCapa(capa));
  } catch {
    return "";
  }
}
