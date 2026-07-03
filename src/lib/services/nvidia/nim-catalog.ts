"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — CATÁLOGO CURADO de NVIDIA NIM (modelos + skills/blueprints)
// ----------------------------------------------------------------------------
// La API-catalog de NVIDIA (build.nvidia.com) ofrece decenas de modelos por
// función (LLM, visión, imagen, código, embeddings/retriever, voz…) y SKILLS
// (blueprints agénticos). Aquí mantenemos un catálogo CURADO y razonable, con
// ids de modelo REALES tal como se usan en la API (p.ej.
// "meta/llama-3.1-70b-instruct"), etiquetados por función NIM y marcados como
// "gratis para prototipar" con el Developer Program.
//
// Honesto: los catálogos vivos cambian. Este módulo NO pretende ser exhaustivo
// ni perpetuo — cada entrada lleva la nota implícita de "verifica versiones más
// recientes en build.nvidia.com/models". Para la lista REAL en vivo, usa
// `mergeWithLiveModels()` que fusiona esta curación con `nim-client.listModels`.
//
// SSR-safe, sin dependencias, funciones puras. No toca oss-services ni sus
// firmas: expone un catálogo NIM independiente que la UI y la integración OSS
// pueden consumir.
// ════════════════════════════════════════════════════════════════════════════

import {
  listModels as nimListModels,
  NIM_DEFAULT_BASE_URL,
  type NimModelInfo,
} from "@/lib/services/nvidia/nim-client";

// ── Categorías NIM (más ricas que las de OSS: incluyen code/embedding/vision) ─

/**
 * Función que cubre un modelo NIM. Es MÁS amplia que `OssServiceCategory`
 * (añade `code`, `embedding`, `vision`) porque NVIDIA tiene modelos
 * especializados. Al integrar en OSS, se colapsa a las categorías OSS
 * existentes (ver `oss-services.ts`), pero aquí conservamos la riqueza para las
 * guías y el panel.
 */
export type NimCategory =
  | "llm"
  | "image"
  | "code"
  | "embedding"
  | "stt"
  | "tts"
  | "vision";

/** Metadatos de presentación por categoría NIM (para el panel). */
export const NIM_CATEGORY_META: Record<
  NimCategory,
  { label: string; blurb: string }
> = {
  llm: {
    label: "Lenguaje (LLM)",
    blurb: "Razonamiento, chat y generación de texto de propósito general.",
  },
  vision: {
    label: "Visión / Multimodal",
    blurb: "Entienden imágenes junto a texto (VLM): describir, analizar, OCR.",
  },
  image: {
    label: "Imagen (generación)",
    blurb: "Crean imágenes a partir de texto (difusión).",
  },
  code: {
    label: "Código",
    blurb: "Especializados en programación: completar, explicar y depurar código.",
  },
  embedding: {
    label: "Embeddings / Retriever",
    blurb: "Convierten texto en vectores para búsqueda semántica y RAG.",
  },
  stt: {
    label: "Voz → texto (ASR)",
    blurb: "Transcriben audio a texto (NVIDIA Riva / Parakeet / Canary).",
  },
  tts: {
    label: "Texto → voz (TTS)",
    blurb: "Sintetizan voz natural a partir de texto (NVIDIA Riva).",
  },
};

/** Orden estable de categorías NIM para el panel. */
export const NIM_CATEGORY_ORDER: NimCategory[] = [
  "llm",
  "vision",
  "image",
  "code",
  "embedding",
  "stt",
  "tts",
];

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Una entrada del catálogo curado de modelos NIM. */
export interface NimModelEntry {
  /** Id REAL del modelo tal como lo pide la API (p.ej. "meta/llama-3.1-70b-instruct"). */
  id: string;
  /** Nombre legible corto. */
  name: string;
  /** Función NIM que cubre. */
  category: NimCategory;
  /** Publisher (meta, nvidia, mistralai, microsoft…). */
  publisher: string;
  /** Para qué sirve, en español, claro y honesto. */
  purpose: string;
  /** Gratis para prototipar con el Developer Program. */
  freeForPrototype: boolean;
  /** Enlace a la ficha del modelo en build.nvidia.com (best-effort). */
  url: string;
  /** true si esta entrada vino de la API en vivo (no de la curación). */
  live?: boolean;
  /** Etiquetas cortas. */
  tags?: string[];
}

