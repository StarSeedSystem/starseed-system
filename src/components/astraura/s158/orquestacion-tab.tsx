"use client";

import { QuantumOrbAvatar } from "@/components/aurora/quantum-orb-avatar";

/**
 * STUDIO 1.58 · Orquestación — el «centro de orquestación» del enjambre
 * multi-agente (Ola 5 · Adenda 157; SOP `architecture/astraura-158-ola5-orquestacion.md`
 * §3): tablero vivo de agentes con su tarea de fondo y fase de ciclo, el
 * Director (Metis) que los supervisa, el tronco dual de cómputo con su
 * gobernador de capacidad, la sincronización multiagente (qué entregable sale
 * de qué proceso/agente y a qué proyecto o cerebro entra) y las tarjetas
 * compactas de los procesos del puente.
 *
 * Refresco cada 10 s. Nada se simula: cada control llama al endpoint real y
 * recarga. Honestidad ante todo: si el backend no trae un campo, no se pinta
 * (o se dice explícitamente que no hay dato/conexión) — nunca se inventa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot, Crown, ExternalLink, FolderKanban, Gauge, MessageCircle, Play, RefreshCw,
  Save, Send, Server, Share2, Wand2, Workflow, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  fetchAstraura158Swarm, fetchAstraura158Director, updateAstraura158DirectorConfig, steerAstraura158Swarm,
  triggerAstraura158DirectorCycle, renewAstraura158DirectorTasks, toggleAstraura158SwarmAgent, setAstraura158SwarmCapacity,
  setAstraura158AgentConcurrency, fetchAstraura158DualTrunk, setAstraura158DualTrunk, fetchAstraura158RoutingStorage,
  fetchAstraura158SyncTelemetry, fetchAstraura158Processes,
  type Astraura158CapacityMode, type Astraura158SwarmAgent, type Astraura158SwarmTask,
} from "@/lib/astraura/astraura-158-client";
import { openAstraura158Window, astraura158WindowHref } from "@/components/astraura/window/astraura-158-window-bus";
import {
  BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, INPUT, MONO, SUB, SectionTitle, Stat,
  clampInt, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

/** Refresco del tablero completo (SOP §3): 10 s. */
const REFRESH_MS = 10_000;

const CAPACITY_MODES: { id: Astraura158CapacityMode; label: string; hint: string }[] = [
  { id: "adaptive", label: "Adaptativo", hint: "Sube y baja con tu uso, batería e inactividad." },
  { id: "performance", label: "Rendimiento", hint: "Máximo cómputo para los agentes." },
  { id: "eco", label: "Eco", hint: "Mínimo consumo; ideal con batería." },
  { id: "manual", label: "Manual", hint: "Porcentaje fijo que tú decides." },
];

/** ¿El agente está trabajando ahora mismo? (para ordenar la rejilla). */
function agentIsWorking(a: Astraura158SwarmAgent, task?: Astraura158SwarmTask): boolean {
  if (task) return !task.status || !/queued|paused|cancel|done|complete|fail/i.test(task.status);
  return /running|active|busy|trabajando|working|ejecut/i.test(String(a.status ?? ""));
}

/* ── Tarjeta de un agente vivo ─────────────────────────────────────────────── */

