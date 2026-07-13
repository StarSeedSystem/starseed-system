"use client";

/**
 * Cerebros — Registro de servidores N:N (brain_servers) + enlaces (brain_server_links).
 *
 * Un "servidor de cerebro" es el ordenador online del cerebro: el lugar donde
 * viven (o se ejecutan/sincronizan) TODOS sus datos y conexiones. Las opciones
 * son, de la más abierta a la más específica:
 *   - cerebro local (este equipo),
 *   - Hostinger (VPS/nube),
 *   - servidor StarSeed,
 *   - servidor propio configurado,
 *   - VPS (otro),
 *   - servicio conectado integrado (cualquier servicio ya conectado),
 *   - servidor online (cualquiera).
 *
 * Filosofía OPEN-SOURCE primero: preferimos conectar directamente a cada
 * servicio con conectores de código abierto (Ollama, llama.cpp, ComfyUI, vLLM,
 * el propio servidor de cerebro StarSeed local_brain.py…). Los servicios
 * propietarios (p.ej. Higgsfield) son UNA opción más, no la principal.
 *
 * Relación MUCHOS-A-MUCHOS: un servidor puede dar servicio a varios cerebros y
 * un cerebro puede usar varios servidores (con rol, prioridad y dirección de
 * sincronización). El registro es la tabla `brain_servers`; los enlaces, la
 * tabla `brain_server_links` (PK brain_id+server_id).
 *
 * Sigue EXACTAMENTE los patrones de src/lib/brains/brains.ts (supabase client,
 * owner-scoped, try/catch defensivo, normalizadores).
 */

import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Estado operativo de un servidor del registro. */
export type ServerStatus = "pendiente" | "conectado" | "error" | "pausado" | string;

/** Rol con el que un servidor sirve a un cerebro. */
export type LinkRole = "primary" | "replica" | "compute" | "storage" | "sync" | string;

/** Dirección de sincronización de un enlace. */
export type SyncDirection = "push" | "pull" | "both" | "none" | string;

export interface LinkSync {
  /** Dirección de sincronización. */
  direction?: SyncDirection;
  /** Sincronización automática activada. */
  auto?: boolean;
  /** Campos extra (intervalo, folder, etc.). */
  [k: string]: unknown;
}

