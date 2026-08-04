"use client";

/**
 * AuroraImaginePanel — el sistema imagine.md de Aurora: ideación, investigación
 * y tareas EN VIVO (juntos) o EN SEGUNDO PLANO (fondo).
 *
 * Hermano en directo de ego.md/dream.md. Dos columnas de trabajo:
 *   1) imagine.md  — editor markdown (autosave + realtime), compartible/
 *      integrable, adjuntable a contextos.
 *   2) Ejecuciones — lanza una run eligiendo MODO (juntos/fondo), SERVIDOR
 *      (tu servidor / StarSeed / externo / auto inteligente · tri-fuente) y la
 *      SELECCIÓN de IAs/agentes/subagentes/skills/plugins/conexiones/APIs
 *      (ai_config). La lista de runs muestra estado + pasos en vivo (realtime).
 *      En "juntos" cada paso se muestra y puedes responder/continuar/pausar; en
 *      "fondo" corre y emite notificaciones cuando hay algo relevante.
 *
 * Todo respaldado por Supabase (`aurora_imagine` / `imagine_runs`) con RLS y
 * realtime. Las notificaciones van a la tabla `notifications`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRealtimeRows, useRealtime } from "@/lib/realtime/realtime";
import {
  // ficheros
  listImagineFiles,
  createImagineFile,
  updateImagineContent,
  renameImagineFile,
  setImagineShareable,
  deleteImagineFile,
  imagineToMarkdown,
  iconForImagineFile,
  IMAGINE_SEED_CONTENT,
  // runs
  listRuns,
  getRun,
  startRun,
  stepRun,
  pauseRun,
  resumeRun,
  replyToRun,
  deleteRun,
  setRunStatus,
  statusMeta,
  resolveRunServer,
  imagineHasConfiguredSources,
  runFilterById,
  BACKGROUND_LIMITATION,
  RUN_SERVERS,
  RUN_MODES,
  AI_RESOURCE_KINDS,
  type ImagineFile,
  type ImagineRun,
  type RunMode,
  type RunServer,
  type RunStep,
  type AiConfig,
  type AiResourceKind,
  type ResolvedServer,
} from "@/lib/aurora/imagine";
import {
  Sparkles,
  Plus,
  Save,
  Trash2,
  Loader2,
  Share2,
  Download,
  Copy,
  Play,
  Pause,
  StepForward,
  Send,
  Rocket,
  Server,
  Bot,
  X,
  Info,
  CheckCircle2,
  Moon,
  Users,
  CircleDot,
} from "lucide-react";

/* ============================================================== */
/* Mini-UI primitives (sin depender de shadcn para no acoplar)     */
/* ============================================================== */

function Btn({
  children,
  onClick,
  disabled,
  variant = "solid",
  size = "md",
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition border disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  const variants =
    variant === "solid"
      ? "bg-fuchsia-600/30 border-fuchsia-400/50 text-white hover:bg-fuchsia-600/45"
      : variant === "outline"
        ? "bg-white/5 border-white/10 text-white/70 hover:border-fuchsia-400/30"
        : variant === "danger"
          ? "bg-rose-600/20 border-rose-400/40 text-rose-100 hover:bg-rose-600/35"
          : "bg-transparent border-transparent text-white/60 hover:text-white hover:bg-white/5";
  return (
    <button title={title} onClick={onClick} disabled={disabled} className={cn(base, sizes, variants, className)}>
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
        active
          ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-100"
          : "border-white/12 bg-white/5 text-white/60 hover:border-fuchsia-400/30",
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: ImagineRun["status"] }) {
  const m = statusMeta(status);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", m.tone)}>
      {status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CircleDot className="w-3 h-3" />}
      {m.label}
    </span>
  );
}

/* ============================================================== */
/* Panel raíz                                                      */
/* ============================================================== */

