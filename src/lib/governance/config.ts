// StarSeed · Configuración de gobernanza por contexto (modo + parámetros).

import { createClient } from "@/utils/supabase/client";
import { countMembersFromMemberships } from "./membership";
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
// FUENTE PRINCIPAL: `os_memberships` por `group_slug` (el ingreso real a cualquier
// entidad escribe ahí, keyed por el slug que este motor recibe como scopeRef). Cuenta
// por cuenta (user_id): una persona, una voz.
// FALLBACK (aditivo): si no hay filas en os_memberships para este scope, se conserva el
// censo histórico page/community → page_members; group → group_members. otros → null.
export async function eligibleCount(
  scope: string,
  scopeRef?: string | null,
): Promise<number | null> {
  const ref = scopeRef ?? null;
  if (!ref) return null;

  // Principal: censo real desde os_memberships (por slug). `null` = 0 filas o error.
  const primary = await countMembersFromMemberships(ref);
  // Censo histórico (grupos/páginas del esquema antiguo por uuid). `null` = 0 o error.
  const legacy = await legacyEligibleCount(scope, ref);

  // ANTI-DEFLACIÓN (revisión adversarial Adenda 124): NUNCA dejar que un censo
  // PARCIAL de os_memberships (p.ej. sólo el creador, sembrado por
  // ensureCreatorMembership) SUSTITUYA un censo legado MAYOR — eso hundiría el
  // quórum y una propuesta podría aprobarse/expirar contra un cuerpo ficticio de 1
  // cuando la comunidad real tiene 100. Se toma el MAYOR de las dos poblaciones
  // conocidas. `null` sólo si NINGUNA se conoce (censo desconocido) → el motor no
  // debe finalizar a ciegas (ver guarda en engine.tryResolve).
  if (primary == null && legacy == null) return null;
  return Math.max(primary ?? 0, legacy ?? 0);
}

// Censo histórico por uuid (page/community → page_members; group → group_members).
// Devuelve el nº de filas, o `null` si no hay filas o la lectura falla (para que
// eligibleCount pueda distinguir "sin datos legados" de un recuento real > 0).
async function legacyEligibleCount(
  scope: string,
  ref: string,
): Promise<number | null> {
  const supabase = createClient();
  try {
    if (scope === "page" || scope === "community") {
      const { count } = await supabase
        .from("page_members")
        .select("profile_id", { count: "exact", head: true })
        .eq("page_id", ref);
      return count && count > 0 ? count : null;
    }
    if (scope === "group") {
      const { count } = await supabase
        .from("group_members")
        .select("member", { count: "exact", head: true })
        .eq("group_id", ref);
      return count && count > 0 ? count : null;
    }
  } catch {
    /* sin sesión / error transitorio */
  }
  return null;
}
