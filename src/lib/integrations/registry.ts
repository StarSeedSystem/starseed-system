// ════════════════════════════════════════════════════════════════
// Integraciones · Registro — catálogo de conectores funcionales
// ----------------------------------------------------------------
// Una entrada por herramienta del catálogo OSS que el OS puede INVOCAR
// de verdad (no solo listar). Cada descriptor declara sus acciones, su
// endpoint por defecto (self-host local típico) y si necesita clave.
//
// La UI de configuración (otra superficie) importa de aquí:
//   • INTEGRATIONS              — lista de descriptores.
//   • getIntegration(id)        — busca uno.
//   • integrationConfigKey()    — clave de almacenamiento (global o por cerebro).
//   • loadIntegrationConfig()   — lee config de localStorage (SSR-safe).
//   • saveIntegrationConfig()   — persiste config (SSR-safe).
//
// `ossId` enlaza con el id de oss-library cuando aplica, para que el
// catálogo y la configuración compartan la misma fuente de verdad.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationDescriptor } from "./types";

// ── Catálogo de integraciones ────────────────────────────────────
export const INTEGRATIONS: IntegrationDescriptor[] = [
  // ── Ingesta de datos ──────────────────────────────────────────
  {
    id: "crawl4ai",
    ossId: "crawl4ai",
    label: "Crawl4AI",
    category: "data-ingest",
    capabilities: ["Rastrear webs", "Extraer Markdown para RAG", "Scraping LLM-friendly"],
    defaultEndpoint: "http://localhost:11235",
    needsKey: false,
    docsUrl: "https://docs.crawl4ai.com/core/docker-deployment/",
    actions: [
      { id: "crawl", label: "Rastrear URL", description: "Rastrea una o varias URLs y devuelve su contenido en Markdown." },
    ],
  },
  {
    id: "firecrawl",
    ossId: "firecrawl",
    label: "Firecrawl",
    category: "data-ingest",
    capabilities: ["Scraping a Markdown", "Rastreo de sitios", "Datos estructurados"],
    defaultEndpoint: "http://localhost:3002",
    needsKey: true,
    docsUrl: "https://docs.firecrawl.dev/",
    actions: [
      { id: "scrape", label: "Extraer página", description: "Extrae una página web como Markdown y metadatos." },
      { id: "crawl", label: "Rastrear sitio", description: "Rastrea un sitio completo desde una URL raíz (asíncrono)." },
    ],
  },

  // ── Apps y plataformas IA ─────────────────────────────────────
  {
    id: "dify",
    ossId: "dify",
    label: "Dify",
    category: "app-platform",
    capabilities: ["Apps de chat/agente", "Workflows LLM", "RAG"],
    defaultEndpoint: "http://localhost/v1",
    needsKey: true,
    docsUrl: "https://docs.dify.ai/en/use-dify/publish/developing-with-apis",
    actions: [
      { id: "chat", label: "Chat con app", description: "Envía un mensaje a una app de chat/agente de Dify (clave por app)." },
      { id: "run-workflow", label: "Ejecutar workflow", description: "Ejecuta un workflow de Dify con variables de entrada." },
    ],
  },
  {
    id: "langflow",
    ossId: "langflow",
    label: "Langflow",
    category: "app-platform",
    capabilities: ["Ejecutar flujos visuales", "Agentes low-code"],
    defaultEndpoint: "http://localhost:7860",
    needsKey: false,
    docsUrl: "https://docs.langflow.org/api-flows-run",
    actions: [
      { id: "run-flow", label: "Ejecutar flujo", description: "Ejecuta un flujo de Langflow por su flowId con un valor de entrada." },
    ],
  },
  {
    id: "flowise",
    ossId: "flowise",
    label: "Flowise",
    category: "app-platform",
    capabilities: ["Predicción de chatflow", "Agentes visuales"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: false,
    docsUrl: "https://docs.flowiseai.com/api-reference/prediction",
    actions: [
      { id: "predict", label: "Preguntar al chatflow", description: "Envía una pregunta a un chatflow de Flowise y devuelve su respuesta." },
    ],
  },
  {
    id: "open-webui",
    ossId: "open-webui",
    label: "Open WebUI",
    category: "app-platform",
    capabilities: ["Chat con LLM", "Compatible OpenAI", "RAG"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: true,
    docsUrl: "https://docs.openwebui.com/",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat usando la API compatible con OpenAI de Open WebUI." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos disponibles." },
    ],
  },
  {
    id: "openhands",
    ossId: "openhands",
    label: "OpenHands",
    category: "app-platform",
    capabilities: ["Agente de software", "Escribe y ejecuta código (experimental)"],
    defaultEndpoint: "http://localhost:3000",
    needsKey: false,
    docsUrl: "https://docs.all-hands.dev/",
    actions: [
      { id: "run-task", label: "Lanzar tarea", description: "Envía una tarea de programación al servidor de OpenHands (experimental; configura extra.path)." },
    ],
  },
  {
    id: "stirling-pdf",
    ossId: "stirling-pdf",
    label: "Stirling-PDF",
    category: "app-platform",
    capabilities: ["Fusionar PDF", "PDF a imagen", "Extraer texto"],
    defaultEndpoint: "http://localhost:8080",
    needsKey: false,
    docsUrl: "https://docs.stirlingpdf.com/API/",
    actions: [
      { id: "merge", label: "Fusionar PDFs", description: "Combina dos o más PDFs en un único documento." },
      { id: "to-image", label: "PDF a imagen", description: "Convierte las páginas de un PDF en imágenes." },
      { id: "extract-text", label: "Extraer texto", description: "Extrae el texto de un PDF (si la instancia lo soporta)." },
    ],
  },

  // ── Runtimes locales (compatibles OpenAI) ─────────────────────
  {
    id: "ollama",
    ossId: "ollama",
    label: "Ollama",
    category: "runtime",
    capabilities: ["Inferencia local", "Compatible OpenAI", "Gestión de modelos"],
    defaultEndpoint: "http://localhost:11434",
    needsKey: false,
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat con un modelo local servido por Ollama." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos descargados en Ollama." },
    ],
  },
  {
    id: "litellm",
    ossId: "litellm",
    label: "LiteLLM",
    category: "runtime",
    capabilities: ["Gateway 100+ LLM", "Compatible OpenAI", "Balanceo/coste"],
    defaultEndpoint: "http://localhost:4000",
    needsKey: true,
    docsUrl: "https://docs.litellm.ai/docs/simple_proxy",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat a través del proxy LiteLLM (formato OpenAI)." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos expuestos por el gateway." },
    ],
  },
  {
    id: "localai",
    ossId: "localai",
    label: "LocalAI",
    category: "runtime",
    capabilities: ["Inferencia local multimodal", "Compatible OpenAI"],
    defaultEndpoint: "http://localhost:8080",
    needsKey: false,
    docsUrl: "https://localai.io/",
    actions: [
      { id: "chat", label: "Chatear", description: "Completa un chat con LocalAI (formato OpenAI)." },
      { id: "models", label: "Listar modelos", description: "Lista los modelos disponibles." },
    ],
  },

  // ── Automatización ────────────────────────────────────────────
  {
    id: "n8n",
    ossId: "n8n",
    label: "n8n",
    category: "automation",
    capabilities: ["Disparar workflows", "Automatización", "Webhooks"],
    defaultEndpoint: "http://localhost:5678",
    needsKey: false,
    docsUrl: "https://docs.n8n.io/integrations/webhooks/",
    actions: [
      { id: "trigger", label: "Disparar automatización", description: "Dispara un workflow de n8n vía su webhook con un payload." },
    ],
  },
  {
    id: "browser-use",
    ossId: "browser-use",
    label: "Browser Use",
    category: "automation",
    capabilities: ["Agente de navegador", "Automatización web (experimental)"],
    defaultEndpoint: "http://localhost:8000",
    needsKey: false,
    docsUrl: "https://docs.browser-use.com/",
    actions: [
      { id: "browser-task", label: "Tarea de navegador", description: "Envía una tarea web en lenguaje natural a un servidor Browser Use (experimental; configura extra.path)." },
    ],
  },

  // ── Búsqueda (metabuscador) ───────────────────────────────────
  {
    id: "searxng",
    ossId: "searxng",
    label: "SearXNG",
    category: "data-ingest",
    capabilities: ["Búsqueda web privada", "Metabúsqueda", "Resultados JSON"],
    defaultEndpoint: "http://localhost:8080",
    needsKey: false,
    docsUrl: "https://docs.searxng.org/dev/search_api.html",
    actions: [
      { id: "search", label: "Buscar en la web", description: "Realiza una búsqueda web y devuelve resultados (requiere format JSON activo)." },
    ],
  },
];

