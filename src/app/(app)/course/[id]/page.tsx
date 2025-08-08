// src/app/(app)/course/[id]/page.tsx
'use client';
import { courses } from "@/lib/data";
import { notFound, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle, Circle, PlayCircle } from "lucide-react";

export default function CoursePage() {
    const params = useParams();
    const courseId = Array.isArray(params.id) ? params.id[0] : params.id;
  
    // In a real app, you'd fetch this from an API:
    const course = courses.find(c => c.href.endsWith(courseId));

    if (!course) {
        notFound();
    }
    
    const totalLessons = course.modules.reduce((acc, mod) => acc + mod.lessons.length, 0);
    const completedLessons = course.modules.reduce((acc, mod) => acc + mod.lessons.filter(l => l.completed).length, 0);
    const overallProgress = Math.round((completedLessons / totalLessons) * 100);

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
                        {course.modules.map(module => (
                            <AccordionItem value={module.title} key={module.title}>
                                <AccordionTrigger className="text-xl font-semibold hover:no-underline">
                                    {module.title}
                                </AccordionTrigger>
                                <AccordionContent>
                                    <ul className="space-y-3 pl-2">
                                        {module.lessons.map(lesson => (
                                            <li key={lesson.title} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                                                <div className="flex items-center gap-3">
                                                    {lesson.completed 
                                                        ? <CheckCircle className="w-5 h-5 text-green-500" />
                                                        : <Circle className="w-5 h-5 text-muted-foreground" />
                                                    }
                                                    <span className="text-base">{lesson.title}</span>
                                                </div>
                                                <Button variant="ghost" size="icon">
                                                    <PlayCircle className="w-6 h-6"/>
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </section>
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
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" size="lg">
                            {completedLessons > 0 ? "Continuar con la siguiente lección" : "Empezar Curso"}
                        </Button>
                    </CardFooter>
                 </Card>
            </aside>
        </div>
    )
}
