"use client";

/**
 * INFORME DE SÍNTESIS DEL USUARIO — de `SynthesisReportModal.jsx` (spec §8).
 * ----------------------------------------------------------------------------
 * Informe generado por un agente cronista (Hermes-Chronicler / Mnemosyne) que
 * resume, en lenguaje llano, qué hizo el sistema en un ciclo de síntesis.
 * Layout de 2 columnas: sidebar con el historial + panel central con 5
 * pestañas (Resumen Ejecutivo, Agentes & Para Qué, Completados & Próximos, Lo
 * Nuevo/Modificado/Mejoras, Comparativa vs Síntesis Previa).
 *
 * Se abre siempre SIN `initialReportId` (el original tiene el prop pero nunca
 * lo pasa desde esta pantalla): se auto-selecciona el informe más reciente
 * (`res.latest`). No hace sondeo mientras está abierto (spec §10).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Brain, Compass, Copy, Cpu, FileText, FolderTree, Loader2, RefreshCw, ShieldCheck, Wand2, X,
  Maximize2, Minimize2, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
// Adenda 137: diálogos accesibles del OS en vez de los nativos del navegador.
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import {
  clearAstraura158SynthesisReports, fetchAstraura158SynthesisReports, generateAstraura158SynthesisReport,
  type Astraura158SynthesisReport, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, Empty, LABEL, MONO, useBusy } from "@/components/astraura/s158/shared";

/** Campos reales que el original pinta y que el cliente no tipa por completo. */
interface ReportFull extends Astraura158SynthesisReport {
  participating_agents?: { id?: string; name?: string; role?: string; color?: string; icon?: string; process_developed?: string; purpose?: string; result?: string }[];
  completed_processes?: { title?: string; category?: string; purpose?: string; result?: string }[];
  upcoming_processes?: { title?: string; priority?: string; reason?: string; assigned_agent?: string }[];
  hardware_telemetry?: { platform?: string; latency_ms?: number; verification_sha256?: string };
  comparison_with_previous?: {
    evolution_narrative?: string; has_previous?: boolean; previous_synthesis_index?: number; previous_synthesis_date?: string;
    minutes_elapsed?: number; metrics_delta?: { completed_processes_diff?: number };
  };
}

type Tab = "resumen" | "agentes" | "completados" | "delta" | "comparativa";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "1. Resumen Ejecutivo" },
  { id: "agentes", label: "2. Agentes & Para Qué" },
  { id: "completados", label: "3. Completados & Próximos" },
  { id: "delta", label: "4. Lo Nuevo, Modificado & Mejoras" },
  { id: "comparativa", label: "5. Comparativa vs Síntesis Previa" },
];

function agentIcon(name?: string): { Icon: LucideIcon; tone: string } {
  switch (name) {
    case "Cpu": return { Icon: Cpu, tone: "text-emerald-300" };
    case "Wand2": return { Icon: Wand2, tone: "text-pink-300" };
    case "Brain": return { Icon: Brain, tone: "text-purple-300" };
    case "FolderTree": return { Icon: FolderTree, tone: "text-sky-300" };
    case "Compass": return { Icon: Compass, tone: "text-amber-300" };
    case "ShieldCheck": return { Icon: ShieldCheck, tone: "text-red-300" };
    default: return { Icon: Bot, tone: "text-cyan-300" };
  }
}

function priorityTone(p?: string): string {
  const v = String(p ?? "").toLowerCase();
  if (v === "high") return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  if (v === "medium") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  return "border-white/15 bg-white/[0.04] text-white/60";
}

