"use client";

// src/components/education/group-education-panel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Sección "Educación" para grupos de estudio (círculos/colectivos) y páginas
// de tipo proyecto — se integra en GrupoToolkit. Cinco bloques, todos
// persistidos en `entity_state` del propio grupo/página (RLS: miembros para
// grupos, dueño para páginas — ver src/lib/education/group-education.ts):
//   · Temario y Recursos — temas del catálogo BUILTIN vinculados (visibles a
//     todos), con sus lecciones/recursos reales (cursos/artículos etiquetados).
//   · Exámenes         — constructor + intento → insignia real al aprobar.
//   · Proyectos y Tareas — lista persistida con estado y asignado.
//   · Pizarras del grupo — os_spaces kind="board" filtradas por group_slug.
//   · Sesiones en vivo   — estado compartido simple vía useServerChannel.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
    ToolSection,
    ProgressRow,
    Chip,
    EmptyHint,
} from "@/components/social/toolkits/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    Plus,
    Trash2,
    X,
    Loader2,
    CheckCircle2,
    Circle,
    Clock3,
    ListTodo,
    ClipboardCheck,
    BookMarked,
    BookOpen,
    Newspaper,
    PenSquare,
    Radio as RadioIcon,
    ArrowUpRight,
} from "lucide-react";

import { builtinFlat, builtinById, nodePath, contentForNode } from "@/lib/education/curriculum";
import {
    groupEduRef,
    loadGroupTopics,
    setGroupTopics,
    loadGroupTasks,
    addGroupTask,
    setGroupTaskStatus,
    removeGroupTask,
    loadExams,
    createExam,
    removeExam,
    loadAttempts,
    submitExamAttempt,
    passedCount,
    type Exam,
    type GroupTask,
    type TaskStatus,
    type ExamAttempt,
    type GroupEntityKind,
    type CreateExamInput,
    type GradeResult,
} from "@/lib/education/group-education";
import { useMySpaces, createSpace } from "@/lib/spaces/spaces";
import { useServerChannel } from "@/lib/servers/server-channel";
import { type EntityRef } from "@/lib/sync/entity-state";

// ── Temario ──────────────────────────────────────────────────────────────────

