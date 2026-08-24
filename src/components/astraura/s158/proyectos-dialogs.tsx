"use client";

/**
 * STUDIO 1.58 · Diálogos de Proyectos — extraídos de `proyectos-tab.tsx` para
 * no convertirlo en un fichero gigante. Cubren lo que el original hacía en
 * `ProjectFullWorkspaceModal.jsx` (>1600 líneas) reducido a lo esencial que
 * el cliente `astraura-158-client.ts` ya expone: crear un proyecto, añadir
 * una versión, forjar una rama, fusionarla y eliminar un archivo enlazado.
 *
 * `Astraura158Project` no declara `linked_files` ni `timeline_branches` como
 * campos propios (solo trae `[k: string]: unknown` para lo que el backend
 * añada) porque su forma exacta no está verificada contra el backend: se
 * leen aquí de forma TOLERANTE — si no llegan, la sección lo dice y ofrece
 * un campo manual en su lugar. Honestidad ante todo: nada se inventa.
 */

import { useEffect, useState } from "react";
import { FileX, FolderPlus, GitBranch, GitMerge, History, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addAstraura158ProjectVersion, createAstraura158Project, createAstraura158ProjectBranch, deleteAstraura158Project,
  deleteAstraura158ProjectFile, mergeAstraura158ProjectBranch,
  type Astraura158Project, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_DANGER, BTN_PRIMARY, BusyIcon, Empty, Field, INPUT, LABEL, MONO, SELECT, SUB, TEXTAREA, runS158, useBusy } from "./shared";

const PROJECT_KIND_SUGGESTIONS = ["código", "diseño", "documento", "investigación", "dataset"];

/* ── Lectura tolerante de campos no declarados en el tipo estricto ─────────── */

function normalizeFiles(raw: unknown): { path: string; name?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { path: string; name?: string }[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) out.push({ path: item });
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const path = typeof o.path === "string" ? o.path : typeof o.file_path === "string" ? o.file_path : undefined;
      if (path) out.push({ path, name: typeof o.name === "string" ? o.name : undefined });
    }
  }
  return out;
}

function normalizeBranches(raw: unknown): { id: string; name: string; status?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: string; name: string; status?: string }[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) out.push({ id: item, name: item });
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : typeof o.id === "string" ? o.id : undefined;
      const id = typeof o.id === "string" ? o.id : name;
      if (id && name) out.push({ id, name, status: typeof o.status === "string" ? o.status : undefined });
    }
  }
  return out;
}

/* ── Crear proyecto ─────────────────────────────────────────────────────── */

