// StarSeed · Ontocracia — Voto líquido delegado (delegación revocable, por tema,
// con caducidad obligatoria). Motor de cálculo del PESO EFECTIVO.
//
// Reglas rectoras (cláusulas pétreas):
//   • "Una persona, una voz": una delegación NO inventa votos; sólo transfiere el
//     peso de UNA persona a otra para UN tema.
//   • Voto directo = reclamo: si el delegante vota por su cuenta, su peso vuelve a
//     él y NO se suma al delegado (sin doble conteo, sin alienación permanente).
//   • Por tema: la delegación se acota a un `topic`.
//   • Revocable + caducidad OBLIGATORIA: se ignora todo lo revocado o vencido.
//
// TODO ES DEFENSIVO: si la tabla `vote_delegations` no existe todavía (migración
// no aplicada), estas funciones devuelven vacío → el peso de cada voto queda en 1
// (comportamiento actual e intacto).

import { createClient } from "@/utils/supabase/client";
import type { Proposal, ProposalVote } from "./types";

// Arista de delegación activa: `delegator` cede su peso a `delegate` para un tema.
export type Delegation = {
  id?: string;
  delegator_user: string;
  delegate_user: string;
  topic: string;
  scope?: string | null;
  scope_ref?: string | null;
  created_at?: string;
  expires_at: string; // NUNCA nulo — caducidad obligatoria.
  revoked_at?: string | null;
};

// Deriva el TEMA de una propuesta. Convención estable y reversible: "scope:ref"
// (o sólo "scope" en global). Permite delegar "todas las decisiones de este
// grupo/comunidad" sin acoplarse a cada propuesta concreta.
export function topicForProposal(proposal: Pick<Proposal, "scope" | "scope_ref">): string {
  const ref = proposal.scope_ref ?? null;
  return ref ? `${proposal.scope}:${ref}` : String(proposal.scope);
}

// Construye el tema a partir de scope/scopeRef (para la UI de delegación).
export function topicForScope(scope: string, scopeRef?: string | null): string {
  const ref = scopeRef ?? null;
  return ref ? `${scope}:${ref}` : String(scope);
}

// Etiqueta legible de un tema (para la UI).
export function topicLabel(topic: string): string {
  const [scope, ref] = topic.split(":");
  const map: Record<string, string> = {
    global: "Global (toda la red)",
    community: "Comunidad",
    page: "Página",
    group: "Grupo",
    account: "Cuenta",
    message: "Mensaje",
  };
  const base = map[scope] ?? scope;
  return ref ? `${base} · ${ref}` : base;
}

// Lee las delegaciones ACTIVAS (no revocadas, no vencidas) de un tema.
// Defensivo: cualquier error (incl. tabla inexistente) → []. 
export async function loadActiveDelegations(topic: string): Promise<Delegation[]> {
  if (!topic) return [];
  const supabase = createClient();
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("vote_delegations")
      .select("id, delegator_user, delegate_user, topic, scope, scope_ref, created_at, expires_at, revoked_at")
      .eq("topic", topic)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .limit(2000);
    if (error) return [];
    return ((data as Delegation[]) ?? []).filter(
      (d) => d.delegator_user && d.delegate_user && d.delegator_user !== d.delegate_user,
    );
  } catch {
    return [];
  }
}

// Núcleo del voto líquido: dado el conjunto de votos directos y las delegaciones
// activas del tema, devuelve el PESO EFECTIVO por votante.
//
// weight(votante) = 1 (su propia voz)
//                 + Σ 1 por cada delegante que le delegó y que NO votó directamente.
//
// Un delegante que vota directamente RECLAMA su peso (no se transfiere). Se
// resuelven cadenas (A→B→C) plegándolas hacia el delegado final que sí participa;
// se rompen ciclos. Nunca se cuenta a una persona dos veces.
export function computeEffectiveWeights(
  votes: Pick<ProposalVote, "voter">[],
  delegations: Delegation[],
): Record<string, number> {
  const voters = new Set(votes.map((v) => v.voter));
  // Peso base: cada votante directo aporta su propia voz (1).
  const weight: Record<string, number> = {};
  for (const v of voters) weight[v] = 1;

  if (!delegations || delegations.length === 0) return weight;

  // Mapa delegante -> delegado (una activa por tema garantizada por índice único;
  // si llegaran varias, la primera gana de forma determinista).
  const delegateOf = new Map<string, string>();
  for (const d of delegations) {
    if (!delegateOf.has(d.delegator_user)) {
      delegateOf.set(d.delegator_user, d.delegate_user);
    }
  }

  // Resuelve el destinatario final del peso de un delegante:
  // sigue la cadena de delegación hasta encontrar a alguien que VOTÓ directamente.
  // Si el propio delegante votó, reclama su peso (destino = él mismo → no transfiere).
  function resolveTarget(delegator: string): string | null {
    if (voters.has(delegator)) return null; // votó directo → reclama, no transfiere.
    const seen = new Set<string>([delegator]);
    let cur = delegateOf.get(delegator);
    while (cur) {
      if (voters.has(cur)) return cur; // primer eslabón que participa recibe el peso.
      if (seen.has(cur)) return null; // ciclo → se ignora (sin doble conteo).
      seen.add(cur);
      cur = delegateOf.get(cur);
    }
    return null; // nadie en la cadena votó → el peso simplemente no se ejerce.
  }

  for (const delegator of delegateOf.keys()) {
    const target = resolveTarget(delegator);
    if (target && target !== delegator) {
      weight[target] = (weight[target] ?? 0) + 1;
    }
  }

  return weight;
}

