"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Navegador VIVO de THE HUGGING BAY
// ----------------------------------------------------------------------------
// Sección "Hugging Bay" de la Biblioteca (portada → Destacado): explora en
// tiempo real el registro verificado de modelos open-source, todo GET a través
// del proxy propio (src/app/api/huggingbay/[...path]/route.ts →
// src/ai/astraura/huggingbay.ts). Cuatro pestañas:
//   · Recomendados por tarea → selector de useCase + rankHuggingBayFor().
//   · Trending                → últimos 7 días.
//   · Top open models         → aproximación agent-friendly de los rankings.
//   · Búsqueda semántica      → consulta en lenguaje natural.
//
// Cada ficha muestra nombre, licencia, señales de confianza/fit reasons y
// cuatro acciones: Copiar comando (Ollama/LM Studio…), Abrir en huggingbay.xyz,
// "Usar en Astraura" (registra el modelo como candidato del router vía
// installed-models.ts) y Guardar en biblioteca (SaveToLibrary existente).
//
// SSR-safe: todo el fetch ocurre en useEffect tras montar. Nunca lanza: los
// fallos de red se muestran como estado vacío/():="Sin resultados", jamás
// rompen la Biblioteca (mismo principio defensivo que el resto de Astraura).
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Compass, TrendingUp, SearchCode, Sparkles, Copy, ExternalLink, Check,
  ShieldCheck, Download, Loader2, Search, Star, Server,
} from "lucide-react";
import {
  recommend, trending, topOpenModels, semanticSearch, rankHuggingBayFor,
  localKit, useCaseFor, isPermissiveLicense,
  type HuggingBayArtifact, type RankedModel,
} from "@/ai/astraura/huggingbay";
import { TASK_LABELS, type TaskKind } from "@/ai/astraura/free-catalog";
import { getIntelligenceSettings, saveIntelligenceSettings } from "@/ai/astraura/router";
import { registerHuggingBayCandidate, isHuggingBayCandidate } from "@/ai/astraura/installed-models";
import { SaveToLibrary } from "@/components/library/save-to-library";

/* ───────────────────────── Utilidades ───────────────────────── */

type Tab = "recomendados" | "trending" | "top" | "busqueda";

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: "recomendados", label: "Recomendados por tarea", icon: Sparkles },
  { id: "trending", label: "Trending", icon: TrendingUp },
  { id: "top", label: "Top open models", icon: Star },
  { id: "busqueda", label: "Búsqueda semántica", icon: SearchCode },
];

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/** Copia texto al portapapeles con fallback silencioso. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ───────────────────────── Ficha de artefacto ───────────────────────── */

