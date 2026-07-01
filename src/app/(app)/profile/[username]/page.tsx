// src/app/(app)/profile/[username]/page.tsx
'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { comments as defaultComments, articles as rawArticles, courses as rawCourses } from "@/lib/data";
import { BookOpen, FileText, ArrowUpRight } from "lucide-react";
import { CommentSystem } from "@/components/comment-system";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfileWelcomeWidget } from "@/components/profile/widgets/profile-welcome-widget";
import { FeaturedBadgesWidget } from "@/components/profile/widgets/featured-badges-widget";
import { RecentPostsWidget } from "@/components/profile/widgets/recent-posts-widget";
import { ConnectionsWidget } from "@/components/profile/widgets/connections-widget";
import { ProfileHeader } from "@/components/profile/profile-header";
import { CollectionsGrid } from "@/components/profile/collections/collections-grid";
import { GovernanceToolkit, hasToolkit, toolkitMeta } from "@/components/social/toolkits";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { StoriesStrip } from "@/components/stories/stories-strip";
import { PostFeed } from "@/components/social/PostFeed";
import { useState } from "react";

// Sin perfiles de ejemplo. Los datos del perfil/página se derivan del slug de
// la URL (nombre legible) y, donde aplica, de la red real. Sin avatares ni
// portadas de marcador de posición: AvatarFallback muestra las iniciales.
const pageData: { [key: string]: any } = {};

// lib/data expone hoy catálogos VACÍOS sin tipar (se infieren como never[]).
// Vistas locales tipadas para que este archivo compile limpio; cuando lib/data
// declare sus tipos propios, estas anotaciones sobran. Los arrays siguen
// vacíos hasta que existan publicaciones reales (estado vacío honesto).
interface ProfileLibArticle {
    id: string;
    href: string;
    title: string;
    author?: string;
    tags: string[];
}
interface ProfileLibCourse {
    id: string;
    href: string;
    title: string;
    description?: string;
}
const articles = rawArticles as ProfileLibArticle[];
const courses = rawCourses as ProfileLibCourse[];

