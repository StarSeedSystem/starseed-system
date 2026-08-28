// ════════════════════════════════════════════════════════════════
// OpenViking client para Aurora tools
// ------------------------------------------------------------...
// Cablea la API OpenViking (HTTP) como herramientas invocables por Aurora.
// ────────────────────────────────────────────────────────────────
import type { OpenVikingConfig } from "../../../ai/astraura/integrations/openviking";
import {
  ls,
  tree,
  stat,
  mkdir,
  mv,
  remove,
  readContent,
  readAbstract,
  readOverview,
  semanticSearch,
  find,
  grep,
  glob,
  createSession,
  addSessionMessages,
  getSessionContext,
  commitSession,
  extractMemory,
  addResource,
  listSkills,
  ingestResource,
  recallContext,
  persistSessionMemory,
  healthCheck,
} from "../../../ai/astraura/integrations/openviking";

/** Re-export para runIntegration (registry) */
export {
  ls,
  tree,
  stat,
  mkdir,
  mv,
  remove,
  readContent,
  readAbstract,
  readOverview,
  semanticSearch,
  find,
  grep,
  glob,
  createSession,
  addSessionMessages,
  getSessionContext,
  commitSession,
  extractMemory,
  addResource,
  listSkills,
  ingestResource,
  recallContext,
  persistSessionMemory,
  healthCheck,
};

/** Carga config desde registry + env/user settings. */
export function loadOpenVikingConfig(): OpenVikingConfig {
  return {
    baseUrl: process.env.OPENVIKING_URL || "http://localhost:1933",
    apiKey: process.env.OPENVIKING_API_KEY || "",
    agentId: process.env.OPENVIKING_AGENT_ID || "aurora",
    timeoutMs: 30000,
    enabled: true,
  };
}

/* ────────────────────────────────────────────────────────────────
   WRAPPERS tipados para runIntegration (registry)
   ──────────────────────────────────────────────────────────────── */