function TemarioSection({ entityRef, accent }: { entityRef: EntityRef; accent: string }) {
    const [linkedIds, setLinkedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState("");

    const byId = useMemo(() => builtinById(), []);
    const pickable = useMemo(() => builtinFlat().filter((t) => t.kind !== "category"), []);

    const reload = useCallback(async () => {
        setLinkedIds(await loadGroupTopics(entityRef));
        setLoading(false);
    }, [entityRef]);

    useEffect(() => {
        setLoading(true);
        void reload();
    }, [reload]);

    const toggleTopic = async (id: string) => {
        const next = linkedIds.includes(id) ? linkedIds.filter((x) => x !== id) : [...linkedIds, id];
        setLinkedIds(next);
        const ok = await setGroupTopics(entityRef, next);
        if (!ok) {
            toast.error("No se pudo guardar el temario (¿sesión o permisos?)");
            await reload();
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return pickable;
        return pickable.filter((t) => t.name.toLowerCase().includes(q));
    }, [search, pickable]);

    return (
        <ToolSection
            icon={<BookMarked size={16} />}
            title="Temario y Recursos"
            subtitle="Temas del catálogo educativo vinculados, con sus lecciones y recursos reales"
            accent={accent}
            action={
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                    <Plus className="h-4 w-4" /> Vincular tema
                </Button>
            }
        >
            {loading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : linkedIds.length === 0 ? (
                <EmptyHint>Aún no hay temas vinculados. Vincula el primero desde el catálogo educativo.</EmptyHint>
            ) : (
                <div className="space-y-2">
                    {linkedIds.map((id) => {
                        const node = byId.get(id);
                        if (!node) return null;
                        const path = nodePath(id, byId).map((p) => p.name).join(" › ");
                        const linked = contentForNode(node.name);
                        const hasLinked = linked.courses.length > 0 || linked.articles.length > 0;
                        return (
                            <div key={id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                                <div className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: accent }}>
                                        {path}
                                    </span>
                                    <button
                                        onClick={() => toggleTopic(id)}
                                        className="shrink-0 text-white/40 hover:text-red-300"
                                        title="Desvincular tema"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                {hasLinked ? (
                                    <div className="mt-2 space-y-1">
                                        {linked.courses.map((c) => (
                                            <Link
                                                key={c.id}
                                                href={c.href}
                                                className="flex items-center gap-2 text-xs text-white/70 transition hover:text-white hover:underline"
                                            >
                                                <BookOpen className="h-3 w-3 shrink-0" /> {c.title}
                                            </Link>
                                        ))}
                                        {linked.articles.map((a) => (
                                            <Link
                                                key={a.id}
                                                href={a.href}
                                                className="flex items-center gap-2 text-xs text-white/70 transition hover:text-white hover:underline"
                                            >
                                                <Newspaper className="h-3 w-3 shrink-0" /> {a.title}
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-1.5 text-[11px] text-white/35">Sin lecciones o recursos vinculados aún.</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Vincular temas del catálogo</DialogTitle>
                        <DialogDescription>
                            Sólo temas del catálogo base (así todos los miembros pueden verlos, tengan o no extensiones propias).
                        </DialogDescription>
                    </DialogHeader>
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tema…" />
                    <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
                        {filtered.map((t) => {
                            const on = linkedIds.includes(t.id);
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => toggleTopic(t.id)}
                                    className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition",
                                        on ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                            on ? "border-white bg-white/30" : "border-white/20",
                                        )}
                                    >
                                        {on && <span className="h-2 w-2 rounded-sm bg-white" />}
                                    </span>
                                    <span className="truncate">{nodePath(t.id, byId).map((p) => p.name).join(" › ")}</span>
                                </button>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setPickerOpen(false)}>Listo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ToolSection>
    );
}

// ── Exámenes ─────────────────────────────────────────────────────────────────

type NewQuestion = { prompt: string; options: string[]; correctIndex: number };

function ExamCreateDialog({
    open,
    onOpenChange,
    onCreate,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onCreate: (input: CreateExamInput) => void;
}) {
    const [title, setTitle] = useState("");
    const [threshold, setThreshold] = useState(60);
    const [questions, setQuestions] = useState<NewQuestion[]>([{ prompt: "", options: ["", ""], correctIndex: 0 }]);

    useEffect(() => {
        if (open) {
            setTitle("");
            setThreshold(60);
            setQuestions([{ prompt: "", options: ["", ""], correctIndex: 0 }]);
        }
    }, [open]);

    const updateQuestion = (i: number, patch: Partial<NewQuestion>) =>
        setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
    const addQuestion = () => setQuestions((qs) => [...qs, { prompt: "", options: ["", ""], correctIndex: 0 }]);
    const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
    const addOption = (i: number) => updateQuestion(i, { options: [...questions[i].options, ""] });
    const removeOption = (i: number, oi: number) => {
        const opts = questions[i].options.filter((_, idx) => idx !== oi);
        const correct = questions[i].correctIndex >= opts.length ? 0 : questions[i].correctIndex;
        updateQuestion(i, { options: opts, correctIndex: correct });
    };

    const canSubmit =
        title.trim().length > 0 &&
        questions.every((q) => q.prompt.trim() && q.options.filter((o) => o.trim()).length >= 2);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Crear examen</DialogTitle>
                    <DialogDescription>
                        Preguntas de opción múltiple. Al superar el umbral, la persona recibe una insignia real en su perfil.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del examen" />
                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground">Umbral de aprobado</span>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            value={threshold}
                            onChange={(e) => setThreshold(Number(e.target.value))}
                            className="h-8 w-20"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                    </div>

                    <div className="space-y-3">
                        {questions.map((q, i) => (
                            <div key={i} className="space-y-2 rounded-lg border border-white/10 p-3">
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={q.prompt}
                                        onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                                        placeholder={`Pregunta ${i + 1}`}
                                        className="flex-1"
                                    />
                                    {questions.length > 1 && (
                                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-white/40" onClick={() => removeQuestion(i)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <RadioGroup
                                    value={String(q.correctIndex)}
                                    onValueChange={(v) => updateQuestion(i, { correctIndex: Number(v) })}
                                    className="space-y-1.5"
                                >
                                    {q.options.map((opt, oi) => (
                                        <div key={oi} className="flex items-center gap-2">
                                            <RadioGroupItem value={String(oi)} id={`create-q${i}-o${oi}`} />
                                            <Input
                                                value={opt}
                                                onChange={(e) => {
                                                    const opts = [...q.options];
                                                    opts[oi] = e.target.value;
                                                    updateQuestion(i, { options: opts });
                                                }}
                                                placeholder={`Opción ${oi + 1}`}
                                                className="h-8 flex-1 text-sm"
                                            />
                                            {q.options.length > 2 && (
                                                <button onClick={() => removeOption(i, oi)} className="text-white/30 hover:text-red-300">
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </RadioGroup>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addOption(i)}>
                                    <Plus className="h-3.5 w-3.5" /> Opción
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={addQuestion}>
                        <Plus className="h-4 w-4" /> Añadir pregunta
                    </Button>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button disabled={!canSubmit} onClick={() => onCreate({ title, passThreshold: threshold, questions })}>
                        Crear examen
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ExamTakeDialog({
    exam,
    entityRef,
    onClose,
    onSubmitted,
}: {
    exam: Exam;
    entityRef: EntityRef;
    onClose: () => void;
    onSubmitted: () => void;
}) {
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [result, setResult] = useState<GradeResult | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        setSubmitting(true);
        const res = await submitExamAttempt(entityRef, exam, answers);
        setResult(res);
        setSubmitting(false);
        if (res.passed) {
            toast.success(
                res.badgeAwarded && !res.alreadyHadBadge
                    ? "¡Aprobado! Insignia de logro otorgada en tu perfil."
                    : "¡Aprobado!",
            );
        } else {
            toast.message(`No alcanzaste el umbral (${res.score}% de ${exam.passThreshold}% requerido)`);
        }
        onSubmitted();
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{exam.title}</DialogTitle>
                    {!result && <DialogDescription>Responde todas las preguntas y envía para conocer tu resultado.</DialogDescription>}
                </DialogHeader>

                {result ? (
                    <div className="space-y-3 py-2 text-center">
                        <p className={cn("text-3xl font-bold tabular-nums", result.passed ? "text-emerald-400" : "text-red-300")}>
                            {result.score}%
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {result.correctCount} de {result.total} correctas · umbral {exam.passThreshold}%
                        </p>
                        {result.passed ? (
                            <p className="text-sm text-emerald-300">
                                {result.badgeAwarded && !result.alreadyHadBadge
                                    ? "Insignia de logro otorgada — visible en tus insignias de perfil."
                                    : "Aprobado."}
                            </p>
                        ) : (
                            <p className="text-sm text-amber-300">No alcanzaste el umbral. Puedes intentarlo de nuevo.</p>
                        )}
                        <div className="flex justify-center gap-2 pt-2">
                            {!result.passed && (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setResult(null);
                                        setAnswers({});
                                    }}
                                >
                                    Reintentar
                                </Button>
                            )}
                            <Button onClick={onClose}>Cerrar</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            {exam.questions.map((q, i) => (
                                <div key={q.id}>
                                    <p className="mb-1.5 text-sm font-medium">
                                        {i + 1}. {q.prompt}
                                    </p>
                                    <RadioGroup
                                        value={answers[q.id] !== undefined ? String(answers[q.id]) : undefined}
                                        onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: Number(v) }))}
                                    >
                                        {q.options.map((opt, oi) => (
                                            <div key={oi} className="flex items-center gap-2 py-0.5">
                                                <RadioGroupItem value={String(oi)} id={`take-${q.id}-${oi}`} />
                                                <label htmlFor={`take-${q.id}-${oi}`} className="cursor-pointer text-sm">
                                                    {opt}
                                                </label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                </div>
                            ))}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button disabled={submitting || Object.keys(answers).length < exam.questions.length} onClick={submit}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function ExamenesSection({ entityRef, accent }: { entityRef: EntityRef; accent: string }) {
    const [exams, setExams] = useState<Exam[]>([]);
    const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [takeExam, setTakeExam] = useState<Exam | null>(null);

    const reload = useCallback(async () => {
        const [ex, att] = await Promise.all([loadExams(entityRef), loadAttempts(entityRef)]);
        setExams(ex);
        setAttempts(att);
        setLoading(false);
    }, [entityRef]);

    useEffect(() => {
        setLoading(true);
        void reload();
    }, [reload]);

    return (
        <ToolSection
            icon={<ClipboardCheck size={16} />}
            title="Exámenes"
            subtitle="Aprobar un examen otorga una insignia real en el perfil"
            accent={accent}
            action={
                <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> Crear examen
                </Button>
            }
        >
            {loading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : exams.length === 0 ? (
                <EmptyHint>Aún no hay exámenes en este círculo. Crea el primero.</EmptyHint>
            ) : (
                <div className="space-y-2">
                    {exams.map((exam) => {
                        const passed = passedCount(attempts, exam.id);
                        return (
                            <div key={exam.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{exam.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {exam.questions.length} pregunta{exam.questions.length === 1 ? "" : "s"} · aprobado ≥{exam.passThreshold}% ·{" "}
                                        {passed} aprobado{passed === 1 ? "" : "s"}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button size="sm" variant="outline" onClick={() => setTakeExam(exam)}>
                                        Hacer examen
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-white/40 hover:text-red-300"
                                        onClick={async () => setExams(await removeExam(entityRef, exam.id))}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ExamCreateDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreate={async (input) => {
                    setExams(await createExam(entityRef, input));
                    setCreateOpen(false);
                }}
            />
            {takeExam && (
                <ExamTakeDialog exam={takeExam} entityRef={entityRef} onClose={() => setTakeExam(null)} onSubmitted={reload} />
            )}
        </ToolSection>
    );
}

// ── Proyectos y Tareas ───────────────────────────────────────────────────────

const STATUS_LABEL: Record<TaskStatus, string> = {
    pendiente: "Pendiente",
    en_progreso: "En progreso",
    hecho: "Hecho",
};
const STATUS_ORDER: TaskStatus[] = ["pendiente", "en_progreso", "hecho"];

function TareasSection({ entityRef, accent }: { entityRef: EntityRef; accent: string }) {
    const [tasks, setTasks] = useState<GroupTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [assignee, setAssignee] = useState("");

    const reload = useCallback(async () => {
        setTasks(await loadGroupTasks(entityRef));
        setLoading(false);
    }, [entityRef]);

    useEffect(() => {
        setLoading(true);
        void reload();
    }, [reload]);

    const submit = async () => {
        if (!title.trim()) return;
        const t = title;
        const a = assignee;
        setTitle("");
        setAssignee("");
        setTasks(await addGroupTask(entityRef, t, a));
    };

    const cycleStatus = async (task: GroupTask) => {
        const idx = STATUS_ORDER.indexOf(task.status);
        const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
        setTasks(await setGroupTaskStatus(entityRef, task.id, next));
    };

    const done = tasks.filter((t) => t.status === "hecho").length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

    return (
        <ToolSection icon={<ListTodo size={16} />} title="Proyectos y Tareas" subtitle="Seguimiento de compromisos del círculo" accent={accent}>
            <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        placeholder="Nueva tarea…"
                        className="flex-1"
                    />
                    <Input
                        value={assignee}
                        onChange={(e) => setAssignee(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        placeholder="Asignado/a (opcional)"
                        className="sm:w-48"
                    />
                    <Button onClick={submit} disabled={!title.trim()} className="shrink-0">
                        <Plus className="h-4 w-4" /> Añadir
                    </Button>
                </div>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : tasks.length === 0 ? (
                    <EmptyHint>No hay tareas asignadas en este círculo todavía.</EmptyHint>
                ) : (
                    <>
                        <ProgressRow label="Progreso" value={pct} detail={`${done} / ${tasks.length} completadas`} accent={accent} />
                        <ul className="space-y-1.5">
                            {tasks.map((task) => (
                                <li key={task.id} className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                                    <button onClick={() => cycleStatus(task)} title="Cambiar estado" className="shrink-0">
                                        {task.status === "hecho" ? (
                                            <CheckCircle2 className="h-4 w-4" style={{ color: accent }} />
                                        ) : task.status === "en_progreso" ? (
                                            <Clock3 className="h-4 w-4 text-amber-400" />
                                        ) : (
                                            <Circle className="h-4 w-4 text-white/30" />
                                        )}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className={cn("truncate text-sm font-medium", task.status === "hecho" && "text-muted-foreground line-through")}>
                                            {task.title}
                                        </p>
                                        {task.assignee && <p className="truncate text-xs text-muted-foreground">{task.assignee}</p>}
                                    </div>
                                    <Chip accent={accent}>{STATUS_LABEL[task.status]}</Chip>
                                    <button
                                        onClick={async () => setTasks(await removeGroupTask(entityRef, task.id))}
                                        className="rounded p-1 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"
                                        title="Eliminar tarea"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </ToolSection>
    );
}

// ── Pizarras del grupo ───────────────────────────────────────────────────────

function PizarrasSection({ slug, accent }: { slug: string; accent: string }) {
    const { spaces, loading, reload } = useMySpaces("board");
    const [creating, setCreating] = useState(false);
    const groupBoards = useMemo(() => spaces.filter((s) => s.groupSlug === slug), [spaces, slug]);

    const createBoard = async () => {
        setCreating(true);
        // access="profiles" replica la convención ya usada para pizarras "grupales"
        // (ver src/components/posts/live-attachment.tsx) cuando se fija groupSlug.
        const created = await createSpace({ kind: "board", title: `Pizarra de ${slug}`, groupSlug: slug, access: "profiles", doc: {} });
        setCreating(false);
        if (created) {
            toast.success("Pizarra creada");
            reload();
        } else {
            toast.error("Inicia sesión para crear una pizarra");
        }
    };

    return (
        <ToolSection
            icon={<PenSquare size={16} />}
            title="Pizarras del grupo"
            subtitle="Lienzos compartidos vinculados a este círculo"
            accent={accent}
            action={
                <Button size="sm" variant="outline" onClick={createBoard} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nueva pizarra
                </Button>
            }
        >
            {loading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : groupBoards.length === 0 ? (
                <EmptyHint>Este círculo aún no tiene pizarras compartidas.</EmptyHint>
            ) : (
                <div className="space-y-2">
                    {groupBoards.map((b) => {
                        const when = b.updatedAt || b.createdAt;
                        return (
                            <Link
                                key={b.id}
                                href={`/pizarra?board-space=${b.id}`}
                                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/25"
                            >
                                <PenSquare className="h-4 w-4 shrink-0" style={{ color: accent }} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{b.title}</p>
                                    {when && (
                                        <p className="text-xs text-muted-foreground">
                                            Actualizada {new Date(when).toLocaleDateString("es-ES")}
                                        </p>
                                    )}
                                </div>
                                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </Link>
                        );
                    })}
                </div>
            )}
        </ToolSection>
    );
}

// ── Sesiones en vivo ─────────────────────────────────────────────────────────

interface LiveSessionState {
    live: boolean;
    topic: string;
    startedAt: string | null;
}
const LIVE_INITIAL: LiveSessionState = { live: false, topic: "", startedAt: null };

function SesionEnVivoSection({ slug, entityKind, accent }: { slug: string; entityKind: GroupEntityKind; accent: string }) {
    const serverId = `edu:${entityKind}:${slug}`;
    const { state, setState, loaded, connected } = useServerChannel<LiveSessionState>(serverId, LIVE_INITIAL);
    const [topicDraft, setTopicDraft] = useState("");

    useEffect(() => {
        setTopicDraft(state.topic ?? "");
    }, [state.topic]);

    const start = async () => {
        await setState({ live: true, topic: topicDraft.trim() || "Sesión de estudio", startedAt: new Date().toISOString() });
    };
    const stop = async () => {
        await setState({ live: false, topic: state.topic, startedAt: null });
    };

    return (
        <ToolSection icon={<RadioIcon size={16} />} title="Sesiones en vivo" subtitle="Estado compartido en tiempo real entre los miembros" accent={accent}>
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                    <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-white/20")} />
                    <span className="text-muted-foreground">{connected ? "Conectado en tiempo real" : "Conectando…"}</span>
                </div>

                {!loaded ? (
                    <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : state.live ? (
                    <div className="rounded-xl border p-3" style={{ borderColor: `${accent}55`, background: `${accent}0d` }}>
                        <p className="flex items-center gap-2 text-sm font-medium" style={{ color: accent }}>
                            <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: accent }} />
                            En vivo ahora: {state.topic}
                        </p>
                        {state.startedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Desde las {new Date(state.startedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                        )}
                        <Button size="sm" variant="outline" className="mt-2" onClick={stop}>
                            Terminar sesión
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <EmptyHint>No hay ninguna sesión en vivo ahora mismo.</EmptyHint>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                                value={topicDraft}
                                onChange={(e) => setTopicDraft(e.target.value)}
                                placeholder="Tema de la sesión (opcional)"
                                className="flex-1"
                            />
                            <Button onClick={start} className="shrink-0">
                                Iniciar sesión en vivo
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </ToolSection>
    );
}

// ── Export principal ─────────────────────────────────────────────────────────

export function GroupEducationPanel({
    slug,
    accent,
    entityKind = "group",
}: {
    slug: string;
    accent?: string;
    entityKind?: GroupEntityKind;
}) {
    const ac = accent ?? "#22d3ee";
    const entityRef = useMemo<EntityRef>(() => groupEduRef(entityKind, slug), [entityKind, slug]);

    return (
        <div className="space-y-6">
            <TemarioSection entityRef={entityRef} accent={ac} />
            <ExamenesSection entityRef={entityRef} accent={ac} />
            <TareasSection entityRef={entityRef} accent={ac} />
            <PizarrasSection slug={slug} accent={ac} />
            <SesionEnVivoSection slug={slug} entityKind={entityKind} accent={ac} />
        </div>
    );
}
