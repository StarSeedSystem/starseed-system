// src/app/(app)/network/education/page.tsx
'use client';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { articles, courses, categories, themes } from "@/lib/data";
import {
    BookOpen,
    Newspaper,
    Star,
    ChevronRight,
    Workflow,
    Tags,
    ThumbsUp,
    MessageCircle,
    LayoutGrid,
    Rows3,
    Map as MapIcon,
    Network,
    GraduationCap,
    LibraryBig,
    ArrowUpRight,
} from "lucide-react";
import { SectionHeader } from "@/components/network/section-header";
import { SectionPostsFeed } from "@/components/network/section-posts-feed";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useMemo, useState } from "react";
import { CommentSystem } from "@/components/comment-system";
import { ConocimientoCard } from "./conocimiento-card";
import { SystemShowcase } from "@/components/showcase/SystemShowcase";
import { TopicGraph } from "@/components/education/topic-graph";
import { StudyHub } from "@/components/education/study/study-hub";
import { builtinTree, type EduTreeNode } from "@/lib/education/curriculum";


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

// ─────────────────────────────────────────────────────────────────────────────
// Contenido Destacado: más opciones de vista (tarjetas/lista) + filtros por
// categoría (rama del catálogo educativo) y nivel. El nivel se lee de una
// convención ligera en `tags` (principiante/intermedio/avanzado) — no requiere
// cambiar el esquema de Course/Article, coherente con cómo ThemeNetworkView ya
// usa `tags` para cruzar contenido con temas.
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_KEYWORDS = ["principiante", "intermedio", "avanzado"] as const;

function levelOfTags(tags: string[]): string | null {
    const lower = tags.map((t) => t.toLowerCase());
    return LEVEL_KEYWORDS.find((k) => lower.includes(k)) ?? null;
}

function namesUnderCategory(root: EduTreeNode): Set<string> {
    const set = new Set<string>();
    const walk = (n: EduTreeNode) => {
        set.add(n.name.toLowerCase());
        n.children.forEach(walk);
    };
    walk(root);
    return set;
}

type ContentViewMode = "tarjetas" | "lista";

