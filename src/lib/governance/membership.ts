// StarSeed · Gobernanza — censo / rol / votantes desde `os_memberships` (fuente real).
//
// PROBLEMA QUE RESUELVE:
// El motor de gobernanza consultaba históricamente `group_members` / `page_members`
// (filtradas por `group_id` / `page_id`, que son UUID). Pero el ingreso REAL a una
// entidad (grupo · página · comunidad · asamblea · partido · EF · evento) escribe en
// `os_memberships` con clave `group_slug` = el slug de la entidad, vía
// `src/lib/os-social.ts:setMembership` (y `ensureCreatorMembership`). Además, la
// superficie de decisiones (`decisiones-section.tsx`) pasa el SLUG como `scopeRef`.
// Resultado: censo = 0/null y rol = null para comunidades reales → ejecución
// democrática inerte. Este módulo reapunta esas lecturas a `os_memberships` por SLUG.
//
// FILOSOFÍA (aditiva + con fallback): estas funciones son la fuente PRINCIPAL. Si
// `os_memberships` no devuelve filas para el scope, devuelven vacío/null y el llamador
// conserva su comportamiento previo (fallback a `group_members` / `page_members`), de
// modo que no se rompe ningún grupo existente ni los tests.
//
// "UNA PERSONA, UNA VOZ": el conteo es por CUENTA (`user_id`). La clave primaria de
// `os_memberships` es (user_id, group_slug), así que una cuenta figura una sola vez por
// entidad; nunca se multiplica por perfil.

import { createClient } from "@/utils/supabase/client";

