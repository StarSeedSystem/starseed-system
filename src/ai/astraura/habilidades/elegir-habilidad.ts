import type { Decision, PreguntaChoice } from "@/lib/jev/decisiones";
import {
  HABILIDADES_INGENIERIA_A,
  type HabilidadIngenieria,
} from "./ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "./ingenieria-b";

/**
 * Elegir habilidad · Laya elige la skill y la capa manda el tamaño
 * ---------------------------------------------------------------
 * (contrato architecture/laya-y-habilidades.md §5): Laya responde una pregunta
 * «choice» entre las habilidades de ingeniería + «ninguna», y el bloque que se
 * inyecta depende de la CAPA que va a responder: tarjeta (≤ 60 palabras) para
 * Needle y BitNet (reflejo y palabra pequeña), resumen (≤ 120 palabras) para
 * Bonsai (palabra y razón) y la referencia al texto completo para profunda y
 * nube. Decisión con umbral por `answer_confidence` (calibrada).
 *
 * Módulo PURO: sin red, disco, reloj ni modelo; la respuesta de Laya entra ya
 * leída (forma real: choice/probabilities/answer_confidence, ver Decision).
 */

/** Opción de salida cuando NINGUNA habilidad aplica. */
export const OPCION_NINGUNA = "ninguna";

/**
 * Umbral de `answer_confidence` por defecto: en español la confianza de Laya
 * baja (0,95 → 0,61 medido en el A1); por debajo, se queda sin habilidad.
 */
export const UMBRAL_CONFIANZA_DEFECTO = 0.6;

/** Capas de Astraura que pueden recibir un bloque de habilidad. */
export type CapaHabilidad =
  | "reflejo"
  | "palabra-pequeña"
  | "palabra"
  | "razón"
  | "profunda"
  | "nube";

/** Lo mínimo que preguntaHabilidad necesita de cada habilidad. */
export interface OpcionHabilidad {
  id: string;
  cuando: string;
}

export const HABILIDADES_INGENIERIA: HabilidadIngenieria[] = [
  ...HABILIDADES_INGENIERIA_A,
  ...HABILIDADES_INGENIERIA_B,
];

export function preguntaHabilidad(
  habilidades: OpcionHabilidad[] = HABILIDADES_INGENIERIA,
): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = `${h.id}: ${h.cuando}`;
  criteria[OPCION_NINGUNA] =
    "Ninguna habilidad de ingeniería aplica: responde normal, sin tarjeta extra.";
  return {
    type: "choice",
    instructions: "¿Qué habilidad de ingeniería aplica a esta tarea?",
    criteria,
  };
}

const TAMANO_POR_CAPA: Record<CapaHabilidad, "tarjeta" | "resumen" | "completa"> = {
  reflejo: "tarjeta",
  "palabra-pequeña": "tarjeta",
  palabra: "resumen",
  "razón": "resumen",
  profunda: "completa",
  nube: "completa",
};

const baseTexto = (h: HabilidadIngenieria): string =>
  `Habilidad «${h.nombre}» (${h.autor}, ${h.licencia}) — `;

const bloquePorTamano = (
  h: HabilidadIngenieria,
  tamano: "tarjeta" | "resumen" | "completa",
): string => {
  if (tamano === "tarjeta") return `${baseTexto(h)}${h.tarjeta}`;
  if (tamano === "resumen") return `${baseTexto(h)}${h.resumen}`;
  return `${baseTexto(h)}guía completa en ${h.rutaCompleta}. ${h.tarjeta}`;
};

export function bloqueHabilidad(
  respuesta: Decision,
  capa: CapaHabilidad,
  umbral: number = UMBRAL_CONFIANZA_DEFECTO,
): string {
  if (respuesta.tipo !== "choice") return "";
  const id = typeof respuesta.valor === "string" ? respuesta.valor : "";
  if (!id || id === OPCION_NINGUNA) return "";
  if (!(respuesta.confianza >= umbral)) return "";
  const h = HABILIDADES_INGENIERIA.find((x) => x.id === id);
  if (!h) return "";
  return bloquePorTamano(h, TAMANO_POR_CAPA[capa]);
}
