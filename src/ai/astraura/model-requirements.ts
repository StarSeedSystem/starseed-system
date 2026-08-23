/**
 * StarSeed OS — REQUISITOS DE HARDWARE POR MODELO (Adenda 109).
 * ============================================================================
 * Cada opción de modelo de Astraura (LLM de OpenRouter/locales) y de OmniVoice
 * (voces) declara sus requisitos mínimos de CPU/GPU/RAM. La clave conceptual:
 *
 *   · Los modelos LOCALES (WebGPU, Ollama, LM Studio, descargables) SÍ tienen
 *     requisitos reales de hardware — corren EN el dispositivo (la neurona).
 *   · Los modelos de SERVIDOR (StarSeed oficial, OpenRouter, servidor propio por
 *     API/MCP) NO tienen requisito de hardware local — corren en el servidor, así
 *     que funcionan en CUALQUIER neurona (basta conexión y, a veces, una clave).
 *
 * Esta es exactamente la decisión local-vs-servidor: si el dispositivo es capaz
 * y la app del OS está instalada, se puede correr local (privado, offline); si
 * no, el servidor lo cubre en cualquier neurona sin instalar nada.
 *
 * Módulo LIVIANO: solo datos + lógica pura (sin React, sin Supabase). El tipo de
 * capacidades se importa SOLO como tipo (se borra en compilación). Nunca lanza.
 */

import type { NeuronCapabilities } from "@/lib/neurons/neurons";

export type ModelKind = "llm" | "voz";
export type ModelAccess = "local" | "starseed" | "openrouter" | "custom";
export type DeviceTier = "alto" | "medio" | "bajo" | "minimo";
export type FitLevel = "ideal" | "suficiente" | "justo" | "insuficiente";

/** Requisitos de hardware de una opción de modelo. Todo opcional (defensivo). */
export interface HardwareReq {
  /** Núcleos lógicos mínimos recomendados. */
  minCores?: number;
  /** RAM mínima recomendada (GB). */
  minRamGb?: number;
  /** Rol del GPU para esta opción. */
  gpu?: "requerida" | "recomendada" | "opcional" | "no";
  /** VRAM aproximada mínima (GB) para correr con fluidez (orientativo en web). */
  minVramGb?: number;
  /** Requiere contexto WebGPU (WebLLM). */
  webgpu?: boolean;
  /** Requiere la Prompt API integrada de Chrome (Gemini Nano). */
  chromeAi?: boolean;
  /** Tamaño aproximado de descarga/instalación (GB) para opciones locales. */
  approxSizeGb?: number;
}

export interface ModelSpec {
  id: string;
  label: string;
  kind: ModelKind;
  access: ModelAccess;
  /** Motor/proveedor legible (p.ej. "WebLLM", "Ollama", "Kokoro", "StarSeed"). */
  engine: string;
  req: HardwareReq;
  /** Idiomas destacados (BCP-47 corto) o "multi". */
  langs?: string[];
  /** Admite referencias de audio (clonación/preset de voz) — solo voz. */
  voiceRefs?: boolean;
  /** Funciona sin conexión una vez instalado (local). */
  offline?: boolean;
  /** Nota corta para la UI. */
  note?: string;
}

/** ¿La opción corre en un servidor (sin requisito de hardware local)? */
export function runsRemotely(spec: ModelSpec): boolean {
  return spec.access !== "local";
}

