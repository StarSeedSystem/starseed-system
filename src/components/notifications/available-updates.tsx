"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — «ACTUALIZACIONES DISPONIBLES» (Centro de Notificaciones · §12)
 * ---------------------------------------------------------------------------
 * Sección del Centro de Notificaciones que lista los programas/repos instalados
 * desde la Biblioteca con una versión nueva disponible, comprobando en varias
 * fuentes/servidores REALES (catálogo StarSeed · GitHub releases · GitHub tags)
 * y mostrando las variaciones de versión. Permite «Actualizar» (marca la nueva
 * versión como instalada + historial). Datos reales; vacío honesto si no hay
 * nada que actualizar. Diseño coherente con notifications-center.tsx.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import * as Lucide from "lucide-react";
import {
  ArrowUpCircle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ChevronDown,
  History,
  ExternalLink,
  AlertTriangle,
  Package as PackageIcon,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  checkForUpdates,
  getCachedReport,
  applyUpdate,
  getUpdateHistory,
  AVAILABLE_UPDATES_EVENT,
  type UpdatesReport,
  type PackageUpdate,
  type UpdateHistoryEntry,
  type UpdateSourceResult,
} from "@/lib/notifications/available-updates";
import { LIBRARY_EVENT } from "@/lib/library/packages";

