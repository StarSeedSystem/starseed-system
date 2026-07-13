/**
 * Storage backends registry + CRUD for the multi-source memory storage system.
 *
 * Memories can live in several storage backends with smart routing per
 * system/user/page/group. The StarSeed server (Supabase) is LIMITED capacity and
 * preferred for context, short/medium-term and "fundamental" memories; each user's
 * Google Drive is preferred for larger files; local stores have device-relative
 * capacity; and there's an unlimited set of extensible sources (GitHub, Obsidian,
 * WebDAV/Nextcloud, S3-compatible, custom DB).
 */

"use client";

import { createClient } from "@/utils/supabase/client";
// Driver REAL de Google Cloud Storage (Adenda 66 §13.1): el primer backend
// externo que deja de ser andamiaje y hace I/O de verdad vía URLs firmadas V4.
import { deleteFromGcs, getGcsUrl, testGcs, uploadToGcs, type GcsStatus } from "./gcs-driver";

export type StorageKindId =
  | "starseed"
  | "gdrive"
  | "local"
  | "github"
  | "obsidian"
  | "webdav"
  | "s3"
  | "custom"
  | "postgres"
  | "sqlite"
  | "qdrant"
  | "minio"
  | "couchdb"
  | "nextcloud"
  | "syncthing"
  // ── Red descentralizada de backends (Adenda 66 §13) ──
  | "supabase"     // Supabase propio del usuario (proyecto independiente)
  | "gcs"          // Google Cloud Storage
  | "cloudrun"     // Google Cloud Run (hosting/cómputo soberano)
  | "vercel-blob"  // Vercel Blob store
  | "casaos"       // CasaOS / neurona propia (servidor casero por endpoint)
  | "ipfs";        // IPFS (almacenamiento por contenido, descentralizado)

export type StorageScope = "account" | "profile" | "group" | "page" | "brain" | "vault";

/**
 * Tipo de RECURSO al que se le asigna un backend primario y réplicas (Adenda 66
 * §13). Distinto de `StorageScope` (que ata un backend a una entidad concreta):
 * aquí se decide, por CLASE de recurso, dónde vive primero y dónde se replica.
 */
export type ResourceType =
  | "account"
  | "profile"
  | "page"
  | "folder"
  | "file"
  | "library"
  | "brain"
  | "publication";

export const RESOURCE_TYPES: { id: ResourceType; label: string; icon: string }[] = [
  { id: "account", label: "Cuenta", icon: "🔐" },
  { id: "profile", label: "Perfil", icon: "🪪" },
  { id: "page", label: "Página", icon: "📄" },
  { id: "folder", label: "Folder", icon: "🗂️" },
  { id: "file", label: "Archivo", icon: "📎" },
  { id: "library", label: "Biblioteca", icon: "📚" },
  { id: "brain", label: "Cerebro", icon: "🧠" },
  { id: "publication", label: "Publicación", icon: "📣" },
];

export interface StorageField {
  key: string;
  label: string;
  type?: "text" | "number" | "password";
  placeholder?: string;
}

export interface StorageKind {
  id: StorageKindId;
  label: string;
  icon?: string;
  blurb: string;
  fields: StorageField[];
  /** Whether this kind is effectively unlimited (no enforced quota). */
  unlimited: boolean;
  defaultRules: Record<string, unknown>;
  /** Suggested default quota in MB (used when seeding). */
  defaultQuotaMb?: number | null;
  /** True for open-source datastores (PostgreSQL, SQLite, Qdrant, MinIO, CouchDB, Nextcloud, Syncthing…). */
  oss?: boolean;
}

