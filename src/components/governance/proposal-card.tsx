"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Clock,
  Users,
  Percent,
  Gavel,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Rocket,
  Paperclip,
  Zap,
  MessageSquare,
  Vote,
  ShieldAlert,
  Network,
  Waypoints,
} from "lucide-react";
import {
  castVote,
  listVotes,
  tally,
  evaluate,
  tryResolve,
} from "@/lib/governance/engine";
import { getConfig, eligibleCount } from "@/lib/governance/config";
import { commandTypeById } from "@/lib/governance/commands";
import {
  loadActiveDelegations,
  topicForProposal,
  type Delegation,
} from "@/lib/governance/delegations";
import { loadMeritWeights, topicToMeritArea } from "@/lib/governance/merit";
import { reachFromParams, eligibleForReach, reachSummary } from "@/lib/governance/reach";
import {
  URGENCY,
  YESNO_OPTIONS,
  type GovernanceConfig,
  type MeritParams,
  type Proposal,
  type ProposalOption,
  type ProposalVote,
} from "@/lib/governance/types";

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Vote }> = {
  open: { label: "Abierta", cls: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10", icon: Vote },
  passed: { label: "Aprobada", cls: "border-emerald-400/50 text-emerald-200 bg-emerald-500/15", icon: CheckCircle2 },
  executed: { label: "Ejecutada", cls: "border-cyan-400/50 text-cyan-200 bg-cyan-500/15", icon: Rocket },
  rejected: { label: "Rechazada", cls: "border-red-400/40 text-red-200 bg-red-500/10", icon: XCircle },
  expired: { label: "Sin quórum", cls: "border-amber-400/40 text-amber-200 bg-amber-500/10", icon: AlertTriangle },
  failed: { label: "Falló", cls: "border-red-400/50 text-red-200 bg-red-500/15", icon: AlertTriangle },
};

function fmtRemaining(endsAt?: string): string {
  if (!endsAt) return "—";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "cierre alcanzado";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `~${hrs} h`;
  return `~${Math.round(hrs / 24)} d`;
}

function Bar({ value, max, warning }: { value: number; max: number; warning?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cn("h-full rounded-full", warning ? "bg-amber-400" : "bg-emerald-400")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProposalCard({
  proposal,
  onChange,
}: {
  proposal: Proposal;
  onChange?: () => void;
}) {
  const [votes, setVotes] = useState<ProposalVote[]>([]);
  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [eligible, setEligible] = useState<number | null>(null);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  // Ponderación por mérito (OPT-IN). null ⇒ voto igualitario (×1). Ver merit.ts.
  const [meritWeights, setMeritWeights] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  // Alcance federado (supra-comunitario) de esta propuesta, si lo tiene.
  const reach = useMemo(
    () => reachFromParams(proposal.params as Record<string, unknown>),
    [proposal.params],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [resolving, setResolving] = useState(false);

  const isClosed = ["passed", "rejected", "expired", "executed", "failed"].includes(proposal.status);

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
        // Censo: supra-comunitario (federación) si aplica; si no, ámbito único.
        reach ? eligibleForReach(reach) : eligibleCount(proposal.scope, proposal.scope_ref),
        // Delegaciones activas del tema (voto líquido). Vacío si no hay tabla.
        loadActiveDelegations(topicForProposal(proposal)),
      ]);
      setVotes(v);
      setConfig(cfg);
      setEligible(el);
      setDelegations(dels);

      // Meritocracia del entendimiento (OPT-IN): sólo si la propuesta o el
      // contexto la habilitan. Por defecto null → ×1 (preview = motor real).
      const mp =
        proposal.params?.meritWeighting ??
        (cfg?.params?.meritWeighting as MeritParams | undefined);
      if (mp?.enabled) {
        const voterIds = Array.from(new Set(v.map((x) => x.voter)));
        const mw = await loadMeritWeights(voterIds, topicToMeritArea(proposal), mp);
        setMeritWeights(mw);
      } else {
        setMeritWeights(null);
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, [proposal, reach]);

  useEffect(() => {
    load();
  }, [load]);

  const t = useMemo(
    () => tally(proposal, votes, eligible, delegations, meritWeights),
    [proposal, votes, eligible, delegations, meritWeights],
  );
  const ev = useMemo(
    () => evaluate(proposal, votes, config, eligible, delegations, meritWeights),
    [proposal, votes, config, eligible, delegations, meritWeights],
  );

  const votesByChoice = useMemo(() => {
    const map: Record<string, ProposalVote[]> = {};
    for (const v of votes) {
      (map[v.choice] ||= []).push(v);
    }
    return map;
  }, [votes]);

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
  const cmdDef = proposal.command ? commandTypeById(proposal.command.type) : null;
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
            {hierarchical && (
              <Badge variant="outline" className="gap-1 text-[9px] border-amber-400/40 text-amber-200 bg-amber-500/10">
                <ShieldAlert className="h-2.5 w-2.5" /> Jerárquico
              </Badge>
            )}
            {reach && (
              <Badge
                variant="outline"
                className="gap-1 text-[9px] border-violet-400/40 text-violet-200 bg-violet-500/10"
                title={reachSummary(reach)}
              >
                <Network className="h-2.5 w-2.5" /> Supra-comunitaria
              </Badge>
            )}
            {delegations.length > 0 && (
              <Badge
                variant="outline"
                className="gap-1 text-[9px] border-cyan-400/40 text-cyan-200 bg-cyan-500/10"
                title="Voto líquido: hay delegaciones activas en este tema. El peso se calcula de forma transparente; un voto directo reclama el peso delegado."
              >
                <Waypoints className="h-2.5 w-2.5" /> Voto líquido
              </Badge>
            )}
          </div>
          {proposal.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-white/55">{proposal.description}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {isClosed ? "cerrada" : fmtRemaining(params.votingEndsAt)}
            </span>
            <span>· {new Date(proposal.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Comando */}
      {cmdDef && proposal.command && proposal.command.type !== "none" && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="text-[11px] text-amber-100/80">
            <span className="font-medium text-amber-200">{cmdDef.label}</span> — {cmdDef.blurb}
          </div>
        </div>
      )}

      {/* Adjuntos */}
      {(proposal.attachments ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {proposal.attachments.map((a, i) => (
            <Badge key={i} variant="outline" className="gap-1 text-[9px] border-cyan-500/30 text-cyan-200/80">
              <Paperclip className="h-2.5 w-2.5" /> {a.label || a.type}
              {a.value ? `: ${a.value.slice(0, 28)}` : ""}
            </Badge>
          ))}
        </div>
      )}

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
            <div
              key={o.id}
              className={cn(
                "rounded-lg border p-2",
                isLeader ? "border-emerald-400/40 bg-emerald-500/5" : "border-white/10 bg-white/5",
              )}
            >
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
              {/* Lista pública de votantes */}
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

      {/* Comentario + voto rápido sí/no si aplica */}
      {!isClosed && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentario (público, opcional)…"
              className="h-8 bg-white/5 text-xs"
            />
          </div>
          {(proposal.options ?? []).length === 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy === "yes"}
                onClick={() => vote("yes")}
                className="h-8 gap-1 border-emerald-400/30 text-emerald-200 hover:bg-emerald-900/20"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Sí
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === "no"}
                onClick={() => vote("no")}
                className="h-8 gap-1 border-red-400/30 text-red-200 hover:bg-red-900/20"
              >
                <XCircle className="h-3.5 w-3.5" /> No
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === "abstain"}
                onClick={() => vote("abstain")}
                className="h-8 gap-1 border-white/15 text-white/60"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Abstención
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Estado / acción de resolución */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <span className="flex-1 text-[11px] text-white/50">
          {isClosed ? (proposal.result?.reason as string) || ev.reason : ev.reason}
        </span>
        {!isClosed && ev.decided && (
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={resolveNow}
            disabled={resolving}
          >
            {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />}
            {proposal.command && proposal.command.type !== "none" ? "Resolver y ejecutar" : "Resolver ahora"}
          </Button>
        )}
        {(proposal.status === "executed" || proposal.status === "failed") && proposal.result?.command != null && (
          <Badge
            variant="outline"
            className={cn(
              "text-[9px]",
              (proposal.result.command as any)?.ok
                ? "border-cyan-400/50 text-cyan-200"
                : "border-red-400/50 text-red-200",
            )}
          >
            {(proposal.result.command as any)?.detail || "comando"}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default ProposalCard;
