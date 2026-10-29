import type { PreguntaChoice } from "@/lib/jev/decisiones";
import type { RespuestaLaya } from "@/ai/astraura/router-laya";
import { HABILIDADES_INGENIERIA_A, type HabilidadIngenieria } from "./ingenieria-a";
import { HABILIDADES_INGENIERIA_B } from "./ingenieria-b";

/**
 * Elegir habilidad con Laya · Ola 1018L · tarea LYS1018K (bloque Habilidades, K)
 * ---------------------------------------------------------------------------
 * Laya elige CUÁL habilidad de ingeniería aplica y el TAMAÑO sale de la capa
 * que va a responder (contrato architecture/laya-y-habilidades.md §4-§5):
 *  · preguntaHabilidad arma la pregunta `choice` (criterio = el `cuando` de
 *    cada habilidad + la opción «ninguna»);
 *  · bloqueHabilidad convierte la respuesta decidida en el texto a inyectar:
 *    tarjeta para reflejo y palabra pequeña, resumen para palabra y razón con
 *    Bonsai, y la referencia al SKILL.md completo para profunda y nube.
 * Decide SOLO con `answer_confidence` (la calibrada de Laya); si falta, duda o
 * dice «ninguna», no se inyecta nada. En CPU Laya tarda segundos (contrato §2):
 * quien llama no debe bloquear la primera palabra de una conversación.
 *
 * Módulo PURO: sin red, sin disco, sin reloj y sin modelos (las respuestas son
 * de ejemplo en las pruebas, con la forma real de system_one).
 */

/** Registro conjunto de las habilidades de ingeniería (manos A y B). */
export const HABILIDADES_INGENIERIA: HabilidadIngenieria[] = [
  ...HABILIDADES_INGENIERIA_A,
  ...HABILIDADES_INGENIERIA_B,
];

/** Opción extra de la pregunta: ninguna habilidad aplica. */
export const ID_NINGUNA = "ninguna";
/** Criterio de la opción «ninguna»: responder tal cual, sin guías. */
export const CRITERIO_NINGUNA =
  "Ninguna habilidad de ingeniería aplica: la petición se responde tal cual, sin guías.";

/** Capa que va a responder; elige el tamaño del texto (capas-autoadaptables.md §3). */
export type CapaHabilidad =
  | "reflejo"
  | "palabra-pequena"
  | "palabra"
  | "razon"
  | "profunda"
  | "nube";

/** Tamaño de la habilidad según la capa que responde. */
export type TamanoHabilidad = "tarjeta" | "resumen" | "completa";

/** El tamaño lo decide la CAPA: Needle/BitNet leen tarjeta, Bonsai resumen y las capas mayores cargan la completa. */
export const TAMANO_POR_CAPA: Readonly<Record<CapaHabilidad, TamanoHabilidad>> = {
  reflejo: "tarjeta",
  "palabra-pequena": "tarjeta",
  palabra: "resumen",
  razon: "resumen",
  profunda: "completa",
  nube: "completa",
};

/** Arma la pregunta `choice` de Laya: el criterio es el `cuando` de cada habilidad. */
export function preguntaHabilidad(habilidades: HabilidadIngenieria[]): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = h.cuando;
  criteria[ID_NINGUNA] = CRITERIO_NINGUNA;
  return {
    type: "choice",
    instructions: "¿Qué habilidad de ingeniería encaja mejor con la petición?",
    criteria,
  };
}

/** La opción elegida: la cadena `choice` o, por tolerancia, la opción mayor de `probabilities`. */
function opcionDe(r: RespuestaLaya): string | null {
  if (typeof r.choice === "string" && r.choice) return r.choice;
  const probs = r.probabilities;
  if (probs && typeof probs === "object" && !Array.isArray(probs)) {
    const pares = Object.entries(probs).filter(
      (x): x is [string, number] => typeof x[1] === "number" && x[0].length > 0,
    );
    const mayor = pares.sort((a, b) => b[1] - a[1])[0];
    if (mayor) return mayor[0];
  }
  return null;
}

/** La calibrada `answer_confidence`: la ÚNICA que sirve para decidir (no `confidence`). */
function confianzaDe(r: RespuestaLaya): number | null {
  if (typeof r.answer_confidence === "number" && Number.isFinite(r.answer_confidence)) {
    return r.answer_confidence;
  }
  return null;
}

/**
 * Devuelve el texto a inyectar para la capa `capa`, o null cuando no hay nada:
 * respuesta de forma rara, opción «ninguna», habilidad desconocida, confianza
 * bajo el umbral o capa inválida. Nunca lanza.
 */
export function bloqueHabilidad(
  respuesta: RespuestaLaya | null | undefined,
  capa: CapaHabilidad,
  umbral: number,
): string | null {
  try {
    if (!respuesta || typeof respuesta !== "object") return null;
    if (!Object.prototype.hasOwnProperty.call(TAMANO_POR_CAPA, capa)) return null;
    const confianza = confianzaDe(respuesta);
    if (confianza === null || confianza < umbral) return null;
    const id = opcionDe(respuesta);
    if (!id || id === ID_NINGUNA) return null;
    const habilidad = HABILIDADES_INGENIERIA.find((h) => h.id === id);
    if (!habilidad) return null;
    const tamano = TAMANO_POR_CAPA[capa];
    if (tamano === "completa") {
      return (
        `Aplica la habilidad de ingeniería «${habilidad.nombre}». La guía completa ` +
        `(texto original, en la copia vendor del OS) está en ${habilidad.rutaCompleta}: ` +
        "cárgala y síguela con todo el detalle."
      );
    }
    return `Aplica la habilidad de ingeniería «${habilidad.nombre}»: ${habilidad[tamano]}`;
  } catch {
    return null;
  }
}