/** Una SKILL / blueprint agéntico de NVIDIA (build.nvidia.com/skills). */
export interface NimSkillEntry {
  /** Slug estable. */
  id: string;
  /** Nombre legible. */
  name: string;
  /** Para qué sirve (es). */
  purpose: string;
  /** Enlace al blueprint/skill en build.nvidia.com. */
  url: string;
  /** Etiquetas. */
  tags?: string[];
}

// ── Enlace helper a la ficha de un modelo en build.nvidia.com ────────────────

/** Construye el enlace de la ficha de un modelo (`build.nvidia.com/<id>`). */
function modelUrl(id: string): string {
  return `https://build.nvidia.com/${id}`;
}

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO CURADO DE MODELOS
// ----------------------------------------------------------------------------
// Ids reales y representativos de la API-catalog. Verifica versiones más
// recientes en build.nvidia.com/models.
// ════════════════════════════════════════════════════════════════════════════

const CURATED_MODELS: NimModelEntry[] = [
  // ── LLM ─────────────────────────────────────────────────────────────────
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    name: "Llama 3.1 Nemotron 70B",
    category: "llm",
    publisher: "nvidia",
    purpose:
      "LLM afinado por NVIDIA para seguir instrucciones y dar respuestas útiles y alineadas. Buen todoterreno para chat y razonamiento.",
    freeForPrototype: true,
    url: modelUrl("nvidia/llama-3.1-nemotron-70b-instruct"),
    tags: ["chat", "razonamiento", "nemotron"],
  },
  {
    id: "meta/llama-3.1-405b-instruct",
    name: "Llama 3.1 405B Instruct",
    category: "llm",
    publisher: "meta",
    purpose:
      "El modelo abierto más grande de Meta: máxima calidad de razonamiento y conocimiento. Ideal para tareas complejas (más lento/costoso).",
    freeForPrototype: true,
    url: modelUrl("meta/llama-3.1-405b-instruct"),
    tags: ["chat", "grande", "razonamiento"],
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B Instruct",
    category: "llm",
    publisher: "meta",
    purpose:
      "Equilibrio calidad/velocidad de Meta. Muy sólido para chat, resúmenes y asistencia general.",
    freeForPrototype: true,
    url: modelUrl("meta/llama-3.1-70b-instruct"),
    tags: ["chat", "equilibrado"],
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    category: "llm",
    publisher: "meta",
    purpose:
      "Ligero y rápido. Perfecto para respuestas veloces, prototipos y cargas de bajo coste.",
    freeForPrototype: true,
    url: modelUrl("meta/llama-3.1-8b-instruct"),
    tags: ["chat", "rápido", "ligero"],
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    category: "llm",
    publisher: "meta",
    purpose:
      "Iteración más reciente de la familia 70B de Meta, con mejor seguimiento de instrucciones. Gran opción por defecto para texto.",
    freeForPrototype: true,
    url: modelUrl("meta/llama-3.3-70b-instruct"),
    tags: ["chat", "reciente"],
  },
  {
    id: "mistralai/mixtral-8x22b-instruct-v0.1",
    name: "Mixtral 8x22B Instruct",
    category: "llm",
    publisher: "mistralai",
    purpose:
      "Mezcla de expertos (MoE) de Mistral: buen razonamiento y multilingüe con coste eficiente por token activo.",
    freeForPrototype: true,
    url: modelUrl("mistralai/mixtral-8x22b-instruct-v0.1"),
    tags: ["moe", "multilingüe"],
  },
  {
    id: "mistralai/mistral-large-2-instruct",
    name: "Mistral Large 2",
    category: "llm",
    publisher: "mistralai",
    purpose:
      "Modelo insignia de Mistral: fuerte en razonamiento, código y multilingüe.",
    freeForPrototype: true,
    url: modelUrl("mistralai/mistral-large-2-instruct"),
    tags: ["insignia", "código", "multilingüe"],
  },
  {
    id: "microsoft/phi-3.5-mini-instruct",
    name: "Phi-3.5 Mini",
    category: "llm",
    publisher: "microsoft",
    purpose:
      "Modelo pequeño y muy capaz de Microsoft. Excelente relación calidad/tamaño para tareas acotadas.",
    freeForPrototype: true,
    url: modelUrl("microsoft/phi-3.5-mini-instruct"),
    tags: ["pequeño", "eficiente"],
  },
  {
    id: "google/gemma-2-27b-it",
    name: "Gemma 2 27B",
    category: "llm",
    publisher: "google",
    purpose:
      "LLM abierto de Google, buen equilibrio para chat y tareas generales.",
    freeForPrototype: true,
    url: modelUrl("google/gemma-2-27b-it"),
    tags: ["chat", "google"],
  },
  {
    id: "nvidia/nemotron-4-340b-instruct",
    name: "Nemotron-4 340B Instruct",
    category: "llm",
    publisher: "nvidia",
    purpose:
      "LLM masivo de NVIDIA, pensado también para generación de datos sintéticos de alta calidad y razonamiento exigente.",
    freeForPrototype: true,
    url: modelUrl("nvidia/nemotron-4-340b-instruct"),
    tags: ["grande", "datos-sintéticos", "nemotron"],
  },
  {
    id: "deepseek-ai/deepseek-r1",
    name: "DeepSeek-R1",
    category: "llm",
    publisher: "deepseek-ai",
    purpose:
      "Modelo de razonamiento con cadena de pensamiento fuerte en matemáticas, lógica y código.",
    freeForPrototype: true,
    url: modelUrl("deepseek-ai/deepseek-r1"),
    tags: ["razonamiento", "matemáticas", "código"],
  },
  {
    id: "qwen/qwen2.5-7b-instruct",
    name: "Qwen2.5 7B Instruct",
    category: "llm",
    publisher: "qwen",
    purpose:
      "LLM multilingüe de Alibaba, rápido y competente para chat y tareas generales.",
    freeForPrototype: true,
    url: modelUrl("qwen/qwen2.5-7b-instruct"),
    tags: ["multilingüe", "rápido"],
  },

  // ── Visión / Multimodal (VLM) ────────────────────────────────────────────
  {
    id: "meta/llama-3.2-90b-vision-instruct",
    name: "Llama 3.2 90B Vision",
    category: "vision",
    publisher: "meta",
    purpose:
      "Modelo multimodal de Meta: entiende imágenes + texto. Describe, analiza y responde sobre imágenes.",
    freeForPrototype: true,
    url: modelUrl("meta/llama-3.2-90b-vision-instruct"),
    tags: ["multimodal", "vlm", "imagen→texto"],
  },
  {
    id: "meta/llama-3.2-11b-vision-instruct",
    name: "Llama 3.2 11B Vision",
    category: "vision",
    publisher: "meta",
    purpose:
      "Versión ligera del VLM de Meta: visión + texto con menor coste. Buen prototipo multimodal.",
    freeForPrototype: true,
    url: modelUrl("meta/llama-3.2-11b-vision-instruct"),
    tags: ["multimodal", "vlm", "ligero"],
  },
  {
    id: "microsoft/phi-3.5-vision-instruct",
    name: "Phi-3.5 Vision",
    category: "vision",
    publisher: "microsoft",
    purpose:
      "VLM compacto de Microsoft para razonar sobre imágenes y documentos con pocos recursos.",
    freeForPrototype: true,
    url: modelUrl("microsoft/phi-3.5-vision-instruct"),
    tags: ["multimodal", "documentos"],
  },
  {
    id: "nvidia/neva-22b",
    name: "NeVA 22B",
    category: "vision",
    publisher: "nvidia",
    purpose:
      "Asistente visual de NVIDIA (basado en NeMo): conversa sobre imágenes que le muestras.",
    freeForPrototype: true,
    url: modelUrl("nvidia/neva-22b"),
    tags: ["multimodal", "nvidia"],
  },

  // ── Imagen (generación) ──────────────────────────────────────────────────
  {
    id: "stabilityai/stable-diffusion-3-medium",
    name: "Stable Diffusion 3 Medium",
    category: "image",
    publisher: "stabilityai",
    purpose:
      "Generación de imágenes de alta calidad a partir de texto (difusión). Buen equilibrio de coste y fidelidad.",
    freeForPrototype: true,
    url: modelUrl("stabilityai/stable-diffusion-3-medium"),
    tags: ["texto→imagen", "difusión"],
  },
  {
    id: "stabilityai/stable-diffusion-xl",
    name: "Stable Diffusion XL",
    category: "image",
    publisher: "stabilityai",
    purpose:
      "SDXL: modelo de referencia para imágenes detalladas desde un prompt.",
    freeForPrototype: true,
    url: modelUrl("stabilityai/stable-diffusion-xl"),
    tags: ["texto→imagen", "sdxl"],
  },
  {
    id: "black-forest-labs/flux.1-dev",
    name: "FLUX.1 [dev]",
    category: "image",
    publisher: "black-forest-labs",
    purpose:
      "Modelo de imagen de nueva generación con gran calidad estética y buen seguimiento del prompt.",
    freeForPrototype: true,
    url: modelUrl("black-forest-labs/flux.1-dev"),
    tags: ["texto→imagen", "flux"],
  },

  // ── Código ───────────────────────────────────────────────────────────────
  {
    id: "nvidia/llama-3.1-nemotron-51b-instruct",
    name: "Nemotron 51B (código/instruct)",
    category: "code",
    publisher: "nvidia",
    purpose:
      "LLM de NVIDIA optimizado en tamaño para tareas de código y razonamiento con buen rendimiento por GPU.",
    freeForPrototype: true,
    url: modelUrl("nvidia/llama-3.1-nemotron-51b-instruct"),
    tags: ["código", "nemotron"],
  },
  {
    id: "mistralai/codestral-22b-instruct-v0.1",
    name: "Codestral 22B",
    category: "code",
    publisher: "mistralai",
    purpose:
      "Modelo de código de Mistral: completar, generar y explicar código en múltiples lenguajes.",
    freeForPrototype: true,
    url: modelUrl("mistralai/codestral-22b-instruct-v0.1"),
    tags: ["código", "autocompletar"],
  },
  {
    id: "meta/codellama-70b",
    name: "Code Llama 70B",
    category: "code",
    publisher: "meta",
    purpose:
      "Modelo de Meta especializado en programación: generación y comprensión de código.",
    freeForPrototype: true,
    url: modelUrl("meta/codellama-70b"),
    tags: ["código", "meta"],
  },

  // ── Embeddings / Retriever ───────────────────────────────────────────────
  {
    id: "nvidia/nv-embedqa-e5-v5",
    name: "NV-EmbedQA E5 v5",
    category: "embedding",
    publisher: "nvidia",
    purpose:
      "Embeddings de NVIDIA para pregunta-respuesta y búsqueda semántica (RAG). Convierte texto en vectores.",
    freeForPrototype: true,
    url: modelUrl("nvidia/nv-embedqa-e5-v5"),
    tags: ["embeddings", "rag", "búsqueda"],
  },
  {
    id: "nvidia/nv-embed-v1",
    name: "NV-Embed v1",
    category: "embedding",
    publisher: "nvidia",
    purpose:
      "Modelo de embeddings de propósito general de NVIDIA para recuperación e indexado semántico.",
    freeForPrototype: true,
    url: modelUrl("nvidia/nv-embed-v1"),
    tags: ["embeddings", "retriever"],
  },
  {
    id: "nvidia/rerank-qa-mistral-4b",
    name: "Rerank QA Mistral 4B",
    category: "embedding",
    publisher: "nvidia",
    purpose:
      "Reordena resultados de búsqueda por relevancia (reranking) para mejorar la precisión de un RAG.",
    freeForPrototype: true,
    url: modelUrl("nvidia/rerank-qa-mistral-4b"),
    tags: ["rerank", "rag"],
  },
  {
    id: "baai/bge-m3",
    name: "BGE-M3",
    category: "embedding",
    publisher: "baai",
    purpose:
      "Embeddings multilingües muy usados para búsqueda densa y RAG en muchos idiomas.",
    freeForPrototype: true,
    url: modelUrl("baai/bge-m3"),
    tags: ["embeddings", "multilingüe"],
  },

  // ── Voz → texto (ASR / Riva) ─────────────────────────────────────────────
  {
    id: "nvidia/parakeet-ctc-1.1b-asr",
    name: "Parakeet CTC 1.1B (ASR)",
    category: "stt",
    publisher: "nvidia",
    purpose:
      "Reconocimiento de voz (ASR) de NVIDIA Riva: transcribe audio a texto con alta precisión.",
    freeForPrototype: true,
    url: modelUrl("nvidia/parakeet-ctc-1.1b-asr"),
    tags: ["asr", "riva", "voz→texto"],
  },
  {
    id: "nvidia/canary-1b-asr",
    name: "Canary 1B (ASR multilingüe)",
    category: "stt",
    publisher: "nvidia",
    purpose:
      "ASR multilingüe de NVIDIA: transcribe y también puede traducir voz entre idiomas.",
    freeForPrototype: true,
    url: modelUrl("nvidia/canary-1b-asr"),
    tags: ["asr", "multilingüe", "traducción"],
  },

  // ── Texto → voz (TTS / Riva) ─────────────────────────────────────────────
  {
    id: "nvidia/fastpitch-hifigan-tts",
    name: "FastPitch + HiFi-GAN (TTS)",
    category: "tts",
    publisher: "nvidia",
    purpose:
      "Síntesis de voz de NVIDIA Riva: convierte texto en voz natural para respuestas habladas.",
    freeForPrototype: true,
    url: modelUrl("nvidia/fastpitch-hifigan-tts"),
    tags: ["tts", "riva", "texto→voz"],
  },
  {
    id: "nvidia/magpie-tts-multilingual",
    name: "Magpie TTS (multilingüe)",
    category: "tts",
    publisher: "nvidia",
    purpose:
      "TTS multilingüe de NVIDIA para generar voz en varios idiomas con estilo natural.",
    freeForPrototype: true,
    url: modelUrl("nvidia/magpie-tts-multilingual"),
    tags: ["tts", "multilingüe"],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO CURADO DE SKILLS / BLUEPRINTS (build.nvidia.com/skills)
// ════════════════════════════════════════════════════════════════════════════

const CURATED_SKILLS: NimSkillEntry[] = [
  {
    id: "rag-multimodal-pdf",
    name: "RAG multimodal para PDFs",
    purpose:
      "Blueprint agéntico para chatear con tus documentos: extrae texto, tablas e imágenes de PDFs y responde con citas (RAG).",
    url: "https://build.nvidia.com/nvidia/multimodal-pdf-data-extraction-for-enterprise-rag",
    tags: ["rag", "pdf", "documentos"],
  },
  {
    id: "digital-human",
    name: "Humano digital (Digital Human)",
    purpose:
      "Crea un avatar interactivo con voz (ASR + LLM + TTS + animación facial) para atención y asistentes conversacionales.",
    url: "https://build.nvidia.com/nvidia/digital-humans-for-customer-service",
    tags: ["avatar", "voz", "asistente"],
  },
  {
    id: "ai-virtual-assistant",
    name: "Asistente virtual con IA",
    purpose:
      "Blueprint para un asistente de atención al cliente con recuperación de conocimiento y memoria de conversación.",
    url: "https://build.nvidia.com/nvidia/ai-virtual-assistant-for-customer-service",
    tags: ["asistente", "soporte", "rag"],
  },
  {
    id: "generative-virtual-screening",
    name: "Cribado virtual generativo (drug discovery)",
    purpose:
      "Pipeline para descubrimiento de fármacos: genera y evalúa moléculas candidatas con modelos de biología (BioNeMo).",
    url: "https://build.nvidia.com/nvidia/generative-virtual-screening-for-drug-discovery",
    tags: ["ciencia", "bionemo", "moléculas"],
  },
  {
    id: "vulnerability-analysis",
    name: "Análisis de vulnerabilidades de software",
    purpose:
      "Blueprint agéntico que analiza contenedores/código y prioriza vulnerabilidades (CVE) con ayuda de LLMs.",
    url: "https://build.nvidia.com/nvidia/vulnerability-analysis-for-container-security",
    tags: ["seguridad", "cve", "agentes"],
  },
  {
    id: "video-search-and-summarization",
    name: "Búsqueda y resumen de vídeo",
    purpose:
      "Indexa vídeo con visión + LLM para buscar momentos y generar resúmenes automáticos.",
    url: "https://build.nvidia.com/nvidia/video-search-and-summarization",
    tags: ["vídeo", "visión", "resumen"],
  },
  {
    id: "pdf-to-podcast",
    name: "De PDF a pódcast",
    purpose:
      "Convierte documentos en un guion conversacional y lo narra con TTS: genera un pódcast a partir de tus PDFs.",
    url: "https://build.nvidia.com/nvidia/pdf-to-podcast",
    tags: ["audio", "tts", "documentos"],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// Builders públicos (funciones puras)
// ════════════════════════════════════════════════════════════════════════════

/** Devuelve el catálogo CURADO de modelos NIM (referencia nueva cada llamada). */
export function buildNimModelCatalog(): NimModelEntry[] {
  return CURATED_MODELS.map((m) => ({ ...m }));
}

/** Devuelve las SKILLS / blueprints curados de NVIDIA. */
export function buildNimSkills(): NimSkillEntry[] {
  return CURATED_SKILLS.map((s) => ({ ...s }));
}

/** Modelos curados de una categoría NIM concreta. */
export function nimModelsByCategory(category: NimCategory): NimModelEntry[] {
  return buildNimModelCatalog().filter((m) => m.category === category);
}

/** Agrupa el catálogo curado por categoría, en el orden estable. */
export interface NimModelGroup {
  category: NimCategory;
  label: string;
  blurb: string;
  models: NimModelEntry[];
}

/** Devuelve el catálogo curado agrupado por categoría (grupos vacíos omitidos). */
export function buildNimModelGroups(models?: NimModelEntry[]): NimModelGroup[] {
  const list = models ?? buildNimModelCatalog();
  const groups: NimModelGroup[] = [];
  for (const category of NIM_CATEGORY_ORDER) {
    const groupModels = list.filter((m) => m.category === category);
    if (!groupModels.length) continue;
    groups.push({
      category,
      label: NIM_CATEGORY_META[category].label,
      blurb: NIM_CATEGORY_META[category].blurb,
      models: groupModels,
    });
  }
  return groups;
}

/** Un modelo curado por id (o undefined). */
export function findNimModel(id: string): NimModelEntry | undefined {
  return CURATED_MODELS.find((m) => m.id === id);
}

// ── Inferencia de categoría para modelos que llegan en vivo ──────────────────

/**
 * Adivina la categoría NIM a partir del id de un modelo (heurística por
 * palabras clave). Se usa para clasificar modelos que llegan de la API en vivo
 * y no están en la curación. Nunca lanza; por defecto cae en "llm".
 */
export function inferNimCategory(id: string): NimCategory {
  const s = id.toLowerCase();
  if (/(embed|embedqa|rerank|retriev|bge)/.test(s)) return "embedding";
  if (/(vision|-vl|vlm|neva|multimodal)/.test(s)) return "vision";
  if (/(stable-diffusion|sdxl|flux|imagen|dalle|image|kandinsky)/.test(s))
    return "image";
  if (/(asr|parakeet|canary|whisper|speech-to-text|riva-asr)/.test(s))
    return "stt";
  if (/(tts|fastpitch|hifigan|magpie|riva-tts|text-to-speech)/.test(s))
    return "tts";
  if (/(code|codestral|codellama|starcoder|deepseek-coder)/.test(s))
    return "code";
  return "llm";
}

/** Extrae el publisher de un id "publisher/model" (o "nvidia" por defecto). */
function publisherOf(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "nvidia";
}

/** Nombre legible corto a partir de un id de modelo en vivo. */
function prettyName(id: string): string {
  const tail = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return tail
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Convierte un modelo en vivo (NimModelInfo) a una entrada del catálogo. */
function liveModelToEntry(m: NimModelInfo): NimModelEntry {
  const curated = findNimModel(m.id);
  if (curated) return { ...curated, live: true };
  const category = inferNimCategory(m.id);
  return {
    id: m.id,
    name: prettyName(m.id),
    category,
    publisher: m.ownedBy || publisherOf(m.id),
    purpose:
      "Modelo disponible en tu cuenta de NVIDIA (detectado en vivo). Consulta su ficha en build.nvidia.com para el detalle.",
    freeForPrototype: true,
    url: modelUrl(m.id),
    live: true,
    tags: ["en-vivo"],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// mergeWithLiveModels — fusiona la curación con la lista REAL de la API
// ════════════════════════════════════════════════════════════════════════════

/** Resultado de refrescar el catálogo con la lista en vivo. */
export interface NimCatalogRefreshResult {
  ok: boolean;
  /** Catálogo fusionado (curados + en vivo, sin duplicar por id). */
  models: NimModelEntry[];
  /** Nº de modelos que llegaron de la API en vivo. */
  liveCount: number;
  /** Mensaje legible (es). */
  message: string;
}

/**
 * Fusiona el catálogo curado con la lista REAL de modelos de la cuenta del
 * usuario (vía `nim-client.listModels`). Los ids curados conservan su
 * descripción rica y se marcan `live` si también aparecen en la API; los
 * modelos nuevos se añaden con categoría inferida. Nunca lanza: si la API
 * falla, devuelve el catálogo curado con `ok:false` y un mensaje honesto.
 *
 * @param apiKey  Clave del Developer Program (gratis).
 * @param baseUrl Base opcional (por defecto la de la API-catalog).
 */
export async function mergeWithLiveModels(
  apiKey?: string,
  baseUrl: string = NIM_DEFAULT_BASE_URL,
): Promise<NimCatalogRefreshResult> {
  const curated = buildNimModelCatalog();
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      models: curated,
      liveCount: 0,
      message:
        "Sin clave: mostrando el catálogo curado. Añade tu clave gratis para detectar los modelos reales de tu cuenta.",
    };
  }
  const res = await nimListModels(apiKey, baseUrl);
  if (!res.ok) {
    return {
      ok: false,
      models: curated,
      liveCount: 0,
      message: `No se pudo refrescar en vivo (${res.message}). Mostrando catálogo curado.`,
    };
  }

  // Mapa por id: partimos de la curación y superponemos lo vivo.
  const byId = new Map<string, NimModelEntry>();
  for (const c of curated) byId.set(c.id, c);
  for (const live of res.models) {
    const entry = liveModelToEntry(live);
    byId.set(entry.id, entry); // sobrescribe curado con la variante `live:true`
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    // Orden: por categoría (según NIM_CATEGORY_ORDER) y luego por nombre.
    const ca = NIM_CATEGORY_ORDER.indexOf(a.category);
    const cb = NIM_CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    return a.name.localeCompare(b.name);
  });

  return {
    ok: true,
    models: merged,
    liveCount: res.models.length,
    message: `Catálogo fusionado: ${merged.length} modelo(s) (${res.models.length} en vivo desde tu cuenta).`,
  };
}
