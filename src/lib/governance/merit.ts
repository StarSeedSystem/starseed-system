// StarSeed · Ontocracia — Meritocracia del entendimiento (ponderación por mérito).
//
// "La autoridad técnica se asigna por sabiduría aplicada VERIFICABLE (insignias),
// no por riqueza, linaje o popularidad" (Tríada Ideológica, §3 de CLAUDE.md).
//
// Aquí vive el cálculo del MULTIPLICADOR DE MÉRITO por votante: un bonus ACOTADO
// que añaden las insignias del área relevante a cuánto pesa un voto ya emitido
// hacia la opción GANADORA. Reglas rectoras (cláusulas pétreas):
//   • OPT-IN y ADITIVA: sólo actúa si el contexto la habilita explícitamente
//     (`MeritParams.enabled === true`). Por defecto TODO es "una persona, un voto".
//   • NUNCA toca el censo ni el quórum: el mérito multiplica el PESO del voto, no
//     inventa participantes. Una persona sigue contando como UNA para la
//     participación (eso lo garantiza `participants = votes.length` en el motor).
//   • ACOTADA: el multiplicador vive en [1, 1 + maxBonus] (por defecto máx. 2×).
//     Ninguna insignia otorga poder ilimitado.
//
// TODO ES DEFENSIVO (se refleja delegations.ts / badges.ts): sin sesión, sin las
// tablas (`profiles`, `profile_badges`, `badges`) o ante cualquier error de red,
// estas funciones devuelven {} → el motor aplica ×1 y el resultado es idéntico al
// voto igualitario. NUNCA lanzan.

import { createClient } from "@/utils/supabase/client";
import type { BadgeArea } from "@/lib/badges/badges";
import type { MeritParams, Proposal } from "./types";

// Bonus por cada insignia relevante (dos insignias saturan el bonus por defecto).
const STEP_PER_BADGE = 0.5;
// Tope por defecto del bonus si `MeritParams.maxBonus` no es válido (máx. 2×).
const DEFAULT_MAX_BONUS = 1;

function isClient(): boolean {
  return typeof window !== "undefined";
}

// Deduce el ÁREA de pericia relevante de una propuesta a partir de su
// scope/kind. Convención por palabra clave (tolerante a es/en):
//   política/politics → "politica" · educación/education → "educacion"
//   cultura/culture   → "cultura"  · cualquier otro       → "general".
// Defensivo: propuesta nula/indefinida → null (el motor cae a ×1).
export function topicToMeritArea(
  proposal: Pick<Proposal, "scope" | "kind"> | null | undefined,
): BadgeArea | null {
  if (!proposal) return null;
  const hay = `${proposal.scope ?? ""} ${proposal.kind ?? ""}`.toLowerCase();
  if (hay.includes("polit")) return "politica";
  if (hay.includes("educ")) return "educacion";
  if (hay.includes("cultur")) return "cultura";
  return "general";
}

// ¿Es la insignia RELEVANTE para el área efectiva de la decisión?
//   • sin área efectiva → cuenta cualquier insignia,
//   • el área coincide → cuenta,
//   • insignia "general" (o sin área declarada) → aplica a todo tema.
// Las insignias de OTRA área específica no aportan pericia aquí.
function isRelevantArea(badgeArea: string | null | undefined, effArea: BadgeArea | null): boolean {
  const a = (badgeArea ?? "general") as string;
  if (!effArea) return true;
  return a === effArea || a === "general";
}

