/** Apinex — proveedor de acceso multiagentico (https://apinex.bond)
 * Clave: STARSEED_PASARELA_APINEX_KEY en ~/.starseed/env
 *
 * 22 modelos: 8 gratuitos + 14 de pago ($0.05-$0.50/1M tokens).
 * API estilo OpenAI en /v1/chat/completions.
 */

export interface ModeloApinex {
  id: string;
  etiqueta: string;
  precio: number; // $/M tokens, 0 = gratis
  contexto: number; // ventana en tokens
  peso: number; // factor de costo (×1, ×2, etc.)
  vivo: boolean;
}

export const MODELOS_APINEX: ModeloApinex[] = [
  // Gratuitos
  { id: "free/gemini-3.8-flash", etiqueta: "Gemini 3.8 Flash", precio: 0, contexto: 1000000, peso: 4, vivo: true },
  { id: "free/muse-spark-1.3", etiqueta: "Muse Spark 1.3", precio: 0, contexto: 1000000, peso: 1, vivo: true },
  { id: "free/glm-5.3-flash", etiqueta: "GLM-5.3 Flash", precio: 0, contexto: 1000000, peso: 3, vivo: true },
  { id: "free/gemini-3.1-pro", etiqueta: "Gemini 3.1 Pro", precio: 0, contexto: 1000000, peso: 2, vivo: true },
  { id: "free/deepseek-v4-flash-0731", etiqueta: "Deepseek V4 Flash", precio: 0, contexto: 1000000, peso: 2, vivo: true },
  { id: "free/deepseek-v4-pro-0813", etiqueta: "Deepseek V4 Pro", precio: 0, contexto: 1000000, peso: 2, vivo: true },
  { id: "free/gpt-5.6-luna", etiqueta: "GPT 5.6 Luna", precio: 0, contexto: 1000000, peso: 3, vivo: true },
  { id: "free/qwen-3.8-max", etiqueta: "Qwen 3.8 MAX", precio: 0, contexto: 1000000, peso: 2, vivo: true },
  // De pago (baratos)
  { id: "gpt/5.6-luna", etiqueta: "GPT 5.6 Luna", precio: 0.05, contexto: 1000000, peso: 0.2, vivo: true },
  { id: "deepseek/v4-flash", etiqueta: "Deepseek V4 Flash", precio: 0.05, contexto: 1000000, peso: 0.2, vivo: true },
  { id: "gpt/5.6-sol", etiqueta: "GPT 5.6 Sol", precio: 0.20, contexto: 1000000, peso: 0.8, vivo: true },
  { id: "grok/4.6", etiqueta: "Grok 4.6", precio: 0.25, contexto: 500000, peso: 1, vivo: true },
  { id: "kimi/k3", etiqueta: "Kimi K3", precio: 0.20, contexto: 1000000, peso: 0.8, vivo: true },
  { id: "claude/opus-5", etiqueta: "Claude Opus 5", precio: 0.30, contexto: 1000000, peso: 1.2, vivo: true },
  { id: "claude/sonnet-5", etiqueta: "Claude Sonnet 5", precio: 0.15, contexto: 1000000, peso: 0.6, vivo: true },
  { id: "gpt/5.6-terra", etiqueta: "GPT 5.6 Terra", precio: 0.15, contexto: 1000000, peso: 0.6, vivo: true },
  { id: "gemini/3.1-pro", etiqueta: "Gemini 3.1 Pro", precio: 0.15, contexto: 1000000, peso: 0.6, vivo: true },
  { id: "gemini/3.8-flash", etiqueta: "Gemini 3.8 Flash", precio: 0.10, contexto: 1000000, peso: 0.4, vivo: true },
  { id: "glm/5.3-flash", etiqueta: "GLM-5.3 Flash", precio: 0.05, contexto: 1000000, peso: 0.2, vivo: true },
  { id: "glm/5.3", etiqueta: "GLM 5.3", precio: 0.15, contexto: 1000000, peso: 0.6, vivo: true },
  { id: "gpt/6-astra", etiqueta: "GPT 6 Astra", precio: 0.50, contexto: 1000000, peso: 2, vivo: true },
  { id: "deepseek/v4-pro", etiqueta: "Deepseek V4 Pro", precio: 0.07, contexto: 1000000, peso: 0.3, vivo: true },
];

export function esGratis(modelo: ModeloApinex): boolean {
  return modelo.precio === 0;
}

export function modelosGratuitos(): ModeloApinex[] {
  return MODELOS_APINEX.filter(esGratis);
}

export function modeloPorId(id: string): ModeloApinex | undefined {
  return MODELOS_APINEX.find((m) => m.id === id);
}

export function costoEstimado(modelo: ModeloApinex, tokens: number): number {
  return (tokens / 1_000_000) * modelo.precio * modelo.peso;
}
