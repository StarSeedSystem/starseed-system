"use client";

import { createClient } from "@/utils/supabase/client";
import { senalEsencial } from "@/lib/consumo/guardian";

/**
 * Cerebros compartidos contigo: lectura de cerebros que otros te han compartido
 * o que son públicos de grupos/comunidades que gestionas.
 */

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface BrainCompartido {
  id: string;
  owner?: string;
  name: string;
  scope: string;
  scope_ref: string | null;
  description: string;
  config: Record<string, unknown>;
  includes: {
    vaults: string[];
    backends: string[];
    personalities: string[];
    runtimes: string[];
    tokens: string[];
    memories: string[];
    connections: string[];
    bindScope: boolean;
    permissions: unknown;
    aiProvider?: string;
  };
  servers: Array<{
    id: string;
    kind: string;
    name: string;
    endpoint?: string;
    keyRef?: string;
    status?: string;
    notes?: string;
    [k: string]: unknown;
  }>;
  created_at?: string;
  updated_at?: string;
  /** Marca que indica que este cerebro se comparte contigo */
  compartido: true;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
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

/**
 * Normaliza un cerebro proveniente de la base de datos a la forma mínima
 * requerida para la lista de compartidos. Igual que normalizeBrain en
 * brains.ts pero exportado aquí para reutilización.
 */
interface Includes {
  vaults: string[];
  backends: string[];
  personalities: string[];
  runtimes: string[];
  tokens: string[];
  memories: string[];
  connections: string[];
  bindScope: boolean;
  permissions: unknown;
  aiProvider?: string;
}

interface Server {
  id: string;
  kind: string;
  name: string;
  endpoint?: string;
  keyRef?: string;
  status?: string;
  notes?: string;
  [k: string]: unknown;
}

function normalizeBrainCompartido(row: Record<string, unknown>): BrainCompartido {
  const includes = (row.includes || {}) as Partial<Includes>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  const servers = (row.servers || []) as Server[];
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "Cerebro",
    scope: (row.scope as string) || "account",
    scope_ref: (row.scope_ref as string) ?? null,
    description: (row.description as string) || "",
    config: ((row.config as Record<string, unknown>) || {}),
    includes: {
      vaults: arr(includes.vaults),
      backends: arr(includes.backends),
      personalities: arr(includes.personalities),
      runtimes: arr(includes.runtimes),
      tokens: arr(includes.tokens),
      memories: arr(includes.memories),
      connections: arr(includes.connections),
      bindScope: !!includes.bindScope,
      permissions: includes.permissions ?? [],
      aiProvider: includes.aiProvider ?? undefined,
    },
    servers: servers,
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
    compartido: true,
  };
}

/* ------------------------------------------------------------------ */
/* API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Lista los cerebros compartidos contigo (excluyendo los propios).
 * Usa la RLS `br_compartido_leer` que ya filtra por lo compartido y lo público.
 * Solo falta el filtro de owner en el cliente para excluir los propios.
 *
 * @returns Promesa con { ok, brains } donde brains es un array de BrainCompartido.
 */
export async function listarCerebrosCompartidos(): Promise<{
  ok: boolean;
  brains: BrainCompartido[];
}> {
  try {
    const owner = await uid();
    if (!owner) return { ok: false, brains: [] };
    const sb = createClient();
    const { data, error } = await sb
      .from("brains")
      .select("*")
      .neq("owner", owner)
      .order("created_at", { ascending: true })
      .abortSignal(senalEsencial());
    if (error || !Array.isArray(data)) return { ok: false, brains: [] };
    return {
      ok: true,
      brains: (data as Record<string, unknown>[]).map(normalizeBrainCompartido),
    };
  } catch {
    return { ok: false, brains: [] };
  }
}

/**
 * Función pura que determina si un cerebro se comparte contigo.
 * @param brain Cerebro a verificar
 * @param yo Tu ID de usuario
 * @returns true si el cerebro se comparte contigo (no eres el owner)
 */
export function esCompartido(brain: { owner?: string }, yo: string): boolean {
  return !!brain.owner && brain.owner !== yo;
}