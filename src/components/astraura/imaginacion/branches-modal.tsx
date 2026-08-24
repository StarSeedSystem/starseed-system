"use client";

/**
 * "RAMAS & LOGS" DE UN PROCESO — de `ProcessBranchesModal.jsx` (spec §6.A).
 * ----------------------------------------------------------------------------
 * El árbol REAL de ramas de un proceso onírico: cada disparo de un proceso
 * genera una rama (hipótesis → insights); "Bifurcar" genera una sub-rama.
 * 5 sub-pestañas (En Progreso, Comparador de Mejoras & Diff AST, Historial de
 * Versiones & Enlaces, Completadas, Todas), sondeo en vivo cada 3s mientras el
 * toggle "En Vivo" está encendido, y por rama: Regenerar · Bifurcar (Fork) ·
 * Editar · Eliminar.
 *
 * OJO — no confundir con `ParallelAgentBranchingTree`/`ProcessBranchingFullViewModal`
 * del original: ESE es el árbol de ramificación de una respuesta de CHAT
 * (`ChatInterface.jsx`), un sistema totalmente distinto que no cuelga de esta
 * pantalla y por tanto no se reconstruye aquí (spec §6.B).
 *
 * MEJORA sobre el original (pedida explícitamente): el campo `generated_by`
 * que manda el backend en cada rama (`llm` = motor real / plantilla) nunca se
 * pintaba en el original; aquí se muestra como insignia en cada tarjeta.
 *
 * El evento global `open-file-viewer` del original se sustituye, siguiendo la
 * propia recomendación de la spec (§11), por un callback `onOpenFile` — sin
 * visor de archivos soberano en esta reconstrucción, se informa por toast.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown, Compass, FileCode2, Folder, GitBranch, GitFork, ListTree, Loader2, Maximize2, Minimize2,
  Pause, Pencil, Play, Radio, RefreshCw, Rows3, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
// Adenda 137: diálogos accesibles del OS en vez de los nativos del navegador.
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import {
  deleteAstraura158Branch, fetchAstraura158ProcessBranches, forkAstraura158Branch, modifyAstraura158Branch,
  regenerateAstraura158Branch, stepAstraura158Process, type Astraura158Branch, type Astraura158ProcessType, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_DANGER, BTN_PRIMARY, Bar, BusyIcon, Empty, LABEL, MONO, SELECT, TEXTAREA, useBusy } from "@/components/astraura/s158/shared";

/** Forma real de una rama — el cliente solo tipa los campos "de lista"; el resto
 *  (§6.A del original) llega del backend pero no está en `Astraura158Branch`. */
export interface BranchFull extends Astraura158Branch {
  parent_branch_id?: string;
  generated_by?: string;
  real_links?: { files?: { name: string; path: string }[]; folders?: { name: string; path: string }[] };
  step_logs?: string[];
  diff_comparison?: {
    delta_metrics?: { latency_reduction_pct?: number; ram_reduction_pct?: number; throughput_increase_pct?: number };
    code_diff?: { file_path?: string; summary?: string; before_snippet?: string; after_snippet?: string };
  };
  historical_versions?: { version?: string; summary?: string; timestamp?: number; author?: string; changes?: string[]; file_link?: string }[];
}

type SubTab = "in_progress" | "diff" | "history" | "completed" | "all";

function isApplied(b: BranchFull): boolean { return /applied|done|completed/i.test(String(b.status ?? "")); }

function openFile(path: string, onOpenFile?: (path: string) => void) {
  if (onOpenFile) { onOpenFile(path); return; }
  toast.message("Sin visor de archivos soberano en esta reconstrucción", { description: path });
}

export interface BranchesModalProps {
  target: Astraura158Target;
  processId: string;
  processName?: string;
  processColor?: string;
  open: boolean;
  onClose: () => void;
  /** Sustituye el `window.dispatchEvent(new CustomEvent('open-file-viewer', …))` del original (spec §11). */
  onOpenFile?: (path: string) => void;
}

