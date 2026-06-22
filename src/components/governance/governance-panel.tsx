"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Landmark,
  RefreshCw,
  Loader2,
  Scale,
  Network,
  Clock,
  Users,
  Percent,
  Gavel,
  Save,
  Sparkles,
  Wand2,
  Vote,
  Info,
} from "lucide-react";
import ProposalComposer from "@/components/governance/proposal-composer";
import ProposalCard from "@/components/governance/proposal-card";
import { resolveOpenProposals } from "@/lib/governance/engine";
import { getConfig, saveConfig } from "@/lib/governance/config";
import {
  SCOPES,
  URGENCY,
  DEFAULT_GOV_PARAMS,
  type GovernanceMode,
  type Proposal,
  type Urgency,
} from "@/lib/governance/types";

type Filter = "open" | "passed" | "executed" | "all";

export default function GovernancePanel({
  scope: initialScope,
  scopeRef: initialRef,
}: {
  scope?: string;
  scopeRef?: string;
} = {}) {
  const [scope, setScope] = useState<string>(initialScope ?? "global");
  const [scopeRef, setScopeRef] = useState<string>(initialRef ?? "");

  const [mode, setMode] = useState<GovernanceMode>("democratic");
  const [govVotingMinutes, setGovVotingMinutes] = useState<number>(
    Number(DEFAULT_GOV_PARAMS.votingMinutes) || 2880,
  );
  const [govMinParticipants, setGovMinParticipants] = useState<number>(
    Number(DEFAULT_GOV_PARAMS.minParticipants) || 1,
  );
  const [govMinPercent, setGovMinPercent] = useState<number>(Number(DEFAULT_GOV_PARAMS.minPercent) || 0);
  const [govThreshold, setGovThreshold] = useState<number>(Number(DEFAULT_GOV_PARAMS.threshold) || 50);
  const [govUrgency, setGovUrgency] = useState<Urgency>((DEFAULT_GOV_PARAMS.urgency as Urgency) || "normal");
  const [savingCfg, setSavingCfg] = useState(false);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [loading, setLoading] = useState(false);

  const [aiNote, setAiNote] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const hasProvider = useMemo(() => {
    try {
      return loadConfigs().some((c) => c.enabled);
    } catch {
      return false;
    }
  }, []);

  const loadConfig = useCallback(async () => {
    const cfg = await getConfig(scope, scopeRef || null);
    setMode(cfg.mode);
    const p = cfg.params || {};
    setGovVotingMinutes(Number(p.votingMinutes) || 2880);
    setGovMinParticipants(Number(p.minParticipants) || 1);
    setGovMinPercent(Number(p.minPercent) || 0);
    setGovThreshold(Number(p.threshold) || 50);
    setGovUrgency((p.urgency as Urgency) || "normal");
  }, [scope, scopeRef]);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    try {
      // Resuelve vencidas antes de listar.
      await resolveOpenProposals(scope, scopeRef || null);
      const supabase = createClient();
      let q = supabase.from("proposals").select("*").eq("scope", scope).order("created_at", { ascending: false });
      if (scopeRef) q = q.eq("scope_ref", scopeRef);
      else q = q.is("scope_ref", null);
      const { data } = await q.limit(100);
      setProposals((data as Proposal[]) ?? []);
    } catch {
      /* */
    }
    setLoading(false);
  }, [scope, scopeRef]);

  useEffect(() => {
    loadConfig();
    loadProposals();
  }, [loadConfig, loadProposals]);

  // Recargar cuando el compositor crea una propuesta.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => loadProposals();
    window.addEventListener("gov:proposal-created", h);
    return () => window.removeEventListener("gov:proposal-created", h);
  }, [loadProposals]);

  async function persistConfig() {
    setSavingCfg(true);
    try {
      const res = await saveConfig(scope, scopeRef || null, mode, {
        votingMinutes: govVotingMinutes,
        minParticipants: govMinParticipants,
        minPercent: govMinPercent,
        threshold: govThreshold,
        urgency: govUrgency,
      });
      if (res.ok) toast.success("Configuración de gobernanza guardada");
      else toast.error(res.error ?? "No se pudo guardar la configuración.");
    } catch {
      toast.error("No se pudo guardar la configuración.");
    }
    setSavingCfg(false);
  }

  async function explainAstraura() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para usar a Astraura.");
      return;
    }
    setAiBusy(true);
    setAiNote("");
    try {
      const content = `Eres Astraura, guía de StarSeed OS. Explica de forma breve (máx. 6 líneas, en español) cómo funciona la ONTOCRACIA y los Comandos Democráticos en este contexto:
- Ámbito actual: ${scope}${scopeRef ? ` (ref ${scopeRef})` : ""}, modo ${mode}.
- Una decisión sólo se EJECUTA cuando se cumple el formato democrático (tiempo, participación mínima, umbral).
- Relaciona ontocracia, soberanía y democracia; recuerda que la opción democrática SIEMPRE existe, incluso en contextos jerárquicos.
Sé concreto y motivador.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      setAiNote(r.text);
    } catch {
      toast.error("Astraura no pudo responder.");
    }
    setAiBusy(false);
  }

  const filtered = useMemo(() => {
    if (filter === "all") return proposals;
    if (filter === "open") return proposals.filter((p) => p.status === "open");
    if (filter === "passed")
      return proposals.filter((p) => ["passed", "executed", "failed", "rejected", "expired"].includes(p.status));
    if (filter === "executed") return proposals.filter((p) => p.status === "executed");
    return proposals;
  }, [proposals, filter]);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-600">
            <Landmark className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-emerald-50">Ontocracia · Comandos Democráticos</span>
            <span className="text-[11px] text-emerald-300/70">
              Una decisión sólo se ejecuta cuando se cumple el formato democrático configurado. Votos siempre públicos.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-2 border-emerald-500/30 text-emerald-100"
            onClick={() => {
              loadConfig();
              loadProposals();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
      </div>

      {/* Selector de contexto */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-emerald-300/60">Contexto</span>
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                scope === s.id
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope !== "global" && (
          <Input
            value={scopeRef}
            onChange={(e) => setScopeRef(e.target.value)}
            placeholder="ID del mensaje/grupo/página/comunidad"
            className="h-8 w-64 border-white/15 bg-black/30 text-white placeholder:text-white/30"
          />
        )}
      </div>

      {/* Modo de gobernanza + parámetros */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-emerald-300/60">
          <Scale className="h-3.5 w-3.5" /> Modo de gobernanza
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode("democratic")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              mode === "democratic"
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-50"
                : "border-white/10 text-white/60 hover:text-white/90",
            )}
          >
            <Vote className="h-4 w-4" /> Democrático
          </button>
          <button
            onClick={() => setMode("hierarchical")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              mode === "hierarchical"
                ? "border-amber-400/60 bg-amber-500/15 text-amber-50"
                : "border-white/10 text-white/60 hover:text-white/90",
            )}
          >
            <Network className="h-4 w-4" /> Jerárquico
          </button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-emerald-500/15 bg-emerald-950/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-200/80">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Siempre existe la opción democrática: incluso en contextos jerárquicos cualquier participante puede abrir una
          propuesta, y el modo puede cambiarse por decisión.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Clock className="h-3 w-3" /> Tiempo (min)
            </span>
            <Input
              type="number"
              value={govVotingMinutes}
              onChange={(e) => setGovVotingMinutes(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Users className="h-3 w-3" /> Mín. particip.
            </span>
            <Input
              type="number"
              value={govMinParticipants}
              onChange={(e) => setGovMinParticipants(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Percent className="h-3 w-3" /> % mínimo
            </span>
            <Input
              type="number"
              value={govMinPercent}
              onChange={(e) => setGovMinPercent(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] text-white/40">
              <Gavel className="h-3 w-3" /> Umbral %
            </span>
            <Input
              type="number"
              value={govThreshold}
              onChange={(e) => setGovThreshold(Number(e.target.value))}
              className="h-8 bg-white/5 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-white/40">Urgencia base</span>
            <select
              value={govUrgency}
              onChange={(e) => setGovUrgency(e.target.value as Urgency)}
              className="h-8 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
            >
              {(Object.keys(URGENCY) as Urgency[]).map((u) => (
                <option key={u} value={u}>
                  {URGENCY[u].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={persistConfig}
            disabled={savingCfg}
          >
            {savingCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar configuración
          </Button>
        </div>
      </div>

      {/* Astraura */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Astraura</span>
          <span className="text-[11px] text-fuchsia-300/70">Explica la ontocracia, la soberanía y la democracia de este contexto.</span>
          <Button
            size="sm"
            className="ml-auto gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
            onClick={explainAstraura}
            disabled={aiBusy}
          >
            <Wand2 className={cn("h-4 w-4", aiBusy && "animate-pulse")} /> Explicar
          </Button>
        </div>
        {!hasProvider && (
          <p className="mt-2 text-[11px] text-fuchsia-200/60">
            Activa un proveedor de IA en Ajustes → IA & Modelos para usar a Astraura.
          </p>
        )}
        {aiNote && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-black/30 p-3 text-[12px] leading-relaxed text-fuchsia-100">
            {aiNote}
          </pre>
        )}
      </div>

      {/* Compositor */}
      <ProposalComposer scope={scope} scopeRef={scopeRef || undefined} />

      {/* Listado de propuestas */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-emerald-300/60">Propuestas ({filtered.length})</span>
          <div className="ml-auto flex gap-1.5">
            {([
              { id: "open", label: "Abiertas" },
              { id: "passed", label: "Resueltas" },
              { id: "executed", label: "Ejecutadas" },
              { id: "all", label: "Todas" },
            ] as { id: Filter; label: string }[]).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  filter === f.id
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 text-white/50 hover:text-white/80",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-1 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando propuestas…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
            <Vote className="mx-auto mb-2 h-6 w-6 text-emerald-300/50" />
            <div className="text-sm text-white/50">
              No hay propuestas en este contexto todavía. Crea la primera arriba.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <ProposalCard key={p.id} proposal={p} onChange={loadProposals} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
