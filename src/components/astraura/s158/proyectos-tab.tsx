"use client";

/**
 * STUDIO 1.58 · Proyectos — proyectos maestros del backend (con agentes,
 * personalidades, cerebros y creaciones vinculadas, historial de versiones),
 * las creaciones que los procesos de fondo van dejando y los workflows
 * automáticos (cron/eventos) con ejecución manual.
 *
 * Ciclo completo de proyectos y creaciones (Adenda 158 · paridad con
 * `ProjectsView.jsx` / `CreationsView.jsx` / `ProjectFullWorkspaceModal.jsx`
 * del programa original): crear y eliminar proyectos, añadir versión, forjar
 * y fusionar ramas, eliminar archivos enlazados (todo en `proyectos-dialogs.tsx`
 * para no convertir este fichero en un monolito), y en creaciones: bifurcar
 * una versión y ejecutar su muestra en el sandbox del backend viendo
 * `stdout`/`stderr` reales.
 */

import { useCallback, useState } from "react";
import { FolderKanban, GitFork, Layers, Play, PlayCircle, Plus, RefreshCw, Settings2, Terminal, Workflow } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  fetchAstraura158Creation, fetchAstraura158Creations, fetchAstraura158Project, fetchAstraura158Projects, fetchAstraura158Workflows,
  forkAstraura158CreationVersion, runAstraura158CreationSample, runAstraura158Workflow, toggleAstraura158Workflow,
  type Astraura158CreationItem, type Astraura158Project,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, SUB, TEXTAREA, SectionTitle, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";
import { CreateProjectDialog, ProjectWorkspaceDialog } from "./proyectos-dialogs";

function ProjectCard({ p, onManage }: { p: Astraura158Project; onManage: (p: Astraura158Project) => void }) {
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
      <button type="button" className={cn(BTN, "mt-1 self-start")} aria-label={`Gestionar ${p.name ?? p.id}: versiones, ramas y archivos`} onClick={() => onManage(p)}>
        <Settings2 className="h-3 w-3" aria-hidden="true" /> Gestionar
      </button>
    </div>
  );
}