export function BranchesModal({ target, processId, processName, processColor, open, onClose, onOpenFile }: BranchesModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [process, setProcess] = useState<Astraura158ProcessType | null>(null);
  const [all, setAll] = useState<BranchFull[]>([]);
  const [inProgress, setInProgress] = useState<BranchFull[]>([]);
  const [completed, setCompleted] = useState<BranchFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<SubTab>("in_progress");
  const [live, setLive] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [forkOf, setForkOf] = useState<BranchFull | null>(null);
  const [editOf, setEditOf] = useState<BranchFull | null>(null);
  const { busy, wrap } = useBusy();
  const confirmDialog = useConfirm();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const r = await fetchAstraura158ProcessBranches(target, processId);
    if (r.ok) {
      const allList = (r.data.all_branches ?? r.data.branches ?? []) as BranchFull[];
      setAll(allList);
      setInProgress((r.data.in_progress as BranchFull[] | undefined) ?? allList.filter((b) => !isApplied(b)));
      setCompleted((r.data.completed as BranchFull[] | undefined) ?? allList.filter(isApplied));
      setProcess(r.data.process ?? null);
      setError("");
    } else if (!silent) {
      setError(r.error);
    }
    if (!silent) setLoading(false);
  }, [target, processId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  // Sondeo de ramas en vivo: 3s, solo con el modal abierto Y el toggle "En Vivo" encendido (spec §10).
  useEffect(() => {
    if (!open || !live) return;
    const id = window.setInterval(() => { void load(true); }, 3000);
    return () => window.clearInterval(id);
  }, [open, live, load]);

  useModalA11y({ open, onClose, containerRef });

  useEffect(() => {
    if (all.length > 0 && !all.some((b) => b.id === selectedId)) setSelectedId(all[0].id);
  }, [all, selectedId]);

  if (!open) return null;

  const name = process?.name ?? processName ?? processId;
  const color = process?.color ?? processColor ?? "#a855f7";
  const total = all.length;
  const progressPct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  const selected = all.find((b) => b.id === selectedId) ?? null;

  const list = tab === "in_progress" ? inProgress : tab === "completed" ? completed : all;

  const reloadAfter = async () => { await load(true); };

  const onStepGlobal = () => {
    void wrap("paso-global", async () => {
      const r = await stepAstraura158Process(target, processId);
      if (r.ok) { toast.success("Paso en vivo ejecutado"); await reloadAfter(); } else toast.error(`Paso en vivo: ${r.error}`);
    });
  };

  const onRegenerate = (b: BranchFull) => {
    void wrap(`regen:${b.id}`, async () => {
      const r = await regenerateAstraura158Branch(target, b.id);
      if (r.ok) { toast.success(`Rama regenerada: ${b.theme ?? b.id}`); await reloadAfter(); } else toast.error(`Regenerar: ${r.error}`);
    });
  };

  const onDelete = (b: BranchFull) => {
    void (async () => {
      // Adenda 137: diálogo accesible del OS, nunca `window.confirm`.
      const ok = await confirmDialog({
        title: "¿Eliminar esta rama?",
        description: `«${b.theme ?? b.id}» y su historial de pasos se pierden. Esta acción no se puede deshacer.`,
        confirmText: "Eliminar rama",
        destructive: true,
      });
      if (!ok) return;
      await wrap(`del:${b.id}`, async () => {
        const r = await deleteAstraura158Branch(target, b.id);
        if (r.ok) { toast.success("Rama eliminada"); await reloadAfter(); } else toast.error(`Eliminar: ${r.error}`);
      });
    })();
  };

  const onStepBranch = (b: BranchFull) => {
    void wrap(`paso:${b.id}`, async () => {
      const r = await stepAstraura158Process(target, processId, b.id);
      if (r.ok) { toast.success(`Paso avanzado: ${b.theme ?? b.id}`); await reloadAfter(); } else toast.error(`Avanzar paso: ${r.error}`);
    });
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-4"
      role="dialog" aria-modal="true" aria-label={`Ramas y logs de ${name}`}
    >
      <div className={cn("flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0b12] shadow-2xl", fullscreen ? "h-full max-w-full" : "h-[90vh] max-w-6xl")}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <button type="button" className={BTN} aria-label="Volver" onClick={onClose}><ChevronDown className="h-3.5 w-3.5 rotate-90" aria-hidden="true" /></button>
          <GitBranch className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">Vista Completa de Proceso: <span style={{ color }}>{name}</span></p>
          <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200">{inProgress.length} Ramas Vivas</span>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">Progreso: {progressPct}%</span>
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">ARM64 NEON M1</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className={cn(BTN, live ? "border-emerald-400/40 text-emerald-200" : "")} aria-pressed={live} aria-label={live ? "En vivo, cada 3 segundos" : "Sondeo en pausa"} onClick={() => setLive((v) => !v)}>
              <BusyIcon busy={false} icon={live ? Radio : Pause} /> {live ? "En Vivo (3s)" : "Pausado"}
            </button>
            <button type="button" className={BTN} disabled={busy !== ""} aria-label="Paso en vivo" onClick={onStepGlobal}><BusyIcon busy={busy === "paso-global"} icon={Play} /> Paso en Vivo</button>
            <button type="button" className={BTN} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={() => setFullscreen((v) => !v)}>{fullscreen ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}</button>
            <button type="button" className={BTN} aria-label="Cerrar" onClick={onClose}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="border-b border-white/10 px-4 py-2">
          <Bar value={progressPct} />
          <p className={cn(MONO, "mt-1")}>{completed.length}/{total} Ramas Consolidadas</p>
        </div>

        {/* Sub-tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2">
          {([
            ["in_progress", `En Progreso (${inProgress.length})`, Rows3],
            ["diff", "Comparador de Mejoras & Diff AST", Compass],
            ["history", "Historial de Versiones & Enlaces", ListTree],
            ["completed", `Completadas (${completed.length})`, GitBranch],
            ["all", `Todas (${total})`, ListTree],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id} type="button"
              className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] transition-colors", tab === id ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80")}
              onClick={() => setTab(id)} aria-current={tab === id}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && <p className="flex items-center gap-1.5 text-[11px] text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Leyendo ramas del backend…</p>}
          {!loading && error && <Empty error={error} text="Sin conexión con el backend." />}

          {!loading && !error && (tab === "in_progress" || tab === "completed" || tab === "all") && (
            <div className="grid gap-2 lg:grid-cols-2">
              {list.length === 0 && <Empty text="Sin ramas en esta pestaña todavía." />}
              {list.map((b) => (
                <BranchCard
                  key={b.id} b={b} busy={busy}
                  onViewDiff={() => { setSelectedId(b.id); setTab("diff"); }}
                  onRegenerate={() => onRegenerate(b)}
                  onFork={() => setForkOf(b)}
                  onEdit={() => setEditOf(b)}
                  onDelete={() => onDelete(b)}
                  onStep={() => onStepBranch(b)}
                  onOpenFile={(p) => openFile(p, onOpenFile)}
                />
              ))}
            </div>
          )}

          {!loading && !error && tab === "diff" && (
            <DiffComparatorTab all={all} selected={selected} selectedId={selectedId} onSelect={setSelectedId} onOpenFile={(p) => openFile(p, onOpenFile)} />
          )}

          {!loading && !error && tab === "history" && (
            <HistoryTab all={all} selected={selected} selectedId={selectedId} onSelect={setSelectedId} onOpenFile={(p) => openFile(p, onOpenFile)} />
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5">
          <p className={MONO}>Kernel: StarSeed 1.58b Dual-Trunk · Modo: 100% Silicio M1 (Real)</p>
          <div className="flex gap-1.5">
            <button type="button" className={BTN} disabled={busy !== ""} aria-label="Simular mutación de paso" onClick={onStepGlobal}><BusyIcon busy={busy === "paso-global"} icon={RefreshCw} /> Simular Mutación de Paso</button>
            <button type="button" className={BTN} aria-label="Cerrar vista" onClick={onClose}>Cerrar Vista</button>
          </div>
        </div>
      </div>

      {forkOf && <ForkDialog target={target} branch={forkOf} onClose={() => setForkOf(null)} onDone={reloadAfter} />}
      {editOf && <EditBranchDialog target={target} branch={editOf} onClose={() => setEditOf(null)} onDone={reloadAfter} />}
    </div>
  );
}

/* ── Tarjeta de rama (pestañas En Progreso / Completadas / Todas) ─────────── */

function BranchCard({ b, busy, onViewDiff, onRegenerate, onFork, onEdit, onDelete, onStep, onOpenFile }: {
  b: BranchFull; busy: string;
  onViewDiff: () => void; onRegenerate: () => void; onFork: () => void; onEdit: () => void; onDelete: () => void; onStep: () => void;
  onOpenFile: (path: string) => void;
}) {
  const applied = isApplied(b);
  const files = b.real_links?.files ?? [];
  const folders = b.real_links?.folders ?? [];
  const logs = b.step_logs ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={b.theme}>{b.theme ?? b.id}</p>
        {b.parent_branch_id && <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200">Sub-Rama de {b.parent_branch_id}</span>}
        {b.generated_by && (
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", b.generated_by === "llm" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200")}>
            {b.generated_by === "llm" ? "Generado por: modelo real" : "Plantilla"}
          </span>
        )}
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", applied ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-purple-400/30 bg-purple-500/10 text-purple-200")}>
          {applied ? "✓ Asimilado / Completado" : "⚡ Ejecución Activa"}
        </span>
      </div>
      <p className={MONO}>{b.formatted_time ?? ""}</p>

      {b.hypothesis && <p className="text-[10px] leading-snug text-white/70"><span className="text-white/40">Hipótesis / Directiva: </span>{b.hypothesis}</p>}
      {b.insights && <p className="text-[10px] leading-snug text-white/60"><span className="text-white/40">Insights &amp; Axiomas: </span>{b.insights}</p>}

      <div>
        <p className={LABEL}>Progreso de la Rama:</p>
        <Bar value={b.progress_percent ?? (applied ? 100 : 65)} className="mt-1" />
      </div>

      {(files.length > 0 || folders.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {files.map((f) => <button key={f.path} type="button" className={BTN} onClick={() => onOpenFile(f.path)} aria-label={`Abrir ${f.name}`}><FileCode2 className="h-3 w-3" aria-hidden="true" /> {f.name}</button>)}
          {folders.map((f) => <button key={f.path} type="button" className={BTN} onClick={() => onOpenFile(f.path)} aria-label={`Abrir ${f.name}`}><Folder className="h-3 w-3" aria-hidden="true" /> {f.name}</button>)}
        </div>
      )}

      {logs.length > 0 && (
        <div className="rounded-md border border-white/10 bg-black/30 p-2">
          <p className={LABEL}>Ejecución en vivo</p>
          <div className="mt-1 space-y-0.5">{logs.slice(-3).map((l, i) => <p key={i} className="truncate font-code text-[9.5px] text-white/55">{l}</p>)}</div>
          <button type="button" className={cn(BTN, "mt-1.5")} disabled={busy !== ""} aria-label="Avanzar un paso de ejecución" onClick={onStep}><BusyIcon busy={busy === `paso:${b.id}`} icon={Play} /> + Avanzar Paso</button>
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-1.5">
        <button type="button" className={BTN} aria-label={`Ver diff de ${b.theme ?? b.id}`} onClick={onViewDiff}><Compass className="h-3 w-3" aria-hidden="true" /> Ver Diff</button>
        <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Regenerar ${b.theme ?? b.id}`} onClick={onRegenerate}><BusyIcon busy={busy === `regen:${b.id}`} icon={RefreshCw} /> Regenerar</button>
        <button type="button" className={BTN} aria-label={`Bifurcar ${b.theme ?? b.id}`} onClick={onFork}><GitFork className="h-3 w-3" aria-hidden="true" /> Bifurcar (Fork)</button>
        <button type="button" className={BTN} aria-label={`Editar ${b.theme ?? b.id}`} onClick={onEdit}><Pencil className="h-3 w-3" aria-hidden="true" /> Editar</button>
        <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Eliminar ${b.theme ?? b.id}`} onClick={onDelete}><BusyIcon busy={busy === `del:${b.id}`} icon={Trash2} /> Eliminar</button>
      </div>
    </div>
  );
}

