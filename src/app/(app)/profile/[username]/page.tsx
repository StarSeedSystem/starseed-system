// src/app/(app)/profile/[username]/page.tsx
'use client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
// Adenda 66 §4: Biblioteca PÚBLICA del perfil — lo que su dueño/a eligió mostrar.
import { ProfilePublicLibrary } from "@/components/profile/profile-public-library";
import { libraryRef } from "@/lib/library/entity-library";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { StoriesStrip } from "@/components/stories/stories-strip";
import { PostFeed } from "@/components/social/PostFeed";
import { useMemo, useState, useEffect } from "react";
import { useAccount } from "@/context/account-context";
import { resolveProfileData, type ResolvedProfileData } from "@/lib/social/profile-resolver";
import { Loader2 } from "lucide-react";
import { ProfileModeBar } from "@/components/profile/profile-mode-bar";
import { ProfileQuickActions } from "@/components/profile/profile-quick-actions";
import { ProfileFreeLayout, type FreeSectionDef } from "@/components/profile/profile-free-layout";
import { ProfileLinksSection } from "@/components/profile/profile-links-section";
import { ProfileFilesSection } from "@/components/profile/profile-files-section";
import { ProfileXRView } from "@/components/profile/profile-xr-view";
import { useProfileDisplay, normalizeHandleKey } from "@/components/profile/profile-display-store";
import { useEntityLayout } from "@/lib/entity-layout";
import { FreeSectionsBlock } from "@/components/social/free-sections-block";
import { EntityGalleryBlock } from "@/components/social/entity-gallery-block";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { Pencil, BookText } from "lucide-react";

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
 * Biblioteca del perfil (Adenda 66 §4).
 *   · DUEÑO/A → panel completo (`EntityLibraryPanel`): gestiona todo y elige, por
 *     nodo, qué se muestra en su perfil («Permisos → Mostrar en mi perfil»).
 *   · VISITA  → `ProfilePublicLibrary`: EXACTAMENTE los nodos que ese perfil
 *     eligió mostrar (antes esta pestaña decía "es privada" y no mostraba nada).
 *
 * `ownerUid` es el uid REAL del perfil visitado (lo trae `resolveProfileData` en
 * `id` para las identidades soberanas de `os_profiles`). Sin él no hay
 * biblioteca que resolver, y se dice con honestidad.
 */
