"use client";

/**
 * STUDIO 1.58 · Resumen — honestidad del motor, estado de TODOS los procesos
 * del backend y acciones rápidas. Lee el puente `/api/starseed/processes`
 * (backend nuevo) y, si no existe, compone el resumen con las lecturas clásicas.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Binary, Bot, Brain, Cpu, Crown, Database, HardDrive, Moon, RefreshCw, Shield, ShieldCheck, Sparkles, Wand2, Zap,
  FileText, BellRing, ScanSearch, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeAstraura158Engine, fetchAstraura158AuthOrchestrator, fetchAstraura158Director, fetchAstraura158DreamStatus,
  fetchAstraura158ImaginationStatus, fetchAstraura158Privacy, fetchAstraura158Processes, fetchAstraura158Swarm,
  fetchAstraura158SyncTelemetry, generateAstraura158SynthesisReport, markAstraura158NotificationsRead,
  renewAstraura158DirectorTasks, scanAstraura158StorageNow, triggerAstraura158Imagination,
  type Astraura158ProcessSummary, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, BusyIcon, CARD, Empty, MONO, SUB, SectionTitle, Stat, fmtCountdown, levelTone, runS158, useBusy, type S158TabId, type S158TabProps } from "./shared";

interface Proc extends Astraura158ProcessSummary { tab?: S158TabId; icon?: LucideIcon }

const PROC_META: Record<string, { name: string; icon: LucideIcon; tab: S158TabId }> = {
  engine: { name: "Motor 1.58-bit", icon: Binary, tab: "resumen" },
  imagination: { name: "Imaginación intuitiva", icon: Sparkles, tab: "imaginacion" },
  dream: { name: "Sueños (Dream Studio)", icon: Moon, tab: "imaginacion" },
  swarm: { name: "Enjambre multi-área", icon: Bot, tab: "agentes" },
  director: { name: "Director (Metis Prime)", icon: Crown, tab: "agentes" },
  auth_orchestrator: { name: "Orquestador de autorizaciones", icon: ShieldCheck, tab: "notificaciones" },
  privacy: { name: "Privacidad y air-gap", icon: Shield, tab: "sentidos" },
  sync: { name: "Malla de sincronización", icon: Activity, tab: "almacenamiento" },
  storage: { name: "Enrutamiento de almacenamiento", icon: HardDrive, tab: "almacenamiento" },
  voice: { name: "Voz continua", icon: Zap, tab: "voz" },
  memory: { name: "Memoria", icon: Database, tab: "memoria" },
};

function isOn(p: Astraura158ProcessSummary): boolean {
  if (typeof p.running === "boolean") return p.running;
  if (typeof p.enabled === "boolean") return p.enabled;
  return /active|running|online|on|enabled|ok|dreaming|busy/i.test(String(p.status ?? ""));
}

/** Compone el resumen de procesos con las lecturas clásicas (backend sin puente). */
async function composeProcesses(target: Astraura158Target): Promise<{ list: Proc[]; anyOk: boolean }> {
  const [imag, swarm, director, dream, auth, privacy, sync] = await Promise.all([
    fetchAstraura158ImaginationStatus(target), fetchAstraura158Swarm(target), fetchAstraura158Director(target),
    fetchAstraura158DreamStatus(target), fetchAstraura158AuthOrchestrator(target), fetchAstraura158Privacy(target),
    fetchAstraura158SyncTelemetry(target),
  ]);
  const list: Proc[] = [];
  if (imag.ok) {
    const d = imag.data;
    list.push({
      id: "imagination", status: d.is_paused_due_to_threshold ? "paused" : d.is_dreaming_now ? "dreaming" : d.is_always_on ? "active" : "idle",
      running: !!d.is_always_on && !d.is_paused_due_to_threshold,
      detail: `${d.is_dreaming_now ? "imaginando ahora" : `próximo ciclo en ${fmtCountdown(d.next_cycle_seconds_left)}`} · ${d.pending_approval_count ?? 0} propuesta(s) pendiente(s) · ${d.cycles_completed ?? 0} ciclos`,
      counters: { pendientes: Number(d.pending_approval_count ?? 0), procesos: Number(d.active_processes_count ?? 0) },
    });
  }
  if (dream.ok) {
    const d = dream.data;
    list.push({ id: "dream", status: d.is_dreaming ? "dreaming" : d.is_always_on ? "active" : "idle", running: !!(d.is_always_on || d.is_dreaming), detail: `${String(d.operation_mode ?? "")} · ${d.cycles_completed ?? 0} ciclos` });
  }
  if (swarm.ok) {
    const d = swarm.data;
    const running = (d.active_tasks ?? []).filter((t) => t.status === "running").length;
    list.push({
      id: "swarm", status: running > 0 ? "running" : "idle", running: (d.total_active_agents ?? 0) > 0,
      detail: `${d.total_active_agents ?? 0} agente(s) activo(s) · ${running} tarea(s) en curso · ${d.capacity_governor?.relative_capacity_percent ?? "?"}% capacidad (${d.capacity_governor?.capacity_mode ?? ""})`,
      counters: { tareas: running },
    });
  }
  if (director.ok) {
    const d = director.data.director;
    list.push({ id: "director", status: d?.status ?? "active", running: true, detail: d?.active_directive ?? "", counters: { supervisadas: Number(d?.tasks_supervised_count ?? 0) } });
  }
  if (auth.ok) {
    const d = auth.data;
    list.push({ id: "auth_orchestrator", status: d.is_busy ? "busy" : d.auto_mode ? "active" : "paused", running: !!d.auto_mode, detail: `${d.orchestrations_run ?? 0} orquestaciones${d.draining_mode ? " · drenando cola" : ""}${d.requests_embargoed ? " · solicitudes embargadas" : ""}` });
  }
  if (privacy.ok) {
    const d = privacy.data;
    list.push({ id: "privacy", status: d.air_gap_active ? "air-gap" : "active", running: true, detail: d.air_gap_active ? "Air-gap estricto ACTIVO: sin red ni nube" : `${d.protected_sensors_count ?? 0} sensor(es) protegido(s)` });
  }
  if (sync.ok) {
    const m = sync.data.mesh;
    list.push({ id: "sync", status: m?.status ?? "idle", running: (m?.active_synced_clients ?? 0) > 0, detail: `${m?.active_synced_clients ?? 0} cliente(s) sincronizado(s)` });
  }
  return { list, anyOk: [imag, swarm, director, dream, auth, privacy, sync].some((r) => r.ok) };
}

