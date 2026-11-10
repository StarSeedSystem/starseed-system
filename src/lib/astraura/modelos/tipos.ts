// Tipos del catálogo comparativo de modelos locales (MOD1110A · 2026-11-10).
// Contrato: architecture/modelos-recomendados.md. Módulo PURO: sin red, sin disco, sin DOM.

/** Con qué se ejecuta de verdad un modelo en una neurona. */
export type RuntimeLocal =
  | "ollama"
  | "llama-cpp"
  | "bitnet-cpp"
  | "needle-nativo"
  | "needle-wasm"
  | "webgpu"
  | "colibri";

/** Casos de uso en términos de StarSeed. */
export type CasoUso =
  | "conversacion"
  | "codigo-agentes"
  | "archivos-privados"
  | "voz"
  | "vision"
  | "bots-dots"
  | "capas-conciencia"
  | "segundo-plano";

export const CASOS: readonly CasoUso[] = [
  "conversacion",
  "codigo-agentes",
  "archivos-privados",
  "voz",
  "vision",
  "bots-dots",
  "capas-conciencia",
  "segundo-plano",
];

export const ETIQUETA_CASO: Record<CasoUso, string> = {
  conversacion: "Conversación",
  "codigo-agentes": "Código y agentes",
  "archivos-privados": "Archivos privados",
  voz: "Voz",
  vision: "Visión",
  "bots-dots": "Bots y dots",
  "capas-conciencia": "Capas de conciencia",
  "segundo-plano": "Trabajo en segundo plano",
};

/** estandar = build normal del editor (Ollama); capa-158 y needle = las capas propias de Astraura. */
export type TipoModelo = "estandar" | "capa-158" | "needle";

/**
 * comprobado = sus datos se contrastaron con la fuente viva en `comprobado`;
 * sin-comprobar = no se pudo contrastar (NUNCA se recomienda);
 * candidato = apareció en una revisión y aún no se ha contrastado todo (NUNCA se recomienda).
 */
export type EstadoModelo = "comprobado" | "sin-comprobar" | "candidato";

/** Puntuación comparable del Epoch Capabilities Index, con su fecha y su origen. */
export interface Puntuacion {
  eci: number;
  /** Fecha de publicación del modelo medido (YYYY-MM-DD). */
  fecha: string;
  /** Nombre exacto con el que Epoch lo lista. */
  nombreEpoch: string;
  fuente: string;
  /** Día en que se contrastó contra Epoch (YYYY-MM-DD). */
  comprobado: string;
}

export interface ModeloLocal {
  /** Etiqueta de Ollama («qwen3.5:9b») o id de la capa («ternary-bonsai-4b»). */
  id: string;
  etiqueta: string;
  familia: string;
  editor: string;
  /** Solo se admiten builds normales de los editores. */
  clase: "normal";
  tipo: TipoModelo;
  /** Capa de Astraura a la que pertenece (reflejo, palabra, razon…), si es una capa. */
  papel?: string;
  runtimes: RuntimeLocal[];
  /** Build solo para Apple silicon (MLX). */
  soloApple?: boolean;
  descargaGb: number;
  /** Contexto en miles de tokens. */
  contextoK: number | null;
  herramientas: boolean;
  vision: boolean;
  razonamiento: boolean;
  licencia: string | null;
  puntuacion: Puntuacion | null;
  /** Nombre en Epoch para refrescar la puntuación cada día. */
  eciNombre?: string;
  /** Memoria declarada por el catálogo de capas (GB); si falta se estima con la regla de requisitos.ts. */
  memoriaMinGb?: number;
  memoriaComodaGb?: number;
  estado: EstadoModelo;
  /** Día de la última comprobación contra la fuente (YYYY-MM-DD) o null. */
  comprobado: string | null;
  fuentes: string[];
  nota?: string;
}

/** Un punto de la frontera: el mejor modelo cerrado conocido en esa fecha. */
export interface PuntoFrontera {
  fecha: string;
  eci: number;
  modelo: string;
}

export interface CatalogoModelos {
  esquema: 1;
  /** Última vez que se tocó el catálogo (YYYY-MM-DD). */
  actualizado: string;
  /** Última revisión completa contra las fuentes vivas (YYYY-MM-DD) o null. */
  revisado: string | null;
  modelos: ModeloLocal[];
  frontera: PuntoFrontera[];
  /** Familias de la biblioteca de Ollama que ya se vieron (no se vuelven a avisar). */
  familiasVistas: string[];
}

/** Familia de chip. */
export type FamiliaChip = "apple-silicon" | "nvidia" | "amd" | "cpu" | "android-soc";

export type Veredicto = "recomendado" | "justo" | "no-cabe" | "falta-disco";

export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  recomendado: "Recomendado",
  justo: "Cabe justo: irá lento",
  "no-cabe": "No cabe en esta neurona",
  "falta-disco": "Falta disco",
};

export type MotivoEncaje =
  | "ok"
  | "memoria-justa"
  | "memoria-insuficiente"
  | "sin-runtime"
  | "solo-apple"
  | "sin-gpu"
  | "bateria"
  | "disco";
