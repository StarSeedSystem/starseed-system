/**
 * 🌌 StarSeed OS — ABILITIES (Habilidades unificadas)
 *
 * Hub unificado que agrega TODAS las capacidades de StarSeed en un único
 * registro y permite ATARLAS (attach) a un objetivo: un cerebro, una pizarra
 * (lienzo), una app generada, o globalmente a la cuenta.
 *
 * Fuentes agregadas:
 *  - Skills    → skillsRegistry (07-skills-registry)
 *  - Tools     → toolsRegistry  (08-tools-registry)
 *  - MCP       → provider_tokens (cada token es un MCP/API) + endpoint MCP StarSeed
 *  - Conexión  → storage_backends (datastores) + vaults (baúles, por nombre)
 *  - Servidor  → brain_servers
 *  - API/Plugin→ catálogo estático open-source-first (API_PLUGINS)
 *
 * NUNCA referencia VALORES de secretos: sólo nombres/etiquetas.
 * Cada fuente se consume defensivamente (try/catch por fuente) — nunca lanza.
 */

"use client";

import { createClient } from "@/utils/supabase/client";
import { skillsRegistry } from "@/hermes-integration/07-skills-registry";
import { toolsRegistry } from "@/hermes-integration/08-tools-registry";

// ========================================================================
// Modelo
// ========================================================================

export type AbilityKind =
  | "skill"
  | "tool"
  | "mcp"
  | "connection"
  | "server"
  | "api"
  | "plugin";

export interface Ability {
  /** Tipo de capacidad. */
  kind: AbilityKind;
  /** Referencia estable e identificadora (nombre técnico / id). */
  ref: string;
  /** Nombre legible. */
  name: string;
  /** Descripción breve. */
  blurb?: string;
  /** Origen de la capacidad (skillsRegistry, provider_tokens, catálogo…). */
  source: string;
  /** Metadatos opcionales (categoría, toolset, kind del backend…). NUNCA secretos. */
  meta?: Record<string, unknown>;
}

export const ABILITY_KIND_LABELS: Record<AbilityKind, string> = {
  skill: "Skills",
  tool: "Tools",
  mcp: "MCP / Proveedor",
  connection: "Conexiones",
  server: "Servidores",
  api: "APIs",
  plugin: "Plugins",
};

// ========================================================================
// Catálogo estático de APIs / Plugins (open-source-first)
// ========================================================================

export const API_PLUGINS: Ability[] = [
  { kind: "api", ref: "ollama", name: "Ollama", blurb: "LLMs locales (privacidad total).", source: "catálogo", meta: { oss: true } },
  { kind: "api", ref: "supabase", name: "Supabase / Postgres", blurb: "Base de datos y auth open-source.", source: "catálogo", meta: { oss: true } },
  { kind: "api", ref: "qdrant", name: "Qdrant", blurb: "Base de datos vectorial para memoria semántica.", source: "catálogo", meta: { oss: true } },
  { kind: "api", ref: "minio", name: "MinIO", blurb: "Almacenamiento de objetos compatible S3.", source: "catálogo", meta: { oss: true } },
  { kind: "api", ref: "syncthing", name: "Syncthing", blurb: "Sincronización P2P cifrada entre dispositivos.", source: "catálogo", meta: { oss: true } },
  { kind: "plugin", ref: "github", name: "GitHub", blurb: "Repos, issues y Contents API.", source: "catálogo", meta: { oss: true } },
  { kind: "plugin", ref: "webdav", name: "WebDAV / Nextcloud", blurb: "Ficheros y almacenes auto-alojados.", source: "catálogo", meta: { oss: true } },
  { kind: "plugin", ref: "n8n", name: "n8n", blurb: "Automatización y workflows open-source.", source: "catálogo", meta: { oss: true } },
  { kind: "plugin", ref: "obsidian", name: "Obsidian", blurb: "Bóveda de notas en markdown local.", source: "catálogo", meta: { oss: true } },
  { kind: "plugin", ref: "couchdb", name: "CouchDB", blurb: "Base de datos documental replicable.", source: "catálogo", meta: { oss: true } },
];

// ========================================================================
// Carga defensiva de cada fuente
// ========================================================================

/** Normaliza cualquier forma (Map class, array, {getAll}, object-map, {list}) a array. */
function toArray<T = any>(maybe: unknown): T[] {
  if (!maybe) return [];
  try {
    if (Array.isArray(maybe)) return maybe as T[];
    if (typeof (maybe as any).getAll === "function") return ((maybe as any).getAll() as T[]) || [];
    if (typeof (maybe as any).values === "function") return Array.from((maybe as any).values()) as T[];
    if (Array.isArray((maybe as any).list)) return (maybe as any).list as T[];
    if (typeof maybe === "object") return Object.values(maybe as Record<string, T>);
  } catch {
    /* noop */
  }
  return [];
}

