// src/app/(app)/profile/[username]/page.tsx
'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { comments as defaultComments } from "@/lib/data";
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
import { EntityLibraryPanel } from "@/components/library/entity-library-panel";
import { libraryRef } from "@/lib/library/entity-library";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { StoriesStrip } from "@/components/stories/stories-strip";
import { PostFeed } from "@/components/social/PostFeed";
import { useState } from "react";
import { useAccount } from "@/context/account-context";
import { ProfileModeBar } from "@/components/profile/profile-mode-bar";
import { ProfileFreeLayout, type FreeSectionDef } from "@/components/profile/profile-free-layout";
import { ProfileLinksSection } from "@/components/profile/profile-links-section";
import { ProfileFilesSection } from "@/components/profile/profile-files-section";
import { ProfileXRView } from "@/components/profile/profile-xr-view";
import { useProfileDisplay, normalizeHandleKey } from "@/components/profile/profile-display-store";

// Sin perfiles de ejemplo. Los datos del perfil/página se derivan del slug de
// la URL (nombre legible) y, donde aplica, de la red real (cuenta soberana vía
// useAccount cuando el perfil es propio). Sin avatares ni portadas de marcador
// de posición: AvatarFallback muestra las iniciales.
const pageData: { [key: string]: any } = {};

/** Lee un campo string de un objeto tolerante (perfil Supabase sin tipar). */
function str(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/**
 * Biblioteca del perfil: lo GUARDADO por la cuenta (distinto de la Librería).
 * `kind="user"` en entity_state usa el uid real (RLS: solo su dueño puede
 * leer/escribir) — por eso solo se muestra el panel cuando es el perfil
 * propio y hay sesión; en perfil ajeno, estado honesto (privado por diseño).
 */
function ProfileLibraryCard({ name, uid, isOwner }: { name: string; uid: string | null; isOwner: boolean }) {
    if (isOwner && uid) {
        return (
            <EntityLibraryPanel
                ref={libraryRef("user", uid)}
                title={`Biblioteca de ${name}`}
                subtitle="Tus referencias guardadas, organizadas en carpetas propias."
            />
        );
    }
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                    <CardTitle className="font-headline">Biblioteca de {name}</CardTitle>
                    <CardDescription>Espacio personal y privado de referencias guardadas.</CardDescription>
                </div>
                <Link href="/library" className="shrink-0 whitespace-nowrap text-sm text-primary hover:underline cursor-pointer">Ver biblioteca →</Link>
            </CardHeader>
            <CardContent>
                <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                    {uid
                        ? "La Biblioteca de un perfil es privada: solo su dueño/a puede verla."
                        : "Inicia sesión para ver tu Biblioteca."}
                </p>
            </CardContent>
        </Card>
    );
}

/** Discusión abierta del perfil (comentarios reales; vacío honesto). */
function ProfileDiscussionCard() {
    return (
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
    );
}

