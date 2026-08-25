"use client";

/**
 * TARJETA DE PROCESO — catálogo de "Procesos Oníricos" de Imaginación Intuitiva.
 * ----------------------------------------------------------------------------
 * De `IntuitiveImaginationView.jsx` (spec §5): un `pt` (ProcessType) del
 * catálogo (`status.process_types_catalog || processTypes`, 100% responsabilidad
 * del backend — nombre/descripción/categoría/icono/color nunca se fijan aquí).
 * 3 variantes de contenedor según `pt.status`, badge de actividad, propuestas
 * acumuladas con auto-pausa, selector de 4 niveles de permiso, slider de
 * asignación de Tronco A y 4 acciones: Ramas & Logs, Ajustes, Pausar/Reanudar,
 * Disparar.
 *
 * El botón "Ajustes" abre aquí mismo un panel de detalle completo
 * (`fetchProcessDetails` / §1.6-§6 del original) — el original no le da un
 * componente propio, así que vive junto a la tarjeta que lo abre. El botón
 * "Ramas & Logs" monta `BranchesModal` (fichero aparte, spec §6.A).
 *
 * PROCEDENCIA DE LA ACTIVACIÓN (encargo aparte): el backend puede mandar,
 * por proceso, `generated_by` (ya usado en las ramas), `personality`,
 * `agents` y `memory_items` con su fuente real (mem0/documento/grafo). Toda
 * la lectura defensiva y el etiquetado honesto viven en
 * `./process-provenance` (sin JSX, testeado aparte); aquí solo se pinta.
 * `QuantumOrbAvatar` sustituye al icono genérico como avatar de personalidad
 * y agentes. Backend viejo que no manda estos campos ⇒ la tarjeta se ve
 * exactamente igual que antes (ver `hasProvenance` más abajo).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Compass, Code2, ExternalLink, GitBranch, Layers, Loader2, Moon, PauseCircle, Play, PlayCircle,
  Sliders as SlidersIcon, Sparkles, Wand2, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import {
  fetchAstraura158Process, triggerAstraura158Imagination, updateAstraura158ProcessConfig, updateAstraura158ProcessPolicy,
  type Astraura158Branch, type Astraura158ImaginationCreation, type Astraura158PermissionPolicy,
  type Astraura158ProcessType, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { Slider } from "@/components/ui/slider";
import { QuantumOrbAvatar } from "@/components/aurora/quantum-orb-avatar";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, Empty, LABEL, MONO, SELECT, useBusy } from "@/components/astraura/s158/shared";
import { BranchesModal } from "./branches-modal";
import {
  generatedByBadgeMeta, memoryOriginLabel, memorySourceMeta, participantLabel,
  processAgents, processGeneratedBy, processMemoryItems, processPersonality,
} from "./process-provenance";

const LAST_ACTIVATED_FALLBACK = "18/08/2026 13:45:00";

/** 6 iconos soportados por el original; el resto cae a `Sparkles` (spec §4). */
function getProcessIcon(iconName?: string): LucideIcon {
  switch (iconName) {
    case "Moon": return Moon;
    case "Sparkles": return Sparkles;
    case "Wand2": return Wand2;
    case "Code2": return Code2;
    case "Compass": return Compass;
    case "Layers": return Layers;
    default: return Sparkles;
  }
}

