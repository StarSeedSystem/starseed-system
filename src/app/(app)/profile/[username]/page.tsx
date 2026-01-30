// src/app/(app)/profile/[username]/page.tsx
'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { feedItems, comments as defaultComments } from "@/lib/data";
import { CommentSystem } from "@/components/comment-system";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfileWelcomeWidget } from "@/components/profile/widgets/profile-welcome-widget";
import { FeaturedBadgesWidget } from "@/components/profile/widgets/featured-badges-widget";
import { RecentPostsWidget } from "@/components/profile/widgets/recent-posts-widget";
import { ConnectionsWidget } from "@/components/profile/widgets/connections-widget";
import { ProfileHeader } from "@/components/profile/profile-header";
import { FeedPostCard } from "@/components/profile/posts/feed-post-card";
import { CollectionsGrid } from "@/components/profile/collections/collections-grid";
import { EFGovernanceTabs } from "@/components/profile/governance/ef-governance-tabs";

function PostsFeed() {
    return (
        <div className="space-y-6">
            {feedItems.map(item => (
                <FeedPostCard key={item.id} item={item} />
            ))}
        </div>
    );
}

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

    return (

        <div className="flex flex-col gap-6">
            <ProfileHeader profileData={profileData} />

            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Tabs defaultValue="dashboard">
                        <TabsList>
                            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
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

                        <TabsContent value="posts" className="mt-6">
                            {pageType === 'ef' ? <EFGovernanceTabs /> : <PostsFeed />}
                        </TabsContent>
                        <TabsContent value="connections" className="mt-6">
                            <ConnectionsWidget pageType={pageType} />
                        </TabsContent>
                        <TabsContent value="library" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Biblioteca</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">La biblioteca pública de este perfil está en construcción.</p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="collections" className="mt-6">
                            <CollectionsGrid />
                        </TabsContent>
                    </Tabs>
                </div>
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
            </div>
        </div>

    );
}
