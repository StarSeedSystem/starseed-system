// src/app/(app)/profile/[username]/page.tsx
'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { comments as defaultComments, articles, courses } from "@/lib/data";
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

const pageData: { [key: string]: any } = {
    'starseeduser': {
        name: "StarSeedUser",
        handle: "@starseeduser",
        bio: "Co-creando un futuro ciberdélico. Explorador de la conciencia, constructor de sistemas y creyente en el poder de la inteligencia colectiva.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "user avatar",
        coverHint: "abstract background",
        isUser: true,
        pageType: 'personal',
    },
    'comunidad-permacultura': {
        name: "Comunidad de Permacultura",
        handle: "@permacultura",
        bio: "Un espacio para aprender, compartir y practicar los principios de la permacultura. ¡Únete a nosotros para construir un futuro más sostenible!",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "community garden",
        coverHint: "green nature",
        isUser: false,
        pageType: 'comunidad',
    },
    'ef-valle-central': {
        name: "E.F. del Valle Central",
        handle: "@ef-valle-central",
        bio: "La Entidad Federativa del Valle Central, gobernada por sus ciudadanos para el bienestar colectivo y el desarrollo sostenible.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "government building",
        coverHint: "city skyline",
        isUser: false,
        pageType: 'ef',
    },
    'partido-transhumanista': {
        name: "Partido Transhumanista",
        handle: "@transhumanistas",
        bio: "Abogando por el uso ético de la tecnología para mejorar las capacidades humanas y expandir la conciencia.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "futuristic logo",
        coverHint: "circuit board",
        isUser: false,
        pageType: 'partido',
    },
    'grupo-de-estudio-ia': {
        name: "Grupo de Estudio de IA",
        handle: "@ia-study-group",
        bio: "Un grupo dedicado a explorar las fronteras de la Inteligencia Artificial, desde la teoría hasta la aplicación práctica.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "brain circuit",
        coverHint: "code lines",
        isUser: false,
        pageType: 'grupo',
    },
};

export default function ProfilePage() {
    const params = useParams();
    // Safe param extraction
    const usernameParam = params?.username;
    const username = Array.isArray(usernameParam) ? usernameParam[0] : (usernameParam || 'starseeduser'); // Fallback to avoid undefined

    const profileData = pageData[username] || {
        name: username.charAt(0).toUpperCase() + username.slice(1).replace(/-/g, ' '),
        handle: `@${username}`,
        bio: `Página de ${username.replace(/-/g, ' ')}.`,
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
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
                            <UnifiedCalendar 
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
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>

    );
}
