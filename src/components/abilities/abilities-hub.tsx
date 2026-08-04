"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Sparkles,
  Wand2,
  RefreshCw,
  Search,
  Link2,
  Unlink,
  BookOpen,
  Wrench,
  Server,
  Cloud,
  Plug,
  Boxes,
  Brain,
  LayoutDashboard,
  Code,
  Globe,
  CheckCircle2,
} from "lucide-react";
import {
  loadAbilities,
  listTargets,
  attach,
  detach,
  listLinks,
  ATTACH_TARGETS,
  ABILITY_KIND_LABELS,
  type Ability,
  type AbilityKind,
  type AbilityLink,
  type AttachTarget,
  type TargetScope,
} from "@/lib/abilities/abilities";
import IntegrationsSkills from "@/components/abilities/integrations-skills";

const KIND_ORDER: AbilityKind[] = ["skill", "tool", "mcp", "connection", "server", "api", "plugin"];

const KIND_ICON: Record<AbilityKind, React.ReactNode> = {
  skill: <BookOpen className="h-4 w-4" />,
  tool: <Wrench className="h-4 w-4" />,
  mcp: <Server className="h-4 w-4" />,
  connection: <Cloud className="h-4 w-4" />,
  server: <Boxes className="h-4 w-4" />,
  api: <Globe className="h-4 w-4" />,
  plugin: <Plug className="h-4 w-4" />,
};

const KIND_GRAD: Record<AbilityKind, string> = {
  skill: "from-violet-500 to-fuchsia-600",
  tool: "from-amber-500 to-orange-600",
  mcp: "from-indigo-500 to-violet-600",
  connection: "from-cyan-500 to-sky-600",
  server: "from-rose-500 to-orange-600",
  api: "from-emerald-500 to-green-600",
  plugin: "from-fuchsia-500 to-pink-600",
};

const SCOPE_ICON: Record<TargetScope, React.ReactNode> = {
  cerebro: <Brain className="h-3.5 w-3.5" />,
  pizarra: <LayoutDashboard className="h-3.5 w-3.5" />,
  app: <Code className="h-3.5 w-3.5" />,
  cuenta: <Globe className="h-3.5 w-3.5" />,
};

