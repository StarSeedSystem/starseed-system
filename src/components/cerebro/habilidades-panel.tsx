"use client";

/**
 * HabilidadesPanel (Cerebro) — pilar HABILIDADES: gestiona el programa de
 * soul.md del cerebro seleccionado. Superficie las skills/plugins/claves/
 * permisos/agentes ATADOS a ESTE cerebro (ability_links con target_scope=
 * "cerebro", target_ref=brainId) y permite atar nuevas desde el catálogo
 * unificado (src/lib/abilities/abilities.ts). Realtime sobre ability_links.
 *
 * No duplica el hub global de Habilidades: lo reutiliza y lo enfoca al cerebro.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  loadAbilities,
  attach,
  detach,
  abilitiesFor,
  ABILITY_KIND_LABELS,
  type Ability,
  type AbilityLink,
  type AbilityKind,
} from "@/lib/abilities/abilities";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import {
  Wand2,
  Plus,
  Loader2,
  Link2Off,
  Search,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

export default function HabilidadesPanel({
  brainId,
  brainName,
}: {
  brainId: string | null;
  brainName?: string;
}) {
  // Habilidades ya atadas a este cerebro (realtime).
  const filter = useMemo(
    () => (brainId ? `target_ref=eq.${brainId}` : undefined),
    [brainId],
  );
  const { rows: links, reload } = useRealtimeRows<AbilityLink>(
    "ability_links",
    async () => (brainId ? abilitiesFor("cerebro", brainId) : []),
    { filter, idKey: "id" },
  );

  // Catálogo de habilidades disponibles.
  const [catalog, setCatalog] = useState<Ability[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AbilityKind | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await loadAbilities();
      if (!alive) return;
      setCatalog(all);
      setLoadingCat(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const attachedRefs = useMemo(
    () => new Set(links.map((l) => `${l.kind}:${l.ref}`)),
    [links],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.ref.toLowerCase().includes(q) ||
        (a.blurb || "").toLowerCase().includes(q)
      );
    });
  }, [catalog, query, kindFilter]);

  const kinds = useMemo(() => {
    const present = new Set(catalog.map((a) => a.kind));
    return (Object.keys(ABILITY_KIND_LABELS) as AbilityKind[]).filter((k) => present.has(k));
  }, [catalog]);

  const onAttach = async (a: Ability) => {
    if (!brainId) {
      toast.error("Selecciona un cerebro primero.");
      return;
    }
    setBusy(`${a.kind}:${a.ref}`);
    const res = await attach(a, { scope: "cerebro", ref: brainId, name: brainName || "Cerebro" });
    setBusy(null);
    if (res) {
      await reload();
      toast.success(`«${a.name}» atado a ${brainName || "el cerebro"}.`);
    } else {
      toast.error("No se pudo atar la habilidad.");
    }
  };

  const onDetach = async (l: AbilityLink) => {
    setBusy(l.id);
    const ok = await detach(l.id);
    setBusy(null);
    if (ok) {
      await reload();
      toast.success(`«${l.name}» desatado.`);
    } else {
      toast.error("No se pudo desatar.");
    }
  };

  if (!brainId) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center">
        <Wand2 className="w-8 h-8 text-white/25 mx-auto mb-2" />
        <p className="text-sm text-white/50">
          Selecciona o crea un cerebro para gestionar sus habilidades.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Atadas */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldCheck className="w-5 h-5 text-violet-300" />
          <h3 className="text-base font-semibold text-violet-50">
            Habilidades del cerebro
          </h3>
          <Badge variant="outline" className="ml-auto border-violet-500/40 text-violet-300">
            {links.length} atadas
          </Badge>
        </div>
        <p className="mt-2 text-sm text-white/60">
          Skills, plugins, claves, permisos y agentes atados a <span className="text-white/80">{brainName || "este cerebro"}</span>.
          Configuran el programa de <code className="text-cyan-300/90">soul.md</code> y <code className="text-cyan-300/90">dream.md</code>.
        </p>
        <a
          href="/habilidades"
          className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 hover:underline"
        >
          <ExternalLink className="w-3 h-3" /> Abrir el hub completo de Habilidades
        </a>

        {links.length === 0 ? (
          <p className="mt-3 text-xs text-white/45">
            Aún no hay habilidades atadas. Ata la primera desde el catálogo de abajo.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs text-white/85"
              >
                <Badge variant="outline" className="border-white/15 text-white/50 text-[9px] py-0">
                  {ABILITY_KIND_LABELS[l.kind as AbilityKind] ?? l.kind}
                </Badge>
                {l.name}
                <button
                  onClick={() => onDetach(l)}
                  disabled={busy === l.id}
                  className="ml-0.5 text-white/40 hover:text-red-300"
                  title="Desatar"
                >
                  {busy === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Catálogo */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar skills, tools, MCP, conexiones, APIs…"
            className="h-8 text-sm bg-black/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            Todo
          </FilterChip>
          {kinds.map((k) => (
            <FilterChip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
              {ABILITY_KIND_LABELS[k]}
            </FilterChip>
          ))}
        </div>

        {loadingCat ? (
          <div className="flex items-center gap-2 text-xs text-white/50 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogo…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-white/45 py-3">No hay habilidades que coincidan.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.slice(0, 60).map((a) => {
              const key = `${a.kind}:${a.ref}`;
              const isAttached = attachedRefs.has(key);
              return (
                <div
                  key={key}
                  className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm text-white/85 truncate">{a.name}</span>
                      <Badge variant="outline" className="border-white/15 text-white/50 text-[9px] py-0">
                        {ABILITY_KIND_LABELS[a.kind as AbilityKind] ?? a.kind}
                      </Badge>
                      {(a.meta as { oss?: boolean })?.oss && (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-300/80 text-[9px] py-0">
                          oss
                        </Badge>
                      )}
                    </div>
                    {a.blurb && <p className="text-[11px] text-white/45 mt-0.5 line-clamp-2">{a.blurb}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn("h-7 gap-1 text-xs shrink-0", isAttached && "opacity-50")}
                    disabled={isAttached || busy === key}
                    onClick={() => onAttach(a)}
                  >
                    {busy === key ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {isAttached ? "Atada" : "Atar"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] border transition-colors",
        active
          ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
          : "border-white/10 text-white/50 hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}
