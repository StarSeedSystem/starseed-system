"use client";

/**
 * CRUD de Personalidades de Aurora + ajustes, sobre Supabase (RLS por owner).
 * Sigue el patrón de vaults-panel.tsx / memory-hub.tsx.
 */

import { createClient } from "@/utils/supabase/client";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SETTINGS,
  VOICE_DEFAULT,
  personalityToMarkdown,
  type AuroraSettings,
  type Personality,
} from "./types";

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function normalize(row: Record<string, unknown>): Personality {
  return {
    ...DEFAULT_PERSONALITY,
    ...(row as Partial<Personality>),
    voice: { ...VOICE_DEFAULT, ...((row.voice as object) || {}) },
    params: { ...DEFAULT_PERSONALITY.params, ...((row.params as object) || {}) },
    emotions: { ...DEFAULT_PERSONALITY.emotions, ...((row.emotions as object) || {}) },
    tags: (row.tags as string[]) || [],
  } as Personality;
}

export async function listPersonalities(): Promise<Personality[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("aurora_personalities")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map(normalize);
  } catch {
    return [];
  }
}

export async function getPersonality(id: string): Promise<Personality | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_personalities")
      .select("*")
      .eq("owner", owner)
      .eq("id", id)
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Inserta o actualiza una personalidad. Devuelve la fila guardada (o null). */
export async function savePersonality(p: Personality): Promise<Personality | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      name: p.name || "Aurora",
      scope: p.scope || "account",
      scope_ref: p.scope_ref ?? null,
      provider: p.provider || "browser",
      voice: p.voice || VOICE_DEFAULT,
      character: p.character || "",
      params: p.params || {},
      emotions: p.emotions || {},
      system_prompt: p.system_prompt || "",
      vault_id: p.vault_id ?? null,
      content: personalityToMarkdown(p),
      tags: p.tags || [],
      is_template: !!p.is_template,
      updated_at: new Date().toISOString(),
    };
    if (p.id) {
      const { data } = await sb
        .from("aurora_personalities")
        .update(payload)
        .eq("id", p.id)
        .eq("owner", owner)
        .select("*")
        .single();
      return data ? normalize(data as Record<string, unknown>) : null;
    }
    const { data } = await sb
      .from("aurora_personalities")
      .insert(payload)
      .select("*")
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function updatePersonality(id: string, patch: Partial<Personality>): Promise<Personality | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_personalities")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", owner)
      .select("*")
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function deletePersonality(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("aurora_personalities").delete().eq("id", id).eq("owner", owner);
    return true;
  } catch {
    return false;
  }
}

export async function duplicatePersonality(p: Personality): Promise<Personality | null> {
  const copy: Personality = {
    ...p,
    id: undefined,
    name: `${p.name} (copia)`,
    is_template: false,
  };
  return savePersonality(copy);
}

/** Asigna la personalidad a un baúl (vault). */
export async function assignToVault(id: string, vaultId: string | null): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb
      .from("aurora_personalities")
      .update({ vault_id: vaultId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", owner);
    return true;
  } catch {
    return false;
  }
}

/** Guarda la personalidad como una memoria .md (markdown) en `memories`. */
export async function saveAsMemory(p: Personality): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("memories").insert({
      owner,
      name: `Personalidad · ${p.name}`,
      kinds: ["md"],
      format: "markdown",
      storage: ["account"],
      sync: true,
      vault_id: p.vault_id ?? null,
      content: personalityToMarkdown(p),
      config: {},
      scope: "account",
    });
    return true;
  } catch {
    return false;
  }
}

export async function getSettings(): Promise<AuroraSettings> {
  try {
    const owner = await uid();
    if (!owner) return { ...DEFAULT_SETTINGS };
    const sb = createClient();
    const { data } = await sb
      .from("aurora_settings")
      .select("*")
      .eq("owner", owner)
      .single();
    if (!data) return { ...DEFAULT_SETTINGS };
    return {
      ...DEFAULT_SETTINGS,
      ...(data as Partial<AuroraSettings>),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<AuroraSettings>): Promise<AuroraSettings | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { data } = await sb
      .from("aurora_settings")
      .upsert(payload, { onConflict: "owner" })
      .select("*")
      .single();
    return data ? ({ ...DEFAULT_SETTINGS, ...(data as Partial<AuroraSettings>) }) : null;
  } catch {
    return null;
  }
}

export type VaultLite = { id: string; name: string };

export async function listVaults(): Promise<VaultLite[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("vaults")
      .select("id,name")
      .eq("owner", owner)
      .order("created_at", { ascending: false });
    return (data as VaultLite[]) || [];
  } catch {
    return [];
  }
}

/** Busca memorias por texto (ilike) y devuelve nombres. */
export async function searchMemories(q: string, limit = 5): Promise<{ id: string; name: string }[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("memories")
      .select("id,name")
      .eq("owner", owner)
      .ilike("name", `%${q}%`)
      .limit(limit);
    return (data as { id: string; name: string }[]) || [];
  } catch {
    return [];
  }
}

/** Crea una memoria markdown rápida (usada por el comando "crea memoria"). */
export async function createQuickMemory(name: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("memories").insert({
      owner,
      name: name.trim() || "Memoria",
      kinds: ["memory", "md"],
      format: "markdown",
      storage: ["account"],
      sync: true,
      content: "",
      config: {},
      scope: "account",
    });
    return true;
  } catch {
    return false;
  }
}
