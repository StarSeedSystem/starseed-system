"use client";

/**
 * STUDIO 1.58 · Workflows — equivalente de `WorkflowsView.jsx` del programa
 * original: automatizaciones multi-paso (cron / evento / reposo / manual)
 * que el backend soberano ejecuta y de las que puede aprender.
 *
 * El OS ya podía activar/desactivar y ejecutar workflows existentes desde
 * «Proyectos»; esta pestaña añade el ciclo completo que faltaba: crear,
 * editar y eliminar, con el formulario y la confirmación de borrado
 * viviendo en diálogos del propio OS (nunca `window.confirm`/`alert`).
 */

import { useState } from "react";
import { Pencil, Play, Plus, RefreshCw, Save, Sparkles, Trash2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteAstraura158Workflow, fetchAstraura158Workflows, runAstraura158Workflow, saveAstraura158Workflow, toggleAstraura158Workflow,
  type Astraura158Workflow,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, INPUT, LABEL, MONO, SELECT, SUB, TEXTAREA,
  SectionTitle, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

const TRIGGER_OPTIONS: { id: string; label: string }[] = [
  { id: "manual", label: "Manual / a demanda" },
  { id: "cron", label: "Cron programado" },
  { id: "event", label: "Evento de sistema / archivos" },
  { id: "idle", label: "Reposo del dispositivo (dream engine)" },
];

/** Catálogo de acciones habituales del original — solo SUGERENCIAS (datalist libre): el backend puede aceptar cualquier otra. */
const ACTION_SUGGESTIONS = ["system_senses", "browser_search", "fs_scan", "sync_gdrive_context", "dream_reflect", "log_and_learn"];

type DraftStep = { action: string; desc: string };
interface WorkflowDraft {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  cron_expression: string;
  status: string;
  auto_learn: boolean;
  steps: DraftStep[];
}

function newId(): string {
  return `wf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function blankDraft(): WorkflowDraft {
  return { id: newId(), name: "", description: "", trigger_type: "manual", cron_expression: "", status: "enabled", auto_learn: true, steps: [{ action: "", desc: "" }] };
}

function toDraft(w: Astraura158Workflow): WorkflowDraft {
  const steps = (w.steps ?? []).map((s) => ({ action: s.action ?? "", desc: s.desc ?? "" }));
  return {
    id: w.id,
    name: w.name ?? "",
    description: w.description ?? "",
    trigger_type: w.trigger_type ?? "manual",
    cron_expression: w.cron_expression ?? "",
    status: w.status ?? "enabled",
    auto_learn: w.auto_learn !== false,
    steps: steps.length > 0 ? steps : [{ action: "", desc: "" }],
  };
}

function triggerLabel(triggerType: string, cron: string): string {
  if (triggerType === "cron") return cron.trim() ? `Cron: ${cron.trim()}` : "Cron programado";
  if (triggerType === "event") return "Evento: al modificar archivos locales";
  if (triggerType === "idle") return "Reposo del dispositivo / Idle";
  return "Manual / a demanda";
}

/** Validación mínima de cron (5 campos separados por espacio): no es un parser completo, solo evita errores obvios antes de enviar. */
function looksLikeCron(v: string): boolean {
  return /^\S+(\s+\S+){4}$/.test(v.trim());
}

function validateDraft(d: WorkflowDraft): string | null {
  if (!d.name.trim()) return "El workflow necesita un nombre.";
  if (d.trigger_type === "cron" && !looksLikeCron(d.cron_expression)) return "La expresión cron necesita 5 campos separados por espacios (ej. */30 * * * *).";
  if (d.steps.length === 0) return "Añade al menos un paso.";
  if (d.steps.some((s) => !s.action.trim())) return "Cada paso necesita una acción.";
  return null;
}

function WorkflowFormDialog({ open, draft, setDraft, busy, error, isNew, onCancel, onSubmit }: {
  open: boolean;
  draft: WorkflowDraft;
  setDraft: (d: WorkflowDraft) => void;
  busy: boolean;
  error: string | null;
  isNew: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Crear workflow" : `Editar «${draft.name || draft.id}»`}</DialogTitle>
          <DialogDescription>Secuencia de pasos que el backend soberano ejecuta por cron, evento o a demanda, con aprendizaje continuo opcional.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nombre del workflow" autoFocus />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <textarea className={TEXTAREA} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Descripción del workflow" />
            </Field>
            <Field label="Disparador">
              <select className={SELECT} value={draft.trigger_type} onChange={(e) => setDraft({ ...draft, trigger_type: e.target.value })} aria-label="Tipo de disparador">
                {TRIGGER_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            {draft.trigger_type === "cron" ? (
              <Field label="Expresión cron" hint="5 campos: minuto hora día mes día-semana">
                <input className={cn(INPUT, "font-mono")} value={draft.cron_expression} onChange={(e) => setDraft({ ...draft, cron_expression: e.target.value })} placeholder="*/30 * * * *" aria-label="Expresión cron" />
              </Field>
            ) : (
              <div className="flex items-end pb-1.5 text-[10px] text-white/45">{triggerLabel(draft.trigger_type, draft.cron_expression)}</div>
            )}
            <label className="flex items-center gap-2 text-[11px] text-white/80">
              <Switch checked={draft.status !== "disabled"} aria-label="Workflow activo" onCheckedChange={(v) => setDraft({ ...draft, status: v ? "enabled" : "disabled" })} /> activo
            </label>
            <label className="flex items-center gap-2 text-[11px] text-white/80">
              <Switch checked={draft.auto_learn} aria-label="Aprendizaje continuo automático" onCheckedChange={(v) => setDraft({ ...draft, auto_learn: v })} />
              <Sparkles className="h-3 w-3 text-fuchsia-300" aria-hidden="true" /> aprendizaje continuo
            </label>
          </div>

          <div className={cn(SUB, "space-y-2 p-3")}>
            <div className="flex items-center justify-between">
              <p className={LABEL}>Pasos ({draft.steps.length})</p>
              <button type="button" className={BTN} aria-label="Añadir paso" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { action: "", desc: "" }] })}>
                <Plus className="h-3 w-3" aria-hidden="true" /> Añadir paso
              </button>
            </div>
            <datalist id="s158-wf-actions">{ACTION_SUGGESTIONS.map((a) => <option key={a} value={a} />)}</datalist>
            <div className="space-y-1.5">
              {draft.steps.map((s, idx) => (
                <div key={idx} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-1.5">
                  <span className={cn(MONO, "w-5 text-center")}>{idx + 1}</span>
                  <input className={cn(INPUT, "font-mono")} list="s158-wf-actions" value={s.action} placeholder="acción (p. ej. browser_search)"
                    aria-label={`Acción del paso ${idx + 1}`}
                    onChange={(e) => { const steps = draft.steps.slice(); steps[idx] = { ...s, action: e.target.value }; setDraft({ ...draft, steps }); }} />
                  <input className={INPUT} value={s.desc} placeholder="descripción del paso"
                    aria-label={`Descripción del paso ${idx + 1}`}
                    onChange={(e) => { const steps = draft.steps.slice(); steps[idx] = { ...s, desc: e.target.value }; setDraft({ ...draft, steps }); }} />
                  <button type="button" className={cn(BTN, "px-1.5")} disabled={draft.steps.length <= 1} aria-label={`Eliminar paso ${idx + 1}`}
                    onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== idx) })}>
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
        </div>

        <DialogFooter>
          <button type="button" className={BTN} disabled={busy} aria-label="Cancelar" onClick={onCancel}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy} aria-label="Guardar workflow" onClick={onSubmit}>
            <BusyIcon busy={busy} icon={Save} /> Guardar workflow
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowsTab({ target }: S158TabProps) {
  const workflows = useS158Load(fetchAstraura158Workflows, target);
  const { busy, wrap } = useBusy();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = workflows.data?.workflows ?? [];

  const openCreate = () => { setDraft(blankDraft()); setIsNew(true); setFormError(null); };
  const openEdit = (w: Astraura158Workflow) => { setDraft(toDraft(w)); setIsNew(false); setFormError(null); };
  const closeForm = () => { if (!saving) { setDraft(null); setFormError(null); } };

  const submit = () => {
    if (!draft) return;
    const err = validateDraft(draft);
    if (err) { setFormError(err); return; }
    setFormError(null);
    const workflow: Astraura158Workflow = {
      id: draft.id,
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      trigger_type: draft.trigger_type,
      trigger: triggerLabel(draft.trigger_type, draft.cron_expression),
      cron_expression: draft.trigger_type === "cron" ? draft.cron_expression.trim() : undefined,
      status: draft.status,
      auto_learn: draft.auto_learn,
      steps: draft.steps.map((s, i) => ({ step: i + 1, action: s.action.trim(), desc: s.desc.trim() || s.action.trim() })),
    };
    setSaving(true);
    void runS158(isNew ? "Workflow creado" : "Workflow actualizado", () => saveAstraura158Workflow(target, workflow), {
      description: (d) => d.workflow?.name,
      after: async () => { setDraft(null); await workflows.reload(true); },
    }).then((ok) => {
      setSaving(false);
      // El motivo exacto ya salió por toast (runS158 muestra `r.error` del backend);
      // aquí solo dejamos constancia dentro del propio diálogo para que no se pierda.
      if (!ok) setFormError("El backend rechazó el workflow — revisa el aviso emergente para el motivo exacto.");
    });
  };

  const handleDelete = (w: Astraura158Workflow) => {
    void wrap(`wfdel:${w.id}`, async () => {
      const ok = await confirm({
        title: `¿Eliminar «${w.name ?? w.id}»?`,
        description: "Se borra del backend soberano de esta neurona. Esta acción no se puede deshacer.",
        confirmText: "Eliminar", cancelText: "Cancelar", destructive: true,
      });
      if (!ok) return;
      await runS158("Workflow eliminado", () => deleteAstraura158Workflow(target, w.id), { after: () => workflows.reload(true) });
    });
  };

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Workflow} title={`Workflows automáticos (${list.length})`} tone="text-emerald-300"
          hint="Secuencias multi-paso que el backend ejecuta por cron, evento o reposo del dispositivo, con aprendizaje continuo opcional."
          right={
            <>
              <button type="button" className={BTN_PRIMARY} aria-label="Crear workflow" onClick={openCreate}><Plus className="h-3 w-3" aria-hidden="true" /> Crear workflow</button>
              <button type="button" className={BTN} onClick={() => { void workflows.reload(); }} aria-label="Recargar workflows"><RefreshCw className={cn("h-3 w-3", workflows.loading && "animate-spin")} aria-hidden="true" /></button>
            </>
          } />
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {list.length === 0 && <Empty loading={workflows.loading} error={workflows.error} text="Sin workflows: crea el primero arriba." />}
          {list.map((w) => {
            const enabled = w.status !== "disabled";
            return (
              <div key={w.id} className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2.5")}>
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", enabled ? "bg-emerald-400" : "bg-white/25")} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-white/90">{w.name ?? w.id}</p>
                    {w.description && <p className="line-clamp-2 text-[10px] text-white/55">{w.description}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="border-white/10 text-white/60">{w.trigger_type ?? w.trigger ?? "manual"}</Badge>
                  {w.auto_learn && <Badge tone="border-fuchsia-400/30 text-fuchsia-100"><Sparkles className="h-2.5 w-2.5" aria-hidden="true" /> auto-aprende</Badge>}
                  <Badge tone="border-cyan-400/25 text-cyan-100">{w.executions_count ?? 0} ejecuciones</Badge>
                </div>
                {(w.steps ?? []).length > 0 && (
                  <ul className="space-y-0.5">
                    {(w.steps ?? []).slice(0, 4).map((s, i) => (
                      <li key={i} className="flex items-center gap-1.5 truncate text-[10px] text-white/55">
                        <span className={cn(MONO, "shrink-0")}>{s.step ?? i + 1}</span>
                        <span className="truncate">{s.desc || s.action}</span>
                      </li>
                    ))}
                    {(w.steps ?? []).length > 4 && <li className="text-[10px] text-white/35">+{(w.steps ?? []).length - 4} paso(s) más</li>}
                  </ul>
                )}
                <div className="mt-1 flex items-center justify-between gap-1.5 border-t border-white/5 pt-1.5">
                  <div className="flex items-center gap-1.5">
                    <Switch checked={enabled} disabled={busy !== ""} aria-label={`Workflow ${w.name ?? w.id} ${enabled ? "activo" : "inactivo"}`}
                      onCheckedChange={(v) => { void wrap(`wf:${w.id}`, () => runS158(`${w.name ?? "Workflow"}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158Workflow(target, w.id, v), { after: () => workflows.reload(true) })); }} />
                    <button type="button" className={BTN} disabled={busy !== ""} aria-label={`Editar ${w.name ?? w.id}`} onClick={() => openEdit(w)}><Pencil className="h-3 w-3" aria-hidden="true" /></button>
                    <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Eliminar ${w.name ?? w.id}`} onClick={() => handleDelete(w)}>
                      <BusyIcon busy={busy === `wfdel:${w.id}`} icon={Trash2} />
                    </button>
                  </div>
                  <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label={`Ejecutar ${w.name ?? w.id}`}
                    onClick={() => { void wrap(`run:${w.id}`, () => runS158(`${w.name ?? "Workflow"} ejecutado`, () => runAstraura158Workflow(target, w.id), { description: (d) => `${d.steps_executed ?? (d.results ?? d.step_results ?? []).length} paso(s)`, after: () => workflows.reload(true) })); }}>
                    <BusyIcon busy={busy === `run:${w.id}`} icon={Play} /> Ejecutar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {draft && <WorkflowFormDialog open={!!draft} draft={draft} setDraft={setDraft} busy={saving} error={formError} isNew={isNew} onCancel={closeForm} onSubmit={submit} />}
    </div>
  );
}

export default WorkflowsTab;
