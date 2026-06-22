// StarSeed · Configuración de gobernanza por contexto (modo + parámetros).

import { createClient } from "@/utils/supabase/client";
import {
  DEFAULT_GOV_PARAMS,
  type GovernanceConfig,
  type GovernanceMode,
} from "./types";

// Lee la configuración de gobernanza de un contexto. Para páginas/comunidades,
// si no hay fila propia se intenta derivar de pages.governance.
export async function getConfig(
  scope: string,
  scopeRef?: string | null,
): Promise<GovernanceConfig> {
  const supabase = createClient();
  const ref = scopeRef ?? null;
  try {
    const { data } = await supabase
      .from("governance_configs")
      .select("id, scope, scope_ref, mode, params, owner, updated_at")
      .eq("scope", scope)
      .eq("scope_ref", ref)
      .maybeSingle();

    if (data) {
      return {
        id: data.id,
        scope: data.scope,
        scope_ref: data.scope_ref,
        mode: (data.mode as GovernanceMode) ?? "democratic",
        params: { ...DEFAULT_GOV_PARAMS, ...((data.params as Record<string, unknown>) ?? {}) },
        owner: data.owner,
        updated_at: data.updated_at,
      };
    }

    // Fallback: páginas/comunidades pueden tener governance embebido.
    if ((scope === "page" || scope === "community") && ref) {
      const { data: page } = await supabase
        .from("pages")
        .select("governance")
        .eq("id", ref)
        .maybeSingle();
      const gov = (page?.governance as Record<string, unknown>) ?? {};
      return {
        scope,
        scope_ref: ref,
        mode: ((gov.mode as GovernanceMode) ?? "democratic"),
        params: { ...DEFAULT_GOV_PARAMS, ...((gov.params as Record<string, unknown>) ?? {}) },
      };
    }
  } catch {
    /* sin sesión / error transitorio */
  }

  return {
    scope,
    scope_ref: ref,
    mode: "democratic",
    params: { ...DEFAULT_GOV_PARAMS },
  };
}

// Guarda (upsert) la configuración de gobernanza de un contexto.
export async function saveConfig(
  scope: string,
  scopeRef: string | null | undefined,
  mode: GovernanceMode,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const ref = scopeRef ?? null;
  try {
    const { data: au } = await supabase.auth.getUser();
    const owner = au?.user?.id ?? null;
    // Garantizar que siempre exista la opción democrática.
    const merged = { ...DEFAULT_GOV_PARAMS, ...params, allowDemocraticOverride: true };
    const { error } = await supabase.from("governance_configs").upsert(
      {
        scope,
        scope_ref: ref,
        mode,
        params: merged,
        owner,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scope,scope_ref" },
    );
    if (error) return { ok: false, error: error.message };

    // Reflejar en pages.governance para páginas/comunidades (best-effort).
    if ((scope === "page" || scope === "community") && ref) {
      try {
        await supabase.from("pages").update({ governance: { mode, params: merged } }).eq("id", ref);
      } catch {
        /* best-effort */
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "error al guardar la configuración" };
  }
}

export async function getMode(scope: string, scopeRef?: string | null): Promise<GovernanceMode> {
  const cfg = await getConfig(scope, scopeRef);
  return cfg.mode;
}

export async function isDemocratic(scope: string, scopeRef?: string | null): Promise<boolean> {
  return (await getMode(scope, scopeRef)) === "democratic";
}

// Número de participantes elegibles del contexto (para cálculo de quórum).
// page/community → page_members; group → group_members; otros → null (sin censo).
export async function eligibleCount(
  scope: string,
  scopeRef?: string | null,
): Promise<number | null> {
  const ref = scopeRef ?? null;
  if (!ref) return null;
  const supabase = createClient();
  try {
    if (scope === "page" || scope === "community") {
      const { count } = await supabase
        .from("page_members")
        .select("profile_id", { count: "exact", head: true })
        .eq("page_id", ref);
      return count ?? null;
    }
    if (scope === "group") {
      const { count } = await supabase
        .from("group_members")
        .select("member", { count: "exact", head: true })
        .eq("group_id", ref);
      return count ?? null;
    }
  } catch {
    /* */
  }
  return null;
}