function ArtifactCard({ artifact, reasons }: { artifact: HuggingBayArtifact; reasons?: string[] }) {
  const [copied, setCopied] = useState(false);
  const [loadingKit, setLoadingKit] = useState(false);
  const [usedInAstraura, setUsedInAstraura] = useState(false);

  useEffect(() => {
    setUsedInAstraura(isHuggingBayCandidate(artifact.id));
  }, [artifact.id]);

  const permissive = isPermissiveLicense(artifact.license);

  const handleCopyCommand = useCallback(async () => {
    setLoadingKit(true);
    try {
      const prefs = getIntelligenceSettings();
      const tool = prefs.huggingBay?.preferredTool ?? "ollama";
      const kit = await localKit(artifact.id, tool);
      const cmd = kit?.commands?.[0]?.command;
      if (!cmd) {
        toast.error(artifact.name, { description: "Hugging Bay aún no da un comando local listo para esta ficha. Abre el artefacto para más detalle." });
        setLoadingKit(false);
        return;
      }
      const ok = await copyText(cmd);
      setLoadingKit(false);
      if (ok) {
        setCopied(true);
        toast.success(`Comando de ${tool} copiado`, { description: cmd.slice(0, 120) });
        setTimeout(() => setCopied(false), 2500);
      } else {
        toast.error("No pude copiar al portapapeles", { description: cmd.slice(0, 120) });
      }
    } catch {
      setLoadingKit(false);
      toast.error(artifact.name, { description: "No se pudo obtener el kit local ahora mismo." });
    }
  }, [artifact.id, artifact.name]);

  const handleUseInAstraura = useCallback(() => {
    const prefs = getIntelligenceSettings();
    const tool = prefs.huggingBay?.preferredTool ?? "ollama";
    registerHuggingBayCandidate({
      id: artifact.id,
      name: artifact.name,
      repo: artifact.repo,
      tool,
      command: "",
    });
    setUsedInAstraura(true);
    toast.success(`«${artifact.name}» registrado para Aurora`, {
      description: `Aurora lo tendrá en cuenta como candidato local (${tool}) en cuanto lo instales con el comando de arriba.`,
    });
  }, [artifact]);

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white" title={artifact.name}>{artifact.name}</p>
          <p className="truncate text-[11px] text-muted-foreground" title={artifact.repo}>{artifact.repo || artifact.owner}</p>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 text-[9px] ${permissive ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300" : "border-amber-400/30 bg-amber-500/15 text-amber-300"}`}
        >
          {artifact.license}
        </Badge>
      </div>

      {artifact.summary && (
        <p className="line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">{artifact.summary}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {artifact.trustScore > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            <ShieldCheck className="h-3 w-3 text-cyan-300" /> Confianza {artifact.trustScore}/100
          </span>
        )}
        {artifact.downloadCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            <Download className="h-3 w-3" /> {formatDownloads(artifact.downloadCount)}
          </span>
        )}
        {artifact.hostingStatus === "hosted" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            Alojado
          </span>
        )}
      </div>

      {(reasons?.length || artifact.fitReasons.length) ? (
        <ul className="space-y-0.5 text-[10px] text-muted-foreground/90">
          {(reasons ?? artifact.fitReasons).slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className="mt-0.5 text-cyan-400">›</span> {r}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 cursor-pointer gap-1.5 border-white/10 text-[11px]"
          onClick={() => void handleCopyCommand()}
          disabled={loadingKit}
        >
          {loadingKit ? <Loader2 className="h-3 w-3 animate-spin" /> : copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar comando"}
        </Button>
        <a
          href={artifact.webUrl || `https://huggingbay.xyz/artifact/${artifact.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-background/60 px-2.5 text-[11px] font-medium hover:bg-white/5 transition cursor-pointer"
        >
          <ExternalLink className="h-3 w-3" /> Abrir
        </a>
        <Button
          size="sm"
          variant={usedInAstraura ? "secondary" : "outline"}
          className={`h-7 cursor-pointer gap-1.5 text-[11px] ${usedInAstraura ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-300" : "border-white/10"}`}
          onClick={handleUseInAstraura}
          disabled={usedInAstraura}
        >
          <Server className="h-3 w-3" /> {usedInAstraura ? "En Astraura" : "Usar en Astraura"}
        </Button>
        <SaveToLibrary
          variant="icon"
          item={{
            type: "external",
            title: artifact.name,
            url: artifact.webUrl || `https://huggingbay.xyz/artifact/${artifact.id}`,
            note: artifact.summary,
            tags: ["hugging-bay", "modelo", artifact.type].filter(Boolean),
          }}
          className="h-7 w-7 border-white/10"
        />
      </div>
    </GlassCard>
  );
}

/* ───────────────────────── Grid con estado vacío/carga ───────────────────────── */

function ResultsGrid({
  loading,
  items,
  reasonsById,
  emptyText,
}: {
  loading: boolean;
  items: HuggingBayArtifact[];
  reasonsById?: Record<string, string[]>;
  emptyText: string;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl border border-white/5 bg-white/[0.04]" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-black/20 p-8 text-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <ArtifactCard key={a.id} artifact={a} reasons={reasonsById?.[a.id]} />
      ))}
    </div>
  );
}

/* ───────────────────────── Componente principal ───────────────────────── */

export function HuggingBayBrowser() {
  const [tab, setTab] = useState<Tab>("recomendados");
  const [useCase, setUseCase] = useState<TaskKind>("chat");
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HuggingBayArtifact[]>([]);
  const [reasonsById, setReasonsById] = useState<Record<string, string[]>>({});
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try { setEnabled(getIntelligenceSettings().huggingBay?.enabled !== false); } catch { setEnabled(true); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "recomendados") {
        const ranked: RankedModel[] = await rankHuggingBayFor(useCase, { limit: 12 });
        setItems(ranked);
        const map: Record<string, string[]> = {};
        for (const r of ranked) map[r.id] = r.reasons;
        setReasonsById(map);
      } else if (tab === "trending") {
        setItems(await trending("7d", 18));
        setReasonsById({});
      } else if (tab === "top") {
        setItems(await topOpenModels(18));
        setReasonsById({});
      } else if (tab === "busqueda") {
        if (query.trim()) setItems(await semanticSearch(query, 18));
        else setItems([]);
        setReasonsById({});
      }
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [tab, useCase, query]);

  useEffect(() => { void load(); }, [load]);

  const handleSearchSubmit = useCallback(() => {
    setQuery(searchInput.trim());
  }, [searchInput]);

  const emptyText = useMemo(() => {
    if (tab === "busqueda") return query ? "Sin resultados para esa búsqueda. Prueba con otras palabras." : "Escribe qué necesitas (p. ej. «modelo pequeño para español») y pulsa buscar.";
    return "Sin resultados de Hugging Bay ahora mismo. Puede que el servicio esté ocupado — inténtalo de nuevo en unos segundos.";
  }, [tab, query]);

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-white/5 bg-black/20 p-8 text-center">
        <Compass className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-white">Descubrimiento Hugging Bay desactivado</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-muted-foreground">
          Actívalo en Ajustes → Inteligencia → Herramientas &amp; servicios para explorar el catálogo en vivo.
        </p>
        <Button
          size="sm"
          className="mt-4 cursor-pointer"
          onClick={() => {
            saveIntelligenceSettings({ huggingBay: { ...getIntelligenceSettings().huggingBay, enabled: true } });
            setEnabled(true);
            toast.success("Descubrimiento Hugging Bay activado");
          }}
        >
          Activar ahora
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-transparent p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Compass className="h-5 w-5 text-cyan-300" />
          <h2 className="text-lg font-bold text-white">Hugging Bay</h2>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
            registro verificado · open source
          </span>
        </div>
        <p className="mb-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Descubrimiento inteligente de modelos reales para Aurora: licencia, señales de confianza y comando de
          instalación local listo para copiar. Los datos vienen en vivo de{" "}
          <a href="https://huggingbay.xyz" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline cursor-pointer">
            huggingbay.xyz
          </a>{" "}
          — nunca se descarga nada automáticamente.
        </p>

        {/* Pestañas */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                  active
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/5"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Controles por pestaña */}
        {tab === "recomendados" && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Tarea:</span>
            <Select value={useCase} onValueChange={(v) => setUseCase(v as TaskKind)}>
              <SelectTrigger className="h-8 w-[200px] bg-background/60 border-white/10 text-xs cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TASK_LABELS) as TaskKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{TASK_LABELS[k]} ({useCaseFor(k)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {tab === "busqueda" && (
          <div className="mb-4 flex items-center gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); }}
              placeholder="p. ej. «modelo de visión pequeño para español»"
              className="h-8 flex-1 bg-background/60 border-white/10 text-xs"
            />
            <Button size="sm" className="h-8 cursor-pointer gap-1.5" onClick={handleSearchSubmit}>
              <Search className="h-3.5 w-3.5" /> Buscar
            </Button>
          </div>
        )}

        <ResultsGrid loading={loading} items={items} reasonsById={reasonsById} emptyText={emptyText} />
      </div>
    </div>
  );
}
