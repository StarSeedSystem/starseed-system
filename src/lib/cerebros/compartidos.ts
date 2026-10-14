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

function normalizeBrain(row: Record<string, unknown>): Brain {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "Cerebro",
    scope: (row.scope as string) || "account",
    scope_ref: (row.scope_ref as string) ?? null,
    description: (row.description as string) || "",
    config: (row.config as Record<string, unknown>) || {},
    includes: (row.includes as Brain["includes"]) || {
      vaults: [],
      backends: [],
      personalities: [],
      runtimes: [],
      tokens: [],
      memories: [],
      connections: [],
      bindScope: false,
      permissions: [],
    },
    servers: Array.isArray(row.servers) ? (row.servers as Brain["servers"]) : [],
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
      .order("created_at", { ascending: false })
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
