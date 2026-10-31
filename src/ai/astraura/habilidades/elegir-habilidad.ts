import { HABILIDADES_INGENIERIA } from "@/ai/astraura/skills-ingenieria";
import type { PreguntaChoice } from "@/lib/jev/decisiones";

/**
 * Elegir habilidad · Laya elige cuál aplica y el tamaño sale de la capa
 * -------------------------------------------------------------------
 * Ola 1018L · LYS1018K (architecture/laya-y-habilidades.md §5): la capa reflejo
 * pregunta a Laya con `preguntaHabilidad` (choice entre habilidades + «ninguna»)
 * y quien responde recibe con `bloqueHabilidad` el texto de la habilidad al
 * tamaño de SU capa: tarjeta para reflejo y palabra pequeña (Needle/BitNet),
 * resumen para palabra y razón con Bonsai, y para profunda y nube la referencia
 * al SKILL.md completo, que esas capas pueden cargar.
 *
 * Módulo PURO: datos y funciones sin red, disco ni reloj (sirve en cliente y
 * servidor). Laya en CPU tarda segundos: nunca bloquea la primera palabra.
 */

export interface HabilidadElegible {
  /** Igual al `name` del SKILL.md original. */
  readonly id: string;
  readonly nombre: string;
  /** Cuándo aplica, en una frase: es la opción que Laya ve. */
  readonly cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  readonly tarjeta: string;
  /** ≤ 120 palabras, para Bonsai pequeño. */
  readonly resumen: string;
  /** Ruta del SKILL.md original, relativa a la raíz del repositorio. */
  readonly rutaCompleta: string;
}

export const NINGUNA = "ninguna";

export interface RespuestaLayaChoice {
  readonly choice?: string;
  readonly probabilities?: Readonly<Record<string, number>>;
  /** La calibrada: es la que sirve para decidir con umbral, nunca `confidence`. */
  readonly answer_confidence?: number;
}

/** El tamaño del texto según la capa que responde; capa sin entrada no inyecta nada. */
export type TamanoInyeccion = "tarjeta" | "resumen" | "completa";
export const TAMANO_POR_CAPA: Readonly<Record<string, TamanoInyeccion>> = Object.freeze({
  reflejo: "tarjeta",
  "palabra-pequena": "tarjeta",
  palabra: "resumen",
  razon: "resumen",
  profunda: "completa",
  nube: "completa",
});

/** Arma la pregunta choice de Laya del punto `habilidad.elegir`: el criterio de
 *  cada opción es el `cuando` de la habilidad, más «ninguna» como salida. */
export function preguntaHabilidad(
  habilidades: readonly HabilidadElegible[] = HABILIDADES_INGENIERIA,
): PreguntaChoice {
  const criteria: Record<string, string> = {};
  for (const h of habilidades) criteria[h.id] = h.cuando;
  criteria[NINGUNA] = "Ninguna habilidad: responder sin aplicar ninguna";
  return {
    type: "choice",
    instructions: "¿Qué habilidad conviene aplicar a esta tarea?",
    criteria,
  };
}

/** Texto de la habilidad elegida al tamaño de la capa que responde, para inyectar
 *  en su turno. Devuelve «» si Laya no contestó, su confianza (calibrada) queda
 *  bajo el umbral, eligió «ninguna» se desconoce el id o la capa no recibe habilidad. */
export function bloqueHabilidad(
  respuesta: RespuestaLayaChoice | null,
  capa: string,
  umbral = 0.6,
  habilidades: readonly HabilidadElegible[] = HABILIDADES_INGENIERIA,
): string {
  const c = respuesta?.answer_confidence;
  if (!respuesta || typeof c !== "number" || !Number.isFinite(c) || c < umbral) return "";
  const id = respuesta.choice;
  if (!id || id === NINGUNA) return "";
  const h = habilidades.find((x) => x.id === id);
  if (!h) return "";
  const tamano: TamanoInyeccion | undefined = TAMANO_POR_CAPA[capa];
  if (!tamano) return "";
  if (tamano === "completa")
    return `Ha elegido Laya la habilidad «${h.nombre}»: lee y aplica el texto íntegro de ${h.rutaCompleta}.`;
  return `Aplica la habilidad «${h.nombre}»: ${h[tamano]}`;
}
