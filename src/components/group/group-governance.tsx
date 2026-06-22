"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Vote,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Check,
  Loader2,
  Gavel,
  Settings,
  Brain,
  Bot,
  Scale,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ProposalKind = "config" | "memory" | "agent" | "policy";

type Proposal = {
  id: string;
  group_id: string;
  scope: string | null;
  author: string;
  title: string;
  description: string | null;
  kind: ProposalKind | string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

type VoteRow = {
  proposal_id: string;
  voter: string;
  vote: number;
  created_at?: string;
};

type Tally = { up: number; down: number; sum: number; total: number; mine: number | null };

const KIND_META: Record<ProposalKind, { label: string; icon: typeof Settings; color: string }> = {
  config: { label: "Configuración", icon: Settings, color: "text-cyan-300 border-cyan-400/40 bg-cyan-500/10" },
  memory: { label: "Memoria", icon: Brain, color: "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/10" },
  agent: { label: "Agente", icon: Bot, color: "text-amber-300 border-amber-400/40 bg-amber-500/10" },
  policy: { label: "Política", icon: Scale, color: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" },
};

const KIND_OPTIONS: ProposalKind[] = ["config", "memory", "agent", "policy"];

// Umbral de gobernanza: mayoría a favor y al menos 3 votos emitidos.
const MIN_VOTES = 3;

function kindMeta(kind: string) {
  return KIND_META[kind as ProposalKind] ?? KIND_META.config;
}

export function GroupGovernance({ groupId }: { groupId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [loading, setLoading] = useState(true);
  const [busyVote, setBusyVote] = useState<string | null>(null);
  const [busyAccept, setBusyAccept] = useState<string | null>(null);

  // formulario de nueva propuesta
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProposalKind>("config");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);

      const { data: props } = await supabase
        .from("group_ai_proposals")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });

      const list = (props as Proposal[]) ?? [];
      setProposals(list);

      if (list.length > 0) {
        const ids = list.map((p) => p.id);
        const { data: votes } = await supabase
          .from("group_ai_votes")
          .select("*")
          .in("proposal_id", ids);

        const byProposal: Record<string, Tally> = {};
        for (const id of ids) byProposal[id] = { up: 0, down: 0, sum: 0, total: 0, mine: null };
        for (const v of (votes as VoteRow[]) ?? []) {
          const t = byProposal[v.proposal_id];
          if (!t) continue;
          if (v.vote > 0) t.up += 1;
          else if (v.vote < 0) t.down += 1;
          t.sum += v.vote;
          t.total += 1;
          if (uid && v.voter === uid) t.mine = v.vote;
        }
        setTallies(byProposal);
      } else {
        setTallies({});
      }
    } catch {
      /* sin sesión / error transitorio */
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createProposal() {
    if (!userId || !title.trim()) {
      setError(!userId ? "Inicia sesión para proponer." : "Pon un título a la propuesta.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("group_ai_proposals").insert({
        group_id: groupId,
        scope: "group",
        author: userId,
        title: title.trim(),
        description: description.trim() || null,
        kind,
        payload: {},
        status: "open",
      });
      if (err) {
        setError(err.message);
      } else {
        setCreating(false);
        setTitle("");
        setDescription("");
        setKind("config");
        await load();
      }
    } catch {
      setError("No se pudo crear la propuesta.");
    }
    setSaving(false);
  }

  async function castVote(proposalId: string, value: 1 | -1) {
    if (!userId) {
      setError("Inicia sesión para votar.");
      return;
    }
    setBusyVote(proposalId);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("group_ai_votes")
        .upsert(
          { proposal_id: proposalId, voter: userId, vote: value },
          { onConflict: "proposal_id,voter" },
        );
      if (err) setError(err.message);
      await load();
    } catch {
      setError("No se pudo registrar tu voto.");
    }
    setBusyVote(null);
  }

  async function acceptProposal(p: Proposal) {
    if (!userId || p.author !== userId) return;
    setBusyAccept(p.id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("group_ai_proposals")
        .update({ status: "accepted" })
        .eq("id", p.id);
      if (err) setError(err.message);
      await load();
    } catch {
      setError("No se pudo aceptar la propuesta.");
    }
    setBusyAccept(null);
  }

  function canAccept(p: Proposal, t: Tally | undefined): boolean {
    if (!t) return false;
    return p.status === "open" && t.total >= MIN_VOTES && t.up > t.down;
  }

  return (
    <div className="space-y-4">
      {/* Cabecera + crear */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gavel className="w-4 h-4 text-emerald-300" />
          <span className="text-sm font-semibold text-white">Gobernanza democrática</span>
          <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-200/80">
            mayoría · mín. {MIN_VOTES} votos
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-white/60 hover:text-white"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Actualizar
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus className="w-3.5 h-3.5" /> Nueva propuesta
          </Button>
        </div>
      </div>

      {creating && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
          <label className="block text-[11px] text-white/50">
            Título
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Activar memoria compartida del grupo"
              className="mt-1 bg-white/5 text-sm h-9"
            />
          </label>
          <label className="block text-[11px] text-white/50">
            Descripción
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explica qué propones y por qué…"
              className="mt-1 bg-black/40 border-white/10 text-xs min-h-[80px]"
            />
          </label>
          <div>
            <div className="text-[11px] text-white/50 mb-1">Tipo de propuesta</div>
            <div className="flex flex-wrap gap-1.5">
              {KIND_OPTIONS.map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "text-[11px] rounded-full px-2.5 py-1 border transition flex items-center gap-1",
                      active
                        ? meta.color
                        : "bg-white/5 border-white/10 text-white/60 hover:border-white/30",
                    )}
                  >
                    <Icon className="w-3 h-3" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-500"
              disabled={saving || !title.trim()}
              onClick={createProposal}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Publicar propuesta
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-[11px] rounded px-2 py-1.5 bg-red-900/30 text-red-200 border border-red-500/30 break-words">
          {error}
        </div>
      )}

      {/* Lista de propuestas */}
      {loading ? (
        <div className="text-sm text-white/40 px-1 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando propuestas…
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
          <Vote className="w-6 h-6 text-emerald-300/50 mx-auto mb-2" />
          <div className="text-sm text-white/50">
            Aún no hay propuestas. Crea la primera para empezar a decidir en grupo.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => {
            const t = tallies[p.id];
            const meta = kindMeta(p.kind);
            const KindIcon = meta.icon;
            const accepted = p.status === "accepted";
            const eligible = canAccept(p, t);
            const isAuthor = !!userId && p.author === userId;
            const myVote = t?.mine ?? null;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-lg border bg-white/5 p-3",
                  accepted ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white break-words">{p.title}</span>
                      <Badge variant="outline" className={cn("text-[9px] gap-1", meta.color)}>
                        <KindIcon className="w-2.5 h-2.5" /> {meta.label}
                      </Badge>
                      {accepted ? (
                        <Badge variant="outline" className="text-[9px] gap-1 border-emerald-500/50 text-emerald-200 bg-emerald-500/10">
                          <Check className="w-2.5 h-2.5" /> Aceptada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] border-white/15 text-white/50">
                          Abierta
                        </Badge>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-white/55 mt-1 whitespace-pre-wrap break-words">{p.description}</p>
                    )}
                    <div className="text-[10px] text-white/35 mt-1">
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Recuento */}
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "text-lg font-bold font-mono leading-none",
                        (t?.sum ?? 0) > 0
                          ? "text-emerald-300"
                          : (t?.sum ?? 0) < 0
                            ? "text-red-300"
                            : "text-white/60",
                      )}
                    >
                      {(t?.sum ?? 0) > 0 ? "+" : ""}
                      {t?.sum ?? 0}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5 flex items-center gap-1.5 justify-end">
                      <span className="flex items-center gap-0.5 text-emerald-300/80">
                        <ThumbsUp className="w-2.5 h-2.5" /> {t?.up ?? 0}
                      </span>
                      <span className="flex items-center gap-0.5 text-red-300/80">
                        <ThumbsDown className="w-2.5 h-2.5" /> {t?.down ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyVote === p.id || accepted}
                    onClick={() => castVote(p.id, 1)}
                    className={cn(
                      "gap-1.5 h-8 border-white/15 hover:bg-emerald-900/20",
                      myVote === 1 ? "border-emerald-400/60 text-emerald-200 bg-emerald-500/10" : "text-white/70",
                    )}
                  >
                    {busyVote === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ThumbsUp className="w-3.5 h-3.5" />
                    )}
                    A favor
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyVote === p.id || accepted}
                    onClick={() => castVote(p.id, -1)}
                    className={cn(
                      "gap-1.5 h-8 border-white/15 hover:bg-red-900/20",
                      myVote === -1 ? "border-red-400/60 text-red-200 bg-red-500/10" : "text-white/70",
                    )}
                  >
                    {busyVote === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ThumbsDown className="w-3.5 h-3.5" />
                    )}
                    En contra
                  </Button>

                  {!accepted && eligible && isAuthor && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-500 ml-auto"
                      disabled={busyAccept === p.id}
                      onClick={() => acceptProposal(p)}
                    >
                      {busyAccept === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Gavel className="w-3.5 h-3.5" />
                      )}
                      Marcar como aceptada
                    </Button>
                  )}
                  {!accepted && eligible && !isAuthor && (
                    <span className="text-[10px] text-emerald-300/70 ml-auto self-center">
                      Mayoría alcanzada · pendiente de que el autor la confirme
                    </span>
                  )}
                  {!accepted && !eligible && (
                    <span className="text-[10px] text-white/35 ml-auto self-center">
                      Faltan {Math.max(0, MIN_VOTES - (t?.total ?? 0))} voto(s) para poder aceptar
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GroupGovernance;
