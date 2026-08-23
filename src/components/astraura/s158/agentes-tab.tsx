"use client";

/**
 * STUDIO 1.58 · Agentes — las tres capas de agentes del backend soberano:
 *   · Director «Metis Prime» (`/api/director/*`): directiva maestra, ciclo de
 *     supervisión, auditorías, enrutado a proyectos y renovación de tareas.
 *   · Enjambre multi-área (`/api/swarm/*`): gobernador de capacidad, áreas,
 *     agentes con sus personalidades y cerebros vinculados, tareas vivas,
 *     programaciones y despacho manual.
 *   · Bóveda (`/api/agents`) y ecosistema (`/api/ecosystem/agents`): agentes
 *     con imaginación de fondo propia (frecuencia, permisos, cuota de CPU).
 *
 * Nada se simula: cada control llama al endpoint real y recarga.
 */

import { useCallback, useState } from "react";
import { Bot, Crown, Gauge, Play, Plus, RefreshCw, Send, Square, Timer, Wand2, Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  cancelAstraura158Task, createAstraura158Schedule, dispatchAstraura158Task, fetchAstraura158Director, fetchAstraura158Swarm,
  fetchAstraura158VaultAgents, renewAstraura158DirectorTasks, setAstraura158ScheduleFrequency, setAstraura158SwarmCapacity,
  steerAstraura158Swarm, toggleAstraura158AgentImagination, toggleAstraura158Schedule, toggleAstraura158SwarmAgent,
  triggerAstraura158DirectorCycle, updateAstraura158AgentImaginationConfig, updateAstraura158DirectorConfig, toggleAstraura158Agent,
  type Astraura158CapacityMode, type Astraura158SwarmAgent, type Astraura158SwarmTask,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, PERMISSION_LABEL, PERMISSION_LEVEL_IDS, SELECT, SUB, TEXTAREA,
  SectionTitle, Stat, clampInt, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

const CAPACITY_MODES: { id: Astraura158CapacityMode; label: string; hint: string }[] = [
  { id: "adaptive", label: "Adaptativo", hint: "Sube y baja con tu uso, batería e inactividad." },
  { id: "performance", label: "Rendimiento", hint: "Máximo cómputo para los agentes." },
  { id: "eco", label: "Eco", hint: "Mínimo consumo; ideal con batería." },
  { id: "manual", label: "Manual", hint: "Porcentaje fijo que tú decides." },
];

const IMAG_FREQ = ["cada_ciclo", "frecuente", "normal", "ocasional", "solo_manual"];

function AgentRow({ a, target, busy, wrap, reload }: { a: Astraura158SwarmAgent; target: S158TabProps["target"]; busy: string; wrap: (l: string, fn: () => Promise<unknown>) => Promise<void>; reload: () => Promise<void> }) {
  const on = !/disabled|off|inactive|paused/i.test(String(a.status ?? "idle"));
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color ?? "#22d3ee", boxShadow: `0 0 8px ${a.color ?? "#22d3ee"}` }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{a.name}</p>
        <Badge tone={levelTone(a.status)}>{a.status ?? "idle"}</Badge>
        <Switch checked={on} disabled={busy !== ""} aria-label={`Agente ${a.name} ${on ? "activo" : "inactivo"}`}
          onCheckedChange={(v) => { void wrap(`ag:${a.id}`, () => runS158(`${a.name}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158SwarmAgent(target, a.id, v), { after: reload })); }} />
      </div>
      <p className="text-[10px] text-white/55">{a.role ?? ""}{a.current_task ? ` · ${a.current_task}` : ""}</p>
      {typeof a.progress === "number" && a.progress > 0 && a.progress < 100 && <Bar value={a.progress} />}
      <div className="flex flex-wrap gap-1">
        {(a.used_personalities ?? []).map((p) => <Badge key={p.id} tone="border-fuchsia-400/25 text-fuchsia-100/90">{p.name}</Badge>)}
        {(a.linked_cerebros ?? []).map((c) => <Badge key={c.id} tone="border-violet-400/25 text-violet-100/90">🧠 {c.name}</Badge>)}
      </div>
      <p className={MONO}>{a.completed_tasks ?? 0} tareas · {a.subagents_spawned ?? 0} subagentes · concurrencia {a.concurrency ?? 1}</p>
    </div>
  );
}

function TaskRow({ t, busy, onCancel }: { t: Astraura158SwarmTask; busy: string; onCancel: (id: string) => void }) {
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={t.prompt}>{t.title ?? t.id}</p>
        <Badge tone={levelTone(t.status)}>{t.phase_label ?? t.status ?? ""}</Badge>
        {t.status === "running" && <button type="button" className={BTN_DANGER} disabled={busy !== ""} onClick={() => onCancel(t.id)} aria-label={`Cancelar ${t.title ?? t.id}`}><BusyIcon busy={busy === `cancel:${t.id}`} icon={Square} /></button>}
      </div>
      <Bar value={t.progress ?? 0} tone={t.status === "running" ? "bg-cyan-400/70" : "bg-emerald-400/60"} />
      <p className={MONO}>{t.agent_name ?? t.agent_id ?? "?"} · {t.area_name ?? t.area_id ?? ""} · {t.allocated_cpu_percent ?? 0}% CPU · {Math.round(t.real_memory_mb ?? 0)} MB · {fmtAgo(t.started_at)}</p>
    </div>
  );
}

export function AgentesTab({ target, manifest, refresh }: S158TabProps) {
  const swarm = useS158Load(fetchAstraura158Swarm, target, 15_000);
  const director = useS158Load(fetchAstraura158Director, target, 30_000);
  const vault = useS158Load(fetchAstraura158VaultAgents, target);
  const { busy, wrap } = useBusy();
  const [directive, setDirective] = useState("");
  const [task, setTask] = useState({ area_id: "", title: "", prompt: "", agent_id: "" });
  const [sched, setSched] = useState({ title: "", area_id: "", agent_id: "", frequency_minutes: 60, prompt: "" });
  const [manualPct, setManualPct] = useState(30);

  const reloadSwarm = useCallback(async () => { await swarm.reload(true); }, [swarm]);
  const reloadDirector = useCallback(async () => { await director.reload(true); }, [director]);
  const reloadVault = useCallback(async () => { await vault.reload(true); await refresh(); }, [vault, refresh]);

  const s = swarm.data;
  const d = director.data;
  const cfg = d?.config ?? d?.director?.config ?? {};
  const gov = s?.capacity_governor;
  const areas = s?.areas ?? [];
  const agents = s?.agents ?? [];
  const tasks = s?.active_tasks ?? [];
  const schedules = s?.schedules ?? [];
  const vaultAgents = vault.data?.agents ?? [];
  const ecosystem = (manifest?.agents ?? []).filter((a) => a.origin === "ecosystem");

  return (
    <div className="space-y-3">
      {/* Director */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Crown} title={`Director · ${d?.director?.name ?? "Metis Prime"}`} tone="text-amber-300"
          hint="Supervisa al enjambre: audita calidad, enruta resultados a proyectos, inyecta axiomas y dispara imaginación cuando hace falta."
          right={<button type="button" className={BTN} onClick={() => { void director.reload(); }} aria-label="Recargar director"><RefreshCw className={cn("h-3 w-3", director.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!d && <Empty loading={director.loading} error={director.error} text="El backend no expone el Director." />}
        {d && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Estado" value={d.director?.status ?? "—"} hint={`modo ${cfg.orchestration_mode ?? "—"} · v${d.director?.version ?? "?"}`} />
              <Stat label="Tareas supervisadas" value={d.director?.tasks_supervised_count ?? 0} hint={`${d.director?.verifications_completed_count ?? 0} verificaciones`} />
              <Stat label="Enrutados" value={d.director?.routings_performed_count ?? 0} hint={`umbral de calidad ${cfg.quality_threshold ?? "—"}`} />
              <Stat label="Supervisión" value={`${cfg.supervision_interval_seconds ?? "—"} s`} hint={`máx. ${cfg.max_agent_concurrency ?? "—"} agentes · ${cfg.m1_hardware_limit_percent ?? "—"}% hardware`} />
            </div>
            {d.director?.active_directive && <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/[0.06] px-2 py-1 text-[11px] text-amber-100/90"><span className="text-amber-200/70">Directiva activa · </span>{d.director.active_directive}</p>}
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
              <Field label="Nueva directiva para el enjambre" className="min-w-[240px] flex-1"><input className={INPUT} value={directive} onChange={(e) => setDirective(e.target.value)} placeholder={cfg.default_master_directive ?? "p. ej. prioriza la memoria del OS"} aria-label="Directiva" /></Field>
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
            {(d.decision_history ?? []).length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {(d.decision_history ?? []).slice(-5).reverse().map((h, i) => (
                  <li key={h.id ?? i} className="truncate text-[10px] text-white/60" title={h.reasoning}><span className={MONO}>{fmtAgo(h.timestamp)}</span> · <span className="text-white/85">{h.action}</span>{h.agent_id ? ` → ${h.agent_id}` : ""}{h.reasoning ? ` — ${h.reasoning}` : ""}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Gobernador de capacidad */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Gauge} title="Enjambre · gobernador de capacidad" tone="text-cyan-300"
          hint="Cuánto cómputo pueden usar los agentes de fondo sin estorbarte."
          right={<button type="button" className={BTN} onClick={() => { void swarm.reload(); }} aria-label="Recargar enjambre"><RefreshCw className={cn("h-3 w-3", swarm.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!s && <Empty loading={swarm.loading} error={swarm.error} text="El backend no expone el enjambre." />}
        {s && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Modo" value={gov?.capacity_mode ?? "—"} hint={gov?.adaptation_reason} />
              <Stat label="Capacidad" value={`${gov?.relative_capacity_percent ?? 0}%`} hint={`${gov?.allocated_cores ?? 0} núcleos`} />
              <Stat label="Libres para ti" value={gov?.free_cores_for_user ?? 0} hint="núcleos" />
              <Stat label="CPU sistema" value={`${Math.round(gov?.system_cpu_usage ?? 0)}%`} hint={`inactivo ${Math.round(gov?.idle_seconds ?? 0)} s`} />
              <Stat label="Batería" value={gov?.battery_percent == null ? "—" : `${gov.battery_percent}%`} hint={gov?.is_charging ? "cargando" : ""} />
              <Stat label="Agentes activos" value={s.total_active_agents ?? agents.length} hint={`${s.total_completed_tasks ?? 0} tareas hechas`} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {CAPACITY_MODES.map((m) => (
                <button key={m.id} type="button" title={m.hint} className={cn(BTN, gov?.capacity_mode === m.id && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")} disabled={busy !== ""} aria-pressed={gov?.capacity_mode === m.id}
                  onClick={() => { void wrap(`cap:${m.id}`, () => runS158(`Capacidad: ${m.label}`, () => setAstraura158SwarmCapacity(target, m.id, m.id === "manual" ? manualPct : undefined), { after: reloadSwarm })); }}>
                  <BusyIcon busy={busy === `cap:${m.id}`} icon={Zap} /> {m.label}
                </button>
              ))}
              <label className="flex items-center gap-1 text-[10px] text-white/60">manual
                <input type="number" min={5} max={95} value={manualPct} onChange={(e) => setManualPct(clampInt(e.target.value, 5, 95, 30))} className={cn(INPUT, "w-14 py-0.5")} aria-label="Porcentaje manual" />%
              </label>
            </div>
          </>
        )}
      </div>

      {/* Agentes del enjambre por área */}
      {s && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Bot} title={`Agentes del enjambre (${agents.length}) · ${areas.length} áreas`} tone="text-cyan-300" hint="Cada agente trabaja con sus personalidades 1.58 y los cerebros que tiene vinculados." />
          <div className="mt-2 space-y-3">
            {areas.map((ar) => {
              const list = agents.filter((a) => a.area_id === ar.id);
              if (!list.length) return null;
              return (
                <div key={ar.id}>
                  <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-white/85"><span className="h-2 w-2 rounded-full" style={{ background: ar.color ?? "#22d3ee" }} aria-hidden="true" />{ar.name}<span className={MONO}>{ar.lead_name ? `líder ${ar.lead_name}` : ""}</span></p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((a) => <AgentRow key={a.id} a={a} target={target} busy={busy} wrap={wrap} reload={reloadSwarm} />)}
                  </div>
                </div>
              );
            })}
            {agents.filter((a) => !areas.some((ar) => ar.id === a.area_id)).length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {agents.filter((a) => !areas.some((ar) => ar.id === a.area_id)).map((a) => <AgentRow key={a.id} a={a} target={target} busy={busy} wrap={wrap} reload={reloadSwarm} />)}
              </div>
            )}
            {agents.length === 0 && <Empty text="El enjambre no tiene agentes registrados." />}
          </div>
        </div>
      )}

      {/* Tareas vivas y despacho */}
      {s && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Play} title={`Tareas en curso (${tasks.length})`} tone="text-emerald-300" hint="Fases reales del ejecutor; cancelar detiene el hilo del agente." />
            <div className="mt-2 space-y-1.5">
              {tasks.length === 0 && <Empty text="Sin tareas activas." />}
              {tasks.map((t) => <TaskRow key={t.id} t={t} busy={busy} onCancel={(id) => { void wrap(`cancel:${id}`, () => runS158("Tarea cancelada", () => cancelAstraura158Task(target, id), { after: reloadSwarm })); }} />)}
            </div>
          </div>
          <div className={cn(CARD, "p-3")}>
            <SectionTitle icon={Send} title="Despachar una tarea" tone="text-emerald-300" hint="Elige área (y agente opcional), título y encargo; el enjambre la ejecuta de fondo con el modelo 1.58." />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Área"><select className={SELECT} value={task.area_id} onChange={(e) => setTask({ ...task, area_id: e.target.value, agent_id: "" })} aria-label="Área"><option value="">elige…</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="Agente (opcional)"><select className={SELECT} value={task.agent_id} onChange={(e) => setTask({ ...task, agent_id: e.target.value })} aria-label="Agente"><option value="">automático</option>{agents.filter((a) => !task.area_id || a.area_id === task.area_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="Título" className="sm:col-span-2"><input className={INPUT} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} aria-label="Título de la tarea" /></Field>
              <Field label="Encargo" className="sm:col-span-2"><textarea className={TEXTAREA} value={task.prompt} onChange={(e) => setTask({ ...task, prompt: e.target.value })} aria-label="Encargo" /></Field>
            </div>
            <button type="button" className={cn(BTN_PRIMARY, "mt-2")} disabled={busy !== "" || !task.area_id || !task.title.trim() || !task.prompt.trim()} aria-label="Despachar tarea"
              onClick={() => { void wrap("dispatch", () => runS158("Tarea despachada", () => dispatchAstraura158Task(target, { area_id: task.area_id, title: task.title.trim(), prompt: task.prompt.trim(), agent_id: task.agent_id || undefined }), { description: (r) => r.task?.agent_name ? `la ejecuta ${r.task.agent_name}` : r.message, after: async () => { setTask({ area_id: "", title: "", prompt: "", agent_id: "" }); await reloadSwarm(); } })); }}>
              <BusyIcon busy={busy === "dispatch"} icon={Send} /> Despachar
            </button>
          </div>
        </div>
      )}

      {/* Programaciones */}
      {s && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Timer} title={`Programaciones (${schedules.length})`} tone="text-violet-300" hint="Tareas que el enjambre repite solo cada N minutos." />
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {schedules.map((sc) => (
              <div key={sc.id} className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={sc.prompt}>{sc.title ?? sc.id}</p>
                  <Switch checked={!!sc.is_enabled} disabled={busy !== ""} aria-label={`Programación ${sc.title ?? sc.id}`}
                    onCheckedChange={(v) => { void wrap(`sch:${sc.id}`, () => runS158(`${sc.title ?? "Programación"}: ${v ? "activada" : "pausada"}`, () => toggleAstraura158Schedule(target, sc.id, v), { after: reloadSwarm })); }} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-white/60">cada
                    <input type="number" min={1} max={10080} defaultValue={sc.frequency_minutes ?? 60} className={cn(INPUT, "w-16 py-0.5")} aria-label="Frecuencia en minutos" disabled={busy !== ""}
                      onBlur={(e) => { const v = clampInt(e.target.value, 1, 10080, sc.frequency_minutes ?? 60); if (v !== sc.frequency_minutes) void wrap(`schf:${sc.id}`, () => runS158(`${sc.title ?? "Programación"}: cada ${v} min`, () => setAstraura158ScheduleFrequency(target, sc.id, v), { after: reloadSwarm })); }} /> min
                  </label>
                  <p className={cn(MONO, "ml-auto")}>{sc.assigned_agent ?? ""} · próx. {sc.next_run_timestamp ? fmtAgo(sc.next_run_timestamp) : "—"}{sc.last_result ? ` · ${sc.last_result}` : ""}</p>
                </div>
              </div>
            ))}
            <div className={cn(SUB, "flex flex-col gap-2 px-3 py-2")}>
              <p className="text-[11px] font-semibold text-white/85">Nueva programación</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={INPUT} placeholder="Título" value={sched.title} onChange={(e) => setSched({ ...sched, title: e.target.value })} aria-label="Título de la programación" />
                <input type="number" min={1} className={INPUT} value={sched.frequency_minutes} onChange={(e) => setSched({ ...sched, frequency_minutes: clampInt(e.target.value, 1, 10080, 60) })} aria-label="Minutos" />
                <select className={SELECT} value={sched.area_id} onChange={(e) => setSched({ ...sched, area_id: e.target.value })} aria-label="Área"><option value="">área…</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <select className={SELECT} value={sched.agent_id} onChange={(e) => setSched({ ...sched, agent_id: e.target.value })} aria-label="Agente"><option value="">agente…</option>{agents.filter((a) => !sched.area_id || a.area_id === sched.area_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <input className={cn(INPUT, "sm:col-span-2")} placeholder="Encargo (opcional)" value={sched.prompt} onChange={(e) => setSched({ ...sched, prompt: e.target.value })} aria-label="Encargo" />
              </div>
              <button type="button" className={BTN} disabled={busy !== "" || !sched.title.trim() || !sched.area_id || !sched.agent_id} aria-label="Crear programación"
                onClick={() => { void wrap("sched", () => runS158("Programación creada", () => createAstraura158Schedule(target, { ...sched, title: sched.title.trim(), prompt: sched.prompt.trim() || undefined }), { after: async () => { setSched({ title: "", area_id: "", agent_id: "", frequency_minutes: 60, prompt: "" }); await reloadSwarm(); } })); }}>
                <BusyIcon busy={busy === "sched"} icon={Plus} /> Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bóveda: imaginación por agente */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Sparkles} title={`Agentes de la bóveda (${vaultAgents.length}) · imaginación propia`} tone="text-fuchsia-300"
          hint="Cada agente puede imaginar de fondo por su cuenta con su frecuencia, nivel de permisos y cuota de CPU."
          right={<button type="button" className={BTN} onClick={() => { void vault.reload(); }} aria-label="Recargar bóveda"><RefreshCw className={cn("h-3 w-3", vault.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {vaultAgents.length === 0 && <Empty loading={vault.loading} error={vault.error} text="Sin agentes en la bóveda." />}
          {vaultAgents.map((a) => (
            <div key={a.id} className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color ?? "#d946ef" }} aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{a.emoji ? `${a.emoji} ` : ""}{a.name}</p>
                <Badge tone={levelTone(a.status)}>{a.status ?? (a.enabled === false ? "off" : "on")}</Badge>
              </div>
              <p className="line-clamp-2 text-[10px] text-white/55">{a.role ?? ""}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[10px] text-white/70">
                  <Switch checked={a.enabled !== false} disabled={busy !== ""} aria-label={`Agente ${a.name} activo`}
                    onCheckedChange={(v) => { void wrap(`va:${a.id}`, () => runS158(`${a.name}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158Agent(target, a.id, v), { after: reloadVault })); }} /> activo
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-white/70">
                  <Switch checked={!!a.imagination_enabled} disabled={busy !== ""} aria-label={`Imaginación de ${a.name}`}
                    onCheckedChange={(v) => { void wrap(`vi:${a.id}`, () => runS158(`${a.name}: imaginación ${v ? "activada" : "desactivada"}`, () => toggleAstraura158AgentImagination(target, a.id, v), { after: reloadVault })); }} /> imagina
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className={cn(SELECT, "py-0.5")} value={a.imagination_frequency ?? "normal"} disabled={busy !== ""} aria-label={`Frecuencia de imaginación de ${a.name}`}
                  onChange={(e) => { void wrap(`vf:${a.id}`, () => runS158(`${a.name}: frecuencia ${e.target.value}`, () => updateAstraura158AgentImaginationConfig(target, a.id, { imagination_frequency: e.target.value }), { after: reloadVault })); }}>
                  {IMAG_FREQ.map((f) => <option key={f} value={f}>{f.replace("_", " ")}</option>)}
                </select>
                <select className={cn(SELECT, "py-0.5")} value={PERMISSION_LEVEL_IDS.includes((a.imagination_permission_level ?? "") as (typeof PERMISSION_LEVEL_IDS)[number]) ? a.imagination_permission_level : "always_ask"} disabled={busy !== ""} aria-label={`Permisos de imaginación de ${a.name}`}
                  onChange={(e) => { void wrap(`vp:${a.id}`, () => runS158(`${a.name}: ${PERMISSION_LABEL[e.target.value] ?? e.target.value}`, () => updateAstraura158AgentImaginationConfig(target, a.id, { imagination_permission_level: e.target.value }), { after: reloadVault })); }}>
                  {PERMISSION_LEVEL_IDS.map((id) => <option key={id} value={id}>{PERMISSION_LABEL[id] ?? id}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-white/60">CPU
                  <input type="number" min={1} max={100} defaultValue={a.cpu_quota_percent ?? 10} className={cn(INPUT, "w-14 py-0.5")} disabled={busy !== ""} aria-label={`Cuota de CPU de ${a.name}`}
                    onBlur={(e) => { const v = clampInt(e.target.value, 1, 100, a.cpu_quota_percent ?? 10); if (v !== (a.cpu_quota_percent ?? 10)) void wrap(`vc:${a.id}`, () => runS158(`${a.name}: ${v}% de CPU`, () => updateAstraura158AgentImaginationConfig(target, a.id, { cpu_quota_percent: v }), { after: reloadVault })); }} />%
                </label>
              </div>
              <p className={MONO}>{(a.used_personalities ?? []).map((p) => p.name).join(" · ") || "sin personalidades"}{a.compute_trunk ? ` · tronco ${a.compute_trunk}` : ""}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ecosistema (agentes de sistema) */}
      {ecosystem.length > 0 && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Bot} title={`Agentes del ecosistema (${ecosystem.length})`} tone="text-white/70" hint="Agentes de sistema del backend (enrutado de almacenamiento, autorizaciones, proyectos…): estado real y activación." />
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {ecosystem.map((a) => (
              <div key={a.id} className={cn(SUB, "flex items-center gap-2 px-3 py-2")}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color ?? "#64748b" }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-white/90">{a.emoji ? `${a.emoji} ` : ""}{a.name}</p>
                  <p className="truncate text-[10px] text-white/50">{a.role ?? a.area ?? ""}{a.is_busy ? " · ocupado" : ""}</p>
                </div>
                <Switch checked={a.enabled !== false} disabled={busy !== ""} aria-label={`Agente ${a.name}`}
                  onCheckedChange={(v) => { void wrap(`eco:${a.id}`, () => runS158(`${a.name}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158Agent(target, a.id, v), { after: reloadVault })); }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentesTab;