function CreationCard({ c, target, onForked }: { c: Astraura158CreationItem; target: S158TabProps["target"]; onForked: () => void | Promise<void> }) {
  const [detail, setDetail] = useState<Astraura158CreationItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [forking, setForking] = useState(false);
  // Contrato REAL de `/api/creations/fork_version`: nombre de rama, resumen del
  // cambio y contenido nuevo — no «id de versión de origen», que no existe.
  const [forkBranchName, setForkBranchName] = useState("");
  const [forkNote, setForkNote] = useState("");
  const [forkContent, setForkContent] = useState("");
  const [forkBusy, setForkBusy] = useState(false);

  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleResult, setSampleResult] = useState<{ stdout?: string; stderr?: string; message?: string } | null>(null);

  const submitFork = () => {
    if (!forkBranchName.trim() || !forkNote.trim()) return;
    setForkBusy(true);
    void runS158(`${c.title ?? c.id}: bifurcación creada`, () => forkAstraura158CreationVersion(target, {
      creation_id: c.id,
      branch_name: forkBranchName.trim(),
      diff_summary: forkNote.trim(),
      // Si no se escribe contenido nuevo, se bifurca desde el que ya tiene la
      // creación: el backend exige `new_content`, no admite bifurcar en vacío.
      new_content: forkContent.trim() || String((c as Record<string, unknown>).raw_content ?? c.summary ?? ""),
    }), {
      description: (d) => d.message,
      after: async () => { setForking(false); setForkBranchName(""); setForkNote(""); setForkContent(""); await onForked(); },
    }).then(() => setForkBusy(false));
  };

  const runSample = () => {
    setSampleBusy(true);
    void (async () => {
      const r = await runAstraura158CreationSample(target, c.id);
      setSampleBusy(false);
      if (r.ok) {
        setSampleResult({ stdout: r.data.stdout, stderr: r.data.stderr, message: r.data.message });
        toast.success("Muestra ejecutada", { description: r.data.message });
      } else {
        setSampleResult(null);
        toast.error(`Muestra de ${c.title ?? c.id}: ${r.error}`);
      }
    })();
  };

  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/80" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{c.title ?? c.id}</p>
        {c.category && <Badge tone="border-white/10 text-white/55">{c.category}</Badge>}
        {c.format_type && <Badge tone="border-white/10 text-white/55">{c.format_type}</Badge>}
        <button type="button" className={BTN} disabled={loadingDetail} aria-label={`Ver ${c.title ?? c.id}`} onClick={async () => { if (detail) { setDetail(null); return; } setLoadingDetail(true); const r = await fetchAstraura158Creation(target, c.id); setLoadingDetail(false); if (r.ok && r.data.creation) setDetail(r.data.creation); }}>{detail ? "Cerrar" : loadingDetail ? "…" : "Ver"}</button>
      </div>
      <p className={MONO}>{c.agent_name ?? c.agent_id ?? "?"}{c.process_name ? ` · ${c.process_name}` : ""}{c.brain_name ? ` · 🧠 ${c.brain_name}` : ""} · v{c.current_version ?? "1"}</p>
      {(detail?.summary ?? c.summary) && <p className={cn("text-[10px] leading-snug text-white/65", !detail && "line-clamp-2")}>{detail?.summary ?? c.summary}</p>}
      {detail && typeof detail.content === "string" && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-2 text-[10px] text-white/75">{String(detail.content).slice(0, 4000)}</pre>}

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button type="button" className={BTN} disabled={forkBusy} aria-label={`Bifurcar versión de ${c.title ?? c.id}`} onClick={() => setForking((v) => !v)}>
          <GitFork className="h-3 w-3" aria-hidden="true" /> {forking ? "Cancelar bifurcación" : "Bifurcar versión"}
        </button>
        <button type="button" className={BTN} disabled={sampleBusy} aria-label={`Ejecutar muestra de ${c.title ?? c.id}`} onClick={runSample}>
          <BusyIcon busy={sampleBusy} icon={PlayCircle} /> Ejecutar muestra
        </button>
      </div>

      {forking && (
        <div className="mt-1 flex flex-col gap-1.5 rounded-md border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-2">
          <Field label="Nombre de la rama"><input className={cn(INPUT, "font-mono")} value={forkBranchName} onChange={(e) => setForkBranchName(e.target.value)} aria-label="Nombre de la rama de la bifurcación" placeholder="v2-neon-simd" /></Field>
          <Field label="Qué cambia"><input className={INPUT} value={forkNote} onChange={(e) => setForkNote(e.target.value)} aria-label="Resumen del cambio de la bifurcación" placeholder="Vectorización sin desborde en i2_s" /></Field>
          <Field label="Contenido nuevo (opcional)"><textarea className={cn(TEXTAREA, "font-mono")} value={forkContent} onChange={(e) => setForkContent(e.target.value)} aria-label="Contenido nuevo de la bifurcación" placeholder="Vacío = se bifurca desde el contenido actual de la creación" /></Field>
          <div className="flex justify-end gap-1.5">
            <button type="button" className={BTN} disabled={forkBusy} aria-label="Cancelar bifurcación" onClick={() => setForking(false)}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={forkBusy} aria-label="Crear bifurcación" onClick={submitFork}>
              <BusyIcon busy={forkBusy} icon={GitFork} /> Crear bifurcación
            </button>
          </div>
        </div>
      )}

      {sampleResult && (
        <div className="mt-1 space-y-1 rounded-md border border-white/10 bg-black/30 p-2">
          <p className={cn(MONO, "flex items-center gap-1")}><Terminal className="h-3 w-3" aria-hidden="true" /> salida de la muestra (sandbox del backend)</p>
          {sampleResult.stdout && <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-emerald-200/90">{sampleResult.stdout}</pre>}
          {sampleResult.stderr && <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-rose-200/90">{sampleResult.stderr}</pre>}
          {!sampleResult.stdout && !sampleResult.stderr && <p className="text-[10px] text-white/45">{sampleResult.message || "Sin salida de texto (stdout/stderr vacíos)."}</p>}
        </div>
      )}
    </div>
  );
}

export function ProyectosTab({ target }: S158TabProps) {
  const projects = useS158Load(fetchAstraura158Projects, target, 30_000);
  const creations = useS158Load(fetchAstraura158Creations, target, 30_000);
  const workflows = useS158Load(fetchAstraura158Workflows, target);
  const { busy, wrap } = useBusy();
  const reloadWf = useCallback(async () => { await workflows.reload(true); }, [workflows]);
  const reloadProjects = useCallback(async () => { await projects.reload(true); }, [projects]);
  const reloadCreations = useCallback(async () => { await creations.reload(true); }, [creations]);

  const [creatingProject, setCreatingProject] = useState(false);
  const [workspaceProject, setWorkspaceProject] = useState<Astraura158Project | null>(null);

  const refreshWorkspaceProject = useCallback(async (id: string) => {
    const r = await fetchAstraura158Project(target, id);
    if (r.ok && r.data.project) setWorkspaceProject(r.data.project);
  }, [target]);

  const plist = projects.data?.projects ?? [];
  const clist = creations.data?.creations ?? [];
  const wlist = workflows.data?.workflows ?? [];

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={FolderKanban} title={`Proyectos maestros (${projects.data?.total ?? plist.length})`} tone="text-cyan-300" hint="El Director enruta aquí los resultados del enjambre; cada proyecto lleva su versión e historial."
          right={
            <>
              <button type="button" className={BTN_PRIMARY} aria-label="Crear proyecto" onClick={() => setCreatingProject(true)}><Plus className="h-3 w-3" aria-hidden="true" /> Crear proyecto</button>
              <button type="button" className={BTN} onClick={() => { void projects.reload(); }} aria-label="Recargar proyectos"><RefreshCw className={cn("h-3 w-3", projects.loading && "animate-spin")} aria-hidden="true" /></button>
            </>
          } />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {plist.length === 0 && <Empty loading={projects.loading} error={projects.error} text="Sin proyectos todavía." />}
          {plist.map((p) => <ProjectCard key={p.id} p={p} onManage={setWorkspaceProject} />)}
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Layers} title={`Creaciones (${clist.length})`} tone="text-fuchsia-300" hint="Artefactos que dejan la imaginación y el enjambre (documentos, código, diseños) con su cerebro y proceso de origen. Cada una puede bifurcarse en una nueva versión o ejecutarse como muestra en el sandbox del backend."
          right={<button type="button" className={BTN} onClick={() => { void creations.reload(); }} aria-label="Recargar creaciones"><RefreshCw className={cn("h-3 w-3", creations.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {clist.length === 0 && <Empty loading={creations.loading} error={creations.error} text="Sin creaciones todavía." />}
          {clist.slice(0, 30).map((c) => <CreationCard key={c.id} c={c} target={target} onForked={reloadCreations} />)}
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

      <CreateProjectDialog target={target} open={creatingProject} onOpenChange={setCreatingProject} onCreated={reloadProjects} />
      {workspaceProject && (
        <ProjectWorkspaceDialog
          target={target}
          project={workspaceProject}
          open={!!workspaceProject}
          onOpenChange={(v) => { if (!v) setWorkspaceProject(null); }}
          onChanged={async () => { await reloadProjects(); await refreshWorkspaceProject(workspaceProject.id); }}
        />
      )}
    </div>
  );
}

export default ProyectosTab;
