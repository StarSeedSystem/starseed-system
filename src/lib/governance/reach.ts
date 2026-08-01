// StarSeed · Ontocracia — Decisiones SUPRA-COMUNITARIAS (federación).
// Una decisión puede abarcar varias comunidades/entidades a la vez. El censo
// elegible es la UNIÓN o la INTERSECCIÓN de sus miembros, y el quórum puede
// medirse por objetivo (`per_target`) o de forma agregada (`aggregate`).
//
// ADITIVO: las propuestas de ámbito único NO cambian. Sólo cuando una propuesta
// declara `params.reach` (o `params.federation`) entra en juego esta lógica.
//
// Un agente hermano crea `src/lib/reach/reach.ts` con un tipo `Reach`. Lo
// importamos de forma OPCIONAL: si aún no existe, usamos el tipo local de abajo
// para no acoplarnos ni romper el type-check.

import { createClient } from "@/utils/supabase/client";
import { membersFromMemberships } from "./membership";

// Paginación defensiva del censo legado (Adenda 124 · #3): antes las lecturas de
// `page_members` / `group_members` se acotaban a 5000 filas y truncaban en silencio el
// censo federado de objetivos grandes. Se pagina en lotes de PAGE_SIZE hasta el fin
// natural (página corta), con un TOPE DE SEGURIDAD anti-bucle. Valores alineados con
// membership.ts (la ruta os_memberships ya se pagina allí vía membersFromMemberships).
const REACH_PAGE_SIZE = 1000;
const REACH_SAFETY_CEILING = 100000;

/**
 * Pagina una lectura de censo legado por lotes de REACH_PAGE_SIZE con `.range(from, to)`,
 * añadiendo a `set` (UNIÓN, nunca sustituye) el user_id extraído por `pick` de cada fila.
 * Se detiene en página corta (fin natural) o al alcanzar REACH_SAFETY_CEILING (guarda
 * anti-bucle; avisa por consola sólo en ese caso). Defensivo: ante error deja en `set` lo
 * ya acumulado, para NO deflactar el censo federado.
 */
async function collectPagedInto(
  table: string,
  columns: string,
  filterColumn: string,
  filterValue: string,
  pick: (row: any) => string | null | undefined,
  set: Set<string>,
): Promise<void> {
  const supabase = createClient();
  let from = 0;
  let ceilingHit = false;
  for (;;) {
    if (from >= REACH_SAFETY_CEILING) {
      ceilingHit = true;
      break;
    }
    const to = from + REACH_PAGE_SIZE - 1;
    let rows: any[];
    try {
      const { data } = await supabase
        .from(table)
        .select(columns)
        .eq(filterColumn, filterValue)
        .range(from, to);
      rows = (data as any[]) ?? [];
    } catch {
      break; // error transitorio → conservamos la unión acumulada (defensivo)
    }
    for (const row of rows) {
      const u = pick(row);
      if (u) set.add(u);
    }
    if (rows.length < REACH_PAGE_SIZE) break; // página corta = fin natural
    from += REACH_PAGE_SIZE;
  }
  if (ceilingHit) {
    console.warn(
      `[governance] ${table}("${filterValue}") alcanzó el tope de seguridad de ` +
        `${REACH_SAFETY_CEILING} filas; el censo federado puede estar truncado.`,
    );
  }
}

// Un objetivo de la federación: un ámbito concreto (comunidad, página, grupo…).
export type ReachTarget = {
  scope: string;
  scopeRef: string;
  label?: string;
};

// Combinación del censo entre objetivos:
//   • union → cualquiera que sea miembro de AL MENOS un objetivo puede votar.
//   • intersection → sólo quien es miembro de TODOS los objetivos puede votar.
export type CensusMode = "union" | "intersection";

// Modo de quórum supra-comunitario:
//   • aggregate → un único quórum sobre el censo combinado.
//   • per_target → cada objetivo debe alcanzar su propio quórum.
export type ReachQuorumMode = "aggregate" | "per_target";

// Alcance federado de una propuesta. Compatible (superset laxo) con el `Reach`
// del módulo hermano si llega a existir; por eso los campos extra son opcionales.
export type GovernanceReach = {
  targets: ReachTarget[];
  census?: CensusMode; // por defecto "union".
  quorum?: ReachQuorumMode; // por defecto "aggregate".
  // Campo tolerante para interoperar con un `Reach` externo más rico.
  [key: string]: unknown;
};

// Normaliza cualquier valor almacenado en params.reach/params.federation a un
// GovernanceReach válido. Tolerante: entradas corruptas → null.
export function normalizeReach(raw: unknown): GovernanceReach | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawTargets = Array.isArray(r.targets) ? r.targets : [];
  const targets: ReachTarget[] = [];
  for (const t of rawTargets) {
    if (t && typeof t === "object") {
      const tt = t as Record<string, unknown>;
      const scope = typeof tt.scope === "string" ? tt.scope : "";
      const scopeRef =
        typeof tt.scopeRef === "string"
          ? tt.scopeRef
          : typeof tt.scope_ref === "string"
            ? (tt.scope_ref as string)
            : "";
      if (scope && scopeRef) {
        targets.push({ scope, scopeRef, label: typeof tt.label === "string" ? tt.label : undefined });
      }
    }
  }
  if (targets.length === 0) return null;
  const census: CensusMode = r.census === "intersection" ? "intersection" : "union";
  const quorum: ReachQuorumMode = r.quorum === "per_target" ? "per_target" : "aggregate";
  return { ...r, targets, census, quorum };
}