export interface StorageBackend {
  id: string;
  owner: string;
  kind: StorageKindId | string;
  name: string;
  scope: string;
  scope_ref: string | null;
  config: Record<string, unknown>;
  quota_mb: number | null;
  used_mb: number | null;
  priority: number | null;
  /**
   * Reglas de enrutado (jsonb). Además de las de tamaño/plazo, la red
   * descentralizada usa:
   *   · `primaryFor?: ResourceType[]` → tipos de recurso para los que ES primario.
   *   · `replicaFor?: ResourceType[]` → tipos de recurso que REPLICA.
   */
  rules: Record<string, unknown> | null;
  enabled: boolean;
  status: string | null;
  /** Primario por defecto de la cuenta (columna real `is_primary`, Adenda 66). */
  is_primary?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoragePolicy {
  /** Memorias <= este tamaño (MB) prefieren el servidor StarSeed. */
  starseedMaxMb?: number;
  /** Destino preferido para ficheros grandes. */
  preferLargeTarget?: "gdrive" | "local";
  /** Mantener siempre las memorias fundamentales en el servidor StarSeed. */
  keepFundamentalOnStarseed?: boolean;
  [k: string]: unknown;
}

export const STORAGE_KINDS: StorageKind[] = [
  {
    id: "starseed",
    label: "Servidor StarSeed",
    icon: "🌱",
    blurb:
      "Rápido y siempre disponible. Ideal para contexto, memoria de corto/medio plazo y memorias fundamentales.",
    fields: [],
    unlimited: false,
    defaultRules: { maxSizeMb: 5, prefersKinds: ["soul", "context", "fundamental", "memory"], shortTerm: true },
    defaultQuotaMb: 50,
  },
  {
    id: "gdrive",
    label: "Google Drive (tu cuenta)",
    icon: "🟢",
    blurb:
      "Tu propia cuenta de Google Drive (OAuth). Perfecto para ficheros grandes y sincronizables online.",
    fields: [{ key: "folderId", label: "Folder (ID, opcional)" }],
    unlimited: true,
    defaultRules: { prefersLarge: true, minSizeMb: 5 },
    defaultQuotaMb: null,
  },
  {
    id: "local",
    label: "Memoria local",
    icon: "💾",
    blurb:
      "Capacidad relativa a cada equipo conectado. Se sincroniza entre tus dispositivos vía Syncthing.",
    fields: [
      { key: "path", label: "Ruta local" },
      { key: "capacityMb", label: "Capacidad (MB)", type: "number" },
      { key: "syncthingFolderId", label: "Folder Syncthing (opcional)" },
    ],
    unlimited: false,
    defaultRules: { prefersLarge: true },
    defaultQuotaMb: null,
  },
  {
    id: "github",
    label: "Repositorio GitHub",
    icon: "🐙",
    blurb: "Memorias versionadas en un repositorio Git. Historial completo y portabilidad.",
    fields: [
      { key: "repo", label: "Repositorio (owner/repo)" },
      { key: "branch", label: "Rama", placeholder: "main" },
      { key: "path", label: "Ruta dentro del repo" },
    ],
    unlimited: true,
    defaultRules: { versioned: true },
    defaultQuotaMb: null,
  },
  {
    id: "obsidian",
    label: "Bóveda Obsidian",
    icon: "🪨",
    blurb: "Tu bóveda de Obsidian (markdown). Vía folder local o repositorio GitHub.",
    fields: [
      { key: "vaultPath", label: "Ruta de la bóveda" },
      { key: "repo", label: "Repo (opcional, owner/repo)" },
    ],
    unlimited: true,
    defaultRules: { versioned: true },
    defaultQuotaMb: null,
  },
  {
    id: "webdav",
    label: "WebDAV / Nextcloud",
    icon: "☁️",
    blurb: "Cualquier servidor WebDAV o Nextcloud. Almacenamiento online soberano y extensible.",
    fields: [{ key: "url", label: "URL WebDAV (secreto → bóveda)", type: "password" }],
    unlimited: true,
    defaultRules: { prefersLarge: true },
    defaultQuotaMb: null,
  },
  {
    id: "s3",
    label: "S3 / compatible",
    icon: "🪣",
    blurb: "Buckets S3 o compatibles (R2, MinIO, B2…). Escala prácticamente ilimitada.",
    fields: [
      { key: "bucket", label: "Bucket" },
      { key: "endpoint", label: "Endpoint (secreto → bóveda)", type: "password" },
      { key: "region", label: "Región" },
    ],
    unlimited: true,
    defaultRules: { prefersLarge: true },
    defaultQuotaMb: null,
  },
  {
    id: "custom",
    label: "Fuente personalizada / DB",
    icon: "🧩",
    blurb: "Conecta cualquier base de datos o endpoint propio. Extensible sin límites.",
    fields: [
      { key: "url", label: "URL / cadena de conexión" },
      { key: "notes", label: "Notas" },
    ],
    unlimited: true,
    defaultRules: {},
    defaultQuotaMb: null,
  },
  /* ----------------------- Datastores open-source ----------------------- */
  {
    id: "postgres",
    label: "PostgreSQL / Supabase (open-source)",
    icon: "🐘",
    blurb:
      "Base de datos relacional open-source (PostgreSQL / Supabase). Soporta replicación lógica y sincronización directa. Conecta vía el servidor del cerebro o proxy.",
    fields: [
      { key: "url", label: "URL (PostgREST / conexión, secreto → bóveda)", type: "password" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { oss: true, structured: true, replication: "logical", prefersLarge: false },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "sqlite",
    label: "SQLite (local, embebido)",
    icon: "📁",
    blurb:
      "Base de datos SQLite embebida y open-source. Ideal para datos locales del cerebro/baúl; sincronizable vía Syncthing.",
    fields: [{ key: "path", label: "Ruta del fichero .sqlite" }],
    unlimited: false,
    defaultRules: { oss: true, structured: true, embedded: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "qdrant",
    label: "Qdrant (vector, open-source)",
    icon: "🧮",
    blurb:
      "Base de datos vectorial open-source para embeddings y memoria semántica. Conecta vía el servidor del cerebro o proxy.",
    fields: [
      { key: "url", label: "URL (secreto → bóveda)", type: "password" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda)", type: "password" },
      { key: "collection", label: "Colección" },
    ],
    unlimited: true,
    defaultRules: { oss: true, prefersKinds: ["vectors", "embedding", "semantic"], vector: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "minio",
    label: "MinIO / S3 (open-source)",
    icon: "🪣",
    blurb:
      "Almacenamiento de objetos S3 open-source (MinIO). Escala prácticamente ilimitada para ficheros grandes. Conecta vía el servidor del cerebro o proxy.",
    fields: [
      { key: "endpoint", label: "Endpoint (secreto → bóveda)", type: "password" },
      { key: "bucket", label: "Bucket" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { oss: true, prefersLarge: true, object: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "couchdb",
    label: "CouchDB (open-source, sync)",
    icon: "🛋️",
    blurb:
      "Base de datos documental open-source con replicación/sincronización bidireccional incorporada. Conecta vía el servidor del cerebro o proxy.",
    fields: [
      { key: "url", label: "URL (secreto → bóveda)", type: "password" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { oss: true, document: true, replication: "bidirectional", sync: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "nextcloud",
    label: "Nextcloud (WebDAV, open-source)",
    icon: "☁️",
    blurb:
      "Nube soberana open-source vía WebDAV. Ideal para ficheros y sincronización entre dispositivos. Conecta vía el servidor del cerebro o proxy.",
    fields: [
      { key: "url", label: "URL WebDAV (secreto → bóveda)", type: "password" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { oss: true, prefersLarge: true, sync: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "syncthing",
    label: "Folder Syncthing (open-source)",
    icon: "🔁",
    blurb:
      "Folder sincronizado de forma continua y descentralizada (open-source) entre tus dispositivos. Sin servidor central.",
    fields: [
      { key: "folderId", label: "ID de folder Syncthing" },
      { key: "path", label: "Ruta local" },
    ],
    unlimited: false,
    defaultRules: { oss: true, sync: true, decentralized: true },
    defaultQuotaMb: null,
    oss: true,
  },
  /* ───────── Red descentralizada de backends (Adenda 66 §13) ─────────
   * Cada recurso (cuenta/perfil/página/folder/archivo/biblioteca/cerebro/
   * publicación) puede vivir en el servidor oficial StarSeed (por defecto) o en
   * estos backends externos. HOY: registro + selección de primario/réplicas +
   * el oficial StarSeed son funcionales; los DRIVERS de lectura/escritura reales
   * de cada externo son andamiaje (se conectan por endpoint/credencial-referencia
   * y, donde aplica, vía el servidor del cerebro/proxy en runtime). */
  {
    id: "supabase",
    label: "Supabase propio",
    icon: "⚡",
    blurb:
      "Tu propio proyecto Supabase (independiente del oficial StarSeed): Postgres + Storage + Realtime bajo tu control. Se conecta por URL del proyecto + referencia a la clave en la bóveda.",
    fields: [
      { key: "projectUrl", label: "URL del proyecto (https://xxxx.supabase.co)" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda)", type: "password" },
      { key: "bucket", label: "Bucket de Storage (opcional)" },
    ],
    unlimited: true,
    defaultRules: { oss: true, structured: true, prefersLarge: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "gcs",
    label: "Google Cloud Storage",
    icon: "🪣",
    blurb:
      "REAL (no andamiaje): sube, lee y borra de verdad en el bucket soberano del OS mediante URLs firmadas V4 de 10 min. " +
      "La credencial de Google JAMÁS toca el navegador y cada cuenta queda aislada en su prefijo «<uid>/». " +
      "El bucket y el proyecto los decide el servidor (env GCS_BUCKET / GCP_PROJECT_ID); los campos de abajo son informativos.",
    fields: [
      { key: "bucket", label: "Bucket (informativo; manda el del servidor)" },
      { key: "project", label: "Proyecto GCP (informativo)" },
    ],
    unlimited: true,
    defaultRules: { prefersLarge: true, object: true, realDriver: true },
    defaultQuotaMb: null,
  },
  {
    id: "cloudrun",
    label: "Google Cloud Run",
    icon: "🏃",
    blurb:
      "Servicio soberano en Google Cloud Run que expone un endpoint HTTP propio (alternativa a Vercel, ya soportada por el repo con Dockerfile + cloudbuild.yaml). Sirve como host de datos/servicios del recurso.",
    fields: [
      { key: "url", label: "URL del servicio (https://…run.app)" },
      { key: "keyRef", label: "Referencia de clave/API (secreto → bóveda)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { hosting: true },
    defaultQuotaMb: null,
  },
  {
    id: "vercel-blob",
    label: "Vercel Blob",
    icon: "▲",
    blurb:
      "Almacén de blobs de Vercel para ficheros públicos/privados servidos por CDN. Se conecta con una referencia al token de lectura/escritura en la bóveda.",
    fields: [
      { key: "storeId", label: "Store ID (opcional)" },
      { key: "keyRef", label: "Referencia de token (secreto → bóveda)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { prefersLarge: true, object: true },
    defaultQuotaMb: null,
  },
  {
    id: "casaos",
    label: "CasaOS / neurona propia",
    icon: "🏠",
    blurb:
      "Tu servidor casero (CasaOS en una neurona): almacena recursos en tu propio hardware y se conecta por endpoint. Misma pauta que en Cerebro → Neuronas/Servidores. Open-source y soberano.",
    fields: [
      { key: "endpoint", label: "Endpoint del panel/API (http://IP:puerto)" },
      { key: "path", label: "Ruta/App destino (Files, Nextcloud…)" },
      { key: "keyRef", label: "Referencia de clave (secreto → bóveda, opcional)", type: "password" },
    ],
    unlimited: true,
    defaultRules: { oss: true, selfHost: true, prefersLarge: true },
    defaultQuotaMb: null,
    oss: true,
  },
  {
    id: "ipfs",
    label: "IPFS (por contenido)",
    icon: "🌐",
    blurb:
      "Almacenamiento por contenido descentralizado (IPFS/Kubo). Direcciona por CID; ideal para contenido inmutable y replicable entre nodos. Se conecta a un nodo/gateway propio por endpoint.",
    fields: [
      { key: "endpoint", label: "API del nodo (http://127.0.0.1:5001) o gateway" },
      { key: "gateway", label: "Gateway público (opcional)" },
    ],
    unlimited: true,
    defaultRules: { oss: true, contentAddressed: true, decentralized: true },
    defaultQuotaMb: null,
    oss: true,
  },
];

/**
 * Scopes a storage backend can be attached to. Beyond account/profile/group/page,
 * a datastore can be linked directly to a brain (cerebro) or a vault (baúl).
 */
export const SCOPES_EXT: { id: StorageScope; label: string }[] = [
  { id: "account", label: "Cuenta" },
  { id: "profile", label: "Perfil" },
  { id: "group", label: "Grupo" },
  { id: "page", label: "Página" },
  { id: "brain", label: "Cerebro" },
  { id: "vault", label: "Baúl" },
];

export function kindById(id: string): StorageKind | undefined {
  return STORAGE_KINDS.find((k) => k.id === id);
}

/* ----------------------------- CRUD: backends ----------------------------- */

export async function listBackends(scope?: string, scopeRef?: string | null): Promise<StorageBackend[]> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return [];
    let q = sb.from("storage_backends").select("*").eq("owner", uid);
    if (scope) q = q.eq("scope", scope);
    if (scope && typeof scopeRef !== "undefined") {
      if (scopeRef === null || scopeRef === "") q = q.is("scope_ref", null);
      else q = q.eq("scope_ref", scopeRef);
    }
    const { data } = await q.order("priority", { ascending: true }).order("created_at", { ascending: true });
    return ((data as StorageBackend[]) ?? []).map(normalize);
  } catch {
    return [];
  }
}

function normalize(b: StorageBackend): StorageBackend {
  return {
    ...b,
    config: (b.config as Record<string, unknown>) ?? {},
    rules: (b.rules as Record<string, unknown>) ?? {},
    enabled: b.enabled ?? true,
    priority: typeof b.priority === "number" ? b.priority : 99,
    is_primary: b.is_primary === true,
  };
}

export async function saveBackend(
  input: Partial<StorageBackend> & { kind: string; name: string },
): Promise<StorageBackend | null> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return null;
    const kind = kindById(input.kind);
    const row: Record<string, unknown> = {
      owner: uid,
      kind: input.kind,
      name: input.name,
      scope: input.scope ?? "account",
      scope_ref: input.scope_ref ?? null,
      config: input.config ?? {},
      quota_mb: typeof input.quota_mb === "undefined" ? kind?.defaultQuotaMb ?? null : input.quota_mb,
      used_mb: input.used_mb ?? 0,
      priority: typeof input.priority === "number" ? input.priority : 99,
      rules: input.rules ?? kind?.defaultRules ?? {},
      enabled: typeof input.enabled === "boolean" ? input.enabled : true,
      status: input.status ?? "unknown",
      updated_at: new Date().toISOString(),
    };
    // Solo tocamos is_primary si viene explícito (no clobber en ediciones simples).
    if (typeof input.is_primary === "boolean") row.is_primary = input.is_primary;
    if (input.id) {
      const { data } = await sb.from("storage_backends").update(row).eq("id", input.id).eq("owner", uid).select("*").single();
      return data ? normalize(data as StorageBackend) : null;
    }
    const { data } = await sb.from("storage_backends").insert(row).select("*").single();
    return data ? normalize(data as StorageBackend) : null;
  } catch {
    return null;
  }
}

export async function deleteBackend(id: string): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    await sb.from("storage_backends").delete().eq("id", id).eq("owner", uid);
    return true;
  } catch {
    return false;
  }
}

export async function setEnabled(id: string, enabled: boolean): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    await sb
      .from("storage_backends")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", uid);
    return true;
  } catch {
    return false;
  }
}

export async function reorderPriority(id: string, priority: number): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    await sb
      .from("storage_backends")
      .update({ priority, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", uid);
    return true;
  } catch {
    return false;
  }
}

export async function updateBackend(id: string, patch: Partial<StorageBackend>): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    await sb
      .from("storage_backends")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", uid);
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------- policy (settings) ----------------------------- */

export async function getPolicy(): Promise<StoragePolicy> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return {};
    const { data } = await sb.from("storage_settings").select("policy").eq("owner", uid).maybeSingle();
    return ((data as { policy?: StoragePolicy } | null)?.policy as StoragePolicy) ?? {};
  } catch {
    return {};
  }
}

export async function savePolicy(policy: StoragePolicy): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    await sb
      .from("storage_settings")
      .upsert({ owner: uid, policy, updated_at: new Date().toISOString() }, { onConflict: "owner" });
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------- defaults ----------------------------- */

/**
 * If the owner has no backends at all, seed a StarSeed server backend (priority 1)
 * so the router always has a home. Returns the (possibly seeded) backend list for
 * the account scope.
 */
export async function ensureDefaults(owner?: string): Promise<StorageBackend[]> {
  try {
    const sb = createClient();
    let uid = owner;
    if (!uid) {
      const { data: au } = await sb.auth.getUser();
      uid = au?.user?.id;
    }
    if (!uid) return [];
    const { data: existing } = await sb.from("storage_backends").select("id").eq("owner", uid).limit(1);
    if (existing && existing.length > 0) {
      return listBackends();
    }
    const star = kindById("starseed");
    await sb.from("storage_backends").insert({
      owner: uid,
      kind: "starseed",
      name: "Servidor StarSeed",
      scope: "account",
      scope_ref: null,
      config: {},
      quota_mb: star?.defaultQuotaMb ?? 50,
      used_mb: 0,
      priority: 1,
      rules: star?.defaultRules ?? {},
      enabled: true,
      status: "ok",
      is_primary: true, // el servidor oficial StarSeed es el primario por defecto
      updated_at: new Date().toISOString(),
    });
    return listBackends();
  } catch {
    return [];
  }
}

/* ═══════════════ Red descentralizada de backends (Adenda 66 §13) ═══════════════
 * Capa de selección de backends por RECURSO (cuenta/perfil/página/folder/archivo/
 * biblioteca/cerebro/publicación). El servidor oficial StarSeed aparece SIEMPRE y
 * es el primario por defecto y automático. HONESTIDAD: hoy es funcional el
 * REGISTRO + la SELECCIÓN de primario/réplicas + el backend oficial StarSeed
 * (Supabase del OS, ya usado por todo el acceso a datos). Los DRIVERS de
 * lectura/escritura reales de cada externo son andamiaje: se conectan por
 * endpoint / referencia-a-clave y, donde aplica, vía el servidor del cerebro o un
 * proxy en runtime (los pings directos desde el navegador suelen bloquearse por
 * CORS). Esta capa NO reescribe el acceso a datos existente: lo complementa.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Lee las reglas de enrutado por recurso de un backend (arrays defensivos). */
export function getResourceRouting(b: StorageBackend): { primaryFor: ResourceType[]; replicaFor: ResourceType[] } {
  const rules = (b.rules as Record<string, unknown> | null) ?? {};
  const asTypes = (v: unknown): ResourceType[] =>
    Array.isArray(v)
      ? (v.filter((x): x is ResourceType => typeof x === "string" && RESOURCE_TYPES.some((r) => r.id === x)))
      : [];
  return { primaryFor: asTypes(rules.primaryFor), replicaFor: asTypes(rules.replicaFor) };
}

/**
 * Añade (inserta) un backend nuevo. Wrapper sobre saveBackend que garantiza que
 * NO lleva id (siempre inserta). Devuelve la fila creada o null.
 */
export async function addBackend(
  input: Partial<StorageBackend> & { kind: string; name: string },
): Promise<StorageBackend | null> {
  const { id: _omit, ...rest } = input;
  void _omit;
  return saveBackend(rest);
}

/**
 * Devuelve el backend PRIMARIO por defecto de la cuenta: el marcado `is_primary`
 * o, en su defecto, el servidor oficial StarSeed (sembrándolo si falta). Nunca
 * lanza; null solo si no hay sesión.
 */
export async function defaultBackend(): Promise<StorageBackend | null> {
  try {
    const all = await ensureDefaults();
    const list = all.length ? all : await listBackends();
    const primary = list.find((b) => b.is_primary === true);
    if (primary) return primary;
    const star = list.find((b) => b.kind === "starseed");
    if (star) return star;
    return [...list].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Marca un backend como PRIMARIO de la cuenta (columna real `is_primary`) y quita
 * la marca del resto (uno solo primario a la vez). Devuelve true si se aplicó.
 */
export async function setPrimary(id: string): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    // Quita la marca de todos y la pone solo en `id` (dos updates atómicos suaves).
    await sb
      .from("storage_backends")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("owner", uid)
      .neq("id", id);
    const { error } = await sb
      .from("storage_backends")
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq("owner", uid)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Fija qué backend es PRIMARIO para un tipo de recurso concreto: lo añade a su
 * `rules.primaryFor` y lo quita del de los demás (un primario por recurso). Si
 * `id` es null, deja ese recurso sin primario explícito (cae al primario de la
 * cuenta / StarSeed). Devuelve true si se aplicó.
 */
export async function setResourcePrimary(resource: ResourceType, id: string | null): Promise<boolean> {
  try {
    const list = await listBackends();
    const ops: Promise<boolean>[] = [];
    for (const b of list) {
      const { primaryFor, replicaFor } = getResourceRouting(b);
      const has = primaryFor.includes(resource);
      if (b.id === id) {
        if (!has) {
          ops.push(
            updateBackend(b.id, { rules: { ...(b.rules ?? {}), primaryFor: [...primaryFor, resource], replicaFor } }),
          );
        }
      } else if (has) {
        ops.push(
          updateBackend(b.id, {
            rules: { ...(b.rules ?? {}), primaryFor: primaryFor.filter((r) => r !== resource), replicaFor },
          }),
        );
      }
    }
    const res = await Promise.all(ops);
    return res.every(Boolean);
  } catch {
    return false;
  }
}

/**
 * Activa/desactiva un backend como RÉPLICA de un tipo de recurso (varias réplicas
 * permitidas). Devuelve true si se aplicó.
 */
export async function toggleResourceReplica(resource: ResourceType, id: string, on: boolean): Promise<boolean> {
  try {
    const list = await listBackends();
    const b = list.find((x) => x.id === id);
    if (!b) return false;
    const { primaryFor, replicaFor } = getResourceRouting(b);
    const has = replicaFor.includes(resource);
    if (on === has) return true; // ya está en el estado pedido
    const nextReplica = on ? [...replicaFor, resource] : replicaFor.filter((r) => r !== resource);
    return updateBackend(b.id, { rules: { ...(b.rules ?? {}), primaryFor, replicaFor: nextReplica } });
  } catch {
    return false;
  }
}

export interface ResolvedBackends {
  /** Backend primario para el recurso (nunca null si hay al menos StarSeed). */
  primary: StorageBackend | null;
  /** Réplicas activas para el recurso (excluye al primario). */
  replicas: StorageBackend[];
  /** Por qué se eligió este primario (español, para la UI). */
  reason: string;
}

/**
 * Resuelve dónde vive un recurso: su backend PRIMARIO y sus RÉPLICAS. Prioridad
 * del primario:
 *   1) backend habilitado con `rules.primaryFor` que incluya el recurso;
 *   2) el primario de la cuenta (`is_primary`);
 *   3) el servidor oficial StarSeed (kind "starseed");
 *   4) el backend habilitado de menor `priority`.
 * Las réplicas = backends habilitados (≠ primario) con `rules.replicaFor` que
 * incluya el recurso. Acepta una lista pre-cargada para no releer. Nunca lanza.
 */
export async function resolveBackendFor(
  resource: ResourceType,
  preloaded?: StorageBackend[],
): Promise<ResolvedBackends> {
  let list = preloaded;
  if (!list) {
    list = await ensureDefaults();
    if (!list.length) list = await listBackends();
  }
  const enabled = list.filter((b) => b.enabled !== false);

  let primary: StorageBackend | null = null;
  let reason = "";

  const byResource = enabled.find((b) => getResourceRouting(b).primaryFor.includes(resource));
  if (byResource) {
    primary = byResource;
    reason = `Primario asignado a «${RESOURCE_TYPES.find((r) => r.id === resource)?.label ?? resource}».`;
  } else {
    const acctPrimary = enabled.find((b) => b.is_primary === true);
    if (acctPrimary) {
      primary = acctPrimary;
      reason = "Primario por defecto de la cuenta.";
    } else {
      const star = enabled.find((b) => b.kind === "starseed");
      if (star) {
        primary = star;
        reason = "Servidor oficial StarSeed (por defecto y automático).";
      } else {
        primary = [...enabled].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))[0] ?? null;
        reason = primary ? "Backend de mayor prioridad disponible." : "No hay ningún backend activo.";
      }
    }
  }

  const replicas = enabled.filter(
    (b) => b.id !== primary?.id && getResourceRouting(b).replicaFor.includes(resource),
  );

  return { primary, replicas, reason };
}

/* ══════════════ DRIVERS REALES vs ANDAMIAJE (Adenda 66 §13.1) ══════════════
 * A partir de aquí la capa deja de ser solo un registro: los backends con
 * DRIVER REAL hacen I/O de verdad. Hoy son dos:
 *   · `starseed` → Supabase del OS (bucket `os-files`): lo usa todo el sistema.
 *   · `gcs`      → Google Cloud Storage vía `/api/storage/gcs/sign` (URLs
 *                  firmadas V4; credencial solo en el servidor; prefijo `<uid>/`).
 * El resto SIGUEN siendo andamiaje (registro + selección) y así se declara en la
 * UI: nunca fingimos una escritura que no ocurre.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Kinds cuyo driver de lectura/escritura es REAL (no andamiaje). */
export const REAL_DRIVER_KINDS: string[] = ["starseed", "gcs"];

export function isRealBackend(kind: string): boolean {
  return REAL_DRIVER_KINDS.includes(kind);
}

export interface BackendIoResult {
  ok: boolean;
  /** Ruta final del objeto en el backend (si aplica). */
  path?: string;
  /** URL (firmada y temporal en GCS) para leer el objeto. */
  url?: string;
  error?: string;
  /** true si el backend NO tiene driver real: no se ha escrito nada (y se dice). */
  scaffold?: boolean;
}

export interface BackendTestResult {
  ok: boolean;
  /** Explicación honesta en español para la UI. */
  detail: string;
  real: boolean;
  /** Solo para GCS: de dónde sale la credencial en el servidor. */
  credentials?: GcsStatus["credentials"];
  bucket?: string;
  project?: string;
}

function scaffoldResult(b: StorageBackend): BackendIoResult {
  return {
    ok: false,
    scaffold: true,
    error: `El backend «${b.name}» (${kindById(b.kind)?.label ?? b.kind}) todavía es andamiaje: está registrado pero aún no tiene driver real de escritura. No se ha copiado nada.`,
  };
}

/**
 * PRUEBA DE CONEXIÓN REAL de un backend. Para GCS pide al servidor que firme una
 * URL de sonda (ejercita credencial + bucket de verdad). Para el oficial
 * StarSeed comprueba la sesión. Para el resto dice la verdad: andamiaje.
 */
export async function testBackend(b: StorageBackend): Promise<BackendTestResult> {
  if (b.kind === "gcs") {
    const st = await testGcs();
    if (st.ok) {
      return {
        ok: true,
        real: true,
        credentials: st.credentials,
        bucket: st.bucket,
        project: st.project,
        detail:
          st.credentials === "adc"
            ? `Conectado con la identidad del propio servidor (ADC · Cloud Run). Bucket ${st.bucket}.`
            : `Conectado con la clave de service account del servidor (GCP_SA_KEY_JSON). Bucket ${st.bucket}.`,
      };
    }
    return {
      ok: false,
      real: true,
      credentials: st.credentials,
      bucket: st.bucket,
      project: st.project,
      detail: st.error ?? "Google Cloud Storage no respondió.",
    };
  }
  if (b.kind === "starseed") {
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      return data?.user?.id
        ? { ok: true, real: true, detail: "Servidor oficial StarSeed (Supabase del OS): sesión válida y en uso." }
        : { ok: false, real: true, detail: "Sin sesión de Supabase." };
    } catch (e) {
      return { ok: false, real: true, detail: (e as Error)?.message ?? "Error al comprobar la sesión." };
    }
  }
  return {
    ok: false,
    real: false,
    detail: "Andamiaje: registrado y seleccionable, pero sin driver real de lectura/escritura todavía.",
  };
}

/** ESCRIBE un objeto en el backend indicado. Solo real donde hay driver real. */
export async function putObjectToBackend(
  b: StorageBackend,
  file: File | Blob,
  path: string,
  options: { contentType?: string; onProgress?: (pct: number) => void } = {},
): Promise<BackendIoResult> {
  if (b.kind === "gcs") {
    const res = await uploadToGcs(file, path, options);
    return { ok: res.ok, path: res.path, error: res.error };
  }
  return scaffoldResult(b);
}

/** URL de lectura de un objeto en el backend (firmada y temporal en GCS). */
export async function getObjectUrlFromBackend(b: StorageBackend, path: string): Promise<BackendIoResult> {
  if (b.kind === "gcs") {
    const res = await getGcsUrl(path);
    return { ok: res.ok, url: res.url, path: res.path, error: res.error };
  }
  return scaffoldResult(b);
}

/** BORRA un objeto del backend (best-effort; el error se devuelve, no se traga). */
export async function deleteObjectFromBackend(b: StorageBackend, path: string): Promise<BackendIoResult> {
  if (b.kind === "gcs") {
    const res = await deleteFromGcs(path);
    return { ok: res.ok, path: res.path, error: res.error };
  }
  return scaffoldResult(b);
}

/**
 * Réplicas CON DRIVER REAL activas para un tipo de recurso (excluye el primario
 * y el oficial StarSeed, que ya es la copia primaria del OS). Es lo que usa
 * `os-files.ts` para replicar de verdad una subida.
 */
export async function realReplicasFor(
  resource: ResourceType,
  preloaded?: StorageBackend[],
): Promise<StorageBackend[]> {
  try {
    const { primary, replicas } = await resolveBackendFor(resource, preloaded);
    return replicas.filter((b) => b.id !== primary?.id && isRealBackend(b.kind) && b.kind !== "starseed");
  } catch {
    return [];
  }
}