function toMarkdown(r: ReportFull): string {
  const lines: string[] = [];
  lines.push(`# 📜 Síntesis #${r.synthesis_index ?? "?"} — ${r.title ?? "Informe de Síntesis"}`);
  lines.push("");
  lines.push(`_${r.formatted_date ?? ""} · Supervisor: ${r.supervisor ?? "Metis Prime"}_`);
  lines.push("");
  lines.push("## Resumen Ejecutivo");
  lines.push(r.executive_summary ?? "Sin resumen.");
  lines.push("");
  lines.push("## Agentes & Para Qué");
  (r.participating_agents ?? []).forEach((a) => lines.push(`- **${a.name ?? "Agente"}** (${a.role ?? "—"}) — ${a.process_developed ?? ""}: ${a.purpose ?? ""}${a.result ? ` → ${a.result}` : ""}`));
  lines.push("");
  lines.push("## Completados");
  (r.completed_processes ?? []).forEach((p) => lines.push(`- ${p.title ?? ""} (${p.category ?? "—"}) — ${p.purpose ?? ""}. Resultado: ${p.result ?? "—"}`));
  lines.push("");
  lines.push("## Próximos");
  (r.upcoming_processes ?? []).forEach((p) => lines.push(`- [Prioridad ${(p.priority ?? "—").toUpperCase()}] ${p.title ?? ""} — ${p.reason ?? ""} (Agente: ${p.assigned_agent ?? "—"})`));
  lines.push("");
  lines.push("## Lo Nuevo, Modificado & Mejoras");
  lines.push(`### ✨ Lo Nuevo\n${(r.delta_changes?.new_elements ?? []).map((e) => `- ${e}`).join("\n") || "_Nada nuevo._"}`);
  lines.push(`### ✏️ Lo Modificado\n${(r.delta_changes?.modified_elements ?? []).map((e) => `- ${e}`).join("\n") || "_Sin modificaciones._"}`);
  lines.push(`### ⚡ Mejoras & Optimización\n${(r.delta_changes?.improvements ?? []).map((e) => `- ${e}`).join("\n") || "_Sin mejoras registradas._"}`);
  lines.push("");
  lines.push("## Verificación");
  lines.push(`SHA-256: \`${(r.hardware_telemetry?.verification_sha256 ?? "").slice(0, 32) || "—"}\` · Plataforma: ${r.hardware_telemetry?.platform ?? "—"} · Latencia: ${r.hardware_telemetry?.latency_ms ?? "—"} ms`);
  return lines.join("\n");
}

export interface SynthesisReportModalProps {
  target: Astraura158Target;
  open: boolean;
  onClose: () => void;
}