/* ── LLM LOCALES (requisitos reales de hardware) ─────────────────────────────── */
export const LOCAL_LLM_SPECS: ModelSpec[] = [
  {
    // (Adenda 155) SISTEMA PRIMARIO del OS: backend soberano Astraura 1.58-bit con
    // BitNet b1.58 2B-4T ternario (i2_s) servido por `llama-server` nativo. Pesa ~1.2 GB
    // y corre en CPU sin GPU: por eso su encaje es bueno incluso en equipos modestos.
    id: "astraura-158", label: "Astraura 1.58-bit (BitNet ternario, soberano)", kind: "llm", access: "local", engine: "Astraura 1.58",
    req: { minCores: 4, minRamGb: 8, gpu: "no", approxSizeGb: 1.2 }, langs: ["multi"], offline: true,
    note: "Sistema primario del OS. Necesita el backend Astraura 1.58 corriendo en esta neurona (o su nube propia).",
  },
  {
    id: "chrome-ai", label: "Gemini Nano (Chrome AI)", kind: "llm", access: "local", engine: "Chrome AI",
    req: { chromeAi: true, minRamGb: 4, gpu: "opcional", approxSizeGb: 4 }, langs: ["multi"], offline: true,
    note: "Integrado en Chrome; lo gestiona el navegador.",
  },
  {
    id: "smolvlm2-webgpu", label: "SmolVLM2 (visión)", kind: "llm", access: "local", engine: "WebGPU",
    req: { webgpu: true, minRamGb: 4, gpu: "recomendada", approxSizeGb: 0.25 }, langs: ["multi"], offline: true,
    note: "Modelo de visión ligero en el navegador.",
  },
  {
    id: "smollm3-webgpu", label: "SmolLM3", kind: "llm", access: "local", engine: "WebGPU",
    req: { webgpu: true, minCores: 4, minRamGb: 6, gpu: "recomendada", approxSizeGb: 1.9 }, langs: ["multi"], offline: true,
  },
  {
    id: "webllm", label: "WebLLM (Llama/Qwen 3B)", kind: "llm", access: "local", engine: "WebGPU",
    req: { webgpu: true, minCores: 4, minRamGb: 8, gpu: "recomendada", minVramGb: 4, approxSizeGb: 3 }, langs: ["multi"], offline: true,
  },
  {
    id: "ollama-small", label: "Ollama · 3B (Llama/Phi/Qwen)", kind: "llm", access: "local", engine: "Ollama",
    req: { minCores: 4, minRamGb: 8, gpu: "opcional", approxSizeGb: 2.5 }, langs: ["multi"], offline: true,
    note: "Servidor local Ollama.",
  },
  {
    id: "ollama-mid", label: "Ollama · 7–8B", kind: "llm", access: "local", engine: "Ollama",
    req: { minCores: 6, minRamGb: 16, gpu: "recomendada", minVramGb: 6, approxSizeGb: 5 }, langs: ["multi"], offline: true,
  },
  {
    id: "ollama-large", label: "Ollama · 13–14B", kind: "llm", access: "local", engine: "Ollama",
    req: { minCores: 8, minRamGb: 32, gpu: "requerida", minVramGb: 12, approxSizeGb: 9 }, langs: ["multi"], offline: true,
  },
];

/* ── LLM DE SERVIDOR (sin requisito de hardware local) ───────────────────────── */
export const SERVER_LLM_SPECS: ModelSpec[] = [
  {
    id: "starseed-llm", label: "Modelos del servidor StarSeed", kind: "llm", access: "starseed", engine: "StarSeed",
    req: {}, langs: ["multi"], note: "Los que ofrece el servidor oficial. Funciona en cualquier neurona.",
  },
  {
    id: "openrouter-llm", label: "OpenRouter (LLM en la nube)", kind: "llm", access: "openrouter", engine: "OpenRouter",
    req: {}, langs: ["multi"], note: "Modelos :free sin clave; premium con clave. Corre en la nube.",
  },
  {
    id: "custom-llm-api", label: "Servidor propio (API)", kind: "llm", access: "custom", engine: "API",
    req: {}, langs: ["multi"], note: "Tu servidor por URL + clave. Corre fuera del dispositivo.",
  },
  {
    id: "custom-llm-mcp", label: "Servidor propio (MCP)", kind: "llm", access: "custom", engine: "MCP",
    req: {}, langs: ["multi"], note: "Servidor externo vía MCP. Corre fuera del dispositivo.",
  },
];