export async function runVikingAction(
  action: string,
  config: OpenVikingConfig,
  input: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const cfg: OpenVikingConfig = { ...loadOpenVikingConfig(), ...config };

  try {
    switch (action) {
      case "health":
        return await healthCheck(cfg);

      // ── Filesystem
      case "ls":
        return await ls(cfg, String(input.uri || "viking://resources/"));
      case "tree":
        return await tree(cfg, String(input.uri || "viking://resources/"), Number(input.depth) || 3);
      case "stat":
        return await stat(cfg, String(input.uri));
      case "mkdir":
        return await mkdir(cfg, String(input.uri));
      case "mv":
        return await mv(cfg, String(input.fromUri), String(input.toUri));
      case "remove":
        return await remove(cfg, String(input.uri));

      // ── Content (L0/L1/L2)
      case "read":
        return await readContent(cfg, String(input.uri));
      case "abstract":
        return await readAbstract(cfg, String(input.uri));
      case "overview":
        return await readOverview(cfg, String(input.uri));

      // ── Search
      case "search":
        return await semanticSearch(cfg, String(input.query), {
          limit: Number(input.limit) || 10,
          uriScope: input.uriScope as string | undefined,
          mode: (input.mode as "context" | "chunks") || "context",
        });
      case "find":
        return await find(cfg, String(input.query), Number(input.limit) || 10);
      case "grep":
        return await grep(cfg, String(input.pattern), input.uriScope as string | undefined);
      case "glob":
        return await glob(cfg, String(input.pattern), input.uriScope as string | undefined);

      // ── Sessions & Memory
      case "create_session":
        return await createSession(cfg, input.agentId as string | undefined);
      case "add_messages":
        return await addSessionMessages(
          cfg,
          String(input.sessionId),
          input.messages as Array<{ role: "user" | "assistant" | "system"; content: string }>
        );
      case "get_context":
        return await getSessionContext(cfg, String(input.sessionId));
      case "commit_session":
        return await commitSession(cfg, String(input.sessionId));
      case "extract_memory":
        return await extractMemory(cfg, String(input.sessionId));

      // ── Resources & Skills
      case "add_resource":
        return await addResource(cfg, String(input.path), {
          tags: input.tags as string[] | undefined,
          uriScope: input.uriScope as string | undefined,
        });
      case "list_skills":
        return await listSkills(cfg);

      // ── High-level (Aurora/exocortex)
      case "ingest":
        return await ingestResource(cfg, String(input.url), input.tags as string[] | undefined);
      case "recall":
        return await recallContext(cfg, String(input.query), {
          scope: input.scope as "resources" | "memories" | "skills" | "all" | undefined,
          limit: Number(input.limit) || 8,
        });
      case "persist_memory":
        return await persistSessionMemory(cfg, String(input.sessionId));

      default:
        return { ok: false, error: `OpenViking: acción desconocida "${action}"` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenViking action failed" };
  }
}

/* ────────────────────────────────────────────────────────────────
   EXPORTS for aurora-tools.ts (tools invocables)
   ──────────────────────────────────────────────────────────────── */

export const openvikingTools = {
  // Filesystem
  viking_ls: {
    name: "viking_ls",
    description: "Lista un directorio viking:// (ej: viking://resources/, viking://user/memories/)",
    params: { uri: { type: "string", default: "viking://resources/" } },
  },
  viking_tree: {
    name: "viking_tree",
    description: "Árbol de directorio recursivo viking://",
    params: { uri: { type: "string", default: "viking://resources/" }, depth: { type: "number", default: 3 } },
  },
  viking_stat: {
    name: "viking_stat",
    description: "Metadatos de un recurso viking://",
    params: { uri: { type: "string" } },
  },
  viking_mkdir: {
    name: "viking_mkdir",
    description: "Crea un directorio viking://",
    params: { uri: { type: "string" } },
  },
  viking_mv: {
    name: "viking_mv",
    description: "Mueve/renombra recurso viking://",
    params: { fromUri: { type: "string" }, toUri: { type: "string" } },
  },
  viking_remove: {
    name: "viking_remove",
    description: "Elimina recurso viking://",
    params: { uri: { type: "string" } },
  },

  // Content
  viking_read: {
    name: "viking_read",
    description: "Lee contenido completo L2 de recurso viking://",
    params: { uri: { type: "string" } },
  },
  viking_abstract: {
    name: "viking_abstract",
    description: "Lee abstracto L0 de recurso viking://",
    params: { uri: { type: "string" } },
  },
  viking_overview: {
    name: "viking_overview",
    description: "Lee overview L1 de recurso viking://",
    params: { uri: { type: "string" } },
  },

  // Search
  viking_search: {
    name: "viking_search",
    description: "Búsqueda semántica context-aware (inyectable en prompt Aurora)",
    params: {
      query: { type: "string" },
      limit: { type: "number", default: 10 },
      uriScope: { type: "string", optional: true },
      mode: { type: "string", enum: ["context", "chunks"], default: "context" },
    },
  },
  viking_find: {
    name: "viking_find",
    description: "Búsqueda semántica simple",
    params: { query: { type: "string" }, limit: { type: "number", default: 10 } },
  },
  viking_grep: {
    name: "viking_grep",
    description: "Grep patrón en contenido viking://",
    params: { pattern: { type: "string" }, uriScope: { type: "string", optional: true } },
  },
  viking_glob: {
    name: "viking_glob",
    description: "Glob patrón de archivo viking://",
    params: { pattern: { type: "string" }, uriScope: { type: "string", optional: true } },
  },

  // Sessions & Memory
  viking_create_session: {
    name: "viking_create_session",
    description: "Crea sesión de agente para extracción de memoria",
    params: { agentId: { type: "string", optional: true } },
  },
  viking_add_messages: {
    name: "viking_add_messages",
    description: "Añade mensajes a sesión",
    params: { sessionId: { type: "string" }, messages: { type: "array" } },
  },
  viking_get_context: {
    name: "viking_get_context",
    description: "Contexto ensamblado listo para inyectar en prompt",
    params: { sessionId: { type: "string" } },
  },
  viking_commit_session: {
    name: "viking_commit_session",
    description: "Archiva sesión y extrae memoria (6 categorías: profile, preferences, entities, events, cases, patterns)",
    params: { sessionId: { type: "string" } },
  },
  viking_extract_memory: {
    name: "viking_extract_memory",
    description: "Extrae memoria sin archivar sesión",
    params: { sessionId: { type: "string" } },
  },

  // Resources
  viking_add_resource: {
    name: "viking_add_resource",
    description: "Ingiere URL/archivo al contexto del agente",
    params: { path: { type: "string" }, tags: { type: "array", optional: true }, uriScope: { type: "string", optional: true } },
  },
  viking_list_skills: {
    name: "viking_list_skills",
    description: "Lista skills del agente en OpenViking",
    params: {},
  },

  // High-level Aurora helpers
  viking_ingest: {
    name: "viking_ingest",
    description: "Ingiere URL externa al contexto del agente (viking://resources/) con tags",
    params: { url: { type: "string" }, tags: { type: "array", optional: true } },
  },
  viking_recall: {
    name: "viking_recall",
    description: "Recupera contexto relevante para query (inyectable en prompt Aurora/exocortex)",
    params: {
      query: { type: "string" },
      scope: { type: "string", enum: ["resources", "memories", "skills", "all"], default: "all" },
      limit: { type: "number", default: 8 },
    },
  },
  viking_persist_memory: {
    name: "viking_persist_memory",
    description: "Persiste memoria de sesión actual al exocortex (commit + extracción)",
    params: { sessionId: { type: "string" } },
  },
} as const;