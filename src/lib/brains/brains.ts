"use client";

/**
 * Cerebros (Brains) — CRUD + ensamblado + selección por contexto sobre Supabase
 * (RLS por owner). Un "cerebro" es el contenedor maestro que empaqueta TODO el
 * contexto del usuario: memorias, baúles y folders, conexiones, sistemas de IA
 * (configs y adaptaciones a Astraura y Aurora), permisos, accesos, ficheros,
 * configuraciones, APIs, cuentas, fuentes y servidores. Un cerebro puede
 * conectarse a Higgsfield, a cualquier servicio de servidor online, o a un
 * servidor local configurado para actuar como cerebro en un equipo totalmente
 * funcional, online y sincronizado.
 *
 * Sigue el patrón de src/lib/storage/backends.ts y src/lib/aurora/personalities.ts.
 */

import { createClient } from "@/utils/supabase/client";
import { OSS_LIBRARY, type OssCategory } from "@/lib/oss-library";
import { withDefaultBrainSkills } from "@/lib/brain-skills/default-skills";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type BrainScope = "account" | "profile" | "group" | "page";

export type BrainServerKind =
  | "local"
  | "hostinger"
  | "starseed"
  | "own"
  | "vps"
  | "service"
  | "online"
  // Compat: tipos previos que aún usan plantillas/runtime existentes.
  | "higgsfield"
  | "runtime";

export interface BrainServer {
  id: string;
  kind: BrainServerKind | string;
  name: string;
  endpoint?: string;
  /** Nombre de la clave en la bóveda (secrets_vault). Nunca el valor en claro. */
  keyRef?: string;
  status?: string;
  notes?: string;
  /** Campos extra según el tipo (p.ej. syncthingFolderId, runtimeId). */
  [k: string]: unknown;
}

export interface BrainPermission {
  who: string;
  level: "lectura" | "escritura" | "admin" | string;
}

export interface BrainIncludes {
  vaults: string[];
  backends: string[];
  personalities: string[];
  runtimes: string[];
  tokens: string[];
  memories: string[];
  connections: string[];
  /** Vincular automáticamente TODO lo que exista en este alcance. */
  bindScope: boolean;
  /** Lista editable de permisos (a quién, qué nivel). */
  permissions: BrainPermission[] | Record<string, unknown>;
  /** Id del proveedor/config de IA que este cerebro usa para Astraura. */
  aiProvider?: string;
}

export interface Brain {
  id: string;
  owner?: string;
  name: string;
  scope: string;
  scope_ref: string | null;
  description: string;
  config: Record<string, unknown>;
  includes: BrainIncludes;
  servers: BrainServer[];
  created_at?: string;
  updated_at?: string;
}

export interface BrainSelection {
  owner?: string;
  context: string;
  context_ref: string | null;
  brain_id: string;
  server_ids: string[];
  updated_at?: string;
}

/* ------------------------------------------------------------------ */
/* Catálogo de tipos de servidor                                       */
/* ------------------------------------------------------------------ */

export interface ServerField {
  key: string;
  label: string;
}

export interface ServerKind {
  id: BrainServerKind;
  label: string;
  blurb: string;
  icon?: string;
  fields: ServerField[];
  /** ¿El tipo de servidor es de naturaleza open-source / autoalojable? */
  oss?: boolean;
}

