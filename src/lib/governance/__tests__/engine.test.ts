// StarSeed · Motor de gobernanza — tests de `tally`/`evaluate` (src/lib/governance/engine.ts).
//
// `tally`/`evaluate` son funciones PURAS (sin I/O): dado un Proposal + votos +
// censo/delegaciones/mérito opcionales, calculan el recuento y el veredicto.
// Desde la Adenda 142 (2026-08-05) el SELLADO autoritativo de una propuesta se
// hace en SQL (`gov_resolve_proposal`); estas funciones siguen viviendo aquí
// porque la UI las usa para la vista EN VIVO de una propuesta aún abierta (no
// autoritativa) — ver el comentario de cabecera de engine.ts.
import { describe, expect, it } from "vitest";
import { evaluate, tally } from "@/lib/governance/engine";
import type { Delegation } from "@/lib/governance/delegations";
import type { DecisionParams, Proposal, ProposalVote } from "@/lib/governance/types";

const futureIso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const pastIso = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function makeProposal(
  overrides: Partial<Omit<Proposal, "params">> & { params?: Partial<DecisionParams> } = {},
): Proposal {
  const { params: paramsOverride, ...rest } = overrides;
  const params: DecisionParams = {
    votingMinutes: 60,
    minParticipants: 1,
    minPercent: 0,
    threshold: 50,
    urgency: "normal",
    votingEndsAt: futureIso(60),
    ...paramsOverride,
  };
  return {
    id: "prop-1",
    scope: "group",
    scope_ref: "grupo-test",
    author: "author-1",
    title: "Propuesta de prueba",
    description: null,
    kind: "decision",
    options: [],
    attachments: [],
    command: null,
    params,
    status: "open",
    result: null,
    created_at: new Date().toISOString(),
    ...rest,
  };
}

let voteSeq = 0;
function makeVote(voter: string, choice: string, weight = 1): ProposalVote {
  voteSeq += 1;
  return {
    proposal_id: "prop-1",
    voter,
    choice,
    weight,
    comment: null,
    created_at: new Date(Date.now() + voteSeq).toISOString(),
  };
}

describe("tally", () => {
  it("cuenta a todos los votantes en `participants` (incl. abstención), pero ignora la abstención en leaderShare", () => {
    const proposal = makeProposal();
    const votes = [
      makeVote("u1", "yes"),
      makeVote("u2", "yes"),
      makeVote("u3", "yes"),
      makeVote("u4", "no"),
      makeVote("u5", "abstain"),
      makeVote("u6", "abstain"),
    ];
    const t = tally(proposal, votes);
    expect(t.participants).toBe(6); // las 6 personas cuentan para el quórum
    expect(t.counts.abstain).toBe(2); // se registra el conteo de abstención...
    expect(t.leaderShare).toBe(75); // ...pero el 75% = 3 yes / (3 yes + 1 no), sin las 2 abstenciones
  });

  it("turnoutPct se calcula sobre el censo elegible conocido", () => {
    const proposal = makeProposal();
    const t = tally(proposal, [makeVote("u1", "yes"), makeVote("u2", "no")], 8);
    expect(t.turnoutPct).toBe(25); // 2/8
  });

  it("delegación y mérito se COMBINAN de forma ADITIVA (el mérito no amplifica el caudal delegado)", () => {
    const proposal = makeProposal();
    // Solo "delegado" vota directamente; "delegante1" le delegó su voz.
    const votes = [makeVote("delegado", "yes")];
    const delegations: Delegation[] = [
      { delegator_user: "delegante1", delegate_user: "delegado", topic: "group:grupo-test", expires_at: futureIso(999) },
    ];
    const meritWeights = { delegado: 2 }; // multiplicador ×2 → bonus = 2-1 = 1
    const t = tally(proposal, votes, null, delegations, meritWeights);
    // base = 1 (propio) + 1 (delegado por delegante1) = 2; + bonus 1 (una sola vez) = 3.
    // Si el mérito multiplicara TODO el caudal (bug), sería (1+1)*2 = 4.
    expect(t.counts.yes).toBe(3);
    expect(t.participants).toBe(1); // participants cuenta PERSONAS que votaron, no pesos
  });
});