export default function ProfilePage() {
    const params = useParams();
    // Safe param extraction
    const usernameParam = params?.username;
    // Fallback neutral para evitar undefined; NUNCA un handle de ejemplo
    // ("starseeduser" y similares están prohibidos como identidad real).
    const username = Array.isArray(usernameParam) ? usernameParam[0] : (usernameParam || 'me');

    // ── Identidad real: ¿este perfil pertenece a la sesión actual? ──
    const { user, profile: accountProfile } = useAccount();
    const pageHandle = normalizeHandleKey(username) || 'me';
    const viewerHandle = normalizeHandleKey(str(accountProfile?.handle) || str(accountProfile?.username));
    const isOwner = !!user && (pageHandle === 'me' || (viewerHandle !== '' && viewerHandle === pageHandle));

    const derivedName = pageHandle === 'me'
        ? 'Mi Perfil'
        : username.charAt(0).toUpperCase() + username.slice(1).replace(/-/g, ' ');
    const accountName = str(accountProfile?.display_name) || str(accountProfile?.full_name);
    const accountAvatar = str(accountProfile?.avatar_url);
    const accountCover = str(accountProfile?.cover_url) || str(accountProfile?.banner_url);
    const accountBio = str(accountProfile?.bio) || str(accountProfile?.about);

    const profileData = pageData[username] || {
        // Datos REALES de la cuenta soberana cuando el perfil es propio;
        // si no, derivados del slug (sin imágenes falsas: iniciales).
        name: (isOwner && accountName) || derivedName,
        handle: `@${pageHandle}`,
        bio: isOwner ? accountBio : `Página de ${username.replace(/-/g, ' ')}.`,
        avatar: isOwner ? accountAvatar : "",
        cover: isOwner ? accountCover : "",
        dataAiHint: "profile avatar",
        coverHint: "abstract pattern",
        isUser: isOwner,
        pageType: 'personal',
    };

    const pageType = profileData.pageType;
    const [activeTab, setActiveTab] = useState("dashboard");

    // ── Perfil como página libre: modo persistido por handle ──
    const { config, setMode } = useProfileDisplay(pageHandle);
    const mode = config.mode;

    // Secciones del modo Libre (los MISMOS consumidores que las pestañas).
    const freeSections: FreeSectionDef[] = [
        {
            id: 'dashboard',
            title: 'Dashboard',
            node: (
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
            ),
        },
        ...(hasToolkit(pageType)
            ? [{
                id: 'gobierno' as const,
                title: toolkitMeta(pageType).toolkitTab,
                node: <GovernanceToolkit kind={pageType} slug={username} name={profileData.name} />,
            }]
            : []),
        {
            id: 'agenda',
            title: 'Agenda',
            node: (
                <UnifiedCalendar
                    realOnly
                    title={`Agenda de ${profileData.name}`}
                    subtitle="Eventos y actividades compartidas por este perfil."
                />
            ),
        },
        { id: 'posts', title: 'Publicaciones', node: <PostFeed channelKey={`profile-${username}`} /> },
        { id: 'connections', title: 'Conexiones', node: <ConnectionsWidget pageType={pageType} /> },
        { id: 'library', title: 'Biblioteca', node: <ProfileLibraryCard name={profileData.name} uid={user?.id ?? null} isOwner={isOwner} /> },
        { id: 'collections', title: 'Colecciones', node: <CollectionsGrid /> },
        { id: 'enlaces', title: 'Enlaces', node: <ProfileLinksSection handle={pageHandle} isOwner={isOwner} name={profileData.name} /> },
        { id: 'archivos', title: 'Archivos', node: <ProfileFilesSection isOwner={isOwner} name={profileData.name} /> },
        { id: 'discusion', title: 'Discusión Abierta', node: <ProfileDiscussionCard /> },
    ];

    return (

        <div className="flex flex-col gap-6">
            <ProfileHeader profileData={profileData} />

            {/* ── Barra de modos: el perfil es una página abierta y libre ── */}
            <ProfileModeBar mode={mode} onChange={setMode} />

            {/* ── HISTORIAS TEMPORALES (estética, deslizable, encima de las publicaciones) ── */}
            {mode !== 'vr' && (
                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-purple-500/[0.04] via-transparent to-cyan-500/[0.04] backdrop-blur p-3">
                    <StoriesStrip
                        ownerKind={profileData.pageType === 'personal' ? 'profile' : 'page'}
                        ownerId={(typeof window !== 'undefined' ? (window.location.pathname.split('/').pop() ?? 'me') : 'me')}
                        ownerLabel={profileData.name ?? 'Perfil'}
                        variant={profileData.pageType === 'personal' ? 'profile' : 'page'}
                    />
                </div>
            )}

            {/* ── Modo VR / AR: acceso al espacio inmersivo ── */}
            {mode === 'vr' && (
                <ProfileXRView handle={pageHandle} name={profileData.name} />
            )}

            {/* ── Modo Libre: mismas secciones como bloques reordenables ── */}
            {mode === 'libre' && (
                <ProfileFreeLayout handle={pageHandle} isOwner={isOwner} sections={freeSections} />
            )}

            {/* ── Modo Clásico: pestañas (comportamiento original intacto) ── */}
            {mode === 'clasico' && (
            <div className="grid lg:grid-cols-3 gap-6">
                <div className={activeTab === 'agenda' ? "lg:col-span-3" : "lg:col-span-2"}>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="overflow-x-auto flex-nowrap w-full justify-start md:justify-center">
                            <TabsTrigger value="dashboard" className="shrink-0 flex-none">Dashboard</TabsTrigger>
                            {hasToolkit(pageType) && (
                                <TabsTrigger value="gobierno" className="shrink-0 flex-none">{toolkitMeta(pageType).toolkitTab}</TabsTrigger>
                            )}
                            <TabsTrigger value="agenda" className="shrink-0 flex-none">Agenda</TabsTrigger>
                            <TabsTrigger value="posts" className="shrink-0 flex-none">Publicaciones</TabsTrigger>
                            <TabsTrigger value="connections" className="shrink-0 flex-none">Conexiones</TabsTrigger>
                            <TabsTrigger value="library" className="shrink-0 flex-none">Biblioteca</TabsTrigger>
                            <TabsTrigger value="collections" className="shrink-0 flex-none">Colecciones</TabsTrigger>
                            <TabsTrigger value="enlaces" className="shrink-0 flex-none">Enlaces</TabsTrigger>
                            <TabsTrigger value="archivos" className="shrink-0 flex-none">Archivos</TabsTrigger>
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
                            <ProfileLibraryCard name={profileData.name} uid={user?.id ?? null} isOwner={isOwner} />
                        </TabsContent>
                        <TabsContent value="collections" className="mt-6">
                            <CollectionsGrid />
                        </TabsContent>
                        <TabsContent value="enlaces" className="mt-6">
                            <ProfileLinksSection handle={pageHandle} isOwner={isOwner} name={profileData.name} />
                        </TabsContent>
                        <TabsContent value="archivos" className="mt-6">
                            <ProfileFilesSection isOwner={isOwner} name={profileData.name} />
                        </TabsContent>
                    </Tabs>
                </div>
                {activeTab !== 'agenda' && (
                    <div className="lg:col-span-1">
                        <ProfileDiscussionCard />
                    </div>
                )}
            </div>
            )}
        </div>

    );
}
