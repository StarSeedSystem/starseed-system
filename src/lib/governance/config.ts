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

// ── VERJA DE PROPIEDAD del ámbito (Adenda 127 · hallazgo adversarial) ─────────
// saveConfig() hacía UPSERT en governance_configs SIN comprobar propiedad: un
// usuario autenticado podía sobrescribir la gobernanza de CUALQUIER ámbito
// (activar mérito, o peor: bajar quórum/umbral o cambiar el modo). Las funciones
// siguientes resuelven si el llamador es dueño del ámbito. Son ADITIVAS y
// DEFENSIVAS: sólo BLOQUEAN con determinación POSITIVA de "no es el dueño"; ante
// CUALQUIER incertidumbre hacen FAIL-OPEN (ALLOW), porque la barrera DURA es la
// RLS del servidor (migración 20260801150000). Nunca deben romper a un dueño legítimo.

type EntityOwnership = "owner" | "not-owner" | "unknown";
type ConfigOwnership = "me" | "other" | "none" | "unknown";

// ¿La cadena tiene forma de UUID? Se usa para NO enviar un slug de texto a la
// columna `id` (uuid): un cast inválido convertiría la consulta en error y, por
// fail-open, en un ALLOW silencioso que debilitaría la verja. Consultando `id`
// sólo con uuids reales, la verja sigue siendo efectiva tanto para refs-slug
// (por la columna de texto) como para refs-uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Busca la entidad por slug y, si `ref` es uuid, por id; devuelve su owner_id.
// Defensivo: error transitorio o tabla/columna ausente ⇒ { found:false }.
async function entityOwnerInTable(
  table: string,
  ref: string,
): Promise<{ found: boolean; ownerId: string | null }> {
  const supabase = createClient();
  // 1) Por slug (columna de texto — segura para cualquier cadena).
  try {
    const bySlug = await supabase.from(table).select("owner_id").eq("slug", ref).maybeSingle();
    if (!bySlug.error && bySlug.data) {
      return { found: true, ownerId: (bySlug.data as { owner_id?: string | null }).owner_id ?? null };
    }
  } catch {
    /* error transitorio → probamos por id */
  }
  // 2) Por id (columna uuid) SÓLO si `ref` es un uuid (evita el cast inválido).
  if (UUID_RE.test(ref)) {
    try {
      const byId = await supabase.from(table).select("owner_id").eq("id", ref).maybeSingle();
      if (!byId.error && byId.data) {
        return { found: true, ownerId: (byId.data as { owner_id?: string | null }).owner_id ?? null };
      }
    } catch {
      /* error transitorio → no encontrado */
    }
  }
  return { found: false, ownerId: null };
}

// Tablas candidatas por ámbito. VERIFICADO: `community` vive en os_groups
// (create-entity-dialog inserta kind:"community" en os_groups); históricamente
// se asoció a páginas, así que para máxima cobertura comprobamos AMBAS. Otros
// ámbitos (message/account/global) no tienen una entidad simple con owner.
function scopeTables(scope: string): string[] {
  if (scope === "group") return ["os_groups"];
  if (scope === "page") return ["os_pages"];
  if (scope === "community") return ["os_pages", "os_groups"];
  return [];
}

// Propiedad de la ENTIDAD del ámbito. "Gana el propietario": si alguna tabla
// candidata muestra owner===uid ⇒ 'owner' (nunca bloqueamos por una improbable
// colisión de slug entre tablas). 'not-owner' sólo si alguna entidad existe con
// OTRO dueño y ninguna es del llamador. 'unknown' si no hay ref, no hay tabla
// candidata, o no se encontró/no se pudo determinar (⇒ fail-open aguas arriba).
async function resolveEntityOwnership(
  scope: string,
  ref: string | null,
  uid: string,
): Promise<EntityOwnership> {
  const tables = scopeTables(scope);
  if (!ref || tables.length === 0) return "unknown";
  let sawOther = false;
  for (const table of tables) {
    const { found, ownerId } = await entityOwnerInTable(table, ref);
    if (found && ownerId) {
      if (ownerId === uid) return "owner"; // propietario confirmado ⇒ gana
      sawOther = true;
    }
    // found && !ownerId (owner_id nulo/ausente): indeterminado, no concluye.
  }
  return sawOther ? "not-owner" : "unknown";
}

// Propiedad de la fila de CONFIG existente (por si el dueño actual sigue
// editando, aunque ya no sea dueño de la entidad). Misma clave que el upsert:
// (scope, scope_ref). Defensivo: error ⇒ 'unknown'; sin fila ⇒ 'none'.
async function resolveConfigOwnership(
  scope: string,
  ref: string | null,
  uid: string,
): Promise<ConfigOwnership> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("governance_configs")
      .select("owner")
      .eq("scope", scope)
      .eq("scope_ref", ref)
      .maybeSingle();
    if (error) return "unknown";
    if (!data) return "none";
    const owner = (data as { owner?: string | null }).owner ?? null;
    if (!owner) return "none";
    return owner === uid ? "me" : "other";
  } catch {
    return "unknown";
  }
}