export function CreateProjectDialog({ target, open, onOpenChange, onCreated }: {
  target: Astraura158Target;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setName(""); setDescription(""); setKind(""); setError(null); }
  }, [open]);

  const submit = () => {
    if (!name.trim()) { setError("El proyecto necesita un nombre."); return; }
    setError(null);
    setBusy(true);
    // Contrato REAL de `/api/projects/create` (CreateProjectRequest): `name` y
    // `description` obligatorias y el tipo se llama `type`. No acepta `path`: la
    // ruta se vincula después con `linked_folders`, no al crear.
    void runS158("Proyecto creado", () => createAstraura158Project(target, {
      name: name.trim(), description: description.trim(), type: kind.trim() || "personal",
    }), {
      description: (d) => d.project?.name,
      after: async () => { onOpenChange(false); await onCreated(); },
    }).then((ok) => {
      setBusy(false);
      if (!ok) setError("El backend rechazó el proyecto — revisa el aviso emergente para el motivo exacto.");
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear proyecto</DialogTitle>
          <DialogDescription>El Director podrá enrutar aquí resultados del enjambre; cada proyecto lleva su propia versión e historial.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Field label="Nombre"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del proyecto" autoFocus /></Field>
          <Field label="Descripción"><textarea className={TEXTAREA} value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Descripción del proyecto" /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Tipo (opcional)">
              <input className={INPUT} list="s158-project-kinds" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de proyecto" placeholder="código, diseño…" />
              <datalist id="s158-project-kinds">{PROJECT_KIND_SUGGESTIONS.map((k) => <option key={k} value={k} />)}</datalist>
            </Field>
          </div>
          {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className={BTN} disabled={busy} aria-label="Cancelar" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy || !name.trim()} aria-label="Crear proyecto" onClick={submit}>
            <BusyIcon busy={busy} icon={FolderPlus} /> Crear proyecto
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Espacio de trabajo de un proyecto (versión · rama · fusión · archivos) ─ */

export function ProjectWorkspaceDialog({ target, project, open, onOpenChange, onChanged }: {
  target: Astraura158Target;
  project: Astraura158Project;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();

  const [versionSummary, setVersionSummary] = useState("");
  const [versionContent, setVersionContent] = useState("");
  const [versionAuthor, setVersionAuthor] = useState("");
  const [versionError, setVersionError] = useState<string | null>(null);

  const [branchName, setBranchName] = useState("");
  const [branchNote, setBranchNote] = useState("");
  const [branchError, setBranchError] = useState<string | null>(null);

  const branches = normalizeBranches((project as Record<string, unknown>).timeline_branches);
  const [mergeTarget, setMergeTarget] = useState("");

  const files = normalizeFiles((project as Record<string, unknown>).linked_files);
  const [manualPath, setManualPath] = useState("");

  useEffect(() => {
    if (!open) {
      setVersionSummary(""); setVersionContent(""); setVersionAuthor(""); setVersionError(null);
      setBranchName(""); setBranchNote(""); setBranchError(null);
      setMergeTarget(""); setManualPath("");
    }
  }, [open]);

  const addVersion = () => {
    if (!versionSummary.trim()) { setVersionError("Describe brevemente qué cambia esta versión."); return; }
    setVersionError(null);
    void wrap("version", () => runS158("Versión añadida", () => addAstraura158ProjectVersion(target, project.id, {
      // `AddProjectVersionRequest` espera `changes: string[]`, una línea por cambio.
      summary: versionSummary.trim(),
      changes: versionContent.split("\n").map((l) => l.trim()).filter(Boolean),
      author: versionAuthor.trim() || undefined,
    }), { after: async () => { setVersionSummary(""); setVersionContent(""); setVersionAuthor(""); await onChanged(); } }));
  };

  const createBranch = () => {
    if (!branchName.trim()) { setBranchError("La rama necesita un nombre."); return; }
    setBranchError(null);
    void wrap("branch", () => runS158("Rama creada", () => createAstraura158ProjectBranch(target, project.id, branchName.trim(), branchNote.trim() || undefined), {
      after: async () => { setBranchName(""); setBranchNote(""); await onChanged(); },
    }));
  };

  const mergeBranch = () => {
    const id = mergeTarget.trim();
    if (!id) return;
    void wrap("merge", () => runS158(`Rama «${id}» fusionada`, () => mergeAstraura158ProjectBranch(target, project.id, id), {
      after: async () => { setMergeTarget(""); await onChanged(); },
    }));
  };

  const deleteFile = (filePath: string) => {
    void wrap(`delfile:${filePath}`, async () => {
      const ok = await confirm({
        title: "¿Eliminar archivo del proyecto?", description: filePath,
        confirmText: "Eliminar", cancelText: "Cancelar", destructive: true,
      });
      if (!ok) return;
      await runS158("Archivo eliminado", () => deleteAstraura158ProjectFile(target, project.id, filePath), {
        after: async () => { if (filePath === manualPath.trim()) setManualPath(""); await onChanged(); },
      });
    });
  };

  const deleteProject = () => {
    void wrap("delproject", async () => {
      const ok = await confirm({
        title: `¿Eliminar el proyecto «${project.name ?? project.id}»?`,
        description: "Se borra del backend soberano de esta neurona junto con su historial de versiones. Esta acción no se puede deshacer.",
        confirmText: "Eliminar proyecto", cancelText: "Cancelar", destructive: true,
      });
      if (!ok) return;
      const success = await runS158("Proyecto eliminado", () => deleteAstraura158Project(target, project.id), { after: onChanged });
      if (success) onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project.name ?? project.id}</DialogTitle>
          <DialogDescription>{project.description || "Espacio de trabajo del proyecto: versiones, ramas y archivos enlazados."}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className={cn(SUB, "space-y-2 p-3")}>
            <p className={LABEL}><History className="mr-1 inline h-3 w-3" aria-hidden="true" /> Nueva versión</p>
            <Field label="Resumen del cambio"><input className={INPUT} value={versionSummary} onChange={(e) => setVersionSummary(e.target.value)} aria-label="Resumen de la nueva versión" /></Field>
            <Field label="Contenido (opcional)"><textarea className={TEXTAREA} value={versionContent} onChange={(e) => setVersionContent(e.target.value)} aria-label="Contenido de la nueva versión" /></Field>
            <Field label="Autor (opcional)"><input className={INPUT} value={versionAuthor} onChange={(e) => setVersionAuthor(e.target.value)} aria-label="Autor de la versión" /></Field>
            {versionError && <p role="alert" className="text-[11px] text-rose-300">{versionError}</p>}
            <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Añadir versión" onClick={addVersion}>
              <BusyIcon busy={busy === "version"} icon={Save} /> Añadir versión
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn(SUB, "space-y-2 p-3")}>
              <p className={LABEL}><GitBranch className="mr-1 inline h-3 w-3" aria-hidden="true" /> Nueva rama</p>
              <Field label="Nombre"><input className={INPUT} value={branchName} onChange={(e) => setBranchName(e.target.value)} aria-label="Nombre de la nueva rama" /></Field>
              <Field label="Nota (opcional)"><input className={INPUT} value={branchNote} onChange={(e) => setBranchNote(e.target.value)} aria-label="Nota de la rama" /></Field>
              {branchError && <p role="alert" className="text-[11px] text-rose-300">{branchError}</p>}
              <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Crear rama" onClick={createBranch}>
                <BusyIcon busy={busy === "branch"} icon={GitBranch} /> Crear rama
              </button>
            </div>

            <div className={cn(SUB, "space-y-2 p-3")}>
              <p className={LABEL}><GitMerge className="mr-1 inline h-3 w-3" aria-hidden="true" /> Fusionar rama</p>
              {branches.length > 0 ? (
                <Field label="Rama a fusionar">
                  <select className={SELECT} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} aria-label="Rama a fusionar">
                    <option value="">elige…</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.status ? ` (${b.status})` : ""}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="ID de rama" hint="El proyecto no trae una lista de ramas legible: escribe el identificador.">
                  <input className={cn(INPUT, "font-mono")} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} aria-label="ID de la rama a fusionar" />
                </Field>
              )}
              <button type="button" className={BTN} disabled={busy !== "" || !mergeTarget.trim()} aria-label="Fusionar rama" onClick={mergeBranch}>
                <BusyIcon busy={busy === "merge"} icon={GitMerge} /> Fusionar
              </button>
            </div>
          </div>

          <div className={cn(SUB, "space-y-2 p-3")}>
            <p className={LABEL}><FileX className="mr-1 inline h-3 w-3" aria-hidden="true" /> Archivos enlazados ({files.length})</p>
            {files.length === 0 && <Empty text="El proyecto no trae una lista de archivos legible desde aquí; elimina por ruta manualmente abajo." />}
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.path} className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-white/70" title={f.path}>{f.name ?? f.path}</span>
                    <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label={`Eliminar archivo ${f.name ?? f.path}`} onClick={() => deleteFile(f.path)}>
                      <BusyIcon busy={busy === `delfile:${f.path}`} icon={Trash2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-1.5">
              <Field label="Eliminar por ruta" className="flex-1"><input className={cn(INPUT, "font-mono")} value={manualPath} onChange={(e) => setManualPath(e.target.value)} placeholder="/ruta/al/archivo" aria-label="Ruta del archivo a eliminar" /></Field>
              <button type="button" className={BTN_DANGER} disabled={busy !== "" || !manualPath.trim()} aria-label="Eliminar archivo por ruta" onClick={() => deleteFile(manualPath.trim())}>
                <BusyIcon busy={busy === `delfile:${manualPath.trim()}`} icon={Trash2} />
              </button>
            </div>
          </div>

          <p className={MONO}>id {project.id}{project.current_version ? ` · v${project.current_version}` : ""}</p>
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <button type="button" className={BTN_DANGER} disabled={busy !== ""} aria-label="Eliminar proyecto" onClick={deleteProject}>
            <BusyIcon busy={busy === "delproject"} icon={Trash2} /> Eliminar proyecto
          </button>
          <button type="button" className={BTN} disabled={busy !== ""} aria-label="Cerrar" onClick={() => onOpenChange(false)}>Cerrar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