export default function ProfilePage() {
    const params = useParams();
    // Safe param extraction
    const usernameParam = params?.username;
    // Fallback neutral para evitar undefined; NUNCA un handle de ejemplo
    // ("starseeduser" y similares están prohibidos como identidad real).
    const username = Array.isArray(usernameParam) ? usernameParam[0] : (usernameParam || 'me');

    const profileData = pageData[username] || {
        name: username.charAt(0).toUpperCase() + username.slice(1).replace(/-/g, ' '),
        handle: `@${username}`,
        bio: `Página de ${username.replace(/-/g, ' ')}.`,
        avatar: "",
        cover: "",
        dataAiHint: "profile avatar",
        coverHint: "abstract pattern",
        isUser: false,
        pageType: 'personal',
    };

    const pageType = profileData.pageType;
    const [activeTab, setActiveTab] = useState("dashboard");

    return (

        <div className="flex flex-col gap-6">
            <ProfileHeader profileData={profileData} />

            {/* ── HISTORIAS TEMPORALES (estética, deslizable, encima de las publicaciones) ── */}
            <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-purple-500/[0.04] via-transparent to-cyan-500/[0.04] backdrop-blur p-3">
                <StoriesStrip
                    ownerKind={profileData.pageType === 'personal' ? 'profile' : 'page'}
                    ownerId={(typeof window !== 'undefined' ? (window.location.pathname.split('/').pop() ?? 'me') : 'me')}
                    ownerLabel={profileData.name ?? 'Perfil'}
                    variant={profileData.pageType === 'personal' ? 'profile' : 'page'}
                />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <div className={activeTab === 'agenda' ? "lg:col-span-3" : "lg:col-span-2"}>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start md:justify-center">
                            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                            {hasToolkit(pageType) && (
                                <TabsTrigger value="gobierno">{toolkitMeta(pageType).toolkitTab}</TabsTrigger>
                            )}
                            <TabsTrigger value="agenda">Agenda</TabsTrigger>
                            <TabsTrigger value="posts">Publicaciones</TabsTrigger>
                            <TabsTrigger value="connections">Conexiones</TabsTrigger>
                            <TabsTrigger value="library">Biblioteca</TabsTrigger>
                            <TabsTrigger value="collections">Colecciones</TabsTrigger>
                        </TabsList>

                        <TabsContent value="dashboard" className="mt-6">
                            <div className="grid gap-6 lg:grid-cols-2">
                                <div className="lg:col-span-2">
                                    <ProfileWelcomeWidget pageType={pageType} />
                                </div>
                                <FeaturedBadgesWidget pageType={pageType} />
                                <RecentPostsWidget pageType={pageType} />
                                <div className="lg:col-span-2">
                                    <ConnectionsWidget pageType={pageType} />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="agenda" className="mt-6 animate-in fade-in-50 duration-500">
                            {/* realOnly: la Agenda de un perfil solo muestra entradas REALES
                                (Supabase + creadas por la persona usuaria), nunca la semilla
                                de demostración del CalendarProvider. */}
                            <UnifiedCalendar
                                realOnly
                                title={`Agenda de ${profileData.name}`}
                                subtitle="Eventos y actividades compartidas por este perfil."
                            />
                        </TabsContent>

                        {hasToolkit(pageType) && (
                            <TabsContent value="gobierno" className="mt-6 animate-in fade-in-50 duration-500">
                                <GovernanceToolkit kind={pageType} slug={username} name={profileData.name} />
                            </TabsContent>
                        )}

                        <TabsContent value="posts" className="mt-6">
                            <PostFeed channelKey={`profile-${username}`} />
                        </TabsContent>
                        <TabsContent value="connections" className="mt-6">
                            <ConnectionsWidget pageType={pageType} />
                        </TabsContent>
                        <TabsContent value="library" className="mt-6">
                            <Card>
                                <CardHeader className="flex flex-row items-start justify-between gap-3">
                                    <div>
                                        <CardTitle className="font-headline">Biblioteca de {profileData.name}</CardTitle>
                                        <CardDescription>Artículos y cursos publicados o curados por este perfil.</CardDescription>
                                    </div>
                                    <Link href="/library" className="shrink-0 whitespace-nowrap text-sm text-primary hover:underline cursor-pointer">Ver biblioteca →</Link>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Estado vacío honesto: las secciones solo se pintan si hay
                                        contenido REAL (articles/courses de lib/data están vacíos
                                        hasta que existan publicaciones de verdad). */}
                                    {articles.length === 0 && courses.length === 0 && (
                                        <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                                            Aún no hay artículos ni cursos en esta biblioteca.
                                        </p>
                                    )}
                                    {articles.length > 0 && (
                                    <div>
                                        <p className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Artículos</p>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            {articles.slice(0, 3).map((a) => (
                                                <Link key={a.id} href={a.href} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                                    <p className="font-medium leading-snug group-hover:text-primary transition-colors">{a.title}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">{a.author}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1">{a.tags.slice(0, 2).map((t) => <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>)}</div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                    )}
                                    {courses.length > 0 && (
                                    <div>
                                        <p className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><BookOpen className="h-3.5 w-3.5" /> Cursos</p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {courses.slice(0, 2).map((c) => (
                                                <Link key={c.id} href={c.href} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                                    <p className="flex items-center gap-1 font-medium leading-snug group-hover:text-primary transition-colors">{c.title} <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></p>
                                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="collections" className="mt-6">
                            <CollectionsGrid />
                        </TabsContent>
                    </Tabs>
                </div>
                {activeTab !== 'agenda' && (
                    <div className="lg:col-span-1">
                        <Card>
                            <CardHeader>
                                <CardTitle className="font-headline">Discusión Abierta</CardTitle>
                                <CardDescription>Un espacio para conversaciones generales en este perfil.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CommentSystem comments={defaultComments} />
                                {defaultComments.length === 0 && (
                                    <p className="mt-4 rounded-xl border border-dashed border-white/12 p-4 text-center text-sm text-muted-foreground">
                                        Aún no hay comentarios en este perfil. Sé quien abra la conversación.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>

    );
}
