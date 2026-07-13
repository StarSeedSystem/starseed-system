"use client";

// src/components/education/study/study-tasks-panel.tsx
// Tareas de estudio + recomendaciones de Aurora + proyectos personalizables.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    ListChecks,
    Plus,
    Trash2,
    Sparkles,
    Loader2,
    FolderKanban,
    Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    type StudyTask,
    type StudyProject,
    type ProjectStatus,
    listTasks,
    createTask,
    toggleTask,
    deleteTask,
    createTasksBulk,
    listProjects,
    createProject,
    updateProject,
    deleteProject,
} from "@/lib/education/study";
import { recommendTasks } from "@/lib/education/study-ai";

const STATUS_LABEL: Record<ProjectStatus, string> = {
    idea: "Idea",
    activo: "Activo",
    pausado: "Pausado",
    hecho: "Hecho",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
    idea: "#a78bfa",
    activo: "#10B981",
    pausado: "#FFBF00",
    hecho: "#22d3ee",
};

export function StudyTasksPanel() {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <TasksColumn />
            <ProjectsColumn />
        </div>
    );
}

function TasksColumn() {
    const [tasks, setTasks] = useState<StudyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [recoTopic, setRecoTopic] = useState("");
    const [recommending, setRecommending] = useState(false);

    const reload = useCallback(async () => {
        setTasks(await listTasks());
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const add = async () => {
        if (!title.trim()) return;
        const t = await createTask({ title });
        if (t) {
            setTitle("");
            await reload();
        } else toast.error("Inicia sesión para guardar tareas.");
    };

    const recommend = async () => {
        if (!recoTopic.trim()) return;
        setRecommending(true);
        const res = await recommendTasks(recoTopic);
        if (!res.ok || !res.tasks) {
            setRecommending(false);
            toast.error(res.error ?? "Aurora no pudo recomendar tareas.");
            return;
        }
        const n = await createTasksBulk(res.tasks, { topic: recoTopic });
        setRecommending(false);
        if (n > 0) {
            toast.success(`${n} tarea(s) recomendada(s) añadidas`);
            setRecoTopic("");
            await reload();
        } else toast.error("Inicia sesión para guardar las recomendaciones.");
    };

    const pending = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);

    return (
        <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/90">
                <ListChecks className="h-4 w-4 text-cyan-300" /> Tareas de estudio
            </h3>

            <div className="flex items-center gap-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Añadir tarea…" className="h-9" />
                <Button size="sm" onClick={add} disabled={!title.trim()} className="h-9 shrink-0">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-violet-400/20 bg-violet-500/[0.05] p-2">
                <Bot className="h-4 w-4 shrink-0 text-violet-300" />
                <Input value={recoTopic} onChange={(e) => setRecoTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && recommend()} placeholder="Recomiéndame tareas sobre…" className="h-8 border-0 bg-transparent focus-visible:ring-0" />
                <Button size="sm" variant="outline" onClick={recommend} disabled={!recoTopic.trim() || recommending} className="h-8 shrink-0">
                    {recommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando tareas…
                </div>
            ) : tasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/12 p-6 text-center text-xs text-muted-foreground">
                    Sin tareas todavía. Añade una o pide recomendaciones a Aurora.
                </p>
            ) : (
                <ul className="space-y-1">
                    {[...pending, ...done].map((t) => (
                        <li key={t.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5">
                            <Checkbox checked={t.done} onCheckedChange={async () => { await toggleTask(t.id, !t.done); await reload(); }} />
                            <span className={cn("flex-1 text-sm", t.done && "text-muted-foreground line-through")}>{t.title}</span>
                            {t.source === "astraura" && <Sparkles className="h-3 w-3 shrink-0 text-violet-300/70" />}
                            <button onClick={async () => { await deleteTask(t.id); await reload(); }} className="rounded p-1 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-red-300 group-hover:opacity-100" title="Quitar">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function ProjectsColumn() {
    const [projects, setProjects] = useState<StudyProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [showForm, setShowForm] = useState(false);

    const reload = useCallback(async () => {
        setProjects(await listProjects());
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const add = async () => {
        if (!title.trim()) return;
        const p = await createProject({ title, description: desc });
        if (p) {
            setTitle("");
            setDesc("");
            setShowForm(false);
            await reload();
        } else toast.error("Inicia sesión para crear proyectos.");
    };

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white/90">
                    <FolderKanban className="h-4 w-4 text-emerald-300" /> Proyectos
                </h3>
                <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
                    <Plus className="h-4 w-4" /> Nuevo
                </Button>
            </div>

            {showForm && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del proyecto" />
                    <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="¿Qué quieres construir o investigar?" rows={2} />
                    <Button size="sm" onClick={add} disabled={!title.trim()}>
                        <Plus className="h-4 w-4" /> Crear proyecto
                    </Button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando proyectos…
                </div>
            ) : projects.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/12 p-6 text-center text-xs text-muted-foreground">
                    Aún no hay proyectos. Convierte lo que estudias en algo tangible.
                </p>
            ) : (
                <div className="space-y-2">
                    {projects.map((p) => (
                        <div key={p.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white/90">{p.title}</p>
                                    {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                                </div>
                                <button onClick={async () => { await deleteProject(p.id); await reload(); }} className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-300" title="Eliminar">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${STATUS_COLOR[p.status]}55`, color: STATUS_COLOR[p.status] }}>
                                    {STATUS_LABEL[p.status]}
                                </Badge>
                                <Select value={p.status} onValueChange={async (v) => { await updateProject(p.id, { status: v as ProjectStatus }); await reload(); }}>
                                    <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                                            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export default StudyTasksPanel;