// Calcula el MULTIPLICADOR DE MÉRITO por votante (keyed por user_id, igual que los
// votos). Devuelve sólo a quienes obtienen bonus (> 1); el resto queda a ×1 por
// omisión en el motor. El multiplicador nunca sale de [1, 1 + maxBonus].
//
// BATCHED (una consulta por tabla, sin N+1):
//   1) profiles: user_id → id (profile_id) para todos los votantes de golpe.
//   2) profile_badges ⨝ badges: insignias (con su área) de esos perfiles de golpe.
//   3) por perfil, se cuentan las insignias relevantes y se traduce a user_id.
//
// `area` es el área DEDUCIDA del tema (ver topicToMeritArea). `params.area`, si es
// un área concreta (no "auto"), MANDA sobre ella. Cualquier fallo → {} (×1).
export async function loadMeritWeights(
  voterIds: string[],
  area: BadgeArea | null,
  params: MeritParams,
): Promise<Record<string, number>> {
  // Guardas: desactivada, SSR o sin votantes → sin ponderación (todos ×1).
  if (!params?.enabled) return {};
  if (!isClient()) return {};
  if (!Array.isArray(voterIds) || voterIds.length === 0) return {};

  // Área efectiva: un área explícita en params gana; "auto"/ausente usa la deducida.
  const effArea: BadgeArea | null =
    params.area && params.area !== "auto" ? params.area : area;

  // Tope del bonus, saneado: número finito y no negativo, o el valor por defecto.
  // TOPE DURO (revisión adversarial Adenda 125): la config SOLO puede BAJAR el bonus,
  // nunca superar HARD_MAX_BONUS → multiplicador acotado a [1, 1+HARD_MAX_BONUS] (≤ 2×).
  // Evita que un `meritWeighting.maxBonus: 99` en un config produzca un voto de 100×.
  const HARD_MAX_BONUS = 1;
  const rawBonus =
    typeof params.maxBonus === "number" && Number.isFinite(params.maxBonus) && params.maxBonus >= 0
      ? params.maxBonus
      : DEFAULT_MAX_BONUS;
  const maxBonus = Math.min(HARD_MAX_BONUS, rawBonus);
  // maxBonus = 0 ⇒ multiplicador siempre 1 ⇒ nada que ponderar.
  if (maxBonus <= 0) return {};

  try {
    const supabase = createClient();
    const uniqueIds = Array.from(new Set(voterIds.filter(Boolean)));
    if (uniqueIds.length === 0) return {};

    // 1) user_id → profile_id (los votos van por user_id; las insignias por profile_id).
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, user_id")
      .in("user_id", uniqueIds);
    if (pErr || !Array.isArray(profs) || profs.length === 0) return {};

    const userByProfile = new Map<string, string>(); // profile_id → user_id
    const profileIds: string[] = [];
    for (const p of profs as any[]) {
      if (p?.id && p?.user_id) {
        userByProfile.set(p.id, p.user_id);
        profileIds.push(p.id);
      }
    }
    if (profileIds.length === 0) return {};

    // 2) Insignias de esos perfiles, con el área embebida de `badges` (batch).
    const { data: pbs, error: bErr } = await supabase
      .from("profile_badges")
      .select("profile_id, badges:badge_id ( area )")
      .in("profile_id", profileIds);
    if (bErr || !Array.isArray(pbs)) return {};

    // 3) Cuenta insignias RELEVANTES por perfil.
    const relevantByProfile: Record<string, number> = {};
    for (const row of pbs as any[]) {
      const pid = row?.profile_id;
      if (!pid) continue;
      // El embed puede llegar como objeto o (defensivo) como array.
      const b = Array.isArray(row?.badges) ? row.badges[0] : row?.badges;
      if (!isRelevantArea(b?.area, effArea)) continue;
      relevantByProfile[pid] = (relevantByProfile[pid] ?? 0) + 1;
    }

    // 4) Traduce a user_id y calcula el multiplicador acotado.
    //    multiplicador = 1 + min(maxBonus, STEP_PER_BADGE · nº insignias relevantes).
    const out: Record<string, number> = {};
    for (const [pid, count] of Object.entries(relevantByProfile)) {
      const userId = userByProfile.get(pid);
      if (!userId || count <= 0) continue;
      const bonus = Math.min(maxBonus, STEP_PER_BADGE * count);
      if (bonus > 0) out[userId] = 1 + bonus;
    }
    return out;
  } catch {
    return {};
  }
}
