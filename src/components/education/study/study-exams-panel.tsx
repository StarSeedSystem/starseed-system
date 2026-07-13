"use client";

// src/components/education/study/study-exams-panel.tsx
// Exámenes OPCIONALES. Astraura genera preguntas por tema; el usuario responde,
// se corrige y, al aprobar, se otorga una INSIGNIA real (profile_badges).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    GraduationCap,
    Sparkles,
    Loader2,
    Trash2,
    Award,
    CheckCircle2,
    XCircle,
    ChevronLeft,
    Play,
    Plus,
    RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
    type Exam,
    type ExamResult,
    listExams,
    createExam,
    deleteExam,
    submitExamAttempt,
    listMyAttempts,
    type ExamAttempt,
} from "@/lib/education/study";
import { generateExam } from "@/lib/education/study-ai";
import { listBadges, type Badge as BadgeType } from "@/lib/badges/badges";

export function StudyExamsPanel() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [badges, setBadges] = useState<BadgeType[]>([]);
    const [loading, setLoading] = useState(true);
    const [taking, setTaking] = useState<Exam | null>(null);

    const [topic, setTopic] = useState("");
    const [count, setCount] = useState(5);
    const [generating, setGenerating] = useState(false);

    const reload = useCallback(async () => {
        const [es, bs] = await Promise.all([listExams(), listBadges()]);
        setExams(es);
        setBadges(bs);
        setLoading(false);
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const badgeByCode = useMemo(() => {
        const m = new Map<string, BadgeType>();
        for (const b of badges) m.set(b.code, b);
        return m;
    }, [badges]);

    const doGenerate = async () => {
        if (!topic.trim()) return;
        setGenerating(true);
        const res = await generateExam(topic, count);
        if (!res.ok || !res.questions) {
            setGenerating(false);
            toast.error(res.error ?? "Aurora no pudo generar el examen.");
            return;
        }
        const saved = await createExam({ title: `Examen: ${topic}`, topic, questions: res.questions, badgeCode: "exam_passed" });
        setGenerating(false);
        if (!saved) {
            toast.error("Se generó el examen pero no se pudo guardar. ¿Sesión iniciada?");
            return;
        }
        toast.success("Examen creado con Aurora");
        setTopic("");
        await reload();
        setTaking(saved);
    };

    const doDelete = async (e: Exam) => {
        const ok = await deleteExam(e.id);
        if (ok) {
            toast.success("Examen eliminado");
            await reload();
        } else toast.error("Solo puedes eliminar tus propios exámenes.");
    };

    if (taking) {
        return <ExamRunner exam={taking} badge={taking.badge_code ? badgeByCode.get(taking.badge_code) : undefined} onBack={() => setTaking(null)} />;
    }

    const templates = exams.filter((e) => e.is_template);
    const mine = exams.filter((e) => !e.is_template);

    return (
        <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                    <Sparkles className="h-4 w-4 text-amber-300" /> Genera un examen con Aurora
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doGenerate()}
                        placeholder="Tema del examen (p.ej. Genética, Democracia directa…)"
                        className="min-w-[200px] flex-1"
                    />
                    <div className="flex items-center gap-1 text-xs text-white/60">
                        <span>Preguntas</span>
                        <Input
                            type="number"
                            min={3}
                            max={10}
                            value={count}
                            onChange={(e) => setCount(Math.max(3, Math.min(10, Number(e.target.value) || 5)))}
                            className="h-8 w-16"
                        />
                    </div>
                    <Button onClick={doGenerate} disabled={!topic.trim() || generating}>
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar
                    </Button>
                </div>
                <p className="text-[11px] text-white/40">Opcional y libre. Al aprobar (≥70%) recibes una insignia real de la red.</p>
            </div>

            {loading ? (
                <div className="flex min-h-[20vh] items-center justify-center text-white/60">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando exámenes…
                </div>
            ) : (
                <>
                    {mine.length > 0 && (
                        <section className="space-y-2">
                            <h4 className="text-xs uppercase tracking-wide text-white/40">Mis exámenes</h4>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {mine.map((e) => (
                                    <ExamCard key={e.id} exam={e} badge={e.badge_code ? badgeByCode.get(e.badge_code) : undefined} onTake={() => setTaking(e)} onDelete={() => doDelete(e)} />
                                ))}
                            </div>
                        </section>
                    )}
                    <section className="space-y-2">
                        <h4 className="text-xs uppercase tracking-wide text-white/40">Exámenes de ejemplo</h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {templates.map((e) => (
                                <ExamCard key={e.id} exam={e} badge={e.badge_code ? badgeByCode.get(e.badge_code) : undefined} onTake={() => setTaking(e)} template />
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function ExamCard({ exam, badge, onTake, onDelete, template }: { exam: Exam; badge?: BadgeType; onTake: () => void; onDelete?: () => void; template?: boolean }) {
    return (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 shrink-0 text-amber-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{exam.title}</span>
                {template && <Badge variant="secondary" className="text-[10px]">Ejemplo</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
                <span>{exam.questions.length} preguntas</span>
                <span>· aprobar ≥ {Math.round((exam.pass_threshold ?? 0.7) * 100)}%</span>
                {badge && (
                    <span className="inline-flex items-center gap-1 text-amber-200/80">
                        · <Award className="h-3 w-3" /> {badge.name}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" onClick={onTake} className="flex-1">
                    <Play className="h-4 w-4" /> Realizar
                </Button>
                {onDelete && (
                    <button onClick={onDelete} className="rounded p-1.5 text-white/30 hover:bg-red-500/20 hover:text-red-300" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

function ExamRunner({ exam, badge, onBack }: { exam: Exam; badge?: BadgeType; onBack: () => void }) {
    const [answers, setAnswers] = useState<number[]>(() => new Array(exam.questions.length).fill(-1));
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<ExamResult | null>(null);
    const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

    useEffect(() => {
        void listMyAttempts(exam.id).then(setAttempts);
    }, [exam.id]);

    const allAnswered = answers.every((a) => a >= 0);

    const submit = async () => {
        setSubmitting(true);
        const res = await submitExamAttempt(exam, answers);
        setSubmitting(false);
        setResult(res);
        if (res.passed) {
            if (res.awardedBadge) toast.success(`¡Aprobado! Insignia "${badge?.name ?? res.awardedBadge}" desbloqueada 🎉`);
            else if (res.needsProfile) toast.success("¡Aprobado! Crea tu perfil para recibir la insignia.");
            else toast.success("¡Aprobado! 🎉");
        } else {
            toast("No alcanzaste el mínimo. ¡Puedes reintentarlo!", { icon: "📚" });
        }
        void listMyAttempts(exam.id).then(setAttempts);
    };

    const retry = () => {
        setAnswers(new Array(exam.questions.length).fill(-1));
        setResult(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={onBack} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </Button>
                <h3 className="text-sm font-semibold text-white/90">{exam.title}</h3>
                {attempts.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                        {attempts.some((a) => a.passed) ? "Aprobado antes" : `${attempts.length} intento(s)`}
                    </Badge>
                )}
            </div>

            {result && (
                <div
                    className={cn(
                        "rounded-2xl border p-4",
                        result.passed ? "border-emerald-400/30 bg-emerald-500/[0.08]" : "border-amber-400/30 bg-amber-500/[0.06]",
                    )}
                >
                    <div className="flex items-center gap-2">
                        {result.passed ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <XCircle className="h-6 w-6 text-amber-300" />}
                        <div>
                            <p className="text-base font-semibold">{result.passed ? "¡Aprobado!" : "Casi — sigue estudiando"}</p>
                            <p className="text-xs text-white/60">
                                {result.correct} de {result.total} correctas · {Math.round(result.score * 100)}%
                            </p>
                        </div>
                        <div className="ml-auto">
                            {result.passed && result.awardedBadge && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
                                    <Award className="h-4 w-4" /> {badge?.name ?? result.awardedBadge}
                                </span>
                            )}
                        </div>
                    </div>
                    <Progress value={Math.round(result.score * 100)} className="mt-3" />
                    {!result.passed && (
                        <Button size="sm" variant="outline" onClick={retry} className="mt-3">
                            <RotateCcw className="h-4 w-4" /> Reintentar
                        </Button>
                    )}
                </div>
            )}

            <div className="space-y-3">
                {exam.questions.map((q, qi) => {
                    const chosen = answers[qi];
                    return (
                        <div key={qi} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                            <p className="mb-2 text-sm font-medium text-white/90">
                                {qi + 1}. {q.q}
                            </p>
                            <div className="space-y-1.5">
                                {q.options.map((opt, oi) => {
                                    const isChosen = chosen === oi;
                                    const isCorrect = result && oi === q.answer;
                                    const isWrongChosen = result && isChosen && oi !== q.answer;
                                    return (
                                        <button
                                            key={oi}
                                            disabled={!!result}
                                            onClick={() => setAnswers((a) => a.map((v, idx) => (idx === qi ? oi : v)))}
                                            className={cn(
                                                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                                                isCorrect
                                                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-50"
                                                    : isWrongChosen
                                                      ? "border-red-400/50 bg-red-500/15 text-red-100"
                                                      : isChosen
                                                        ? "border-violet-400/50 bg-violet-500/15 text-white"
                                                        : "border-white/10 bg-white/[0.02] text-white/80 hover:border-white/25",
                                            )}
                                        >
                                            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]", isChosen ? "border-current" : "border-white/30")}>
                                                {String.fromCharCode(65 + oi)}
                                            </span>
                                            <span className="flex-1">{opt}</span>
                                            {isCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                                            {isWrongChosen && <XCircle className="h-4 w-4 text-red-300" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {result && q.explanation && (
                                <p className="mt-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/60">{q.explanation}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {!result && (
                <Button onClick={submit} disabled={!allAnswered || submitting} className="w-full">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {allAnswered ? "Corregir examen" : "Responde todas las preguntas"}
                </Button>
            )}
        </div>
    );
}

export default StudyExamsPanel;
