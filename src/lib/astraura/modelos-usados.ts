"use client";

/**
 * ASTRAURA · MODELOS USADOS POR LA NEURONA (helper puro)
 * -------------------------------------------------------
 * Combina lo que la neurona tiene instalado, sus preferencias de acceso y el motor
 * de voz activo para producir la lista de IDs de modelo que la neurona USA ahora.
 * Es PURA: entrada → salida, sin localStorage, sin red, sin efectos.
 *
 * Contrato (§14.6 de architecture/recomendador-modelos-llmfit.md):
 *   - Recibe: instalados (listInstalledModels), preferencias (orden efectivo de
 *     ModelAccessClass), voz (AuroraVoiceEngine activo).
 *   - Devuelve: IDs únicos en orden estable (sin duplicados).
 */

import type { ModelAccessClass } from "@/lib/astraura/model-preferences";
import type { AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";

/** Mapea una clase de acceso a los sourceIds representativos del catálogo. */
function sourceIdsForAccessClass(cls: ModelAccessClass): readonly string[] {
  switch (cls) {
    case "local":
      return [
        "ollama-local",
        "lmstudio-local",
        "smollm3-webgpu",
        "smolvlm2-webgpu",
        "webllm",
        "sipp-local",
        "chrome-ai",
      ] as const;
    case "starseed":
      return [
        "astraura-158-local",
        "astraura-158-nube",
        "starseed",
        "hermione",
        "openvoice2",
      ] as const;
    case "api-free":
      return [
        "openrouter-free",
        "pollinations-text",
        "groq",
        "cerebras",
        "gemini",
        "mistral",
        "nvidia",
        "github",
        "cloudflare",
        "scaleway",
        "cohere",
        "sambanova",
        "huggingface",
        "ollama-cloud",
        "nscale",
        "modelscope",
        "siliconflow",
        "zai",
        "ovh-anonymous",
        "llm7-free",
      ] as const;
    case "api-external":
      return [
        "openai-paid",
        "anthropic-paid",
        "xai-paid",
        "custom-endpoint",
      ] as const;
  }
}

/**
 * Devuelve los IDs de modelo que la neurona usa ahora, sin duplicados y en
 * orden estable: primero los instalados explícitamente, luego los de las
 * clases de acceso preferidas (en su orden), y por último el motor de voz.
 */
export function modelosUsados(args: {
  /** Resultado de `listInstalledModels()`: sourceIds de modelos descargables instalados. */
  instalados: readonly string[];
  /** Orden efectivo de clases de acceso (salida de `effectiveOrder()`). */
  preferencias: readonly ModelAccessClass[];
  /** Motor de voz activo (p. ej. "browser", "kokoro", "omnivoice"…). */
  voz: AuroraVoiceEngine;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  // 1) Modelos instalados explícitamente (prioridad máxima: el usuario los eligió).
  for (const id of args.instalados) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }

  // 2) Clases de acceso preferidas → sourceIds representativos del catálogo.
  for (const cls of args.preferencias) {
    for (const id of sourceIdsForAccessClass(cls)) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }

  // 3) Motor de voz activo (también es un "modelo" que usa la neurona).
  if (args.voz && !seen.has(args.voz)) {
    out.push(args.voz);
  }

  return out;
}