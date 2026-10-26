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
// Lo pesado lo coloca la malla y las capas de conciencia, nunca la neurona por su
// cuenta (architecture/repos-libreria-1020d.md §3): el «dónde» lo decide
// `colocarServicio` y el puerto real lo da `SERVICIOS_INSTALADOS` (127.0.0.1 del A1,
// bajo demanda: arriba al primer uso si cabe, abajo a los 15 min sin uso).
import {
  colocarServicio,
  SERVICIOS_INSTALADOS,
  type Contexto,
  type ServicioId,
} from "../recursos/servicios-pesados";
import type { OfertaNeurona } from "../recursos/oferta";
import {
  buscarNotas,
  crearNota,
  leerNota,
  ErrorTrilium,
  type Pedir,
} from "../conectores-propios/trilium";

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
import * as OpenViking from "./clients/openviking";
import * as AnythingLLM from "./clients/anything-llm";
// ── Adenda 67 · P4 (jul-2026) ──
import * as Typesense from "./clients/typesense";
import * as Postiz from "./clients/postiz";
import * as TdaiMemory from "./clients/tencentdb-memory";
import * as Databasement from "./clients/databasement";
import * as Instance from "./clients/instance";
import * as AgentReach from "./clients/agent-reach";
// ── qm + AgentHarness (Adenda 172) ──
import * as QM from "./clients/qm";
import * as AgentHarness from "./clients/agentharness";
// ── Bonsai (Adenda 174) ──
import * as Bonsai from "./clients/bonsai";

/** Conectores respaldados por un servicio pesado instalado en el A1. */
const SERVICIO_PESADO_DEL_CONECTOR: Readonly<Record<string, ServicioId>> = {
  "stirling-pdf": "stirling-pdf",
  openhands: "openhands-agent-server",
};

export interface EndpointColocado {
  /** URL traducible (`127.0.0.1:puerto` del A1) o `null` si el destino no se expresa como endpoint. */
  endpoint: string | null;
  destino: string;
  motivo: string;
}

/**
 * La colocación del servicio pesado decide el endpoint del conector: `aparato`
 * (el túnel de la Mac lleva el mismo puerto) o la capa pública `oracle-a1`
 * apuntan a `SERVICIOS_INSTALADOS`; cuenta, malla, web gratis o `ninguno` no se
 * traducen a URL aquí y devuelven `null` para que el conector siga con su URL
 */
export function resolverEndpointServicio(conectorId: string, ofertas: OfertaNeurona[], contexto: Contexto): EndpointColocado {
  const servicioId = SERVICIO_PESADO_DEL_CONECTOR[conectorId];
  if (!servicioId) return { endpoint: null, destino: "conector-propio", motivo: `«${conectorId}» no lo respalda un servicio pesado del A1: sigue con su endpoint propio.` };
  const colocacion = colocarServicio(servicioId, ofertas, contexto);
  const local = (colocacion.donde.tipo === "aparato" || (colocacion.donde.tipo === "capa-publica" && colocacion.donde.id === "oracle-a1"));
  const instalado = local ? SERVICIOS_INSTALADOS[servicioId] : undefined;
  return {
    endpoint: instalado ? `http://${instalado.host}:${instalado.puerto}` : null,
    destino: colocacion.donde.tipo,
    motivo: colocacion.motivo,
  };
}

const SIN_OFERTAS: OfertaNeurona[] = [];
const CONTEXTO_DEL_CONECTOR: Contexto = { cuentaId: "" };

/** Comprueba que la integración pueda llamar (habilitada + endpoint). */
function gate(cfg: IntegrationConfig, fallbackEndpoint?: string): { ok: true; cfg: IntegrationConfig } | { ok: false; error: string } {
  const enabled = cfg.enabled !== false; // por defecto, si hay endpoint, se considera activa
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || (fallbackEndpoint && fallbackEndpoint.trim()) || "";
  if (!enabled) return { ok: false, error: "no configurado" };
  if (!endpoint) return { ok: false, error: "no configurado" };
  return { ok: true, cfg: { ...cfg, endpoint } };
}

/** `fetch` real inyectado en el cliente puro de Trilium (sin `node:*`). */
const pedirTrilium: Pedir = (url, init) => fetch(url, init);