export function ResumenTab({ target, manifest, refresh, onNavigate }: S158TabProps) {
  const [procs, setProcs] = useState<Proc[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viaBridge, setViaBridge] = useState(false);
  const { busy, wrap } = useBusy();

  const load = useCallback(async () => {
    setLoading(true);
    const bridged = await fetchAstraura158Processes(target);
    if (bridged.ok && bridged.data.length > 0) {
      setProcs(bridged.data);
      setViaBridge(true);
      setError("");
    } else {
      const { list, anyOk } = await composeProcesses(target);
      setViaBridge(false);
      if (anyOk) { setProcs(list); setError(""); } else { setProcs(null); setError(bridged.ok ? "sin procesos" : bridged.error); }
    }
    setLoading(false);
  }, [target]);

  useEffect(() => { void load(); }, [load]);

  const engine = describeAstraura158Engine(manifest?.status ?? null);
  const status = manifest?.status;
  const hw = status?.profiler?.hardware_family;

  const after = async () => { await load(); await refresh(); };
  const quick: { label: string; icon: LucideIcon; primary?: boolean; run: () => Promise<boolean> }[] = [
    { label: "Disparar ciclo de imaginación", icon: Sparkles, primary: true, run: () => runS158("Ciclo de imaginación lanzado", () => triggerAstraura158Imagination(target), { description: (d) => d.branch?.theme ?? (d.scheduled ? "En segundo plano: la rama llegará por eventos." : d.message), after }) },
    { label: "Renovar tareas del Director", icon: Crown, run: () => runS158("Tareas del Director renovadas", () => renewAstraura158DirectorTasks(target), { description: (d) => (d.renewed_tasks ?? []).map((t) => t.title).filter(Boolean).join(" · ") || undefined, after }) },
    { label: "Escanear almacenamiento", icon: ScanSearch, run: () => runS158("Escaneo de almacenamiento ejecutado", () => scanAstraura158StorageNow(target), { description: (d) => `${(d.events_triggered ?? []).length} evento(s) disparado(s)`, after }) },
    { label: "Marcar notificaciones como leídas", icon: BellRing, run: () => runS158("Notificaciones marcadas como leídas", () => markAstraura158NotificationsRead(target), { after }) },
    { label: "Generar informe de síntesis", icon: FileText, run: () => runS158("Informe de síntesis generado", () => generateAstraura158SynthesisReport(target, "manual_request", { theme: "Solicitado desde StarSeed OS" }), { description: (d) => d.report?.title, after }) },
  ];

  return (
    <div className="mt-3 space-y-3">
      {/* Motor: honestidad */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Cpu} title="Motor de inferencia (lo que el backend dice de sí mismo)" hint="Sin modelo real (plantillas) = el backend responde con texto enlatado: arranca Ollama o compila BitNet." />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Motor" value={<span className={cn(engine.bitnet ? "text-cyan-200" : engine.real ? "text-white" : "text-amber-200")}>{engine.label}</span>} hint={status?.engine?.inference_mode ? `modo ${status.engine.inference_mode}${status.engine.quantization ? ` · ${status.engine.quantization}` : ""}` : undefined} />
          <Stat label="Veracidad" value={status ? (engine.real ? "Modelo real" : "Plantillas (sin modelo)") : "sin conexión"} hint={status?.engine?.bitnet_cpp_installed ? "bitnet.cpp instalado" : "bitnet.cpp no instalado"} />
          <Stat label="Rendimiento" value={status?.engine?.speed_tps ? `${Number(status.engine.speed_tps).toFixed(1)} tok/s` : "—"} hint={status?.engine?.tokens_generated ? `${status.engine.tokens_generated} tokens generados` : undefined} />
          <Stat label="Memoria y habilidades" value={status ? `${status.memory_summary?.knowledge_nodes ?? 0} nodos · ${status.memory_summary?.vector_documents ?? 0} vectores` : "—"} hint={status ? `${status.skills_active ?? 0} habilidades activas${hw ? ` · ${hw}` : ""}` : undefined} />
        </div>
      </div>

      {/* Procesos */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Activity}
          title="Procesos del backend"
          hint={viaBridge ? "Leído del puente /api/starseed/processes." : "Backend sin el puente de procesos: resumen compuesto con las lecturas clásicas."}
          right={<button type="button" className={BTN} onClick={() => { void load(); }} aria-label="Recargar procesos"><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} aria-hidden="true" /> Recargar</button>}
        />
        <div className="mt-2">
          {(!procs || procs.length === 0) && <Empty loading={loading} error={error} text="El backend no expone procesos." />}
          {procs && procs.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {procs.map((p) => {
                const meta = PROC_META[p.id];
                const Icon = meta?.icon ?? Brain;
                const on = isOn(p);
                const counters = Object.entries(p.counters ?? {}).filter(([, v]) => typeof v === "number");
                return (
                  <div key={p.id} className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden="true" />
                      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{p.name ?? meta?.name ?? p.id}</p>
                      <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", on ? levelTone("active") : levelTone(p.status ?? "paused"))}>{p.status ?? (on ? "activo" : "inactivo")}</span>
                    </div>
                    {p.detail && <p className="line-clamp-2 text-[10px] leading-snug text-white/60">{p.detail}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-1">
                      <p className={MONO}>{counters.map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
                      {meta && meta.tab !== "resumen" && onNavigate && (
                        <button type="button" className={cn(BTN, "px-1.5 py-0.5 text-[10px]")} onClick={() => onNavigate(meta.tab)} aria-label={`Abrir ${meta.name}`}>Abrir</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Wand2} title="Acciones rápidas" hint="Cada botón llama al endpoint real del backend y enseña el resultado; si el backend simula, lo dice la pestaña correspondiente." tone="text-fuchsia-300" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              className={q.primary ? BTN_PRIMARY : BTN}
              disabled={busy !== "" || !manifest}
              aria-label={q.label}
              onClick={() => { void wrap(q.label, q.run); }}
            >
              <BusyIcon busy={busy === q.label} icon={q.icon} /> {q.label}
            </button>
          ))}
        </div>
        {!manifest && <p className="mt-2 text-[10px] text-white/50">Sin conexión con el backend ({target}): las acciones quedan deshabilitadas.</p>}
      </div>
    </div>
  );
}

export default ResumenTab;