export function SynthesisReportModal({ target, open, onClose }: SynthesisReportModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reports, setReports] = useState<ReportFull[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("resumen");
  const [fullscreen, setFullscreen] = useState(false);
  const { busy, wrap } = useBusy();
  const confirmDialog = useConfirm();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const r = await fetchAstraura158SynthesisReports(target, 50);
      if (!alive) return;
      if (r.ok) {
        const list = (r.data.reports ?? []) as ReportFull[];
        setReports(list);
        const latest = (r.data.latest as ReportFull | null | undefined) ?? list[0] ?? null;
        setSelectedId(latest?.id ?? "");
        setError("");
      } else {
        setError(r.error);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, target]);

  useModalA11y({ open, onClose, containerRef });

  const selected = useMemo(() => reports.find((r) => r.id === selectedId) ?? null, [reports, selectedId]);

  if (!open) return null;

  const generate = () => {
    void wrap("generar", async () => {
      const r = await generateAstraura158SynthesisReport(target, "manual_request", { theme: "Síntesis Cognitiva Ejecutiva a Petición del Usuario" });
      if (r.ok) {
        toast.success("Síntesis forjada", { description: r.data.report?.title });
        const r2 = await fetchAstraura158SynthesisReports(target, 50);
        if (r2.ok) { setReports((r2.data.reports ?? []) as ReportFull[]); setSelectedId(r2.data.latest?.id ?? r.data.report?.id ?? ""); }
      } else {
        toast.error(`Forjar síntesis: ${r.error}`);
      }
    });
  };

  const clearHistory = () => {
    void (async () => {
      // Adenda 137: diálogo accesible del OS, nunca `window.confirm`.
      const ok = await confirmDialog({
        title: "¿Borrar todo el historial de síntesis?",
        description: "Se pierden todos los informes guardados por el cronista. Esta acción no se puede deshacer.",
        confirmText: "Borrar historial",
        destructive: true,
      });
      if (!ok) return;
      await wrap("limpiar", async () => {
        const r = await clearAstraura158SynthesisReports(target);
        if (r.ok) { toast.success("Historial de síntesis borrado"); setReports([]); setSelectedId(""); } else toast.error(`Limpiar: ${r.error}`);
      });
    })();
  };

  const copyMarkdown = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(toMarkdown(selected));
      toast.success("Informe copiado como Markdown");
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Informe de Síntesis del Usuario">
      <div className={cn("flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0b12] shadow-2xl", fullscreen ? "h-full max-w-full" : "h-[88vh] max-w-6xl")}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <FileText className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">Informe de Síntesis del Usuario</p>
          <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Forjar síntesis ahora" onClick={generate}>
            {busy === "generar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} Forjar Síntesis Ahora
          </button>
          <button type="button" className={BTN} disabled={!selected} aria-label="Copiar informe como Markdown" onClick={() => void copyMarkdown()}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar</button>
          <button type="button" className={BTN} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={() => setFullscreen((v) => !v)}>{fullscreen ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}</button>
          <button type="button" className={BTN} aria-label="Cerrar informe" onClick={onClose}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="flex w-56 shrink-0 flex-col border-r border-white/10">
            <div className="flex items-center justify-between px-3 py-2">
              <p className={LABEL}>Historial de Síntesis</p>
              <button type="button" className={cn(BTN, "px-1.5 py-0.5")} disabled={busy !== "" || reports.length === 0} aria-label="Limpiar historial de síntesis" onClick={clearHistory}>Limpiar</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {loading && <p className="flex items-center gap-1.5 px-1 text-[10px] text-white/50"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> cargando…</p>}
              {!loading && error && <Empty error={error} text="Sin conexión con el backend." />}
              {!loading && !error && reports.length === 0 && <Empty text="Sin informes todavía." />}
              {reports.map((r) => (
                <button
                  key={r.id} type="button"
                  className={cn("mb-1 block w-full cursor-pointer rounded-lg border px-2 py-1.5 text-left text-[10px] transition-colors", r.id === selectedId ? "border-emerald-400/40 bg-emerald-500/10 text-white" : "border-white/10 bg-white/[0.02] text-white/65 hover:border-white/25")}
                  onClick={() => setSelectedId(r.id)} aria-current={r.id === selectedId}
                >
                  <p className="truncate font-medium">Síntesis #{r.synthesis_index ?? "?"}</p>
                  <p className="truncate text-white/50">{r.title ?? "Sin título"}</p>
                  <p className={MONO}>{r.formatted_date ?? ""} · {(r.completed_processes ?? []).length}p · {(r.participating_agents ?? []).length}a</p>
                </button>
              ))}
            </div>
          </div>

          {/* Panel central */}
          <div className="flex min-h-0 flex-1 flex-col">
            {!selected && !loading && <div className="p-4"><Empty text="Selecciona un informe del historial, o forja uno nuevo." /></div>}
            {selected && (
              <>
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">Síntesis #{selected.synthesis_index ?? "?"}</span>
                    <span className={MONO}>{selected.formatted_date ?? ""}</span>
                    <span className="text-[10px] text-white/50">Supervisor: {selected.supervisor ?? "Metis Prime"}</span>
                    {selected.hardware_telemetry?.platform && <Badge tone="border-white/15 bg-white/[0.04] text-white/60">{selected.hardware_telemetry.platform}{selected.hardware_telemetry.latency_ms ? ` · ${selected.hardware_telemetry.latency_ms} ms` : ""}</Badge>}
                  </div>
                  <p className="mt-1.5 text-[14px] font-semibold text-white/90">{selected.title ?? "Informe de Síntesis"}</p>
                </div>
                <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2">
                  {TABS.map((t) => (
                    <button key={t.id} type="button" className={cn("cursor-pointer rounded-md px-2.5 py-1.5 text-[11px] transition-colors", tab === t.id ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80")} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {tab === "resumen" && <ResumenTab r={selected} />}
                  {tab === "agentes" && <AgentesTab r={selected} />}
                  {tab === "completados" && <CompletadosTab r={selected} />}
                  {tab === "delta" && <DeltaTab r={selected} />}
                  {tab === "comparativa" && <ComparativaTab r={selected} />}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumenTab({ r }: { r: ReportFull }) {
  const completedCount = (r.completed_processes ?? []).length;
  const agentsCount = (r.participating_agents ?? []).length;
  const newCount = (r.delta_changes?.new_elements ?? []).length;
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-white/75">{r.executive_summary ?? "Sin resumen ejecutivo del backend."}</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Procesos Finalizados</p><p className="mt-0.5 text-[14px] font-semibold text-white/90">{completedCount}</p></div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Agentes Activos</p><p className="mt-0.5 text-[14px] font-semibold text-white/90">{agentsCount}</p></div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Nuevos Elementos</p><p className="mt-0.5 text-[14px] font-semibold text-white/90">{newCount}</p></div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Verificación AST</p><p className="mt-0.5 text-[14px] font-semibold text-emerald-300">100% Válido</p></div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <p className={LABEL}>Auditoría</p>
        <p className={cn(MONO, "mt-1 break-all")}>SHA-256 · {(r.hardware_telemetry?.verification_sha256 ?? "").slice(0, 32) || "sin hash del backend"}</p>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Sandbox Seguro 100% Offline</span>
      </div>
    </div>
  );
}

function AgentesTab({ r }: { r: ReportFull }) {
  const agents = r.participating_agents ?? [];
  if (agents.length === 0) return <Empty text="Sin agentes participantes registrados." />;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {agents.map((a, i) => {
        const { Icon, tone } = agentIcon(a.icon);
        return (
          <div key={a.id ?? i} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", tone)} aria-hidden="true" />
              <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{a.name ?? "Agente"}</p>
              <Badge tone="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">Activo</Badge>
            </div>
            {a.role && <p className="mt-0.5 text-[10px] text-white/50">{a.role}</p>}
            {a.process_developed && <p className="mt-1.5 text-[10px] text-white/70"><span className="text-white/40">Proceso Desarrollado: </span>{a.process_developed}</p>}
            {a.purpose && <p className="mt-1 text-[10px] text-white/60"><span className="text-white/40">¿Para qué se desarrolló? (Propósito): </span>{a.purpose}</p>}
            {a.result && <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] text-white/55">{a.result}</p>}
          </div>
        );
      })}
    </div>
  );
}

function CompletadosTab({ r }: { r: ReportFull }) {
  const completed = r.completed_processes ?? [];
  const upcoming = r.upcoming_processes ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <p className={LABEL}>Completados ({completed.length})</p>
        {completed.length === 0 && <Empty text="Sin procesos completados en este ciclo." />}
        {completed.map((p, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[11px] font-medium text-white/85">{p.title ?? "Proceso"}</p>
            {p.category && <p className="text-[9.5px] text-white/45">{p.category}</p>}
            {p.purpose && <p className="mt-1 text-[10px] text-white/60">{p.purpose}</p>}
            <p className="mt-1 text-[10px] text-emerald-200/80">Resultado: {p.result ?? "—"}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className={LABEL}>Próximos ({upcoming.length})</p>
        {upcoming.length === 0 && <Empty text="Sin procesos próximos planificados." />}
        {upcoming.map((p, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-medium text-white/85">{p.title ?? "Proceso"}</p>
              <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[9px]", priorityTone(p.priority))}>Prioridad {(p.priority ?? "—").toUpperCase()}</span>
            </div>
            {p.reason && <p className="mt-1 text-[10px] text-white/60">{p.reason}</p>}
            <p className="mt-1 text-[10px] text-white/50">Agente Asignado: {p.assigned_agent ?? "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeltaTab({ r }: { r: ReportFull }) {
  const cols: { title: string; items: string[] }[] = [
    { title: "✨ Lo Nuevo", items: r.delta_changes?.new_elements ?? [] },
    { title: "✏️ Lo Modificado", items: r.delta_changes?.modified_elements ?? [] },
    { title: "⚡ Mejoras & Optimización", items: r.delta_changes?.improvements ?? [] },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cols.map((c) => (
        <div key={c.title} className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-medium text-white/85">{c.title}</p>
          {c.items.length === 0 ? <p className="mt-1.5 text-[10px] text-white/45">Sin elementos en esta categoría.</p> : (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] text-white/65">{c.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ComparativaTab({ r }: { r: ReportFull }) {
  const c = r.comparison_with_previous;
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-white/75">{c?.evolution_narrative ?? "Sin comparativa con la síntesis previa."}</p>
      {c?.has_previous && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Síntesis Anterior</p><p className="mt-0.5 text-[12px] font-semibold text-white/90">#{c.previous_synthesis_index ?? "?"}</p><p className="text-[9.5px] text-white/45">{c.previous_synthesis_date ?? ""}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Tiempo Transcurrido</p><p className="mt-0.5 text-[12px] font-semibold text-white/90">{c.minutes_elapsed ?? "?"} min</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"><p className={LABEL}>Delta de Procesos</p><p className="mt-0.5 text-[12px] font-semibold text-white/90">{c.metrics_delta?.completed_processes_diff ?? 0}</p></div>
        </div>
      )}
    </div>
  );
}

export default SynthesisReportModal;