export const SERVER_KINDS: ServerKind[] = [
  {
    id: "local",
    label: "Cerebro local (este equipo)",
    blurb:
      "Este equipo actúa como el ordenador online del cerebro: guarda y ejecuta sus datos y conexiones, sincronizado. Open-source (local_brain.py).",
    icon: "💻",
    oss: true,
    fields: [
      { key: "endpoint", label: "URL local (p.ej. http://localhost:8800)" },
      { key: "syncthingFolderId", label: "Folder Syncthing (opcional)" },
    ],
  },
  {
    id: "hostinger",
    label: "Hostinger (VPS/nube)",
    blurb:
      "VPS/nube de Hostinger con el servidor de cerebro open-source desplegado. Tus datos, tu control.",
    icon: "🟣",
    oss: true,
    fields: [
      { key: "endpoint", label: "Base URL/API (p.ej. http://TU_IP:8800)" },
      { key: "keyRef", label: "Clave (nombre en bóveda)" },
    ],
  },
  {
    id: "starseed",
    label: "Servidor StarSeed",
    blurb: "Servidor gestionado de la red StarSeed para tu cerebro.",
    icon: "✨",
    fields: [
      { key: "endpoint", label: "Base URL/API" },
      { key: "keyRef", label: "Clave (nombre en bóveda)" },
    ],
  },
  {
    id: "own",
    label: "Servidor propio configurado",
    blurb:
      "Un servidor propio que ya configuraste (con el contrato de cerebro). Lo más abierto posible.",
    icon: "🛠️",
    oss: true,
    fields: [
      { key: "endpoint", label: "Base URL/API" },
      { key: "keyRef", label: "Clave (nombre en bóveda)" },
    ],
  },
  {
    id: "vps",
    label: "VPS (otro)",
    blurb: "Otro VPS/nube (DigitalOcean, Hetzner, etc.) actuando como servidor del cerebro.",
    icon: "🖥️",
    oss: true,
    fields: [
      { key: "endpoint", label: "Base URL/API" },
      { key: "keyRef", label: "Clave (nombre en bóveda)" },
    ],
  },
  {
    id: "service",
    label: "Servicio conectado integrado",
    blurb:
      "Cualquier servicio ya conectado e integrado (conector directo, preferentemente open-source: Ollama, ComfyUI…).",
    icon: "🔌",
    oss: true,
    fields: [
      { key: "endpoint", label: "Base URL/API del servicio" },
      { key: "keyRef", label: "Clave (nombre en bóveda)" },
    ],
  },
  {
    id: "online",
    label: "Servidor online (cualquiera)",
    blurb: "Cualquier servicio de servidor online (API/endpoint propio).",
    icon: "🌐",
    fields: [
      { key: "endpoint", label: "Base URL/API" },
      { key: "keyRef", label: "Clave (nombre en bóveda)" },
    ],
  },
];

export function serverKindById(id: string): ServerKind | undefined {
  return SERVER_KINDS.find((k) => k.id === id);
}

/* ------------------------------------------------------------------ */
/* Servicios de generación (open-source PRIMERO; Higgsfield es UNA más) */
/* ------------------------------------------------------------------ */

export interface GenerationService {
  id: string;
  label: string;
  /** true = código abierto / autoalojable (preferido). */
  oss: boolean;
  blurb: string;
  /** Endpoint por defecto sugerido (cuando aplica). */
  defaultEndpoint?: string;
}

/**
 * Servicios para generar (texto, imagen, vídeo, audio…). La filosofía es
 * conectar DIRECTAMENTE a cada servicio, lo más OPEN-SOURCE posible. Higgsfield
 * es solo UNA opción (propietaria) entre las alternativas abiertas, no la
 * principal.
 */
export const GENERATION_SERVICES: GenerationService[] = [
  {
    id: "ollama",
    label: "Ollama",
    oss: true,
    blurb: "LLMs locales (texto/embeddings), privados y gratuitos.",
    defaultEndpoint: "http://localhost:11434",
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    oss: true,
    blurb: "Inferencia LLM local ultraligera vía su servidor HTTP.",
    defaultEndpoint: "http://localhost:8080",
  },
  {
    id: "comfyui",
    label: "ComfyUI",
    oss: true,
    blurb: "Imagen/vídeo por nodos (Stable Diffusion), 100% open-source.",
    defaultEndpoint: "http://localhost:8188",
  },
  {
    id: "sd_webui",
    label: "Stable Diffusion web UI",
    oss: true,
    blurb: "Generación de imágenes open-source (AUTOMATIC1111) con API REST.",
    defaultEndpoint: "http://localhost:7860",
  },
  {
    id: "replicate",
    label: "Replicate",
    oss: false,
    blurb: "Ejecuta modelos open-source en la nube (muchos pesos son abiertos).",
    defaultEndpoint: "https://api.replicate.com",
  },
  {
    id: "higgsfield",
    label: "Higgsfield (propietario · una opción más)",
    oss: false,
    blurb:
      "Servicio propietario de IA/render en la nube. Disponible como UNA opción; preferimos las alternativas open-source.",
    defaultEndpoint: "https://api.higgsfield.ai",
  },
];