export default function AbilitiesHub() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [links, setLinks] = useState<AbilityLink[]>([]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AbilityKind | "all">("all");

  // Attach dialog state
  const [attachFor, setAttachFor] = useState<Ability | null>(null);
  const [scope, setScope] = useState<TargetScope>("cerebro");
  const [targets, setTargets] = useState<AttachTarget[]>([]);
  const [targetRef, setTargetRef] = useState<string>("");
  const [attaching, setAttaching] = useState(false);
  const attachDialogRef = useRef<HTMLDivElement>(null);

  // Astraura suggest
  const [suggestScope, setSuggestScope] = useState<TargetScope>("cerebro");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const hasProvider = useMemo(() => {
    try {
      return loadConfigs().some((c) => c.enabled);
    } catch {
      return false;
    }
  }, [mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [abs, lks] = await Promise.all([loadAbilities(), listLinks()]);
      setAbilities(abs);
      setLinks(lks);
    } catch {
      toast.error("No se pudieron cargar las habilidades.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mounted) refresh();
  }, [mounted, refresh]);

  // Load target options whenever the chosen scope changes (inside attach dialog).
  useEffect(() => {
    if (!attachFor) return;
    let alive = true;
    (async () => {
      const list = await listTargets(scope);
      if (!alive) return;
      setTargets(list);
      setTargetRef(list[0]?.ref ?? "");
    })();
    return () => {
      alive = false;
    };
  }, [attachFor, scope]);

  // Accesibilidad del diálogo de "Atar": foco inicial, trampa de Tab, cierre
  // con Escape (no gestionado antes) y devolución de foco al cerrar.
  useModalA11y({ open: !!attachFor, onClose: () => setAttachFor(null), containerRef: attachDialogRef });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return abilities.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.ref.toLowerCase().includes(q) ||
        (a.blurb || "").toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q)
      );
    });
  }, [abilities, query, kindFilter]);

  const grouped = useMemo(() => {
    const map = new Map<AbilityKind, Ability[]>();
    for (const k of KIND_ORDER) map.set(k, []);
    for (const a of filtered) {
      if (!map.has(a.kind)) map.set(a.kind, []);
      map.get(a.kind)!.push(a);
    }
    return KIND_ORDER.map((k) => ({ kind: k, items: map.get(k) || [] })).filter((g) => g.items.length > 0);
  }, [filtered]);

  function openAttach(a: Ability) {
    setAttachFor(a);
    setScope("cerebro");
    setTargets([]);
    setTargetRef("");
  }

  async function doAttach() {
    if (!attachFor) return;
    const chosen =
      scope === "cuenta"
        ? { scope: "cuenta" as const, ref: "global", name: "Cuenta (global)" }
        : targets.find((t) => t.ref === targetRef);
    if (!chosen) {
      toast.error("Selecciona un objetivo.");
      return;
    }
    setAttaching(true);
    const res = await attach(attachFor, chosen);
    setAttaching(false);
    if (!res) {
      toast.error("No se pudo atar la habilidad (¿sesión iniciada?).");
      return;
    }
    toast.success(`«${attachFor.name}» atada a ${chosen.name}.`);
    setAttachFor(null);
    setLinks((prev) => [res, ...prev]);
  }

  async function doDetach(id: string) {
    const ok = await detach(id);
    if (!ok) {
      toast.error("No se pudo desatar.");
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success("Habilidad desatada.");
  }

  async function suggest() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para que Astraura sugiera.");
      return;
    }
    setSuggesting(true);
    setSuggestion("");
    try {
      const scopeLabel = ATTACH_TARGETS.find((t) => t.scope === suggestScope)?.label ?? suggestScope;
      const catalog = abilities
        .map((a) => `${ABILITY_KIND_LABELS[a.kind as AbilityKind] || a.kind}: ${a.name}`)
        .slice(0, 80)
        .join("; ");
      const content = `Eres Astraura, asistente de habilidades de StarSeed OS. El usuario quiere equipar un objetivo de tipo «${scopeLabel}». Dado este catálogo de capacidades disponibles (skills, tools, MCP, conexiones, servidores, APIs, plugins): ${catalog}. Recomienda en español, en máximo 6 líneas, qué habilidades atar primero a ese objetivo y por qué, agrupando por tipo. Sé concreto y prioriza lo open-source y lo ya disponible.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      setSuggestion(r.text);
    } catch {
      toast.error("Astraura no pudo responder. Revisa tu proveedor de IA.");
    }
    setSuggesting(false);
  }

  function linkLabel(l: AbilityLink): string {
    const t = ATTACH_TARGETS.find((x) => x.scope === l.target_scope)?.label ?? l.target_scope;
    return l.target_scope === "cuenta" ? `${t}` : `${t} · ${String(l.target_ref || "").slice(0, 8)}`;
  }

  if (!mounted) {
    return <div className="p-4 text-sm text-white/40">Cargando habilidades…</div>;
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-violet-50">Habilidades · hub unificado</span>
            <span className="text-[11px] text-violet-300/70">
              Skills, tools, MCP, conexiones, servidores, APIs y plugins — atables a cerebros, lienzos, apps o tu cuenta.
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-violet-500/30 text-[9px] text-violet-200/80">
              {abilities.length} capacidades
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-200/80">
              {links.length} atadas
            </Badge>
            <Button size="sm" variant="outline" className="gap-2 border-violet-500/30 text-violet-100" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Astraura suggester */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Sugerir habilidades para…</span>
          <div className="flex flex-wrap gap-1.5">
            {ATTACH_TARGETS.map((t) => (
              <button
                key={t.scope}
                onClick={() => setSuggestScope(t.scope)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
                  suggestScope === t.scope
                    ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100"
                    : "border-white/10 text-white/50 hover:text-white/80",
                )}
              >
                {SCOPE_ICON[t.scope]} {t.label}
              </button>
            ))}
          </div>
          <Button size="sm" className="ml-auto gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-500" onClick={suggest} disabled={suggesting}>
            <Wand2 className={cn("h-4 w-4", suggesting && "animate-pulse")} /> Sugerir
          </Button>
        </div>
        {!hasProvider && (
          <p className="mt-2 text-[11px] text-fuchsia-200/60">Activa un proveedor de IA en Ajustes → IA & Modelos para el asistente.</p>
        )}
        {suggestion && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-black/30 p-3 text-[12px] leading-relaxed text-fuchsia-100">
            {suggestion}
          </pre>
        )}
      </div>

      {/* Integraciones OSS como skills instalables (tools de Aurora) */}
      <IntegrationsSkills />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar habilidades, tools, conexiones…"
            className="h-9 border-white/15 bg-black/30 pl-8 text-white placeholder:text-white/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setKindFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              kindFilter === "all" ? "border-violet-400/50 bg-violet-500/15 text-violet-100" : "border-white/10 text-white/50 hover:text-white/80",
            )}
          >
            Todas
          </button>
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
                kindFilter === k ? "border-violet-400/50 bg-violet-500/15 text-violet-100" : "border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              {KIND_ICON[k]} {ABILITY_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {/* Current links */}
      {links.length > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-emerald-300/60">
            <Link2 className="h-3.5 w-3.5" /> Habilidades atadas
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
                <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
                  {ABILITY_KIND_LABELS[(l.kind as AbilityKind)] || l.kind}
                </Badge>
                <span className="text-[12px] text-white/85">{l.name}</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
                  {SCOPE_ICON[(l.target_scope as TargetScope)] ?? null} {linkLabel(l)}
                </span>
                <button
                  onClick={() => doDetach(l.id)}
                  title="Desatar"
                  className="ml-1 text-white/40 transition hover:text-rose-300"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped abilities */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/40">
          {loading ? "Cargando capacidades…" : "No hay capacidades que coincidan con el filtro."}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.kind}>
              <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/45">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded bg-gradient-to-tr text-white", KIND_GRAD[g.kind])}>
                  {KIND_ICON[g.kind]}
                </span>
                {ABILITY_KIND_LABELS[g.kind]}
                <span className="text-white/25">({g.items.length})</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((a) => (
                  <div key={`${a.kind}:${a.ref}`} className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-3.5">
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr text-white", KIND_GRAD[a.kind])}>
                        {KIND_ICON[a.kind]}
                      </div>
                      <span className="flex-1 text-sm font-semibold text-white">{a.name}</span>
                      {a.meta?.oss ? (
                        <Badge variant="outline" className="border-emerald-400/40 text-[8px] text-emerald-300">OSS</Badge>
                      ) : null}
                    </div>
                    {a.blurb && <p className="mt-2 flex-1 text-[11px] text-white/50">{a.blurb}</p>}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-white/30">{a.source}</span>
                      <Button size="sm" className="gap-1.5 bg-violet-600 text-white hover:bg-violet-500" onClick={() => openAttach(a)}>
                        <Link2 className="h-3.5 w-3.5" /> Atar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attach dialog (lightweight modal) */}
      {attachFor && (
        <div
          ref={attachDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAttachFor(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Atar «${attachFor.name}» a un objetivo`}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-violet-500/30 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr text-white", KIND_GRAD[attachFor.kind])}>
                {KIND_ICON[attachFor.kind]}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">Atar «{attachFor.name}»</span>
                <span className="text-[11px] text-white/45">{ABILITY_KIND_LABELS[attachFor.kind]} · {attachFor.source}</span>
              </div>
            </div>

            <div className="mt-4">
              <span className="text-[11px] uppercase tracking-widest text-white/45">Objetivo</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ATTACH_TARGETS.map((t) => (
                  <button
                    key={t.scope}
                    onClick={() => setScope(t.scope)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
                      scope === t.scope ? "border-violet-400/50 bg-violet-500/15 text-violet-100" : "border-white/10 text-white/50 hover:text-white/80",
                    )}
                  >
                    {SCOPE_ICON[t.scope]} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {scope !== "cuenta" && (
              <div className="mt-3">
                <span className="text-[11px] uppercase tracking-widest text-white/45">
                  {scope === "cerebro" ? "Cerebro" : scope === "pizarra" ? "Pizarra / Lienzo" : "App generada"}
                </span>
                {targets.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-white/40">
                    No hay {scope === "cerebro" ? "cerebros" : scope === "pizarra" ? "pizarras" : "apps"} disponibles (¿sesión iniciada?).
                  </p>
                ) : (
                  <select
                    value={targetRef}
                    onChange={(e) => setTargetRef(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
                  >
                    {targets.map((t) => (
                      <option key={t.ref} value={t.ref} className="bg-zinc-900">
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {scope === "cuenta" && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-emerald-300/80">
                <CheckCircle2 className="h-4 w-4" /> Se atará globalmente a tu cuenta.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="outline" className="border-white/15 text-white/70" onClick={() => setAttachFor(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
                onClick={doAttach}
                disabled={attaching || (scope !== "cuenta" && !targetRef)}
              >
                <Link2 className={cn("h-3.5 w-3.5", attaching && "animate-pulse")} /> Atar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