// ── Helpers de búsqueda ──────────────────────────────────────────
export function getIntegration(id: string): IntegrationDescriptor | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

// ── Persistencia de configuración (localStorage, SSR-safe) ───────
const CONFIG_PREFIX = "starseed.integration.";

/**
 * Clave de almacenamiento de la config:
 *   • Global:    starseed.integration.<id>
 *   • Por cerebro: starseed.brain.<brainId>.integration.<id>
 */
export function integrationConfigKey(id: string, brainId?: string): string {
  if (brainId && brainId.trim()) {
    return `starseed.brain.${brainId.trim()}.integration.${id}`;
  }
  return `${CONFIG_PREFIX}${id}`;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Lee la config (defensivo). Devuelve {} si no hay nada/error/SSR. */
export function loadIntegrationConfig(id: string, brainId?: string): IntegrationConfig {
  if (!isClient()) return {};
  try {
    const raw = localStorage.getItem(integrationConfigKey(id, brainId));
    if (!raw) {
      // Fallback a la global si se pidió por-cerebro y no existe.
      if (brainId) {
        const g = localStorage.getItem(integrationConfigKey(id));
        if (g) {
          const parsed = JSON.parse(g);
          if (parsed && typeof parsed === "object") return parsed as IntegrationConfig;
        }
      }
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as IntegrationConfig) : {};
  } catch {
    return {};
  }
}

/** Persiste la config (defensivo). No-op en SSR. Notifica por evento. */
export function saveIntegrationConfig(id: string, cfg: IntegrationConfig, brainId?: string): void {
  if (!isClient()) return;
  try {
    const key = integrationConfigKey(id, brainId);
    localStorage.setItem(key, JSON.stringify(cfg ?? {}));
    try {
      window.dispatchEvent(
        new CustomEvent("starseed:integration-config-changed", {
          detail: { id, brainId: brainId || null, at: Date.now() },
        }),
      );
    } catch { /* noop */ }
  } catch { /* noop */ }
}
