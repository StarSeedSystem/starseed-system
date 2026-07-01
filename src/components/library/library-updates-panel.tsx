"use client";

// ════════════════════════════════════════════════════════════════
// LibraryUpdatesPanel — Actualizaciones inteligentes por cerebro/contexto
// ----------------------------------------------------------------
// Sección "Actualizaciones" de la Librería. El usuario elige un CEREBRO /
// contexto y ve DOS cosas, tirando del agente de auto-actualización
// (`@/lib/brain-skills/auto-update-agent`, READ-ONLY):
//
//   1) NOVEDADES  (checkForUpdates): altas/actualizaciones de los archivos y
//      recursos contenidos (catálogo OSS, fuentes de librería, skills y las
//      fuentes de contenido del usuario). Las instalables se pueden añadir al
//      cerebro con un clic.
//
//   2) ALTERNATIVAS / RECOMENDACIONES (getRecommendations): no sólo novedades,
//      sino MEJORES alternativas y programas/servicios relevantes para ESE
//      contexto, extraídos del catálogo OSS + fuentes de la librería (afinadas
//      por Aurora si hay proveedor de IA; heurística local si no).
//
// Defensivo/SSR-safe: guardas, try/catch, degradación elegante. NO modifica el
// agente; sólo lo consume. UI en español, estética glass.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Loader2,
  ExternalLink,
  Download,
  Sparkles,
  BellRing,
  Lightbulb,
  BrainCircuit,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { listBrains, type Brain } from "@/lib/brains/brains";
import {
  checkForUpdates,
  getRecommendations,
  type Novelty,
  type Recommendation,
} from "@/lib/brain-skills/auto-update-agent";
import {
  getAllSources,
  installSourceInBrain,
  type InstallScope,
} from "@/lib/library/sources-store";
import { findOption } from "@/lib/oss-library";
import type { LibrarySource } from "@/lib/oss-library";

// Etiqueta legible por tipo de novedad.
const NOVELTY_LABEL: Record<string, string> = {
  "oss-new": "Nuevo",
  "oss-updated": "Actualización",
  "library-source": "Fuente",
  skill: "Skill",
  "content-source": "Tu fuente",
};