/** Fila del registro `brain_servers` (servidor reutilizable, N:N con cerebros). */
export interface RegistryServer {
  id: string;
  owner?: string;
  name: string;
  /** Uno de SERVER_KINDS (local/hostinger/starseed/own/vps/service/online). */
  kind: string;
  endpoint?: string;
  /** Nombre de la clave en la bóveda (secrets_vault). Nunca el valor en claro. */
  keyRef?: string;
  /** Config libre por tipo de servidor (puerto, conector OSS, notas, etc.). */
  config: Record<string, unknown>;
  status?: ServerStatus;
  /** ¿Compartido con otros (lectura)? */
  shared: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Fila de enlace `brain_server_links` (cerebro ↔ servidor del registro). */
export interface ServerLink {
  brain_id: string;
  server_id: string;
  owner?: string;
  role: LinkRole;
  priority: number;
  sync: LinkSync;
  created_at?: string;
}

/** Servidor del registro + metadatos del enlace (para serversForBrain). */
export interface LinkedServer extends RegistryServer {
  link: { role: LinkRole; priority: number; sync: LinkSync };
}

/* ------------------------------------------------------------------ */
/* Catálogo de roles (para los selectores de la UI)                    */
/* ------------------------------------------------------------------ */

export const LINK_ROLES: { id: LinkRole; label: string; blurb: string }[] = [
  { id: "primary", label: "Primario", blurb: "Servidor principal del cerebro." },
  { id: "replica", label: "Réplica", blurb: "Copia sincronizada / respaldo." },
  { id: "compute", label: "Cómputo", blurb: "Solo ejecución (IA/render), sin datos." },
  { id: "storage", label: "Almacenamiento", blurb: "Solo guarda datos / bundles." },
  { id: "sync", label: "Sincronización", blurb: "Mantiene sincronizados otros nodos." },
];

export const SYNC_DIRECTIONS: { id: SyncDirection; label: string }[] = [
  { id: "both", label: "Bidireccional" },
  { id: "push", label: "Subir (push)" },
  { id: "pull", label: "Bajar (pull)" },
  { id: "none", label: "Sin sincronizar" },
];

export function linkRoleById(id: string) {
  return LINK_ROLES.find((r) => r.id === id);
}

/* ------------------------------------------------------------------ */
/* Conectores OPEN-SOURCE (catálogo de presets)                        */
/* ------------------------------------------------------------------ */

export interface OssConnector {
  id: string;
  label: string;
  blurb: string;
  /** Tipo de servidor (SERVER_KINDS) que mejor encaja por defecto. */
  kind: string;
  /** Puerto por defecto del servicio open-source. */
  defaultPort?: number;
  /** Ruta/contrato del endpoint principal. */
  contract: string;
  /** Siempre código abierto en este catálogo. */
  oss: boolean;
}

/**
 * Conectores de servidor/cómputo de código abierto. Preferidos frente a
 * cualquier servicio propietario. La idea es conectar DIRECTAMENTE a cada
 * servicio, lo más open-source posible.
 */
export const OSS_CONNECTORS: OssConnector[] = [
  {
    id: "starseed_brain",
    label: "Servidor de cerebro StarSeed (local_brain.py)",
    blurb:
      "Servidor de referencia, sin dependencias (Python 3). Implementa el contrato /health · /run · /sync. Ideal para 'cerebro local' o Hostinger.",
    kind: "local",
    defaultPort: 8800,
    contract: "/health · /run · /sync",
    oss: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    blurb: "Modelos LLM locales (open-source). Genera texto/embed con privacidad total.",
    kind: "service",
    defaultPort: 11434,
    contract: "/api/generate · /api/chat · /api/embeddings",
    oss: true,
  },
  {
    id: "llamacpp",
    label: "llama.cpp (server)",
    blurb: "Servidor HTTP de llama.cpp para inferencia local muy ligera.",
    kind: "service",
    defaultPort: 8080,
    contract: "/completion · /v1/chat/completions",
    oss: true,
  },
  {
    id: "vllm",
    label: "vLLM",
    blurb: "Motor de inferencia LLM de alto rendimiento, API compatible con OpenAI.",
    kind: "service",
    defaultPort: 8000,
    contract: "/v1/chat/completions · /v1/completions",
    oss: true,
  },
  {
    id: "comfyui",
    label: "ComfyUI",
    blurb: "Pipelines de imagen/vídeo por nodos (Stable Diffusion). 100% open-source.",
    kind: "service",
    defaultPort: 8188,
    contract: "/prompt · /history · /view",
    oss: true,
  },
  {
    id: "sd_webui",
    label: "Stable Diffusion web UI (AUTOMATIC1111)",
    blurb: "Generación de imágenes open-source con API REST.",
    kind: "service",
    defaultPort: 7860,
    contract: "/sdapi/v1/txt2img · /sdapi/v1/img2img",
    oss: true,
  },
  {
    id: "open_webui",
    label: "Open WebUI",
    blurb: "Interfaz de chat self-hosted para tus cerebros locales (Ollama/OpenAI-compatible, con RAG integrado).",
    kind: "service",
    defaultPort: 3000,
    contract: "/api/chat/completions · /api/models",
    oss: true,
  },
  {
    id: "casaos",
    label: "CasaOS (servidor casero de una neurona)",
    blurb:
      "Nube personal open-source (Go + Docker) instalada EN una neurona: panel web + App Store. Sirve al cerebro como almacén de memorias (Files/Nextcloud/Syncthing) y host de motores IA locales (Ollama/OpenLLM). Se declara en Cerebro → Neuronas.",
    kind: "service",
    defaultPort: 80,
    contract: "panel web :80 · apps Docker (Files · Nextcloud · Ollama…)",
    oss: true,
  },
  // Adenda 63 §14 (architecture/centro-creacion-sync-permisos.md): Raven y
  // Skales — backends/adaptadores OPCIONALES de memoria e inteligencia para
  // cerebros de Aurora/Astraura. Misma pauta de conector que CasaOS: se
  // conectan por ENDPOINT (neurona propia, CasaOS o servidor hospedado).
  {
    id: "raven",
    label: "Raven (memoria agéntica)",
    blurb:
      "Backend open-source de MEMORIA agéntica (EverMind-AI/Raven): recuerda, indexa y recupera contexto de largo plazo para tus cerebros. Se despliega en una neurona propia (o CasaOS) y se conecta por endpoint.",
    kind: "service",
    defaultPort: 8000,
    contract: "API REST · endpoint configurable",
    oss: true,
  },
  {
    id: "skales",
    label: "Skales",
    blurb:
      "Backend/adaptador open-source de memoria e inteligencia (skalesapp/skales) para cerebros de Aurora/Astraura. Autoalojable en una neurona propia; se conecta por endpoint, con tus datos bajo tu control.",
    kind: "service",
    defaultPort: 3000,
    contract: "API HTTP · endpoint configurable",
    oss: true,
  },

  /* ══ Adenda 67 · P4 (jul-2026) ══════════════════════════════════════════
   * Cuatro servidores nuevos que un cerebro/cuenta/perfil puede tener. Los
   * cuatro son CONECTORES REALES por endpoint (API documentada y verificada),
   * salvo OpenManus, que se declara EXPERIMENTAL porque su repo NO trae API
   * HTTP oficial. La honestidad va en el propio `blurb`: el usuario lee la
   * verdad en la misma tarjeta donde pega la URL.
   */
  {
    id: "tencentdb_memory",
    label: "TencentDB Agent Memory (memoria por capas)",
    blurb:
      "Memoria de agentes por capas (L0 conversación → L1 átomo → L2 escena → L3 persona) + memoria simbólica de corto plazo, 100% local (SQLite + sqlite-vec). Trae Gateway HTTP propio: /recall · /capture · /search/memories · /session/end. Levántalo en una neurona (Docker, :8420), autoriza el origen del OS en su CORS y enlázalo al cerebro con rol «Almacenamiento».",
    kind: "service",
    defaultPort: 8420,
    contract: "/health · /recall · /capture · /search/memories · /session/end",
    oss: true,
  },
  {
    id: "typesense",
    label: "Typesense (búsqueda)",
    blurb:
      "Motor de búsqueda open source, tolerante a erratas y en memoria (alternativa a Algolia/Elasticsearch). El cerebro puede usarlo para buscar en la red y en sus propios documentos. Contenedor propio en la neurona; en el OS usa SIEMPRE una clave de SOLO BÚSQUEDA, nunca la admin key. Si no está, la búsqueda del OS sigue funcionando con Supabase.",
    kind: "service",
    defaultPort: 8108,
    contract: "/health · /collections · /collections/{c}/documents/search · /multi_search",
    oss: true,
  },
  {
    id: "openmanus",
    label: "OpenManus (agente general) · EXPERIMENTAL",
    blurb:
      "Framework de agentes generales en Python (MIT, MetaGPT): navega, ejecuta código y encadena pasos. ⚠️ HONESTIDAD: su repo NO trae API HTTP — es CLI (main.py), flujo multi-agente (run_flow.py) y servidor MCP (run_mcp_server.py). Para que Aurora le delegue tareas hay que exponerlo tú: su MCP en modo SSE o un envoltorio que acepte POST {task}. Si no encaja, el conector devuelve un error claro y Aurora responde por su cuenta.",
    kind: "service",
    defaultPort: 8000,
    contract: "POST {ruta propia} { task } — la ruta la declaras tú (extra.path)",
    oss: true,
  },
  {
    id: "databasement",
    label: "Databasement (respaldo de bases de datos)",
    blurb:
      "Gestor auto-hospedado de COPIAS DE SEGURIDAD de bases de datos (MySQL, PostgreSQL, MongoDB, SQLite, Redis…) hacia S3/SFTP/local, con programación, retención GFS y restauración cruzada. ⚠️ HONESTIDAD: NO crea bases de datos nuevas — es el servidor de RESPALDO de los datos de tu cuenta/cerebro/perfil. Enlázalo con rol «Almacenamiento». Token de API por Sanctum.",
    kind: "service",
    defaultPort: 8080,
    contract: "/up · /api/v1/database-servers · /api/v1/snapshots · /api/v1/jobs · /api/v1/volumes",
    oss: true,
  },
];

export function ossConnectorById(id: string) {
  return OSS_CONNECTORS.find((c) => c.id === id);
}

/* ------------------------------------------------------------------ */
/* Hostinger — preset/guía de despliegue open-source                   */
/* ------------------------------------------------------------------ */

export interface HostingerGuide {
  id: string;
  label: string;
  blurb: string;
  /** Endpoint por defecto (placeholder con la IP del VPS). */
  defaultEndpoint: string;
  /** Pasos para desplegar el servidor de cerebro open-source en un VPS. */
  steps: string[];
  /** Ficheros de ayuda servidos por la app. */
  files: { href: string; label: string }[];
}

/**
 * Guía para desplegar el servidor de cerebro OPEN-SOURCE (local_brain.py) en un
 * VPS de Hostinger y enlazarlo a uno o varios cerebros. Hostinger es una de las
 * opciones de "servidor online del cerebro"; el software desplegado es abierto.
 */
export const HOSTINGER: HostingerGuide = {
  id: "hostinger",
  label: "Hostinger (VPS/nube)",
  blurb:
    "Despliega el servidor de cerebro open-source en tu VPS de Hostinger y enlázalo a tus cerebros (N:N). Software abierto, datos bajo tu control.",
  defaultEndpoint: "http://TU_IP:8800",
  steps: [
    "Crea/abre tu VPS en Hostinger (panel hPanel → VPS) y conéctate por SSH.",
    "Instala Python 3 si no está: sudo apt update && sudo apt install -y python3.",
    "Sube el servidor de referencia install.sh y local_brain.py al VPS.",
    "Ejecuta el instalador: bash install.sh (deja el servicio escuchando en el puerto 8800).",
    "Abre el puerto 8800 en el firewall de Hostinger (y opcionalmente pon un dominio/HTTPS con un reverse proxy).",
    "Registra aquí un servidor de tipo «Hostinger (VPS/nube)» con endpoint http://TU_IP:8800 y pulsa «Probar».",
    "Enlaza ese servidor a uno o varios cerebros (rol, prioridad y sincronización).",
  ],
  files: [
    { href: "/brain/install.sh", label: "install.sh" },
    { href: "/brain/local_brain.py", label: "local_brain.py" },
    { href: "/brain/README.md", label: "Guía y contrato" },
  ],
};

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

export function newRegistryServerId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* */
  }
  return `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeServer(row: Record<string, unknown>): RegistryServer {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "Servidor",
    kind: (row.kind as string) || "online",
    endpoint: (row.endpoint as string) || undefined,
    keyRef: (row.key_ref as string) || undefined,
    config: ((row.config as Record<string, unknown>) || {}),
    status: (row.status as string) || "pendiente",
    shared: !!row.shared,
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
  };
}

function normalizeSync(raw: unknown): LinkSync {
  const r = (raw || {}) as Partial<LinkSync>;
  return {
    direction: (r.direction as SyncDirection) || "both",
    auto: !!r.auto,
    ...((typeof raw === "object" && raw) ? (raw as Record<string, unknown>) : {}),
  };
}

function normalizeLink(row: Record<string, unknown>): ServerLink {
  return {
    brain_id: String(row.brain_id ?? ""),
    server_id: String(row.server_id ?? ""),
    owner: (row.owner as string) ?? undefined,
    role: (row.role as string) || "primary",
    priority: typeof row.priority === "number" ? (row.priority as number) : Number(row.priority ?? 0) || 0,
    sync: normalizeSync(row.sync),
    created_at: (row.created_at as string) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* CRUD del registro (brain_servers)                                   */
/* ------------------------------------------------------------------ */

/** Lista todos los servidores del registro del usuario. */
export async function listServers(): Promise<RegistryServer[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("brain_servers")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map(normalizeServer);
  } catch {
    return [];
  }
}

/** Lee un servidor del registro por id. */
export async function getServer(id: string): Promise<RegistryServer | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb.from("brain_servers").select("*").eq("owner", owner).eq("id", id).single();
    return data ? normalizeServer(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Inserta o actualiza un servidor del registro. Devuelve la fila guardada. */
export async function saveServer(server: Partial<RegistryServer>): Promise<RegistryServer | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload: Record<string, unknown> = {
      owner,
      name: server.name || "Servidor",
      kind: server.kind || "online",
      endpoint: server.endpoint ?? null,
      key_ref: server.keyRef ?? null,
      config: server.config ?? {},
      status: server.status || "pendiente",
      shared: !!server.shared,
      updated_at: new Date().toISOString(),
    };
    if (server.id) payload.id = server.id;
    const { data } = await sb.from("brain_servers").upsert(payload).select("*").single();
    return data ? normalizeServer(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Borra un servidor del registro y todos sus enlaces. */
export async function deleteServer(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("brain_server_links").delete().eq("owner", owner).eq("server_id", id);
    await sb.from("brain_servers").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/** Actualiza solo el estado operativo de un servidor del registro. */
export async function setServerStatus(id: string, status: ServerStatus): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb
      .from("brain_servers")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Enlaces N:N (brain_server_links)                                    */
/* ------------------------------------------------------------------ */

/** Lista enlaces; si se pasa brainId, solo los de ese cerebro. */
export async function listLinks(brainId?: string): Promise<ServerLink[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    let q = sb.from("brain_server_links").select("*").eq("owner", owner);
    if (brainId) q = q.eq("brain_id", brainId);
    const { data } = await q.order("priority", { ascending: true });
    return ((data as Record<string, unknown>[]) || []).map(normalizeLink);
  } catch {
    return [];
  }
}

/** Crea/actualiza el enlace cerebro↔servidor (upsert por PK brain_id+server_id). */
export async function linkServer(
  brainId: string,
  serverId: string,
  opts?: { role?: LinkRole; priority?: number; sync?: LinkSync },
): Promise<ServerLink | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      brain_id: brainId,
      server_id: serverId,
      role: opts?.role || "primary",
      priority: typeof opts?.priority === "number" ? opts.priority : 0,
      sync: normalizeSync(opts?.sync),
    };
    const { data } = await sb
      .from("brain_server_links")
      .upsert(payload, { onConflict: "brain_id,server_id" })
      .select("*")
      .single();
    return data ? normalizeLink(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Elimina el enlace cerebro↔servidor. */
export async function unlinkServer(brainId: string, serverId: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb
      .from("brain_server_links")
      .delete()
      .eq("owner", owner)
      .eq("brain_id", brainId)
      .eq("server_id", serverId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Servidores (del registro) que sirven a un cerebro, con su rol/prioridad/sync.
 * Hace el JOIN brain_server_links → brain_servers, ordenado por prioridad.
 */
export async function serversForBrain(brainId: string): Promise<LinkedServer[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const links = await listLinks(brainId);
    if (links.length === 0) return [];
    const sb = createClient();
    const ids = links.map((l) => l.server_id);
    const { data } = await sb.from("brain_servers").select("*").eq("owner", owner).in("id", ids);
    const byId = new Map<string, RegistryServer>();
    ((data as Record<string, unknown>[]) || []).forEach((r) => {
      const s = normalizeServer(r);
      byId.set(s.id, s);
    });
    return links
      .map((l) => {
        const s = byId.get(l.server_id);
        if (!s) return null;
        return { ...s, link: { role: l.role, priority: l.priority, sync: l.sync } } as LinkedServer;
      })
      .filter((x): x is LinkedServer => !!x)
      .sort((a, b) => a.link.priority - b.link.priority);
  } catch {
    return [];
  }
}

/** Cerebros (ids) que usan un servidor del registro, con su enlace. */
export async function brainsForServer(serverId: string): Promise<ServerLink[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("brain_server_links")
      .select("*")
      .eq("owner", owner)
      .eq("server_id", serverId)
      .order("priority", { ascending: true });
    return ((data as Record<string, unknown>[]) || []).map(normalizeLink);
  } catch {
    return [];
  }
}
