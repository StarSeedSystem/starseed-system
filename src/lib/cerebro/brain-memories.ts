"use client";

/**
 * CEREBRO · MEMORIAS DEL HUB (tabla `memories`) — filtradas POR CEREBRO.
 * ============================================================================
 * El Memory Hub (antes en /memorias, src/components/exocortex/memory-hub.tsx)
 * opera sobre la tabla `memories`. Aquí lo llevamos DENTRO de un cerebro: las
 * memorias del cerebro son las de scope='brain' + scope_ref=brainId, MÁS las
 * enlazadas explícitamente en brain.includes.memories[] (adoptadas).
 *
 * SIN DDL: reutiliza las columnas existentes de `memories`
 * (owner, name, scope, scope_ref, kinds[], format, storage[], sync, config, content).
 * Compatibilidad total con el Hub de cuenta: una memoria de cuenta se "adopta"
 * a un cerebro poniéndole scope='brain'/scope_ref=brainId y/o añadiéndola a
 * includes.memories[] del cerebro (regla de singularidad: se referencia, no se
 * duplica).
 *
 * SSR-safe + defensivo: nunca lanza; cae a [] / null ante cualquier error.
 */

import { createClient } from "@/utils/supabase/client";
import { getBrain, saveBrain, type Brain } from "@/lib/brains/brains";

/* ------------------------------------------------------------------ */
/* Tipos (misma forma que memory-hub.tsx, ampliada con scope_ref)       */
/* ------------------------------------------------------------------ */

export type GithubConfig = { repo?: string; branch?: string; path?: string };
export type MemoryConfig = { github?: GithubConfig } & Record<string, unknown>;

export interface HubMemory {
  id: string;
  owner?: string;
  name: string;
  scope: string;
  scope_ref: string | null;
  kinds: string[];
  format: string;
  storage: string[];
  sync: boolean;
  config: MemoryConfig | null;
  content: string | null;
  created_at?: string;
  updated_at?: string;
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

function normalizeMemory(row: Record<string, unknown>): HubMemory {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "Memoria",
    scope: (row.scope as string) || "account",
    scope_ref: (row.scope_ref as string) ?? null,
    kinds: Array.isArray(row.kinds) ? (row.kinds as string[]) : [],
    format: (row.format as string) || "markdown",
    storage: Array.isArray(row.storage) ? (row.storage as string[]) : ["account"],
    sync: !!row.sync,
    config: (row.config as MemoryConfig) ?? {},
    content: (row.content as string) ?? "",
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
  };
}