/* ── VOZ LOCAL (OmniVoice · requisitos reales) ───────────────────────────────── */
export const LOCAL_VOICE_SPECS: ModelSpec[] = [
  {
    id: "piper", label: "Piper", kind: "voz", access: "local", engine: "Piper",
    req: { minCores: 2, minRamGb: 2, gpu: "no", approxSizeGb: 0.1 }, langs: ["es", "en", "multi"], offline: true,
    note: "Ultraligera, corre en CPU. Ideal para equipos modestos.",
  },
  {
    id: "kokoro", label: "Kokoro", kind: "voz", access: "local", engine: "Kokoro",
    req: { minCores: 4, minRamGb: 3, gpu: "opcional", approxSizeGb: 0.35 }, langs: ["es", "en"], offline: true,
    note: "Ligera y muy natural. Buen equilibrio por defecto.",
  },
  {
    id: "openvoice", label: "OpenVoice", kind: "voz", access: "local", engine: "OpenVoice",
    req: { minCores: 4, minRamGb: 6, gpu: "recomendada", approxSizeGb: 1 }, langs: ["es", "en", "multi"], voiceRefs: true, offline: true,
    note: "Clonación por referencia de audio.",
  },
  {
    id: "coqui", label: "Coqui XTTS", kind: "voz", access: "local", engine: "Coqui",
    req: { minCores: 6, minRamGb: 8, gpu: "recomendada", minVramGb: 4, approxSizeGb: 2 }, langs: ["multi"], voiceRefs: true, offline: true,
    note: "Expresiva y clonable; mejor con GPU.",
  },
  {
    id: "bark", label: "Bark", kind: "voz", access: "local", engine: "Bark",
    req: { minCores: 8, minRamGb: 12, gpu: "requerida", minVramGb: 6, approxSizeGb: 4 }, langs: ["multi"], offline: true,
    note: "Muy expresiva; pesada, requiere GPU.",
  },
  {
    id: "gptsovits", label: "GPT-SoVITS", kind: "voz", access: "local", engine: "GPT-SoVITS",
    req: { minCores: 8, minRamGb: 12, gpu: "requerida", minVramGb: 6, approxSizeGb: 3 }, langs: ["multi"], voiceRefs: true, offline: true,
    note: "Clonación de alta fidelidad; requiere GPU.",
  },
];

/* ── VOZ DE SERVIDOR (sin requisito de hardware local) ───────────────────────── */
export const SERVER_VOICE_SPECS: ModelSpec[] = [
  {
    id: "starseed-voice", label: "Voces del servidor StarSeed", kind: "voz", access: "starseed", engine: "StarSeed",
    req: {}, langs: ["multi"], voiceRefs: true, note: "Voces que ofrece el servidor oficial. Cualquier neurona.",
  },
  {
    id: "xai-voice", label: "xAI (Grok) — voz en la nube", kind: "voz", access: "starseed", engine: "xAI",
    req: {}, langs: ["es", "en"], note: "Voz premium por la clave del sistema. Corre en la nube.",
  },
  {
    id: "custom-voice-api", label: "Voz de servidor propio (API)", kind: "voz", access: "custom", engine: "API",
    req: {}, langs: ["multi"], voiceRefs: true, note: "Tu endpoint de TTS. Corre fuera del dispositivo.",
  },
];

export const ALL_LLM_SPECS: ModelSpec[] = [...LOCAL_LLM_SPECS, ...SERVER_LLM_SPECS];
export const ALL_VOICE_SPECS: ModelSpec[] = [...LOCAL_VOICE_SPECS, ...SERVER_VOICE_SPECS];

export function specsFor(kind: ModelKind): ModelSpec[] {
  return kind === "llm" ? ALL_LLM_SPECS : ALL_VOICE_SPECS;
}

/* ── Heurística de GPU discreto/potente a partir del renderer ────────────────── */
function gpuStrength(caps: NeuronCapabilities): "discreto" | "integrado" | "desconocido" {
  const r = (caps.gpuRenderer || "").toLowerCase();
  if (!r) return caps.webgpu ? "integrado" : "desconocido";
  if (/nvidia|geforce|rtx|gtx|radeon|rx\s?\d|amd\b/.test(r)) return "discreto";
  if (/apple m\d|m1|m2|m3|m4/.test(r)) return "discreto"; // Apple Silicon: GPU capaz
  if (/intel|uhd|iris|mali|adreno|apple gpu|swiftshader|llvmpipe/.test(r)) return "integrado";
  return "desconocido";
}

/** Clasifica el dispositivo en una gama a partir de sus capacidades.
 *  "alto" implica poder correr modelos locales grandes → exige GPU potente
 *  (discreta o Apple Silicon) o RAM muy alta; una GPU integrada topa en "medio". */
export function classifyDeviceTier(caps: NeuronCapabilities): DeviceTier {
  const ram = caps.memoryGb ?? 0;
  const cores = caps.cores ?? 0;
  const strong = gpuStrength(caps) === "discreto";
  let score = 0;
  if (ram >= 32) score += 3; else if (ram >= 16) score += 2; else if (ram >= 8) score += 1; else if (ram > 0 && ram < 4) score -= 1;
  if (cores >= 12) score += 2; else if (cores >= 4) score += 1;
  if (caps.webgpu) score += 1;
  if (strong) score += 2; // GPU dedicada / Apple Silicon: lo que habilita "alto"
  if (score >= 6) return "alto";
  if (score >= 3) return "medio";
  if (score >= 1) return "bajo";
  return "minimo";
}

