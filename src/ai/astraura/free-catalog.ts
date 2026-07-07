"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · CATÁLOGO GRATIS-PRIMERO (julio 2026)
 * ---------------------------------------------------------------------------
 * La inteligencia de StarSeed debe ser LO MÁS GRATUITA POSIBLE DESDE EL
 * PRINCIPIO para todos los usuarios (Comunismo de Abundancia, §3 CLAUDE.md).
 * Este catálogo declara TODAS las fuentes de inteligencia que Aurora conoce,
 * ordenadas por: gratuidad → privacidad → capacidad por tarea.
 *
 * Tres niveles de fuente:
 *   · "instant"  — funcionan YA, sin clave ni instalación (Pollinations,
 *                  Chrome AI/Gemini Nano, WebLLM vía WebGPU).
 *   · "free-key" — gratis con una clave API gratuita (Groq, Cerebras,
 *                  OpenRouter :free, Gemini, GitHub Models, NVIDIA NIM,
 *                  Mistral Experiment).
 *   · "local"    — en el dispositivo del usuario (Ollama, LM Studio,
 *                  llama.cpp) — máxima privacidad y soberanía.
 *   · "paid"     — servicios de pago que Aurora SUGIERE (nunca activa sola).
 *
 * TRANSPARENCIA: cada entrada lleva `why` (por qué Aurora la elegiría) y
 * `limits` (límite real del tier gratis) para que el usuario siempre sepa
 * QUÉ herramienta se usa, sus variantes y cómo cambiarla.
 *
 * Datos verificados por investigación web el 2026-07-04 (ver
 * architecture/astraura-inteligencia.md). Actualizar aquí cuando cambien.
 * SSR-safe: solo datos + funciones puras. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ProviderId } from "@/ai/providers/types";

/** Clase de tarea que Aurora clasifica antes de elegir modelo. */
export type TaskKind =
  | "chat"        // conversación general / control del OS
  | "fast"        // respuesta corta en tiempo real (voz)
  | "code"        // programación
  | "reasoning"   // razonamiento profundo / matemáticas / planificación
  | "vision"      // entender imágenes
  | "long"        // contexto muy largo (documentos, memorias)
  | "creative"    // escritura creativa / cultura
  | "translate"   // traducción / multilingüe
  | "summary";    // resumen / síntesis

export const TASK_LABELS: Record<TaskKind, string> = {
  chat: "Conversación",
  fast: "Tiempo real (voz)",
  code: "Código",
  reasoning: "Razonamiento",
  vision: "Visión",
  long: "Contexto largo",
  creative: "Creatividad",
  translate: "Traducción",
  summary: "Resumen",
};

export type SourceTier = "instant" | "free-key" | "local" | "paid";

/** Un modelo concreto dentro de una fuente. */
export interface CatalogModel {
  /** Id EXACTO que espera la API de la fuente. */
  id: string;
  /** Etiqueta legible. */
  label: string;
  /** Tareas donde este modelo destaca (para el ranking). */
  strengths: TaskKind[];
  /** Puntuación de capacidad 1-10 (heurística del catálogo). */
  quality: number;
  /** ¿Entiende imágenes? */
  vision?: boolean;
  /** Ventana de contexto aproximada (tokens). */
  context?: number;
  /** Nota corta (límites o rasgos). */
  note?: string;
}

/** Una fuente de inteligencia del catálogo. */
export interface CatalogSource {
  /** Id estable del catálogo (starseed.astraura). */
  id: string;
  label: string;
  tier: SourceTier;
  /** Adaptador del sistema de providers que la sirve. */
  providerId: ProviderId;
  /** Base URL para el adaptador (OpenAI-compatible salvo nota). */
  baseUrl: string;
  /** ¿Necesita clave API? (las "instant" y locales, no). */
  requiresKey: boolean;
  /** Dónde conseguir la clave gratuita. */
  getKeyUrl?: string;
  /** Modelos curados de la fuente. */
  models: CatalogModel[];
  /** Límite del tier gratis, honesto y legible. */
  limits: string;
  /** Por qué Aurora elegiría esta fuente (transparencia). */
  why: string;
  /** Privacidad: "local" no sale del equipo; "cloud" sí. */
  privacy: "local" | "browser" | "cloud";
  /** Multiplicador de prioridad (privacidad/soberanía puntúan más). */
  weight: number;
}