describe("evaluate", () => {
  it("sí/no: si lidera 'no' se RECHAZA aunque supere el umbral (solo 'yes' aprueba)", () => {
    const proposal = makeProposal({ params: { votingEndsAt: pastIso(1), threshold: 50 } });
    const votes = [makeVote("u1", "no"), makeVote("u2", "no"), makeVote("u3", "yes")];
    const ev = evaluate(proposal, votes, null);
    expect(ev.status).toBe("rejected");
    expect(ev.winningChoice).toBe("no");
  });

  it("con opciones personalizadas, CUALQUIER opción líder aprueba (no exige 'yes')", () => {
    const proposal = makeProposal({
      options: [
        { id: "a", label: "Opción A" },
        { id: "b", label: "Opción B" },
      ],
      params: { votingEndsAt: pastIso(1), threshold: 50 },
    });
    const votes = [makeVote("u1", "a"), makeVote("u2", "a"), makeVote("u3", "b")];
    const ev = evaluate(proposal, votes, null);
    expect(ev.status).toBe("passed");
    expect(ev.winningChoice).toBe("a");
  });

  it("rechaza si el líder no alcanza el UMBRAL, aunque 'yes' vaya numéricamente en cabeza", () => {
    const proposal = makeProposal({ params: { votingEndsAt: pastIso(1), threshold: 60 } });
    // yes=5, no=4 → 56% < 60% de umbral.
    const votes = [
      makeVote("u1", "yes"), makeVote("u2", "yes"), makeVote("u3", "yes"), makeVote("u4", "yes"), makeVote("u5", "yes"),
      makeVote("u6", "no"), makeVote("u7", "no"), makeVote("u8", "no"), makeVote("u9", "no"),
    ];
    const ev = evaluate(proposal, votes, null);
    expect(ev.status).toBe("rejected");
    expect(ev.winningChoice).toBe("yes"); // lidera, pero no llega al umbral
  });

  it("quórum por CONTEO no cumplido al cerrar → expired", () => {
    const proposal = makeProposal({ params: { votingEndsAt: pastIso(1), minParticipants: 5 } });
    const votes = [makeVote("u1", "yes"), makeVote("u2", "yes")];
    const ev = evaluate(proposal, votes, null);
    expect(ev.status).toBe("expired");
  });

  it("quórum por PORCENTAJE no cumplido (censo conocido) al cerrar → expired", () => {
    const proposal = makeProposal({ params: { votingEndsAt: pastIso(1), minPercent: 50 } });
    const votes = [makeVote("u1", "yes"), makeVote("u2", "no")]; // 2/10 = 20% < 50%
    const ev = evaluate(proposal, votes, null, 10);
    expect(ev.status).toBe("expired");
  });

  it("quórum por PORCENTAJE cumplido (censo conocido) → puede resolverse (no expira)", () => {
    const proposal = makeProposal({ params: { votingEndsAt: pastIso(1), minPercent: 50, threshold: 50 } });
    // 6/10 = 60% >= 50%; yes=4, no=2 → 67% >= 50% umbral.
    const votes = [
      makeVote("u1", "yes"), makeVote("u2", "yes"), makeVote("u3", "yes"), makeVote("u4", "yes"),
      makeVote("u5", "no"), makeVote("u6", "no"),
    ];
    const ev = evaluate(proposal, votes, null, 10);
    expect(ev.decided).toBe(true);
    expect(ev.status).toBe("passed");
  });

  // ── Hallazgo: ver informe final — discrepancia con la protección "anti-expiración" ──
  it("con minPercent>0 y censo DESCONOCIDO (eligible=null), evaluate() NO finaliza al cerrar (anti-expiración) " +
    "— ALINEADO con el sellado server-side (gov_resolve_proposal): no muestra 'Expirada' en la previsualización " +
    "cuando el servidor mantendría la propuesta abierta a la espera del censo (Adenda 150).", () => {
    const proposal = makeProposal({ params: { votingEndsAt: pastIso(1), minPercent: 30, threshold: 50 } });
    const votes = [makeVote("u1", "yes"), makeVote("u2", "yes"), makeVote("u3", "no")];
    const ev = evaluate(proposal, votes, null, null); // eligible=null → censo desconocido
    expect(ev.decided).toBe(false);
    expect(ev.status).toBe("open");
  });

  it("decisión anticipada (early-decisive) resuelve ANTES de cerrar en 1 persona = 1 voto puro, si el líder es matemáticamente inalcanzable", () => {
    const proposal = makeProposal({ params: { votingEndsAt: futureIso(120) } }); // aún NO ha cerrado
    // 6 yes, 1 no, eligible=10 → quedan 3 personas por votar; 6 > 1+3 → nadie puede ya alcanzar a "yes".
    const votes = [
      makeVote("u1", "yes"), makeVote("u2", "yes"), makeVote("u3", "yes"),
      makeVote("u4", "yes"), makeVote("u5", "yes"), makeVote("u6", "yes"),
      makeVote("u7", "no"),
    ];
    const ev = evaluate(proposal, votes, null, 10);
    expect(ev.status).toBe("passed");
    expect(ev.reason).toContain("anticipada");
  });

  it("SIN decisión anticipada (sigue 'open') si hay DELEGACIONES activas, aunque el líder parezca inalcanzable", () => {
    const proposal = makeProposal({ params: { votingEndsAt: futureIso(120) } });
    const votes = [
      makeVote("u1", "yes"), makeVote("u2", "yes"), makeVote("u3", "yes"),
      makeVote("u4", "yes"), makeVote("u5", "yes"), makeVote("u6", "yes"),
      makeVote("u7", "no"),
    ];
    const delegations: Delegation[] = [
      { delegator_user: "zzz", delegate_user: "u7", topic: "group:grupo-test", expires_at: futureIso(999) },
    ];
    const ev = evaluate(proposal, votes, null, 10, delegations);
    expect(ev.decided).toBe(false);
    expect(ev.status).toBe("open");
  });

  it("SIN decisión anticipada (sigue 'open') si hay PONDERACIÓN POR MÉRITO activa, aunque no haya delegaciones", () => {
    const proposal = makeProposal({ params: { votingEndsAt: futureIso(120) } });
    const votes = [
      makeVote("u1", "yes"), makeVote("u2", "yes"), makeVote("u3", "yes"),
      makeVote("u4", "yes"), makeVote("u5", "yes"), makeVote("u6", "yes"),
      makeVote("u7", "no"),
    ];
    const ev = evaluate(proposal, votes, null, 10, undefined, { u1: 1.5 });
    expect(ev.decided).toBe(false);
    expect(ev.status).toBe("open");
  });

  it("aún abierta (sin timeUp ni decisión anticipada) → decided:false, status:'open'", () => {
    const proposal = makeProposal({ params: { votingEndsAt: futureIso(60), minParticipants: 5 } });
    const ev = evaluate(proposal, [makeVote("u1", "yes")], null);
    expect(ev.decided).toBe(false);
    expect(ev.status).toBe("open");
  });
});