function loadSkills(): Ability[] {
  try {
    // skillsRegistry expone getAll() → SkillDocument[] ({ metadata, content }).
    const docs = toArray<any>(skillsRegistry);
    return docs
      .map((d) => {
        const m = d?.metadata ?? d ?? {};
        const ref = m.name ?? d?.name;
        if (!ref) return null;
        return {
          kind: "skill" as const,
          ref: String(ref),
          name: String(m.name ?? ref),
          blurb: m.description ?? undefined,
          source: "skillsRegistry",
          meta: { category: m.category, tags: m.tags, triggers: m.triggers },
        };
      })
      .filter(Boolean) as Ability[];
  } catch {
    return [];
  }
}

function loadTools(): Ability[] {
  try {
    // toolsRegistry expone getAll() → ToolDefinition[] ({ schema, toolset }).
    const defs = toArray<any>(toolsRegistry);
    return defs
      .map((t) => {
        const schema = t?.schema ?? t ?? {};
        const ref = schema.name ?? t?.name;
        if (!ref) return null;
        return {
          kind: "tool" as const,
          ref: String(ref),
          name: String(schema.name ?? ref),
          blurb: schema.description ?? undefined,
          source: "toolsRegistry",
          meta: { toolset: t?.toolset },
        };
      })
      .filter(Boolean) as Ability[];
  } catch {
    return [];
  }
}

async function loadMcp(sb: ReturnType<typeof createClient>, uid: string | null): Promise<Ability[]> {
  const out: Ability[] = [
    {
      kind: "mcp",
      ref: "starseed-mcp",
      name: "StarSeed MCP",
      blurb: "Endpoint MCP nativo de StarSeed OS.",
      source: "starseed",
      meta: { native: true },
    },
  ];
  if (!uid) return out;
  try {
    // Cada provider_token es un MCP / API (sólo etiqueta/scope, NUNCA el secreto).
    const { data } = await sb
      .from("provider_tokens")
      .select("id,label,scope")
      .eq("owner", uid);
    for (const row of (data as any[]) || []) {
      out.push({
        kind: "mcp",
        ref: String(row.id),
        name: String(row.label || `Token ${String(row.id).slice(0, 8)}`),
        blurb: row.scope ? `Ámbito: ${row.scope}` : undefined,
        source: "provider_tokens",
        meta: { scope: row.scope },
      });
    }
  } catch {
    /* noop */
  }
  return out;
}

async function loadConnections(sb: ReturnType<typeof createClient>, uid: string | null): Promise<Ability[]> {
  const out: Ability[] = [];
  if (!uid) return out;
  try {
    const { data } = await sb
      .from("storage_backends")
      .select("id,name,kind")
      .eq("owner", uid);
    for (const row of (data as any[]) || []) {
      out.push({
        kind: "connection",
        ref: String(row.id),
        name: String(row.name || row.kind || "Almacén"),
        blurb: row.kind ? `Datastore: ${row.kind}` : undefined,
        source: "storage_backends",
        meta: { backendKind: row.kind },
      });
    }
  } catch {
    /* noop */
  }
  try {
    // Baúles (secrets vault) — SÓLO por nombre, nunca valores.
    const { data } = await sb.from("vaults").select("id,name").eq("owner", uid);
    for (const row of (data as any[]) || []) {
      out.push({
        kind: "connection",
        ref: `vault:${row.id}`,
        name: String(row.name || "Baúl"),
        blurb: "Baúl cifrado (referencia por nombre).",
        source: "vaults",
        meta: { vault: true },
      });
    }
  } catch {
    /* noop */
  }
  return out;
}

async function loadServers(sb: ReturnType<typeof createClient>, uid: string | null): Promise<Ability[]> {
  const out: Ability[] = [];
  if (!uid) return out;
  try {
    const { data } = await sb
      .from("brain_servers")
      .select("id,name,kind")
      .eq("owner", uid);
    for (const row of (data as any[]) || []) {
      out.push({
        kind: "server",
        ref: String(row.id),
        name: String(row.name || "Servidor"),
        blurb: row.kind ? `Tipo: ${row.kind}` : undefined,
        source: "brain_servers",
        meta: { serverKind: row.kind },
      });
    }
  } catch {
    /* noop */
  }
  return out;
}

// ========================================================================
// loadAbilities — agregación plana + dedupe
// ========================================================================

