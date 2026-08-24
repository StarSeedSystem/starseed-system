"use client";

/**
 * IMAGINACIÓN INTUITIVA (ALWAYS-ON) — visor raíz.
 * ----------------------------------------------------------------------------
 * Reconstrucción con paridad funcional de `IntuitiveImaginationView.jsx`
 * (spec técnica en `/tmp/imagination-spec.md`, 2870 líneas del original).
 * Monta: cabecera con controles maestros, Gobernador de Recursos, barra de
 * 5 sub-pestañas y sus contenidos, y los modales que cuelgan de esta vista
 * (Director, Informe de Síntesis, Aplicación Sincronizada, Ramas & Logs por
 * tarjeta, Editar propuesta/creación).
 *
 * Destino/manifiesto: `useAstraura158Host()` (ya resuelve local vs. nube y
 * expone el estado «sin conexión» honesto vía `S158EndpointStrip`). Todo lo
 * demás sale ÚNICAMENTE de `astraura-158-client.ts` — si el backend no
 * responde, se explica el motivo; nunca se rellena con datos inventados.
 *
 * Sondeo global: 5 s (`fetchImaginationStatus`, tipos de proceso si el status
 * no los trae embebidos, tronco dual, agentes de la bóveda, Director),
 * pausado si `document.hidden` (spec §10). El enjambre (`swarm/status`) y el
 * orquestador de autorizaciones se piden solo mientras la pestaña que los usa
 * está visible, para no sondear datos que nadie ve.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain, CheckCheck, Clock, Cpu, Crown, Flame, FileText, GitBranch, Loader2, Moon, Pencil,
  Play, Recycle, Shield, Sliders, Sparkles, Trash2, Users, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/hooks/use-modal-a11y";
// Adenda 137: los diálogos nativos del navegador (confirm/prompt) son
// inaccesibles y rompen el lenguaje visual del OS. Aquí se usan los del OS.
import { usePrompt } from "@/components/ui/confirm-dialog";
import { S158EndpointStrip, useAstraura158Host } from "@/components/astraura/s158-host";
import {
  applyAllAstraura158Proposals, fetchAstraura158AuthOrchestrator, fetchAstraura158Director, fetchAstraura158DualTrunk,
  fetchAstraura158ImaginationStatus, fetchAstraura158ProcessTypes, fetchAstraura158VaultAgents, grantAllAstraura158Requests,
  grantAstraura158Request, imaginationAstraura158Action, recycleAstraura158Imagination, setAstraura158AuthOrchestratorAuto,
  setAstraura158Location, triggerAstraura158Imagination, updateAstraura158ImaginationConfig, updateAstraura158ProcessPolicy,
  type Astraura158AuthOrchestrator, type Astraura158Branch, type Astraura158DirectorStatus, type Astraura158DualTrunk,
  type Astraura158ImaginationCreation, type Astraura158ImaginationStatus, type Astraura158ProcessType, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, Empty, INPUT, LABEL, MONO, SELECT, TEXTAREA, useBusy,
} from "@/components/astraura/s158/shared";
import { ResourceGovernor, DUAL_TRUNK_FALLBACK } from "./resource-governor";
import { ProcessCard } from "./process-card";
import { AgentsImaginationPanel, type Astraura158AgentFull } from "./agents-imagination-panel";
import { DirectorModal, directorModeBadge } from "./director-modal";
import { SyncModal } from "./sync-modal";
import { SynthesisReportModal } from "./synthesis-report-modal";

const LOCATION_STORAGE_KEY = "astraura_calibrated_location";
const HEADER_PROCESS_ID = "rem_synaptic_consolidation";

type SubTabId = "processes" | "agents_imagination" | "branches" | "creations" | "config";

/** `environment_context` no está tipado en `Astraura158ImaginationStatus`; se lee de forma defensiva (spec §1.2.4). */
type StatusWithEnv = Astraura158ImaginationStatus & { environment_context?: { location?: { city?: string; country?: string } } };