/** Resuelve un icono lucide por nombre con fallback a Package. */
function iconFor(name: string): React.ComponentType<{ className?: string }> {
  const dict = Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return dict[name] ?? PackageIcon;
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function AvailableUpdates() {
  const [report, setReport] = React.useState<UpdatesReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = React.useState(false);
  const [history, setHistory] = React.useState<UpdateHistoryEntry[]>([]);
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});

  const refreshHistory = React.useCallback(() => {
    try {
      setHistory(getUpdateHistory());
    } catch {
      setHistory([]);
    }
  }, []);

  const run = React.useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const r = await checkForUpdates({ force });
      setReport(r);
    } catch {
      /* defensivo */
    }
    setLoading(false);
    refreshHistory();
  }, [refreshHistory]);

  // Montaje: caché primero (instantáneo) y, si está vieja/ausente, comprueba.
  React.useEffect(() => {
    const cached = getCachedReport();
    if (cached) setReport(cached);
    refreshHistory();
    void run(false);
    const onEvt = () => {
      const c = getCachedReport();
      if (c) setReport(c);
      refreshHistory();
    };
    window.addEventListener(AVAILABLE_UPDATES_EVENT, onEvt);
    window.addEventListener(LIBRARY_EVENT, onEvt);
    return () => {
      window.removeEventListener(AVAILABLE_UPDATES_EVENT, onEvt);
      window.removeEventListener(LIBRARY_EVENT, onEvt);
    };
  }, [run, refreshHistory]);

  const available = report?.available ?? [];

  const onUpdate = React.useCallback((it: PackageUpdate) => {
    if (!it.latestVersion) return;
    setBusy((b) => ({ ...b, [it.id]: true }));
    const res = applyUpdate(it.id, it.latestVersion, it.bestSource ?? "starseed-catalog");
    setBusy((b) => ({ ...b, [it.id]: false }));
    if (res.ok) {
      toast.success(res.message);
      const c = getCachedReport();
      if (c) setReport(c);
      refreshHistory();
    } else {
      toast.error(res.message);
    }
  }, [refreshHistory]);

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-5 md:p-6 backdrop-blur-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#007FFF]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 relative">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl border border-[#007FFF]/20 bg-[#007FFF]/10">
            <ArrowUpCircle className="w-4 h-4 text-[#3aa0ff]" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/80">
              Actualizaciones disponibles
            </h2>
            <p className="text-[10px] text-white/40">
              {report?.checkedAt
                ? `Comprobado ${timeAgo(report.checkedAt)} · ${report.reposChecked} repos`
                : "Programas y repos instalados desde la Biblioteca"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => void run(true)}
            variant="outline"
            size="sm"
            disabled={loading}
            className="h-8 rounded-xl text-xs gap-1.5 bg-[#007FFF]/5 border-[#007FFF]/20 text-[#8fc4ff] hover:bg-[#007FFF]/10"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Buscar actualizaciones
          </Button>
        </div>
      </div>

      {/* Aviso de límite de GitHub (honesto) */}
      {report?.rateLimited && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] text-amber-200/85">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            GitHub limitó las consultas anónimas (sin token) por ahora. Se comprobó lo posible y el catálogo
            StarSeed; reintenta en un rato para el resto.
          </span>
        </div>
      )}

      {/* Lista de actualizaciones disponibles */}
      {loading && !report ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : available.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-white/5 bg-white/[0.01] rounded-3xl gap-2">
          <CheckCircle2 className="w-9 h-9 opacity-20 text-emerald-400" />
          <span className="text-sm opacity-70">Todo al día. No hay actualizaciones pendientes.</span>
          {report && (
            <span className="text-[10px] opacity-40">
              {report.items.length} paquete(s) instalado(s) comprobado(s).
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {available.map((it) => {
            const Icon = iconFor(it.icon);
            const open = !!expanded[it.id];
            return (
              <div
                key={it.id}
                className="rounded-2xl border border-[#007FFF]/15 bg-white/[0.04] backdrop-blur-md border-l-2 border-l-[#3aa0ff]"
              >
                <div className="flex gap-3 p-3.5">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border border-[#007FFF]/25 bg-[#007FFF]/10 text-[#3aa0ff]">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <h3 className="text-sm font-medium text-white leading-snug flex-1 min-w-0 truncate">
                        {it.name}
                      </h3>
                      <span className="text-[10px] font-mono text-white/40 shrink-0 pt-0.5">
                        {it.installedVersion} →{" "}
                        <span className="text-emerald-300 font-semibold">{it.latestVersion}</span>
                      </span>
                    </div>

                    {/* Fuentes/servidores (variaciones de versión) */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {it.sources
                        .filter((s) => s.version)
                        .map((s) => (
                          <SourceBadge key={s.source} s={s} />
                        ))}
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Button
                        onClick={() => onUpdate(it)}
                        size="sm"
                        variant="secondary"
                        disabled={!!busy[it.id]}
                        className="h-7 rounded-lg text-[11px] gap-1 bg-emerald-500/15 border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/25"
                      >
                        {busy[it.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpCircle className="w-3 h-3" />}
                        Actualizar
                      </Button>
                      {it.repo && (
                        <a
                          href={`https://github.com/${it.repo.owner}/${it.repo.repo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5"
                        >
                          Repo <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [it.id]: !open }))}
                        className="h-7 px-2 rounded-lg text-[11px] text-white/45 hover:text-white hover:bg-white/5 flex items-center gap-1 ml-auto"
                      >
                        {open ? "Ocultar fuentes" : "Ver fuentes"}
                        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Detalle multi-servidor */}
                {open && (
                  <div className="border-t border-white/5 px-3.5 py-2.5 space-y-1.5">
                    {it.sources.map((s) => (
                      <div key={s.source} className="flex items-center gap-2 text-[11px]">
                        <GitBranch className="w-3 h-3 text-white/30 shrink-0" />
                        <span className="text-white/60 min-w-[120px]">{s.label}</span>
                        {s.version ? (
                          <span className="font-mono text-white/80">{s.version}</span>
                        ) : (
                          <span className="text-white/35 italic">{s.note ?? "—"}</span>
                        )}
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-[#3aa0ff]/70 hover:text-[#3aa0ff] shrink-0"
                            title="Abrir fuente"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Historial de actualizaciones */}
      {history.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white/80 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            Historial de actualizaciones ({history.length})
            <ChevronDown className={cn("w-3 h-3 transition-transform", showHistory && "rotate-180")} />
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1 rounded-2xl border border-white/5 bg-white/[0.02] p-2.5">
              {history.slice(0, 30).map((h, i) => (
                <div key={`${h.id}-${h.at}-${i}`} className="flex items-center gap-2 text-[11px] text-white/55 py-0.5">
                  <span className="flex-1 min-w-0 truncate">{h.name}</span>
                  <span className="font-mono text-white/40 shrink-0">
                    {h.from} → <span className="text-emerald-300/80">{h.to}</span>
                  </span>
                  <span className="text-[10px] text-white/25 font-mono shrink-0 w-20 text-right">
                    {timeAgo(h.at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ s }: { s: UpdateSourceResult }) {
  const tone =
    s.source === "starseed-catalog"
      ? "border-violet-500/30 text-violet-300 bg-violet-500/10"
      : s.source === "github-release"
        ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
        : "border-cyan-500/30 text-cyan-300 bg-cyan-500/10";
  return (
    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 font-mono", tone)}>
      {s.label}: {s.version}
    </Badge>
  );
}

export default AvailableUpdates;
