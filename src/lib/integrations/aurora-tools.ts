// ════════════════════════════════════════════════════════════════
// Integraciones · Adaptador de Aurora — tools que Aurora puede invocar
// ----------------------------------------------------------------
// Expone el subconjunto de integraciones como "tools" con nombre amable,
// para que Aurora (y los cerebros) las llamen por nombre. Cada tool mapea
// a (integrationId, actionId). `runAuroraTool(name, input)` resuelve el
// nombre, comprueba que esté configurada y la ejecuta vía runIntegration.
//
// El motor de Aurora (engine.ts/actions.ts) puede inyectar la sección de
// prompt `auroraToolsPromptSection()` para que el modelo sepa qué tools
// existen, y despachar con `runAuroraTool`. Todo defensivo: nada lanza.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "./types";
import { getIntegration, loadIntegrationConfig } from "./registry";
import { runIntegration } from "./run";

export interface AuroraIntegrationTool {
  /** Nombre que el modelo usa para invocar (snake_case, estable). */
  name: string;
  /** Descripción en español de qué hace y qué espera. */
  description: string;
  /** Integración destino. */
  integrationId: string;
  /** Acción destino dentro de la integración. */
  actionId: string;
}

/** Subconjunto de tools que Aurora puede invocar. */
export const AURORA_INTEGRATION_TOOLS: AuroraIntegrationTool[] = [
  {
    name: "crawl_url",
    description: "Rastrea una URL y devuelve su contenido en Markdown (Crawl4AI). Entrada: { url } o { urls: [...] }.",
    integrationId: "crawl4ai",
    actionId: "crawl",
  },
  {
    name: "scrape_url",
    description: "Extrae una página web como Markdown vía Firecrawl. Entrada: { url }.",
    integrationId: "firecrawl",
    actionId: "scrape",
  },
  {
    name: "web_search",
    description: "Busca en la web con un metabuscador privado (SearXNG). Entrada: { q } o texto.",
    integrationId: "searxng",
    actionId: "search",
  },
  {
    name: "pdf_merge",
    description: "Fusiona varios PDFs en uno (Stirling-PDF). Entrada: { files: [File|URL|base64, ...] }.",
    integrationId: "stirling-pdf",
    actionId: "merge",
  },
  {
    name: "pdf_extract",
    description: "Extrae el texto de un PDF (Stirling-PDF). Entrada: { file } o { url }.",
    integrationId: "stirling-pdf",
    actionId: "extract-text",
  },
  {
    name: "pdf_to_image",
    description: "Convierte un PDF en imágenes (Stirling-PDF). Entrada: { file, imageFormat? }.",
    integrationId: "stirling-pdf",
    actionId: "to-image",
  },
  {
    name: "run_flow",
    description: "Ejecuta un flujo agéntico Dify (chat). Entrada: { query }. Requiere clave de app.",
    integrationId: "dify",
    actionId: "chat",
  },
  {
    name: "run_langflow",
    description: "Ejecuta un flujo de Langflow por flowId. Entrada: { input_value } (flowId en config).",
    integrationId: "langflow",
    actionId: "run-flow",
  },
  {
    name: "run_flowise",
    description: "Pregunta a un chatflow de Flowise. Entrada: { question } (chatflowId en config).",
    integrationId: "flowise",
    actionId: "predict",
  },
  {
    name: "run_automation",
    description: "Dispara una automatización n8n vía webhook. Entrada: objeto de payload.",
    integrationId: "n8n",
    actionId: "trigger",
  },
  {
    name: "browser_task",
    description: "Lanza una tarea web a un agente de navegador (Browser Use, experimental). Entrada: { task }.",
    integrationId: "browser-use",
    actionId: "browser-task",
  },
  {
    name: "code_task",
    description: "Envía una tarea de programación a OpenHands (experimental). Entrada: { task }.",
    integrationId: "openhands",
    actionId: "run-task",
  },
  {
    name: "local_chat",
    description: "Completa un chat con un modelo local (Ollama, formato OpenAI). Entrada: { prompt } o { messages }.",
    integrationId: "ollama",
    actionId: "chat",
  },
];

// Índice por nombre para O(1).
const TOOL_INDEX: Record<string, AuroraIntegrationTool> = Object.fromEntries(
  AURORA_INTEGRATION_TOOLS.map((t) => [t.name, t]),
);

/** Busca una tool de Aurora por nombre. */
export function getAuroraTool(name: string): AuroraIntegrationTool | undefined {
  return TOOL_INDEX[name];
}

/**
 * Indica si una tool está disponible (su integración está habilitada y
 * con endpoint). Útil para que Aurora solo ofrezca lo que de verdad puede.
 */
export function isAuroraToolAvailable(name: string, brainId?: string): boolean {
  const t = getAuroraTool(name);
  if (!t) return false;
  const cfg = loadIntegrationConfig(t.integrationId, brainId);
  const desc = getIntegration(t.integrationId);
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || desc?.defaultEndpoint || "";
  return cfg.enabled !== false && !!endpoint;
}

/** Lista las tools disponibles ahora mismo (por config). */
export function listAvailableAuroraTools(brainId?: string): AuroraIntegrationTool[] {
  return AURORA_INTEGRATION_TOOLS.filter((t) => isAuroraToolAvailable(t.name, brainId));
}

/**
 * Ejecuta una tool de Aurora por nombre. Carga la config (global o por
 * cerebro). NUNCA lanza: devuelve IntegrationResult honesto.
 */
export async function runAuroraTool(
  name: string,
  input: any,
  opts?: { brainId?: string; cfg?: IntegrationConfig },
): Promise<IntegrationResult> {
  const t = getAuroraTool(name);
  if (!t) return { ok: false, error: `No existe la herramienta "${name}".` };
  const cfg = opts?.cfg ?? loadIntegrationConfig(t.integrationId, opts?.brainId);
  return runIntegration(t.integrationId, t.actionId, input, cfg);
}

/** Fragmento para el system prompt: lista de tools de integración. */
export function auroraToolsPromptSection(brainId?: string): string {
  const tools = listAvailableAuroraTools(brainId);
  if (tools.length === 0) return "";
  const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
  return [
    "HERRAMIENTAS EXTERNAS (integraciones configuradas): puedes invocar estas tools de servicios self-host del usuario.",
    ...lines,
  ].join("\n");
}
