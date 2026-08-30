"use client";

/**
 * STUDIO 1.58 · Imaginación intuitiva — el proceso de fondo que piensa solo:
 * ciclos, ramas (hipótesis → insights), propuestas que esperan aprobación,
 * tipos de proceso con su política de permisos, tronco dual de CPU
 * (imaginación ↔ enjambre), sueños e informes de síntesis.
 *
 * Todo lo que se enseña sale de `/api/imagination/*`, `/api/system/dual_trunk`,
 * `/api/dream/status` y `/api/imagination/synthesis_reports`. Cada rama dice si
 * la generó el modelo real (`generated_by: llm`) o una plantilla.
 */

import { useCallback, useState } from "react";
import { Sparkles, Play, Recycle, CheckCheck, Check, X, Settings2, Moon, FileText, Cpu, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  applyAllAstraura158Proposals, fetchAstraura158DreamStatus, fetchAstraura158ImaginationStatus, fetchAstraura158SynthesisReports,
  generateAstraura158SynthesisReport, grantAllAstraura158Requests, imaginationAstraura158Action, recycleAstraura158Imagination,
  setAstraura158DualTrunk, triggerAstraura158Imagination, updateAstraura158ImaginationConfig, updateAstraura158ProcessConfig,
  updateAstraura158ProcessPolicy, type Astraura158Branch, type Astraura158ProcessType, type Astraura158SynthesisReport,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, PERMISSION_LABEL, PERMISSION_LEVEL_IDS, SELECT, SUB,
  SectionTitle, Stat, clampInt, fmtAgo, fmtCountdown, levelTone, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

function generatedBy(b: Astraura158Branch): "llm" | "template" | undefined {
  const v = (b as unknown as Record<string, unknown>).generated_by;
  return v === "llm" ? "llm" : v === "template" ? "template" : undefined;
}

function BranchCard({ b, busy, onAction }: { b: Astraura158Branch; busy: string; onAction: (id: string, action: "apply" | "discard") => void }) {
  const gen = generatedBy(b);
  const pending = b.requires_user_approval && !/applied|discarded|rejected|done/i.test(String(b.status ?? ""));
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={b.theme}>{b.theme ?? b.id}</p>
        {b.process_name && <Badge tone="border-white/10 text-white/60">{b.process_name}</Badge>}
        {b.importance_level && <Badge tone={levelTone(b.importance_level)}>{b.importance_level}</Badge>}
        {gen && <Badge tone={gen === "llm" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}>{gen === "llm" ? "modelo real" : "plantilla"}</Badge>}
        {b.status && <Badge tone={levelTone(b.status)}>{b.status}</Badge>}
      </div>
      {b.hypothesis && <p className="text-[10px] leading-snug text-white/70"><span className="text-white/40">Hipótesis · </span>{b.hypothesis}</p>}
      {b.insights && <p className="line-clamp-3 text-[10px] leading-snug text-white/60"><span className="text-white/40">Insights · </span>{b.insights}</p>}
      {typeof b.progress_percent === "number" && b.progress_percent < 100 && <Bar value={b.progress_percent} />}
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className={MONO}>{b.formatted_time ?? fmtAgo(b.timestamp)}{b.verification?.is_verified ? ` · verificada ${b.verification.score ?? ""}` : ""}{b.applied_by ? ` · aplicada por ${b.applied_by}` : ""}</p>
        {pending && (
          <div className="flex gap-1">
            <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} onClick={() => onAction(b.id, "apply")} aria-label={`Aplicar ${b.theme ?? b.id}`}><BusyIcon busy={busy === `apply:${b.id}`} icon={Check} /> Aplicar</button>
            <button type="button" className={BTN_DANGER} disabled={busy !== ""} onClick={() => onAction(b.id, "discard")} aria-label={`Descartar ${b.theme ?? b.id}`}><BusyIcon busy={busy === `discard:${b.id}`} icon={X} /> Descartar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessRow({ p, target, busy, wrap, reload }: { p: Astraura158ProcessType; target: S158TabProps["target"]; busy: string; wrap: (label: string, fn: () => Promise<unknown>) => Promise<void>; reload: () => Promise<void> }) {
  const level = p.permission_policy?.level ?? p.default_permission_level ?? "always_ask";
  const active = /active|running|on/i.test(String(p.status ?? "active")) && !p.is_auto_paused_by_limit;
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? "#a855f7", boxShadow: `0 0 8px ${p.color ?? "#a855f7"}` }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{p.icon ? `${p.icon} ` : ""}{p.name}</p>
        {p.is_auto_paused_by_limit && <Badge tone="border-amber-400/30 text-amber-200">pausado por límite</Badge>}
        <Switch
          checked={active}
          disabled={busy !== ""}
          aria-label={`Proceso ${p.name} ${active ? "activo" : "inactivo"}`}
          onCheckedChange={(v) => { void wrap(`proc:${p.id}`, () => runS158(`${p.name}: ${v ? "activado" : "pausado"}`, () => updateAstraura158ProcessConfig(target, p.id, { status: v ? "active" : "paused" }), { after: reload })); }}
        />
      </div>
      {p.description && <p className="line-clamp-2 text-[10px] leading-snug text-white/55">{p.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[10px] text-white/60">
          <ShieldCheck className="h-3 w-3 text-white/40" aria-hidden="true" /> permisos
          <select
            className={cn(SELECT, "py-0.5")}
            value={PERMISSION_LEVEL_IDS.includes(level as (typeof PERMISSION_LEVEL_IDS)[number]) ? level : "always_ask"}
            disabled={busy !== ""}
            aria-label={`Nivel de permisos de ${p.name}`}
            onChange={(e) => { void wrap(`policy:${p.id}`, () => runS158(`${p.name}: política ${PERMISSION_LABEL[e.target.value] ?? e.target.value}`, () => updateAstraura158ProcessPolicy(target, p.id, { ...(p.permission_policy ?? {}), level: e.target.value }), { after: reload })); }}
          >
            {PERMISSION_LEVEL_IDS.map((id) => <option key={id} value={id}>{PERMISSION_LABEL[id] ?? id}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] text-white/60">
          CPU
          <input
            type="number" min={1} max={100} defaultValue={p.allocated_resource_percent ?? 10} className={cn(INPUT, "w-14 py-0.5")} disabled={busy !== ""}
            aria-label={`Porcentaje de CPU asignado a ${p.name}`}
            onBlur={(e) => { const v = clampInt(e.target.value, 1, 100, p.allocated_resource_percent ?? 10); if (v !== (p.allocated_resource_percent ?? 10)) void wrap(`cpu:${p.id}`, () => runS158(`${p.name}: ${v}% de CPU`, () => updateAstraura158ProcessConfig(target, p.id, { allocated_resource_percent: v }), { after: reload })); }}
          />%
        </label>
        <p className={cn(MONO, "ml-auto")}>{p.cycles_count ?? 0} ciclos · {p.pending_proposals_count ?? 0} pendientes{p.last_activated_formatted ? ` · ${p.last_activated_formatted}` : ""}</p>
      </div>
    </div>
  );
}

function ReportCard({ r }: { r: Astraura158SynthesisReport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(SUB, "px-3 py-2")}>
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <FileText className="h-3.5 w-3.5 shrink-0 text-white/50" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{r.title ?? `Informe ${r.synthesis_index ?? ""}`}</span>
        <span className={MONO}>{r.formatted_date ?? fmtAgo(r.timestamp)}{r.author_agent?.name ? ` · ${r.author_agent.name}` : ""}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 text-[10px] leading-snug text-white/70">
          {r.executive_summary && <p>{r.executive_summary}</p>}
          {r.participating_agents && r.participating_agents.length > 0 && (
            <ul className="space-y-0.5">
              {r.participating_agents.map((a, i) => <li key={`${a.id ?? i}`}><span className="text-white/90">{a.name}</span>{a.role ? ` (${a.role})` : ""}{a.process_developed ? ` — ${a.process_developed}` : ""}{a.result ? `: ${a.result}` : ""}</li>)}
            </ul>
          )}
          {r.delta_changes && (
            <p className={MONO}>
              {(r.delta_changes.new_elements ?? []).length} nuevos · {(r.delta_changes.modified_elements ?? []).length} modificados · {(r.delta_changes.improvements ?? []).length} mejoras
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ImaginacionTab({ target, refresh }: S158TabProps) {
  const { data, error, loading, reload } = useS158Load(fetchAstraura158ImaginationStatus, target, 20_000);
  const dream = useS158Load(fetchAstraura158DreamStatus, target, 30_000);
  const reports = useS158Load(fetchAstraura158SynthesisReports, target);
  const { busy, wrap } = useBusy();
  const [theme, setTheme] = useState("");
  const [processType, setProcessType] = useState("");
  const [showAll, setShowAll] = useState(false);

  const after = useCallback(async () => { await reload(true); await refresh(); }, [reload, refresh]);
  const reloadSilent = useCallback(async () => { await reload(true); }, [reload]);

  const branches = data?.branches ?? [];
  const pending = branches.filter((b) => b.requires_user_approval && !/applied|discarded|rejected|done/i.test(String(b.status ?? "")));
  const shown = showAll ? branches : branches.slice(0, 12);
  const types = data?.process_types_catalog ?? [];
  const trunk = data?.dual_trunk;

  const onAction = (id: string, action: "apply" | "discard") => {
    void wrap(`${action}:${id}`, () => runS158(action === "apply" ? "Propuesta aplicada" : "Propuesta descartada", () => imaginationAstraura158Action(target, id, "branch", action), { after }));
  };

  const setConfig = (label: string, patch: Parameters<typeof updateAstraura158ImaginationConfig>[1]) =>
    wrap(label, () => runS158(label, () => updateAstraura158ImaginationConfig(target, patch), { after: reloadSilent }));

  return (
    <div className="space-y-3">
      {/* Estado y disparo */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Sparkles} title="Imaginación intuitiva (proceso de fondo)" tone="text-fuchsia-300"
          hint="Cada ciclo elige un tipo de proceso, imagina una hipótesis y deja insights; lo importante pide tu aprobación según la política de permisos."
          right={<button type="button" className={BTN} onClick={() => { void reload(); }} aria-label="Recargar imaginación"><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} aria-hidden="true" /></button>}
        />
        {!data && <Empty loading={loading} error={error} text="El backend no expone la imaginación." />}
        {data && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Estado" value={data.is_paused_due_to_threshold ? "pausada (límite)" : data.is_dreaming_now ? "imaginando" : data.is_always_on ? "activa" : "en espera"} hint={data.operation_mode} />
              <Stat label="Próximo ciclo" value={data.is_dreaming_now ? "ahora" : fmtCountdown(data.next_cycle_seconds_left)} hint={`cada ${data.cycle_frequency_minutes ?? "?"} min`} />
              <Stat label="Ciclos" value={data.cycles_completed ?? 0} hint={`${data.active_processes_count ?? 0} procesos activos`} />
              <Stat label="Pendientes" value={pending.length} hint={`${data.total_proposals_count ?? branches.length} propuestas`} />
              <Stat label="Agentes" value={data.active_agents_count ?? 0} hint="imaginando de fondo" />
              <Stat label="Generado" value={`${Math.round(data.hourly_generated_kb ?? 0)} KB/h`} hint={`${(data.daily_generated_mb ?? 0).toFixed(1)} MB hoy`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-white/80">
                <Switch checked={!!data.is_always_on} disabled={busy !== ""} aria-label="Imaginación siempre activa" onCheckedChange={(v) => { void setConfig(v ? "Imaginación siempre activa" : "Imaginación en pausa", { is_always_on: v }); }} />
                siempre activa
              </label>
              <label className="flex items-center gap-1 text-[11px] text-white/80">
                cada
                <input type="number" min={1} max={1440} defaultValue={data.cycle_frequency_minutes ?? 15} className={cn(INPUT, "w-16")} disabled={busy !== ""} aria-label="Frecuencia del ciclo en minutos"
                  onBlur={(e) => { const v = clampInt(e.target.value, 1, 1440, data.cycle_frequency_minutes ?? 15); if (v !== data.cycle_frequency_minutes) void setConfig(`Ciclo cada ${v} min`, { cycle_frequency_minutes: v }); }} />
                min
              </label>
              <label className="flex items-center gap-2 text-[11px] text-white/80">
                <Switch checked={!!data.auto_sync_all_proposals_enabled} disabled={busy !== ""} aria-label="Sincronizar propuestas automáticamente" onCheckedChange={(v) => { void setConfig(v ? "Auto-sincronización de propuestas activada" : "Auto-sincronización desactivada", { auto_sync_all_proposals_enabled: v }); }} />
                auto-aplicar propuestas seguras
              </label>
              <label className="flex items-center gap-2 text-[11px] text-white/80">
                <Switch checked={!!data.auto_recycle_memories} disabled={busy !== ""} aria-label="Reciclar memorias automáticamente" onCheckedChange={(v) => { void setConfig(v ? "Reciclaje automático activado" : "Reciclaje automático desactivado", { auto_recycle_memories: v }); }} />
                reciclar memorias
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Tema (opcional)" className="min-w-[200px] flex-1"><input className={INPUT} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="p. ej. mejorar la memoria del OS" aria-label="Tema del ciclo" /></Field>
              <Field label="Tipo de proceso">
                <select className={SELECT} value={processType} onChange={(e) => setProcessType(e.target.value)} aria-label="Tipo de proceso">
                  <option value="">automático</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Disparar un ciclo ahora"
                onClick={() => { void wrap("trigger", () => runS158("Ciclo de imaginación lanzado", () => triggerAstraura158Imagination(target, { theme: theme || undefined, process_type: processType || undefined }), { description: (d) => d.branch?.theme ?? (d.scheduled ? "En segundo plano: la rama llegará por eventos cuando el modelo termine." : d.message), after })); }}>
                <BusyIcon busy={busy === "trigger"} icon={Play} /> Imaginar ahora
              </button>
              <button type="button" className={BTN} disabled={busy !== "" || pending.length === 0} aria-label="Aplicar todas las propuestas pendientes"
                onClick={() => { void wrap("apply_all", () => runS158("Propuestas aplicadas", () => applyAllAstraura158Proposals(target), { description: (d) => `${d.applied_count ?? 0} aplicada(s)`, after })); }}>
                <BusyIcon busy={busy === "apply_all"} icon={CheckCheck} /> Aplicar todas ({pending.length})
              </button>
              <button type="button" className={BTN} disabled={busy !== ""} aria-label="Conceder todas las solicitudes de acceso"
                onClick={() => { void wrap("grant_all", () => runS158("Solicitudes concedidas", () => grantAllAstraura158Requests(target), { description: (d) => `${d.granted_count ?? 0} concedida(s)`, after })); }}>
                <BusyIcon busy={busy === "grant_all"} icon={ShieldCheck} /> Conceder accesos
              </button>
              <button type="button" className={BTN} disabled={busy !== ""} aria-label="Reciclar y compactar memorias imaginadas"
                onClick={() => { void wrap("recycle", () => runS158("Reciclaje ejecutado", () => recycleAstraura158Imagination(target), { description: (d) => d.recycle ? `${d.recycle.items_compacted ?? 0} compactados · ${d.recycle.space_freed_kb ?? 0} KB liberados` : d.message, after })); }}>
                <BusyIcon busy={busy === "recycle"} icon={Recycle} /> Reciclar
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tronco dual */}
      {trunk && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Cpu} title="Tronco dual de cómputo" hint="Reparto de núcleos entre la imaginación (fondo) y el enjambre (tareas); el resto queda para tu chat." tone="text-cyan-300" />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Stat label="Imaginación" value={`${trunk.imagination_global_percent ?? 0}%`} hint={`${trunk.imagination_cores ?? 0} núcleos`} />
            <Stat label="Enjambre" value={`${trunk.swarm_global_percent ?? 0}%`} hint={`${trunk.swarm_cores ?? 0} núcleos`} />
            <Stat label="Reserva para ti" value={`${trunk.interactive_reserve_percent ?? 0}%`} hint={`${trunk.user_chat_cores ?? 0} de ${trunk.total_cores ?? 0} núcleos`} />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="Imaginación %"><input id="s158-trunk-i" type="number" min={0} max={90} defaultValue={trunk.imagination_global_percent ?? 20} className={cn(INPUT, "w-20")} aria-label="Porcentaje para imaginación" /></Field>
            <Field label="Enjambre %"><input id="s158-trunk-s" type="number" min={0} max={90} defaultValue={trunk.swarm_global_percent ?? 30} className={cn(INPUT, "w-20")} aria-label="Porcentaje para enjambre" /></Field>
            <button type="button" className={BTN} disabled={busy !== ""} aria-label="Guardar reparto de cómputo"
              onClick={() => {
                const i = clampInt((document.getElementById("s158-trunk-i") as HTMLInputElement | null)?.value ?? "", 0, 90, trunk.imagination_global_percent ?? 20);
                const s = clampInt((document.getElementById("s158-trunk-s") as HTMLInputElement | null)?.value ?? "", 0, 90, trunk.swarm_global_percent ?? 30);
                void wrap("trunk", () => runS158(`Reparto guardado: ${i}% imaginación · ${s}% enjambre`, () => setAstraura158DualTrunk(target, i, s), { after: reloadSilent }));
              }}>
              <BusyIcon busy={busy === "trunk"} icon={Settings2} /> Guardar reparto
            </button>
          </div>
        </div>
      )}

      {/* Tipos de proceso */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Settings2} title={`Tipos de proceso (${types.length})`} hint="Cada tipo tiene su estado, CPU asignada y política de permisos (qué se aplica solo y qué te pregunta)." tone="text-violet-300" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {types.length === 0 && <Empty loading={loading} error={error} text="Sin catálogo de procesos." />}
          {types.map((p) => <ProcessRow key={p.id} p={p} target={target} busy={busy} wrap={wrap} reload={reloadSilent} />)}
        </div>
      </div>

      {/* Ramas */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Sparkles} title={`Ramas imaginadas (${branches.length})`} hint="Pendientes primero. «modelo real» = texto generado por el motor 1.58; «plantilla» = el backend no tenía modelo en ese ciclo." tone="text-fuchsia-300"
          right={branches.length > 12 ? <button type="button" className={BTN} onClick={() => setShowAll((v) => !v)}>{showAll ? "Ver menos" : `Ver todas (${branches.length})`}</button> : undefined} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {branches.length === 0 && <Empty loading={loading} error={error} text="Aún no hay ramas: dispara un ciclo." />}
          {/* (Adenda 178) Dedup por id, no por referencia: `pending` y `shown` pueden traer
              instancias distintas de la MISMA rama (mismo id) → key duplicada. Map preserva el
              orden de primera aparición (pendientes primero) y colapsa duplicados. */}
          {Array.from(new Map([...pending, ...shown].map((b) => [b.id, b])).values()).slice(0, showAll ? undefined : 12).map((b) => <BranchCard key={b.id} b={b} busy={busy} onAction={onAction} />)}
        </div>
      </div>

      {/* Sueños e informes */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Moon} title="Sueños (Dream Studio)" hint="Ciclo onírico de Oneiros: consolida memorias e imagina libre mientras no hablas." tone="text-indigo-300" />
          {!dream.data && <Empty loading={dream.loading} error={dream.error} text="Sin estado de sueños." />}
          {dream.data && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Estado" value={dream.data.is_dreaming ? "soñando" : dream.data.is_always_on ? "activo" : "en espera"} hint={dream.data.operation_mode} />
              <Stat label="Próximo" value={fmtCountdown(dream.data.next_cycle_seconds_left)} hint={`${dream.data.cycles_completed ?? 0} ciclos`} />
            </div>
          )}
        </div>
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={FileText} title={`Informes de síntesis (${reports.data?.total_reports ?? reports.data?.reports?.length ?? 0})`} hint="Resumen ejecutivo de lo que los agentes hicieron de fondo, firmado por el agente autor." tone="text-emerald-300"
            right={<button type="button" className={BTN} disabled={busy !== ""} aria-label="Generar informe de síntesis" onClick={() => { void wrap("report", () => runS158("Informe generado", () => generateAstraura158SynthesisReport(target, "manual_request", { theme: theme || "Solicitado desde StarSeed OS" }), { description: (d) => d.report?.title, after: async () => { await reports.reload(true); } })); }}><BusyIcon busy={busy === "report"} icon={FileText} /> Generar</button>} />
          <div className="mt-2 space-y-1.5">
            {(!reports.data || (reports.data.reports ?? []).length === 0) && <Empty loading={reports.loading} error={reports.error} text="Sin informes todavía." />}
            {(reports.data?.reports ?? []).slice(0, 8).map((r) => <ReportCard key={r.id} r={r} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImaginacionTab;
