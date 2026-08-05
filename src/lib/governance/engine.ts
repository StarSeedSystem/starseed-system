// StarSeed · Motor de decisiones democráticas — ciclo de vida de propuestas.
// crear → notificar → votar → evaluar → resolver → ejecutar comando.
//
// Adenda 142 (migración 20260805190000_gov_resolve_server_side.sql): el SELLADO
// de la resolución (open→passed/rejected/expired) se movió al servidor
// (gov_resolve_proposal, SECURITY DEFINER, censo+tally+evaluate en SQL bajo la
// marca transaccional app.gov_resolving). `tryResolve` ya NO evalúa ni
// actualiza el estado en el cliente — invoca esa RPC autoritativa y, si aprueba
// con un comando pendiente, sigue ejecutándolo aquí (fuera de alcance del port
// SQL) y sella passed→executed/failed. `tally`/`evaluate` de abajo SIGUEN
// viviendo aquí porque la UI los usa para mostrar el recuento EN VIVO mientras la
// propuesta sigue abierta (vista, no autoritativa); el resultado SELLADO siempre
// es el que fija el servidor.

import { createClient } from "@/utils/supabase/client";
import { executeCommand } from "./commands";
import { type Delegation, computeEffectiveWeights } from "./delegations";
import { membersFromMemberships } from "./membership";
import {
  DEFAULT_PARAMS,
  URGENCY,
  YESNO_OPTIONS,
  type Attachment,
  type CommandSpec,
  type DecisionParams,
  type GovernanceConfig,
  type Proposal,
  type ProposalOption,
  type ProposalVote,
} from "./types";

const BOT_NOTIFY = "https://starseed-neurocortex.vercel.app/api/govern_notify";

export type CreateProposalInput = {
  scope: string;
  scopeRef?: string | null;
  title: string;
  description?: string;
  kind?: string;
  options?: ProposalOption[];
  attachments?: Attachment[];
  command?: CommandSpec | null;
  params?: Partial<DecisionParams>;
  // Alcance SUPRA-COMUNITARIO opcional (federación de ámbitos). Aditivo: si se
  // omite, la propuesta es de ámbito único como siempre. Se persiste en
  // params.reach para que el motor lo respete en censo/quórum.
  reach?: import("./reach").GovernanceReach | null;
};

function computeParams(input?: Partial<DecisionParams>): DecisionParams {
  const urgency = input?.urgency ?? DEFAULT_PARAMS.urgency;
  const rawVotingMinutes =
    input?.votingMinutes && input.votingMinutes > 0
      ? input.votingMinutes
      : URGENCY[urgency]?.votingMinutes ?? DEFAULT_PARAMS.votingMinutes;
  // Clamps defensivos (espejo de un nuevo clamp en BD): el cliente nunca debe
  // producir parámetros de quórum fuera de rango, aunque `input` llegue
  // manipulado o con valores fraccionarios/absurdos. `urgency`/`votingEndsAt`
  // y la lógica de alcance (reach, en createProposal) quedan intactos: sólo se
  // acota el VALOR final de cada parámetro numérico.
  const votingMinutes = Math.max(1, Math.floor(rawVotingMinutes));
  const rawMinParticipants =
    input?.minParticipants != null ? input.minParticipants : DEFAULT_PARAMS.minParticipants;
  const minParticipants = Math.max(1, Math.floor(rawMinParticipants));
  const rawMinPercent = input?.minPercent != null ? input.minPercent : DEFAULT_PARAMS.minPercent;
  const minPercent = Math.min(100, Math.max(0, Math.floor(rawMinPercent)));
  const rawThreshold = input?.threshold != null ? input.threshold : DEFAULT_PARAMS.threshold;
  const threshold = Math.min(100, Math.max(1, Math.floor(rawThreshold)));
  const votingEndsAt = new Date(Date.now() + votingMinutes * 60_000).toISOString();
  return {
    votingMinutes,
    minParticipants,
    minPercent,
    threshold,
    urgency,
    votingEndsAt,
  };
}