// Esquema real de `os_memberships` (verificado en os-social.ts): user_id, group_slug, role.
// No existe columna de estado/perfil; cada fila es una membresía activa de una cuenta.
type MembershipRow = { user_id?: string | null; role?: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Paginación defensiva del censo (Adenda 124 · #3): antes se acotaba a 5000 filas y
// se avisaba, pero una entidad grande quedaba con el censo/conjunto de votantes
// silenciosamente truncado. Ahora se pagina en lotes de PAGE_SIZE hasta el fin natural
// (página corta), con un TOPE DE SEGURIDAD que corta el bucle ante cualquier anomalía.
const MEMBERSHIP_PAGE_SIZE = 1000;
const MEMBERSHIP_SAFETY_CEILING = 100000;

/** ¿El valor tiene forma de UUID? (para decidir si hay que resolver el slug). */
export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Cache de resolución uuid→slug por sesión de módulo (evita relookups repetidos en
// el mismo render). Se limpia sola al recargar; no persiste entre navegaciones duras.
const slugCache = new Map<string, string>();

/**
 * Normaliza un `scopeRef` al SLUG de la entidad, de forma coherente en todo el motor.
 * En el flujo real el `scopeRef` YA es el slug (DecisionesSection lo pasa así), y en ese
 * caso se devuelve tal cual SIN consultar la red. Si llega un UUID (superficies antiguas
 * o comandos), se intenta mapear a slug buscando por `id` en os_groups/os_pages/os_events.
 * Si no se consigue, se devuelve el valor original: la consulta a `os_memberships` no
 * casará y el llamador caerá limpiamente a su fallback histórico.
 */
export async function resolveScopeSlug(
  scopeRef: string | null | undefined,
): Promise<string | null> {
  const ref = (scopeRef ?? "").trim();
  if (!ref) return null;
  if (!looksLikeUuid(ref)) return ref; // ya es un slug: sin round-trip
  const cached = slugCache.get(ref);
  if (cached) return cached;

  const supabase = createClient();
  for (const table of ["os_groups", "os_pages", "os_events"] as const) {
    try {
      const { data } = await supabase.from(table).select("slug").eq("id", ref).maybeSingle();
      const slug = (data as { slug?: string } | null)?.slug;
      if (slug) {
        slugCache.set(ref, slug);
        return slug;
      }
    } catch {
      /* sin tabla / error transitorio: probamos la siguiente */
    }
  }
  return ref; // no resoluble → se usa tal cual (probable no-match → fallback del llamador)
}

/**
 * Lee TODOS los `user_id` miembro de una entidad en `os_memberships` paginando por
 * lotes de MEMBERSHIP_PAGE_SIZE con `.range(from, to)` hasta recibir una página corta
 * (fin natural), deduplicando en un Set. Guarda anti-bucle: se detiene al alcanzar
 * MEMBERSHIP_SAFETY_CEILING y avisa por consola SÓLO en ese caso (censo posiblemente
 * truncado). Defensivo: ante error transitorio devuelve lo acumulado hasta el momento
 * (no deflacta el censo con un vacío).
 */
async function pagedMembershipUserIds(slug: string): Promise<Set<string>> {
  const supabase = createClient();
  const ids = new Set<string>();
  let from = 0;
  let ceilingHit = false;
  for (;;) {
    if (from >= MEMBERSHIP_SAFETY_CEILING) {
      ceilingHit = true;
      break;
    }
    const to = from + MEMBERSHIP_PAGE_SIZE - 1;
    let rows: MembershipRow[];
    try {
      const { data } = await supabase
        .from("os_memberships")
        .select("user_id")
        .eq("group_slug", slug)
        .range(from, to);
      rows = (data as MembershipRow[]) ?? [];
    } catch {
      break; // error transitorio → conservamos lo acumulado (defensivo)
    }
    for (const row of rows) {
      if (row?.user_id) ids.add(row.user_id);
    }
    if (rows.length < MEMBERSHIP_PAGE_SIZE) break; // página corta = fin natural
    from += MEMBERSHIP_PAGE_SIZE;
  }
  if (ceilingHit) {
    console.warn(
      `[governance] os_memberships("${slug}") alcanzó el tope de seguridad de ` +
        `${MEMBERSHIP_SAFETY_CEILING} filas; el censo/conjunto de votantes puede estar truncado.`,
    );
  }
  return ids;
}

/**
 * user_ids de las cuentas miembro de una entidad (por `os_memberships.group_slug`).
 * Dedupe defensivo; `[]` si no hay filas o hay error (para activar el fallback del
 * llamador). Paginado (Adenda 124 · #3): recorre TODA la membresía sin el antiguo
 * tope de 5000 filas, evitando censos/conjuntos de votantes truncados en entidades
 * grandes.
 */
export async function membersFromMemberships(
  scopeRef: string | null | undefined,
): Promise<string[]> {
  const slug = await resolveScopeSlug(scopeRef);
  if (!slug) return [];
  try {
    return Array.from(await pagedMembershipUserIds(slug));
  } catch {
    return [];
  }
}

/**
 * Censo (nº de CUENTAS) de una entidad por slug. Devuelve `null` cuando no puede
 * resolverse o no hay filas, para que el llamador aplique su censo histórico. Cuenta
 * exacta por `user_id` (una persona, una voz).
 */
export async function countMembersFromMemberships(
  scopeRef: string | null | undefined,
): Promise<number | null> {
  const slug = await resolveScopeSlug(scopeRef);
  if (!slug) return null;
  const supabase = createClient();
  try {
    const { count } = await supabase
      .from("os_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("group_slug", slug);
    return count && count > 0 ? count : null;
  } catch {
    return null;
  }
}

/**
 * Rol de una cuenta en una entidad por slug (`os_memberships.role`). `null` si no es
 * miembro o no puede resolverse → el llamador cae a `group_members` / `page_members`.
 */
export async function roleFromMemberships(
  scopeRef: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const slug = await resolveScopeSlug(scopeRef);
  if (!slug) return null;
  const supabase = createClient();
  try {
    const { data } = await supabase
      .from("os_memberships")
      .select("role")
      .eq("group_slug", slug)
      .eq("user_id", userId)
      .maybeSingle();
    return (data as MembershipRow | null)?.role ?? null;
  } catch {
    return null;
  }
}