function AgentLiveCard({
  a, task, target, busy, wrap, reloadSwarm,
}: {
  a: Astraura158SwarmAgent;
  task?: Astraura158SwarmTask;
  target: S158TabProps["target"];
  busy: string;
  wrap: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  reloadSwarm: () => Promise<void>;
}) {
  const on = !/disabled|off|inactive|paused/i.test(String(a.status ?? "idle"));
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex items-center gap-2">
        {a.used_personalities?.[0]?.id ? (
          /* (Adenda 176) Avatar de orbe VIVO — "thinking" mientras el agente tiene tarea. */
          <QuantumOrbAvatar personaId={a.used_personalities[0].id} size={28} state={on && task ? "thinking" : "idle"} className="shrink-0" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color ?? "#22d3ee", boxShadow: `0 0 8px ${a.color ?? "#22d3ee"}` }} aria-hidden="true" />
        )}
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{a.name}</p>
        <Badge tone={levelTone(a.status)}>{a.status ?? "idle"}</Badge>
        <Switch checked={on} disabled={busy !== ""} aria-label={`Agente ${a.name} ${on ? "activo" : "inactivo"}`}
          onCheckedChange={(v) => { void wrap(`ag:${a.id}`, () => runS158(`${a.name}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158SwarmAgent(target, a.id, v), { after: reloadSwarm })); }} />
      </div>
      {a.role && <p className="truncate text-[10px] text-white/55">{a.role}</p>}

      <p className="truncate text-[11px] text-white/75" title={task?.prompt}>
        {task?.title ? task.title : <span className="text-white/40">Sin tarea en segundo plano.</span>}
      </p>
      {task && (task.execution_phase || task.phase_label) && (
        <p className={MONO}>{task.execution_phase ? `Fase ${task.execution_phase}` : "Fase"}{task.phase_label ? ` · ${task.phase_label}` : ""}</p>
      )}
      {task && typeof task.progress === "number" && <Bar value={task.progress} />}
      {task && (task.allocated_cpu_percent != null || task.real_memory_mb != null) && (
        <p className={MONO}>
          {task.allocated_cpu_percent != null ? `${task.allocated_cpu_percent}% CPU` : ""}
          {task.allocated_cpu_percent != null && task.real_memory_mb != null ? " · " : ""}
          {task.real_memory_mb != null ? `${Math.round(task.real_memory_mb)} MB RAM` : ""}
        </p>
      )}

      {(task?.target_project_id || (a.used_personalities ?? []).length > 0 || (a.linked_cerebros ?? []).length > 0) && (
        <div className="flex flex-wrap gap-1">
          {task?.target_project_id && (
            <Badge tone="border-sky-400/25 text-sky-100/90" className="gap-1">
              <FolderKanban className="h-2.5 w-2.5" aria-hidden="true" /> {task.target_project_id}
            </Badge>
          )}
          {(a.used_personalities ?? []).map((p) => <Badge key={p.id} tone="border-fuchsia-400/25 text-fuchsia-100/90">{p.name}</Badge>)}
          {(a.linked_cerebros ?? []).map((c) => <Badge key={c.id} tone="border-violet-400/25 text-violet-100/90">🧠 {c.name}</Badge>)}
        </div>
      )}

      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-[10px] text-white/60">concurrencia
          <input type="number" min={1} max={16} defaultValue={a.concurrency ?? 1} className={cn(INPUT, "w-12 py-0.5")} disabled={busy !== ""}
            aria-label={`Concurrencia de ${a.name}`}
            onBlur={(e) => { const v = clampInt(e.target.value, 1, 16, a.concurrency ?? 1); if (v !== (a.concurrency ?? 1)) void wrap(`conc:${a.id}`, () => runS158(`${a.name}: concurrencia ${v}`, () => setAstraura158AgentConcurrency(target, a.id, v), { after: reloadSwarm })); }} />
        </label>
        <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Hablar en vivo con ${a.name}`}
          onClick={() => openAstraura158Window({ kind: "agente", id: a.id, tab: "vivo", target })}>
          <MessageCircle className="h-3 w-3" aria-hidden="true" /> Hablar en Vivo
        </button>
        <Link href={astraura158WindowHref("agente", a.id)} className={BTN} aria-label={`Página completa de ${a.name}`}>
          <ExternalLink className="h-3 w-3" aria-hidden="true" /> Pág. Completa
        </Link>
      </div>
    </div>
  );
}

export function OrquestacionTab({ target, refresh }: S158TabProps) {
  const swarm = useS158Load(fetchAstraura158Swarm, target, REFRESH_MS);
  const director = useS158Load(fetchAstraura158Director, target, REFRESH_MS);
  const dualTrunk = useS158Load(fetchAstraura158DualTrunk, target, REFRESH_MS);
  const routing = useS158Load(fetchAstraura158RoutingStorage, target, REFRESH_MS);
  const syncTel = useS158Load(fetchAstraura158SyncTelemetry, target, REFRESH_MS);
  const processes = useS158Load(fetchAstraura158Processes, target, REFRESH_MS);
  const { busy, wrap } = useBusy();

  const directorRef = useRef<HTMLDivElement>(null);
  const focusDirector = useCallback(() => {
    directorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    directorRef.current?.focus({ preventScroll: true });
  }, []);

  const reloadSwarm = useCallback(async () => { await swarm.reload(true); await refresh(); }, [swarm, refresh]);
  const reloadDirector = useCallback(async () => { await director.reload(true); await refresh(); }, [director, refresh]);
  const reloadDualTrunk = useCallback(async () => { await dualTrunk.reload(true); await refresh(); }, [dualTrunk, refresh]);

  const [directive, setDirective] = useState("");
  const [manualPct, setManualPct] = useState(30);
  const [trunkEdit, setTrunkEdit] = useState({ imag: 0, swarm: 0 });
  const trunkSeeded = useRef(false);

  const s = swarm.data;
  const d = director.data;
  const cfg = d?.config ?? d?.director?.config ?? {};
  const gov = s?.capacity_governor;
  const agents = useMemo(() => s?.agents ?? [], [s]);
  const tasks = useMemo(() => s?.active_tasks ?? [], [s]);
  const tasksByAgent = useMemo(() => {
    const m = new Map<string, Astraura158SwarmTask>();
    for (const t of tasks) if (t.agent_id && !m.has(t.agent_id)) m.set(t.agent_id, t);
    return m;
  }, [tasks]);
  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => Number(agentIsWorking(b, tasksByAgent.get(b.id))) - Number(agentIsWorking(a, tasksByAgent.get(a.id)))),
    [agents, tasksByAgent],
  );
  const liveAgentsCount = s?.total_active_agents ?? agents.length;
  const routedDecisions = useMemo(() => (d?.decision_history ?? []).filter((h) => /rout|enrut/i.test(String(h.action ?? ""))), [d]);
  const routedAudits = useMemo(() => (d?.audit_log ?? []).filter((x) => /rout|enrut/i.test(String(x.type ?? ""))), [d]);

  useEffect(() => {
    if (!trunkSeeded.current && dualTrunk.data) {
      setTrunkEdit({
        imag: clampInt(dualTrunk.data.imagination_global_percent ?? 0, 0, 100, 0),
        swarm: clampInt(dualTrunk.data.swarm_global_percent ?? 0, 0, 100, 0),
      });
      trunkSeeded.current = true;
    }
  }, [dualTrunk.data]);

  return (
    <div className="space-y-3">
      {/* 1 · Cabecera */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Workflow} title="Tareas en Progreso en Segundo Plano // Enjambre Multi-Agente" tone="text-cyan-300"
          hint={`Supervisado por el Director${d?.director?.name ? ` · ${d.director.name}` : ""}.`}
          right={
            <>
              <Badge tone="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">{liveAgentsCount} agentes vivos</Badge>
              <button type="button" className={BTN} onClick={focusDirector} aria-label="Administrar Director">
                <Crown className="h-3 w-3" aria-hidden="true" /> Administrar Director
              </button>
            </>
          } />
      </div>

      {/* 2 · Rejilla de agentes vivos */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Bot} title={`Agentes vivos (${agents.length})`} tone="text-cyan-300"
          hint="Tarea en segundo plano, fase del ciclo, CPU/RAM y control real por agente. Primero los que están trabajando."
          right={<button type="button" className={BTN} onClick={() => { void swarm.reload(); }} aria-label="Recargar agentes"><RefreshCw className={cn("h-3 w-3", swarm.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {!s && <Empty loading={swarm.loading} error={swarm.error} text="El backend no expone el enjambre." />}
          {s && sortedAgents.length === 0 && <Empty text="El enjambre no tiene agentes registrados." />}
          {sortedAgents.map((a) => (
            <AgentLiveCard key={a.id} a={a} task={tasksByAgent.get(a.id)} target={target} busy={busy} wrap={wrap} reloadSwarm={reloadSwarm} />
          ))}
        </div>
      </div>

      {/* 3 · Director (Metis) */}
      <div ref={directorRef} tabIndex={-1} className={cn(CARD, "scroll-mt-4 p-3 outline-none")}>
        <SectionTitle icon={Crown} title={`Director · ${d?.director?.name ?? "Metis Prime"}`} tone="text-amber-300"
          hint="Directiva activa, ciclo de supervisión, enrutado a proyectos y renovación de tareas."
          right={<button type="button" className={BTN} onClick={() => { void director.reload(); }} aria-label="Recargar director"><RefreshCw className={cn("h-3 w-3", director.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!d && <Empty loading={director.loading} error={director.error} text="El backend no expone el Director." />}
        {d && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Estado" value={d.director?.status ?? "—"} hint={`modo ${cfg.orchestration_mode ?? "—"}`} />
              <Stat label="Tareas supervisadas" value={d.director?.tasks_supervised_count ?? 0} hint={`${d.director?.verifications_completed_count ?? 0} verificaciones`} />
              <Stat label="Enrutados" value={d.director?.routings_performed_count ?? 0} hint={`umbral de calidad ${cfg.quality_threshold ?? "—"}`} />
              <Stat label="Supervisión" value={`${cfg.supervision_interval_seconds ?? "—"} s`} hint={`máx. ${cfg.max_agent_concurrency ?? "—"} agentes`} />
            </div>
            {d.director?.active_directive && (
              <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/[0.06] px-2 py-1 text-[11px] text-amber-100/90">
                <span className="text-amber-200/70">Directiva activa · </span>{d.director.active_directive}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {([["auto_route_to_projects", "enrutar a proyectos"], ["auto_inject_axioms", "inyectar axiomas"], ["auto_trigger_imagination", "disparar imaginación"]] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-[11px] text-white/80">
                  <Switch checked={!!cfg[key]} disabled={busy !== ""} aria-label={`Director: ${label}`}
                    onCheckedChange={(v) => { void wrap(`dcfg:${key}`, () => runS158(`Director: ${label} ${v ? "activado" : "desactivado"}`, () => updateAstraura158DirectorConfig(target, { ...cfg, [key]: v }), { after: reloadDirector })); }} />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                <span className="font-code text-[10px] uppercase tracking-wide text-white/45">Nueva directiva para el enjambre</span>
                <input className={INPUT} value={directive} onChange={(e) => setDirective(e.target.value)} placeholder={cfg.default_master_directive ?? "p. ej. prioriza la memoria del OS"} aria-label="Directiva" />
              </label>
              <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !directive.trim()} aria-label="Enviar directiva"
                onClick={() => { void wrap("steer", () => runS158("Directiva enviada al enjambre", () => steerAstraura158Swarm(target, directive.trim()), { description: (r) => `${(r.dispatched_actions ?? []).length} acción(es) despachada(s)`, after: async () => { setDirective(""); await reloadDirector(); await reloadSwarm(); } })); }}>
                <BusyIcon busy={busy === "steer"} icon={Send} /> Dirigir
              </button>
              <button type="button" className={BTN} disabled={busy !== ""} aria-label="Ejecutar ciclo de supervisión"
                onClick={() => { void wrap("cycle", () => runS158("Ciclo de supervisión ejecutado", () => triggerAstraura158DirectorCycle(target), { after: async () => { await reloadDirector(); await reloadSwarm(); } })); }}>
                <BusyIcon busy={busy === "cycle"} icon={Play} /> Ciclo ahora
              </button>
              <button type="button" className={BTN} disabled={busy !== ""} aria-label="Renovar tareas"
                onClick={() => { void wrap("renew", () => runS158("Tareas renovadas", () => renewAstraura158DirectorTasks(target), { description: (r) => (r.renewed_tasks ?? []).map((t) => t.title).filter(Boolean).join(" · ") || undefined, after: reloadSwarm })); }}>
                <BusyIcon busy={busy === "renew"} icon={Wand2} /> Renovar tareas
              </button>
            </div>
            <div className="mt-2">
              <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Últimas decisiones</p>
              {(d.decision_history ?? []).length === 0 && <p className="mt-1 text-[11px] text-white/50">Sin decisiones registradas todavía.</p>}
              <ul className="mt-1 space-y-1">
                {(d.decision_history ?? []).slice(-6).reverse().map((h, i) => (
                  <li key={h.id ?? i} className={cn(SUB, "px-2 py-1")}>
                    <p className="text-[10px] text-white/85"><span className={MONO}>{fmtAgo(h.timestamp)}</span> · {h.action ?? "—"}{h.agent_id ? ` → ${h.agent_id}` : ""}</p>
                    {h.reasoning && <p className="mt-0.5 line-clamp-2 text-[10px] text-white/55">{h.reasoning}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* 4 · Tronco dual y gobernador */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Gauge} title="Tronco dual y gobernador de capacidad" tone="text-violet-300"
          hint="Reparto de núcleos entre imaginación, enjambre y tu reserva de chat interactivo."
          right={<button type="button" className={BTN} onClick={() => { void dualTrunk.reload(); void swarm.reload(); }} aria-label="Recargar tronco dual"><RefreshCw className={cn("h-3 w-3", (dualTrunk.loading || swarm.loading) && "animate-spin")} aria-hidden="true" /></button>} />
        {!dualTrunk.data && !gov && <Empty loading={dualTrunk.loading || swarm.loading} error={dualTrunk.error || swarm.error} text="El backend no expone el tronco dual." />}
        {gov && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CAPACITY_MODES.map((m) => (
              <button key={m.id} type="button" title={m.hint} className={cn(BTN, gov.capacity_mode === m.id && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")} disabled={busy !== ""} aria-pressed={gov.capacity_mode === m.id} aria-label={`Capacidad: ${m.label}`}
                onClick={() => { void wrap(`cap:${m.id}`, () => runS158(`Capacidad: ${m.label}`, () => setAstraura158SwarmCapacity(target, m.id, m.id === "manual" ? manualPct : undefined), { after: reloadSwarm })); }}>
                <BusyIcon busy={busy === `cap:${m.id}`} icon={Zap} /> {m.label}
              </button>
            ))}
            <label className="flex items-center gap-1 text-[10px] text-white/60">manual
              <input type="number" min={5} max={95} value={manualPct} onChange={(e) => setManualPct(clampInt(e.target.value, 5, 95, 30))} className={cn(INPUT, "w-14 py-0.5")} aria-label="Porcentaje manual de capacidad" />%
            </label>
          </div>
        )}
        {dualTrunk.data && (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className={cn(SUB, "px-3 py-2")}>
                <div className="flex items-center justify-between">
                  <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Imaginación</p>
                  <p className="text-[11px] text-white/70">{dualTrunk.data.imagination_cores ?? "—"} núcleos</p>
                </div>
                <Bar value={dualTrunk.data.imagination_global_percent} tone="bg-fuchsia-400/70" className="mt-1.5" />
              </div>
              <div className={cn(SUB, "px-3 py-2")}>
                <div className="flex items-center justify-between">
                  <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Enjambre</p>
                  <p className="text-[11px] text-white/70">{dualTrunk.data.swarm_cores ?? "—"} núcleos</p>
                </div>
                <Bar value={dualTrunk.data.swarm_global_percent} tone="bg-cyan-400/70" className="mt-1.5" />
              </div>
              <div className={cn(SUB, "px-3 py-2")}>
                <div className="flex items-center justify-between">
                  <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Reserva de chat</p>
                  <p className="text-[11px] text-white/70">{dualTrunk.data.user_chat_cores ?? "—"} núcleos</p>
                </div>
                <Bar value={dualTrunk.data.interactive_reserve_percent} tone="bg-emerald-400/70" className="mt-1.5" />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[10px] text-white/60">imaginación %
                <input type="number" min={0} max={100} value={trunkEdit.imag} disabled={busy !== ""} className={cn(INPUT, "w-16 py-0.5")} aria-label="Porcentaje de imaginación del tronco dual"
                  onChange={(e) => setTrunkEdit((p) => ({ ...p, imag: clampInt(e.target.value, 0, 100, p.imag) }))} />
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-white/60">enjambre %
                <input type="number" min={0} max={100} value={trunkEdit.swarm} disabled={busy !== ""} className={cn(INPUT, "w-16 py-0.5")} aria-label="Porcentaje de enjambre del tronco dual"
                  onChange={(e) => setTrunkEdit((p) => ({ ...p, swarm: clampInt(e.target.value, 0, 100, p.swarm) }))} />
              </label>
              <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Guardar reparto del tronco dual"
                onClick={() => { void wrap("trunk", () => runS158("Reparto del tronco dual guardado", () => setAstraura158DualTrunk(target, trunkEdit.imag, trunkEdit.swarm), { after: reloadDualTrunk })); }}>
                <BusyIcon busy={busy === "trunk"} icon={Save} /> Guardar reparto
              </button>
              <p className={cn(MONO, "self-center")}>{dualTrunk.data.total_cores ?? "—"} núcleos totales</p>
            </div>
          </>
        )}
      </div>

      {/* 5 · Sincronización multiagente */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Share2} title="Sincronización multiagente" tone="text-emerald-300"
          hint="Qué entregable sale de qué proceso/agente y a qué proyecto o cerebro entra." />
        <div className="mt-2 space-y-3">
          <div>
            <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Enrutados por el Director</p>
            {!d && <Empty loading={director.loading} error={director.error} />}
            {d && routedDecisions.length === 0 && routedAudits.length === 0 && <p className="mt-1 text-[11px] text-white/50">El Director no registra enrutados todavía.</p>}
            {(routedAudits.length > 0 || routedDecisions.length > 0) && (
              <ul className="mt-1 space-y-1">
                {routedAudits.slice(-6).reverse().map((x, i) => (
                  <li key={`au:${i}`} className={cn(SUB, "flex flex-wrap items-center gap-2 px-2 py-1 text-[10px] text-white/80")}>
                    <span className={MONO}>{fmtAgo(x.timestamp)}</span>
                    <span>Director → {x.target ?? "—"}</span>
                    {x.verdict && <Badge tone={levelTone(x.verdict)}>{x.verdict}</Badge>}
                    {typeof x.quality_score === "number" && <span className="text-white/50">calidad {x.quality_score}</span>}
                    {x.details && <span className="min-w-0 truncate text-white/50" title={x.details}>{x.details}</span>}
                  </li>
                ))}
                {routedDecisions.slice(-6).reverse().map((h, i) => (
                  <li key={`dh:${h.id ?? i}`} className={cn(SUB, "flex flex-wrap items-center gap-2 px-2 py-1 text-[10px] text-white/80")}>
                    <span className={MONO}>{fmtAgo(h.timestamp)}</span>
                    <span>{h.agent_id ?? "Director"} · {h.action}</span>
                    {h.reasoning && <span className="min-w-0 truncate text-white/50" title={h.reasoning}>{h.reasoning}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Enrutamiento de almacenamiento</p>
            {!routing.data && <Empty loading={routing.loading} error={routing.error} text="El backend no expone el agente de enrutamiento de almacenamiento." />}
            {routing.data && (
              <p className={cn(SUB, "mt-1 px-2 py-1 text-[11px] text-white/80")}>
                {routing.data.agent_name ?? "Agente de enrutamiento"}
                {typeof routing.data.sync_runs === "number" ? ` · ${routing.data.sync_runs} sincronizaciones` : ""}
                {typeof routing.data.brains_count === "number" ? ` → ${routing.data.brains_count} cerebros` : ""}
                {routing.data.is_busy ? " · trabajando ahora" : ""}
              </p>
            )}
          </div>
          <div>
            <p className="font-code text-[10px] uppercase tracking-wide text-white/45">Malla de sincronización</p>
            {!syncTel.data?.mesh && <Empty loading={syncTel.loading} error={syncTel.error} text="El backend no expone telemetría de sincronización." />}
            {syncTel.data?.mesh && (
              <p className={cn(SUB, "mt-1 px-2 py-1 text-[11px] text-white/80")}>
                {syncTel.data.mesh.active_synced_clients ?? 0} clientes sincronizados{syncTel.data.mesh.status ? ` · ${syncTel.data.mesh.status}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 6 · Tarjetas de procesos */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Server} title={`Procesos del puente (${(processes.data ?? []).length})`} tone="text-white/70"
          hint="Estado real de cada proceso del puente; «abrir» monta su ventana universal."
          right={<button type="button" className={BTN} onClick={() => { void processes.reload(); }} aria-label="Recargar procesos"><RefreshCw className={cn("h-3 w-3", processes.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {!processes.data && <Empty loading={processes.loading} error={processes.error} text="El backend no expone el puente de procesos." />}
          {processes.data && processes.data.length === 0 && <Empty text="Sin procesos registrados." />}
          {(processes.data ?? []).map((p) => (
            <div key={p.id} className={cn(SUB, "flex items-center gap-2 px-3 py-2")}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.enabled === false ? "#64748b" : "#22d3ee" }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-white/90">{p.name ?? p.id}</p>
                <Badge tone={levelTone(p.status)} className="mt-0.5">{p.status ?? (p.running ? "activo" : "—")}</Badge>
                {p.detail && <p className="mt-0.5 truncate text-[10px] text-white/50">{p.detail}</p>}
              </div>
              <button type="button" className={BTN} aria-label={`Abrir ${p.name ?? p.id}`}
                onClick={() => openAstraura158Window({ kind: "proceso", id: p.id, target })}>
                <ExternalLink className="h-3 w-3" aria-hidden="true" /> Abrir
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OrquestacionTab;
