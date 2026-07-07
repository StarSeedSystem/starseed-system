"use client";

// src/components/education/learning-path.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Ruta de aprendizaje" de un tema: recursos REALES ya vinculados (cursos y
// artículos cuyo `tags` incluye el nombre del tema, de sólo lectura) + una
// lista ORDENADA de pasos propios con checkbox, persistida por usuario
// (src/lib/education/progress.ts). Progreso visible en una barra de %.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Newspaper, Plus, Trash2, Loader2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { contentForNode, type LinkedContent } from "@/lib/education/curriculum";
import {
    addLearningStep,
    loadLearningPath,
    progressPct,
    removeLearningStep,
    toggleLearningStep,
    type LearningStep,
} from "@/lib/education/progress";

export function LearningPathPanel({
    topicId,
    topicName,
    accent = "#22d3ee",
}: {
    topicId: string;
    topicName: string;
    accent?: string;
}) {
    const [steps, setSteps] = useState<LearningStep[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [linked, setLinked] = useState<LinkedContent>({ courses: [], articles: [] });

    const reload = useCallback(async () => {
        setSteps(await loadLearningPath(topicId));
        setLoading(false);
    }, [topicId]);

    useEffect(() => {
        setLoading(true);
        setLinked(contentForNode(topicName));
        void reload();
    }, [reload, topicName]);

    const pct = progressPct(steps);
    const hasLinked = linked.courses.length > 0 || linked.articles.length > 0;

    const submit = async () => {
        const t = newTitle.trim();
        if (!t) return;
        setNewTitle("");
        setSteps(await addLearningStep(topicId, t));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" style={{ color: accent }} />
                <h4 className="text-sm font-semibold">Ruta de aprendizaje</h4>
            </div>

            {hasLinked && (
                <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recursos vinculados a este tema</p>
                    {linked.courses.map((c) => (
                        <Link
                            key={c.id}
                            href={c.href}
                            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:border-white/25"
                        >
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="truncate">{c.title}</span>
                        </Link>
                    ))}
                    {linked.articles.map((a) => (
                        <Link
                            key={a.id}
                            href={a.href}
                            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:border-white/25"
                        >
                            <Newspaper className="h-3.5 w-3.5 shrink-0 text-accent" />
                            <span className="truncate">{a.title}</span>
                        </Link>
                    ))}
                </div>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Tus pasos</span>
                    {steps.length > 0 && <span className="tabular-nums">{pct}% completado</span>}
                </div>
                {steps.length > 0 && <Progress value={pct} />}

                {loading ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando tu progreso…
                    </p>
                ) : steps.length === 0 && !hasLinked ? (
                    <p className="rounded-lg border border-dashed border-white/12 p-3 text-center text-xs text-muted-foreground">
                        Aún no hay recursos ni pasos en esta ruta. Añade el primero abajo.
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {steps.map((s) => (
                            <li
                                key={s.id}
                                className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5"
                            >
                                <Checkbox
                                    checked={s.done}
                                    onCheckedChange={async () => setSteps(await toggleLearningStep(topicId, s.id))}
                                />
                                <span className={cn("flex-1 truncate text-sm", s.done && "text-muted-foreground line-through")}>
                                    {s.title}
                                </span>
                                <button
                                    onClick={async () => setSteps(await removeLearningStep(topicId, s.id))}
                                    className="rounded p-1 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"
                                    title="Quitar paso"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex items-center gap-2">
                    <Input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        placeholder="Añadir paso (p.ej. Leer introducción, practicar ejercicios…)"
                        className="h-8 text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={submit} disabled={!newTitle.trim()} className="h-8 shrink-0 px-2.5">
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
                {steps.length > 0 && (
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${accent}55`, color: accent }}>
                        Progreso persistido en tu cuenta
                    </Badge>
                )}
            </div>
        </div>
    );
}
