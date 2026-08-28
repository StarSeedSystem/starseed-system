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
// ── Adenda 67 · P4 (jul-2026) ──
import * as Typesense from "./clients/typesense";
import * as Postiz from "./clients/postiz";
import * as TdaiMemory from "./clients/tencentdb-memory";
import * as Databasement from "./clients/databasement";
import * as Instance from "./clients/instance";
import * as AgentReach from "./clients/agent-reach";

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

      /* ── Adenda 67 · P4 ── */
      case "typesense":
        if (a === "search") return await Typesense.search(c, input);
        if (a === "collections") return await Typesense.collections(c);
        break;
      case "postiz":
        if (a === "integrations") return await Postiz.integrations(c);
        // ⚠️ Efecto irreversible: el llamador DEBE haber pedido confirmación
        // explícita al usuario (social-crosspost.tsx). Nunca lo dispara Aurora sola.
        if (a === "publish") return await Postiz.publish(c, input);
        if (a === "attach-url") return await Postiz.attachByUrl(c, String(input?.url ?? input ?? ""));
        break;
      case "tencentdb-memory":
        if (a === "recall") return await TdaiMemory.recall(c, input);
        if (a === "capture") return await TdaiMemory.capture(c, input);
        if (a === "search-memories") return await TdaiMemory.searchMemories(c, input);
        if (a === "session-end") return await TdaiMemory.endSession(c, input);
        break;
      case "databasement":
        if (a === "servers") return await Databasement.servers(c);
        if (a === "snapshots") return await Databasement.snapshots(c);
        // ⚠️ Efecto real sobre datos: solo con acción explícita del usuario.
        if (a === "backup-now") return await Databasement.backupNow(c, input);
        break;
      case "openmanus":
        // Conector EXPERIMENTAL: OpenManus no trae API HTTP oficial (CLI + MCP).
        // Reutilizamos el runner genérico de tarea (mismo patrón que OpenHands):
        // el usuario declara la ruta exacta de su envoltorio en `extra.path`.
        if (a === "run-task") return await GenericTask.runTask(id, c, input);
        break;
      case "penpot":
      case "opencut":
        // Sin API: el "conector" solo comprueba que la instancia responde.
        if (a === "ping") {
          return await Instance.health(
            id,
            c,
            id === "penpot" ? Instance.PENPOT_DEFAULT : Instance.OPENCUT_DEFAULT,
          );
        }
        break;

      case "agent-reach":
        // Agent-Reach es CLI local + proxy HTTP del OS.
        // El endpoint placeholder es "http://localhost:0"; el cliente ignora endpoint
        // y llama directo a /api/agent-reach/*. No requiere API key.
        if (a === "web-search") return await AgentReach.web_search(c, input);
        if (a === "read-web") return await AgentReach.read_web(c, input);
        if (a === "youtube-transcript") return await AgentReach.read_youtube(c, input);
        if (a === "github-read") return await AgentReach.read_github(c, input);
        if (a === "reddit-search") return await AgentReach.read_reddit(c, input);
        if (a === "health") return await AgentReach.health(c);
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

      /* ── Adenda 67 · P4 ── */
      case "typesense":
        return await Typesense.health(c);
      case "postiz":
        return await Postiz.health(c);
      case "tencentdb-memory":
        return await TdaiMemory.health(c);
      case "databasement":
        return await Databasement.health(c);
      case "openmanus":
        return await GenericTask.health(id, c);
      case "penpot":
        return await Instance.health(id, c, Instance.PENPOT_DEFAULT);
      case "opencut":
        return await Instance.health(id, c, Instance.OPENCUT_DEFAULT);
      case "agent-reach":
        return await AgentReach.health(c);

      default:
        return { ok: false, error: `Sin prueba de salud para "${id}".` };
    }
  } catch (err: unknown) {
    return { ok: false, error: `Fallo en la prueba de "${id}": ${(err as Error)?.message || "error"}.` };
  }
}