export function generationServiceById(id: string): GenerationService | undefined {
  return GENERATION_SERVICES.find((g) => g.id === id);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function emptyIncludes(): BrainIncludes {
  return {
    vaults: [],
    backends: [],
    personalities: [],
    runtimes: [],
    tokens: [],
    memories: [],
    connections: [],
    bindScope: false,
    permissions: [],
    aiProvider: undefined,
  };
}

function normalizeIncludes(raw: unknown): BrainIncludes {
  const r = (raw || {}) as Partial<BrainIncludes>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return {
    vaults: arr(r.vaults),
    backends: arr(r.backends),
    personalities: arr(r.personalities),
    runtimes: arr(r.runtimes),
    tokens: arr(r.tokens),
    memories: arr(r.memories),
    connections: arr(r.connections),
    bindScope: !!r.bindScope,
    permissions: (r.permissions as BrainPermission[]) ?? [],
    aiProvider: (r.aiProvider as string) || undefined,
  };
}

function normalizeBrain(row: Record<string, unknown>): Brain {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "Cerebro",
    scope: (row.scope as string) || "account",
    scope_ref: (row.scope_ref as string) ?? null,
    description: (row.description as string) || "",
    config: ((row.config as Record<string, unknown>) || {}),
    includes: normalizeIncludes(row.includes),
    servers: Array.isArray(row.servers) ? (row.servers as BrainServer[]) : [],
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
  };
}

