// src/app/(app)/network/education/page.tsx
'use client';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { articles, courses, categories, themes } from "@/lib/data";
import { BookOpen, Newspaper, Star, ChevronRight, Workflow, Tags, ThumbsUp, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState } from "react";
import { CommentSystem } from "@/components/comment-system";
import { ConocimientoCard } from "./conocimiento-card";
import { SystemShowcase } from "@/components/showcase/SystemShowcase";


function CourseCard({ course, className }: { course: (typeof courses)[0], className?: string }) {
  return (
    <Card className={`h-full flex flex-col ${className}`}>
      <CardHeader>
        <div className="flex items-center gap-2 text-primary mb-2">
          <BookOpen className="w-5 h-5"/>
          <CardDescription>Curso</CardDescription>
        </div>
        <CardTitle className="font-headline text-lg">{course.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground mb-4">{course.description}</p>
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Progreso</span>
          <span>{course.progress}%</span>
        </div>
        <Progress value={course.progress} />
        <div className="flex items-center gap-2 mt-4">
            <span className="text-sm font-semibold">Temas:</span>
            <div className="flex flex-wrap gap-1">
                {course.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" asChild>
          <Link href={course.href}>Continuar Aprendiendo</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function ArticleCard({ article, className }: { article: (typeof articles)[0], className?: string }) {
    const [showComments, setShowComments] = useState(false);
    return (
        <Card className={`h-full flex flex-col ${className}`}>
            <CardHeader>
                <div className="flex items-center gap-2 text-accent mb-2">
                    <Newspaper className="w-5 h-5"/>
                    <CardDescription>Artículo</CardDescription>
                </div>
                <CardTitle className="font-headline text-lg">{article.title}</CardTitle>
                <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="w-4 h-4 text-yellow-500" />
                        <span>{article.rating.toFixed(1)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Por {article.author}</p>
                </div>
            </CardHeader>
            <CardContent className="flex-1">
                 <p className="text-sm text-muted-foreground mb-4">{article.excerpt}</p>
                 <div className="flex items-center gap-2 mt-4">
                    <span className="text-sm font-semibold">Temas:</span>
                    <div className="flex flex-wrap gap-1">
                        {article.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex-col items-stretch">
                <div className="flex flex-wrap justify-between items-center gap-2 text-muted-foreground border-t pt-2 mb-2">
                    <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            <ThumbsUp className="w-4 h-4" /> {article.likes}
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => setShowComments(!showComments)}>
                            <MessageCircle className="w-4 h-4" /> {article.comments.length}
                        </Button>
                    </div>
                    <Button variant="outline" asChild>
                        <Link href={article.href}>Leer Artículo</Link>
                    </Button>
                </div>
                {showComments && (
                  <div className='w-full'>
                    <CommentSystem comments={article.comments} />
                  </div>
                )}
            </CardFooter>
        </Card>
    )
}

function CategoryNetworkView() {
    const renderContent = (contentIds: string[]) => {
        return contentIds.map(id => {
            const course = courses.find(c => c.id === id);
            if (course) return <CourseCard key={id} course={course} className="mb-4" />;
            const article = articles.find(a => a.id === id);
            if (article) return <ArticleCard key={id} article={article} className="mb-4" />;
            return null;
        });
    };

    const renderCategories = (categoryList: typeof categories) => {
        return categoryList.map(category => (
            <AccordionItem value={category.id} key={category.id}>
                <AccordionTrigger className="text-lg font-headline hover:no-underline">{category.name}</AccordionTrigger>
                <AccordionContent className="pl-4 border-l-2 border-primary/20">
                    <p className="text-muted-foreground mb-4">{category.description}</p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                        {renderContent(category.content)}
                    </div>
                    {category.subCategories && category.subCategories.length > 0 && (
                         <Accordion type="multiple" className="w-full">
                            {renderCategories(category.subCategories)}
                        </Accordion>
                    )}
                </AccordionContent>
            </AccordionItem>
        ));
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-2xl flex items-center gap-2"><Workflow /> Red de Categorías</CardTitle>
                <CardDescription>Explora la estructura del conocimiento. Expande cada categoría para revelar sub-categorías y contenido relacionado.</CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full">
                    {renderCategories(categories)}
                </Accordion>
            </CardContent>
        </Card>
    )
}

function ThemeNetworkView() {
    const [selectedTheme, setSelectedTheme] = useState<(typeof themes)[0] | null>(null);

    const getConnectedContent = (themeName: string) => {
        const connectedCourses = courses.filter(c => c.tags.includes(themeName));
        const connectedArticles = articles.filter(a => a.tags.includes(themeName));
        return [...connectedCourses, ...connectedArticles];
    }

    return (
        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-2xl flex items-center gap-2"><Tags /> Red de Temas</CardTitle>
                        <CardDescription>Explora conceptos transversales. Selecciona un tema para ver todo el contenido conectado a él, sin importar su categoría.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                           {themes.map(theme => (
                               <Button
                                    key={theme.id}
                                    variant={selectedTheme?.id === theme.id ? "default" : "outline"}
                                    onClick={() => setSelectedTheme(theme)}
                                >
                                    {theme.name}
                                </Button>
                           ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-2">
                {selectedTheme ? (
                    <div>
                        <h2 className="text-2xl font-bold font-headline mb-2">Contenido de: {selectedTheme.name}</h2>
                        <p className="text-muted-foreground mb-4">{selectedTheme.description}</p>
                        <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-6">
                            {getConnectedContent(selectedTheme.name).map(item => {
                                 if ('progress' in item) { // It's a Course
                                    return <CourseCard key={item.id} course={item as (typeof courses)[0]} />
                                 } else { // It's an Article
                                    return <ArticleCard key={item.id} article={item as (typeof articles)[0]} />
                                 }
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full min-h-[400px] text-center bg-muted/50 rounded-lg p-8">
                        <div>
                            <h3 className="text-xl font-semibold">Selecciona un Tema</h3>
                            <p className="text-muted-foreground mt-2">Haz clic en un tema de la lista de la izquierda para explorar sus conexiones en la red de conocimiento.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function EducationPage() {
  return (
    <>
    {/* Red de Conocimiento (Módulo 3) — enlace + explicación de cómo se conecta con cursos/temas */}
    <div className="mb-6">
      <ConocimientoCard />
    </div>

    <Tabs defaultValue="network" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="network" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Red de Categorías</TabsTrigger>
            <TabsTrigger value="themes" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Red de Temas</TabsTrigger>
            <TabsTrigger value="featured" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Contenido Destacado</TabsTrigger>
        </TabsList>

        <TabsContent value="network" className="mt-6">
            <CategoryNetworkView />
        </TabsContent>

        <TabsContent value="themes" className="mt-6">
            <ThemeNetworkView />
        </TabsContent>

        <TabsContent value="featured" className="mt-6">
            {courses.length === 0 && articles.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/12 p-12 text-center">
                    <BookOpen className="h-10 w-10 text-muted-foreground" />
                    <h2 className="text-xl font-bold font-headline">Aún no hay contenido destacado</h2>
                    <p className="max-w-md text-sm text-muted-foreground">
                        Todavía no se han publicado cursos ni artículos en la red. Crea el primero
                        o explora las categorías y temas de conocimiento.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {courses.map((c) => (
                            <CourseCard key={c.id} course={c} />
                        ))}
                        {articles.map((a) => (
                            <ArticleCard key={a.id} article={a} />
                        ))}
                    </div>
                </div>
            )}
        </TabsContent>
    </Tabs>

    <SystemShowcase system="educativo" />
    </>
  );
}