/* ── Pestaña "Comparador de Mejoras & Diff AST" ────────────────────────────── */

function DiffComparatorTab({ all, selected, selectedId, onSelect, onOpenFile }: {
  all: BranchFull[]; selected: BranchFull | null; selectedId: string; onSelect: (id: string) => void; onOpenFile: (path: string) => void;
}) {
  const metrics = selected?.diff_comparison?.delta_metrics;
  const diff = selected?.diff_comparison?.code_diff;
  const files = selected?.real_links?.files ?? [];
  const folders = selected?.real_links?.folders ?? [];
  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
        Rama seleccionada
        <select className={cn(SELECT, "min-w-[220px]")} value={selectedId} onChange={(e) => onSelect(e.target.value)} aria-label="Seleccionar rama para comparar">
          {all.length === 0 && <option value="">Sin ramas</option>}
          {all.map((b) => <option key={b.id} value={b.id}>{b.theme ?? b.id}</option>)}
        </select>
      </label>

      {!selected && <Empty text="Selecciona una rama para ver su comparador de mejoras." />}

      {selected && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Reducción de Latencia" value={metrics?.latency_reduction_pct} suffix="%" fallback={-74.2} />
            <MetricCard label="Huella RAM" value={metrics?.ram_reduction_pct} suffix="%" fallback={-62.8} />
            <MetricCard label="Eficiencia TOPS/W" value={metrics?.throughput_increase_pct} suffix="%" fallback={135} showPlus />
            <MetricCard label="Verificación Silicio M1" value={selected.verification?.score !== undefined ? Math.round(selected.verification.score * 100) : undefined} suffix="%" fallback={100} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-rose-400/25 bg-rose-500/[0.06] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">Descartado</p>
              <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words font-code text-[10px] leading-snug text-rose-100/80">{diff?.before_snippet ?? "Sin snippet «antes» del backend."}</pre>
            </div>
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Activo en Silicio</p>
              <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words font-code text-[10px] leading-snug text-emerald-100/80">{diff?.after_snippet ?? "Sin snippet «después» del backend."}</pre>
            </div>
          </div>
          <p className={MONO}>{diff?.file_path ?? "backend/app/core/bitnet_neon_engine.cpp"}{diff?.summary ? ` — ${diff.summary}` : ""}</p>

          {(files.length > 0 || folders.length > 0) && (
            <div>
              <p className={LABEL}>Archivos y nodos reales modificados</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {files.map((f) => <button key={f.path} type="button" className={BTN} onClick={() => onOpenFile(f.path)} aria-label={`Abrir ${f.name}`}><FileCode2 className="h-3 w-3" aria-hidden="true" /> {f.name}</button>)}
                {folders.map((f) => <button key={f.path} type="button" className={BTN} onClick={() => onOpenFile(f.path)} aria-label={`Abrir ${f.name}`}><Folder className="h-3 w-3" aria-hidden="true" /> {f.name}</button>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, fallback, suffix, showPlus }: { label: string; value?: number; fallback: number; suffix: string; showPlus?: boolean }) {
  const v = value ?? fallback;
  const shown = showPlus && v > 0 ? `+${v}` : `${v}`;
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <p className={LABEL}>{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-white/90">{shown}{suffix}</p>
    </div>
  );
}

/* ── Pestaña "Historial de Versiones & Enlaces" ────────────────────────────── */

function HistoryTab({ all, selected, selectedId, onSelect, onOpenFile }: {
  all: BranchFull[]; selected: BranchFull | null; selectedId: string; onSelect: (id: string) => void; onOpenFile: (path: string) => void;
}) {
  const versions = selected?.historical_versions ?? [];
  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
        Rama seleccionada
        <select className={cn(SELECT, "min-w-[220px]")} value={selectedId} onChange={(e) => onSelect(e.target.value)} aria-label="Seleccionar rama para ver su historial">
          {all.length === 0 && <option value="">Sin ramas</option>}
          {all.map((b) => <option key={b.id} value={b.id}>{b.theme ?? b.id}</option>)}
        </select>
      </label>
      {versions.length === 0 && <Empty text="Sin historial de versiones para esta rama." />}
      <div className="space-y-2">
        {versions.map((v, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] text-cyan-200">{v.version ?? `v${i + 1}`}</span>
              {v.author && <span className="text-[10px] text-white/50">{v.author}</span>}
              {v.timestamp && <span className={MONO}>{new Date(v.timestamp > 1e12 ? v.timestamp : v.timestamp * 1000).toLocaleString("es")}</span>}
            </div>
            {v.summary && <p className="mt-1 text-[11px] text-white/70">{v.summary}</p>}
            {v.changes && v.changes.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] text-white/55">{v.changes.map((c, j) => <li key={j}>{c}</li>)}</ul>
            )}
            {v.file_link && <button type="button" className={cn(BTN, "mt-1.5")} onClick={() => onOpenFile(v.file_link!)} aria-label="Inspeccionar archivo host"><FileCode2 className="h-3 w-3" aria-hidden="true" /> Inspeccionar Archivo Host</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sub-modal "Bifurcar (Fork)" ────────────────────────────────────────────── */

function ForkDialog({ target, branch, onClose, onDone }: { target: Astraura158Target; branch: BranchFull; onClose: () => void; onDone: () => void | Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const { busy, wrap } = useBusy();
  useModalA11y({ open: true, onClose, containerRef: ref });
  return (
    <div ref={ref} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Bifurcar rama ${branch.theme ?? branch.id}`}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0b0d14] p-4 shadow-2xl">
        <p className="text-[13px] font-semibold text-white/90">Bifurcar (Fork) — {branch.theme ?? branch.id}</p>
        <label className="mt-3 block">
          <span className={LABEL}>Nota o Enfoque de la Bifurcación:</span>
          <textarea
            className={cn(TEXTAREA, "mt-1")} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: Explorar vectorización alternativa con registros i2_s sin desborde..."
            aria-label="Nota o enfoque de la bifurcación"
          />
        </label>
        <div className="mt-3 flex justify-end gap-1.5">
          <button type="button" className={BTN} onClick={onClose} aria-label="Cancelar bifurcación">Cancelar</button>
          <button
            type="button" className={BTN_PRIMARY} disabled={busy !== "" || !note.trim()} aria-label="Confirmar bifurcación"
            onClick={() => { void wrap("fork", async () => { const r = await forkAstraura158Branch(target, branch.id, note.trim()); if (r.ok) { toast.success("Rama bifurcada"); onClose(); await onDone(); } else toast.error(`Bifurcar: ${r.error}`); }); }}
          >
            <BusyIcon busy={busy === "fork"} icon={GitFork} /> Bifurcar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-modal "Editar" ─────────────────────────────────────────────────────── */

function EditBranchDialog({ target, branch, onClose, onDone }: { target: Astraura158Target; branch: BranchFull; onClose: () => void; onDone: () => void | Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hypothesis, setHypothesis] = useState(branch.hypothesis ?? "");
  const [insights, setInsights] = useState(branch.insights ?? "");
  const { busy, wrap } = useBusy();
  useModalA11y({ open: true, onClose, containerRef: ref });
  return (
    <div ref={ref} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Editar rama ${branch.theme ?? branch.id}`}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0b0d14] p-4 shadow-2xl">
        <p className="text-[13px] font-semibold text-white/90">Editar — {branch.theme ?? branch.id}</p>
        <label className="mt-3 block">
          <span className={LABEL}>Hipótesis / Directiva</span>
          <textarea className={cn(TEXTAREA, "mt-1")} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} aria-label="Hipótesis de la rama" />
        </label>
        <label className="mt-2 block">
          <span className={LABEL}>Insights &amp; Axiomas</span>
          <textarea className={cn(TEXTAREA, "mt-1")} value={insights} onChange={(e) => setInsights(e.target.value)} aria-label="Insights de la rama" />
        </label>
        <div className="mt-3 flex justify-end gap-1.5">
          <button type="button" className={BTN} onClick={onClose} aria-label="Cancelar edición">Cancelar</button>
          <button
            type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Guardar cambios"
            onClick={() => { void wrap("edit", async () => { const r = await modifyAstraura158Branch(target, branch.id, { hypothesis, insights }); if (r.ok) { toast.success("Rama actualizada"); onClose(); await onDone(); } else toast.error(`Editar: ${r.error}`); }); }}
          >
            <BusyIcon busy={busy === "edit"} icon={Pencil} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export default BranchesModal;
