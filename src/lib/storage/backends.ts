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

export type StorageKindId =
  | "starseed"
  | "gdrive"
  | "local"
  | "github"
  | "obsidian"
  | "webdav"
  | "s3"
  | "custom";

export type StorageScope = "account" | "profile" | "group" | "page";

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
  rules: Record<string, unknown> | null;
  enabled: boolean;
  status: string | null;
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
    fields: [{ key: "folderId", label: "Carpeta (ID, opcional)" }],
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
      { key: "syncthingFolderId", label: "Carpeta Syncthing (opcional)" },
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
    blurb: "Tu bóveda de Obsidian (markdown). Vía carpeta local o repositorio GitHub.",
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
      updated_at: new Date().toISOString(),
    });
    return listBackends();
  } catch {
    return [];
  }
}