// Extrae el alcance federado de los params de una propuesta (acepta `reach` o
// `federation`). Devuelve null si la propuesta es de ámbito único (caso normal).
export function reachFromParams(params: Record<string, unknown> | null | undefined): GovernanceReach | null {
  if (!params) return null;
  return normalizeReach((params as any).reach ?? (params as any).federation ?? null);
}

// Devuelve el conjunto de user_ids miembros de un objetivo concreto (best-effort).
// FUENTE PRINCIPAL: `os_memberships` por `group_slug` (= target.scopeRef), la membresía
// real de cualquier entidad. FALLBACK (aditivo): si no hay filas, censo histórico
// page/community → page_members (resolviendo user_id vía profiles); group → group_members.
// Otros ámbitos sin censo conocido → conjunto vacío.
async function membersOfTarget(target: ReachTarget): Promise<Set<string>> {
  const set = new Set<string>();
  // Principal: miembros reales desde os_memberships (por slug del objetivo). Ya
  // paginado en membership.ts (membersFromMemberships → pagedMembershipUserIds).
  for (const u of await membersFromMemberships(target.scopeRef)) set.add(u);

  // Censo histórico — se UNE (no se sustituye) para no DEFLACTAR el censo federado
  // (revisión adversarial Adenda 124: un os_memberships parcial no debe ocultar a
  // los miembros legados de un objetivo y hundir su quórum). Paginado para no truncar
  // objetivos grandes; la semántica de unión/anti-deflación es idéntica.
  if (target.scope === "page" || target.scope === "community") {
    await collectPagedInto(
      "page_members",
      "profile_id, profiles:profile_id(user_id)",
      "page_id",
      target.scopeRef,
      (row) => row?.profiles?.user_id ?? row?.profile_id,
      set,
    );
  } else if (target.scope === "group") {
    await collectPagedInto(
      "group_members",
      "member",
      "group_id",
      target.scopeRef,
      (row) => row?.member,
      set,
    );
  }
  return set;
}

// Censo por objetivo (mapa scope:ref -> nº de miembros). Útil para quórum
// `per_target` y para mostrar el desglose en la UI. Defensivo.
export async function perTargetCensus(reach: GovernanceReach): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of reach.targets) {
    const key = `${t.scope}:${t.scopeRef}`;
    try {
      const m = await membersOfTarget(t);
      out[key] = m.size;
    } catch {
      out[key] = 0;
    }
  }
  return out;
}

// Censo elegible COMBINADO de una federación (unión o intersección de miembros).
// Devuelve null si no puede resolverse (todos los objetivos sin censo) para que
// el motor caiga al comportamiento sin censo (quórum sólo por conteo). Defensivo.
export async function supraEligibleCount(reach: GovernanceReach): Promise<number | null> {
  try {
    const sets: Set<string>[] = [];
    for (const t of reach.targets) {
      sets.push(await membersOfTarget(t));
    }
    const known = sets.filter((s) => s.size > 0);
    if (known.length === 0) return null;

    if ((reach.census ?? "union") === "intersection") {
      // Intersección: miembros presentes en TODOS los objetivos con censo conocido.
      let acc = new Set(known[0]);
      for (let i = 1; i < known.length; i++) {
        const next = known[i];
        acc = new Set([...acc].filter((u) => next.has(u)));
      }
      return acc.size;
    }
    // Unión: cualquiera que sea miembro de al menos un objetivo.
    const union = new Set<string>();
    for (const s of sets) for (const u of s) union.add(u);
    return union.size;
  } catch {
    return null;
  }
}

// Censo elegible SEGÚN EL MODO DE QUÓRUM.
//   • aggregate → censo combinado (unión/intersección) sin duplicar personas.
//   • per_target → suma de los censos de cada objetivo (más estricto: cada
//     comunidad aporta su cuerpo elegible, sin deduplicar miembros compartidos),
//     de modo que el % de participación exigido se mide contra el total federado.
// Defensivo → null si no puede resolverse.
export async function eligibleForReach(reach: GovernanceReach): Promise<number | null> {
  const mode = reach.quorum ?? "aggregate";
  if (mode === "per_target") {
    try {
      const per = await perTargetCensus(reach);
      const vals = Object.values(per).filter((n) => n > 0);
      if (vals.length === 0) return null;
      return vals.reduce((s, n) => s + n, 0);
    } catch {
      return null;
    }
  }
  return supraEligibleCount(reach);
}

// Resumen legible del alcance federado (para cabeceras/insignias en la UI).
export function reachSummary(reach: GovernanceReach): string {
  const n = reach.targets.length;
  const censusTxt = (reach.census ?? "union") === "intersection" ? "intersección" : "unión";
  const quorumTxt = (reach.quorum ?? "aggregate") === "per_target" ? "por objetivo" : "agregado";
  return `${n} ámbito${n === 1 ? "" : "s"} · censo por ${censusTxt} · quórum ${quorumTxt}`;
}
