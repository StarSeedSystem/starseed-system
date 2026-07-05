"use client";

/**
 * ASTRAURA · Motores integrados sin clave (navegador).
 * ----------------------------------------------------
 * Rutas "builtin://" del catálogo gratis-primero que NO pasan por un
 * adaptador HTTP:
 *   · chrome-ai     — Prompt API del navegador (Gemini Nano, Chrome 148+).
 *   · webllm        — @mlc-ai/web-llm cargado desde CDN (WebGPU).
 *   · transformers  — @huggingface/transformers (Transformers.js) con WebGPU:
 *                     LLM abiertos (SmolLM3-3B-ONNX) 100% en el navegador.
 *
 * Todos devuelven el mismo ChatResponse que los providers. Defensivo: si el
 * motor no está disponible lanza un Error claro para que el router haga
 * failover a la siguiente fuente. SSR-safe.
 */

import type { ChatMessage, ChatResponse } from "@/ai/providers/types";

/* ── Chrome Built-in AI (Prompt API / Gemini Nano) ───────────────── */

export async function chromeAiAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const LM = (window as any).LanguageModel;
    if (!LM?.availability) return false;
    const st = await LM.availability();
    return st === "available" || st === "downloadable" || st === "readily";
  } catch {
    return false;
  }
}

export async function chromeAiChat(
  messages: ChatMessage[],
  opts?: { signal?: AbortSignal; onChunk?: (d: string) => void }
): Promise<ChatResponse> {
  const LM = (window as any).LanguageModel;
  if (!LM?.create) throw new Error("Prompt API no disponible en este navegador.");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const session = await LM.create({
    ...(system ? { initialPrompts: [{ role: "system", content: system }] } : {}),
  });
  try {
    // Historial (sin el último user) como contexto plano + último turno.
    const convo = messages.filter((m) => m.role !== "system");
    const last = convo[convo.length - 1];
    const history = convo.slice(0, -1)
      .map((m) => `${m.role === "user" ? "Usuario" : "Aurora"}: ${m.content}`)
      .join("\n");
    const prompt = history ? `${history}\nUsuario: ${last?.content ?? ""}` : (last?.content ?? "");
    if (opts?.onChunk && session.promptStreaming) {
      let full = "";
      const stream = session.promptStreaming(prompt, { signal: opts.signal });
      // La Prompt API emite el texto ACUMULADO o incremental según versión;
      // normalizamos calculando el delta.
      for await (const chunk of stream) {
        const s = String(chunk ?? "");
        const delta = s.startsWith(full) ? s.slice(full.length) : s;
        full = s.startsWith(full) ? s : full + s;
        if (delta) opts.onChunk(delta);
      }
      return { text: full };
    }
    const text = await session.prompt(prompt, { signal: opts?.signal });
    return { text: String(text ?? "") };
  } finally {
    try { session.destroy?.(); } catch { /* */ }
  }
}

/* ── WebLLM (WebGPU, CDN, bajo demanda) ──────────────────────────── */

let webllmEnginePromise: Promise<any> | null = null;
let webllmLoadedModel = "";

export function webgpuAvailable(): boolean {
  try {
    return typeof navigator !== "undefined" && !!(navigator as any).gpu;
  } catch {
    return false;
  }
}

async function getWebllmEngine(model: string, onProgress?: (p: string) => void): Promise<any> {
  if (webllmEnginePromise && webllmLoadedModel === model) return webllmEnginePromise;
  webllmLoadedModel = model;
  webllmEnginePromise = (async () => {
    // Import dinámico desde CDN en tiempo de ejecución. Se construye vía
    // Function() para que NI webpack NI TypeScript intenten resolver la URL
    // (no es una dependencia npm; solo existe en el navegador).
    const importFromCdn = new Function("u", "return import(u)") as (u: string) => Promise<any>;
    const mod: any = await importFromCdn("https://esm.run/@mlc-ai/web-llm");
    const engine = await mod.CreateMLCEngine(model, {
      initProgressCallback: (r: any) => onProgress?.(r?.text || ""),
    });
    return engine;
  })();
  return webllmEnginePromise;
}

export async function webllmChat(
  model: string,
  messages: ChatMessage[],
  opts?: { temperature?: number; signal?: AbortSignal; onChunk?: (d: string) => void; onProgress?: (p: string) => void }
): Promise<ChatResponse> {
  if (!webgpuAvailable()) throw new Error("WebGPU no disponible en este navegador.");
  const engine = await getWebllmEngine(model, opts?.onProgress);
  if (opts?.onChunk) {
    const chunks = await engine.chat.completions.create({
      messages, temperature: opts?.temperature ?? 0.7, stream: true,
    });
    let full = "";
    for await (const c of chunks) {
      const delta = c?.choices?.[0]?.delta?.content || "";
      if (delta) { full += delta; opts.onChunk(delta); }
    }
    return { text: full };
  }
  const res = await engine.chat.completions.create({
    messages, temperature: opts?.temperature ?? 0.7,
  });
  return { text: res?.choices?.[0]?.message?.content || "" };
}

/* ── Transformers.js (WebGPU · HuggingFace, CDN, bajo demanda) ────── */

let tfPipelinePromise: Promise<any> | null = null;
let tfLoadedModel = "";

/**
 * Carga (una vez) un pipeline de generación de texto de Transformers.js desde
 * CDN. Import por Function() para que webpack/TS no lo resuelvan (solo existe
 * en el navegador). Cachea el pipeline por modelo.
 */
async function getTransformersPipeline(model: string, onProgress?: (p: string) => void): Promise<any> {
  if (tfPipelinePromise && tfLoadedModel === model) return tfPipelinePromise;
  tfLoadedModel = model;
  tfPipelinePromise = (async () => {
    const importFromCdn = new Function("u", "return import(u)") as (u: string) => Promise<any>;
    const mod: any = await importFromCdn("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3");
    const pipe = await mod.pipeline("text-generation", model, {
      device: "webgpu",
      dtype: "q4f16",
      progress_callback: (r: any) => {
        if (r?.status === "progress" && r?.file) {
          onProgress?.(`${r.file} ${Math.round(r.progress || 0)}%`);
        }
      },
    });
    return pipe;
  })();
  return tfPipelinePromise;
}

export async function transformersChat(
  model: string,
  messages: ChatMessage[],
  opts?: { temperature?: number; onChunk?: (d: string) => void; onProgress?: (p: string) => void }
): Promise<ChatResponse> {
  if (!webgpuAvailable()) throw new Error("WebGPU no disponible para Transformers.js.");
  const pipe = await getTransformersPipeline(model, opts?.onProgress);
  // El pipeline acepta el formato de mensajes de chat directamente y aplica la
  // plantilla del tokenizer del modelo.
  const out: any = await pipe(messages, {
    max_new_tokens: 512,
    do_sample: (opts?.temperature ?? 0.7) > 0,
    temperature: opts?.temperature ?? 0.7,
  });
  // La salida es [{ generated_text: [...turnos, {role:'assistant', content}] }].
  let text = "";
  try {
    const gen = out?.[0]?.generated_text;
    if (Array.isArray(gen)) text = gen[gen.length - 1]?.content ?? "";
    else if (typeof gen === "string") text = gen;
  } catch { /* */ }
  if (opts?.onChunk && text) opts.onChunk(text);
  return { text: String(text || "") };
}
