// src/app/(app)/course/[id]/page.tsx
'use client';
import { useState, useMemo } from "react";
import Link from "next/link";
import { courses } from "@/lib/data";
import { notFound, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle, Circle, PlayCircle, BookOpen, GraduationCap, ArrowUpRight } from "lucide-react";

export default function CoursePage() {
    const params = useParams();
    const courseId = String(Array.isArray(params.id) ? params.id[0] : (params.id ?? ""));

    // In a real app, you'd fetch this from an API:
    const course = courses.find(c => c.href.endsWith(courseId));

    if (!course) {
        notFound();
    }

    // Build initial completed set from data
    const initialCompleted = useMemo(() => {
        const s = new Set<string>();
        course.modules.forEach((mod, mIdx) => {
            mod.lessons.forEach((lesson, lIdx) => {
                if (lesson.completed) s.add(`${mIdx}-${lIdx}`);
            });
        });
        return s;
    }, [course]);

    const [completedSet, setCompletedSet] = useState<Set<string>>(initialCompleted);

    const toggleLesson = (key: string) => {
        setCompletedSet(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const { totalLessons, completedLessons, overallProgress } = useMemo(() => {
        let total = 0;
        course.modules.forEach(mod => { total += mod.lessons.length; });
        const done = completedSet.size;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;
        return { totalLessons: total, completedLessons: done, overallProgress: progress };
    }, [course, completedSet]);

    // Find first not-completed lesson key
    const firstIncomplete = useMemo(() => {
        for (let mIdx = 0; mIdx < course.modules.length; mIdx++) {
            for (let lIdx = 0; lIdx < course.modules[mIdx].lessons.length; lIdx++) {
                const key = `${mIdx}-${lIdx}`;
                if (!completedSet.has(key)) return key;
            }
        }
        return null;
    }, [course, completedSet]);

    const handleAdvance = () => {
        if (firstIncomplete) {
            setCompletedSet(prev => {
                const next = new Set(prev);
                next.add(firstIncomplete);
                return next;
            });
        }
    };

    const ctaLabel =
        completedLessons === 0
            ? "Empezar Curso"
            : firstIncomplete !== null
            ? "Continuar con la siguiente lección"
            : "Curso completado ✓";
    const ctaDisabled = firstIncomplete === null;

    // Related courses: share ≥1 tag, fallback first 3 others
    const relatedCourses = useMemo(() => {
        const others = courses.filter(c => c.href !== course.href);
        const withTag = others.filter(c => c.tags.some(t => course.tags.includes(t)));
        return (withTag.length > 0 ? withTag : others).slice(0, 3);
    }, [course]);

    return (
        <div className="max-w-4xl mx-auto grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 flex flex-col gap-8">
                <header>
                    <p className="text-primary font-semibold mb-2">Curso en la Red de Conocimiento</p>
                    <h1 className="text-4xl lg:text-5xl font-bold font-headline leading-tight">{course.title}</h1>
                </header>
                <p className="text-lg text-muted-foreground">{course.description}</p>

                <section>
                    <h2 className="text-2xl font-bold font-headline mb-4">Contenido del Curso</h2>
                     <Accordion type="multiple" defaultValue={['Módulo 1: Fundamentos']} className="w-full">
                        {course.modules.map((module, mIdx) => (
                            <AccordionItem value={module.title} key={module.title}>
                                <AccordionTrigger className="text-xl font-semibold hover:no-underline">
                                    {module.title}
                                </AccordionTrigger>
                                <AccordionContent>
                                    <ul className="space-y-3 pl-2">
                                        {module.lessons.map((lesson, lIdx) => {
                                            const key = `${mIdx}-${lIdx}`;
                                            const done = completedSet.has(key);
                                            return (
                                                <li
                                                    key={lesson.title}
                                                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                                                    onClick={() => toggleLesson(key)}
                                                    role="button"
                                                    aria-pressed={done}
                                                    tabIndex={0}
                                                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLesson(key); } }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {done
                                                            ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                                            : <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                                        }
                                                        <span className={`text-base ${done ? "line-through text-muted-foreground" : ""}`}>
                                                            {lesson.title}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="cursor-pointer flex-shrink-0"
                                                        onClick={e => { e.stopPropagation(); }}
                                                    >
                                                        <PlayCircle className="w-6 h-6"/>
                                                    </Button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </section>

                {relatedCourses.length > 0 && (
                    <section>
                        <h2 className="text-2xl font-bold font-headline mb-4">Cursos relacionados</h2>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {relatedCourses.map(c => (
                                <Link
                                    key={c.href}
                                    href={c.href}
                                    className="cursor-pointer group block"
                                >
                                    <Card className="h-full transition-colors hover:border-primary/60 hover:bg-muted/30">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-base leading-snug flex items-start justify-between gap-2">
                                                <span>{c.title}</span>
                                                <ArrowUpRight className="w-4 h-4 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex flex-wrap gap-1">
                                                {c.tags.slice(0, 3).map(tag => (
                                                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            <aside className="lg:col-span-1">
                 <Card className="sticky top-20">
                    <CardHeader>
                        <CardTitle>Tu Progreso</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span>Progreso General</span>
                                <span className="font-bold">{overallProgress}%</span>
                            </div>
                            <Progress value={overallProgress} />
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Has completado {completedLessons} de {totalLessons} lecciones.
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {course.tags.map(tag => (
                                <Badge key={tag} variant="secondary">{tag}</Badge>
                            ))}
                        </div>

                        <div className="border-t pt-4 space-y-2">
                            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Red de conocimiento</p>
                            <Link
                                href="/library"
                                className="cursor-pointer flex items-center gap-2 text-sm text-primary hover:underline transition-colors"
                            >
                                <BookOpen className="w-4 h-4 flex-shrink-0" />
                                Ver en la Biblioteca
                            </Link>
                            <Link
                                href="/network/education"
                                className="cursor-pointer flex items-center gap-2 text-sm text-primary hover:underline transition-colors"
                            >
                                <GraduationCap className="w-4 h-4 flex-shrink-0" />
                                Ir a Educación
                            </Link>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full cursor-pointer"
                            size="lg"
                            onClick={handleAdvance}
                            disabled={ctaDisabled}
                        >
                            {ctaLabel}
                        </Button>
                    </CardFooter>
                 </Card>
            </aside>
        </div>
    )
}
