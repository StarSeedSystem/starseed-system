// src/components/political-proposal-card.tsx
"use client";

// StarSeed · Área Política — Ficha AVANZADA de propuesta democrática.
// Sustituye la tarjeta anterior (datos de ejemplo estáticos) por una ficha
// REAL sobre el motor de Ontocracia (src/lib/governance/engine.ts): votos
// públicos verificables, cuenta regresiva de cierre, opciones dinámicas,
// enmiendas democráticas con historial, voto líquido delegado (visible +
// revocable), notificaciones inteligentes y contexto de Astraura. Reutiliza
// el motor existente al 100% — sólo añade capas (params.political / helpers de
// src/lib/governance/political.ts), sin tocar el esquema ni otras superficies.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Vote,
  Loader2,
  Gavel,
  Users,
  Percent,
  ShieldAlert,
  Waypoints,
  Rocket,
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { castVote, listVotes, tally, evaluate, tryResolve } from "@/lib/governance/engine";
import { getConfig, eligibleCount } from "@/lib/governance/config";
import { loadActiveDelegations, topicForProposal, type Delegation } from "@/lib/governance/delegations";
import { badgesForProfile, type ProfileBadge } from "@/lib/badges/badges";
import DelegationPanel from "@/components/governance/delegation-panel";
import CountdownTimer from "@/components/governance/countdown-timer";
import DynamicOptionsPanel from "@/components/governance/dynamic-options-panel";
import AmendmentsPanel from "@/components/governance/amendments-panel";
import VerifiableVoteLog from "@/components/governance/verifiable-vote-log";
import ProposalAstraturaContext from "@/components/governance/proposal-astraura-context";
import { entityKindMeta } from "@/lib/entity-kinds";
import { getPolitical, getExecution, checkAndSendReminders } from "@/lib/governance/political";
import {
  URGENCY,
  YESNO_OPTIONS,
  type GovernanceConfig,
  type Proposal,
  type ProposalOption,
  type ProposalVote,
} from "@/lib/governance/types";

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Vote }> = {
  open: { label: "En votación", cls: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10", icon: Vote },
  passed: { label: "Aprobada", cls: "border-emerald-400/50 text-emerald-200 bg-emerald-500/15", icon: CheckCircle2 },
  executed: { label: "Ejecutada", cls: "border-cyan-400/50 text-cyan-200 bg-cyan-500/15", icon: Rocket },
  rejected: { label: "Rechazada", cls: "border-red-400/40 text-red-200 bg-red-500/10", icon: XCircle },
  expired: { label: "Sin quórum", cls: "border-amber-400/40 text-amber-200 bg-amber-500/10", icon: AlertTriangle },
  failed: { label: "Falló", cls: "border-red-400/50 text-red-200 bg-red-500/15", icon: AlertTriangle },
};

const KIND_LABEL: Record<string, string> = {
  decision: "Decisión",
  project: "Proyecto ejecutivo",
  consulta_constitucional: "Consulta constitucional",
  impugnacion: "Propuesta impugnada",
  policy: "Política",
};

function Bar({ value, max, warning }: { value: number; max: number; warning?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={cn("h-full rounded-full", warning ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface AuthorInfo {
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  badges: ProfileBadge[];
}

export function PoliticalProposalCard({ proposal, onChange }: { proposal: Proposal; onChange?: () => void }) {
  const [votes, setVotes] = useState<ProposalVote[]>([]);
  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [eligible, setEligible] = useState<number | null>(null);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [author, setAuthor] = useState<AuthorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [resolving, setResolving] = useState(false);
  const [showLiquid, setShowLiquid] = useState(false);

  const isClosed = ["passed", "rejected", "expired", "executed", "failed"].includes(proposal.status);
  const political = useMemo(() => getPolitical(proposal), [proposal]);
  const execution = useMemo(() => getExecution(proposal), [proposal]);

  const opts: ProposalOption[] = useMemo(
    () => ((proposal.options ?? []).length > 0 ? proposal.options : YESNO_OPTIONS),
    [proposal.options],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, cfg, el, dels] = await Promise.all([
        listVotes(proposal.id),
        getConfig(proposal.scope, proposal.scope_ref),
        eligibleCount(proposal.scope, proposal.scope_ref),
        loadActiveDelegations(topicForProposal(proposal)),
      ]);
      setVotes(v);
      setConfig(cfg);
      setEligible(el);
      setDelegations(dels);

      // Ficha del proponente: perfil + insignias (meritocracia del entendimiento).
      if (proposal.author) {
        try {
          const supabase = createClient();
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, display_name, handle, avatar_url")
            .eq("user_id", proposal.author)
            .maybeSingle();
          if (prof?.id) {
            const badges = await badgesForProfile(prof.id);
            setAuthor({ displayName: prof.display_name ?? null, handle: prof.handle ?? null, avatarUrl: prof.avatar_url ?? null, badges });
          }
        } catch {
          /* ficha del proponente: best-effort */
        }
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, [proposal]);

  useEffect(() => {
    load();
  }, [load]);

  // Recordatorios inteligentes (50% + último día, según urgencia): chequeo
  // oportunista al visualizar la propuesta (best-effort, sin cron de servidor).
  useEffect(() => {
    if (proposal.status === "open") void checkAndSendReminders(proposal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.id, proposal.status]);

  const t = useMemo(() => tally(proposal, votes, eligible, delegations), [proposal, votes, eligible, delegations]);
  const ev = useMemo(() => evaluate(proposal, votes, config, eligible, delegations), [proposal, votes, config, eligible, delegations]);

  const votesByChoice = useMemo(() => {
    const map: Record<string, ProposalVote[]> = {};
    for (const v of votes) (map[v.choice] ||= []).push(v);
    return map;
  }, [votes]);

  const startedAt = useMemo(() => {
    const endsAt = proposal.params?.votingEndsAt;
    const mins = Number(proposal.params?.votingMinutes) || 0;
    if (!endsAt || !mins) return undefined;
    return new Date(new Date(endsAt).getTime() - mins * 60_000).toISOString();
  }, [proposal.params]);

  async function vote(choice: string) {
    setBusy(choice);
    try {
      const res = await castVote(proposal.id, choice, comment);
      if (!res.ok) toast.error(res.error ?? "No se pudo votar.");
      else {
        setComment("");
        await load();
        onChange?.();
      }
    } catch {
      toast.error("No se pudo votar.");
    }
    setBusy(null);
  }

  async function resolveNow() {
    setResolving(true);
    try {
      const r = await tryResolve(proposal.id);
      if (r.resolved) {
        toast.success(`Resuelta: ${r.status}${r.detail ? ` · ${r.detail}` : ""}`);
        onChange?.();
      } else {
        toast.message("Aún no es resoluble (falta tiempo o quórum).");
        await load();
      }
    } catch {
      toast.error("No se pudo resolver.");
    }
    setResolving(false);
  }

  const sMeta = STATUS_META[proposal.status] ?? STATUS_META.open;
  const SIcon = sMeta.icon;
  const uMeta = URGENCY[proposal.params?.urgency ?? "normal"] ?? URGENCY.normal;
  const params = proposal.params ?? ({} as Proposal["params"]);
  const hierarchical = config?.mode === "hierarchical";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/5 p-4",
        proposal.status === "executed"
          ? "border-cyan-500/40 bg-cyan-500/5"
          : proposal.status === "passed"
            ? "border-emerald-500/40 bg-emerald-500/5"
            : proposal.status === "rejected" || proposal.status === "failed"
              ? "border-red-500/30 bg-red-500/5"
              : "border-white/10",
      )}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white break-words">{proposal.title}</span>
            <Badge variant="outline" className={cn("gap-1 text-[9px]", sMeta.cls)}>
              <SIcon className="h-2.5 w-2.5" /> {sMeta.label}
            </Badge>
            <Badge variant="outline" className={cn("text-[9px]", uMeta.color)}>
              {uMeta.label}
            </Badge>
            {proposal.kind && KIND_LABEL[proposal.kind] && (
              <Badge variant="outline" className="text-[9px] border-white/15 text-white/50">
                {KIND_LABEL[proposal.kind]}
              </Badge>
            )}
            {hierarchical && (
              <Badge variant="outline" className="gap-1 text-[9px] border-amber-400/40 text-amber-200 bg-amber-500/10">
                <ShieldAlert className="h-2.5 w-2.5" /> Jerárquico
              </Badge>
            )}
          </div>

          {proposal.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-white/55">{proposal.description}</p>
          )}

          {/* Proponente + meritocracia (insignias) */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/40">
            <span>
              Propuesta por{" "}
              <span className="text-white/70">
                {author?.displayName || (author?.handle ? `@${author.handle}` : proposal.author?.slice(0, 8) ?? "alguien")}
              </span>
            </span>
            {author && author.badges.length > 0 && (
              <span className="flex items-center gap-1" title={author.badges.map((b) => b.name).join(", ")}>
                <Award className="h-3 w-3 text-amber-300/80" />
                {author.badges.slice(0, 3).map((b) => (
                  <Badge key={b.id} variant="outline" className="text-[8px] border-amber-400/30 text-amber-200/80">
                    {b.name}
                  </Badge>
                ))}
              </span>
            )}
            <span>· {new Date(proposal.created_at).toLocaleString("es-ES")}</span>
          </div>

          {/* Afecta a */}
          {political.affects.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-white/35">Afecta a:</span>
              {political.affects.map((a) => {
                const meta = entityKindMeta(a.kind);
                const Icon = meta.icon;
                return (
                  <Badge key={`${a.kind}:${a.slug}`} variant="outline" className="gap-1 text-[9px]" style={{ borderColor: `${meta.accent}55`, color: meta.accent }}>
                    <Icon className="h-2.5 w-2.5" /> {a.label || a.slug}
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Cuenta regresiva */}
          <div className="mt-2">
            <CountdownTimer endsAt={isClosed ? null : params.votingEndsAt} startedAt={startedAt} />
          </div>
        </div>
      </div>

      {/* Quórum / participación */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-white/50">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Participantes
            </span>
            <span className="text-white/70">
              {t.participants} / mín. {params.minParticipants ?? 0}
            </span>
          </div>
          <Bar value={t.participants} max={Math.max(1, params.minParticipants ?? 1)} warning={t.participants < (params.minParticipants ?? 0)} />
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-white/50">
            <span className="flex items-center gap-1">
              <Percent className="h-3 w-3" /> Participación
            </span>
            <span className="text-white/70">
              {t.turnoutPct}%{params.minPercent ? ` / mín. ${params.minPercent}%` : ""}
              {eligible != null ? ` · censo ${eligible}` : ""}
            </span>
          </div>
          <Bar value={t.turnoutPct} max={Math.max(1, params.minPercent || 100)} warning={!!params.minPercent && t.turnoutPct < params.minPercent} />
        </div>
      </div>

      {/* Opciones con recuentos + votantes públicos */}
      <div className="mt-3 space-y-2">
        {opts.map((o) => {
          const c = t.counts[o.id] ?? 0;
          const voters = votesByChoice[o.id] ?? [];
          const isLeader = t.leader === o.id && c > 0;
          return (
            <div key={o.id} className={cn("rounded-lg border p-2", isLeader ? "border-emerald-400/40 bg-emerald-500/5" : "border-white/10 bg-white/5")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-white">{o.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-emerald-300">{c}</span>
                  {!isClosed && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === o.id}
                      onClick={() => vote(o.id)}
                      className="h-7 gap-1 border-white/15 text-white/70 hover:bg-emerald-900/20"
                    >
                      {busy === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Vote className="h-3 w-3" />}
                      Votar
                    </Button>
                  )}
                </div>
              </div>
              {voters.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {voters.map((v) => (
                    <span
                      key={v.voter}
                      className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-white/60"
                      title={v.comment || undefined}
                    >
                      {v.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500/30 text-[8px] text-emerald-100">
                          {(v.display_name || v.handle || "?").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      {v.display_name || (v.handle ? `@${v.handle}` : v.voter.slice(0, 6))}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Registro público verificable (orden + cadena de huellas) */}
      <VerifiableVoteLog votes={votes} />

      {/* Comentario + voto rápido sí/no si aplica */}
      {!isClosed && (
        <div className="mt-3 space-y-2">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario (público, opcional)…"
            className="h-8 bg-white/5 text-xs"
          />
          {(proposal.options ?? []).length === 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy === "yes"} onClick={() => vote("yes")} className="h-8 gap-1 border-emerald-400/30 text-emerald-200 hover:bg-emerald-900/20">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sí
              </Button>
              <Button size="sm" variant="outline" disabled={busy === "no"} onClick={() => vote("no")} className="h-8 gap-1 border-red-400/30 text-red-200 hover:bg-red-900/20">
                <XCircle className="h-3.5 w-3.5" /> No
              </Button>
              <Button size="sm" variant="outline" disabled={busy === "abstain"} onClick={() => vote("abstain")} className="h-8 gap-1 border-white/15 text-white/60">
                <MessageSquare className="h-3.5 w-3.5" /> Abstención
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Opciones dinámicas (alternativas propuestas + promoción) */}
      <DynamicOptionsPanel
        proposalId={proposal.id}
        pendingOptions={political.pendingOptions}
        promoteThreshold={political.promoteThreshold}
        isClosed={isClosed}
        onChange={onChange}
      />

      {/* Edición democrática (enmiendas + historial) */}
      <AmendmentsPanel
        proposalId={proposal.id}
        amendments={political.amendments}
        editHistory={political.editHistory}
        isOpen={!isClosed}
        onChange={onChange}
      />

      {/* Voto líquido delegado — visible + revocable, colapsable */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowLiquid((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-1.5 text-[11px] text-cyan-300/70 hover:text-cyan-200"
        >
          {showLiquid ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Waypoints className="h-3.5 w-3.5" />
          Voto líquido delegado {delegations.length > 0 ? `(${delegations.length} delegación${delegations.length === 1 ? "" : "es"} activa${delegations.length === 1 ? "" : "s"} en este tema)` : ""}
        </button>
        {showLiquid && (
          <div className="mt-2">
            <DelegationPanel scope={proposal.scope} scopeRef={proposal.scope_ref ?? undefined} accent={uMeta.color.includes("emerald") ? "#10B981" : undefined} />
          </div>
        )}
      </div>

      {/* Contexto de Aurora */}
      <ProposalAstraturaContext
        title={proposal.title}
        description={proposal.description}
        scope={proposal.scope}
        scopeRef={proposal.scope_ref}
        affects={political.affects}
      />

      {/* Estado / acción de resolución */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <span className="flex-1 text-[11px] text-white/50">
          {isClosed ? (proposal.result?.reason as string) || ev.reason : ev.reason}
        </span>
        {!isClosed && ev.decided && (
          <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500" onClick={resolveNow} disabled={resolving}>
            {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
            {proposal.command && proposal.command.type !== "none" ? "Resolver y ejecutar" : "Resolver ahora"}
          </Button>
        )}
        {(proposal.status === "passed" || proposal.status === "executed") && (
          <Badge variant="outline" className="gap-1 text-[9px] border-cyan-400/40 text-cyan-200 bg-cyan-500/10">
            <Rocket className="h-2.5 w-2.5" />
            Mandato: {execution.status.replace("_", " ")} ({execution.progress}%) — ver pestaña Ejecutivo
          </Badge>
        )}
      </div>
    </div>
  );
}

export default PoliticalProposalCard;