/** Adapta la llamada al cliente Trilium al contrato del runner, sin filtrar el token. */
async function desdeTrilium<T>(accion: () => Promise<T>): Promise<IntegrationResult<T>> {
  try {
    return { ok: true, data: await accion() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ErrorTrilium ? error.message : "No se pudo contactar con Trilium.",
    };
  }
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
    const colocado = resolverEndpointServicio(id, SIN_OFERTAS, CONTEXTO_DEL_CONECTOR);
    const g = gate(effective, colocado.endpoint ?? desc.defaultEndpoint);
    if (!g.ok) return g;
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
        // PDF1020A · 1020d: operaciones según la instancia (lee /v1/api-docs).
        if (a === "operaciones") return await Stirling.operacionesDisponibles(c);
        if (a === "operar") {
          const archivo = (Array.isArray(input?.files) && input.files.length ? input.files : input?.file) ?? input?.url ?? input;
          const idOperacion = String(input?.operacion ?? input?.id ?? "");
          return await Stirling.ejecutarOperacion(c, idOperacion, archivo, input?.parametros ?? {});
        }
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
      case "trilium-etapi": {
        const base = c.endpoint ?? "";
        const token = c.apiKey ?? "";
        const entrada = (input ?? {}) as Record<string, unknown>;
        const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");
        if (a === "buscar") {
          const consulta = texto(entrada.consulta) || texto(entrada.q) || texto(entrada.query) || texto(entrada.texto);
          if (!consulta.trim()) return { ok: false, error: "Falta el texto a buscar." };
          const limite = Number(entrada.limite ?? entrada.limit) || 20;
          return desdeTrilium(() => buscarNotas(base, token, consulta, pedirTrilium, limite));
        }
        if (a === "leer") {
          const id = texto(entrada.id) || texto(entrada.noteId);
          if (!id.trim()) return { ok: false, error: "Falta el id de la nota." };
          return desdeTrilium(() => leerNota(base, token, id, pedirTrilium));
        }
        if (a === "crear") {
          const padre = texto(entrada.padreId) || texto(entrada.parentNoteId);
          const titulo = texto(entrada.titulo) || texto(entrada.title);
          const contenido = texto(entrada.contenido) || texto(entrada.content);
          const tipo = texto(entrada.tipo) || "text";
          return desdeTrilium(() => crearNota(base, token, padre, titulo, contenido, pedirTrilium, tipo));
        }
        break;
      }
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

      case "openviking":
        // OpenViking — base de datos de contexto para agentes (HTTP API en servidor local).
        if (a === "health") return await OpenViking.healthCheck(c);
        if (a === "ls") return await OpenViking.ls(c, String(input.uri || "viking://resources/"));
        if (a === "tree") return await OpenViking.tree(c, String(input.uri || "viking://resources/"), Number(input.depth) || 3);
        if (a === "stat") return await OpenViking.stat(c, String(input.uri));
        if (a === "mkdir") return await OpenViking.mkdir(c, String(input.uri));
        if (a === "mv") return await OpenViking.mv(c, String(input.fromUri), String(input.toUri));
        if (a === "remove") return await OpenViking.remove(c, String(input.uri));
        if (a === "read") return await OpenViking.readContent(c, String(input.uri));
        if (a === "abstract") return await OpenViking.readAbstract(c, String(input.uri));
        if (a === "overview") return await OpenViking.readOverview(c, String(input.uri));
        if (a === "search") return await OpenViking.semanticSearch(c, String(input.query), {
          limit: Number(input.limit) || 10,
          uriScope: input.uriScope as string | undefined,
          mode: (input.mode as "context" | "chunks") || "context",
        });
        if (a === "find") return await OpenViking.find(c, String(input.query), Number(input.limit) || 10);
        if (a === "grep") return await OpenViking.grep(c, String(input.pattern), input.uriScope as string | undefined);
        if (a === "glob") return await OpenViking.glob(c, String(input.pattern), input.uriScope as string | undefined);
        if (a === "create_session") return await OpenViking.createSession(c, input.agentId as string | undefined);
        if (a === "add_messages") return await OpenViking.addSessionMessages(
          c, String(input.sessionId), input.messages as Array<{ role: "user" | "assistant" | "system"; content: string }>
        );
        if (a === "get_context") return await OpenViking.getSessionContext(c, String(input.sessionId));
        if (a === "commit_session") return await OpenViking.commitSession(c, String(input.sessionId));
        if (a === "extract_memory") return await OpenViking.extractMemory(c, String(input.sessionId));
        if (a === "add_resource") return await OpenViking.addResource(c, String(input.path), {
          tags: input.tags as string[] | undefined,
          uriScope: input.uriScope as string | undefined,
        });
        if (a === "list_skills") return await OpenViking.listSkills(c);
        if (a === "ingest") return await OpenViking.ingestResource(c, String(input.url), input.tags as string[] | undefined);
        if (a === "recall") return await OpenViking.recallContext(c, String(input.query), {
          scope: input.scope as "resources" | "memories" | "skills" | "all" | undefined,
          limit: Number(input.limit) || 8,
        });
        if (a === "persist_memory") return await OpenViking.persistSessionMemory(c, String(input.sessionId));
        break;

      case "qm":
        // qm — memoria vectorial local cuantizada (100% local, SQLite + sqlite-vec WASM/Node).
        if (a === "health") return await QM.runQmAction("health", c, input);
        if (a === "initialize") return await QM.runQmAction("initialize", c, input);
        if (a === "upsert") return await QM.runQmAction("upsert", c, input);
        if (a === "search") return await QM.runQmAction("search", c, input);
        if (a === "remove") return await QM.runQmAction("remove", c, input);
        if (a === "listCollections") return await QM.runQmAction("listCollections", c, input);
        if (a === "collectionStats") return await QM.runQmAction("collectionStats", c, input);
        if (a === "embedLocal") return await QM.runQmAction("embedLocal", c, input);
        if (a === "exportDb") return await QM.runQmAction("exportDb", c, input);
        if (a === "importDb") return await QM.runQmAction("importDb", c, input);
        break;

      case "agentharness":
        // AgentHarness — orquestación multi-agente (DAG, handoffs, tool-calling, shared memory).
        if (a === "health") return await AgentHarness.runAgentHarnessAction("health", c, input);
        if (a === "defineWorkflow") return await AgentHarness.runAgentHarnessAction("defineWorkflow", c, input);
        if (a === "launchWorkflow") return await AgentHarness.runAgentHarnessAction("launchWorkflow", c, input);
        if (a === "getRunStatus") return await AgentHarness.runAgentHarnessAction("getRunStatus", c, input);
        if (a === "cancelRun") return await AgentHarness.runAgentHarnessAction("cancelRun", c, input);
        if (a === "listWorkflows") return await AgentHarness.runAgentHarnessAction("listWorkflows", c, input);
        break;

      case "bonsai":
        // Bonsai — motor 1-bit & Ternary acelerado por GPU Metal (PrismML).
        if (a === "health") return await Bonsai.runBonsaiAction("health", c, input);
        if (a === "status") return await Bonsai.runBonsaiAction("status", c, input);
        if (a === "chat") return await Bonsai.runBonsaiAction("chat", c, input);
        if (a === "vision") return await Bonsai.runBonsaiAction("vision", c, input);
        if (a === "models") return await Bonsai.runBonsaiAction("models", c, input);
        if (a === "benchmark") return await Bonsai.runBonsaiAction("benchmark", c, input);
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
    const colocado = resolverEndpointServicio(id, SIN_OFERTAS, CONTEXTO_DEL_CONECTOR);
    const endpoint =
      (effective.endpoint && effective.endpoint.trim()) ||
      colocado.endpoint ||
      desc.defaultEndpoint ||
      "";
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
      case "trilium-etapi":
        return await desdeTrilium(async () => {
          const notas = await buscarNotas(c.endpoint ?? "", c.apiKey ?? "", "", pedirTrilium, 1);
          return { notas: notas.length };
        });
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
      case "openviking":
        return await OpenViking.healthCheck(c);
      case "qm":
        // qm — test de disponibilidad (sqlite3 + sqlite-vec en el entorno).
        return await QM.health(c);
      case "agentharness":
        // AgentHarness — test de disponibilidad (servidor local puerto 1984).
        return await AgentHarness.healthCheck(c);
      case "bonsai":
        // Bonsai — test de disponibilidad (servidor local puerto 8080).
        return await Bonsai.health(c);

      default:
        return { ok: false, error: `Sin prueba de salud para "${id}".` };
    }
  } catch (err: unknown) {
    return { ok: false, error: `Fallo en la prueba de "${id}": ${(err as Error)?.message || "error"}.` };
  }
}
