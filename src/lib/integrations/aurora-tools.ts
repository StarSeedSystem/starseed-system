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
//
// ADITIVO: además de las integraciones, aquí se registran las tools de
// CONTROL DE PANTALLA (src/lib/aurora/screen-control/*) — la pantalla como
// agente interactivo: ver_pantalla, pulsar_elemento, escribir_en,
// desplazar_pantalla, atras, adelante, pantalla_completa. Se ejecutan en
// LOCAL (DOM del navegador), no requieren configuración alguna y comparten
// el mismo contrato de despacho (getAuroraTool / runAuroraTool).
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

// ════════════════════════════════════════════════════════════════════════════
// CONTROL DE PANTALLA — la pantalla como agente interactivo (ejecución local)
// ----------------------------------------------------------------------------
// Tools que NO llaman a ninguna integración: operan sobre el DOM visible
// (src/lib/aurora/screen-control/*). Comparten el contrato de las tools de
// integración (mismo despacho por nombre desde actions.ts), pero se ejecutan
// en local, siempre disponibles en el navegador y sin configuración. La carga
// del módulo DOM es perezosa (import dinámico) para no acoplar el bundle ni
// romper SSR. Todo defensivo: nada lanza.
// ════════════════════════════════════════════════════════════════════════════

/** Pseudo-integración de las tools de pantalla (no existe en el registro). */
export const SCREEN_TOOL_INTEGRATION_ID = "pantalla";

export interface AuroraScreenTool extends AuroraIntegrationTool {
  /** Marca de tool local de pantalla (ejecuta DOM, no integraciones). */
  kind: "screen";
  /** Ejecutor local (solo navegador). */
  run: (input: Record<string, unknown>) => Promise<IntegrationResult>;
}

/** Type guard: ¿es una tool de control de pantalla? */
export function isAuroraScreenTool(
  t: AuroraIntegrationTool | undefined | null,
): t is AuroraScreenTool {
  return !!t && (t as AuroraScreenTool).kind === "screen" && typeof (t as AuroraScreenTool).run === "function";
}

/** Tipado del módulo de acciones de pantalla (import dinámico). */
type ScreenActionsModule = typeof import("@/lib/aurora/screen-control/screen-actions");
type ScreenOutcome = { ok: boolean; message: string; data?: Record<string, unknown> };

/** Primer valor no vacío entre varias claves del input (defensivo). */
function pickInput(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = input[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/**
 * Ejecuta una acción de pantalla con import perezoso del módulo DOM y
 * adapta su resultado al contrato IntegrationResult (data.text = frase
 * decible en español; error = mensaje amable). NUNCA lanza.
 */
async function runScreenControl(
  exec: (mod: ScreenActionsModule) => ScreenOutcome | Promise<ScreenOutcome>,
): Promise<IntegrationResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, error: "El control de pantalla solo funciona en el navegador." };
  }
  try {
    const mod = await import("@/lib/aurora/screen-control/screen-actions");
    const res = await exec(mod);
    if (!res || typeof res.ok !== "boolean") {
      return { ok: false, error: "El control de pantalla no respondió." };
    }
    return res.ok
      ? { ok: true, data: { text: res.message, ...(res.data ?? {}) } }
      : { ok: false, error: res.message };
  } catch {
    return { ok: false, error: "No pude ejecutar el control de pantalla en esta página." };
  }
}

