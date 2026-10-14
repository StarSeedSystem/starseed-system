"use client";

import { createClient } from "@/utils/supabase/client";
import { senalEsencial } from "@/lib/consumo/guardian";
import type { Brain } from "@/lib/brains/brains";

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function normalizeIncludes(raw: unknown) {
  const r = (raw || {}) as Partial<Brain["includes"]>;
  const arr = (v: unknown): string[] => Array.isArray(v) ? v as string[] : [];
  return {
    vaults: arr(r.vaults),
    backends: arr(r.backends),
    personalities: arr(r.personalities),
    runtimes: arr(r.runtimes),
    tokens: arr(r.tokens),
    memories: arr(r.memories),
    connections: arr(r.connections),
    bindScope: !!r.bindScope,
    permissions: (r.permissions as Brain["includes"]["permissions"]) ?? [],
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
    config: (row.config as Record<string, unknown>) || {},
    includes: normalizeIncludes(row.includes),
    servers: Array.isArray(row.servers) ? (row.servers as Brain["servers"]) : [],
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
  };
}

export async function listarCerebrosCompartidos(): Promise<{ ok: boolean; brains: Array<Brain & { compartido: true }> }> {
  try {
    const owner = await uid();
    if (!owner) return { ok: false, brains: [] };
    const sb = createClient();
    const { data, error } = await sb
      .from("brains")
      .select("*")
      .neq("owner", owner)
      .order("created_at")
      .abortSignal(senalEsencial());
    if (error || !Array.isArray(data)) return { ok: false, brains: [] };
    const brains = (data as Record<string, unknown>[]).map(normalizeBrain);
    return { ok: true, brains: brains.map(b => ({ ...b, compartido: true })) };
  } catch {
    return { ok: false, brains: [] };
  }
}

export function esCompartido(b: { owner?: string | null }, yo: string): boolean {
  return (b.owner ?? null) !== yo;
}
