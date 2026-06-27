"use client";

/**
 * CEREBRO · CONTEXTO — configuración POR SENTIDO de los sentidos de Aurora.
 *
 * Extiende src/lib/senses/senses.ts (que persiste el interruptor maestro
 * enable/aurora/astraura por sentido en `senses_settings`). Aquí cada sentido se
 * configura por SEPARADO con:
 *   - un PROVEEDOR/servicio (navegador nativo, Sakana-Fugu, Sakana propio,
 *     servidor de sentidos externo, o uno personalizado), y
 *   - un CONTEXTO (endpoint, modelo, pool de agentes, opt-out, notas…).
 * Además se pueden AÑADIR sentidos nuevos (custom) y activar el modo
 * "emociones" (concepto Sakana): el sentido se auto-ajusta según tus
 * preferencias/configs/contextos específicos.
 *
 * Persistencia: tabla `brain_senses` (owner, sense, enabled, provider, context
 * jsonb, emotions_mode, updated_at) con RLS por owner + realtime. Sigue el patrón
 * defensivo del resto de libs.
 */

import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */
/* Proveedores de sentido                                              */
/* ------------------------------------------------------------------ */

export type SenseProvider =
  | "browser"
  | "sakana-fugu"
  | "sakana-self"
  | "external"
  | string;

export interface SenseProviderDef {
  id: SenseProvider;
  label: string;
  blurb: string;
  icon: string;
  /** ¿open-source / autoalojable / propio? */
  oss: boolean;
  /** Campos de `context` que este proveedor necesita. */
  fields: { key: string; label: string; placeholder?: string }[];
}

/**
 * Catálogo de proveedores que pueden alimentar un sentido. "Sakana Fugu" se
 * modela como un MOTOR de sentidos avanzado seleccionable (multi-agente como un
 * modelo, API compatible con OpenAI, pool de agentes con opt-out). También hay
 * una opción "Sakana propio" (built-in tipo Sakana, por usuario) y servidores de
 * sentidos externos (gratuitos, configurables).
 */
export const SENSE_PROVIDERS: SenseProviderDef[] = [
  {
    id: "browser",
    label: "Navegador (nativo)",
    blurb:
      "Capacidad real del navegador (getUserMedia, geolocation, portapapeles…). Privado, sin servicios externos.",
    icon: "🧭",
    oss: true,
    fields: [],
  },
  {
    id: "sakana-fugu",
    label: "Sakana Fugu (motor avanzado)",
    blurb:
      "Motor de sentidos multi-agente «como un modelo»: orquesta dinámicamente los mejores modelos para interpretar el sentido. API compatible con OpenAI; puedes excluir proveedores del pool (opt-out). Selecciónalo como motor por sentido.",
    icon: "🐡",
    oss: false,
    fields: [
      { key: "endpoint", label: "Endpoint (OpenAI-compat)", placeholder: "https://api.sakana.ai/v1" },
      { key: "model", label: "Modelo", placeholder: "fugu | fugu-ultra" },
      { key: "tokenRef", label: "Clave (nombre en la bóveda)", placeholder: "nunca el valor en claro" },
      { key: "optOut", label: "Excluir del pool (coma-separado)", placeholder: "proveedor1, proveedor2" },
    ],
  },
  {
    id: "sakana-self",
    label: "Sakana propio (built-in, por usuario)",
    blurb:
      "Motor estilo Sakana integrado y gratuito por usuario: orquesta tus propios modelos/agentes (p.ej. Ollama) sin depender de un único proveedor. Open-source-first.",
    icon: "🌀",
    oss: true,
    fields: [
      { key: "agentPool", label: "Pool de agentes (coma-separado)", placeholder: "ollama:llama3, ollama:llava" },
      { key: "endpoint", label: "Endpoint local del orquestador", placeholder: "http://localhost:8800/senses" },
    ],
  },
  {
    id: "external",
    label: "Servidor de sentidos externo",
    blurb:
      "Integra un servidor de sentidos externo (gratuito, configurable). Tú defines el endpoint y el contexto; el cerebro lo usa para ese sentido.",
    icon: "🌐",
    oss: true,
    fields: [
      { key: "endpoint", label: "Endpoint del servidor", placeholder: "https://tu-servidor/senses" },
      { key: "tokenRef", label: "Clave (nombre en la bóveda)" },
      { key: "notes", label: "Notas / contexto" },
    ],
  },
];

export function senseProviderById(id: string): SenseProviderDef | undefined {
  return SENSE_PROVIDERS.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface BrainSense {
  id: string;
  owner?: string;
  sense: string;
  label: string | null;
  enabled: boolean;
  provider: SenseProvider;
  /** { endpoint, model, agentPool, optOut, notes, ... } según proveedor. */
  context: Record<string, unknown>;
  /** Modo "emociones": auto-ajuste por preferencias/contexto. */
  emotions_mode: boolean;
  updated_at?: string;
  created_at?: string;
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

function normalize(row: Record<string, unknown>): BrainSense {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    sense: (row.sense as string) || "",
    label: (row.label as string) ?? null,
    enabled: !!row.enabled,
    provider: (row.provider as string) || "browser",
    context: (row.context as Record<string, unknown>) || {},
    emotions_mode: !!row.emotions_mode,
    updated_at: (row.updated_at as string) ?? undefined,
    created_at: (row.created_at as string) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

/** Configs por-sentido del usuario (una fila por `sense`, único por owner+sense). */
export async function listBrainSenses(): Promise<BrainSense[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("brain_senses")
      .select("*")
      .eq("owner", owner)
      .order("sense", { ascending: true });
    return ((data as Record<string, unknown>[]) || []).map(normalize);
  } catch {
    return [];
  }
}

/**
 * Inserta/actualiza la config de un sentido. Upsert por (owner, sense) — así un
 * sentido nunca se duplica y se puede reconfigurar libremente.
 */
export async function upsertBrainSense(s: Partial<BrainSense>): Promise<BrainSense | null> {
  try {
    const owner = await uid();
    if (!owner || !s.sense) return null;
    const sb = createClient();
    const payload = {
      owner,
      sense: s.sense,
      label: s.label ?? null,
      enabled: !!s.enabled,
      provider: s.provider || "browser",
      context: s.context ?? {},
      emotions_mode: !!s.emotions_mode,
      updated_at: new Date().toISOString(),
    };
    const { data } = await sb
      .from("brain_senses")
      .upsert(payload, { onConflict: "owner,sense" })
      .select("*")
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Elimina una config de sentido (útil para sentidos custom). */
export async function deleteBrainSense(sense: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("brain_senses").delete().eq("owner", owner).eq("sense", sense);
    return true;
  } catch {
    return false;
  }
}
