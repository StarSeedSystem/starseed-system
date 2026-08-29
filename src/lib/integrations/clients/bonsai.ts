// ════════════════════════════════════════════════════════════════
// Bonsai Client para Aurora tools & Integraciones
// ------------------------------------------------------------
// Cablea Bonsai / Ternary-Bonsai (motor 1-bit & 1.58-bit acelerado por Metal GPU)
// como herramientas nativas invocables por Aurora y Astraura OS.
// ════════════════════════════════════════════════════════════════

import type { IntegrationResult } from "@/lib/integrations/types";
import {
  healthCheck,
  getStatus,
  chatCompletion,
  visionQuery,
  listModels,
  runBenchmark,
  type BonsaiConfig,
} from "@/ai/astraura/integrations/bonsai";

export {
  healthCheck as health,
  getStatus,
  chatCompletion,
  visionQuery,
  listModels,
  runBenchmark,
};

/** Carga configuración por defecto de Bonsai desde variables de entorno */
export function loadBonsaiConfig(): BonsaiConfig {
  return {
    endpoint: process.env.BONSAI_ENDPOINT || process.env.ASTRAURA_BONSAI_URL || "http://127.0.0.1:8080",
    family: (process.env.BONSAI_FAMILY as BonsaiConfig["family"]) || "ternary",
    modelSize: (process.env.BONSAI_MODEL as BonsaiConfig["modelSize"]) || "27B",
    gpuOffload: process.env.BONSAI_NGL !== "0",
    enableVision: process.env.BONSAI_VISION !== "0",
    speculative: process.env.BONSAI_SPECULATIVE === "1",
    kv4Cache: process.env.BONSAI_KV4 === "1",
    reasoningBudget: process.env.BONSAI_REASONING_BUDGET ? parseInt(process.env.BONSAI_REASONING_BUDGET, 10) : -1,
    timeoutMs: 120_000,
  };
}

/** Runner unificado para acciones de Bonsai desde runIntegration */
export async function runBonsaiAction(
  action: string,
  config: BonsaiConfig,
  input: Record<string, unknown>
): Promise<IntegrationResult> {
  switch (action) {
    case "health": {
      return healthCheck(config);
    }

    case "status": {
      return getStatus(config);
    }

    case "chat": {
      const messages = Array.isArray(input.messages)
        ? (input.messages as Array<{ role: string; content: string }>)
        : [
            ...(input.system_prompt ? [{ role: "system", content: String(input.system_prompt) }] : []),
            { role: "user", content: String(input.prompt || input.query || "") },
          ];

      return chatCompletion(config, {
        messages,
        tools: Array.isArray(input.tools) ? (input.tools as any) : undefined,
        temperature: typeof input.temperature === "number" ? input.temperature : undefined,
        max_tokens: typeof input.max_tokens === "number" ? input.max_tokens : undefined,
        reasoning_budget: typeof input.reasoning_budget === "number" ? input.reasoning_budget : undefined,
      });
    }

    case "vision": {
      const prompt = String(input.prompt || input.query || "Describe esta imagen en detalle.");
      const images: string[] = [];
      if (Array.isArray(input.images)) {
        images.push(...input.images.map(String));
      } else if (input.image) {
        images.push(String(input.image));
      } else if (input.image_url) {
        images.push(String(input.image_url));
      }

      return visionQuery(config, {
        prompt,
        images,
        systemPrompt: input.system_prompt ? String(input.system_prompt) : undefined,
        maxTokens: typeof input.max_tokens === "number" ? input.max_tokens : undefined,
      });
    }

    case "models": {
      return listModels();
    }

    case "benchmark": {
      return runBenchmark(config, {
        prompt: input.prompt ? String(input.prompt) : undefined,
        tokens: typeof input.tokens === "number" ? input.tokens : undefined,
      });
    }

    default:
      return { ok: false, error: `Acción Bonsai desconocida: "${action}"` };
  }
}