// ── Acciones de usuario (crear / revocar / listar) — todas defensivas ────────

// Crea (o reemplaza) una delegación del usuario autenticado. `expiresAt` es
// OBLIGATORIO (caducidad). Revoca cualquier delegación activa previa del mismo
// tema antes de crear la nueva (una activa por tema).
export async function createDelegation(input: {
  delegateUser: string;
  topic: string;
  expiresAt: string; // ISO — obligatorio.
  scope?: string | null;
  scopeRef?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  try {
    const { data: au } = await supabase.auth.getUser();
    const delegator = au?.user?.id;
    if (!delegator) return { ok: false, error: "Inicia sesión para delegar tu voto." };
    if (!input.delegateUser) return { ok: false, error: "Indica a quién delegas." };
    if (input.delegateUser === delegator) return { ok: false, error: "No puedes delegarte a ti mismo." };
    if (!input.topic) return { ok: false, error: "Indica el tema de la delegación." };
    if (!input.expiresAt) return { ok: false, error: "La delegación exige una fecha de caducidad." };
    const expMs = new Date(input.expiresAt).getTime();
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      return { ok: false, error: "La caducidad debe ser una fecha futura." };
    }

    // Revoca la delegación activa previa del mismo tema (revocabilidad + una activa).
    await supabase
      .from("vote_delegations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("delegator_user", delegator)
      .eq("topic", input.topic)
      .is("revoked_at", null);

    const { error } = await supabase.from("vote_delegations").insert({
      delegator_user: delegator,
      delegate_user: input.delegateUser,
      topic: input.topic,
      scope: input.scope ?? null,
      scope_ref: input.scopeRef ?? null,
      expires_at: new Date(input.expiresAt).toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo registrar la delegación." };
  }
}

// Revoca (desactiva) una delegación del usuario autenticado.
export async function revokeDelegation(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  try {
    const { data: au } = await supabase.auth.getUser();
    const delegator = au?.user?.id;
    if (!delegator) return { ok: false, error: "Inicia sesión para revocar." };
    const { error } = await supabase
      .from("vote_delegations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("delegator_user", delegator);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo revocar la delegación." };
  }
}

// Delegaciones ACTIVAS que el usuario autenticado ha emitido (las que ha dado).
export async function listMyDelegations(): Promise<Delegation[]> {
  const supabase = createClient();
  try {
    const { data: au } = await supabase.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return [];
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("vote_delegations")
      .select("id, delegator_user, delegate_user, topic, scope, scope_ref, created_at, expires_at, revoked_at")
      .eq("delegator_user", uid)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data as Delegation[]) ?? [];
  } catch {
    return [];
  }
}

// Peso delegado ACTIVO que el usuario autenticado ha RECIBIDO para un tema
// (cuántas voces representa, además de la suya). Defensivo → 0.
export async function receivedDelegationCount(topic: string): Promise<number> {
  const supabase = createClient();
  try {
    const { data: au } = await supabase.auth.getUser();
    const uid = au?.user?.id;
    if (!uid || !topic) return 0;
    const nowIso = new Date().toISOString();
    const { count } = await supabase
      .from("vote_delegations")
      .select("id", { count: "exact", head: true })
      .eq("delegate_user", uid)
      .eq("topic", topic)
      .is("revoked_at", null)
      .gt("expires_at", nowIso);
    return count ?? 0;
  } catch {
    return 0;
  }
}