function getImportanceBadge(level?: string): { text: string; tone: string } {
  if (level === "critical_security") return { text: "🛡️ Seguridad Crítica", tone: "border-rose-400/30 bg-rose-500/10 text-rose-200" };
  if (level === "high") return { text: "⚡ Alto Impacto (Código)", tone: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
  if (level === "medium") return { text: "🔮 Medio (Memoria/UI)", tone: "border-purple-400/30 bg-purple-500/10 text-purple-200" };
  return { text: "✨ Leve (Optimización)", tone: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200" };
}

/** Los 4 niveles, variante "Config Global → por proceso" (spec §5.3, columna 3). */
const CONFIG_PERMISSION_OPTIONS: { id: string; label: string }[] = [
  { id: "auto_apply_safe", label: "🟢 Auto-Aplicar Seguro (Pregunta Cambios Críticos)" },
  { id: "auto_apply_minor", label: "🟡 Auto-Aplicar Menor (Solo Docs/Notas)" },
  { id: "always_ask", label: "🟠 Supervisión Total (Preguntar Siempre)" },
  { id: "autonomous_sovereign", label: "🟣 Autónomo Soberano (Auto-Aplicar Todo)" },
];

interface EditModalState {
  kind: "branch" | "creation";
  id: string;
  theme: string;
  hypothesis: string;
  title: string;
  content: string;
}

export function ImaginacionView() {
  const host = useAstraura158Host(0);
  const { target } = host;

  const [status, setStatus] = useState<Astraura158ImaginationStatus | null>(null);
  const [processTypesFallback, setProcessTypesFallback] = useState<Astraura158ProcessType[]>([]);
  const [dualTrunk, setDualTrunk] = useState<Astraura158DualTrunk>(DUAL_TRUNK_FALLBACK);
  const [agents, setAgents] = useState<Astraura158AgentFull[]>([]);
  const [director, setDirector] = useState<Astraura158DirectorStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeSubTab, setActiveSubTab] = useState<SubTabId>("processes");
  const [customTheme, setCustomTheme] = useState("");
  const [showAllBranches, setShowAllBranches] = useState(false);

  const [directorModalOpen, setDirectorModalOpen] = useState(false);
  const [synthesisModalOpen, setSynthesisModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [editModal, setEditModal] = useState<EditModalState | null>(null);

  const promptDialog = usePrompt();
  const [calibratedLocation, setCalibratedLocation] = useState<{ city: string; country: string } | null>(null);
  const [countdown, setCountdown] = useState("05:00");

  const { busy: headerBusy, wrap: wrapHeader } = useBusy();

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [statusR, typesR, trunkR, agentsR, directorR] = await Promise.all([
      fetchAstraura158ImaginationStatus(target),
      fetchAstraura158ProcessTypes(target),
      fetchAstraura158DualTrunk(target),
      fetchAstraura158VaultAgents(target),
      fetchAstraura158Director(target),
    ]);
    if (statusR.ok) {
      setStatus(statusR.data);
      // `sData.dual_trunk` tiene prioridad porque se aplica DESPUÉS en el `loadData` original (spec §2).
      if (statusR.data.dual_trunk) setDualTrunk(statusR.data.dual_trunk);
      else if (trunkR.ok) setDualTrunk(trunkR.data);
    } else if (trunkR.ok) {
      setDualTrunk(trunkR.data);
    }
    if (typesR.ok) setProcessTypesFallback(typesR.data.process_types ?? []);
    if (agentsR.ok) setAgents(agentsR.data.agents ?? []);
    if (directorR.ok) setDirector(directorR.data);
    if (!silent) setLoading(false);
  }, [target]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Poll global cada 5s, pausado si la pestaña del navegador está oculta (spec §10).
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void loadData(true); }, 5000);
    return () => window.clearInterval(id);
  }, [loadData]);

  // Countdown de cabecera: SOLO se sobrescribe con lo que llega del poll (spec §1.2.1 — nunca hay timer propio).
  useEffect(() => { if (status?.next_cycle_formatted) setCountdown(status.next_cycle_formatted); }, [status?.next_cycle_formatted]);

  useEffect(() => {
    try { const raw = localStorage.getItem(LOCATION_STORAGE_KEY); if (raw) setCalibratedLocation(JSON.parse(raw) as { city: string; country: string }); } catch { /* */ }
  }, []);

  const types = useMemo(() => status?.process_types_catalog ?? processTypesFallback, [status?.process_types_catalog, processTypesFallback]);
  const branches = status?.branches ?? [];
  const creations = status?.creations ?? [];
  const pendingBranches = useMemo(() => branches.filter((b) => b.status === "pending_approval" || b.requires_user_approval), [branches]);
  const maxProposals = status?.max_proposals_per_agent_limit ?? 4;

  const envLocation = (status as StatusWithEnv | null)?.environment_context?.location;
  const locationLabel = calibratedLocation?.city
    ? `📍 ${calibratedLocation.city}, ${calibratedLocation.country} (Calibrar)`
    : envLocation?.city ? `📍 ${envLocation.city}, ${envLocation.country ?? ""} (Calibrar)` : "Calibrar Ubicación";

  /* ── Acciones de cabecera ─────────────────────────────────────────────── */

  /**
   * Calibrar ubicación del Sensorium. Ola 6 · Adenda 158: usa los diálogos
   * accesibles del OS (`usePrompt`, Adenda 137) en vez de `window.prompt`, y
   * escribe la ubicación EN EL BACKEND soberano (`setAstraura158Location`), no
   * solo en localStorage — que se conserva como caché para pintar la etiqueta
   * antes de que responda el backend.
   */
  const handleCalibrateLocation = () => {
    void (async () => {
      const city = await promptDialog({
        title: "Calibrar ubicación del Sensorium",
        description: "La usa el sistema para el clima, la hora local y el contexto ambiental de la neurona.",
        label: "Ciudad",
        defaultValue: calibratedLocation?.city ?? envLocation?.city ?? "",
        placeholder: "Cuernavaca",
        validate: (v) => (v.trim() ? null : "Escribe una ciudad."),
      });
      if (city === null || !city.trim()) return;
      const country = await promptDialog({
        title: "Calibrar ubicación del Sensorium",
        label: "País",
        defaultValue: calibratedLocation?.country ?? envLocation?.country ?? "",
        placeholder: "México",
      });
      if (country === null) return;
      const loc = { city: city.trim(), country: country.trim() };
      setCalibratedLocation(loc);
      try { localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc)); } catch { /* */ }
      const r = await setAstraura158Location(target, { city: loc.city, country: loc.country, source: "manual" });
      if (r.ok) { toast.success(`Ubicación calibrada: ${loc.city}${loc.country ? `, ${loc.country}` : ""}`); await loadData(true); }
      else toast.warning("Guardada solo en este dispositivo", { description: `El backend soberano no la aceptó: ${r.error}` });
    })();
  };

  const handleToggleAlwaysOn = () => {
    void wrapHeader("always-on", async () => {
      const r = await updateAstraura158ImaginationConfig(target, { is_always_on: !status?.is_always_on });
      if (r.ok) { toast.success(`Always-On: ${!status?.is_always_on ? "ACTIVO" : "PAUSADO"}`); await loadData(true); } else toast.error(`Always-On: ${r.error}`);
    });
  };

  const handleTriggerCycle = (procType?: string) => {
    const pType = procType ?? HEADER_PROCESS_ID; // la cabecera SIEMPRE dispara este id fijo (spec §1.2.6)
    void wrapHeader("disparar", async () => {
      const r = await triggerAstraura158Imagination(target, { theme: customTheme.trim() || undefined, process_type: pType });
      if (!r.ok) { toast.error(`Disparar síntesis: ${r.error}`); return; }
      if (r.data.change_needed === false) toast.success("🔍 Verificación Completada: Estado ya óptimo (Sin cambios requeridos)");
      else if (r.data.scheduled && !r.data.branch) toast.success("🌌 Síntesis en curso", { description: "El ciclo se procesa en segundo plano; la rama llegará al terminar." });
      else toast.success(`🌌 Síntesis Forjada: ${r.data.branch?.process_name ?? types.find((t) => t.id === pType)?.name ?? pType}`);
      await loadData(true);
    });
  };

  const handleApplyAll = () => {
    setSyncModalOpen(true);
    void applyAllAstraura158Proposals(target).then((r) => {
      if (!r.ok) toast.error(`Aplicar todas: ${r.error}`);
      void loadData(true);
    });
  };

  const handleGrantAllRequests = () => {
    void wrapHeader("grant-all", async () => {
      const r = await grantAllAstraura158Requests(target);
      if (r.ok) { toast.success(`✅ ¡${r.data.granted_count ?? pendingBranches.length} solicitudes autorizadas y aplicadas en segundo plano!`); await loadData(true); }
      else toast.error(`Conceder permisos: ${r.error}`);
    });
  };

  const handleRecycle = () => {
    void wrapHeader("recycle", async () => {
      const r = await recycleAstraura158Imagination(target);
      if (r.ok) {
        const n = r.data.recycle?.items_compacted ?? 1;
        const kb = r.data.recycle?.space_freed_kb ?? 2.4;
        toast.success(`♻️ ${n} memorias compactadas (+${kb} KB libres)`);
        await loadData(true);
      } else toast.error(`Reciclar: ${r.error}`);
    });
  };

  const handleAction = (id: string, kind: "branch" | "creation", action: "apply" | "discard", themeOrTitle: string) => {
    void wrapHeader(`${action}:${id}`, async () => {
      const r = await imaginationAstraura158Action(target, id, kind, action);
      if (!r.ok) { toast.error(`${action === "apply" ? "Aplicar" : "Descartar"}: ${r.error}`); return; }
      if (action === "apply") toast.success(`✅ Aplicado en Exocórtex: ${themeOrTitle}`);
      else toast.success("🗑️ Elemento descartado");
      await loadData(true);
    });
  };

  const openEditModal = (item: Astraura158Branch | Astraura158ImaginationCreation, kind: "branch" | "creation") => {
    if (kind === "branch") {
      const b = item as Astraura158Branch;
      setEditModal({ kind, id: b.id, theme: b.theme ?? "", hypothesis: b.hypothesis ?? "", title: "", content: "" });
    } else {
      const c = item as Astraura158ImaginationCreation;
      setEditModal({ kind, id: c.id, theme: "", hypothesis: "", title: c.title ?? "", content: c.content ?? "" });
    }
  };

  const saveEditModal = () => {
    if (!editModal) return;
    const data = editModal.kind === "branch" ? { theme: editModal.theme, hypothesis: editModal.hypothesis } : { title: editModal.title, content: editModal.content };
    void wrapHeader("edit", async () => {
      const r = await imaginationAstraura158Action(target, editModal.id, editModal.kind, "edit", data);
      if (r.ok) { toast.success("✏️ Elemento actualizado"); setEditModal(null); await loadData(true); } else toast.error(`Editar: ${r.error}`);
    });
  };

  const cores = status?.allocated_cores ?? dualTrunk.imagination_cores ?? 2;
  const corePct = dualTrunk.imagination_global_percent ?? 25;
  const entropy = status?.quantum_entropy_level ?? 0.75;
  const alwaysOn = !!status?.is_always_on;

  if (loading && !status) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 className="h-8 w-8 animate-spin text-purple-300" aria-hidden="true" />
        <p className="text-[13px]">Sincronizando Sistema de Imaginación Intuitiva 1.58-Bit...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <S158EndpointStrip state={host} />

      {/* Cabecera */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-[#120d29] via-[#0d162a] to-[#091120] p-4">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-purple-600/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500">
                <Brain className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[16px] font-semibold text-white">Imaginación Intuitiva // StarSeed 1.58b</h1>
                <p className="truncate text-[11px] text-white/55">Gobernanza de Auto-Aceptación con Permisos Graduales &amp; Sincronización Multi-Agente</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button type="button" className={BTN} aria-label="Abrir Supervisor Orquestador Director" onClick={() => setDirectorModalOpen(true)}>
                <Crown className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" /> 👑 Supervisor Orquestador Director
              </button>
              {director?.config && <Badge tone="border-amber-400/30 bg-amber-500/10 text-amber-200">{directorModeBadge(director.config)}</Badge>}

              <button
                type="button" className={BTN} aria-label="Abrir Informe de Síntesis del Usuario"
                title="Abrir Informe de Síntesis del Usuario & Historial de Procesos Completados y Próximos"
                onClick={() => setSynthesisModalOpen(true)}
              >
                <FileText className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" /> 📜 Informe de Síntesis del Usuario
              </button>

              <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/75"><Cpu className="h-3.5 w-3.5 text-white/50" aria-hidden="true" /> M1 8-Cores // {cores} Asignados ({corePct}%)</span>

              <button type="button" className={BTN} aria-label="Calibrar ubicación" onClick={handleCalibrateLocation}>{locationLabel}</button>

              <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/75"><Flame className="h-3.5 w-3.5 text-orange-300" aria-hidden="true" /> Entropía: {entropy}</span>

              <button
                type="button" className={BTN} aria-label="Acceso Universal al Dispositivo"
                onClick={() => toast.message("Módulo de Acceso Universal al Dispositivo no incluido en esta reconstrucción")}
              >
                <Shield className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> 🛡️ Acceso Universal al Dispositivo
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 xl:items-end">
            <p className="flex items-center gap-1.5 text-[11px] text-white/60"><Clock className="h-3.5 w-3.5 animate-spin text-cyan-300" aria-hidden="true" /> Próxima Síntesis: <span className="font-code text-white/85">{countdown}</span></p>
            <button
              type="button"
              className={cn(BTN, alwaysOn ? "border-emerald-400/40 text-emerald-200" : "")}
              disabled={headerBusy !== ""} aria-pressed={alwaysOn} aria-label="Alternar Always-On"
              onClick={handleToggleAlwaysOn}
            >
              <BusyIcon busy={headerBusy === "always-on"} icon={alwaysOn ? CheckCheck : Moon} />
              {alwaysOn ? `Always-On: ACTIVO (${status?.active_agents_count ?? 6} Agentes • ${status?.active_processes_count ?? 6} Procesos)` : "Always-On: PAUSADO"}
            </button>
            <button type="button" className={cn(BTN_PRIMARY, "bg-purple-500/20 border-purple-400/50")} disabled={headerBusy !== ""} aria-label="Disparar síntesis" onClick={() => handleTriggerCycle()}>
              <BusyIcon busy={headerBusy === "disparar"} icon={Play} /> {headerBusy === "disparar" ? "Generando..." : "Disparar Síntesis"}
            </button>
          </div>
        </div>
      </div>

      {/* Gobernador de Recursos */}
      <ResourceGovernor target={target} trunk={dualTrunk} onChanged={setDualTrunk} onReload={() => loadData(true)} />

      {/* Sub-pestañas */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1.5">
        {([
          ["processes", "Procesos Oníricos & Niveladores", Moon, undefined],
          ["agents_imagination", "🧠 Agentes & Imaginación en 2do Plano", Users, agents.length],
          ["branches", "Ramas & Propuestas (Control)", GitBranch, branches.length],
          ["creations", "Creaciones Proactivas", Wand2, creations.length],
          ["config", "Permisos & Configuración Global", Sliders, undefined],
        ] as const).map(([id, label, Icon, count]) => (
          <button
            key={id} type="button"
            className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors", activeSubTab === id ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80")}
            onClick={() => setActiveSubTab(id)} aria-current={activeSubTab === id}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
            {count !== undefined && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px]">{count}</span>}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {activeSubTab === "processes" && (
        <div className="space-y-3">
          <div>
            <p className="text-[13px] font-semibold text-white/90">Catálogo de Procesos de Imaginación Intuitiva // Troncos de Ramas</p>
            <p className="mt-0.5 text-[11px] text-white/55">Cada proceso cuenta con permisos graduales, sliders de recursos y ventana completa.</p>
            <input className={cn(INPUT, "mt-2 w-full max-w-sm")} value={customTheme} onChange={(e) => setCustomTheme(e.target.value)} placeholder="Semilla temática (opcional)..." aria-label="Semilla temática para el próximo ciclo" />
          </div>
          {types.length === 0 && <Empty loading={loading} text="El backend no expone el catálogo de procesos." />}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {types.map((pt) => <ProcessCard key={pt.id} target={target} pt={pt} customTheme={customTheme} maxProposals={maxProposals} onReload={() => loadData(true)} />)}
          </div>
        </div>
      )}

      {activeSubTab === "agents_imagination" && <AgentsImaginationPanel target={target} agents={agents} onReload={() => loadData(true)} />}

      {activeSubTab === "branches" && (
        <BranchesControlTab
          target={target} status={status} pendingBranches={pendingBranches} branches={branches} showAll={showAllBranches} setShowAll={setShowAllBranches}
          busy={headerBusy} onGrantAll={handleGrantAllRequests} onGrantSingle={(id) => void wrapHeader(`grant:${id}`, async () => { const r = await grantAstraura158Request(target, id); if (r.ok) { toast.success("Permiso concedido"); await loadData(true); } else toast.error(`Conceder: ${r.error}`); })}
          onApply={(b) => handleAction(b.id, "branch", "apply", b.theme ?? b.id)}
          onDiscard={(b) => handleAction(b.id, "branch", "discard", b.theme ?? b.id)}
          onEdit={(b) => openEditModal(b, "branch")}
        />
      )}

      {activeSubTab === "creations" && (
        <CreationsTab
          creations={creations} busy={headerBusy} onApplyAll={handleApplyAll}
          onApply={(c) => handleAction(c.id, "creation", "apply", c.title ?? c.id)}
          onDiscard={(c) => handleAction(c.id, "creation", "discard", c.title ?? c.id)}
          onEdit={(c) => openEditModal(c, "creation")}
        />
      )}

      {activeSubTab === "config" && (
        <ConfigTab target={target} status={status} types={types} onRecycle={handleRecycle} recycling={headerBusy === "recycle"} onReload={() => loadData(true)} />
      )}

      {/* Modales */}
      <DirectorModal target={target} open={directorModalOpen} onClose={() => setDirectorModalOpen(false)} director={director} onReload={() => loadData(true)} />
      <SynthesisReportModal target={target} open={synthesisModalOpen} onClose={() => setSynthesisModalOpen(false)} />
      <SyncModal target={target} open={syncModalOpen} onClose={() => setSyncModalOpen(false)} onOpenSynthesis={() => { setSyncModalOpen(false); setSynthesisModalOpen(true); }} />

      {editModal && (
        <EditProposalModal
          state={editModal} busy={headerBusy === "edit"}
          onChange={setEditModal} onClose={() => setEditModal(null)} onSave={saveEditModal}
        />
      )}
    </div>
  );
}