/** Tools de PANTALLA que Aurora puede invocar (siempre disponibles en navegador). */
export const AURORA_SCREEN_TOOLS: AuroraScreenTool[] = [
  {
    name: "ver_pantalla",
    description:
      "Muestra números sobre los botones y enlaces visibles para pulsarlos por voz. Entrada: {}. Responde con la lista corta («1 Publicar · 2 Perfil…»); léesela al usuario tal cual.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "ver_pantalla",
    kind: "screen",
    run: () => runScreenControl((m) => m.verPantalla()),
  },
  {
    name: "pulsar_elemento",
    description:
      "Pulsa un botón, enlace o pestaña visible por su número o su nombre. Entrada: { numero } o { nombre }. Si dudas de qué hay en pantalla, usa antes ver_pantalla.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "pulsar_elemento",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.clickElement(
          pickInput(input, "numero", "número", "n", "id", "indice", "índice", "elemento", "nombre", "name", "etiqueta", "boton", "botón"),
        ),
      ),
  },
  {
    name: "escribir_en",
    description:
      "Escribe texto en un campo visible (búsqueda, input, área de texto). Entrada: { numero|nombre, texto }.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "escribir_en",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.typeInto(
          pickInput(input, "numero", "número", "n", "id", "elemento", "nombre", "name", "campo", "etiqueta"),
          pickInput(input, "texto", "text", "valor", "value", "contenido", "mensaje"),
        ),
      ),
  },
  {
    name: "desplazar_pantalla",
    description:
      "Desplaza la pantalla o el panel central. Entrada: { direccion: arriba|abajo|izquierda|derecha|inicio|final, cantidad?: poco|pagina|mucho|píxeles }.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "desplazar_pantalla",
    kind: "screen",
    run: (input) =>
      runScreenControl((m) =>
        m.scrollPage(
          pickInput(input, "direccion", "dirección", "dir", "hacia", "sentido"),
          pickInput(input, "cantidad", "amount", "cuanto", "cuánto", "pixeles", "píxeles"),
        ),
      ),
  },
  {
    name: "atras",
    description: "Vuelve a la página anterior del historial de navegación. Entrada: {}.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "atras",
    kind: "screen",
    run: () => runScreenControl((m) => m.goBack()),
  },
  {
    name: "adelante",
    description: "Avanza a la página siguiente del historial de navegación. Entrada: {}.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "adelante",
    kind: "screen",
    run: () => runScreenControl((m) => m.goForward()),
  },
  {
    name: "pantalla_completa",
    description: "Activa o desactiva el modo pantalla completa del OS. Entrada: {}.",
    integrationId: SCREEN_TOOL_INTEGRATION_ID,
    actionId: "pantalla_completa",
    kind: "screen",
    run: () => runScreenControl((m) => m.toggleFullscreen()),
  },
];

// Índice por nombre para O(1) — integraciones + control de pantalla.
const TOOL_INDEX: Record<string, AuroraIntegrationTool> = Object.fromEntries(
  [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS].map((t) => [t.name, t]),
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
  // Las tools de PANTALLA no dependen de configuración: navegador ⇒ disponibles.
  if (isAuroraScreenTool(t)) return typeof window !== "undefined";
  const cfg = loadIntegrationConfig(t.integrationId, brainId);
  const desc = getIntegration(t.integrationId);
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || desc?.defaultEndpoint || "";
  return cfg.enabled !== false && !!endpoint;
}

/** Lista las tools disponibles ahora mismo (por config). */
export function listAvailableAuroraTools(brainId?: string): AuroraIntegrationTool[] {
  return [...AURORA_INTEGRATION_TOOLS, ...AURORA_SCREEN_TOOLS].filter((t) =>
    isAuroraToolAvailable(t.name, brainId),
  );
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
  // Tools de PANTALLA: ejecución local (DOM), sin config ni endpoint.
  if (isAuroraScreenTool(t)) {
    try {
      return await t.run(input && typeof input === "object" ? (input as Record<string, unknown>) : {});
    } catch {
      return { ok: false, error: `No pude completar "${name}".` };
    }
  }
  const cfg = opts?.cfg ?? loadIntegrationConfig(t.integrationId, opts?.brainId);
  return runIntegration(t.integrationId, t.actionId, input, cfg);
}

/** Fragmento para el system prompt: tools de integración + control de pantalla. */
export function auroraToolsPromptSection(brainId?: string): string {
  const tools = listAvailableAuroraTools(brainId);
  if (tools.length === 0) return "";
  const integraciones = tools.filter((t) => !isAuroraScreenTool(t));
  const pantalla = tools.filter((t) => isAuroraScreenTool(t));
  const parts: string[] = [];
  if (integraciones.length > 0) {
    parts.push(
      "HERRAMIENTAS EXTERNAS (integraciones configuradas): puedes invocar estas tools de servicios self-host del usuario.",
      ...integraciones.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  if (pantalla.length > 0) {
    parts.push(
      "CONTROL DE PANTALLA (la pantalla como agente interactivo): puedes ver y manejar la interfaz visible del usuario — enumerar sus botones, pulsarlos, escribir en campos y desplazarla.",
      ...pantalla.map((t) => `- ${t.name}: ${t.description}`),
    );
  }
  return parts.join("\n");
}