/* ───────────────────────── Catálogo ───────────────────────── */

export const FREE_CATALOG: CatalogSource[] = [
  /* ── LOCAL (soberanía máxima) ─────────────────────────────── */
  {
    id: "ollama-local",
    label: "Ollama (este equipo)",
    tier: "local",
    providerId: "ollama",
    baseUrl: "http://localhost:11434",
    requiresKey: false,
    limits: "Sin límites: corre en tu dispositivo.",
    why: "Privacidad total: nada sale de tu equipo. Ideal si tienes Ollama con un modelo instalado.",
    privacy: "local",
    weight: 1.15,
    models: [
      { id: "qwen3:8b", label: "Qwen3 8B", strengths: ["chat", "code", "translate"], quality: 7, context: 40960, note: "Excelente en español" },
      { id: "alibayram/smollm3", label: "SmolLM3 3B", strengths: ["chat", "reasoning", "translate"], quality: 6, context: 65536, note: "Apache-2.0 · dual /think" },
      { id: "gemma3:4b", label: "Gemma 3 4B", strengths: ["chat", "vision", "fast"], quality: 6, vision: true, context: 131072 },
      { id: "llama3.2:3b", label: "Llama 3.2 3B", strengths: ["fast", "chat"], quality: 5, context: 131072 },
      { id: "deepseek-r1:8b", label: "DeepSeek R1 8B", strengths: ["reasoning", "code"], quality: 7, note: "Razonamiento local" },
    ],
  },
  {
    id: "lmstudio-local",
    label: "LM Studio (este equipo)",
    tier: "local",
    providerId: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    requiresKey: false,
    limits: "Sin límites: corre en tu dispositivo.",
    why: "Servidor local OpenAI-compatible con interfaz amable; usa el modelo que tengas cargado.",
    privacy: "local",
    weight: 1.1,
    models: [
      { id: "local-model", label: "Modelo cargado en LM Studio", strengths: ["chat", "code"], quality: 6, note: "Usa el modelo activo" },
    ],
  },
  {
    id: "local-openllm",
    label: "OpenLLM (este equipo)",
    tier: "local",
    providerId: "openai-compatible",
    baseUrl: "http://localhost:3000/v1",
    requiresKey: false,
    limits: "Sin límites: corre en tu dispositivo.",
    why: "Máxima privacidad y soberanía: nada sale de tu equipo. OpenLLM corre modelos abiertos como una API OpenAI local (openllm serve).",
    privacy: "local",
    weight: 1.12,
    models: [
      { id: "local-model", label: "Modelo servido por OpenLLM", strengths: ["chat", "code", "reasoning"], quality: 6, note: "OpenLLM: corre modelos abiertos como API OpenAI en tu equipo (openllm serve)" },
    ],
  },
  {
    // 9Router (https://github.com/decolua/9router): proxy LOCAL OpenAI-compatible
    // con fallback entre 40+ proveedores y compresión de tokens. El `baseUrl` de
    // abajo es solo el DEFAULT documentado (Ajustes → Inteligencia → 9Router
    // puede cambiar el endpoint real); `detectAvailability()` sondea el endpoint
    // configurado por el usuario en `IntelligenceSettings.nineRouter`, no este
    // valor estático. Solo "ready" si el usuario activó `nineRouter.enabled` Y
    // el proxy responde. Ver architecture/astraura-inteligencia.md §15.4.
    id: "9router-local",
    label: "9Router (proxy local)",
    tier: "local",
    providerId: "openai-compatible",
    baseUrl: "http://localhost:8000/v1",
    requiresKey: false,
    limits: "Sin límites propios: hereda los límites de los 40+ proveedores tras el proxy.",
    why: "Proxy local con fallback por niveles y compresión de tokens: útil cuando el usuario ya lo tiene corriendo para ahorrar cuota entre proveedores.",
    privacy: "local",
    weight: 1.1,
    models: [
      { id: "local-model", label: "Modelo enrutado por 9Router", strengths: ["chat", "code", "reasoning", "fast"], quality: 6, note: "9Router: proxy local con fallback entre 40+ proveedores" },
    ],
  },

  /* ── FREE-KEY (gratis con clave gratuita) ─────────────────── */
  {
    id: "groq-free",
    label: "Groq (gratis)",
    tier: "free-key",
    providerId: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresKey: true,
    getKeyUrl: "https://console.groq.com/keys",
    limits: "~30 req/min · 1K–14K req/día según modelo · +2.000 audios Whisper/día.",
    why: "La inferencia más RÁPIDA del mundo (~320 tok/s): perfecta para la voz en tiempo real de Aurora.",
    privacy: "cloud",
    weight: 1.05,
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", strengths: ["chat", "fast", "summary", "translate"], quality: 8, context: 128000 },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", strengths: ["fast"], quality: 6, context: 128000, note: "14,4K req/día" },
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick", strengths: ["chat", "vision", "creative"], quality: 8, vision: true, context: 128000 },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", strengths: ["reasoning", "code"], quality: 8 },
      { id: "qwen/qwen3-32b", label: "Qwen3 32B", strengths: ["code", "translate", "chat"], quality: 7 },
    ],
  },
  {
    id: "cerebras-free",
    label: "Cerebras (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://api.cerebras.ai/v1",
    requiresKey: true,
    getKeyUrl: "https://cloud.cerebras.ai",
    limits: "1M tokens/día (el más generoso) · 30 req/min · contexto ~8K en free.",
    why: "Un millón de tokens diarios gratis: ideal para resúmenes, síntesis y tareas por lotes.",
    privacy: "cloud",
    weight: 1,
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B", strengths: ["summary", "chat", "translate"], quality: 8, context: 8192 },
      { id: "qwen-3-235b-a22b-instruct-2507", label: "Qwen3 235B", strengths: ["reasoning", "code"], quality: 9, context: 65536 },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", strengths: ["reasoning"], quality: 8 },
    ],
  },
  {
    id: "openrouter-free",
    label: "OpenRouter :free",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    getKeyUrl: "https://openrouter.ai/keys",
    limits: "20 req/min · 50 req/día (1.000/día con recarga única de $10).",
    why: "Una sola clave da acceso a ~26 modelos gratuitos variados (visión, código, 1M de contexto).",
    privacy: "cloud",
    weight: 1,
    models: [
      { id: "openrouter/free", label: "Auto (mejor :free disponible)", strengths: ["chat", "summary"], quality: 7, note: "Router automático de OpenRouter" },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", strengths: ["chat", "vision", "translate"], quality: 8, vision: true, context: 262144 },
      { id: "qwen/qwen3-coder:free", label: "Qwen3 Coder", strengths: ["code"], quality: 8, context: 1000000, note: "1M de contexto" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B", strengths: ["reasoning", "long"], quality: 8, context: 1000000 },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", strengths: ["chat", "creative"], quality: 8 },
      { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B", strengths: ["reasoning", "code"], quality: 8 },
    ],
  },
  {
    id: "gemini-free",
    label: "Google Gemini (gratis)",
    tier: "free-key",
    providerId: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    requiresKey: true,
    getKeyUrl: "https://aistudio.google.com/apikey",
    limits: "gemini-2.5-flash ~10 req/min · ~250/día; flash-lite ~1.000/día. 1M de contexto.",
    why: "Multimodal con 1M de contexto: la mejor opción gratis para documentos largos y visión.",
    privacy: "cloud",
    weight: 1,
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", strengths: ["long", "vision", "chat", "summary"], quality: 9, vision: true, context: 1000000 },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", strengths: ["fast", "summary"], quality: 7, vision: true, context: 1000000, note: "~1.000 req/día" },
      { id: "gemma-3-27b-it", label: "Gemma 3 27B", strengths: ["chat", "translate"], quality: 7, note: "Cuota diaria muy alta" },
    ],
  },
  {
    id: "mistral-free",
    label: "Mistral (Experiment)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    requiresKey: true,
    getKeyUrl: "https://console.mistral.ai",
    limits: "~1B tokens/mes gratis en todos sus modelos (requiere opt-in de datos).",
    why: "Tier experimental enorme; Codestral es muy bueno en código europeo-multilingüe.",
    privacy: "cloud",
    weight: 0.95,
    models: [
      { id: "mistral-small-latest", label: "Mistral Small", strengths: ["chat", "translate"], quality: 7, vision: true },
      { id: "codestral-latest", label: "Codestral", strengths: ["code"], quality: 8 },
      { id: "mistral-large-latest", label: "Mistral Large", strengths: ["reasoning", "creative"], quality: 8 },
    ],
  },
  {
    id: "nvidia-nim-free",
    label: "NVIDIA NIM (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    requiresKey: true,
    getKeyUrl: "https://build.nvidia.com",
    limits: "~1.000 req/día gratis.",
    why: "Catálogo NIM ya integrado en StarSeed (ver Ajustes → NVIDIA); buenos modelos de razonamiento.",
    privacy: "cloud",
    weight: 0.95,
    models: [
      { id: "nvidia/llama-3.3-nemotron-super-49b-v1", label: "Nemotron Super 49B", strengths: ["reasoning", "chat"], quality: 8 },
      { id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1", strengths: ["reasoning", "code"], quality: 9 },
    ],
  },
  {
    id: "github-models-free",
    label: "GitHub Models",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://models.github.ai/inference",
    requiresKey: true,
    getKeyUrl: "https://github.com/settings/tokens",
    limits: "10–15 req/min · 50–150 req/día · 8K entrada por petición.",
    why: "Con tu cuenta GitHub accedes gratis a GPT-4o/4.1 y Phi para momentos puntuales de máxima calidad.",
    privacy: "cloud",
    weight: 0.9,
    models: [
      { id: "openai/gpt-4.1", label: "GPT-4.1", strengths: ["reasoning", "code", "creative"], quality: 9, note: "Cuota pequeña: usar con cabeza" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", strengths: ["chat", "vision"], quality: 7, vision: true },
    ],
  },
  {
    id: "cloudflare-workers-ai",
    label: "Cloudflare Workers AI (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    // OpenAI-compatible; sustituye {ACCOUNT} por tu Account ID de Cloudflare.
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/v1",
    requiresKey: true,
    getKeyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    limits: "Cuota diaria gratuita (Neurons/día) generosa para uso ligero.",
    why: "IA en el edge de Cloudflare con modelos abiertos; buena red de seguridad gratuita si ya usas Cloudflare.",
    privacy: "cloud",
    weight: 0.9,
    models: [
      { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B", strengths: ["chat", "fast", "summary", "translate"], quality: 8, note: "requiere account id + token" },
      { id: "@cf/qwen/qwen2.5-coder-32b-instruct", label: "Qwen2.5 Coder 32B", strengths: ["code"], quality: 8, note: "requiere account id + token" },
      { id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B", strengths: ["reasoning", "code"], quality: 8, note: "requiere account id + token" },
    ],
  },
  {
    id: "scaleway-free",
    label: "Scaleway Generative APIs (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://api.scaleway.ai/v1",
    requiresKey: true,
    getKeyUrl: "https://console.scaleway.com/generative-apis/models",
    limits: "1M de tokens gratis de bienvenida (crédito inicial, no mensual).",
    why: "Proveedor europeo OpenAI-compatible con un buen crédito inicial gratuito para arrancar.",
    privacy: "cloud",
    weight: 0.9,
    models: [
      { id: "llama-3.3-70b-instruct", label: "Llama 3.3 70B", strengths: ["chat", "summary", "translate"], quality: 8, context: 128000 },
      { id: "qwen3-235b-a22b-instruct-2507", label: "Qwen3 235B", strengths: ["reasoning", "code"], quality: 9 },
    ],
  },
  {
    id: "cohere-free",
    label: "Cohere (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    // Compatibility API OpenAI de Cohere.
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    requiresKey: true,
    getKeyUrl: "https://dashboard.cohere.com/api-keys",
    limits: "Clave de prueba gratis: 1.000 req/mes · 20 req/min (chat).",
    why: "Modelos Command de Cohere (buen multilingüe y RAG) vía API compatible con OpenAI.",
    privacy: "cloud",
    weight: 0.85,
    models: [
      { id: "command-a-03-2025", label: "Command A", strengths: ["chat", "translate", "summary"], quality: 8, context: 256000 },
      { id: "command-r-plus-08-2024", label: "Command R+", strengths: ["chat", "reasoning", "long"], quality: 8, context: 128000 },
    ],
  },
  {
    id: "sambanova-free",
    label: "SambaNova Cloud (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://api.sambanova.ai/v1",
    requiresKey: true,
    getKeyUrl: "https://cloud.sambanova.ai/apis",
    limits: "Gratis con límites de tasa (inferencia muy rápida).",
    why: "Inferencia ultrarrápida de modelos abiertos grandes (Llama 3.3 70B, DeepSeek R1) en tier gratuito.",
    privacy: "cloud",
    weight: 0.9,
    models: [
      { id: "Meta-Llama-3.3-70B-Instruct", label: "Llama 3.3 70B", strengths: ["chat", "fast", "summary", "translate"], quality: 8, context: 128000 },
      { id: "DeepSeek-R1", label: "DeepSeek R1", strengths: ["reasoning", "code"], quality: 9, note: "Razonamiento" },
    ],
  },

  /* ── NAVEGADOR OSS (Transformers.js · WebGPU · sin clave) ──── */
  {
    id: "smollm3-webgpu",
    label: "SmolLM3 3B (navegador · HuggingFace)",
    tier: "instant",
    providerId: "starseed", // ruta especial builtin://transformers
    baseUrl: "builtin://transformers",
    requiresKey: false,
    limits: "Ilimitado y local; 1ª vez descarga ~1,9 GB (cacheado). Requiere WebGPU.",
    why: "LLM abierto (Apache-2.0) que corre 100% en tu navegador con WebGPU: privacidad total, gran español y razonamiento dual (/think).",
    privacy: "browser",
    weight: 0.85,
    models: [
      { id: "HuggingFaceTB/SmolLM3-3B-ONNX", label: "SmolLM3 3B (WebGPU)", strengths: ["chat", "reasoning", "translate", "creative"], quality: 6, context: 65536, note: "onnx · dtype q4f16" },
    ],
  },
  {
    id: "smolvlm2-webgpu",
    label: "SmolVLM2 (visión · navegador)",
    tier: "instant",
    providerId: "starseed", // ruta especial builtin://transformers-vision
    baseUrl: "builtin://transformers-vision",
    requiresKey: false,
    limits: "Ilimitado y local; descarga ~250 MB (256M) la 1ª vez. Requiere WebGPU.",
    why: "Los modelos de visión+vídeo más pequeños jamás publicados (Apache-2.0): dan a Aurora percepción visual local de pantalla, cámara e imágenes.",
    privacy: "browser",
    weight: 0.8,
    models: [
      { id: "HuggingFaceTB/SmolVLM2-256M-Video-Instruct", label: "SmolVLM2 256M (rápido)", strengths: ["vision", "fast"], quality: 5, vision: true, note: "Percepción en vivo" },
      { id: "HuggingFaceTB/SmolVLM2-500M-Video-Instruct", label: "SmolVLM2 500M (calidad)", strengths: ["vision"], quality: 6, vision: true },
    ],
  },
  {
    id: "sipp-local",
    label: "Sipp (GGUF en navegador · beta)",
    tier: "instant",
    providerId: "starseed", // ruta especial builtin://sipp
    baseUrl: "builtin://sipp",
    requiresKey: false,
    limits: "Local y sin clave; experimental (API 0.x). Requiere WebGPU/WASM.",
    why: "Motor GGUF en el navegador con arranque muy rápido (TTFT ~24 ms); alternativa beta a WebLLM para modelos locales.",
    privacy: "browser",
    weight: 0.6,
    models: [
      { id: "smollm3-3b-q4", label: "SmolLM3 3B (GGUF)", strengths: ["chat", "fast"], quality: 5, note: "beta" },
    ],
  },

  /* ── INSTANT (sin clave, funcionan YA) ────────────────────── */
  {
    id: "pollinations-text",
    label: "Pollinations (sin clave)",
    tier: "instant",
    providerId: "openai-compatible",
    baseUrl: "https://text.pollinations.ai/openai",
    requiresKey: false,
    limits: "Gratis sin clave; puede tener colas en horas punta.",
    why: "Funciona al instante sin registro: es la red de seguridad para que TODO usuario tenga IA desde el minuto uno.",
    privacy: "cloud",
    weight: 0.8,
    models: [
      { id: "openai", label: "Pollinations · GPT (gateway)", strengths: ["chat", "summary", "creative"], quality: 6 },
      { id: "mistral", label: "Pollinations · Mistral", strengths: ["chat", "translate"], quality: 6 },
    ],
  },
  {
    id: "chrome-ai",
    label: "IA del navegador (Gemini Nano)",
    tier: "instant",
    providerId: "starseed", // se sirve por ruta especial, no por adaptador HTTP
    baseUrl: "builtin://chrome-ai",
    requiresKey: false,
    limits: "Ilimitado y sin red (modelo local del navegador, Chrome 148+).",
    why: "Cero coste, cero red, privacidad de navegador: ideal para tareas ligeras y resúmenes rápidos.",
    privacy: "browser",
    weight: 0.9,
    models: [
      { id: "gemini-nano", label: "Gemini Nano (integrado)", strengths: ["fast", "summary", "chat"], quality: 5 },
    ],
  },
  {
    id: "webllm",
    label: "WebLLM (en tu navegador)",
    tier: "instant",
    providerId: "starseed", // ruta especial
    baseUrl: "builtin://webllm",
    requiresKey: false,
    limits: "Ilimitado; primera vez descarga el modelo (0,4–5 GB) y requiere WebGPU.",
    why: "IA 100% en tu navegador vía WebGPU: privacidad total sin instalar nada.",
    privacy: "browser",
    weight: 0.7,
    models: [
      { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B (navegador)", strengths: ["chat", "fast"], quality: 5 },
      { id: "Qwen3-4B-q4f16_1-MLC", label: "Qwen3 4B (navegador)", strengths: ["chat", "translate"], quality: 5 },
    ],
  },

  /* ── PAID (solo SUGERENCIAS; Aurora nunca los activa sola) ── */
  {
    id: "anthropic-paid",
    label: "Anthropic Claude (de pago)",
    tier: "paid",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com",
    requiresKey: true,
    getKeyUrl: "https://console.anthropic.com",
    limits: "De pago por uso.",
    why: "Sugerencia premium: máxima calidad en razonamiento, código y escritura larga.",
    privacy: "cloud",
    weight: 0.5,
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", strengths: ["reasoning", "code", "creative", "long"], quality: 10, vision: true, context: 200000 },
    ],
  },
  {
    id: "openai-paid",
    label: "OpenAI (de pago)",
    tier: "paid",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    getKeyUrl: "https://platform.openai.com",
    limits: "De pago por uso.",
    why: "Sugerencia premium: GPT de última generación y herramientas maduras.",
    privacy: "cloud",
    weight: 0.5,
    models: [
      { id: "gpt-5", label: "GPT-5", strengths: ["reasoning", "code", "creative"], quality: 10, vision: true },
      { id: "gpt-4o-mini", label: "GPT-4o mini", strengths: ["chat", "fast"], quality: 7, vision: true },
    ],
  },
];

/* ───────────────────────── Helpers puros ───────────────────────── */

export function findSource(id: string): CatalogSource | undefined {
  return FREE_CATALOG.find((s) => s.id === id);
}

export function sourcesByTier(tier: SourceTier): CatalogSource[] {
  return FREE_CATALOG.filter((s) => s.tier === tier);
}

/** Todas las fuentes NO de pago (lo que Aurora usa por defecto). */
export function freeSources(): CatalogSource[] {
  return FREE_CATALOG.filter((s) => s.tier !== "paid");
}

/** Sugerencias de pago para una tarea (solo se MUESTRAN, nunca se usan solas). */
export function paidSuggestionsFor(task: TaskKind): { source: CatalogSource; model: CatalogModel }[] {
  const out: { source: CatalogSource; model: CatalogModel }[] = [];
  for (const s of sourcesByTier("paid")) {
    for (const m of s.models) {
      if (m.strengths.includes(task)) out.push({ source: s, model: m });
    }
  }
  return out.sort((a, b) => b.model.quality - a.model.quality).slice(0, 2);
}

/**
 * Puntuación de un modelo para una tarea: calidad base + bonus por fortaleza
 * declarada + bonus de visión si la tarea la requiere + peso de la fuente
 * (privacidad/soberanía puntúan). Función pura para poder testear el ranking.
 */
export function scoreModelForTask(source: CatalogSource, model: CatalogModel, task: TaskKind, needsVision: boolean): number {
  if (needsVision && !model.vision) return -1; // descalificado
  let score = model.quality;
  if (model.strengths.includes(task)) score += 3;
  if (task === "long" && (model.context ?? 0) >= 200000) score += 2;
  if (task === "fast" && source.id.startsWith("groq")) score += 2;
  return score * source.weight;
}

/* ───────────────────── Naming estilo LiteLLM (etiquetas/telemetría) ───────────────────── */

/**
 * Prefijo de proveedor "estilo LiteLLM" para una fuente (p.ej. groq, gemini,
 * openrouter, ollama, cloudflare). SOLO para etiquetas y telemetría — NO cambia
 * cómo se invocan los adaptadores. Deriva del providerId y, para las genéricas
 * OpenAI-compatible, del id de catálogo para no perder de qué fuente hablamos.
 */
export function providerSlugForSource(source: CatalogSource): string {
  switch (source.providerId) {
    case "google": return "gemini";
    case "groq": return "groq";
    case "anthropic": return "anthropic";
    case "openai": return "openai";
    case "ollama": return "ollama";
    case "deepseek": return "deepseek";
    case "starseed": return "starseed";
    default: break; // openai-compatible → usa el id de catálogo
  }
  // De "groq-free" → "groq", "cloudflare-workers-ai" → "cloudflare",
  // "openrouter-free" → "openrouter", "local-openllm" → "openllm".
  const raw = source.id
    .replace(/^local-/, "")
    .replace(/-(free|local|paid|text|webgpu)$/g, "")
    .replace(/-(workers-ai|models|nim)$/g, "");
  return (raw || source.providerId).replace(/[^a-z0-9]+/gi, "-").replace(/-+$/g, "").toLowerCase();
}

/**
 * Nombre "provider/model" estilo LiteLLM para logs y UI, p.ej.
 * "groq/llama-3.3-70b-versatile", "gemini/gemini-2.5-flash",
 * "openrouter/qwen/qwen3-coder:free". Puramente informativo.
 */
export function toProviderModel(source: CatalogSource, model: CatalogModel | string): string {
  const modelId = typeof model === "string" ? model : model.id;
  return `${providerSlugForSource(source)}/${modelId}`;
}

/**
 * Parte inversa de `toProviderModel`: separa el primer segmento como proveedor.
 * El resto (que puede contener más "/", como en OpenRouter) es el id del modelo.
 */
export function parseProviderModel(s: string): { provider: string; model: string } {
  const str = String(s ?? "");
  const i = str.indexOf("/");
  if (i < 0) return { provider: "", model: str };
  return { provider: str.slice(0, i), model: str.slice(i + 1) };
}
