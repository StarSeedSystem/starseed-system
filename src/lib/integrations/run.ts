// ════════════════════════════════════════════════════════════════
// Integraciones · Runner — despacho real de acciones
// ----------------------------------------------------------------
// `runIntegration(id, actionId, input, cfg?)` carga la config (si no se
// pasa), comprueba que la integración esté habilitada y con endpoint, y
// despacha al cliente correspondiente. NUNCA lanza: siempre devuelve un
// IntegrationResult honesto. `testIntegration(id, cfg?)` hace un ping/
// salud ligero por herramienta.
//
// Los clientes viven en ./clients/* y llaman al proxy de Next, así que
// todo esto corre en el navegador (la UI o Aurora lo invoca).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "./types";
import { getIntegration, loadIntegrationConfig } from "./registry";

import * as Crawl4AI from "./clients/crawl4ai";
import * as Firecrawl from "./clients/firecrawl";
import * as SearXNG from "./clients/searxng";
import * as N8N from "./clients/n8n";
import * as OpenAICompat from "./clients/openai-compat";
import * as Dify from "./clients/dify";
import * as Langflow from "./clients/langflow";
import * as Flowise from "./clients/flowise";
import * as Stirling from "./clients/stirling-pdf";
import * as GenericTask from "./clients/generic-task";
import * as Audiobookshelf from "./clients/audiobookshelf";
import * as HomeAssistant from "./clients/home-assistant";
import * as Immich from "./clients/immich";
import * as Perplexica from "./clients/perplexica";
import * as AnythingLLM from "./clients/anything-llm";

/** Comprueba que la integración pueda llamar (habilitada + endpoint). */
function gate(cfg: IntegrationConfig, fallbackEndpoint?: string): { ok: true; cfg: IntegrationConfig } | { ok: false; error: string } {
  const enabled = cfg.enabled !== false; // por defecto, si hay endpoint, se considera activa
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || (fallbackEndpoint && fallbackEndpoint.trim()) || "";
  if (!enabled) return { ok: false, error: "no configurado" };
  if (!endpoint) return { ok: false, error: "no configurado" };
  return { ok: true, cfg: { ...cfg, endpoint } };
}

/**
 * Ejecuta una acción de una integración. Carga config si se omite.
 * NUNCA lanza. Devuelve {ok:false, error:"no configurado"} si está
 * deshabilitada o sin endpoint.
 */
export async function runIntegration(
  id: string,
  actionId: string,
  input: any,
  cfg?: IntegrationConfig,
): Promise<IntegrationResult> {
  try {
    const desc = getIntegration(id);
    if (!desc) return { ok: false, error: `Integración desconocida: "${id}".` };

    const effective = cfg ?? loadIntegrationConfig(id);
    const g = gate(effective, desc.defaultEndpoint);
    if (!g.ok) return { ok: false, error: g.error };
    const c = g.cfg;
    const a = actionId;

    switch (id) {
      case "crawl4ai":
        if (a === "crawl") return await Crawl4AI.crawl(c, input);
        break;
      case "firecrawl":
        if (a === "scrape") return await Firecrawl.scrape(c, input);
        if (a === "crawl") return await Firecrawl.crawl(c, input);
        break;
      case "searxng":
        if (a === "search") return await SearXNG.search(c, input);
        break;
      case "n8n":
        if (a === "trigger") return await N8N.trigger(c, input);
        break;
      case "dify":
        if (a === "chat") return await Dify.chat(c, input);
        if (a === "run-workflow") return await Dify.runWorkflow(c, input);
        break;
      case "langflow":
        if (a === "run-flow") return await Langflow.runFlow(c, input);
        break;
      case "flowise":
        if (a === "predict") return await Flowise.predict(c, input);
        break;
      case "stirling-pdf":
        if (a === "merge") return await Stirling.merge(c, input);
        if (a === "to-image") return await Stirling.toImage(c, input);
        if (a === "extract-text") return await Stirling.extractText(c, input);
        break;
      case "open-webui":
      case "ollama":
      case "litellm":
      case "localai":
        if (a === "chat") return await OpenAICompat.chat(id, c, input);
        if (a === "models") return await OpenAICompat.models(id, c);
        break;
      case "openhands":
        if (a === "run-task") return await GenericTask.runTask(id, c, input);
        break;
      case "browser-use":
        if (a === "browser-task") return await GenericTask.runTask(id, c, input);
        break;
      case "audiobookshelf":
        if (a === "libraries") return await Audiobookshelf.libraries(c);
        if (a === "items") return await Audiobookshelf.items(c, input);
        break;
      case "home-assistant":
        if (a === "states") return await HomeAssistant.states(c, input);
        if (a === "state") return await HomeAssistant.state(c, input);
        break;
      case "immich":
        if (a === "albums") return await Immich.albums(c);
        if (a === "assets") return await Immich.assets(c, input);
        break;
      case "perplexica":
        if (a === "providers") return await Perplexica.providers(c);
        if (a === "search") return await Perplexica.search(c, input);
        break;
      case "anything-llm":
        if (a === "chat") return await AnythingLLM.chat(c, input);
        break;
      default:
        return { ok: false, error: `Integración sin runner: "${id}".` };
    }
    return { ok: false, error: `Acción desconocida "${actionId}" para "${id}".` };
  } catch (err: unknown) {
    return { ok: false, error: `Fallo al ejecutar "${id}/${actionId}": ${(err as Error)?.message || "error"}.` };
  }
}

/** Ping/salud ligero por herramienta. NUNCA lanza. */
export async function testIntegration(id: string, cfg?: IntegrationConfig): Promise<IntegrationResult> {
  try {
    const desc = getIntegration(id);
    if (!desc) return { ok: false, error: `Integración desconocida: "${id}".` };
    const effective = cfg ?? loadIntegrationConfig(id);
    // Para test no exigimos enabled=true (queremos poder probar antes de activar),
    // pero sí un endpoint.
    const endpoint = (effective.endpoint && effective.endpoint.trim()) || desc.defaultEndpoint || "";
    if (!endpoint) return { ok: false, error: "no configurado" };
    const c: IntegrationConfig = { ...effective, endpoint };

    switch (id) {
      case "crawl4ai": return await Crawl4AI.health(c);
      case "firecrawl": return await Firecrawl.health(c);
      case "searxng": return await SearXNG.health(c);
      case "n8n": return await N8N.health(c);
      case "dify": return await Dify.health(c);
      case "langflow": return await Langflow.health(c);
      case "flowise": return await Flowise.health(c);
      case "stirling-pdf": return await Stirling.health(c);
      case "open-webui":
      case "ollama":
      case "litellm":
      case "localai":
        return await OpenAICompat.health(id, c);
      case "openhands":
      case "browser-use":
        return await GenericTask.health(id, c);
      case "audiobookshelf":
        return await Audiobookshelf.health(c);
      case "home-assistant":
        return await HomeAssistant.health(c);
      case "immich":
        return await Immich.health(c);
      case "perplexica":
        return await Perplexica.health(c);
      case "anything-llm":
        return await AnythingLLM.health(c);
      default:
        return { ok: false, error: `Sin prueba de salud para "${id}".` };
    }
  } catch (err: unknown) {
    return { ok: false, error: `Fallo en la prueba de "${id}": ${(err as Error)?.message || "error"}.` };
  }
}