/* ── Pestaña "Ramas & Propuestas (Control)" ────────────────────────────────── */

function BranchesControlTab({ target, status, pendingBranches, branches, showAll, setShowAll, busy, onGrantAll, onGrantSingle, onApply, onDiscard, onEdit }: {
  target: Astraura158Target;
  status: Astraura158ImaginationStatus | null;
  pendingBranches: Astraura158Branch[];
  branches: Astraura158Branch[];
  showAll: boolean; setShowAll: (v: boolean) => void;
  busy: string;
  onGrantAll: () => void; onGrantSingle: (id: string) => void;
  onApply: (b: Astraura158Branch) => void; onDiscard: (b: Astraura158Branch) => void; onEdit: (b: Astraura158Branch) => void;
}) {
  const shown = showAll ? branches : branches.slice(0, 12);
  return (
    <div className="space-y-3">
      {status?.is_paused_due_to_threshold && (
        <div className="animate-pulse rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-100">
          🛑 Procesos de Imaginación Detenidos Preventivamente: Se alcanzó el límite de solicitudes acumuladas ({pendingBranches.length}/{status?.max_accumulated_requests_threshold ?? "?"}). Autoriza o descarta propuestas para que el motor reanude sus ciclos automáticamente.
        </div>
      )}

      {pendingBranches.length > 0 && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-amber-100">⚠️ Solicitudes de Autorización Pendientes ({pendingBranches.length})</p>
            <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Conceder permisos y aplicar todas" onClick={onGrantAll}>
              <BusyIcon busy={busy === "grant-all"} icon={CheckCheck} /> ✅ Conceder Permisos &amp; Aplicar Todas
            </button>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {pendingBranches.map((b) => {
              const imp = getImportanceBadge(b.importance_level);
              return (
                <div key={b.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{b.theme ?? b.id}</p>
                    <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", imp.tone)}>{imp.text}</span>
                  </div>
                  {b.hypothesis && <p className="mt-1 line-clamp-2 text-[10px] text-white/60">{b.hypothesis}</p>}
                  <p className={cn(MONO, "mt-1")}>{b.formatted_time ?? ""}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label={`Conceder permiso a ${b.theme ?? b.id}`} onClick={() => onGrantSingle(b.id)}>Conceder Permiso</button>
                    <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Editar ${b.theme ?? b.id}`} onClick={() => onEdit(b)}><Pencil className="h-3 w-3" aria-hidden="true" /></button>
                    <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Descartar ${b.theme ?? b.id}`} onClick={() => onDiscard(b)}><Trash2 className="h-3 w-3" aria-hidden="true" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AuthOrchestratorPanel target={target} active={true} />

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-white/85">Todas las ramas ({branches.length})</p>
          {branches.length > 12 && <button type="button" className={BTN} onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos" : "Ver todas"}</button>}
        </div>
        {branches.length === 0 && <Empty text="Aún no hay ramas: dispara un ciclo desde la pestaña de Procesos." />}
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {shown.map((b) => {
            const imp = getImportanceBadge(b.importance_level);
            const applied = /applied|done|completed/i.test(String(b.status ?? ""));
            return (
              <div key={b.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{b.theme ?? b.id}</p>
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", imp.tone)}>{imp.text}</span>
                </div>
                <p className={cn(MONO, "mt-1")}>{b.formatted_time ?? ""} · {b.status ?? "—"}</p>
                {applied && (
                  <div className="mt-1.5 flex gap-1">
                    <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Editar ${b.theme ?? b.id}`} onClick={() => onEdit(b)}><Pencil className="h-3 w-3" aria-hidden="true" /></button>
                  </div>
                )}
                {!applied && !b.requires_user_approval && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label={`Aplicar ${b.theme ?? b.id}`} onClick={() => onApply(b)}>Aplicar</button>
                    <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Editar ${b.theme ?? b.id}`} onClick={() => onEdit(b)}><Pencil className="h-3 w-3" aria-hidden="true" /></button>
                    <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Descartar ${b.theme ?? b.id}`} onClick={() => onDiscard(b)}><Trash2 className="h-3 w-3" aria-hidden="true" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** "Agente de Orquestación Inteligente de Autorizaciones" (spec §7.3, `[INFERIDO-CRUZADO]` de `NotificationsLogsView.jsx`). */
function AuthOrchestratorPanel({ target, active }: { target: Astraura158Target; active: boolean }) {
  const [data, setData] = useState<Astraura158AuthOrchestrator | null>(null);
  const [error, setError] = useState("");
  const { busy, wrap } = useBusy();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => { const r = await fetchAstraura158AuthOrchestrator(target); if (!alive) return; if (r.ok) { setData(r.data); setError(""); } else setError(r.error); };
    void load();
    const id = window.setInterval(() => { void load(); }, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [target, active]);

  const draining = data?.draining_mode ?? false;
  const embargoed = data?.requests_embargoed ?? false;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-white/85">Agente de Orquestación Inteligente de Autorizaciones</p>
        {!data && !error && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" aria-hidden="true" />}
      </div>
      {error && <Empty error={error} text="Sin conexión con el backend." />}
      {data && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={data.is_busy ? "border-purple-400/30 bg-purple-500/10 text-purple-200" : "border-white/15 bg-white/[0.04] text-white/60"}>{data.is_busy ? "⚡ Procesando" : "💤 En espera"}</Badge>
            <Badge tone={draining ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}>
              {draining ? `🌊 MODO DRENAJE (cola > ${data.max_balanced_queue ?? 20})` : "⚖️ EQUILIBRADO (imaginando)"}
            </Badge>
            {embargoed && <Badge tone="border-rose-400/30 bg-rose-500/10 text-rose-200">🚫 Solicitudes en EMBarGO: agentes priorizan completar pendientes</Badge>}
            <label className="ml-auto flex items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox" className="cursor-pointer accent-cyan-400" checked={!!data.auto_mode} disabled={busy !== ""}
                aria-label="Modo automático del orquestador de autorizaciones"
                onChange={(e) => { void wrap("auto", async () => { const r = await setAstraura158AuthOrchestratorAuto(target, e.target.checked); if (r.ok) { toast.success(`Auto-orquestación ${e.target.checked ? "activada" : "desactivada"}`); } else toast.error(`Auto-orquestación: ${r.error}`); }); }}
              /> Auto-orquestación
            </label>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"><p className={LABEL}>Orquestaciones</p><p className="mt-0.5 text-[12px] font-semibold text-white/85">{data.orchestrations_run ?? 0}</p></div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"><p className={LABEL}>Procesadas</p><p className="mt-0.5 text-[12px] font-semibold text-white/85">{data.last_run?.processed_count ?? 0}</p></div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"><p className={LABEL}>Agente</p><p className="mt-0.5 truncate text-[12px] font-semibold text-white/85">{data.agent_name ?? "—"}</p></div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Pestaña "Creaciones Proactivas" ────────────────────────────────────────── */

function CreationsTab({ creations, busy, onApplyAll, onApply, onDiscard, onEdit }: {
  creations: Astraura158ImaginationCreation[]; busy: string;
  onApplyAll: () => void; onApply: (c: Astraura158ImaginationCreation) => void; onDiscard: (c: Astraura158ImaginationCreation) => void; onEdit: (c: Astraura158ImaginationCreation) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
        <div>
          <p className="text-[12px] font-semibold text-white/85">Creaciones Proactivas (Código ARM NEON, Shaders &amp; Protocolos)</p>
          <p className="mt-0.5 text-[11px] text-white/55">Total: <strong className="text-white/80">{creations.length} Creaciones</strong> sintetizadas bajo cuantización 1.58b.</p>
        </div>
        <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || creations.length === 0} aria-label="Aplicar creaciones pendientes" onClick={onApplyAll}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Aplicar Creaciones Pendientes</button>
      </div>

      {creations.length === 0 && <Empty text="Sin creaciones proactivas todavía." />}
      <div className="grid gap-3 md:grid-cols-2">
        {creations.map((c) => {
          const imp = getImportanceBadge(c.importance_level);
          return (
            <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{c.title ?? c.id}</p>
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", imp.tone)}>{imp.text}</span>
                {c.type && <Badge tone="border-white/15 bg-white/[0.04] text-white/60">{c.type}</Badge>}
              </div>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/30 p-2 font-code text-[10px] leading-snug text-white/65">{c.content ?? "Sin contenido."}</pre>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label={`Aplicar ${c.title ?? c.id}`} onClick={() => onApply(c)}><BusyIcon busy={busy === `apply:${c.id}`} icon={CheckCheck} /> Aplicar</button>
                <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Editar ${c.title ?? c.id}`} onClick={() => onEdit(c)}><Pencil className="h-3 w-3" aria-hidden="true" /> Editar</button>
                <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Descartar ${c.title ?? c.id}`} onClick={() => onDiscard(c)}><BusyIcon busy={busy === `discard:${c.id}`} icon={Trash2} /> Descartar</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Pestaña "Permisos & Configuración Global" ─────────────────────────────── */

function ConfigTab({ target, status, types, onRecycle, recycling, onReload }: {
  target: Astraura158Target; status: Astraura158ImaginationStatus | null; types: Astraura158ProcessType[];
  onRecycle: () => void; recycling: boolean; onReload: () => void | Promise<void>;
}) {
  const { busy, wrap } = useBusy();
  const [globalForm, setGlobalForm] = useState({
    storage_target: status?.storage_target ?? "local_vault",
    max_proposals_per_agent_limit: status?.max_proposals_per_agent_limit ?? 4,
    max_accumulated_requests_threshold: status?.max_accumulated_requests_threshold ?? 20,
    max_concurrent_processes: status?.max_concurrent_processes ?? 3,
    quantum_entropy_level: status?.quantum_entropy_level ?? 0.75,
    auto_recycle_memories: status?.auto_recycle_memories ?? true,
    auto_sync_all_proposals_enabled: status?.auto_sync_all_proposals_enabled ?? false,
  });

  const saveGlobal = () => {
    void wrap("global", async () => {
      const r = await updateAstraura158ImaginationConfig(target, globalForm);
      if (r.ok) { toast.success("Configuración global guardada"); await onReload(); } else toast.error(`Configuración global: ${r.error}`);
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
        <p className="text-[12px] font-semibold text-white/85">Políticas de permisos por proceso</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {types.length === 0 && <Empty text="Sin catálogo de procesos." />}
          {types.map((pt) => {
            const policy = pt.permission_policy ?? {};
            return (
              <div key={pt.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="truncate text-[11px] font-medium text-white/85">{pt.name}</p>
                <select
                  className={cn(SELECT, "mt-1.5 w-full py-1")} disabled={busy !== ""} aria-label={`Política de permisos de ${pt.name}`}
                  value={CONFIG_PERMISSION_OPTIONS.some((o) => o.id === policy.level) ? policy.level : "always_ask"}
                  onChange={(e) => {
                    void wrap(`policy:${pt.id}`, async () => {
                      const r = await updateAstraura158ProcessPolicy(target, pt.id, { ...policy, level: e.target.value });
                      if (r.ok) { toast.success(`${pt.name}: política actualizada`); await onReload(); } else toast.error(`${pt.name}: ${r.error}`);
                    });
                  }}
                >
                  {CONFIG_PERMISSION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <div className="mt-1.5 space-y-1 text-[10px] text-white/65">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="cursor-pointer accent-purple-400" checked={!!policy.notify_on_important} disabled={busy !== ""}
                      onChange={(e) => { void wrap(`notif-imp:${pt.id}`, async () => { const r = await updateAstraura158ProcessPolicy(target, pt.id, { ...policy, notify_on_important: e.target.checked }); if (r.ok) await onReload(); else toast.error(r.error); }); }} />
                    Notificar Cambios Importantes
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="cursor-pointer accent-amber-400" checked={!!policy.notify_on_security} disabled={busy !== ""}
                      onChange={(e) => { void wrap(`notif-sec:${pt.id}`, async () => { const r = await updateAstraura158ProcessPolicy(target, pt.id, { ...policy, notify_on_security: e.target.checked }); if (r.ok) await onReload(); else toast.error(r.error); }); }} />
                    Notificar Cambios de Seguridad
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" className="cursor-pointer accent-cyan-400" checked={!!policy.auto_sync_agents} disabled={busy !== ""}
                      onChange={(e) => { void wrap(`notif-sync:${pt.id}`, async () => { const r = await updateAstraura158ProcessPolicy(target, pt.id, { ...policy, auto_sync_agents: e.target.checked }); if (r.ok) await onReload(); else toast.error(r.error); }); }} />
                    Sincronizar en 2do Plano
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
        <p className="text-[12px] font-semibold text-white/85">Configuración global</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className={LABEL}>Destino de Almacenamiento</span>
            <select className={cn(SELECT, "mt-1 w-full py-1")} value={globalForm.storage_target} onChange={(e) => setGlobalForm((f) => ({ ...f, storage_target: e.target.value }))} aria-label="Destino de almacenamiento">
              <option value="local_vault">Bóveda Soberana Local (JSON + Markdown)</option>
              <option value="starseed_graph">Grafo Sináptico StarSeed 1.58b</option>
              <option value="openviking">OpenViking Hierarchical Store</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Límite de propuestas por agente</span>
            <input type="number" min={1} max={50} className={cn(INPUT, "mt-1 w-full")} value={globalForm.max_proposals_per_agent_limit} onChange={(e) => setGlobalForm((f) => ({ ...f, max_proposals_per_agent_limit: Number(e.target.value) || f.max_proposals_per_agent_limit }))} aria-label="Límite de propuestas por agente" />
          </label>
          <label className="block">
            <span className={LABEL}>Umbral de solicitudes acumuladas</span>
            <input type="number" min={1} max={200} className={cn(INPUT, "mt-1 w-full")} value={globalForm.max_accumulated_requests_threshold} onChange={(e) => setGlobalForm((f) => ({ ...f, max_accumulated_requests_threshold: Number(e.target.value) || f.max_accumulated_requests_threshold }))} aria-label="Umbral de solicitudes acumuladas" />
          </label>
          <label className="block">
            <span className={LABEL}>Procesos concurrentes máximos</span>
            <input type="number" min={1} max={20} className={cn(INPUT, "mt-1 w-full")} value={globalForm.max_concurrent_processes} onChange={(e) => setGlobalForm((f) => ({ ...f, max_concurrent_processes: Number(e.target.value) || f.max_concurrent_processes }))} aria-label="Procesos concurrentes máximos" />
          </label>
          <label className="block">
            <span className={LABEL}>Nivel de entropía cuántica</span>
            <input type="number" min={0} max={1} step={0.05} className={cn(INPUT, "mt-1 w-full")} value={globalForm.quantum_entropy_level} onChange={(e) => setGlobalForm((f) => ({ ...f, quantum_entropy_level: Number(e.target.value) || 0 }))} aria-label="Nivel de entropía cuántica" />
          </label>
          <div className="flex flex-col justify-end gap-1.5 text-[10px] text-white/65">
            <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="cursor-pointer accent-emerald-400" checked={globalForm.auto_recycle_memories} onChange={(e) => setGlobalForm((f) => ({ ...f, auto_recycle_memories: e.target.checked }))} /> Reciclar memorias automáticamente</label>
            <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="cursor-pointer accent-cyan-400" checked={globalForm.auto_sync_all_proposals_enabled} onChange={(e) => setGlobalForm((f) => ({ ...f, auto_sync_all_proposals_enabled: e.target.checked }))} /> Auto-sincronizar propuestas seguras</label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Guardar configuración global" onClick={saveGlobal}><BusyIcon busy={busy === "global"} icon={CheckCheck} /> Guardar Configuración Global</button>
          <button type="button" className={BTN} disabled={recycling} aria-label="Compactar memoria ahora" onClick={onRecycle}><BusyIcon busy={recycling} icon={Recycle} /> Compactar Memoria Ahora</button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal genérico "Editar" (propuesta/creación) — spec §7.6 ─────────────── */

function EditProposalModal({ state, busy, onChange, onClose, onSave }: {
  state: EditModalState; busy: boolean; onChange: (s: EditModalState) => void; onClose: () => void; onSave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y({ open: true, onClose, containerRef: ref });
  return (
    <div ref={ref} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Editar elemento">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0b0d14] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-white/90">Editar {state.kind === "branch" ? "propuesta" : "creación"}</p>
          <button type="button" className={BTN} aria-label="Cerrar edición" onClick={onClose}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
        {state.kind === "branch" ? (
          <>
            <label className="mt-3 block"><span className={LABEL}>Tema</span><input className={cn(INPUT, "mt-1 w-full")} value={state.theme} onChange={(e) => onChange({ ...state, theme: e.target.value })} aria-label="Tema de la propuesta" /></label>
            <label className="mt-2 block"><span className={LABEL}>Hipótesis</span><textarea className={cn(TEXTAREA, "mt-1")} value={state.hypothesis} onChange={(e) => onChange({ ...state, hypothesis: e.target.value })} aria-label="Hipótesis de la propuesta" /></label>
          </>
        ) : (
          <>
            <label className="mt-3 block"><span className={LABEL}>Título</span><input className={cn(INPUT, "mt-1 w-full")} value={state.title} onChange={(e) => onChange({ ...state, title: e.target.value })} aria-label="Título de la creación" /></label>
            <label className="mt-2 block"><span className={LABEL}>Contenido</span><textarea className={cn(TEXTAREA, "mt-1")} value={state.content} onChange={(e) => onChange({ ...state, content: e.target.value })} aria-label="Contenido de la creación" /></label>
          </>
        )}
        <div className="mt-3 flex justify-end gap-1.5">
          <button type="button" className={BTN} onClick={onClose} aria-label="Cancelar edición">Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy} aria-label="Guardar cambios" onClick={onSave}><BusyIcon busy={busy} icon={CheckCheck} /> Guardar</button>
        </div>
      </div>
    </div>
  );
}

export default ImaginacionView;
