/**
 * TIPOS DE PREGUNTAS DE LAYA (Ola 1018L · Laya en todas las capas de Astraura)
 * ─────────────────────────────────────────────────────────────────────────────
 * Define la estructura nativa de las preguntas que se le pueden hacer a Laya.
 */

/**
 * Tipo de pregunta que se puede hacer a Laya
 */
export type TipoPreguntaLaya = "choice" | "score" | "noul";

/**
 * Pregunta nativa de Laya en su formato original
 */
export interface PreguntaLaya {
  /** Tipo de pregunta: choice, score o noul */
  type: TipoPreguntaLaya;
  /** Instrucciones en español para Laya */
  instructions: string;
  /** Criterios de evaluación (solo para tipo 'choice') */
  criteria?: Record<string, string>;
}