export async function loadAbilities(): Promise<Ability[]> {
  let sb: ReturnType<typeof createClient> | null = null;
  let uid: string | null = null;
  try {
    sb = createClient();
    const { data: au } = await sb.auth.getUser();
    uid = au?.user?.id ?? null;
  } catch {
    sb = null;
    uid = null;
  }

  const aggregated: Ability[] = [];

  // Registros locales (no requieren Supabase).
  aggregated.push(...loadSkills());
  aggregated.push(...loadTools());

  // Catálogo estático.
  aggregated.push(...API_PLUGINS);

  // Fuentes Supabase (cada una protegida).
  if (sb) {
    const [mcp, conns, servers] = await Promise.all([
      loadMcp(sb, uid),
      loadConnections(sb, uid),
      loadServers(sb, uid),
    ]);
    aggregated.push(...mcp, ...conns, ...servers);
  } else {
    // Sin sesión: al menos el MCP nativo de StarSeed.
    aggregated.push({
      kind: "mcp",
      ref: "starseed-mcp",
      name: "StarSeed MCP",
      blurb: "Endpoint MCP nativo de StarSeed OS.",
      source: "starseed",
      meta: { native: true },
    });
  }

  // Dedupe por kind+ref.
  const seen = new Set<string>();
  const flat: Ability[] = [];
  for (const a of aggregated) {
    const key = `${a.kind}:${a.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push(a);
  }
  return flat;
}

// ========================================================================
// Objetivos de attach (targets)
// ========================================================================

export type TargetScope = "cerebro" | "pizarra" | "app" | "cuenta";

export interface AttachTarget {
  scope: TargetScope;
  /** ref del objetivo (id del cerebro/pizarra/app). Vacío para "cuenta" (global). */
  ref: string;
  /** Nombre legible del objetivo. */
  name: string;
}

export interface TargetKindDef {
  scope: TargetScope;
  label: string;
  /** true si es global (no requiere seleccionar una entidad). */
  global?: boolean;
}

export const ATTACH_TARGETS: TargetKindDef[] = [
  { scope: "cerebro", label: "Cerebro" },
  { scope: "pizarra", label: "Pizarra / Lienzo" },
  { scope: "app", label: "App generada" },
  { scope: "cuenta", label: "Cuenta (global)", global: true },
];

/** Carga las opciones (entidades) para un scope dado. */
export async function listTargets(scope: TargetScope): Promise<AttachTarget[]> {
  if (scope === "cuenta") {
    return [{ scope: "cuenta", ref: "global", name: "Cuenta (global)" }];
  }
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id ?? null;
    if (!uid) return [];

    if (scope === "cerebro") {
      const { data } = await sb.from("brains").select("id,name").eq("owner", uid).order("created_at", { ascending: false });
      return ((data as any[]) || []).map((r) => ({ scope, ref: String(r.id), name: String(r.name || "Cerebro") }));
    }
    if (scope === "pizarra") {
      const { data } = await sb.from("canvases").select("id,title").eq("owner", uid).order("created_at", { ascending: false });
      return ((data as any[]) || []).map((r) => ({ scope, ref: String(r.id), name: String(r.title || "Pizarra") }));
    }
    if (scope === "app") {
      const { data } = await sb.from("generated_apps").select("id,name").eq("owner", uid).order("created_at", { ascending: false });
      return ((data as any[]) || []).map((r) => ({ scope, ref: String(r.id), name: String(r.name || "App") }));
    }
  } catch {
    /* noop */
  }
  return [];
}

// ========================================================================
// CRUD ability_links
// ========================================================================

export interface AbilityLink {
  id: string;
  owner?: string;
  kind: AbilityKind | string;
  ref: string;
  name: string;
  target_scope: string;
  target_ref: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
  created_at?: string;
}

/** Ata una habilidad a un objetivo (crea fila en ability_links). */
export async function attach(
  ability: Ability,
  target: AttachTarget,
  config: Record<string, unknown> = {},
): Promise<AbilityLink | null> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id ?? null;
    if (!uid) return null;
    const row = {
      owner: uid,
      kind: ability.kind,
      ref: ability.ref,
      name: ability.name,
      target_scope: target.scope,
      target_ref: target.scope === "cuenta" ? null : target.ref || null,
      config: { source: ability.source, ...(ability.meta || {}), ...config },
      enabled: true,
    };
    const { data, error } = await sb.from("ability_links").insert(row).select("*").single();
    if (error) return null;
    return data as AbilityLink;
  } catch {
    return null;
  }
}

/** Desata (elimina) un enlace por id. */
export async function detach(linkId: string): Promise<boolean> {
  try {
    const sb = createClient();
    const { error } = await sb.from("ability_links").delete().eq("id", linkId);
    return !error;
  } catch {
    return false;
  }
}

/** Lista enlaces, opcionalmente filtrados por objetivo. */
export async function listLinks(targetScope?: string, targetRef?: string): Promise<AbilityLink[]> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id ?? null;
    if (!uid) return [];
    let q = sb.from("ability_links").select("*").eq("owner", uid).order("created_at", { ascending: false });
    if (targetScope) q = q.eq("target_scope", targetScope);
    if (targetRef) q = q.eq("target_ref", targetRef);
    const { data } = await q;
    return ((data as AbilityLink[]) || []);
  } catch {
    return [];
  }
}

/** Habilidades atadas a un objetivo concreto. */
export async function abilitiesFor(targetScope: string, targetRef: string): Promise<AbilityLink[]> {
  return listLinks(targetScope, targetScope === "cuenta" ? undefined : targetRef);
}
