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
  /** (Adenda 71-bis) Fuente registrada en runtime desde la Biblioteca. */
  fromLibrary?: boolean;
  /**
   * (Adenda 67 · P0-2) La fuente FUNCIONA SIN CLAVE, pero acepta una clave
   * opcional para subir sus límites (p.ej. LLM7.io: 30 req/min anónimo →
   * 120 req/min con token gratuito). `requiresKey` sigue siendo false: el
   * router la usa siempre; la clave solo la mejora.
   */
  keyOptional?: boolean;
  /**
   * (Adenda 67 · P0-2) NUNCA enfriar esta fuente tras un fallo/429. Reservado a
   * las redes de seguridad SIN CLAVE: si Pollinations entra en cooldown 60 min,
   * el usuario invitado se queda literalmente SIN CEREBRO. Un fallo transitorio
   * jamás debe apagar el último recurso.
   */
  neverCooldown?: boolean;
  /**
   * Minutos de enfriamiento al recibir 429/cuota agotada (por defecto 60).
   * Las fuentes limitadas por RPM (no por día) usan valores CORTOS: su cuota se
   * recupera en segundos, apagarlas una hora sería absurdo.
   */
  cooldownMinutes?: number;
  /**
   * Preferir SIEMPRE los modelos con sufijo `:free` de esta fuente (OpenRouter):
   * el router los rankea por encima y nunca gasta créditos de pago del usuario
   * sin que lo pida. Ver §18.2 de architecture/astraura-inteligencia.md.
   */
  preferFreeModels?: boolean;
  /**
   * Timeout por petición (ms) para ESTA fuente. Sobrescribe el default por
   * privacidad. Pollinations puede tardar ~40 s en horas punta: matarla a los
   * 30 s convertía respuestas válidas en "fallos" y vaciaba la cadena.
   */
  timeoutMs?: number;
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
    // OmniRoute (https://github.com/decolua/9router): proxy LOCAL OpenAI-compatible
    // con fallback entre 40+ proveedores y compresión de tokens. El `baseUrl` de
    // abajo es solo el DEFAULT documentado (Ajustes → Inteligencia → OmniRoute
    // puede cambiar el endpoint real); `detectAvailability()` sondea el endpoint
    // configurado por el usuario en `IntelligenceSettings.omniRoute`, no este
    // valor estático. Solo "ready" si el usuario activó `omniRoute.enabled` Y
    // el proxy responde. Ver architecture/astraura-inteligencia.md §15.4.
    id: "omniroute-local",
    label: "OmniRoute (proxy local)",
    tier: "local",
    providerId: "openai-compatible",
    baseUrl: "http://localhost:20128/v1",
    requiresKey: false,
    limits: "Sin límites propios: hereda los límites de los 40+ proveedores tras el proxy.",
    why: "Proxy local con fallback por niveles y compresión de tokens: útil cuando el usuario ya lo tiene corriendo para ahorrar cuota entre proveedores.",
    privacy: "local",
    weight: 1.1,
    models: [
      { id: "local-model", label: "Modelo enrutado por OmniRoute", strengths: ["chat", "code", "reasoning", "fast"], quality: 6, note: "OmniRoute: proxy local con fallback entre 40+ proveedores" },
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
    // OPENROUTER (Adenda 67 · P0-2 · "que el sistema de OpenRouter funcione de
    // verdad"). Cambios reales de esta ola:
    //   1. `providerId: "openrouter"` — adaptador DEDICADO (src/ai/providers/
    //      openrouter.ts) que envía `HTTP-Referer` y `X-Title` (lo que OpenRouter
    //      espera de una app de navegador) y fuerza `:free` cuando toca. Antes
    //      iba por el adaptador OpenAI genérico y, al ser `openai-compatible`,
    //      `userConfigForSource()` solo lo reconocía si el baseUrl coincidía
    //      EXACTAMENTE: una config del proveedor "openrouter" con URL propia
    //      quedaba invisible para el router → OpenRouter "no funcionaba".
    //   2. `preferFreeModels` — el ranking sube los `:free` y NUNCA gasta
    //      créditos de pago del usuario por su cuenta.
    // Ids VERIFICADOS contra GET https://openrouter.ai/api/v1/models el
    // 2026-07-17 (343 modelos, 20 con sufijo `:free`). Reverificación en vivo:
    // el antiguo `openai/gpt-oss-120b:free` YA NO EXISTE (ahora es
    // `gpt-oss-20b:free`); se añaden `tencent/hy3:free` (Hunyuan), la familia
    // Nemotron 3 Nano (visión+razonamiento y rápidos) y `hermes-3-llama-3.1-405b`
    // (coherencia con el asistente Hermes de StarSeed).
    id: "openrouter-free",
    label: "OpenRouter :free",
    tier: "free-key",
    providerId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    // (Adenda 71-bis) Los modelos :free de OpenRouter son USABLES SIN CLAVE;
    // la clave solo sube los límites (igual que LLM7/OVH con keyOptional).
    // Marcarlo requiresKey:false hace que aparezca en los ajustes por contexto
    // como fuente elegible sin exigir clave, cumpliendo "OpenRouter como motor".
    requiresKey: false,
    keyOptional: true,
    getKeyUrl: "https://openrouter.ai/keys",
    preferFreeModels: true,
    limits: "20 req/min · 50 req/día (1.000/día con recarga única de $10). Solo modelos :free = coste 0.",
    why: "Una sola clave gratuita da acceso a 20 modelos GRATIS variados (razonamiento, visión, código, 1M de contexto). Aurora solo usa los `:free` y elige por tarea.",
    privacy: "cloud",
    weight: 1,
    models: [
      { id: "openrouter/free", label: "Auto (mejor :free disponible)", strengths: ["chat", "summary"], quality: 7, note: "Router automático de OpenRouter, solo modelos gratis" },
      // RAZONAMIENTO/CONTEXTO LARGO — modelos gigantes con 1M de contexto.
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B", strengths: ["reasoning", "long"], quality: 9, context: 1000000, note: "Mejor razonamiento gratis (1M ctx)" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B", strengths: ["reasoning", "long"], quality: 8, context: 1000000 },
      { id: "qwen/qwen3-coder:free", label: "Qwen3 Coder", strengths: ["code", "long"], quality: 8, context: 1000000, note: "1M ctx · código" },
      { id: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B", strengths: ["reasoning", "creative", "long"], quality: 9, context: 131072, note: "Gran calidad general · coherencia Hermes" },
      // VISIÓN + RAZONAMIENTO — la joya para tareas que ven imágenes y piensan.
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron 3 Nano Omni (visión+razonamiento)", strengths: ["vision", "reasoning"], quality: 8, vision: true, context: 256000, note: "Ve y razona (256K ctx)" },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", strengths: ["chat", "vision", "translate"], quality: 8, vision: true, context: 262144 },
      { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B (ligero)", strengths: ["chat", "vision", "translate", "fast"], quality: 7, vision: true, context: 262144 },
      { id: "nvidia/nemotron-nano-12b-v2-vl:free", label: "Nemotron Nano 12B VL (visión)", strengths: ["vision", "fast"], quality: 7, vision: true, context: 128000 },
      // CÓDIGO — modelos de razonamiento de código.
      { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B", strengths: ["reasoning", "code", "chat"], quality: 7, context: 131072 },
      { id: "poolside/laguna-m.1:free", label: "Laguna M1 (código)", strengths: ["code"], quality: 7, context: 262144 },
      { id: "poolside/laguna-xs-2.1:free", label: "Laguna XS (código rápido)", strengths: ["code", "fast"], quality: 6, context: 262144 },
      { id: "cohere/north-mini-code:free", label: "Cohere North Mini Code", strengths: ["code", "fast"], quality: 7, context: 256000 },
      // CHAT GENERAL / CREATIVO — fuertes y versátiles.
      { id: "tencent/hy3:free", label: "Hunyuan Hy3", strengths: ["chat", "reasoning", "creative"], quality: 8, context: 262144, note: "Tencent Hunyuan 3" },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B", strengths: ["chat", "reasoning", "translate"], quality: 8, context: 262144 },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", strengths: ["chat", "creative"], quality: 8, context: 131072 },
      // RÁPIDOS / PEQUEÑOS — para voz en tiempo real y tareas triviales.
      { id: "nvidia/nemotron-3-nano-30b-a3b:free", label: "Nemotron 3 Nano 30B", strengths: ["chat", "fast"], quality: 7, context: 256000 },
      { id: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B", strengths: ["chat", "fast"], quality: 6, context: 128000 },
      { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", label: "Dolphin Mistral 24B", strengths: ["chat", "creative"], quality: 7, context: 32768 },
      { id: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B", strengths: ["fast"], quality: 5, context: 131072 },
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

  /* ── FREE-KEY añadidos en la Adenda 67 (P3-3 · awesome-freellm-apis) ──
   *    Endpoints VERIFICADOS con `curl` el 2026-07-13 (responden y exigen clave:
   *    401/200 según el caso). Todos tienen tier gratuito documentado y NO piden
   *    tarjeta de crédito salvo donde se indica. Fuente de la lista:
   *    https://github.com/open-free-llm-api/awesome-freellm-apis                  */
  {
    // VERIFICADO: GET https://router.huggingface.co/v1/models → 200 (catálogo público).
    // El chat SÍ requiere token gratuito de HuggingFace (créditos mensuales gratis).
    id: "huggingface-router",
    label: "HuggingFace Inference (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://router.huggingface.co/v1",
    requiresKey: true,
    getKeyUrl: "https://huggingface.co/settings/tokens",
    limits: "Créditos gratuitos mensuales; sin tarjeta. Enruta a los proveedores del Hub.",
    why: "La puerta al Hub de HuggingFace con una sola clave: modelos abiertos servidos por múltiples proveedores. Casa con la Biblioteca y con Hugging Bay.",
    privacy: "cloud",
    weight: 0.95,
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B", strengths: ["chat", "summary", "translate"], quality: 8, context: 131072 },
      { id: "Qwen/Qwen3-Coder-30B-A3B-Instruct", label: "Qwen3 Coder 30B", strengths: ["code"], quality: 8 },
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2", strengths: ["reasoning", "code"], quality: 9 },
    ],
  },
  {
    // VERIFICADO: POST https://ollama.com/v1/chat/completions sin clave → 401
    // (existe y exige token). El catálogo de modelos es público (GET /v1/models).
    id: "ollama-cloud",
    label: "Ollama Cloud (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://ollama.com/v1",
    requiresKey: true,
    getKeyUrl: "https://ollama.com/settings/keys",
    limits: "Tier gratuito con límites por sesión/semana. Misma cuenta que tu Ollama local.",
    why: "Los modelos GRANDES que no caben en tu equipo, con la MISMA herramienta que ya usas en local (Ollama). Soberanía y continuidad.",
    privacy: "cloud",
    weight: 0.95,
    models: [
      { id: "gpt-oss:120b-cloud", label: "GPT-OSS 120B (nube)", strengths: ["reasoning", "code"], quality: 8, context: 128000 },
      { id: "qwen3-coder:480b-cloud", label: "Qwen3 Coder 480B (nube)", strengths: ["code"], quality: 9, context: 128000 },
      { id: "deepseek-v3.1:671b-cloud", label: "DeepSeek V3.1 671B (nube)", strengths: ["reasoning", "long"], quality: 9, context: 128000 },
    ],
  },
  {
    // VERIFICADO: GET https://inference.api.nscale.com/v1/models con token falso → 401 (vivo).
    id: "nscale-free",
    label: "Nscale (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://inference.api.nscale.com/v1",
    requiresKey: true,
    getKeyUrl: "https://console.nscale.com/",
    limits: "Tier gratuito de uso razonable (fair-use).",
    why: "Modelos abiertos grandes (Llama 3.3 70B, Qwen3 Coder) con un tier gratuito generoso y sin complicaciones.",
    privacy: "cloud",
    weight: 0.9,
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B", strengths: ["chat", "summary", "translate"], quality: 8, context: 128000 },
      { id: "Qwen/Qwen3-Coder-30B-A3B-Instruct", label: "Qwen3 Coder 30B", strengths: ["code"], quality: 8, context: 262144 },
    ],
  },
  {
    // VERIFICADO: GET https://api-inference.modelscope.cn/v1/models → 200 (catálogo público).
    id: "modelscope-free",
    label: "ModelScope (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    requiresKey: true,
    getKeyUrl: "https://modelscope.cn/my/myaccesstoken",
    limits: "2.000 req/día en total (tope por modelo). Requiere registro.",
    why: "2.000 peticiones diarias gratis a modelos abiertos muy recientes (Qwen3.5, DeepSeek): una de las cuotas gratuitas más altas que existen.",
    privacy: "cloud",
    weight: 0.88,
    models: [
      { id: "Qwen/Qwen3.5-35B-A3B", label: "Qwen3.5 35B", strengths: ["chat", "reasoning", "translate"], quality: 8, context: 131072 },
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2", strengths: ["reasoning", "code"], quality: 9 },
    ],
  },
  {
    // VERIFICADO: GET https://api.siliconflow.cn/v1/models con token falso → 401 (vivo).
    id: "siliconflow-free",
    label: "SiliconFlow (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    requiresKey: true,
    getKeyUrl: "https://cloud.siliconflow.cn/account/ak",
    limits: "30 req/min · 60K tokens/min en los modelos gratuitos.",
    why: "Modelos destilados de razonamiento (DeepSeek-R1) gratis y rápidos; buena alternativa cuando las demás se agotan.",
    privacy: "cloud",
    weight: 0.85,
    models: [
      { id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", label: "DeepSeek R1 Distill 7B", strengths: ["reasoning", "fast"], quality: 6, context: 131072 },
    ],
  },
  {
    // VERIFICADO: GET https://open.bigmodel.cn/api/paas/v4/models con token falso → 401 (vivo).
    id: "zai-free",
    label: "Z.ai / GLM Flash (gratis)",
    tier: "free-key",
    providerId: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    requiresKey: true,
    getKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    limits: "Modelos «Flash» gratis de forma permanente · 1 petición concurrente.",
    why: "Los GLM «Flash» son gratis para siempre (texto y visión) y responden muy rápido: buen refuerzo del tier gratuito.",
    privacy: "cloud",
    weight: 0.85,
    models: [
      { id: "glm-4.7-flash", label: "GLM 4.7 Flash", strengths: ["chat", "fast", "translate"], quality: 7, context: 200000 },
      { id: "glm-4.6v-flash", label: "GLM 4.6V Flash (visión)", strengths: ["vision", "fast"], quality: 7, vision: true, context: 128000 },
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
  // ⚠️ REGLA DE ORO (Adenda 67 · P0-2): estas tres fuentes son las ÚNICAS que un
  // usuario recién llegado (sin claves, sin Ollama, sin modelos descargados)
  // tiene disponibles. Antes SOLO existía Pollinations → cuando fallaba, Aurora
  // se quedaba literalmente sin cerebro y devolvía "no conseguí respuesta".
  // Ahora hay TRES cerebros gratis-sin-clave independientes entre sí, todos
  // verificados con `curl` (endpoint + CORS `*`) el 2026-07-13.
  {
    // VERIFICADO 2026-07-13: POST https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions
    // sin cabecera Authorization (y también con `Authorization: Bearer ` vacío,
    // que es lo que envía nuestro adaptador) → HTTP 200 en ~1,2 s.
    // CORS: access-control-allow-origin: * · allow-headers: *  → usable desde el navegador.
    // Límite anónimo: ~2 req/min (por eso `cooldownMinutes: 3`, no 60).
    id: "ovh-anonymous",
    label: "OVHcloud AI Endpoints (sin clave)",
    tier: "instant",
    providerId: "openai-compatible",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    requiresKey: false,
    keyOptional: true,
    getKeyUrl: "https://endpoints.ai.cloud.ovh.net/",
    cooldownMinutes: 3,
    timeoutMs: 45_000,
    limits: "Sin clave: ~2 req/min (anónimo). Con cuenta gratuita OVH, mucho más.",
    why: "Modelos ABIERTOS GRANDES (gpt-oss-120b, Qwen3.5-397B, Llama 3.3 70B, Qwen2.5-VL visión) gratis y SIN registro, en infraestructura europea. Es el mejor cerebro que un invitado puede tener sin dar un solo dato.",
    privacy: "cloud",
    weight: 0.88,
    models: [
      { id: "gpt-oss-120b", label: "GPT-OSS 120B", strengths: ["reasoning", "code", "chat"], quality: 8, context: 131072 },
      { id: "Qwen3.5-397B-A17B", label: "Qwen3.5 397B", strengths: ["reasoning", "long", "chat"], quality: 9, context: 262144 },
      { id: "Meta-Llama-3_3-70B-Instruct", label: "Llama 3.3 70B", strengths: ["chat", "summary", "translate", "creative"], quality: 8, context: 128000 },
      { id: "Mistral-Small-3.2-24B-Instruct-2506", label: "Mistral Small 3.2 24B", strengths: ["chat", "fast", "translate"], quality: 7, context: 128000 },
      { id: "Qwen3-Coder-30B-A3B-Instruct", label: "Qwen3 Coder 30B", strengths: ["code"], quality: 8, context: 262144 },
      { id: "Qwen2.5-VL-72B-Instruct", label: "Qwen2.5-VL 72B (visión)", strengths: ["vision"], quality: 8, vision: true, context: 128000 },
      { id: "Mistral-Nemo-Instruct-2407", label: "Mistral Nemo 12B", strengths: ["fast", "chat"], quality: 6, context: 128000 },
    ],
  },
  {
    // VERIFICADO 2026-07-13: POST https://api.llm7.io/v1/chat/completions SIN clave
    // → HTTP 200 en ~1,5 s con `gemma3:27b` y `codestral-latest`. CORS: `*`.
    // Los modelos propietarios del catálogo de LLM7 (gpt-5.x, claude-*, grok-*)
    // devuelven 401 sin token → NO los declaramos: solo los que funcionan libres.
    // Token gratuito opcional en https://token.llm7.io (30 → 120 req/min).
    id: "llm7-free",
    label: "LLM7.io (sin clave)",
    tier: "instant",
    providerId: "openai-compatible",
    baseUrl: "https://api.llm7.io/v1",
    requiresKey: false,
    keyOptional: true,
    getKeyUrl: "https://token.llm7.io",
    cooldownMinutes: 3,
    timeoutMs: 45_000,
    limits: "Sin clave: ~30 req/min. Con token gratuito (token.llm7.io): ~120 req/min.",
    why: "Segundo cerebro gratis SIN registro: modelos abiertos (Gemma 3 27B, Codestral) con respuesta rápida. Red de seguridad independiente de Pollinations y OVH.",
    privacy: "cloud",
    weight: 0.82,
    models: [
      { id: "gemma3:27b", label: "Gemma 3 27B", strengths: ["chat", "translate", "summary", "creative"], quality: 7, context: 131072 },
      { id: "codestral-latest", label: "Codestral", strengths: ["code"], quality: 7 },
    ],
  },
  {
    // VERIFICADO 2026-07-13: el catálogo anónimo de Pollinations expone HOY UN
    // SOLO modelo — `openai-fast` (GPT-OSS 20B, alias "openai"). El antiguo
    // modelo "mistral" que declarábamos ESTÁ MUERTO: devuelve
    // `404 Model not found: mistral` … ¡y tarda 28 s en decirlo!  Cada vez que
    // el ranking lo elegía primero, Aurora quemaba media cadena de failover en
    // un callejón sin salida. Eliminado. (GET https://text.pollinations.ai/models)
    id: "pollinations-text",
    label: "Pollinations (sin clave)",
    tier: "instant",
    providerId: "openai-compatible",
    baseUrl: "https://text.pollinations.ai/openai",
    requiresKey: false,
    // NUNCA se enfría: es el último recurso universal del invitado. Un 429
    // transitorio dejaba a Aurora 60 minutos sin cerebro (bug real, jul-2026).
    neverCooldown: true,
    // Pollinations encola en horas punta: 30 s la mataba viva. 60 s de margen.
    timeoutMs: 60_000,
    limits: "Gratis sin clave; puede tener colas (a veces ~40 s) en horas punta.",
    why: "Funciona al instante sin registro: es la red de seguridad FINAL para que TODO usuario tenga IA desde el minuto uno. Nunca se desactiva.",
    privacy: "cloud",
    weight: 0.8,
    models: [
      { id: "openai", label: "Pollinations · GPT-OSS 20B", strengths: ["chat", "summary", "creative", "reasoning"], quality: 6 },
      { id: "openai-fast", label: "Pollinations · GPT-OSS 20B (rápido)", strengths: ["fast", "chat"], quality: 6 },
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
  // OpenRouter (y cualquier fuente con `preferFreeModels`): los modelos `:free`
  // ganan SIEMPRE. Un modelo de pago de esa fuente solo se usaría si el usuario
  // lo fuerza a mano — Aurora jamás gasta créditos por su cuenta.
  if (source.preferFreeModels) {
    if (isFreeModelId(model.id)) score += 4;
    else score -= 5;
  }
  return score * source.weight;
}

/* ───────────────── Helpers de la Adenda 67 (gratis-siempre) ───────────────── */

/** ¿Es un id de modelo explícitamente gratuito (convención `:free` de OpenRouter)? */
export function isFreeModelId(modelId: string): boolean {
  const id = String(modelId ?? "");
  return id.endsWith(":free") || id === "openrouter/free";
}

/**
 * Fuentes que funcionan SIN NINGUNA CLAVE ni instalación: la red de seguridad
 * universal de Aurora (OVHcloud anónimo, LLM7.io, Pollinations). El router las
 * añade SIEMPRE al final de la cadena de failover para que nunca se quede sin
 * cerebro. Excluye las de navegador (requieren descarga opt-in del usuario).
 */
export function keylessCloudSources(): CatalogSource[] {
  return FREE_CATALOG.filter((s) => !s.requiresKey && s.privacy === "cloud" && s.tier !== "paid");
}

/** ¿Esta fuente NUNCA debe entrar en cooldown? (últimos recursos sin clave). */
export function isNeverCooldown(sourceId: string): boolean {
  return !!findSource(sourceId)?.neverCooldown;
}

/** Minutos de enfriamiento declarados por la fuente (o el default del llamador). */
export function cooldownMinutesFor(sourceId: string, fallback: number): number {
  const m = findSource(sourceId)?.cooldownMinutes;
  return typeof m === "number" && m > 0 ? m : fallback;
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
/* ═══════════════════════════ CATÁLOGO VIVO (OpenRouter :free) ═══════════════════════════
 * (Adenda 71 · 2026-07-17) El catálogo de OpenRouter `:free` se mantiene
 * VIVO: `openrouter-live-catalog.ts` consulta la API pública de OpenRouter,
 * filtra los `:free` y reemplaza los `models` de la fuente `openrouter-free`
 * con los REALES de hoy. Esta función aplica ese override MUTANDO el array
 * `FREE_CATALOG` (que ya consumen `availability.ts` y `router.ts`), de modo
 * que Aurora, Hermione y CUALQUIER personalidad que apunte a `openrouter-free`
 * se benefician automáticamente del catálogo vivo — sin tocar su lógica.
 *
 * Import DINÁMICO a propósito: `openrouter-live-catalog` ya importa
 * `findSource` de este módulo, así que un import estático crearía ciclo. Al
 * usar `import()` solo en tiempo de ejecución (tras el arranque) se rompe.
 * Defensivo: nunca lanza; si el módulo vivo falla, el catálogo estático
 * (ya cargado en `FREE_CATALOG`) se conserva intacto.
 */
let liveApplied = false;
export async function applyLiveOpenRouter(): Promise<boolean> {
  if (liveApplied) return true;
  try {
    const mod = await import("./openrouter-live-catalog");
    const live = mod.liveOpenRouterSource();
    const idx = FREE_CATALOG.findIndex((s) => s.id === "openrouter-free");
    if (idx >= 0 && live) {
      FREE_CATALOG[idx] = live;
      liveApplied = true;
      return true;
    }
  } catch {
    /* silencio: nos quedamos con el estático */
  }
  return false;
}

/** ¿Ya se aplicó el override vivo? (para la UI no volver a forzar). */
export function isLiveOpenRouterApplied(): boolean {
  return liveApplied;
}