// Resuelve los user_ids de los participantes elegibles de un contexto (best-effort).
// FUENTE PRINCIPAL: `os_memberships` por `group_slug` (= scopeRef), donde vive la
// membresía real. FALLBACK (aditivo): si no hay filas, se usa el censo histórico
// page_members / group_members por uuid. Devuelve user_ids únicos (una persona, una voz).
async function resolveVoterIds(scope: string, scopeRef: string | null): Promise<string[]> {
  if (!scopeRef) return [];

  const ids = new Set<string>();
  // Principal: miembros reales desde os_memberships (por slug).
  for (const u of await membersFromMemberships(scopeRef)) ids.add(u);

  // Censo histórico (esquema antiguo por uuid) — se UNE (no se sustituye) para no
  // dejar sin notificar a miembros legados durante la migración (revisión Adenda
  // 124: antes un os_memberships parcial ocultaba a los miembros legados).
  const supabase = createClient();
  try {
    if (scope === "page" || scope === "community") {
      const { data } = await supabase
        .from("page_members")
        .select("profile_id, profiles:profile_id(user_id)")
        .eq("page_id", scopeRef)
        .limit(500);
      for (const row of (data as any[]) ?? []) {
        const u = row?.profiles?.user_id ?? row?.profile_id;
        if (u) ids.add(u);
      }
    } else if (scope === "group") {
      const { data } = await supabase
        .from("group_members")
        .select("member")
        .eq("group_id", scopeRef)
        .limit(500);
      for (const row of (data as any[]) ?? []) {
        if (row?.member) ids.add(row.member);
      }
    }
  } catch {
    /* */
  }
  return Array.from(ids);
}