/** ¿La memoria pertenece a este cerebro (por scope/scope_ref o por includes)? */
export function isBrainMemory(m: HubMemory, brainId: string | null, includes?: string[]): boolean {
  if (!brainId) return false;
  if (m.scope === "brain" && m.scope_ref === brainId) return true;
  if (includes && includes.includes(m.id)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

/** TODAS las memorias del propietario (para el selector "adoptar de la cuenta"). */
export async function listAllMemories(): Promise<HubMemory[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("memories")
      .select("*")
      .eq("owner", owner)
      .order("created_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map(normalizeMemory);
  } catch {
    return [];
  }
}

/**
 * Memorias de un cerebro: scope='brain' & scope_ref=brainId UNIÓN las enlazadas
 * en includes.memories[]. Devuelve la lista deduplicada. Si brainId es null,
 * devuelve las memorias de cuenta (scope='account' o sin scope de cerebro).
 */
export async function listBrainMemories(brainId: string | null): Promise<HubMemory[]> {
  try {
    const all = await listAllMemories();
    if (!brainId) {
      // Vista de cuenta: memorias que NO están adoptadas por ningún cerebro.
      return all.filter((m) => m.scope !== "brain");
    }
    let includes: string[] = [];
    try {
      const brain = await getBrain(brainId);
      includes = Array.isArray(brain?.includes?.memories) ? brain!.includes.memories : [];
    } catch {
      /* sin cerebro: solo por scope */
    }
    return all.filter((m) => isBrainMemory(m, brainId, includes));
  } catch {
    return [];
  }
}

/** Memorias de cuenta candidatas a ADOPTAR (no pertenecen ya a este cerebro). */
export async function listAdoptableMemories(brainId: string | null, includes: string[] = []): Promise<HubMemory[]> {
  const all = await listAllMemories();
  return all.filter((m) => !isBrainMemory(m, brainId, includes));
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

export interface CreateBrainMemoryInput {
  brainId: string | null;
  name: string;
  kinds: string[];
  format?: string;
  storage?: string[];
  sync?: boolean;
  content?: string;
  config?: MemoryConfig;
}

/** Crea una memoria ATADA al cerebro (scope='brain', scope_ref=brainId). */
export async function createBrainMemory(input: CreateBrainMemoryInput): Promise<HubMemory | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      name: (input.name || "Memoria").trim(),
      scope: input.brainId ? "brain" : "account",
      scope_ref: input.brainId ?? null,
      kinds: input.kinds ?? [],
      format: input.format || "markdown",
      storage: input.storage ?? ["account"],
      sync: input.sync ?? true,
      content: input.content ?? "",
      config: input.config ?? {},
    };
    const { data } = await sb.from("memories").insert(payload).select("*").single();
    return data ? normalizeMemory(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Actualiza campos arbitrarios de una memoria (content, kinds, storage, config, sync…). */
export async function updateMemory(id: string, patch: Partial<HubMemory>): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const clean: Record<string, unknown> = {};
    for (const k of ["name", "kinds", "format", "storage", "sync", "content", "config", "scope", "scope_ref"] as const) {
      if (k in patch && patch[k] !== undefined) clean[k] = patch[k];
    }
    if (Object.keys(clean).length === 0) return true;
    const { error } = await sb.from("memories").update(clean).eq("owner", owner).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("memories").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Adoptar / soltar (cerebro ↔ memoria)                                */
/* ------------------------------------------------------------------ */

/**
 * ADOPTA una memoria de cuenta a un cerebro. Por defecto la ENLAZA (añade su id
 * a includes.memories[], no la mueve — respeta la singularidad de la entidad).
 * Con `move:true` además le pone scope='brain'/scope_ref=brainId (pasa a "vivir"
 * en el cerebro). Devuelve el cerebro actualizado o null.
 */
export async function adoptMemoryToBrain(
  brainId: string,
  memoryId: string,
  opts?: { move?: boolean },
): Promise<Brain | null> {
  try {
    const brain = await getBrain(brainId);
    if (!brain) return null;
    const current = Array.isArray(brain.includes.memories) ? brain.includes.memories : [];
    const memories = current.includes(memoryId) ? current : [...current, memoryId];
    const updated = await saveBrain({ ...brain, includes: { ...brain.includes, memories } });
    if (opts?.move) {
      await updateMemory(memoryId, { scope: "brain", scope_ref: brainId });
    }
    return updated;
  } catch {
    return null;
  }
}

/**
 * SUELTA una memoria del cerebro: la quita de includes.memories[] y, si estaba
 * "movida" (scope='brain'), la devuelve a la cuenta (scope='account'). No
 * borra la memoria (justicia restaurativa: dejar de referenciar ≠ destruir).
 */
export async function releaseMemoryFromBrain(brainId: string, memoryId: string): Promise<Brain | null> {
  try {
    const brain = await getBrain(brainId);
    if (!brain) return null;
    const current = Array.isArray(brain.includes.memories) ? brain.includes.memories : [];
    const memories = current.filter((id) => id !== memoryId);
    const updated = await saveBrain({ ...brain, includes: { ...brain.includes, memories } });
    // Si la memoria estaba atada por scope al cerebro, la liberamos a cuenta.
    await updateMemory(memoryId, { scope: "account", scope_ref: null });
    return updated;
  } catch {
    return null;
  }
}