export function tierLabel(t: DeviceTier): string {
  return t === "alto" ? "Gama alta" : t === "medio" ? "Gama media" : t === "bajo" ? "Gama modesta" : "Gama mínima";
}

/**
 * Evalúa cómo encaja una opción de modelo en un dispositivo:
 *   · Servidor → siempre "ideal" (corre en el servidor, sin requisito local).
 *   · Local → puntúa RAM, núcleos, GPU y WebGPU/Chrome AI contra los mínimos.
 */
export function fitFor(caps: NeuronCapabilities, spec: ModelSpec): { level: FitLevel; fits: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (runsRemotely(spec)) {
    return { level: "ideal", fits: true, reasons: ["Se ejecuta en el servidor · funciona en cualquier neurona"] };
  }
  const req = spec.req;
  let score = 3; // ideal

  // Bloqueantes duros: falta la plataforma de ejecución local.
  if (req.webgpu && caps.webgpu === false) { reasons.push("Requiere WebGPU (no disponible en este navegador)"); score = 0; }
  if (req.chromeAi && caps.chromeAi === false) { reasons.push("Requiere la Prompt API de Chrome (no disponible)"); score = 0; }

  // RAM
  if (req.minRamGb && caps.memoryGb != null) {
    if (caps.memoryGb + 0.5 < req.minRamGb) {
      if (caps.memoryGb < req.minRamGb - 2) { score -= 2; reasons.push(`RAM insuficiente (${caps.memoryGb} GB < ${req.minRamGb} GB)`); }
      else { score -= 1; reasons.push(`RAM justa (${caps.memoryGb} GB · recom. ${req.minRamGb} GB)`); }
    }
  } else if (req.minRamGb && caps.memoryGb == null) {
    reasons.push("RAM no reportada por el navegador");
  }

  // Núcleos
  if (req.minCores && caps.cores != null && caps.cores < req.minCores) {
    score -= 1; reasons.push(`Pocos núcleos (${caps.cores} < ${req.minCores})`);
  }

  // GPU
  const g = gpuStrength(caps);
  if (req.gpu === "requerida") {
    if (g === "discreto") { /* ok */ } else if (g === "integrado") { score -= 1; reasons.push("GPU integrada (irá lenta; se recomienda GPU dedicada)"); }
    else { score -= 2; reasons.push("No se detecta GPU capaz (requiere GPU dedicada)"); }
  } else if (req.gpu === "recomendada") {
    if (g === "desconocido") { reasons.push("Sin datos de GPU (puede ir más lento)"); }
    else if (g === "integrado") { /* aceptable */ }
  }

  const level: FitLevel = score >= 3 ? "ideal" : score === 2 ? "suficiente" : score === 1 ? "justo" : "insuficiente";
  if (level === "ideal" && !reasons.length) reasons.push("Encaja con holgura en este dispositivo");
  return { level, fits: level !== "insuficiente", reasons };
}

/** Descripción legible de los requisitos mínimos (para la UI). */
export function describeReq(spec: ModelSpec): string {
  if (runsRemotely(spec)) return "Cualquier dispositivo · se ejecuta en el servidor";
  const r = spec.req;
  const parts: string[] = [];
  if (r.minCores) parts.push(`${r.minCores} núcleos`);
  if (r.minRamGb) parts.push(`${r.minRamGb} GB RAM`);
  if (r.webgpu) parts.push("WebGPU");
  if (r.chromeAi) parts.push("Chrome AI");
  if (r.gpu === "requerida") parts.push(`GPU dedicada${r.minVramGb ? ` (${r.minVramGb} GB VRAM)` : ""}`);
  else if (r.gpu === "recomendada") parts.push("GPU recomendada");
  if (r.approxSizeGb) parts.push(`~${r.approxSizeGb} GB`);
  return parts.length ? `mín. ${parts.join(" · ")}` : "requisitos mínimos";
}

/** Resumen legible de las capacidades detectadas del dispositivo. */
export function describeCaps(caps: NeuronCapabilities): string {
  const parts: string[] = [caps.platform];
  if (caps.browser) parts.push(caps.browser);
  if (caps.cores) parts.push(`${caps.cores} núcleos`);
  if (caps.memoryGb) parts.push(`${caps.memoryGb} GB RAM`);
  if (caps.gpuRenderer) parts.push(caps.gpuRenderer);
  if (caps.webgpu) parts.push("WebGPU ✓");
  if (caps.installedApp) parts.push("app instalada");
  return parts.join(" · ");
}
