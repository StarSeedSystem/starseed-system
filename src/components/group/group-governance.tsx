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
  Lock,
  Rocket,
  PackageCheck,
  Crown,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getConfig, saveConfig } from "@/lib/governance/config";
import { GovernanceModeBadge } from "@/components/governance/permission-gate";
import type { GovernanceMode } from "@/lib/governance/types";
import { useRealtime } from "@/lib/realtime/realtime";

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

// Mapea el tipo de propuesta al conjunto de "kinds" de la memoria materializada.
function kindsForProposal(kind: string): string[] {
  switch (kind) {
    case "memory":
      return ["memory"];
    case "agent":
      return ["config", "skills"];
    case "policy":
      return ["config", "md"];
    case "config":
    default:
      return ["config"];
  }
}

export function GroupGovernance({ groupId, isMember = true }: { groupId: string; isMember?: boolean }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [loading, setLoading] = useState(true);
  const [busyVote, setBusyVote] = useState<string | null>(null);
  const [busyAccept, setBusyAccept] = useState<string | null>(null);
  const [busyApply, setBusyApply] = useState<string | null>(null);

  // Modo de gobernanza real del grupo (governance_configs · scope="group").
  const [govMode, setGovMode] = useState<GovernanceMode>("democratic");
  const [savingMode, setSavingMode] = useState(false);

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

      // Modo de gobernanza del grupo (best-effort).
      try {
        const cfg = await getConfig("group", groupId);
        setGovMode(cfg.mode);
      } catch {
        /* sin config aún */
      }

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

  // TIEMPO REAL: refleja en vivo nuevas propuestas / cambios de estado y los
  // votos emitidos, re-ejecutando el loader (recuentos incluidos).
  useRealtime("group_ai_proposals", { filter: groupId ? `group_id=eq.${groupId}` : undefined }, () => {
    void load();
  });
  // Los votos no llevan group_id (referencian proposal_id); escuchamos la tabla
  // completa y dejamos que RLS filtre. `load()` recalcula los recuentos.
  useRealtime("group_ai_votes", {}, () => {
    void load();
  });

  // Guarda el modo de gobernanza del grupo. La opción democrática SIEMPRE
  // queda disponible (saveConfig fuerza allowDemocraticOverride: true).
  async function saveMode(next: GovernanceMode) {
    if (!isMember) {
      setError("Únete al grupo para cambiar el modo de gobernanza.");
      return;
    }
    if (next === govMode) return;
    setSavingMode(true);
    setError(null);
    try {
      const prev = govMode;
      setGovMode(next);
      const cfg = await getConfig("group", groupId);
      const res = await saveConfig("group", groupId, next, cfg.params || {});
      if (!res.ok) {
        setGovMode(prev);
        setError(res.error ?? "No se pudo guardar el modo de gobernanza.");
      } else {
        toast.success(
          next === "hierarchical"
            ? "Modo jerárquico activado · la opción democrática sigue disponible"
            : "Modo democrático activado",
        );
      }
    } catch {
      setError("No se pudo guardar el modo de gobernanza.");
    }
    setSavingMode(false);
  }

  async function createProposal() {
    if (!isMember) {
      setError("Únete al grupo para participar.");
      return;
    }
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
    if (!isMember) {
      setError("Únete al grupo para participar.");
      return;
    }
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

  // Motor de aplicación: materializa el payload de una propuesta aceptada como
  // memoria de grupo, y marca la propuesta como "applied".
  async function applyProposal(p: Proposal) {
    if (!userId || p.author !== userId) return;
    setBusyApply(p.id);
    setError(null);
    try {
      const supabase = createClient();
      const payload = p.payload ?? {};
      const kinds = kindsForProposal(p.kind);

      // ¿Existe ya una memoria materializada desde esta propuesta? (upsert manual)
      const { data: existing } = await supabase
        .from("memories")
        .select("id, config")
        .eq("scope", "group")
        .eq("scope_ref", groupId)
        .eq("owner", userId)
        .eq("name", p.title)
        .limit(1);

      const prior = (existing as { id: string; config: Record<string, unknown> | null }[] | null)?.[0];

      if (prior) {
        const { error: upErr } = await supabase
          .from("memories")
          .update({
            kinds,
            format: "json",
            content: JSON.stringify(payload),
            config: { ...(prior.config ?? {}), from_proposal: p.id, applied_kind: p.kind },
          })
          .eq("id", prior.id);
        if (upErr) {
          setError(upErr.message);
          setBusyApply(null);
          return;
        }
      } else {
        const { error: insErr } = await supabase.from("memories").insert({
          owner: userId,
          name: p.title,
          scope: "group",
          scope_ref: groupId,
          kinds,
          format: "json",
          storage: ["account"],
          sync: true,
          content: JSON.stringify(payload),
          config: { from_proposal: p.id, applied_kind: p.kind },
        });
        if (insErr) {
          setError(insErr.message);
          setBusyApply(null);
          return;
        }
      }

      // Marcar la propuesta como aplicada.
      const { error: stErr } = await supabase
        .from("group_ai_proposals")
        .update({ status: "applied" })
        .eq("id", p.id);
      if (stErr) setError(stErr.message);
      await load();
    } catch {
      setError("No se pudo aplicar la propuesta al grupo.");
    }
    setBusyApply(null);
  }

  function canAccept(p: Proposal, t: Tally | undefined): boolean {
    if (!t) return false;
    return p.status === "open" && t.total >= MIN_VOTES && t.up > t.down;
  }

  const participationLocked = !isMember;

  return (
    <div className="space-y-4">
      {/* Aviso de pertenencia */}
      {participationLocked && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/5 p-3 flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-100/80 leading-relaxed">
            <span className="text-amber-200 font-medium">Únete al grupo para participar.</span> Puedes ver las
            propuestas y los recuentos, pero proponer y votar está reservado a los miembros. Ve a la pestaña{" "}
            <span className="text-amber-200 font-medium">Miembros</span> para unirte.
          </div>
        </div>
      )}

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
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
            onClick={() => setCreating((v) => !v)}
            disabled={participationLocked}
            title={participationLocked ? "Únete al grupo para participar" : undefined}
          >
            <Plus className="w-3.5 h-3.5" /> Nueva propuesta
          </Button>
        </div>
      </div>

      {/* Selector de modo de gobernanza (democrático / jerárquico) */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Scale className="w-4 h-4 text-emerald-300" />
          <span className="text-xs font-semibold text-white">Modo de gobernanza</span>
          <GovernanceModeBadge scope="group" scopeRef={groupId} />
          {savingMode && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={savingMode || participationLocked}
            onClick={() => saveMode("democratic")}
            title={participationLocked ? "Únete al grupo para cambiar el modo" : undefined}
            className={cn(
              "text-[11px] rounded-full px-2.5 py-1 border transition flex items-center gap-1 disabled:opacity-50",
              govMode === "democratic"
                ? "border-emerald-400/50 text-emerald-200 bg-emerald-500/10"
                : "bg-white/5 border-white/10 text-white/60 hover:border-emerald-400/30",
            )}
          >
            <Scale className="w-3 h-3" /> Democrático
          </button>
          <button
            type="button"
            disabled={savingMode || participationLocked}
            onClick={() => saveMode("hierarchical")}
            title={participationLocked ? "Únete al grupo para cambiar el modo" : undefined}
            className={cn(
              "text-[11px] rounded-full px-2.5 py-1 border transition flex items-center gap-1 disabled:opacity-50",
              govMode === "hierarchical"
                ? "border-amber-400/50 text-amber-200 bg-amber-500/10"
                : "bg-white/5 border-white/10 text-white/60 hover:border-amber-400/30",
            )}
          >
            <Crown className="w-3 h-3" /> Jerárquico
          </button>
        </div>
        <p className="text-[10px] text-white/40 flex items-start gap-1.5">
          <Save className="w-3 h-3 mt-0.5 shrink-0 text-white/30" />
          {govMode === "hierarchical"
            ? "En modo jerárquico un admin/owner puede aplicar cambios directamente. La opción democrática siempre está disponible: cualquiera puede abrir una propuesta a votación."
            : "En modo democrático todo cambio de configuración, permisos o membresía se decide por votación. La opción democrática siempre está disponible."}
        </p>
      </div>

      {creating && !participationLocked && (
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
            const applied = p.status === "applied";
            const eligible = canAccept(p, t);
            const isAuthor = !!userId && p.author === userId;
            const myVote = t?.mine ?? null;
            const closed = accepted || applied;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-lg border bg-white/5 p-3",
                  applied
                    ? "border-cyan-500/40 bg-cyan-500/5"
                    : accepted
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-white/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white break-words">{p.title}</span>
                      <Badge variant="outline" className={cn("text-[9px] gap-1", meta.color)}>
                        <KindIcon className="w-2.5 h-2.5" /> {meta.label}
                      </Badge>
                      {applied ? (
                        <Badge variant="outline" className="text-[9px] gap-1 border-cyan-500/50 text-cyan-200 bg-cyan-500/10">
                          <PackageCheck className="w-2.5 h-2.5" /> Aplicada
                        </Badge>
                      ) : accepted ? (
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
                    disabled={busyVote === p.id || closed || participationLocked}
                    onClick={() => castVote(p.id, 1)}
                    title={participationLocked ? "Únete al grupo para participar" : undefined}
                    className={cn(
                      "gap-1.5 h-8 border-white/15 hover:bg-emerald-900/20 disabled:opacity-50",
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
                    disabled={busyVote === p.id || closed || participationLocked}
                    onClick={() => castVote(p.id, -1)}
                    title={participationLocked ? "Únete al grupo para participar" : undefined}
                    className={cn(
                      "gap-1.5 h-8 border-white/15 hover:bg-red-900/20 disabled:opacity-50",
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

                  {participationLocked && !closed && (
                    <span className="text-[10px] text-amber-300/70 ml-auto self-center flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Únete al grupo para participar
                    </span>
                  )}

                  {!closed && !participationLocked && eligible && isAuthor && (
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
                  {!closed && !participationLocked && eligible && !isAuthor && (
                    <span className="text-[10px] text-emerald-300/70 ml-auto self-center">
                      Mayoría alcanzada · pendiente de que el autor la confirme
                    </span>
                  )}
                  {!closed && !participationLocked && !eligible && (
                    <span className="text-[10px] text-white/35 ml-auto self-center">
                      Faltan {Math.max(0, MIN_VOTES - (t?.total ?? 0))} voto(s) para poder aceptar
                    </span>
                  )}

                  {/* Motor de aplicación: visible para el autor en propuestas aceptadas */}
                  {accepted && isAuthor && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 bg-cyan-600 hover:bg-cyan-500 ml-auto"
                      disabled={busyApply === p.id}
                      onClick={() => applyProposal(p)}
                    >
                      {busyApply === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Rocket className="w-3.5 h-3.5" />
                      )}
                      Aplicar al grupo
                    </Button>
                  )}
                  {accepted && !isAuthor && (
                    <span className="text-[10px] text-emerald-300/70 ml-auto self-center">
                      Aceptada · pendiente de que el autor la aplique
                    </span>
                  )}
                  {applied && (
                    <span className="text-[10px] text-cyan-300/70 ml-auto self-center flex items-center gap-1">
                      <PackageCheck className="w-3 h-3" /> Materializada como memoria del grupo
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
