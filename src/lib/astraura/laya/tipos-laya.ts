// src/lib/astraura/laya/tipos-laya.ts
// Tipos Laya para el catálogo de puntos de decisión

export interface PreguntaLaya {
  type: "choice" | "score" | "noul";
  instructions: string;
  criteria?: Record<string, string>;
}