export default function AuroraImaginePanel() {
  const { rows: files, loading: filesLoading, reload: reloadFiles } = useRealtimeRows<ImagineFile>(
    "aurora_imagine",
    () => listImagineFiles(),
    { idKey: "id" },
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeId && files.length) setActiveId(files[0].id);
  }, [files, activeId]);

  const active = files.find((f) => f.id === activeId) ?? null;

  const onCreate = async () => {
    setCreating(true);
    const f = await createImagineFile("imagine.md", IMAGINE_SEED_CONTENT);
    setCreating(false);
    if (f) {
      await reloadFiles();
      setActiveId(f.id);
      toast.success("imagine.md creado. Empieza a imaginar.");
    } else {
      toast.error("No se pudo crear. ¿Has iniciado sesión?");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-950/30 to-cyan-950/20 p-4 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">imagine.md — el espacio vivo de Aurora.</div>
          <div className="text-[11px] text-white/55 leading-relaxed">
            Idea, investiga y ejecuta tareas <span className="text-fuchsia-200">en directo contigo</span> o{" "}
            <span className="text-cyan-200">en segundo plano</span>. Editable, integrable y compartible — como
            dream.md, pero en vivo. Aurora elige IAs, agentes, skills y conexiones, y el servidor donde ejecutar.
          </div>
        </div>
      </div>

      {/* Selector de imagine.md */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Tus imagine.md</span>
          <span className="rounded-full border border-white/15 px-1.5 text-[10px] text-white/50">{files.length}</span>
        </div>

        {filesLoading ? (
          <div className="flex items-center gap-2 text-sm text-white/50 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        ) : files.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/15 p-6 text-center">
            <Sparkles className="w-8 h-8 text-white/25 mx-auto mb-2" />
            <p className="text-sm text-white/55">
              Aún no tienes ningún imagine.md. Crea el primero para empezar a idear con Aurora.
            </p>
            <div className="mt-3 flex justify-center">
              <Btn onClick={onCreate} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear mi primer imagine.md
              </Btn>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {files.map((f) => {
              const Icon = iconForImagineFile(f.name);
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveId(f.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    f.id === activeId
                      ? "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-100"
                      : "border-white/10 text-white/70 hover:bg-white/5",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {f.name}
                  {f.shareable && <Share2 className="w-3 h-3 text-emerald-300" />}
                </button>
              );
            })}
            <Btn variant="outline" size="sm" onClick={onCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Nuevo
            </Btn>
          </div>
        )}
      </div>

      {active && (
        <>
          <ImagineEditor file={active} onChanged={reloadFiles} />
          <LaunchRun imagineId={active.id} />
          <RunsList imagineId={active.id} />
        </>
      )}
    </div>
  );
}

/* ============================================================== */
/* Editor del imagine.md                                           */
/* ============================================================== */

function ImagineEditor({ file, onChanged }: { file: ImagineFile; onChanged: () => void }) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(file.content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(file.name);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cuando cambia el fichero activo (o llega un cambio realtime y no estamos editando), sincroniza.
  useEffect(() => {
    if (!dirty) {
      setDraft(file.content);
      setName(file.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.content, file.name]);

  const flush = async (value: string) => {
    setSaving(true);
    const ok = await updateImagineContent(file.id, value);
    setSaving(false);
    setDirty(false);
    if (!ok) toast.error("No se pudo guardar el imagine.md.");
  };

  const onEdit = (value: string) => {
    setDraft(value);
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(value), 900);
  };

  const onRename = async () => {
    const ok = await renameImagineFile(file.id, name);
    if (ok) {
      toast.success("Renombrado.");
      onChanged();
    } else toast.error("No se pudo renombrar.");
  };

  const onToggleShare = async () => {
    const ok = await setImagineShareable(file.id, !file.shareable);
    if (ok) {
      toast.success(!file.shareable ? "Ahora es compartible / integrable." : "Ya no es compartible.");
      onChanged();
    }
  };

  const onExport = async () => {
    try {
      const md = imagineToMarkdown({ ...file, content: draft });
      await navigator.clipboard.writeText(md);
      toast.success("imagine.md copiado al portapapeles (markdown).");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  const onDelete = async () => {
    if (!(await confirm({
      title: "Eliminar archivo",
      description: `¿Eliminar "${file.name}"? Esta acción no se puede deshacer.`,
      destructive: true,
    }))) return;
    const ok = await deleteImagineFile(file.id);
    if (ok) {
      toast.success("Eliminado.");
      onChanged();
    } else toast.error("No se pudo eliminar.");
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={onRename}
          className="rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-sm text-fuchsia-50 outline-none focus:border-fuchsia-400/40 w-44"
        />
        <span className="text-[10px] text-white/40">
          {saving ? "Guardando…" : dirty ? "Sin guardar…" : "Guardado"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Btn
            size="sm"
            variant={file.shareable ? "solid" : "outline"}
            onClick={onToggleShare}
            title="Compartible / integrable"
          >
            <Share2 className="w-3.5 h-3.5" /> {file.shareable ? "Compartible" : "Compartir"}
          </Btn>
          <Btn size="sm" variant="outline" onClick={onExport} title="Copiar como markdown">
            <Copy className="w-3.5 h-3.5" /> Exportar
          </Btn>
          <Btn size="sm" variant="danger" onClick={onDelete} title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </Btn>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => onEdit(e.target.value)}
        spellCheck={false}
        className="w-full h-64 rounded-lg border border-white/12 bg-black/40 p-3 font-mono text-[12.5px] leading-relaxed text-white/85 outline-none focus:border-fuchsia-400/40 resize-y"
        placeholder="# imagine.md…"
      />
      <p className="text-[10px] text-white/35">
        Markdown vivo. Se guarda solo y se sincroniza en tiempo real. Marca como compartible para integrarlo en otros
        contextos del OS.
      </p>
    </div>
  );
}

/* ============================================================== */
/* Lanzar una ejecución (modo · servidor · ai_config)              */
/* ============================================================== */

function LaunchRun({ imagineId }: { imagineId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<RunMode>("juntos");
  const [server, setServer] = useState<RunServer>("starseed");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [note, setNote] = useState("");
  const [resources, setResources] = useState<Record<AiResourceKind, string[]>>({
    agents: [],
    subagents: [],
    skills: [],
    plugins: [],
    connections: [],
    apis: [],
  });
  const [draftRes, setDraftRes] = useState<Record<AiResourceKind, string>>({
    agents: "",
    subagents: "",
    skills: "",
    plugins: "",
    connections: "",
    apis: "",
  });
  const [launching, setLaunching] = useState(false);
  const [serverInfo, setServerInfo] = useState<ResolvedServer | null>(null);
  const [hasSources, setHasSources] = useState<boolean | null>(null);

  // Previsualiza a qué servidor resolverá la elección actual.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await resolveRunServer(server);
      if (alive) setServerInfo(r);
    })();
    return () => {
      alive = false;
    };
  }, [server]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ok = await imagineHasConfiguredSources();
      if (alive) setHasSources(ok);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addResource = (k: AiResourceKind) => {
    const v = draftRes[k].trim();
    if (!v) return;
    setResources((prev) => (prev[k].includes(v) ? prev : { ...prev, [k]: [...prev[k], v] }));
    setDraftRes((prev) => ({ ...prev, [k]: "" }));
  };
  const removeResource = (k: AiResourceKind, v: string) =>
    setResources((prev) => ({ ...prev, [k]: prev[k].filter((x) => x !== v) }));

  const reset = () => {
    setTitle("");
    setMode("juntos");
    setServer("starseed");
    setProvider("");
    setModel("");
    setNote("");
    setResources({ agents: [], subagents: [], skills: [], plugins: [], connections: [], apis: [] });
  };

  const onLaunch = async () => {
    if (!title.trim()) {
      toast.error("Ponle un título a la ejecución.");
      return;
    }
    setLaunching(true);
    const ai_config: AiConfig = {
      provider: provider.trim() || undefined,
      model: model.trim() || undefined,
      note: note.trim() || undefined,
      agents: resources.agents,
      subagents: resources.subagents,
      skills: resources.skills,
      plugins: resources.plugins,
      connections: resources.connections,
      apis: resources.apis,
    };
    const run = await startRun(title, mode, server, ai_config, imagineId);
    if (!run) {
      setLaunching(false);
      toast.error("No se pudo iniciar la ejecución.");
      return;
    }
    // Da el primer paso inmediatamente (en juntos pausará; en fondo seguirá vía RunCard).
    const res = await stepRun(run.id);
    setLaunching(false);
    if (!res.ok) {
      toast.error(res.error || "La ejecución falló en el primer paso.");
    } else {
      toast.success(
        mode === "juntos"
          ? "Ejecución iniciada. Aurora dio el primer paso — revísalo abajo."
          : "Ejecución en segundo plano iniciada. Aurora te avisará de lo relevante.",
      );
    }
    reset();
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex items-center gap-3 flex-wrap">
        <Rocket className="w-4 h-4 text-cyan-300" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fuchsia-50">Lanzar una ejecución</div>
          <div className="text-[11px] text-white/50">
            Aurora desarrollará este imagine.md paso a paso — contigo (juntos) o en segundo plano (fondo).
          </div>
        </div>
        <div className="ml-auto">
          <Btn onClick={() => setOpen(true)}>
            <Play className="w-4 h-4" /> Nueva ejecución
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/20 to-black/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="w-4 h-4 text-cyan-300" />
        <span className="text-sm font-semibold text-cyan-50">Nueva ejecución</span>
        <Btn size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen(false)}>
          <X className="w-4 h-4" />
        </Btn>
      </div>

      {/* Título */}
      <div>
        <label className="text-[11px] text-white/50">Título / objetivo</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="p. ej. Investigar fuentes de energía para una comunidad federada"
          className="mt-1 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
        />
      </div>

      {/* Modo */}
      <div>
        <label className="text-[11px] text-white/50">Modo</label>
        <div className="mt-1.5 grid sm:grid-cols-2 gap-2">
          {RUN_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "text-left rounded-lg border p-3 transition",
                mode === m.id
                  ? "border-fuchsia-400/60 bg-fuchsia-500/15"
                  : "border-white/10 bg-white/5 hover:border-fuchsia-400/30",
              )}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                {m.id === "fondo" ? <Moon className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                {m.label}
              </div>
              <div className="text-[11px] text-white/50 mt-1">{m.blurb}</div>
            </button>
          ))}
        </div>
        {mode === "fondo" && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[10.5px] text-amber-100/90">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{BACKGROUND_LIMITATION}</span>
          </div>
        )}
      </div>

      {/* Servidor */}
      <div>
        <label className="text-[11px] text-white/50 inline-flex items-center gap-1">
          <Server className="w-3 h-3" /> Servidor de ejecución
        </label>
        <div className="mt-1.5 grid sm:grid-cols-2 gap-2">
          {RUN_SERVERS.map((s) => (
            <button
              key={s.id}
              onClick={() => setServer(s.id)}
              className={cn(
                "text-left rounded-lg border p-2.5 transition",
                server === s.id
                  ? "border-cyan-400/60 bg-cyan-500/15"
                  : "border-white/10 bg-white/5 hover:border-cyan-400/30",
              )}
            >
              <div className="text-sm font-medium text-white">
                {s.icon} {s.label}
              </div>
              <div className="text-[10.5px] text-white/50 mt-0.5">{s.blurb}</div>
            </button>
          ))}
        </div>
        {serverInfo && (
          <div className="mt-1.5 text-[10.5px] text-white/45">
            Destino resuelto: <span className="text-cyan-200">{serverInfo.label}</span>
            {serverInfo.endpoint ? ` · ${serverInfo.endpoint}` : ""}
          </div>
        )}
        {hasSources === false && (
          <div className="mt-1 text-[10.5px] text-white/40">
            Sin fuentes configuradas para “imagine”: se usará StarSeed por defecto. Configúralas en el proveedor
            tri-fuente.
          </div>
        )}
      </div>

      {/* Selección de IA / modelo */}
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-white/50">Proveedor de IA (opcional)</label>
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="vacío = el activo (anthropic, openai, ollama…)"
            className="mt-1 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400/40"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/50">Modelo (opcional)</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="p. ej. claude-3-5-haiku, gpt-4o-mini"
            className="mt-1 w-full rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:border-fuchsia-400/40"
          />
        </div>
      </div>

      {/* Selección de agentes/subagentes/skills/plugins/conexiones/APIs */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-white/50">
          <Bot className="w-3.5 h-3.5" /> Recursos a orquestar (agentes, subagentes, skills, plugins, conexiones, APIs)
        </div>
        {AI_RESOURCE_KINDS.map((rk) => (
          <div key={rk.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] text-white/70">
                {rk.icon} {rk.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {resources[rk.key].map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-[10.5px] text-fuchsia-100"
                >
                  {v}
                  <button onClick={() => removeResource(rk.key, v)} className="hover:text-white">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={draftRes[rk.key]}
                onChange={(e) => setDraftRes((p) => ({ ...p, [rk.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addResource(rk.key);
                  }
                }}
                placeholder={rk.placeholder}
                className="flex-1 min-w-[140px] rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-fuchsia-400/40"
              />
              <Btn size="sm" variant="outline" onClick={() => addResource(rk.key)}>
                <Plus className="w-3 h-3" />
              </Btn>
            </div>
          </div>
        ))}
      </div>

      {/* Nota */}
      <div>
        <label className="text-[11px] text-white/50">Indicaciones extra (opcional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Matiza el objetivo, restricciones, formato de salida…"
          className="mt-1 w-full h-16 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-fuchsia-400/40 resize-y"
        />
      </div>

      <div className="flex items-center gap-2">
        <Btn onClick={onLaunch} disabled={launching}>
          {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {mode === "fondo" ? "Lanzar en segundo plano" : "Lanzar y dar el primer paso"}
        </Btn>
        <Btn variant="ghost" onClick={() => setOpen(false)} disabled={launching}>
          Cancelar
        </Btn>
      </div>
    </div>
  );
}

/* ============================================================== */
/* Lista de ejecuciones                                            */
/* ============================================================== */

function RunsList({ imagineId }: { imagineId: string }) {
  const filter = useMemo(() => `imagine_id=eq.${imagineId}`, [imagineId]);
  const { rows: runs, loading, reload } = useRealtimeRows<ImagineRun>(
    "imagine_runs",
    () => listRuns(imagineId),
    { filter, idKey: "id" },
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/50 py-3 px-1">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando ejecuciones…
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
        <Rocket className="w-8 h-8 text-white/25 mx-auto mb-2" />
        <p className="text-sm text-white/55">
          Aún no hay ejecuciones para este imagine.md. Lanza una para que Aurora empiece a trabajar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-semibold text-fuchsia-50">Ejecuciones</span>
        <span className="rounded-full border border-white/15 px-1.5 text-[10px] text-white/50">{runs.length}</span>
      </div>
      {runs.map((r) => (
        <RunCard key={r.id} run={r} onChanged={reload} />
      ))}
    </div>
  );
}

/* ============================================================== */
/* Tarjeta de una ejecución (pasos en vivo + interacción)          */
/* ============================================================== */

function RunCard({ run, onChanged }: { run: ImagineRun; onChanged: () => void }) {
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(run.status === "running" || run.status === "paused");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  // Copia local que se actualiza con realtime para no depender sólo del reload del padre.
  const [live, setLive] = useState<ImagineRun>(run);
  const autopilot = useRef(false); // para el bucle "fondo"

  useEffect(() => setLive(run), [run]);

  // Realtime sobre ESTA run: refresca pasos/estado en vivo.
  useRealtime<Record<string, unknown>>("imagine_runs", { filter: runFilterById(run.id), event: "*" }, () => {
    void (async () => {
      const fresh = await getRun(run.id);
      if (fresh) setLive(fresh);
    })();
  });

  const steps = useMemo(
    () => [...live.steps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
    [live.steps],
  );

  // Bucle de SEGUNDO PLANO dirigido por el cliente: mientras la run "fondo" esté
  // "running", sigue dando pasos (con respiro) mientras el componente viva, aunque
  // el usuario navegue por el OS. Honesto: requiere una pestaña abierta.
  useEffect(() => {
    if (live.mode !== "fondo") return;
    if (live.status !== "running") {
      autopilot.current = false;
      return;
    }
    if (autopilot.current) return;
    autopilot.current = true;
    let cancelled = false;
    void (async () => {
      // Pequeño respiro entre pasos para no saturar.
      while (!cancelled) {
        await new Promise((res) => setTimeout(res, 1500));
        if (cancelled) break;
        const fresh = await getRun(run.id);
        if (!fresh || fresh.status !== "running" || fresh.mode !== "fondo") break;
        const res = await stepRun(run.id);
        if (!res.ok || res.status !== "running") break;
        // límite de seguridad por sesión
        if ((res.steps?.length ?? 0) >= 24) {
          await setRunStatus(run.id, "paused");
          break;
        }
      }
      autopilot.current = false;
    })();
    return () => {
      cancelled = true;
      autopilot.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.mode, live.status, run.id]);

  const onStep = async () => {
    setBusy(true);
    const res = await stepRun(run.id);
    setBusy(false);
    if (!res.ok) toast.error(res.error || "El paso falló.");
    const fresh = await getRun(run.id);
    if (fresh) setLive(fresh);
    onChanged();
  };

  const onReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    await replyToRun(run.id, text);
    setReply("");
    // Tras responder, Aurora da el siguiente paso.
    const res = await stepRun(run.id);
    setBusy(false);
    if (!res.ok) toast.error(res.error || "El paso falló.");
    const fresh = await getRun(run.id);
    if (fresh) setLive(fresh);
    onChanged();
  };

  const onPause = async () => {
    await pauseRun(run.id);
    const fresh = await getRun(run.id);
    if (fresh) setLive(fresh);
    onChanged();
  };
  const onResume = async () => {
    await resumeRun(run.id);
    const fresh = await getRun(run.id);
    if (fresh) setLive(fresh);
    if (fresh?.mode === "juntos") void onStep();
    onChanged();
  };
  const onFinish = async () => {
    await setRunStatus(run.id, "done", live.result || steps[steps.length - 1]?.text || "");
    const fresh = await getRun(run.id);
    if (fresh) setLive(fresh);
    onChanged();
  };
  const onDelete = async () => {
    if (!(await confirm({ title: "Eliminar ejecución", description: `¿Eliminar la ejecución "${run.title}"?`, destructive: true }))) return;
    await deleteRun(run.id);
    onChanged();
  };

  const serverLabel = RUN_SERVERS.find((s) => s.id === live.server)?.label || live.server;
  const isBg = live.mode === "fondo";

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 min-w-0 text-left">
          {isBg ? <Moon className="w-4 h-4 text-cyan-300 shrink-0" /> : <Users className="w-4 h-4 text-fuchsia-300 shrink-0" />}
          <span className="text-sm font-medium text-white truncate">{live.title}</span>
        </button>
        <StatusBadge status={live.status} />
        <span className="text-[10px] text-white/40">{isBg ? "fondo" : "juntos"} · {serverLabel}</span>
        <span className="text-[10px] text-white/35">{steps.length} pasos</span>
        <div className="ml-auto flex items-center gap-1">
          {live.status === "paused" && (
            <Btn size="sm" variant="outline" onClick={onResume} title="Reanudar">
              <Play className="w-3.5 h-3.5" />
            </Btn>
          )}
          {live.status === "running" && (
            <Btn size="sm" variant="outline" onClick={onPause} title="Pausar">
              <Pause className="w-3.5 h-3.5" />
            </Btn>
          )}
          {(live.status === "running" || live.status === "paused") && (
            <Btn size="sm" variant="danger" onClick={onFinish} title="Finalizar">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Btn>
          )}
          <Btn size="sm" variant="ghost" onClick={onDelete} title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </Btn>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 px-3 py-3 space-y-3">
          {/* Pasos en vivo */}
          {steps.length === 0 ? (
            <div className="text-[12px] text-white/45 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aurora está pensando el primer paso…
            </div>
          ) : (
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <StepBubble key={`${s.at}-${i}`} step={s} index={i + 1} />
              ))}
            </ol>
          )}

          {live.status === "running" && busy && (
            <div className="text-[11px] text-cyan-200/80 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Trabajando…
            </div>
          )}

          {/* Controles según modo/estado */}
          {live.status === "done" ? (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2.5 text-[12px] text-emerald-50">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ejecución completada
              </div>
              {live.result && <p className="mt-1 text-emerald-100/85 whitespace-pre-wrap">{live.result}</p>}
            </div>
          ) : live.status === "error" ? (
            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2.5 text-[12px] text-rose-50">
              {live.result || "La ejecución terminó con error."}
              <div className="mt-1.5">
                <Btn size="sm" variant="outline" onClick={onResume}>
                  <Play className="w-3 h-3" /> Reintentar
                </Btn>
              </div>
            </div>
          ) : !isBg ? (
            // MODO JUNTOS: responder / continuar / pausar
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void onReply();
                    }
                  }}
                  placeholder="Responde a Aurora para guiar el siguiente paso… (⌘/Ctrl+Enter para enviar)"
                  className="flex-1 h-16 rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-[12px] text-white outline-none focus:border-fuchsia-400/40 resize-y"
                />
                <Btn onClick={onReply} disabled={busy || !reply.trim()} title="Enviar respuesta">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Btn>
              </div>
              <div className="flex items-center gap-1.5">
                <Btn size="sm" variant="outline" onClick={onStep} disabled={busy}>
                  <StepForward className="w-3.5 h-3.5" /> Continuar sin responder
                </Btn>
                {live.status === "running" ? (
                  <Btn size="sm" variant="ghost" onClick={onPause} disabled={busy}>
                    <Pause className="w-3.5 h-3.5" /> Esperar / pausar
                  </Btn>
                ) : (
                  <span className="text-[10.5px] text-white/40">En pausa: responde o pulsa continuar.</span>
                )}
              </div>
            </div>
          ) : (
            // MODO FONDO: trabaja sola; surfacing de notificaciones
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2.5 text-[11px] text-cyan-100/80 flex items-start gap-1.5">
              <Moon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                Trabajando en segundo plano. Aurora te enviará una{" "}
                <span className="text-cyan-200">notificación</span> cuando encuentre algo relevante o termine.
                {live.status === "paused" && " (En pausa — reanúdala para continuar.)"}
                <div className="mt-1.5 flex items-center gap-1.5">
                  {live.status === "paused" ? (
                    <Btn size="sm" variant="outline" onClick={onResume}>
                      <Play className="w-3 h-3" /> Reanudar
                    </Btn>
                  ) : (
                    <Btn size="sm" variant="outline" onClick={onStep} disabled={busy}>
                      <StepForward className="w-3 h-3" /> Forzar un paso
                    </Btn>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepBubble({ step, index }: { step: RunStep; index: number }) {
  const isUser = step.role === "user";
  return (
    <li className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold",
          isUser ? "bg-white/10 text-white/70" : "bg-gradient-to-tr from-fuchsia-500 to-cyan-500 text-white",
        )}
      >
        {isUser ? "Tú" : index}
      </div>
      <div
        className={cn(
          "rounded-xl border px-3 py-2 text-[12px] leading-relaxed max-w-[88%] whitespace-pre-wrap",
          isUser
            ? "border-white/12 bg-white/5 text-white/80"
            : step.relevant
              ? "border-amber-400/30 bg-amber-500/10 text-amber-50"
              : "border-fuchsia-400/20 bg-fuchsia-500/5 text-white/85",
        )}
      >
        {!isUser && step.relevant && (
          <span className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wide text-amber-300/90 mb-0.5">
            <Sparkles className="w-2.5 h-2.5" /> Relevante
          </span>
        )}
        <div>{step.text}</div>
      </div>
    </li>
  );
}