// Decide si `uid` puede escribir la config de gobernanza de (scope, ref).
// Orden de precedencia (diseñado para NUNCA romper a un dueño legítimo):
//   1. dueño de la ENTIDAD        ⇒ ALLOW  (máxima autoridad del ámbito)
//   2. dueño de la CONFIG actual  ⇒ ALLOW  (el propietario actual sigue editando; coherente con la RLS)
//   3. NO-dueño de la entidad     ⇒ BLOCK  (determinación positiva)
//   4. config existente ajena     ⇒ BLOCK  (determinación positiva)
//   5. cualquier otra cosa        ⇒ ALLOW  (FAIL-OPEN ante incertidumbre)
async function isScopeWriteAuthorized(
  scope: string,
  ref: string | null,
  uid: string,
): Promise<boolean> {
  const entity = await resolveEntityOwnership(scope, ref, uid);
  if (entity === "owner") return true;
  const config = await resolveConfigOwnership(scope, ref, uid);
  if (config === "me") return true;
  if (entity === "not-owner") return false;
  if (config === "other") return false;
  return true;
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

    // VERJA DE PROPIEDAD (Adenda 127): sólo el dueño del ámbito cambia su
    // gobernanza. Envuelta en su propio try/catch para que un fallo INESPERADO
    // de la verja haga FAIL-OPEN (ALLOW) y jamás bloquee a un dueño legítimo; la
    // barrera dura es la RLS del servidor.
    if (owner) {
      let authorized = true;
      try {
        authorized = await isScopeWriteAuthorized(scope, ref, owner);
      } catch {
        authorized = true; // incertidumbre inesperada ⇒ FAIL-OPEN
      }
      if (!authorized) {
        return {
          ok: false,
          error:
            "Solo el propietario del ámbito puede cambiar su gobernanza; propón el cambio por votación.",
        };
      }
    }

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

// Paginación defensiva del censo legado. Alineada con membership.ts / reach.ts.
const LEGACY_PAGE_SIZE = 1000;
const LEGACY_SAFETY_CEILING = 100000;

/**
 * Lee TODOS los valores (deduplicados) de una columna filtrando por
 * `filterColumn = filterValue`, paginando por lotes de LEGACY_PAGE_SIZE con `.range()`.
 * Se detiene en página corta (fin natural) o al alcanzar LEGACY_SAFETY_CEILING (guarda
 * anti-bucle; avisa por consola sólo en ese caso). Defensivo: ante error transitorio
 * devuelve lo acumulado hasta el momento.
 */
async function pagedDistinctColumn(
  table: string,
  column: string,
  filterColumn: string,
  filterValue: string,
): Promise<string[]> {
  const supabase = createClient();
  const out = new Set<string>();
  let from = 0;
  let ceilingHit = false;
  for (;;) {
    if (from >= LEGACY_SAFETY_CEILING) {
      ceilingHit = true;
      break;
    }
    const to = from + LEGACY_PAGE_SIZE - 1;
    let rows: any[];
    try {
      const { data } = await supabase
        .from(table)
        .select(column)
        .eq(filterColumn, filterValue)
        .range(from, to);
      rows = (data as any[]) ?? [];
    } catch {
      break; // error transitorio → conservamos lo acumulado (defensivo)
    }
    for (const row of rows) {
      const v = row?.[column];
      if (v) out.add(v as string);
    }
    if (rows.length < LEGACY_PAGE_SIZE) break; // página corta = fin natural
    from += LEGACY_PAGE_SIZE;
  }
  if (ceilingHit) {
    console.warn(
      `[governance] ${table}("${filterValue}") alcanzó el tope de seguridad de ` +
        `${LEGACY_SAFETY_CEILING} filas; el censo legado puede estar truncado.`,
    );
  }
  return Array.from(out);
}

/**
 * Mapea una lista de `profile_id` a sus CUENTAS (`profiles.user_id`) en lotes con
 * `.in('id', batch)`, deduplicando por user_id. Base de "una persona, una voz": una
 * cuenta con varios perfiles en la página cuenta una sola vez. Defensivo: un lote que
 * falle se omite y se continúa con el resto.
 */
async function accountsForProfiles(profileIds: string[]): Promise<Set<string>> {
  const supabase = createClient();
  const accounts = new Set<string>();
  for (let i = 0; i < profileIds.length; i += LEGACY_PAGE_SIZE) {
    const batch = profileIds.slice(i, i + LEGACY_PAGE_SIZE);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id")
        .in("id", batch);
      for (const row of (data as any[]) ?? []) {
        if (row?.user_id) accounts.add(row.user_id);
      }
    } catch {
      /* lote fallido → se omite (defensivo) */
    }
  }
  return accounts;
}

// Censo histórico por uuid (page/community → page_members; group → group_members).
// Devuelve el nº de CUENTAS distintas, o `null` si no hay filas o la lectura falla
// (para que eligibleCount pueda distinguir "sin datos legados" de un recuento real > 0).
async function legacyEligibleCount(
  scope: string,
  ref: string,
): Promise<number | null> {
  try {
    if (scope === "page" || scope === "community") {
      // UNA PERSONA, UNA VOZ (Adenda 124 · residual): `page_members` guarda una fila
      // por PERFIL; una cuenta con varios perfiles en la página se contaba de más.
      // Resolvemos a CUENTAS DISTINTAS: (1) recogemos los profile_id de la página
      // (paginado, defensivo), (2) los mapeamos a user_id vía `profiles` en lotes,
      // (3) deduplicamos por user_id. `null` si 0 cuentas o error → el llamador
      // conserva su fallback (la anti-deflación max(primary, legacy) de eligibleCount
      // NO cambia; sólo se corrige QUÉ cuenta esta rama).
      const profileIds = await pagedDistinctColumn("page_members", "profile_id", "page_id", ref);
      if (profileIds.length === 0) return null;
      const accounts = await accountsForProfiles(profileIds);
      return accounts.size > 0 ? accounts.size : null;
    }
    if (scope === "group") {
      // `group_members.member` YA es la cuenta (user_id): cuenta cuentas. Se deduplica
      // de forma defensiva por si hubiera filas repetidas.
      const members = await pagedDistinctColumn("group_members", "member", "group_id", ref);
      return members.length > 0 ? members.length : null;
    }
  } catch {
    /* sin sesión / error transitorio */
  }
  return null;
}
