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
// page/community → page_members (resolviendo user_id vía profiles cuando aplica);
// group → group_members. Otros ámbitos → conjunto vacío (sin censo conocido).
async function membersOfTarget(target: ReachTarget): Promise<Set<string>> {
  const set = new Set<string>();
  const supabase = createClient();
  try {
    if (target.scope === "page" || target.scope === "community") {
      const { data } = await supabase
        .from("page_members")
        .select("profile_id, profiles:profile_id(user_id)")
        .eq("page_id", target.scopeRef)
        .limit(5000);
      for (const row of (data as any[]) ?? []) {
        const u = row?.profiles?.user_id ?? row?.profile_id;
        if (u) set.add(u);
      }
    } else if (target.scope === "group") {
      const { data } = await supabase
        .from("group_members")
        .select("member")
        .eq("group_id", target.scopeRef)
        .limit(5000);
      for (const row of (data as any[]) ?? []) {
        if (row?.member) set.add(row.member);
      }
    }
  } catch {
    /* sin censo / error transitorio */
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