// Crea una propuesta y notifica a los participantes (best-effort).
export async function createProposal(
  input: CreateProposalInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = createClient();
  try {
    const { data: au } = await supabase.auth.getUser();
    const author = au?.user?.id;
    if (!author) return { ok: false, error: "Inicia sesión para proponer." };

    const baseParams = computeParams(input.params);
    // Federación (supra-comunitario): se guarda dentro de params para no tocar el
    // esquema de `proposals`. Sólo se añade si hay objetivos válidos.
    const reach =
      input.reach && Array.isArray(input.reach.targets) && input.reach.targets.length > 0
        ? input.reach
        : null;
    const params = reach ? { ...baseParams, reach } : baseParams;
    const options = (input.options ?? []).filter((o) => o.label?.trim());

    const { data, error } = await supabase
      .from("proposals")
      .insert({
        scope: input.scope,
        scope_ref: input.scopeRef ?? null,
        author,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        kind: input.kind || "decision",
        options,
        attachments: input.attachments ?? [],
        command: input.command ?? null,
        params,
        status: "open",
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    const proposalId = data?.id as string;

    // Notificaciones a participantes (best-effort, no bloquea el alta).
    try {
      const voterIds = await resolveVoterIds(input.scope, input.scopeRef ?? null);
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/decisiones?p=${proposalId}`
          : `/decisiones?p=${proposalId}`;

      if (voterIds.length > 0) {
        const rows = voterIds.map((uidv) => ({
          proposal_id: proposalId,
          user_id: uidv,
          kind: "vote_request",
          message: `Nueva propuesta: ${input.title.trim()}`,
          seen: false,
        }));
        await supabase.from("proposal_notifications").insert(rows);
      }

      // Puente de notificación a Telegram (ignorar fallos).
      fetch(BOT_NOTIFY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposalId,
          title: input.title.trim(),
          url,
          voters: voterIds,
        }),
      }).catch(() => {});
    } catch {
      /* notificación best-effort */
    }

    return { ok: true, id: proposalId };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo crear la propuesta." };
  }
}

// Registra el voto del usuario autenticado y trata de resolver la propuesta.
export async function castVote(
  proposalId: string,
  choice: string,
  comment?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  try {
    const { data: au } = await supabase.auth.getUser();
    const voter = au?.user?.id;
    if (!voter) return { ok: false, error: "Inicia sesión para votar." };

    // El voto directo SIEMPRE se guarda con peso base 1 ("una persona, una voz").
    // El peso DELEGADO (voto líquido) NO se persiste aquí: se calcula de forma
    // transparente y recomputable en el recuento (tally/evaluate) a partir de las
    // delegaciones activas del tema. Así un voto directo del delegante reclama su
    // peso automáticamente y nunca hay doble conteo ni alienación permanente.
    const { error } = await supabase.from("proposal_votes").upsert(
      {
        proposal_id: proposalId,
        voter,
        choice,
        weight: 1,
        comment: comment?.trim() || null,
      },
      { onConflict: "proposal_id,voter" },
    );
    if (error) return { ok: false, error: error.message };

    await tryResolve(proposalId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo registrar tu voto." };
  }
}

// Lista pública de votos, enriquecida con el perfil del votante.
export async function listVotes(proposalId: string): Promise<ProposalVote[]> {
  const supabase = createClient();
  try {
    const { data: votes } = await supabase
      .from("proposal_votes")
      .select("proposal_id, voter, choice, weight, comment, created_at")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true });

    const list = (votes as ProposalVote[]) ?? [];
    if (list.length === 0) return list;

    const voterIds = Array.from(new Set(list.map((v) => v.voter)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle, avatar_url")
      .in("user_id", voterIds);

    const byUser: Record<string, any> = {};
    for (const p of (profiles as any[]) ?? []) byUser[p.user_id] = p;

    return list.map((v) => {
      const prof = byUser[v.voter];
      return {
        ...v,
        display_name: prof?.display_name ?? null,
        handle: prof?.handle ?? null,
        avatar_url: prof?.avatar_url ?? null,
      };
    });
  } catch {
    return [];
  }
}

export type Tally = {
  counts: Record<string, number>;
  participants: number;
  turnoutPct: number;
  leader: string | null;
  leaderShare: number; // % de los votos no-abstención
};

// Recuento. Sin opciones → sí/no/abstención. Con opciones → por opción.
//
// Voto líquido delegado (ADITIVO): si se pasan `delegations` (delegaciones
// activas del tema de la propuesta), el peso de cada votante se calcula como
// 1 (su voz) + las voces que le fueron delegadas por quien NO votó directamente.
// Sin `delegations` (o vacío) el peso es 1 por votante → comportamiento actual.
//
// Meritocracia del entendimiento (ADITIVA, OPT-IN): si se pasa `meritWeights`
// (multiplicador de mérito por votante, ver merit.ts), el bonus (multiplicador − 1)
// se SUMA únicamente al peso BASE del votante —SU PROPIA VOZ—, nunca al caudal que
// otras personas le delegaron: las insignias de un delegado NO amplifican las voces
// ajenas que gestiona. Sin `meritWeights` (o si el votante no figura) el bonus es 0
// → comportamiento idéntico. NUNCA afecta al censo. "participants" cuenta PERSONAS
// (votantes directos), no pesos, para no inflar el quórum por conteo: una persona
// sigue siendo una persona.
export function tally(
  proposal: Proposal,
  votes: ProposalVote[],
  eligible?: number | null,
  delegations?: Delegation[],
  meritWeights?: Record<string, number> | null,
): Tally {
  const hasOptions = (proposal.options ?? []).length > 0;
  const counts: Record<string, number> = {};
  if (hasOptions) {
    for (const o of proposal.options) counts[o.id] = 0;
  } else {
    for (const o of YESNO_OPTIONS) counts[o.id] = 0;
  }

  // Peso efectivo por votante (con delegaciones plegadas). Sin delegaciones el
  // mapa queda a 1 por votante, equivalente al comportamiento previo.
  const effWeight =
    delegations && delegations.length > 0
      ? computeEffectiveWeights(votes, delegations)
      : null;

  for (const v of votes) {
    if (counts[v.choice] == null) counts[v.choice] = 0;
    // Peso base/delegado + BONUS de mérito sobre la PROPIA voz (no sobre el caudal
    // delegado). `base` es la voz propia (1) más lo que le delegaron; el mérito sólo
    // añade (multiplicador − 1), de modo que las insignias amplifican la voz del
    // votante pero NUNCA las voces ajenas que gestiona por delegación. Sin mérito
    // (ausente o ×1) el bonus es 0 → peso idéntico al comportamiento actual.
    const base = effWeight ? effWeight[v.voter] ?? (v.weight || 1) : v.weight || 1;
    const mBonus = meritWeights ? (meritWeights[v.voter] ?? 1) - 1 : 0;
    const w = base + mBonus;
    counts[v.choice] += w;
  }

  const participants = votes.length;
  const turnoutPct =
    eligible && eligible > 0 ? Math.round((participants / eligible) * 100) : 0;

  // Líder: ignora abstención al medir cuota de victoria.
  let leader: string | null = null;
  let leaderVotes = 0;
  let decisiveTotal = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (!hasOptions && k === "abstain") continue;
    decisiveTotal += n;
    if (n > leaderVotes) {
      leaderVotes = n;
      leader = k;
    }
  }
  const leaderShare = decisiveTotal > 0 ? Math.round((leaderVotes / decisiveTotal) * 100) : 0;

  return { counts, participants, turnoutPct, leader, leaderShare };
}

export type Evaluation = {
  decided: boolean;
  status: "passed" | "rejected" | "open" | "expired";
  winningChoice?: string | null;
  reason: string;
};

// Evalúa si la decisión está tomada según los parámetros y el censo.
// `meritWeights` (opcional, aditivo) sólo pondera el recuento hacia la opción
// ganadora; el quórum y la participación siguen contando personas (ver tally).
export function evaluate(
  proposal: Proposal,
  votes: ProposalVote[],
  config: GovernanceConfig | null,
  eligible?: number | null,
  delegations?: Delegation[],
  meritWeights?: Record<string, number> | null,
): Evaluation {
  const params = proposal.params ?? DEFAULT_PARAMS;
  const t = tally(proposal, votes, eligible, delegations, meritWeights);
  const now = Date.now();
  const endsAt = params.votingEndsAt ? new Date(params.votingEndsAt).getTime() : now;
  const timeUp = now >= endsAt;

  const hierarchical = config?.mode === "hierarchical";
  const hierNote = hierarchical
    ? " · Contexto jerárquico: un administrador también puede decidir, pero la opción democrática siempre está disponible."
    : "";

  // Quórum por número de participantes.
  const quorumByCount = t.participants >= (params.minParticipants ?? 0);
  // Quórum por porcentaje (si se exige y hay censo conocido).
  const quorumByPercent =
    !params.minPercent || params.minPercent <= 0
      ? true
      : eligible && eligible > 0
        ? t.turnoutPct >= params.minPercent
        : false;
  const quorumMet = quorumByCount && quorumByPercent;

  const thresholdMet = t.leaderShare >= (params.threshold ?? 50);

  // Decisión anticipada: si el resto de votos posibles no puede cambiar al líder
  // y el quórum ya está cubierto, se puede resolver antes del cierre.
  // Con pesos activos (delegación líquida o mérito) un votante pendiente puede sumar
  // MÁS de 1 al segundo, así que `remaining` (conteo de PERSONAS) subestima el vuelco
  // posible y la decisión anticipada podría resolver mal e IRREVERSIBLEMENTE. Por eso
  // solo aplica en 1-persona-1-voto puro (revisión adversarial Adenda 125).
  const weighted =
    (Array.isArray(delegations) && delegations.length > 0) ||
    (meritWeights != null && Object.keys(meritWeights).length > 0);
  let earlyDecisive = false;
  if (!timeUp && !weighted && quorumMet && eligible && eligible > 0 && t.leader) {
    const remaining = Math.max(0, eligible - t.participants);
    const hasOptions = (proposal.options ?? []).length > 0;
    let leaderVotes = t.counts[t.leader] ?? 0;
    let runnerUp = 0;
    for (const [k, n] of Object.entries(t.counts)) {
      if (k === t.leader) continue;
      if (!hasOptions && k === "abstain") continue;
      if (n > runnerUp) runnerUp = n;
    }
    // El líder es inalcanzable aunque todos los pendientes voten al segundo.
    if (leaderVotes > runnerUp + remaining) earlyDecisive = true;
  }

  if (timeUp || earlyDecisive) {
    if (!quorumMet) {
      return {
        decided: true,
        status: "expired",
        reason:
          `Sin quórum: ${t.participants} participante(s)` +
          (params.minPercent ? `, ${t.turnoutPct}% de participación` : "") +
          `. Se requería mín. ${params.minParticipants}` +
          (params.minPercent ? ` y ${params.minPercent}%` : "") +
          `.${hierNote}`,
      };
    }
    const hasOpts = (proposal.options ?? []).length > 0;
    // En sí/no, sólo aprueba si gana "yes"; "no"/"abstain" → rechazada.
    const leaderApproves = hasOpts ? t.leader != null : t.leader === "yes";
    if (thresholdMet && leaderApproves) {
      return {
        decided: true,
        status: "passed",
        winningChoice: t.leader,
        reason:
          `Aprobada con ${t.leaderShare}% para la opción líder` +
          (earlyDecisive ? " (decisión anticipada irreversible)" : "") +
          `.${hierNote}`,
      };
    }
    return {
      decided: true,
      status: "rejected",
      winningChoice: t.leader,
      reason:
        `Rechazada: la opción líder alcanzó ${t.leaderShare}% (umbral ${params.threshold}%).${hierNote}`,
    };
  }

  // Aún abierta.
  const remainMin = Math.max(0, Math.round((endsAt - now) / 60_000));
  return {
    decided: false,
    status: "open",
    reason:
      `En votación · faltan ~${remainMin} min · ${t.participants} voto(s)` +
      (quorumMet ? " · quórum alcanzado" : " · sin quórum aún") +
      `.${hierNote}`,
  };
}

// Resuelve una propuesta de forma AUTORITATIVA vía RPC server-side (Adenda 142 ·
// gov_resolve_proposal, migración 20260805190000_gov_resolve_server_side.sql).
// El censo+tally+evaluate YA NO corren aquí: corren en SQL, bajo la marca
// transaccional `app.gov_resolving` que proposals_guard exige para sellar
// open→passed/rejected/expired — un `UPDATE proposals SET status=...` directo
// desde el cliente para esa transición es RECHAZADO por el guard endurecido;
// esta función es la ÚNICA vía legítima para sellar una resolución.
//
// La RPC es fail-closed y NO-OPERA si la propuesta no está 'open' (devuelve
// `resolved:false`), así que invocarla repetidamente (voto, barrido, doble clic)
// es siempre seguro: nunca reevalúa ni resella una propuesta ya cerrada.
//
// La EJECUCIÓN del comando sigue siendo client-side (fuera de alcance del port
// SQL — ver cabecera de la migración): si la RPC sella 'passed' y señala un
// comando pendiente, esta función lo ejecuta igual que antes (executeCommand) y
// sella passed→executed/failed, transición que el guard endurecido SÍ permite
// desde el cliente sin la marca transaccional.
export async function tryResolve(
  proposalId: string,
): Promise<{ resolved: boolean; status?: string; detail?: string }> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc("gov_resolve_proposal", {
      p_id: proposalId,
    });
    if (error) return { resolved: false, detail: error.message };

    const status: string | undefined = data?.status;
    if (!data?.resolved) {
      // Sin decisión sellada: aún abierta, censo desconocido (anti-expiración →
      // `detail:'census_unavailable'`), ya cerrada por otra llamada concurrente
      // (`detail:'race_lost'`, inalcanzable bajo el `for update` de la RPC pero
      // defensivo en la SQL), o id inexistente (`error:'not_found'`). Nada que
      // ejecutar aquí.
      return {
        resolved: false,
        status,
        detail: (data?.detail as string | undefined) ?? (data?.error as string | undefined),
      };
    }

    let finalStatus = status as string;
    let detail: string | undefined = data?.reason;

    // Relectura de la fila YA SELLADA por la RPC — la usan tanto la ejecución del
    // comando como la notificación (ambas siguen siendo client-side/best-effort).
    const { data: row } = await supabase
      .from("proposals")
      .select("status, author, scope, scope_ref, title, result")
      .eq("id", proposalId)
      .single();

    // Aprobada + comando pendiente (tipo≠'none', mirror de `commandPending` en la
    // SQL) → ejecutar. GUARDA ANTI-DOBLE-EJECUCIÓN: sólo se ejecuta si la
    // RELECTURA sigue viendo 'passed'. La RPC ya garantiza que sólo una llamada
    // gana la transición open→passed (bloqueo `for update` + `where
    // status='open'` dentro de la propia RPC), pero un barrido
    // (resolveOpenProposals) puede reintentar tryResolve sobre la MISMA propuesta
    // ya resuelta por otra pestaña/sesión que aún no terminó de ejecutar su
    // comando; como passed→executed/failed es de UN SOLO SENTIDO
    // (proposals_guard), esta relectura evita re-ejecutar un comando ya resuelto
    // (p.ej. publicar dos veces).
    if (
      status === "passed" &&
      row &&
      row.status === "passed" &&
      data?.commandPending &&
      data?.command?.type &&
      data.command.type !== "none"
    ) {
      const { data: au } = await supabase.auth.getUser();
      const exec = await executeCommand(data.command, {
        supabase,
        userId: au?.user?.id ?? row.author,
        proposalId,
        scope: row.scope,
        scopeRef: row.scope_ref,
      });
      finalStatus = exec.ok ? "executed" : "failed";
      detail = exec.detail;
      await supabase
        .from("proposals")
        .update({
          status: finalStatus,
          // Preserva el `result` server-side (reason/winningChoice/tally, sellado
          // por gov_resolve_proposal DENTRO de la RPC) y AÑADE el desenlace de la
          // ejecución, en vez de sobrescribirlo — el recuento autoritativo vive ahí.
          result: { ...(row.result ?? {}), command: { ok: exec.ok, detail: exec.detail } },
          executed_at: new Date().toISOString(),
        })
        .eq("id", proposalId)
        .eq("status", "passed");
    }

    // Notificación de resultado a los participantes (best-effort, como antes).
    try {
      if (row) {
        const voterIds = await resolveVoterIds(row.scope, row.scope_ref ?? null);
        const targets = voterIds.length > 0 ? voterIds : [row.author];
        const rows = targets.map((uidv) => ({
          proposal_id: proposalId,
          user_id: uidv,
          kind: "result",
          message: `Resultado: ${row.title} → ${finalStatus}`,
          seen: false,
        }));
        await supabase.from("proposal_notifications").insert(rows);
      }
    } catch {
      /* */
    }

    return { resolved: true, status: finalStatus, detail };
  } catch (e: any) {
    return { resolved: false, detail: e?.message };
  }
}

// Resuelve todas las propuestas abiertas y vencidas de un ámbito (o globalmente).
export async function resolveOpenProposals(
  scope?: string,
  scopeRef?: string | null,
): Promise<number> {
  const supabase = createClient();
  let resolved = 0;
  try {
    let q = supabase.from("proposals").select("id, scope, scope_ref, params, status").eq("status", "open");
    if (scope) q = q.eq("scope", scope);
    if (scopeRef !== undefined && scopeRef !== null) q = q.eq("scope_ref", scopeRef);
    const { data } = await q.limit(200);
    const now = Date.now();
    for (const row of (data as any[]) ?? []) {
      const endsAt = row?.params?.votingEndsAt ? new Date(row.params.votingEndsAt).getTime() : now + 1;
      if (now >= endsAt) {
        const r = await tryResolve(row.id);
        if (r.resolved) resolved += 1;
      }
    }
  } catch {
    /* */
  }
  return resolved;
}