/** Los 3 estados del badge de actividad (spec §5, punto 2). */
function activityBadge(status?: string): { text: string; tone: string; ping?: boolean } {
  if (status === "running") return { text: "Ejecutando", tone: "border-purple-400/40 bg-purple-500/15 text-purple-100", ping: true };
  if (status === "paused") return { text: "Pausado", tone: "border-pink-400/40 bg-pink-500/15 text-pink-100" };
  return { text: "Activo", tone: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" };
}

/** Badge resumen de "Modo Permisos" — colapsa 4 niveles en 3 textos (spec §5, punto 6). */
function permissionBadgeText(level?: string): string {
  if (level === "autonomous_sovereign") return "⚡ Autónomo";
  if (level === "always_ask") return "🔒 Supervisado";
  return "✨ Auto-Seguro";
}

/** Las 4 opciones literales — mismo texto en la tarjeta y en el modal de detalle (spec §5.3, columna 1). */
const PERMISSION_OPTIONS_CARD: { id: string; label: string }[] = [
  { id: "auto_apply_safe", label: "Auto-Aceptar Seguras (Recomendado)" },
  { id: "auto_apply_minor", label: "Auto-Aceptar Leves & Docs" },
  { id: "always_ask", label: "Supervisión Total (Preguntar Siempre)" },
  { id: "autonomous_sovereign", label: "Autónomo Soberano (Auto-Aplicar Todo)" },
];

function containerClasses(status?: string): string {
  if (status === "running") return "bg-gradient-to-br from-[#1c113b] to-[#0b1222] border-purple-500/70 shadow-lg shadow-purple-950/40 text-white";
  if (status === "paused") return "bg-[#08090e] border-white/10 opacity-70 text-white/60";
  return "bg-[#0c0f18] border-white/10 text-white/90";
}

export interface ProcessCardProps {
  target: Astraura158Target;
  pt: Astraura158ProcessType;
  /** Semilla temática compartida con la cabecera y el modal Director (spec §3.1). */
  customTheme: string;
  /** `status?.max_proposals_per_agent_limit ?? 4` — vive en el estado central (spec §5, punto 5). */
  maxProposals: number;
  /** Refresca el estado central (`fetchImaginationStatus`) tras cualquier acción. */
  onReload: () => void | Promise<void>;
}

export function ProcessCard({ target, pt, customTheme, maxProposals, onReload }: ProcessCardProps) {
  const { busy, wrap } = useBusy();
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const Icon = getProcessIcon(pt.icon);
  const color = pt.color ?? "#a855f7";
  const activity = activityBadge(pt.status);
  const level = pt.permission_policy?.level;
  const pending = pt.pending_proposals_count ?? 0;
  const [resource, setResource] = useState(pt.allocated_resource_percent ?? 20);
  const isPaused = pt.status === "paused";

  // Procedencia de la última activación — cada lectura es `undefined` cuando
  // el backend no manda ese campo (compatibilidad con backends viejos); ver
  // `./process-provenance` para el porqué de cada distinción.
  const genBadge = generatedByBadgeMeta(processGeneratedBy(pt));
  const personality = processPersonality(pt);
  const agents = processAgents(pt);
  const memoryItems = processMemoryItems(pt);
  const hasProvenance = genBadge !== null || personality !== undefined || agents !== undefined || memoryItems !== undefined;
  // El avatar vivo "piensa" mientras el proceso corre de verdad (spec del
  // propio `QuantumOrbAvatar`: "'thinking' mientras ese agente procesa").
  const orbState = pt.status === "running" ? "thinking" : "idle";

  const handlePermission = (value: string) => {
    void wrap("permiso", async () => {
      const r = await updateAstraura158ProcessPolicy(target, pt.id, { level: value, notify_on_important: true });
      if (r.ok) { toast.success(`${pt.name}: modo de permisos actualizado`); await onReload(); }
      else toast.error(`${pt.name}: ${r.error}`);
    });
  };

  const handleResourceCommit = (value: number) => {
    if (value === (pt.allocated_resource_percent ?? 20)) return; // sin cambio real respecto al último valor conocido del backend
    void wrap("recurso", async () => {
      const r = await updateAstraura158ProcessConfig(target, pt.id, { allocated_resource_percent: value });
      if (r.ok) { toast.success(`${pt.name}: ${value}% de Tronco A`); await onReload(); }
      else toast.error(`${pt.name}: ${r.error}`);
    });
  };

  const handleToggleStatus = () => {
    const next = isPaused ? "active" : "paused";
    void wrap("estado", async () => {
      const r = await updateAstraura158ProcessConfig(target, pt.id, { status: next });
      if (r.ok) { toast.success(`${pt.name}: ${next === "paused" ? "pausado" : "reanudado"}`); await onReload(); }
      else toast.error(`${pt.name}: ${r.error}`);
    });
  };

  const handleTrigger = () => {
    void wrap("disparar", async () => {
      const r = await triggerAstraura158Imagination(target, { theme: customTheme.trim() || undefined, process_type: pt.id });
      if (!r.ok) { toast.error(`Disparo de ${pt.name}: ${r.error}`); return; }
      if (r.data.change_needed === false) toast.success("🔍 Verificación Completada: Estado ya óptimo (Sin cambios requeridos)");
      else if (r.data.scheduled && !r.data.branch) toast.success("🌌 Síntesis en curso", { description: "El ciclo se procesa en segundo plano; la rama llegará al terminar." });
      else toast.success(`🌌 Síntesis Forjada: ${r.data.branch?.process_name ?? pt.name}`);
      await onReload();
    });
  };

  return (
    <div className={cn("relative flex flex-col gap-2.5 rounded-xl border p-3 transition-colors", containerClasses(pt.status))}>
      <span className={cn("absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium", activity.tone)}>
        {activity.ping && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-300 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-200" /></span>}
        {activity.text}
      </span>

      <div className="flex items-start gap-2.5 pr-16">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border" style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color }}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{pt.name}</p>
          <p className="truncate text-[10px] text-white/50">{pt.category ?? "Proceso onírico"}</p>
        </div>
      </div>

      <p className="line-clamp-2 h-8 text-[11px] leading-snug text-white/60">{pt.description ?? "Sin descripción del backend."}</p>

      <p className={MONO}>Última Activación: <span className="text-white/70">{pt.last_activated_formatted ?? LAST_ACTIVATED_FALLBACK}</span></p>

      <p className={cn("text-[10px]", pt.is_auto_paused_by_limit ? "animate-pulse text-amber-300" : "text-cyan-300")}>
        Propuestas Acumuladas: {pending} / {maxProposals}{pt.is_auto_paused_by_limit ? " (Auto-Pausa)" : ""}
      </p>

      {hasProvenance && (
        <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className={LABEL}>Procedencia de la Última Activación:</span>
            {genBadge && <Badge tone={genBadge.tone}>{genBadge.label}</Badge>}
          </div>

          {personality !== undefined && (
            <div>
              <p className={LABEL}>Personalidad:</p>
              <div className="mt-1 flex items-center gap-1.5">
                <QuantumOrbAvatar personaId={personality.id} size={28} state={orbState} />
                <span className="truncate text-[10.5px] text-white/80">{participantLabel(personality, "Personalidad sin nombre del backend")}</span>
              </div>
            </div>
          )}

          {agents !== undefined && (
            <div>
              <p className={LABEL}>Agentes Participantes:</p>
              {agents.length === 0 ? (
                <p className="mt-1 text-[10px] text-white/40">Sin agentes registrados para esta activación.</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {agents.map((a, i) => (
                    <span key={a.id ?? i} className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] py-0.5 pl-0.5 pr-2">
                      <QuantumOrbAvatar personaId={a.id} size={28} state={orbState} />
                      <span className="max-w-[88px] truncate text-[9.5px] text-white/70">{participantLabel(a, "Agente sin nombre")}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {memoryItems !== undefined && (
            <div>
              <p className={LABEL}>Memoria Real Consultada:</p>
              {memoryItems.length === 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-200/85">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" /> Sin memoria real: esta activación no se apoyó en ningún recuerdo.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {memoryItems.slice(0, 4).map((m, i) => {
                    const src = memorySourceMeta(m.source);
                    const origin = memoryOriginLabel(m);
                    return (
                      <li key={m.id ?? i} className="flex items-start gap-1.5">
                        <Badge tone={src.tone} className="mt-px shrink-0">{src.label}</Badge>
                        <span className="min-w-0 truncate text-[10px] text-white/60">
                          {m.title ?? m.content ?? "Ítem de memoria sin título"}{origin ? ` · ${origin}` : ""}
                        </span>
                      </li>
                    );
                  })}
                  {memoryItems.length > 4 && <li className="text-[9px] text-white/35">+{memoryItems.length - 4} más</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Modo Permisos:</span>
          <Badge tone="border-white/15 bg-white/[0.04] text-white/75">{permissionBadgeText(level)}</Badge>
        </div>
        <select
          className={cn(SELECT, "mt-1 w-full py-1")}
          value={PERMISSION_OPTIONS_CARD.some((o) => o.id === level) ? level : "always_ask"}
          disabled={busy !== ""}
          aria-label={`Nivel de permisos de ${pt.name}`}
          onChange={(e) => handlePermission(e.target.value)}
        >
          {PERMISSION_OPTIONS_CARD.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <p className={LABEL}>Asignación Tronco A: {resource}%</p>
        <Slider
          className="mt-2"
          min={5} max={40} step={5}
          value={[resource]}
          disabled={busy !== ""}
          onValueChange={([v]) => setResource(v)}
          onValueCommit={([v]) => handleResourceCommit(v)}
          aria-label={`Asignación de Tronco A de ${pt.name}`}
        />
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <button type="button" className={BTN} disabled={busy !== ""} title="Ver Ramas y Procesos Completados & En Curso" aria-label={`Ramas y logs de ${pt.name}`} onClick={() => setBranchesOpen(true)}>
          <GitBranch className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Ramas &amp; Logs
        </button>
        <button
          type="button" className={BTN} disabled={busy !== ""} title="Abrir ventana completa de ajustes y opciones" aria-label={`Ajustes de ${pt.name}`}
          onClick={() => setSettingsOpen(true)}
        >
          <SlidersIcon className="h-3.5 w-3.5 text-purple-300" aria-hidden="true" /> Ajustes <ExternalLink className="h-3 w-3 text-purple-300/70" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className={BTN} disabled={busy !== ""} aria-label={`${isPaused ? "Reanudar" : "Pausar"} ${pt.name}`} onClick={handleToggleStatus}>
          <BusyIcon busy={busy === "estado"} icon={isPaused ? PlayCircle : PauseCircle} /> {isPaused ? "Reanudar" : "Pausar"}
        </button>
        <button type="button" className={cn(BTN_PRIMARY, "justify-center bg-purple-500/20 border-purple-400/50")} disabled={busy !== ""} aria-label={`Disparar ${pt.name}`} onClick={handleTrigger}>
          <BusyIcon busy={busy === "disparar"} icon={Play} /> Disparar
        </button>
      </div>

      {branchesOpen && (
        <BranchesModal target={target} processId={pt.id} processName={pt.name} processColor={color} open={branchesOpen} onClose={() => setBranchesOpen(false)} />
      )}
      {settingsOpen && (
        <ProcessSettingsModal
          target={target} pt={pt} color={color} onClose={() => setSettingsOpen(false)}
          onReload={onReload}
          onOpenBranches={() => { setSettingsOpen(false); setBranchesOpen(true); }}
        />
      )}
    </div>
  );
}

/* ── "Ajustes": modal de detalle completo de un proceso (spec §1.6 / §6) ──── */

interface ProcessSettingsModalProps {
  target: Astraura158Target;
  pt: Astraura158ProcessType;
  color: string;
  onClose: () => void;
  onReload: () => void | Promise<void>;
  onOpenBranches: () => void;
}

/** Forma exacta de la respuesta de `fetchAstraura158Process` (ver `astraura-158-client.ts`). */
interface ProcessDetail {
  success?: boolean;
  process?: Astraura158ProcessType;
  metadata?: Record<string, unknown>;
  progress_percent?: number;
  permission_policy?: Astraura158PermissionPolicy;
  branches?: Astraura158Branch[];
  creations?: Astraura158ImaginationCreation[];
  history?: unknown[];
}

function ProcessSettingsModal({ target, pt, color, onClose, onReload, onOpenBranches }: ProcessSettingsModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const { busy, wrap } = useBusy();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchAstraura158Process(target, pt.id);
    if (r.ok) { setDetail(r.data); setError(""); } else { setError(r.error); }
    setLoading(false);
  }, [target, pt.id]);

  useEffect(() => { void load(); }, [load]);
  useModalA11y({ open: true, onClose, containerRef });

  const level = detail?.permission_policy?.level ?? pt.permission_policy?.level;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Ajustes de ${pt.name}`}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0d14] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border" style={{ backgroundColor: `${color}15`, borderColor: `${color}40`, color }}>
            <SlidersIcon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white/90">Ajustes · {pt.name}</p>
            <p className="truncate text-[10px] text-white/50">{pt.category ?? "Proceso onírico"}</p>
          </div>
          <button type="button" className={BTN} aria-label="Cerrar ajustes" onClick={onClose}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && <p className="flex items-center gap-1.5 text-[11px] text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Leyendo detalle del proceso…</p>}
          {!loading && error && <Empty error={error} text="Sin conexión con el backend." />}
          {!loading && !error && (
            <div className="space-y-3">
              <p className="text-[11px] leading-snug text-white/65">{detail?.process?.description ?? pt.description ?? "Sin descripción del backend."}</p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"><p className={LABEL}>Progreso</p><Bar value={detail?.progress_percent} className="mt-1.5" /></div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"><p className={LABEL}>Ramas / Creaciones</p><p className="mt-0.5 text-[12px] font-semibold text-white/85">{detail?.branches?.length ?? 0} / {detail?.creations?.length ?? 0}</p></div>
              </div>
              <div>
                <p className={LABEL}>Modo Permisos</p>
                <select
                  className={cn(SELECT, "mt-1 w-full py-1")}
                  value={PERMISSION_OPTIONS_CARD.some((o) => o.id === level) ? level : "always_ask"}
                  disabled={busy !== ""}
                  aria-label={`Nivel de permisos de ${pt.name} (detalle)`}
                  onChange={(e) => {
                    const value = e.target.value;
                    void wrap("permiso", async () => {
                      const r = await updateAstraura158ProcessPolicy(target, pt.id, { level: value, notify_on_important: true });
                      if (r.ok) { toast.success(`${pt.name}: modo de permisos actualizado`); await load(); await onReload(); }
                      else toast.error(`${pt.name}: ${r.error}`);
                    });
                  }}
                >
                  {PERMISSION_OPTIONS_CARD.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <p className={LABEL}>Asignación Tronco A: {detail?.process?.allocated_resource_percent ?? pt.allocated_resource_percent ?? 20}%</p>
                <Slider
                  className="mt-2"
                  min={5} max={40} step={5}
                  defaultValue={[detail?.process?.allocated_resource_percent ?? pt.allocated_resource_percent ?? 20]}
                  disabled={busy !== ""}
                  onValueCommit={([v]) => {
                    void wrap("recurso", async () => {
                      const r = await updateAstraura158ProcessConfig(target, pt.id, { allocated_resource_percent: v });
                      if (r.ok) { toast.success(`${pt.name}: ${v}% de Tronco A`); await load(); await onReload(); }
                      else toast.error(`${pt.name}: ${r.error}`);
                    });
                  }}
                  aria-label={`Asignación de Tronco A de ${pt.name} (detalle)`}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" className={BTN} aria-label={`Ver ramas y logs de ${pt.name}`} onClick={onOpenBranches}><GitBranch className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Ramas &amp; Logs</button>
          <button type="button" className={BTN} aria-label="Cerrar ajustes" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default ProcessCard;