function ProfileLibraryCard({
    name, uid, ownerUid, isOwner,
}: { name: string; uid: string | null; ownerUid: string | null; isOwner: boolean }) {
    if (isOwner && uid) {
        return (
            <EntityLibraryPanel
                ref={libraryRef("user", uid)}
                title={`Biblioteca de ${name}`}
                subtitle="Tus referencias guardadas. En «Permisos» de cada folder o archivo eliges qué se muestra en tu perfil."
            />
        );
    }
    if (ownerUid) {
        return <ProfilePublicLibrary libraryRef={libraryRef("user", ownerUid)} name={name} />;
    }
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                    <CardTitle className="font-headline">Biblioteca de {name}</CardTitle>
                    <CardDescription>Lo que este perfil haya elegido mostrar públicamente.</CardDescription>
                </div>
                <Link href="/library" className="shrink-0 whitespace-nowrap text-sm text-primary hover:underline cursor-pointer">Ver biblioteca →</Link>
            </CardHeader>
            <CardContent>
                <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                    {uid
                        ? "No se ha podido resolver la cuenta de este perfil: no hay Biblioteca que mostrar."
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

/**
 * "Sobre mí ampliado" — descripción larga en markdown, contenido PÚBLICO
 * (entity_state 'layout', kind='user', lectura pública vía RLS). Honesto:
 * esta página aún no resuelve la cuenta real de OTRAS personas (el resto de
 * bloques ya degradaba a vacío para no-dueños antes de este cambio), así que
 * por ahora solo el dueño ve/edita contenido real; para visitas se explica
 * con claridad en vez de fingir datos.
 */
function ProfileAboutExtendedCard({
    isOwner, aboutExtended, onSave, name,
}: { isOwner: boolean; aboutExtended: string; onSave: (text: string) => Promise<void> | void; name: string }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(aboutExtended);
    const [saving, setSaving] = useState(false);

    const startEdit = () => { setDraft(aboutExtended); setEditing(true); };
    const save = async () => {
        setSaving(true);
        try { await onSave(draft); } finally { setSaving(false); setEditing(false); }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 font-headline">
                    <BookText className="h-4 w-4 text-primary" /> Sobre mí ampliado
                </CardTitle>
                <CardDescription>
                    {isOwner ? "Una descripción más larga y en markdown, visible en tu perfil." : `Descripción ampliada de ${name}.`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {!isOwner ? (
                    aboutExtended ? (
                        <MessageRenderer text={aboutExtended} media={false} />
                    ) : (
                        <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                            {name} no ha escrito todavía una descripción ampliada.
                        </p>
                    )
                ) : editing ? (
                    <div className="space-y-2">
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={8}
                            className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                            placeholder="Cuéntate con calma… admite markdown"
                        />
                        <div className="flex items-center gap-2">
                            <Button size="sm" className="cursor-pointer" onClick={() => void save()} disabled={saving}>Guardar</Button>
                            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setEditing(false)}>Cancelar</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {aboutExtended ? (
                            <MessageRenderer text={aboutExtended} media={false} />
                        ) : (
                            <p className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                                Aún no has escrito una descripción ampliada.
                            </p>
                        )}
                        <Button variant="outline" size="sm" className="mt-3 cursor-pointer gap-1.5" onClick={startEdit}>
                            <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

/** "Galería destacada" — imágenes públicas del perfil (entity_state 'layout' → gallery[]). */
function ProfileGalleryCard({
    isOwner, images, onAdd, onRemove, name,
}: {
    isOwner: boolean;
    images: Array<{ url: string; caption?: string }>;
    onAdd: (url: string, caption?: string) => Promise<void> | void;
    onRemove: (index: number) => Promise<void> | void;
    name: string;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Galería destacada</CardTitle>
                <CardDescription>{isOwner ? "Tus imágenes destacadas, visibles en tu perfil." : `Imágenes destacadas de ${name}.`}</CardDescription>
            </CardHeader>
            <CardContent>
                <EntityGalleryBlock
                    images={images}
                    isOwner={isOwner}
                    onAdd={onAdd}
                    onRemove={onRemove}
                    emptyHint={isOwner ? "Añade tus primeras imágenes destacadas." : `${name} no tiene imágenes destacadas todavía.`}
                />
            </CardContent>
        </Card>
    );
}

/** "Secciones" — bloques de contenido libre del perfil (entity_state 'layout' → sections[]). */
function ProfileSeccionesCard({
    isOwner, sections, onAdd, onUpdate, onRemove, name,
}: {
    isOwner: boolean;
    sections: Array<{ id: string; title: string; body: string; createdAt: string; updatedAt: string }>;
    onAdd: (title: string, body: string) => Promise<void> | void;
    onUpdate: (id: string, patch: { title?: string; body?: string }) => Promise<void> | void;
    onRemove: (id: string) => Promise<void> | void;
    name: string;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Secciones</CardTitle>
                <CardDescription>{isOwner ? "Bloques de contenido libre en tu perfil (markdown)." : `Secciones de ${name}.`}</CardDescription>
            </CardHeader>
            <CardContent>
                <FreeSectionsBlock
                    sections={sections}
                    isOwner={isOwner}
                    onAdd={onAdd}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                    emptyHint={isOwner ? "Añade bloques de contenido propios a tu perfil." : `${name} no tiene secciones todavía.`}
                />
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

    const [resolvedData, setResolvedData] = useState<ResolvedProfileData | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoadingProfile(true);
        // Retrasamos la carga para no bloquear la UI. Viewer ID es user?.id si hay sesión.
        resolveProfileData(pageHandle, user?.id).then(data => {
            if (alive) {
                setResolvedData(data);
                setLoadingProfile(false);
            }
        });
        return () => { alive = false; };
    }, [pageHandle, user?.id]);

    const profileData = {
        name: resolvedData?.name || pageHandle,
        handle: `@${resolvedData?.handle || pageHandle}`,
        bio: resolvedData?.bio || "",
        avatar: resolvedData?.avatar || "",
        cover: resolvedData?.cover || "",
        dataAiHint: "profile avatar",
        coverHint: "abstract pattern",
        isUser: resolvedData?.isOwner || false,
        pageType: 'personal',
    };

    // "Ver como visitante" (Adenda 63 §8): toggle LOCAL del dueño real que
    // renderiza todo el perfil como lo vería una visita (sin persistencia).
    const [viewAsVisitor, setViewAsVisitor] = useState(false);
    const ownerReal = profileData.isUser;
    const isOwner = ownerReal && !viewAsVisitor;
    const pageType = profileData.pageType;
    const [activeTab, setActiveTab] = useState("dashboard");

    // uid REAL de la cuenta dueña de ESTE perfil (Adenda 66 §4): para las
    // identidades soberanas (`os_profiles`) `resolveProfileData` ya lo trae en
    // `id` — es lo que permite resolver su Biblioteca pública para las visitas
    // (y también para el propio dueño en modo "ver como visitante").
    const visitedOwnerUid = useMemo(
        () => (resolvedData?.type === "sovereign" ? (resolvedData.id ?? null) : (ownerReal ? user?.id ?? null : null)),
        [resolvedData?.type, resolvedData?.id, ownerReal, user?.id],
    );



    // ── Perfil como página libre: modo persistido por handle ──
    const { config, setMode } = useProfileDisplay(pageHandle);
    const mode = config.mode;

    // ── Formatos de perfil (Adenda): contenido PÚBLICO sincronizado vía
    // entity_state 'layout' (kind='user', RLS de lectura pública ya aplicada).
    // Ámbito 'user' con el uid REAL solo cuando es el perfil propio: esta
    // página aún no resuelve el uid real de OTRAS cuentas a partir del
    // username (mismo límite preexistente que ProfileLibraryCard) — degradar
    // a `null` aquí es honesto, no una regresión nueva.
    const profileEntityRef = useMemo(
        () => (isOwner && user?.id ? { kind: "user" as const, id: user.id } : null),
        [isOwner, user?.id],
    );
    const {
        layout: profileLayout,
        addSection: addProfileSection,
        updateSection: updateProfileSection,
        removeSection: removeProfileSection,
        addGalleryImage: addProfileGalleryImage,
        removeGalleryImage: removeProfileGalleryImage,
        setAboutExtended: setProfileAboutExtended,
    } = useEntityLayout(profileEntityRef);

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
        {
            id: 'posts',
            title: 'Publicaciones',
            node: (
                <PostFeed
                    channelKey={`profile-${username}`}
                    emptyCta={isOwner ? { label: "Crea tu primera publicación", href: "/crear" } : undefined}
                />
            ),
        },
        { id: 'connections', title: 'Conexiones', node: <ConnectionsWidget pageType={pageType} /> },
        { id: 'library', title: 'Biblioteca', node: <ProfileLibraryCard name={profileData.name} uid={user?.id ?? null} ownerUid={visitedOwnerUid} isOwner={isOwner} /> },
        { id: 'collections', title: 'Colecciones', node: <CollectionsGrid /> },
        { id: 'enlaces', title: 'Enlaces', node: <ProfileLinksSection handle={pageHandle} isOwner={isOwner} name={profileData.name} /> },
        { id: 'archivos', title: 'Archivos', node: <ProfileFilesSection isOwner={isOwner} name={profileData.name} /> },
        { id: 'discusion', title: 'Discusión Abierta', node: <ProfileDiscussionCard /> },
        {
            id: 'sobremi',
            title: 'Sobre mí',
            node: (
                <ProfileAboutExtendedCard
                    isOwner={isOwner}
                    aboutExtended={profileLayout.aboutExtended}
                    onSave={setProfileAboutExtended}
                    name={profileData.name}
                />
            ),
        },
        {
            id: 'galeria',
            title: 'Galería',
            node: (
                <ProfileGalleryCard
                    isOwner={isOwner}
                    images={profileLayout.gallery}
                    onAdd={(url, caption) => addProfileGalleryImage(url, caption)}
                    onRemove={removeProfileGalleryImage}
                    name={profileData.name}
                />
            ),
        },
        {
            id: 'secciones',
            title: 'Secciones',
            node: (
                <ProfileSeccionesCard
                    isOwner={isOwner}
                    sections={profileLayout.sections}
                    onAdd={addProfileSection}
                    onUpdate={updateProfileSection}
                    onRemove={removeProfileSection}
                    name={profileData.name}
                />
            ),
        },
    ];

    if (loadingProfile) {
        return (
            <div className="flex flex-1 items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando perfil..." />
            </div>
        );
    }

    return (

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 min-w-0 overflow-x-clip">
            {/* El header respeta la vista "como visitante" (isUser efectivo). */}
            <ProfileHeader profileData={{ ...profileData, isUser: isOwner }} />

            {/* ── Acciones rápidas del perfil (Adenda 63 §8) ── */}
            <ProfileQuickActions
                isOwner={ownerReal}
                viewAsVisitor={viewAsVisitor}
                onToggleViewAs={() => setViewAsVisitor((v) => !v)}
                handle={pageHandle}
                name={profileData.name}
            />

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
                        {/* Carril de pestañas: el scroll vive en el WRAPPER (no en la
                            pastilla), así el redondeo no recorta los extremos; máscara
                            de fundido en los bordes + snap por pestaña. (Adenda 63) */}
                        <div className="overflow-x-auto scrollbar-hide snap-x rounded-full [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]">
                            <TabsList className="inline-flex w-max min-w-full flex-nowrap justify-start gap-1 md:justify-center">
                            <TabsTrigger value="dashboard" className="shrink-0 flex-none snap-start">Dashboard</TabsTrigger>
                            {hasToolkit(pageType) && (
                                <TabsTrigger value="gobierno" className="shrink-0 flex-none snap-start">{toolkitMeta(pageType).toolkitTab}</TabsTrigger>
                            )}
                            <TabsTrigger value="agenda" className="shrink-0 flex-none snap-start">Agenda</TabsTrigger>
                            <TabsTrigger value="posts" className="shrink-0 flex-none snap-start">Publicaciones</TabsTrigger>
                            <TabsTrigger value="connections" className="shrink-0 flex-none snap-start">Conexiones</TabsTrigger>
                            <TabsTrigger value="library" className="shrink-0 flex-none snap-start">Biblioteca</TabsTrigger>
                            <TabsTrigger value="collections" className="shrink-0 flex-none snap-start">Colecciones</TabsTrigger>
                            <TabsTrigger value="enlaces" className="shrink-0 flex-none snap-start">Enlaces</TabsTrigger>
                            <TabsTrigger value="archivos" className="shrink-0 flex-none snap-start">Archivos</TabsTrigger>
                            <TabsTrigger value="sobremi" className="shrink-0 flex-none snap-start">Sobre mí</TabsTrigger>
                            <TabsTrigger value="galeria" className="shrink-0 flex-none snap-start">Galería</TabsTrigger>
                            <TabsTrigger value="secciones" className="shrink-0 flex-none snap-start">Secciones</TabsTrigger>
                        </TabsList>
                        </div>

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
                            <PostFeed
                                channelKey={`profile-${username}`}
                                emptyCta={isOwner ? { label: "Crea tu primera publicación", href: "/crear" } : undefined}
                            />
                        </TabsContent>
                        <TabsContent value="connections" className="mt-6">
                            <ConnectionsWidget pageType={pageType} />
                        </TabsContent>
                        <TabsContent value="library" className="mt-6">
                            <ProfileLibraryCard name={profileData.name} uid={user?.id ?? null} ownerUid={visitedOwnerUid} isOwner={isOwner} />
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
                        <TabsContent value="sobremi" className="mt-6 animate-in fade-in-50 duration-500">
                            <ProfileAboutExtendedCard
                                isOwner={isOwner}
                                aboutExtended={profileLayout.aboutExtended}
                                onSave={setProfileAboutExtended}
                                name={profileData.name}
                            />
                        </TabsContent>
                        <TabsContent value="galeria" className="mt-6 animate-in fade-in-50 duration-500">
                            <ProfileGalleryCard
                                isOwner={isOwner}
                                images={profileLayout.gallery}
                                onAdd={(url, caption) => addProfileGalleryImage(url, caption)}
                                onRemove={removeProfileGalleryImage}
                                name={profileData.name}
                            />
                        </TabsContent>
                        <TabsContent value="secciones" className="mt-6 animate-in fade-in-50 duration-500">
                            <ProfileSeccionesCard
                                isOwner={isOwner}
                                sections={profileLayout.sections}
                                onAdd={addProfileSection}
                                onUpdate={updateProfileSection}
                                onRemove={removeProfileSection}
                                name={profileData.name}
                            />
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
