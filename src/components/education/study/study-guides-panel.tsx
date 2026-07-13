"use client";

// src/components/education/study/study-guides-panel.tsx
// Guías inteligentes personalizadas + itinerarios. Generadas con Astraura,
// editables, con plantillas de ejemplo REALES. Los pasos de un itinerario se
// pueden convertir en tareas de estudio o programar como eventos (os_events).

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Sparkles,
    Plus,
    Loader2,
    BookMarked,
    Route,
    Trash2,
    Pencil,
    Save,
    X,
    ExternalLink,
    ListPlus,
    CalendarPlus,
    Copy,
    ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    type StudyGuide,
    type GuideSection,
    listGuides,
    createGuide,
    updateGuide,
    deleteGuide,
    forkGuide,
    createTask,
    createStudyEvent,
} from "@/lib/education/study";
import { generateStudyGuide } from "@/lib/education/study-ai";

export function StudyGuidesPanel() {
    const [guides, setGuides] = useState<StudyGuide[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<StudyGuide | null>(null);

    const [topic, setTopic] = useState("");
    const [kind, setKind] = useState<"guia" | "itinerario">("guia");
    const [generating, setGenerating] = useState(false);

    const reload = useCallback(async () => {
        const gs = await listGuides();
        setGuides(gs);
        setLoading(false);
        setSelected((cur) => (cur ? gs.find((g) => g.id === cur.id) ?? null : null));
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const doGenerate = async () => {
        if (!topic.trim()) return;
        setGenerating(true);
        const res = await generateStudyGuide(topic, { kind });
        if (!res.ok || !res.guide) {
            setGenerating(false);
            toast.error(res.error ?? "Aurora no pudo generar la guía.");
            return;
        }
        const saved = await createGuide(res.guide);
        setGenerating(false);
        if (!saved) {
            toast.error("Se generó la guía pero no se pudo guardar. ¿Has iniciado sesión?");
            return;
        }
        toast.success(`Guía "${saved.title}" creada con Aurora`);
        setTopic("");
        await reload();
        setSelected(saved);
    };

    if (selected) {
        return <GuideDetail guide={selected} onBack={() => setSelected(null)} onChanged={reload} />;
    }

    const templates = guides.filter((g) => g.is_template);
    const mine = guides.filter((g) => !g.is_template);

    return (
        <div className="space-y-4">
            {/* Generador */}
            <div className="space-y-2 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-violet-100">
                    <Sparkles className="h-4 w-4 text-violet-300" /> Genera una guía con Aurora
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doGenerate()}
                        placeholder="Tema (p.ej. Termodinámica, Voto líquido, Redes neuronales…)"
                        className="min-w-[200px] flex-1"
                    />
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
                        <button
                            onClick={() => setKind("guia")}
                            className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs", kind === "guia" ? "bg-violet-500/25 text-violet-100" : "text-white/55")}
                        >
                            <BookMarked className="h-3.5 w-3.5" /> Guía
                        </button>
                        <button
                            onClick={() => setKind("itinerario")}
                            className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs", kind === "itinerario" ? "bg-violet-500/25 text-violet-100" : "text-white/55")}
                        >
                            <Route className="h-3.5 w-3.5" /> Itinerario
                        </button>
                    </div>
                    <Button onClick={doGenerate} disabled={!topic.trim() || generating}>
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar
                    </Button>
                </div>
                <p className="text-[11px] text-white/40">Aurora usa fuentes gratis y locales primero; si una se agota, cambia sola. La guía queda editable.</p>
            </div>

            {loading ? (
                <div className="flex min-h-[20vh] items-center justify-center text-white/60">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando guías…
                </div>
            ) : (
                <>
                    {mine.length > 0 && (
                        <section className="space-y-2">
                            <h4 className="text-xs uppercase tracking-wide text-white/40">Mis guías</h4>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {mine.map((g) => (
                                    <GuideCard key={g.id} guide={g} onOpen={() => setSelected(g)} />
                                ))}
                            </div>
                        </section>
                    )}
                    <section className="space-y-2">
                        <h4 className="text-xs uppercase tracking-wide text-white/40">Ejemplos de la red</h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {templates.map((g) => (
                                <GuideCard key={g.id} guide={g} onOpen={() => setSelected(g)} template />
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function GuideCard({ guide, onOpen, template }: { guide: StudyGuide; onOpen: () => void; template?: boolean }) {
    const Icon = guide.kind === "itinerario" ? Route : BookMarked;
    return (
        <button
            onClick={onOpen}
            className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-violet-400/40 hover:bg-white/[0.04]"
        >
            <div className="flex w-full items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-violet-300" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">{guide.title}</span>
                {template && <Badge variant="secondary" className="text-[10px]">Ejemplo</Badge>}
            </div>
            {guide.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{guide.summary}</p>}
            <span className="text-[10px] text-white/40">{guide.sections.length} secciones</span>
        </button>
    );
}

function GuideDetail({ guide, onBack, onChanged }: { guide: StudyGuide; onBack: () => void; onChanged: () => Promise<void> }) {
    const isTemplate = guide.is_template || !guide.owner;
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(guide.title);
    const [summary, setSummary] = useState(guide.summary);
    const [sections, setSections] = useState<GuideSection[]>(guide.sections);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        const ok = await updateGuide(guide.id, { title, summary, sections });
        setSaving(false);
        if (ok) {
            toast.success("Guía guardada");
            setEditing(false);
            await onChanged();
        } else toast.error("No se pudo guardar.");
    };

    const doFork = async () => {
        const copy = await forkGuide(guide);
        if (copy) {
            toast.success("Copiada a tus guías — ya puedes editarla");
            await onChanged();
        } else toast.error("Inicia sesión para personalizar la guía.");
    };

    const doDelete = async () => {
        const ok = await deleteGuide(guide.id);
        if (ok) {
            toast.success("Guía eliminada");
            onBack();
            await onChanged();
        } else toast.error("No se pudo eliminar.");
    };

    const addSection = () => setSections((s) => [...s, { title: "Nueva sección", body: "", resources: [] }]);
    const removeSection = (i: number) => setSections((s) => s.filter((_, idx) => idx !== i));
    const patchSection = (i: number, patch: Partial<GuideSection>) =>
        setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));

    const stepToTask = async (sec: GuideSection) => {
        const t = await createTask({ title: sec.title, topic: guide.topic, guideId: guide.is_template ? null : guide.id, source: "astraura" });
        if (t) toast.success("Añadido a tus tareas de estudio");
        else toast.error("Inicia sesión para guardar tareas.");
    };

    const stepToEvent = async (sec: GuideSection, index: number) => {
        // Fecha del paso si la trae; si no, escalona una por semana desde hoy.
        const when = sec.date ? new Date(sec.date) : new Date(Date.now() + index * 7 * 86400_000);
        const ev = await createStudyEvent({ title: `${guide.title} · ${sec.title}`, startsAt: when.toISOString(), description: sec.body });
        if (ev) toast.success("Programado como evento en tu calendario");
        else toast.error("No se pudo crear el evento (¿sesión iniciada?).");
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={onBack} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </Button>
                <div className="ml-auto flex items-center gap-2">
                    {isTemplate ? (
                        <Button size="sm" variant="outline" onClick={doFork}>
                            <Copy className="h-4 w-4" /> Usar / personalizar
                        </Button>
                    ) : editing ? (
                        <>
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setTitle(guide.title); setSummary(guide.summary); setSections(guide.sections); }}>
                                <X className="h-4 w-4" /> Cancelar
                            </Button>
                            <Button size="sm" onClick={save} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                                <Pencil className="h-4 w-4" /> Editar
                            </Button>
                            <button onClick={doDelete} className="rounded p-1.5 text-white/40 hover:bg-red-500/20 hover:text-red-300" title="Eliminar">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 flex items-center gap-2">
                    {guide.kind === "itinerario" ? <Route className="h-5 w-5 text-violet-300" /> : <BookMarked className="h-5 w-5 text-violet-300" />}
                    {editing ? (
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-semibold" />
                    ) : (
                        <h3 className="text-lg font-semibold text-white/90">{title}</h3>
                    )}
                </div>
                {editing ? (
                    <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Resumen" className="mb-3" />
                ) : (
                    summary && <p className="mb-3 text-sm text-muted-foreground">{summary}</p>
                )}

                <ol className="space-y-3">
                    {sections.map((sec, i) => (
                        <li key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-bold text-violet-200">{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                    {editing ? (
                                        <Input value={sec.title} onChange={(e) => patchSection(i, { title: e.target.value })} className="mb-1.5 h-8 text-sm font-semibold" />
                                    ) : (
                                        <p className="text-sm font-semibold text-white/90">{sec.title}</p>
                                    )}
                                    {editing ? (
                                        <Textarea value={sec.body} onChange={(e) => patchSection(i, { body: e.target.value })} rows={3} className="text-sm" />
                                    ) : (
                                        <p className="whitespace-pre-wrap text-sm text-white/70">{sec.body}</p>
                                    )}
                                    {sec.resources && sec.resources.length > 0 && !editing && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {sec.resources.map((r, ri) =>
                                                r.url ? (
                                                    <a
                                                        key={ri}
                                                        href={r.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-cyan-200 hover:bg-white/10"
                                                    >
                                                        <ExternalLink className="h-3 w-3" /> {r.label}
                                                    </a>
                                                ) : (
                                                    <span key={ri} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                                                        {r.label}
                                                    </span>
                                                ),
                                            )}
                                        </div>
                                    )}
                                    {!editing && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => stepToTask(sec)}>
                                                <ListPlus className="h-3 w-3" /> A tareas
                                            </Button>
                                            {guide.kind === "itinerario" && (
                                                <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => stepToEvent(sec, i)}>
                                                    <CalendarPlus className="h-3 w-3" /> Programar evento
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {editing && (
                                    <button onClick={() => removeSection(i)} className="rounded p-1 text-white/30 hover:bg-red-500/20 hover:text-red-300" title="Quitar sección">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>

                {editing && (
                    <Button size="sm" variant="outline" onClick={addSection} className="mt-3">
                        <Plus className="h-4 w-4" /> Añadir sección
                    </Button>
                )}
            </div>
        </div>
    );
}

export default StudyGuidesPanel;