export function newServerId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* */
  }
  return `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* CRUD de cerebros                                                    */
/* ------------------------------------------------------------------ */

export async function listBrains(scope?: string, scopeRef?: string | null): Promise<Brain[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    let q = sb.from("brains").select("*").eq("owner", owner).order("updated_at", { ascending: false });
    if (scope) q = q.eq("scope", scope);
    if (scope && scope !== "account" && scopeRef) q = q.eq("scope_ref", scopeRef);
    const { data } = await q;
    return ((data as Record<string, unknown>[]) || []).map(normalizeBrain);
  } catch {
    return [];
  }
}

export async function getBrain(id: string): Promise<Brain | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb.from("brains").select("*").eq("owner", owner).eq("id", id).single();
    return data ? normalizeBrain(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Inserta o actualiza un cerebro. Devuelve la fila guardada (o null). */
export async function saveBrain(brain: Partial<Brain>): Promise<Brain | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload: Record<string, unknown> = {
      owner,
      name: brain.name || "Cerebro",
      scope: brain.scope || "account",
      scope_ref: brain.scope && brain.scope !== "account" ? brain.scope_ref ?? null : null,
      description: brain.description ?? "",
      config: brain.config ?? {},
      includes: brain.includes ? normalizeIncludes(brain.includes) : emptyIncludes(),
      servers: Array.isArray(brain.servers) ? brain.servers : [],
      updated_at: new Date().toISOString(),
    };
    if (brain.id) payload.id = brain.id;
    const { data } = await sb.from("brains").upsert(payload).select("*").single();
    return data ? normalizeBrain(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function deleteBrain(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("brain_selections").delete().eq("owner", owner).eq("brain_id", id);
    await sb.from("brains").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

export async function duplicateBrain(brain: Brain): Promise<Brain | null> {
  return saveBrain({
    name: `${brain.name} (copia)`,
    scope: brain.scope,
    scope_ref: brain.scope_ref,
    description: brain.description,
    config: brain.config,
    includes: brain.includes,
    // Regenera IDs de servidor para que no colisionen entre copias.
    servers: (brain.servers || []).map((s) => ({ ...s, id: newServerId() })),
  });
}

/* ------------------------------------------------------------------ */
/* Servidores (operan sobre brains.servers jsonb)                      */
/* ------------------------------------------------------------------ */

export async function addServer(brain: Brain, server: Partial<BrainServer>): Promise<Brain | null> {
  const next: BrainServer = {
    id: server.id || newServerId(),
    kind: server.kind || "online",
    name: server.name || serverKindById(String(server.kind))?.label || "Servidor",
    endpoint: server.endpoint,
    keyRef: server.keyRef,
    status: server.status || "pendiente",
    notes: server.notes,
    ...server,
  };
  next.id = server.id || next.id;
  const servers = [...(brain.servers || []), next];
  return saveBrain({ ...brain, servers });
}

export async function removeServer(brain: Brain, serverId: string): Promise<Brain | null> {
  const servers = (brain.servers || []).filter((s) => s.id !== serverId);
  return saveBrain({ ...brain, servers });
}

export async function updateServer(
  brain: Brain,
  serverId: string,
  patch: Partial<BrainServer>,
): Promise<Brain | null> {
  const servers = (brain.servers || []).map((s) => (s.id === serverId ? { ...s, ...patch, id: s.id } : s));
  return saveBrain({ ...brain, servers });
}

/* ------------------------------------------------------------------ */
/* Selección por contexto (brain_selections)                           */
/* ------------------------------------------------------------------ */

export async function selectBrainForContext(
  context: string,
  contextRef: string | null,
  brainId: string,
  serverIds: string[],
): Promise<BrainSelection | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      context,
      context_ref: contextRef ?? "",
      brain_id: brainId,
      server_ids: serverIds ?? [],
      updated_at: new Date().toISOString(),
    };
    const { data } = await sb
      .from("brain_selections")
      .upsert(payload, { onConflict: "owner,context,context_ref" })
      .select("*")
      .single();
    if (!data) return null;
    const d = data as Record<string, unknown>;
    return {
      owner: d.owner as string,
      context: d.context as string,
      context_ref: (d.context_ref as string) ?? null,
      brain_id: d.brain_id as string,
      server_ids: Array.isArray(d.server_ids) ? (d.server_ids as string[]) : [],
      updated_at: d.updated_at as string,
    };
  } catch {
    return null;
  }
}

export async function getSelection(context: string, contextRef: string | null): Promise<BrainSelection | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("brain_selections")
      .select("*")
      .eq("owner", owner)
      .eq("context", context)
      .eq("context_ref", contextRef ?? "")
      .maybeSingle();
    if (!data) return null;
    const d = data as Record<string, unknown>;
    return {
      context: d.context as string,
      context_ref: (d.context_ref as string) ?? null,
      brain_id: d.brain_id as string,
      server_ids: Array.isArray(d.server_ids) ? (d.server_ids as string[]) : [],
      updated_at: d.updated_at as string,
    };
  } catch {
    return null;
  }
}

export async function listSelections(): Promise<BrainSelection[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("brain_selections")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map((d) => ({
      context: d.context as string,
      context_ref: (d.context_ref as string) ?? null,
      brain_id: d.brain_id as string,
      server_ids: Array.isArray(d.server_ids) ? (d.server_ids as string[]) : [],
      updated_at: d.updated_at as string,
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Catálogo de subsistemas (para poblar los multi-selects)             */
/* ------------------------------------------------------------------ */

export interface NamedRef {
  id: string;
  name: string;
  meta?: string;
}

/** Lee de forma defensiva una tabla owner-scoped y devuelve {id,name,meta}. */
async function listNamed(
  table: string,
  nameCol: string,
  metaCol?: string,
): Promise<NamedRef[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data, error } = await sb.from(table).select("*").eq("owner", owner);
    if (error) return [];
    return ((data as Record<string, unknown>[]) || []).map((r) => ({
      id: String(r.id ?? r[nameCol] ?? ""),
      name: String(r[nameCol] ?? r.name ?? "(sin nombre)"),
      meta: metaCol ? (r[metaCol] != null ? String(r[metaCol]) : undefined) : undefined,
    }));
  } catch {
    return [];
  }
}

export interface BrainCatalog {
  vaults: NamedRef[];
  backends: NamedRef[];
  personalities: NamedRef[];
  runtimes: NamedRef[];
  tokens: NamedRef[];
  memories: NamedRef[];
}

/** Carga todos los subsistemas que un cerebro puede empaquetar. */
export async function loadBrainCatalog(): Promise<BrainCatalog> {
  const [vaults, backends, personalities, runtimes, tokens, memories] = await Promise.all([
    listNamed("vaults", "name", "scope"),
    listNamed("storage_backends", "name", "kind"),
    listNamed("aurora_personalities", "name"),
    listNamed("agent_runtimes", "name", "mode"),
    listNamed("provider_tokens", "label", "scope"),
    listNamed("memories", "name", "vault_id"),
  ]);
  return { vaults, backends, personalities, runtimes, tokens, memories };
}

/* ------------------------------------------------------------------ */
/* Ensamblado / Export / Import                                        */
/* ------------------------------------------------------------------ */

export interface BrainBundle {
  starseedBrain: 1;
  exportedAt: string;
  brain: {
    name: string;
    scope: string;
    description: string;
    config: Record<string, unknown>;
    bindScope: boolean;
    permissions: unknown;
    aiProvider?: string;
    servers: BrainServer[];
  };
  contents: {
    vaults: string[];
    backends: string[];
    personalities: string[];
    runtimes: string[];
    tokens: string[];
    memories: string[];
    connections: string[];
  };
}

/**
 * Reúne las filas referenciadas (nombres de baúles/almacenes/personalidad/
 * runtimes, ETIQUETAS de tokens — NUNCA valores secretos, id de proveedor de IA)
 * en un objeto JSON portable para exportar (.brain.json).
 */
export async function assembleBrainBundle(brainId: string): Promise<BrainBundle | null> {
  const brain = await getBrain(brainId);
  if (!brain) return null;
  const cat = await loadBrainCatalog();
  const inc = brain.includes;

  const nameOf = (refs: NamedRef[], ids: string[]) =>
    ids.map((id) => refs.find((r) => r.id === id)?.name ?? id);

  return {
    starseedBrain: 1,
    exportedAt: new Date().toISOString(),
    brain: {
      name: brain.name,
      scope: brain.scope,
      description: brain.description,
      config: brain.config,
      bindScope: inc.bindScope,
      permissions: inc.permissions,
      aiProvider: inc.aiProvider,
      // Servidores sin claves en claro: sólo keyRef (nombre en bóveda).
      servers: (brain.servers || []).map((s) => ({ ...s, keyRef: s.keyRef })),
    },
    contents: {
      vaults: nameOf(cat.vaults, inc.vaults),
      backends: nameOf(cat.backends, inc.backends),
      personalities: nameOf(cat.personalities, inc.personalities),
      runtimes: nameOf(cat.runtimes, inc.runtimes),
      tokens: nameOf(cat.tokens, inc.tokens),
      memories: nameOf(cat.memories, inc.memories),
      connections: inc.connections,
    },
  };
}

/**
 * Crea un nuevo cerebro a partir de un bundle exportado. Re-vincula por nombre
 * cuando es posible; si no encuentra el subsistema, conserva el nombre como
 * metadato en config.unlinked para no perder información.
 */
export async function importBrainBundle(json: unknown): Promise<Brain | null> {
  try {
    const bundle = (typeof json === "string" ? JSON.parse(json) : json) as Partial<BrainBundle>;
    const b = bundle?.brain;
    if (!b) return null;
    const cat = await loadBrainCatalog();

    const linkByName = (refs: NamedRef[], names: string[] = []) => {
      const linked: string[] = [];
      const unlinked: string[] = [];
      for (const n of names) {
        const hit = refs.find((r) => r.name === n);
        if (hit) linked.push(hit.id);
        else unlinked.push(n);
      }
      return { linked, unlinked };
    };

    const c = bundle.contents || ({} as BrainBundle["contents"]);
    const v = linkByName(cat.vaults, c.vaults);
    const bk = linkByName(cat.backends, c.backends);
    const p = linkByName(cat.personalities, c.personalities);
    const rt = linkByName(cat.runtimes, c.runtimes);
    const tk = linkByName(cat.tokens, c.tokens);
    const mm = linkByName(cat.memories, c.memories);

    return saveBrain({
      name: b.name || "Cerebro importado",
      scope: b.scope || "account",
      scope_ref: null,
      description: b.description || "",
      config: {
        ...(b.config || {}),
        imported: true,
        unlinked: {
          vaults: v.unlinked,
          backends: bk.unlinked,
          personalities: p.unlinked,
          runtimes: rt.unlinked,
          tokens: tk.unlinked,
          memories: mm.unlinked,
        },
      },
      includes: {
        vaults: v.linked,
        backends: bk.linked,
        personalities: p.linked,
        runtimes: rt.linked,
        tokens: tk.linked,
        memories: mm.linked,
        connections: c.connections || [],
        bindScope: !!b.bindScope,
        permissions: (b.permissions as BrainPermission[]) || [],
        aiProvider: b.aiProvider,
      },
      servers: Array.isArray(b.servers) ? b.servers.map((s) => ({ ...s, id: newServerId() })) : [],
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Plantillas                                                          */
/* ------------------------------------------------------------------ */

export interface BrainTemplate {
  id: string;
  name: string;
  description: string;
  scope: BrainScope;
  bindScope: boolean;
  servers: Partial<BrainServer>[];
}

export const BRAIN_TEMPLATES: BrainTemplate[] = [
  {
    id: "personal",
    name: "Cerebro Personal",
    description:
      "Empaqueta todo tu contexto de cuenta: memorias, baúles, conexiones e IA. Vincula automáticamente el alcance de cuenta.",
    scope: "account",
    bindScope: true,
    servers: [],
  },
  {
    id: "grupo",
    name: "Cerebro de Grupo",
    description:
      "Contexto compartido para un grupo: baúles, permisos y servidores del grupo. Pensado para colaborar.",
    scope: "group",
    bindScope: false,
    servers: [],
  },
  {
    id: "creativo",
    name: "Cerebro Creativo (Higgsfield)",
    description:
      "Orientado a creación y render: incluye un servidor Higgsfield preconfigurado para IA/render en la nube.",
    scope: "account",
    bindScope: false,
    servers: [
      {
        kind: "higgsfield",
        name: "Higgsfield",
        endpoint: "https://api.higgsfield.ai",
        keyRef: "higgsfield",
        status: "pendiente",
      },
    ],
  },
];

/** Construye un Brain (sin persistir) a partir de una plantilla. */
export function brainFromTemplate(t: BrainTemplate): Partial<Brain> {
  return {
    name: t.name,
    scope: t.scope,
    scope_ref: null,
    description: t.description,
    config: { template: t.id },
    includes: { ...emptyIncludes(), bindScope: t.bindScope },
    servers: (t.servers || []).map((s) => ({
      id: newServerId(),
      kind: s.kind || "online",
      name: s.name || serverKindById(String(s.kind))?.label || "Servidor",
      endpoint: s.endpoint,
      keyRef: s.keyRef,
      status: s.status || "pendiente",
      notes: s.notes,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Configuración por defecto StarSeed (catálogo OSS + orígenes)         */
/* ------------------------------------------------------------------ */

/**
 * Orígenes posibles para servidores y almacenamiento de un cerebro. Por defecto
 * se usa StarSeed (gestionado por la red); también puede ser local (este equipo)
 * o externo (endpoint/config propios). Convención compartida por los selectores
 * de la UI y por la siembra de cerebros por defecto.
 */
export type BrainSourceOrigin = "local" | "starseed" | "external";

/**
 * Devuelve los ids de opciones del catálogo OSS marcadas como
 * `defaultIntegrated` (las que el sistema habilita por defecto) para una
 * categoría. Lectura pura sobre `OSS_LIBRARY`; nunca lanza.
 */
export function getDefaultIntegratedIds(category: OssCategory): string[] {
  try {
    return OSS_LIBRARY.filter((o) => o.category === category && o.defaultIntegrated === true).map(
      (o) => o.id,
    );
  } catch {
    return [];
  }
}

/**
 * Forma de la selección por cerebro que persiste la UI del editor en las claves
 * `starseed.brain.<id>.{apps,runtimes,servers,storage}`. `source` sólo aplica a
 * servers/storage (local/StarSeed/externo). Compatible hacia atrás: cualquier
 * campo ausente se trata como vacío / valor por defecto.
 */
export interface BrainOssSelection {
  /** Ids del catálogo OSS activados (por categoría agrupada). */
  ids: string[];
  /** Origen del recurso (sólo servers/storage). */
  source?: BrainSourceOrigin;
  /** Endpoint/config para origen externo (sólo servers/storage). */
  endpoint?: string;
}

/** Claves localStorage por cerebro para las nuevas secciones del catálogo. */
export function brainAppsKey(brainId: string): string {
  return `starseed.brain.${brainId}.apps`;
}
export function brainRuntimesKey(brainId: string): string {
  return `starseed.brain.${brainId}.runtimes`;
}
export function brainServersCfgKey(brainId: string): string {
  return `starseed.brain.${brainId}.servers`;
}
export function brainStorageKey(brainId: string): string {
  return `starseed.brain.${brainId}.storage`;
}
/** Clave por cerebro con los ids de skills instaladas (vista previa local). */
export function brainSkillsKey(brainId: string): string {
  return `starseed.brain.${brainId}.skills`;
}

/**
 * Construye la configuración StarSeed POR DEFECTO de un cerebro: opciones nativas
 * de StarSeed preseleccionadas y todas las opciones `defaultIntegrated` del
 * catálogo activadas. Servidor y almacenamiento usan el origen StarSeed.
 *
 * - apps:     `moa` + `agent-framework` + `app-platform` + `automation`
 * - runtimes: `runtime`
 * - servers:  `devops` (origen StarSeed)
 * - storage:  `storage` + `backend` (origen StarSeed)
 */
export function defaultBrainSelections(): {
  apps: BrainOssSelection;
  runtimes: BrainOssSelection;
  servers: BrainOssSelection;
  storage: BrainOssSelection;
} {
  const dedup = (xs: string[]) => Array.from(new Set(xs));
  return {
    apps: {
      ids: dedup([
        ...getDefaultIntegratedIds("moa"),
        ...getDefaultIntegratedIds("agent-framework"),
        ...getDefaultIntegratedIds("app-platform"),
        ...getDefaultIntegratedIds("automation"),
      ]),
    },
    runtimes: { ids: dedup([...getDefaultIntegratedIds("runtime")]) },
    servers: { ids: dedup([...getDefaultIntegratedIds("devops")]), source: "starseed" },
    storage: {
      ids: dedup([...getDefaultIntegratedIds("storage"), ...getDefaultIntegratedIds("backend")]),
      source: "starseed",
    },
  };
}

/**
 * Siembra (sólo si faltan) las claves localStorage por cerebro con la config
 * StarSeed por defecto + las skills por defecto. Defensiva y NO destructiva:
 * nunca sobrescribe una clave ya existente, va con guardas `typeof window` y
 * try/catch, y nunca lanza. Útil al crear un cerebro nuevo.
 */
export function seedBrainDefaults(brainId: string): void {
  if (typeof window === "undefined" || !brainId) return;
  const setIfAbsent = (key: string, value: unknown) => {
    try {
      if (window.localStorage.getItem(key) == null) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      /* cuota / modo privado: degradamos en silencio */
    }
  };
  try {
    const sel = defaultBrainSelections();
    setIfAbsent(brainAppsKey(brainId), sel.apps);
    setIfAbsent(brainRuntimesKey(brainId), sel.runtimes);
    setIfAbsent(brainServersCfgKey(brainId), sel.servers);
    setIfAbsent(brainStorageKey(brainId), sel.storage);
    // Skills por defecto (incluye "starseed-auto-update").
    setIfAbsent(brainSkillsKey(brainId), withDefaultBrainSkills([]));
  } catch {
    /* no-op defensivo */
  }
}

/* ------------------------------------------------------------------ */
/* Cerebro StarSeed por defecto (auto-creación en alta de cuenta)       */
/* ------------------------------------------------------------------ */

let ensureDefaultBrainPromise: Promise<Brain | null> | null = null;

/**
 * Crea de forma DEFENSIVA un cerebro StarSeed por defecto si el usuario aún no
 * tiene ninguno. No bloquea el login: cualquier fallo se traga (try/catch),
 * es no-op si ya existe algún cerebro o si no hay sesión, y siembra las claves
 * localStorage por defecto (selecciones del catálogo + skills) para el cerebro
 * recién creado. Devuelve el cerebro creado, el primero existente, o null.
 */
export function ensureDefaultBrain(): Promise<Brain | null> {
  if (ensureDefaultBrainPromise) return ensureDefaultBrainPromise;

  ensureDefaultBrainPromise = (async () => {
    try {
      const owner = await uid();
      if (!owner) return null;
      const existing = await listBrains();
      if (existing.length > 0) {
        // Ya tiene cerebros: no creamos nada (idempotente).
        return existing[0] ?? null;
      }
      // El servidor StarSeed gestionado como ancla del cerebro por defecto.
    const starseedServer: BrainServer = {
      id: newServerId(),
      kind: "starseed",
      name: serverKindById("starseed")?.label || "Servidor StarSeed",
      status: "pendiente",
    };
    const created = await saveBrain({
      name: "Cerebro StarSeed",
      scope: "account",
      scope_ref: null,
      description:
        "Cerebro por defecto de StarSeed: empaqueta tu contexto de cuenta con los servicios nativos de la red y el catálogo integrado por defecto.",
      config: { template: "starseed-default", starseedDefault: true },
      includes: { ...emptyIncludes(), bindScope: true },
      servers: [starseedServer],
    });
    if (created?.id) {
      // Siembra selecciones por defecto + skills (incl. starseed-auto-update).
      seedBrainDefaults(created.id);
    }
    return created;
  } catch {
    // Nunca bloquea el alta/login.
    return null;
  }
  })();
  return ensureDefaultBrainPromise;
}
