"use client";

/**
 * STUDIO 1.58 · Proyectos — proyectos maestros del backend (con agentes,
 * personalidades, cerebros y creaciones vinculadas, historial de versiones),
 * las creaciones que los procesos de fondo van dejando y los workflows
 * automáticos (cron/eventos) con ejecución manual.
 */

import { useCallback, useState } from "react";
import { FolderKanban, Layers, Play, RefreshCw, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  fetchAstraura158Creation, fetchAstraura158Creations, fetchAstraura158Projects, fetchAstraura158Workflows, runAstraura158Workflow, toggleAstraura158Workflow,
  type Astraura158CreationItem, type Astraura158Project,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, MONO, SUB, SectionTitle, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

function ProjectCard({ p }: { p: Astraura158Project }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{p.name ?? p.id}</span>
        {p.type && <Badge tone="border-white/10 text-white/55">{p.type}</Badge>}
        {p.priority && <Badge tone={levelTone(p.priority)}>{p.priority}</Badge>}
        {p.status && <Badge tone={levelTone(p.status)}>{p.status}</Badge>}
        <span className={MONO}>v{p.current_version ?? "0"}</span>
      </button>
      <Bar value={p.progress ?? 0} />
      {p.description && <p className={cn("text-[10px] leading-snug text-white/60", !open && "line-clamp-2")}>{p.description}</p>}
      <p className={MONO}>{(p.linked_agents ?? []).length} agentes · {(p.linked_personalities ?? []).length} personalidades · {(p.linked_cerebros ?? []).length} cerebros · {(p.linked_creations ?? []).length} creaciones</p>
      {open && (p.version_history ?? []).length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {(p.version_history ?? []).slice(-6).reverse().map((v, i) => <li key={`${v.version ?? i}`} className="truncate text-[10px] text-white/60"><span className={MONO}>v{v.version} · {fmtAgo(v.timestamp)}</span>{v.author ? ` · ${v.author}` : ""}{v.summary ? ` — ${v.summary}` : ""}</li>)}
        </ul>
      )}
    </div>
  );
}

function CreationCard({ c, target }: { c: Astraura158CreationItem; target: S158TabProps["target"] }) {
  const [detail, setDetail] = useState<Astraura158CreationItem | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/80" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{c.title ?? c.id}</p>
        {c.category && <Badge tone="border-white/10 text-white/55">{c.category}</Badge>}
        {c.format_type && <Badge tone="border-white/10 text-white/55">{c.format_type}</Badge>}
        <button type="button" className={BTN} disabled={loading} aria-label={`Ver ${c.title ?? c.id}`} onClick={async () => { if (detail) { setDetail(null); return; } setLoading(true); const r = await fetchAstraura158Creation(target, c.id); setLoading(false); if (r.ok && r.data.creation) setDetail(r.data.creation); }}>{detail ? "Cerrar" : loading ? "…" : "Ver"}</button>
      </div>
      <p className={MONO}>{c.agent_name ?? c.agent_id ?? "?"}{c.process_name ? ` · ${c.process_name}` : ""}{c.brain_name ? ` · 🧠 ${c.brain_name}` : ""} · v{c.current_version ?? "1"}</p>
      {(detail?.summary ?? c.summary) && <p className={cn("text-[10px] leading-snug text-white/65", !detail && "line-clamp-2")}>{detail?.summary ?? c.summary}</p>}
      {detail && typeof detail.content === "string" && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-2 text-[10px] text-white/75">{String(detail.content).slice(0, 4000)}</pre>}
    </div>
  );
}

export function ProyectosTab({ target }: S158TabProps) {
  const projects = useS158Load(fetchAstraura158Projects, target, 30_000);
  const creations = useS158Load(fetchAstraura158Creations, target, 30_000);
  const workflows = useS158Load(fetchAstraura158Workflows, target);
  const { busy, wrap } = useBusy();
  const reloadWf = useCallback(async () => { await workflows.reload(true); }, [workflows]);

  const plist = projects.data?.projects ?? [];
  const clist = creations.data?.creations ?? [];
  const wlist = workflows.data?.workflows ?? [];

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={FolderKanban} title={`Proyectos maestros (${projects.data?.total ?? plist.length})`} tone="text-cyan-300" hint="El Director enruta aquí los resultados del enjambre; cada proyecto lleva su versión e historial."
          right={<button type="button" className={BTN} onClick={() => { void projects.reload(); }} aria-label="Recargar proyectos"><RefreshCw className={cn("h-3 w-3", projects.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {plist.length === 0 && <Empty loading={projects.loading} error={projects.error} text="Sin proyectos todavía." />}
          {plist.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Layers} title={`Creaciones (${clist.length})`} tone="text-fuchsia-300" hint="Artefactos que dejan la imaginación y el enjambre (documentos, código, diseños) con su cerebro y proceso de origen."
          right={<button type="button" className={BTN} onClick={() => { void creations.reload(); }} aria-label="Recargar creaciones"><RefreshCw className={cn("h-3 w-3", creations.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {clist.length === 0 && <Empty loading={creations.loading} error={creations.error} text="Sin creaciones todavía." />}
          {clist.slice(0, 30).map((c) => <CreationCard key={c.id} c={c} target={target} />)}
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Workflow} title={`Workflows automáticos (${wlist.length})`} tone="text-emerald-300" hint="Secuencias que el backend ejecuta por cron o por evento; puedes lanzarlas a mano."
          right={<button type="button" className={BTN} onClick={() => { void workflows.reload(); }} aria-label="Recargar workflows"><RefreshCw className={cn("h-3 w-3", workflows.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {wlist.length === 0 && <Empty loading={workflows.loading} error={workflows.error} text="Sin workflows." />}
          {wlist.map((w) => (
            <div key={w.id} className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{w.name ?? w.id}</p>
                <Badge tone="border-white/10 text-white/55">{w.trigger_type ?? w.trigger ?? "manual"}</Badge>
                <Switch checked={w.status !== "disabled"} disabled={busy !== ""} aria-label={`Workflow ${w.name ?? w.id}`}
                  onCheckedChange={(v) => { void wrap(`wf:${w.id}`, () => runS158(`${w.name ?? "Workflow"}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158Workflow(target, w.id, v), { after: reloadWf })); }} />
                <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label={`Ejecutar ${w.name ?? w.id}`}
                  onClick={() => { void wrap(`run:${w.id}`, () => runS158(`${w.name ?? "Workflow"} ejecutado`, () => runAstraura158Workflow(target, w.id), { description: (d) => `${d.steps_executed ?? (d.results ?? d.step_results ?? []).length} paso(s)`, after: reloadWf })); }}>
                  <BusyIcon busy={busy === `run:${w.id}`} icon={Play} />
                </button>
              </div>
              {w.description && <p className="line-clamp-2 text-[10px] text-white/60">{w.description}</p>}
              <p className={MONO}>{w.cron_expression ? `cron ${w.cron_expression} · ` : ""}{(w.steps ?? []).length} pasos · {w.executions_count ?? 0} ejecuciones{w.last_run ? ` · última ${w.last_run}` : ""}{w.auto_learn ? " · auto-aprende" : ""}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProyectosTab;