export function LibraryUpdatesPanel() {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainsLoading, setBrainsLoading] = useState(true);
  const [brainId, setBrainId] = useState<string>("");

  // Novedades (checkForUpdates).
  const [checking, setChecking] = useState(false);
  const [novelties, setNovelties] = useState<Novelty[] | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  // Recomendaciones / alternativas (getRecommendations).
  const [recommending, setRecommending] = useState(false);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recSummary, setRecSummary] = useState("");
  const [viaAurora, setViaAurora] = useState(false);

  const [sources, setSources] = useState<LibrarySource[]>([]);

  // ── Carga inicial ──
  useEffect(() => {
    try {
      setSources(getAllSources());
    } catch {
      setSources([]);
    }
    let alive = true;
    (async () => {
      setBrainsLoading(true);
      try {
        const list = await listBrains();
        if (!alive) return;
        setBrains(list);
        if (list[0]) setBrainId((prev) => prev || list[0].id);
      } catch {
        if (alive) setBrains([]);
      } finally {
        if (alive) setBrainsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Comprobar novedades (READ-ONLY sobre el agente) ──
  const onCheck = useCallback(() => {
    if (!brainId) {
      toast.error("Elige un cerebro/contexto.");
      return;
    }
    setChecking(true);
    try {
      const res = checkForUpdates(brainId);
      setNovelties(res.novelties);
      setFirstRun(res.firstRun);
      if (res.firstRun) {
        toast.message("Estado base registrado", {
          description: "Vuelve a comprobar más tarde para ver novedades.",
        });
      } else if (res.novelties.length === 0) {
        toast.success("Sin novedades: todo al día.");
      } else {
        toast.success(`${res.novelties.length} novedad(es) detectada(s).`);
      }
    } catch {
      toast.error("No se pudieron comprobar las novedades.");
      setNovelties([]);
    } finally {
      setChecking(false);
    }
  }, [brainId]);

  // ── Recomendaciones / alternativas (Aurora o heurística) ──
  const onRecommend = useCallback(async () => {
    if (!brainId) {
      toast.error("Elige un cerebro/contexto.");
      return;
    }
    setRecommending(true);
    try {
      const res = await getRecommendations(brainId, { limit: 8 });
      setRecs(res.recommendations);
      setRecSummary(res.summary);
      setViaAurora(res.viaAurora);
      if (res.recommendations.length === 0) {
        toast.message("Sin recomendaciones por ahora.");
      }
    } catch {
      toast.error("No se pudieron obtener recomendaciones.");
      setRecs([]);
    } finally {
      setRecommending(false);
    }
  }, [brainId]);

  // ── Al cambiar de cerebro, comprobamos todo automáticamente ──
  useEffect(() => {
    if (!brainId) return;
    onCheck();
    void onRecommend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainId]);

  // ── Instalar una novedad/recomendación (si es una fuente de librería) ──
  const installRef = useCallback(
    (refId: string, label: string, scope: InstallScope = "user") => {
      if (!brainId) {
        toast.error("Elige un cerebro destino.");
        return;
      }
      const src = sources.find((s) => s.id === refId);
      if (!src) {
        toast.message("Esto no es una fuente instalable directamente.", { description: label });
        return;
      }
      try {
        installSourceInBrain(brainId, src, scope);
        toast.success(`«${src.label}» instalada en el cerebro.`);
      } catch {
        toast.error("No se pudo instalar.");
      }
    },
    [brainId, sources],
  );

  const isInstallable = useCallback(
    (refId: string) => sources.some((s) => s.id === refId),
    [sources],
  );

  const selectedBrainName = useMemo(
    () => brains.find((b) => b.id === brainId)?.name ?? "",
    [brains, brainId],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera + selector de cerebro/contexto */}
      <GlassCard className="p-5 border-amber-400/15 bg-gradient-to-br from-amber-900/20 to-transparent">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-300" />
              <h2 className="text-xl font-bold font-headline text-amber-100">Actualizaciones inteligentes</h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Elige un cerebro/contexto y descubre novedades de lo que contiene, además de mejores
              alternativas y programas/servicios recomendados para ese contexto.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={brainId} onValueChange={setBrainId}>
              <SelectTrigger className="h-9 w-[200px] max-w-[60vw] bg-black/30 text-xs">
                <SelectValue placeholder={brainsLoading ? "Cargando…" : "Elige cerebro/contexto"} />
              </SelectTrigger>
              <SelectContent>
                {brains.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!brainsLoading && brains.length === 0 && (
          <p className="mt-3 text-[12px] text-amber-300/80">
            Aún no tienes cerebros. Crea uno en la sección Cerebros para vigilar novedades y recibir
            recomendaciones por contexto.
          </p>
        )}
      </GlassCard>

      {/* ── NOVEDADES (checkForUpdates) ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-300" />
            <h3 className="text-lg font-bold">Novedades</h3>
            {novelties && !firstRun && (
              <Badge variant="outline" className="text-[10px]">
                {novelties.length}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] cursor-pointer" onClick={onCheck} disabled={checking || !brainId}>
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Comprobar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Altas y actualizaciones de los archivos/recursos contenidos (catálogo OSS, fuentes, skills
          y tus fuentes de contenido){selectedBrainName ? ` en «${selectedBrainName}»` : ""}.
        </p>

        {novelties === null ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground">
            Elige un cerebro y pulsa «Comprobar» para ver novedades.
          </GlassCard>
        ) : firstRun ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground">
            Primera comprobación: registramos el estado base de este contexto. Vuelve más tarde para
            ver novedades.
          </GlassCard>
        ) : novelties.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-emerald-300/80">
            Sin novedades: catálogo, fuentes y skills al día.
          </GlassCard>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {novelties.map((n, i) => {
              const installable = isInstallable(n.refId);
              return (
                <GlassCard key={`${n.kind}-${n.refId}-${i}`} className="p-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{n.title}</span>
                    <Badge variant="outline" className="text-[8px] shrink-0">
                      {NOVELTY_LABEL[n.kind] ?? n.kind}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{n.detail}</p>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    {n.url ? (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[10px] text-primary hover:underline cursor-pointer"
                      >
                        ver <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span />
                    )}
                    {installable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                        onClick={() => installRef(n.refId, n.title)}
                      >
                        <Download className="h-3 w-3" /> Instalar
                      </Button>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ── ALTERNATIVAS / RECOMENDACIONES (getRecommendations) ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-cyan-300" />
            <h3 className="text-lg font-bold">Alternativas y recomendaciones</h3>
            {viaAurora && (
              <Badge variant="outline" className="gap-1 text-[10px] border-purple-400/40 text-purple-300">
                <Sparkles className="h-3 w-3" /> Aurora
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-[11px] cursor-pointer"
            onClick={onRecommend}
            disabled={recommending || !brainId}
          >
            {recommending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Recalcular
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          No sólo actualizaciones: mejores alternativas y nuevos programas/servicios relevantes para
          este contexto, del catálogo OSS + fuentes de la librería.
        </p>

        {recSummary && (
          <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-white/80">
            {recSummary}
          </p>
        )}

        {recs === null ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground">
            Elige un cerebro para recibir recomendaciones por contexto.
          </GlassCard>
        ) : recs.length === 0 ? (
          <GlassCard className="p-6 text-center text-sm text-muted-foreground">
            Sin recomendaciones por ahora. Añade fuentes de contenido a este cerebro para afinarlas.
          </GlassCard>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((r, i) => {
              const opt = r.origin === "oss" ? findOption(r.refId) : undefined;
              const installable = isInstallable(r.refId);
              return (
                <GlassCard key={`${r.origin}-${r.refId}-${i}`} className="p-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                      <BrainCircuit className="h-3.5 w-3.5 text-cyan-300 shrink-0" /> {r.title}
                    </span>
                    <Badge variant="outline" className="text-[8px] shrink-0">
                      {r.origin === "oss" ? "OSS" : "Fuente"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{r.reason}</p>
                  {opt && (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[8px]">
                        {opt.license}
                      </Badge>
                      {opt.oss && (
                        <Badge variant="outline" className="text-[8px] text-emerald-300 border-emerald-300/40 gap-0.5">
                          <Check className="h-2.5 w-2.5" /> OSS
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-1">
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[10px] text-primary hover:underline cursor-pointer"
                      >
                        ver <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span />
                    )}
                    {installable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                        onClick={() => installRef(r.refId, r.title)}
                      >
                        <Download className="h-3 w-3" /> Instalar
                      </Button>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default LibraryUpdatesPanel;