function FeaturedContentView({ onGoToMap }: { onGoToMap: () => void }) {
    const [view, setView] = useState<ContentViewMode>("tarjetas");
    const [categoryId, setCategoryId] = useState<string>("todas");
    const [level, setLevel] = useState<string>("todos");

    const categoryRoots = useMemo(() => builtinTree(), []);
    const categoryNameSets = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const r of categoryRoots) m.set(r.id, namesUnderCategory(r));
        return m;
    }, [categoryRoots]);

    const matchesCategory = (tags: string[]) => {
        if (categoryId === "todas") return true;
        const set = categoryNameSets.get(categoryId);
        if (!set) return true;
        const lower = tags.map((t) => t.toLowerCase());
        return lower.some((t) => set.has(t));
    };

    const matchesLevel = (tags: string[]) => {
        if (level === "todos") return true;
        const l = levelOfTags(tags);
        if (level === "sin-nivel") return l === null;
        return l === level;
    };

    const filteredCourses = useMemo(
        () => courses.filter((c) => matchesCategory(c.tags) && matchesLevel(c.tags)),
        [categoryId, level, categoryNameSets],
    );
    const filteredArticles = useMemo(
        () => articles.filter((a) => matchesCategory(a.tags) && matchesLevel(a.tags)),
        [categoryId, level, categoryNameSets],
    );

    const isEmpty = courses.length === 0 && articles.length === 0;
    const noResults = !isEmpty && filteredCourses.length === 0 && filteredArticles.length === 0;

    if (isEmpty) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/12 p-12 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
                <h2 className="text-xl font-bold font-headline">Aún no hay contenido destacado</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                    Todavía no se han publicado cursos ni artículos en la red. Crea el primero o explora las categorías y
                    temas de conocimiento.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
                    <Button
                        size="sm"
                        variant={view === "tarjetas" ? "default" : "ghost"}
                        className="h-7 gap-1.5 px-2 text-xs"
                        onClick={() => setView("tarjetas")}
                    >
                        <LayoutGrid className="h-3.5 w-3.5" /> Tarjetas
                    </Button>
                    <Button
                        size="sm"
                        variant={view === "lista" ? "default" : "ghost"}
                        className="h-7 gap-1.5 px-2 text-xs"
                        onClick={() => setView("lista")}
                    >
                        <Rows3 className="h-3.5 w-3.5" /> Lista
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={onGoToMap}>
                        <MapIcon className="h-3.5 w-3.5" /> Mapa
                    </Button>
                </div>

                <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs">
                        <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todas">Todas las categorías</SelectItem>
                        {categoryRoots.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                                {r.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
                        <SelectValue placeholder="Nivel" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos los niveles</SelectItem>
                        <SelectItem value="principiante">Principiante</SelectItem>
                        <SelectItem value="intermedio">Intermedio</SelectItem>
                        <SelectItem value="avanzado">Avanzado</SelectItem>
                        <SelectItem value="sin-nivel">Sin nivel indicado</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {noResults ? (
                <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center text-sm text-muted-foreground">
                    Ningún curso o artículo coincide con estos filtros.
                </div>
            ) : view === "tarjetas" ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCourses.map((c) => (
                        <CourseCard key={c.id} course={c} />
                    ))}
                    {filteredArticles.map((a) => (
                        <ArticleCard key={a.id} article={a} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col divide-y divide-white/10 rounded-2xl border border-white/10">
                    {filteredCourses.map((c) => (
                        <Link key={c.id} href={c.href} className="flex items-center gap-3 p-3 transition hover:bg-white/5">
                            <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{c.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{c.tags.join(" · ")}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{c.progress}%</span>
                        </Link>
                    ))}
                    {filteredArticles.map((a) => (
                        <Link key={a.id} href={a.href} className="flex items-center gap-3 p-3 transition hover:bg-white/5">
                            <Newspaper className="h-4 w-4 shrink-0 text-accent" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{a.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{a.tags.join(" · ")}</p>
                            </div>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                <Star className="h-3 w-3 text-yellow-500" /> {a.rating.toFixed(1)}
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function EducationPage() {
  const [tab, setTab] = useState("network");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col">
    {/* ── Cabecera consistente de sección + acciones rápidas (Adenda 63 §8) ── */}
    <SectionHeader
        dest="educacion"
        icon={GraduationCap}
        title="Ecosistema Educativo"
        description="Biblioteca universal, aprendizaje en red y mentoría híbrida humano + IA."
        className="mb-6"
    />

    {/* Bloque enlace a la Biblioteca universal (/library) */}
    <Link
        href="/library"
        className="group mb-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/[0.06] to-transparent p-4 backdrop-blur transition-all hover:border-teal-400/40"
    >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/40 bg-teal-500/10 text-teal-300">
            <LibraryBig className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Biblioteca universal</span>
            <span className="block truncate text-xs text-muted-foreground">
                Archivos, wikis y colecciones del conocimiento común de la red.
            </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>

    {/* Red de Conocimiento (Módulo 3) — enlace + explicación de cómo se conecta con cursos/temas */}
    <div className="mb-6">
      <ConocimientoCard />
    </div>

    <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto">
            <TabsTrigger value="network" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Red de Categorías</TabsTrigger>
            <TabsTrigger value="themes" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Red de Temas</TabsTrigger>
            <TabsTrigger value="conocimiento" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Mapa del Conocimiento</TabsTrigger>
            <TabsTrigger value="estudio" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Estudio con Aurora</TabsTrigger>
            <TabsTrigger value="featured" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Contenido Destacado</TabsTrigger>
            <TabsTrigger value="posts" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2">Publicaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="network" className="mt-6">
            <CategoryNetworkView />
        </TabsContent>

        <TabsContent value="themes" className="mt-6">
            <ThemeNetworkView />
        </TabsContent>

        <TabsContent value="conocimiento" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline text-2xl flex items-center gap-2"><Network /> Mapa del Conocimiento</CardTitle>
                    <CardDescription>
                        Categoría → tema → subtema del catálogo educativo, en vista Lista, Mapa 2D o Red 3D. Cada tema
                        muestra su ruta de aprendizaje y el contenido real vinculado. Los grupos de estudio pueden
                        adoptar temas de aquí en su propio Temario.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <TopicGraph />
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="estudio" className="mt-6 animate-in fade-in-50 duration-500">
            <StudyHub />
        </TabsContent>

        <TabsContent value="featured" className="mt-6">
            <FeaturedContentView onGoToMap={() => setTab("conocimiento")} />
        </TabsContent>

        <TabsContent value="posts" className="mt-6 animate-in fade-in-50 duration-500">
            {/* Feed vivo de la sección (os_posts · cola "educacion" de la Zona
                de Publicación, realtime) — Adenda 63 §8. */}
            <SectionPostsFeed dest="educacion" />
        </TabsContent>
    </Tabs>

    <SystemShowcase system="educativo" />
    </div>
  );
}
