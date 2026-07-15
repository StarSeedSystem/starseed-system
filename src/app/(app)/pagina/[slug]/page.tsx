// src/app/(app)/pagina/[slug]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
// Carril de pestañas: `SectionTabs` (menú unificado del OS). De Radix solo quedan
// la raíz controlada (`Tabs`) y los paneles (`TabsContent`).
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabs } from "@/components/ui/section-tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { EntityHeader } from "@/components/social/entity-header";
import { PostCard } from "@/components/social/PostCard";
import { ShareButton } from "@/components/social/SocialActions";
import { MemberAvatars } from "@/components/social/MemberAvatars";
import { GovernanceToolkit, hasToolkit, toolkitMeta } from "@/components/social/toolkits";
import { EntityLibraryPanel } from "@/components/library/entity-library-panel";
import { libraryRef } from "@/lib/library/entity-library";
import { eventHref, pageHref, groupHref } from "@/lib/entity-links";
import {
    useOsEntity,
    useOsEvents,
    useOsPosts,
    useFollow,
    useEntityOwner,
} from "@/hooks/use-os-entities";
import { EntityEditorDialog } from "@/components/social/entity-editor-dialog";
import type { OsPage } from "@/lib/os-social";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { CollectionsGrid } from "@/components/profile/collections/collections-grid";
import { samplePages, sampleGroups } from "@/data/sample-entities";
import { listPartidos, listFederativeEntities } from "@/data/sample-governance";
import { useEntityLayout, applyTabLayout, suggestedIntegrations } from "@/lib/entity-layout";
import { EntityLayoutEditor } from "@/components/social/entity-layout-editor";
// Tema por entidad (Mezclador/Catálogo — Adenda Mezclador): aplica el
// themeId/themeMix guardado en entity-layout SOLO mientras se ve esta
// página, y restaura el tema del sistema al salir. No-op sin tema propio.
import { useEntityThemeScope } from "@/lib/design/entity-theme-scope";
import { FreeSectionsBlock } from "@/components/social/free-sections-block";
import { EntityGalleryBlock } from "@/components/social/entity-gallery-block";
import { GroupEducationPanel } from "@/components/education/group-education-panel";
import { DecisionesSection } from "@/components/governance/decisiones-section";
import {
    Users,
    CalendarDays,
    MapPin,
    ArrowUpRight,
    Info,
    Sparkles,
    UserPlus,
    Plus,
    Check,
    Send,
    Lock,
    Pencil,
    Network,
    Settings2,
} from "lucide-react";

const GOLD = "#E9C46A";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

const dateFmt = new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
});

/** Botón Seguir/Unirme conectado a Supabase (os_follows). */
function FollowButton({
    pageSlug,
    accent,
    count,
    isCommunity,
}: {
    pageSlug: string;
    accent: string;
    count: number;
    isCommunity: boolean;
}) {
    const { active, loading, needsAuth, toggle } = useFollow(pageSlug);
    const [hint, setHint] = useState(false);

    const Icon = active ? Check : isCommunity ? Plus : UserPlus;
    const label = active
        ? isCommunity
            ? "Miembro"
            : "Siguiendo"
        : isCommunity
          ? "Unirme"
          : "Seguir";
    const displayCount = count + (active ? 1 : 0);

    const handleClick = async () => {
        const res = await toggle();
        if (res.needsAuth) {
            setHint(true);
            setTimeout(() => setHint(false), 4000);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <Button
                type="button"
                variant={active ? "outline" : "default"}
                onClick={handleClick}
                disabled={loading}
                className="gap-2 cursor-pointer transition-all"
                style={
                    active
                        ? { borderColor: `${accent}88`, color: accent }
                        : { background: accent, color: "#0b0b12", borderColor: accent }
                }
                aria-pressed={active}
            >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                <span className="tabular-nums opacity-80">
                    · {displayCount.toLocaleString("es-ES")}
                </span>
            </Button>
            {(hint || (needsAuth && active === false)) && hint && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                        Inicia sesión para {isCommunity ? "unirte" : "seguir"}
                    </Link>
                </span>
            )}
        </div>
    );
}

/** Composer + feed de publicaciones reales de la página (os_posts). */
function PageFeed({ slug, accent }: { slug: string; accent: string }) {
    const { posts, loading, needsAuth, publish } = useOsPosts("page", slug);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [authHint, setAuthHint] = useState(false);

    const handlePublish = async () => {
        if (!body.trim()) return;
        setSending(true);
        const res = await publish(body.trim());
        setSending(false);
        if (res.needsAuth) {
            setAuthHint(true);
        } else if (res.ok) {
            setBody("");
            setAuthHint(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Composer */}
            <GlassCard className="p-4">
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={
                        needsAuth
                            ? "Inicia sesión para publicar en esta página…"
                            : "Comparte algo con esta comunidad…"
                    }
                    className="min-h-[72px] resize-none border-border/50 bg-transparent"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    {authHint || needsAuth ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                                Inicia sesión para publicar
                            </Link>
                        </span>
                    ) : (
                        <span className="text-[11px] text-muted-foreground">
                            Tu publicación se guardará en la red.
                        </span>
                    )}
                    <Button
                        type="button"
                        onClick={handlePublish}
                        disabled={sending || !body.trim()}
                        className="gap-2 cursor-pointer"
                        style={{ background: accent, color: "#0b0b12" }}
                    >
                        <Send className="h-4 w-4" />
                        Publicar
                    </Button>
                </div>
            </GlassCard>

            {loading ? (
                <div className="space-y-6">
                    {[0, 1].map((i) => (
                        <div key={i} className="rounded-2xl border border-border/50 p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-11 w-11 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-3 w-1/4" />
                                </div>
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/5" />
                        </div>
                    ))}
                </div>
            ) : posts.length === 0 ? (
                <div className="rounded-2xl border border-border/50 p-8 text-center text-sm text-muted-foreground">
                    Aún no hay publicaciones. ¡Sé el primero en compartir algo!
                </div>
            ) : (
                posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
        </div>
    );
}

export default function PaginaPage() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");
    const slugStr = String(slug);

    const { data: page, loading, usingFallback, refetch } = useOsEntity(slugStr, "page");
    const { data: allEvents } = useOsEvents();
    const { isOwner } = useEntityOwner("page", page?.slug ?? "");
    const [editOpen, setEditOpen] = useState(false);
    const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);

    const events = useMemo(
        () => (page ? allEvents.filter((e) => e.organizerSlug === page.slug) : []),
        [allEvents, page],
    );

    // ── Formato personalizado (entity_state 'layout'): acento/portada, orden y
    // visibilidad de pestañas, secciones libres e integraciones sugeridas.
    const entityRef = useMemo(
        () => (page?.slug ? ({ kind: "page" as const, id: page.slug }) : null),
        [page?.slug],
    );
    const {
        layout, setAccent, setCoverUrl, setTheme, reorderTabs, setTabVisible,
        addSection, updateSection, removeSection, toggleIntegration,
        addGalleryImage, removeGalleryImage,
    } = useEntityLayout(entityRef);

    // Tema propio de la página (si el dueño eligió uno) — scoped: se aplica
    // al montar esta página y se restaura el tema del sistema al salir.
    useEntityThemeScope(layout);

    const pageKind = page?.kind ?? "pagina";
    const pageHasToolkit = hasToolkit(pageKind);
    const accentForTabs = layout.accent || page?.accent || "#E9C46A";
    const suggestions = useMemo(() => suggestedIntegrations(pageHasToolkit), [pageHasToolkit]);

    const baseTabs = useMemo(() => {
        if (!page) return [] as Array<{ id: string; label: string; node: React.ReactNode }>;
        const list: Array<{ id: string; label: string; node: React.ReactNode }> = [];
        if (pageHasToolkit) {
            list.push({
                id: "tools",
                label: toolkitMeta(pageKind).toolkitTab,
                node: <GovernanceToolkit kind={page.kind} slug={page.slug} accent={accentForTabs} name={page.name} entityKind="page" />,
            });
        }
        list.push({ id: "posts", label: "Publicaciones", node: <PageFeed slug={page.slug} accent={accentForTabs} /> });
        list.push({
            id: "dashboard",
            label: "Dashboard",
            node: (
                <div className="grid gap-6 lg:grid-cols-2">
                    <div className="lg:col-span-2">
                        <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="mb-3 flex items-center gap-2" style={{ color: accentForTabs }}>
                        <Info className="h-5 w-5" />
                        <h2 className="font-headline text-lg font-semibold">Acerca de</h2>
                    </div>
                    <p className="leading-relaxed text-foreground/90">{page.description}</p>
                        </GlassCard>
                    </div>
                </div>
            ),
        });
        list.push({ id: "members", label: "Miembros", node: <MemberAvatars system="politico" total={page.memberCount} accent={accentForTabs} seed={page.id} /> });
        list.push({
            id: "events",
            label: "Eventos",
            node: events.length === 0 ? (
                <div className="rounded-2xl border border-border/50 p-8 text-center text-sm text-muted-foreground">
                    Esta página todavía no organiza eventos próximos.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {events.map((e) => (
                        <Link key={e.id} href={eventHref(e.slug)} className="cursor-pointer">
                            <GlassCard variant="hover" className="flex h-full flex-col overflow-hidden">
                                <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                                    {e.coverUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={e.coverUrl}
                                            alt={e.title}
                                            loading="lazy"
                                            onError={onImgError}
                                            className="absolute inset-0 h-full w-full object-cover"
                                        />
                                    )}
                                </div>
                                <div className="flex flex-1 flex-col gap-2 p-4">
                                    <h3 className="font-semibold leading-snug">{e.title}</h3>
                                    {e.startsAt && (
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <CalendarDays className="h-3.5 w-3.5" />
                                            {dateFmt.format(new Date(e.startsAt))}
                                        </p>
                                    )}
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <MapPin className="h-3.5 w-3.5" />
                                        <span className="truncate">{e.location}</span>
                                    </p>
                                    <span className="mt-1 flex items-center gap-1 text-xs font-medium" style={{ color: accentForTabs }}>
                                        Ver evento <ArrowUpRight className="h-3.5 w-3.5" />
                                    </span>
                                </div>
                            </GlassCard>
                        </Link>
                    ))}
                </div>
            ),
        });
        list.push({
            id: "agenda",
            label: "Agenda",
            node: <UnifiedCalendar title={`Agenda de ${page.name}`} subtitle="Eventos y actividades organizados por esta página." />,
        });
        list.push({
            id: "conexiones",
            label: "Conexiones",
            node: (
                <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="mb-4 flex items-center gap-2" style={{ color: accentForTabs }}>
                        <Network className="h-5 w-5" />
                        <h2 className="font-headline text-lg font-semibold">Entidades conectadas</h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {samplePages.slice(0, 3).map((p) => (
                            <Link key={p.id} href={pageHref(p)} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                <Badge variant="secondary" className="mb-2 text-[10px] capitalize">{p.kind}</Badge>
                                <p className="font-medium leading-snug group-hover:text-primary transition-colors">{p.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{p.members.toLocaleString("es-ES")} miembros</p>
                            </Link>
                        ))}
                        {sampleGroups.slice(0, 3).map((g) => (
                            <Link key={g.id} href={groupHref(g)} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                <Badge variant="secondary" className="mb-2 text-[10px] capitalize">{g.kind}</Badge>
                                <p className="font-medium leading-snug group-hover:text-primary transition-colors">{g.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{g.members.toLocaleString("es-ES")} miembros</p>
                            </Link>
                        ))}
                        {listFederativeEntities().slice(0, 2).map((ef) => (
                            <Link key={ef.slug} href={`/entidad/${ef.slug}`} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                <Badge variant="secondary" className="mb-2 text-[10px]">E.F.</Badge>
                                <p className="font-medium leading-snug group-hover:text-primary transition-colors">{ef.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{ef.citizens.toLocaleString("es-ES")} ciudadanos</p>
                            </Link>
                        ))}
                        {listPartidos().slice(0, 2).map((p) => (
                            <Link key={p.slug} href={`/partido/${p.slug}`} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                <Badge variant="secondary" className="mb-2 text-[10px]">Partido</Badge>
                                <p className="font-medium leading-snug group-hover:text-primary transition-colors">{p.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{p.members.toLocaleString("es-ES")} miembros</p>
                            </Link>
                        ))}
                    </div>
                </GlassCard>
            ),
        });
        list.push({
            id: "biblioteca",
            label: "Biblioteca",
            node: (
                <EntityLibraryPanel
                    ref={libraryRef("page", page.slug)}
                    accent={accentForTabs}
                    title={`Biblioteca de ${page.name}`}
                    subtitle="Referencias guardadas por esta página, organizadas en folders propios."
                />
            ),
        });
        list.push({ id: "colecciones", label: "Colecciones", node: <CollectionsGrid /> });
        list.push({
            id: "secciones",
            label: "Secciones",
            node: (
                <FreeSectionsBlock
                    sections={layout.sections}
                    isOwner={isOwner}
                    accent={accentForTabs}
                    onAdd={addSection}
                    onUpdate={updateSection}
                    onRemove={removeSection}
                    emptyHint="Añade bloques de contenido propios para esta página (markdown libre)."
                />
            ),
        });
        if (layout.integrations.educacion) {
            list.push({ id: "integracion-educacion", label: "Educación", node: <GroupEducationPanel slug={page.slug} accent={accentForTabs} entityKind="page" /> });
        }
        if (layout.integrations.gobernanza) {
            list.push({ id: "integracion-gobernanza", label: "Gobernanza", node: <DecisionesSection kind={page.kind} slug={page.slug} accent={accentForTabs} name={page.name} /> });
        }
        if (layout.integrations.galeria) {
            list.push({
                id: "integracion-galeria",
                label: "Galería",
                node: (
                    <EntityGalleryBlock
                        images={layout.gallery}
                        isOwner={isOwner}
                        onAdd={addGalleryImage}
                        onRemove={removeGalleryImage}
                        emptyHint="Añade imágenes destacadas de esta página."
                    />
                ),
            });
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageHasToolkit, pageKind, accentForTabs, events, layout.sections, layout.integrations, layout.gallery, isOwner]);

    const orderedTabs = useMemo(() => applyTabLayout(baseTabs, layout.tabs), [baseTabs, layout.tabs]);
    const visibleTabs = useMemo(() => orderedTabs.filter((t) => t.visible), [orderedTabs]);

    const [activeTab, setActiveTab] = useState("");
    useEffect(() => {
        if (visibleTabs.length === 0) return;
        if (!visibleTabs.some((t) => t.id === activeTab)) setActiveTab(visibleTabs[0].id);
    }, [visibleTabs, activeTab]);

    if (loading) {
        return (
            <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
                <Skeleton className="aspect-[3/1] w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        );
    }

    if (!page) notFound();

    const accent = accentForTabs;
    const isCommunity = page.kind === "comunidad";
    const effectiveCover = layout.coverUrl || page.coverUrl;

    return (
        <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
            {isOwner && !usingFallback && (
                <EntityEditorDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    mode="edit"
                    entity={{ type: "page", data: page as OsPage }}
                    onSaved={() => refetch()}
                />
            )}
            {isOwner && (
                <EntityLayoutEditor
                    open={layoutEditorOpen}
                    onOpenChange={setLayoutEditorOpen}
                    baseAccent={page.accent}
                    tabs={orderedTabs}
                    layout={layout}
                    suggestions={suggestions}
                    onSetAccent={setAccent}
                    onSetCoverUrl={setCoverUrl}
                    onSetTheme={setTheme}
                    onReorderTabs={reorderTabs}
                    onSetTabVisible={setTabVisible}
                    onToggleIntegration={toggleIntegration}
                />
            )}
            {usingFallback && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="min-w-0">
                        Mostrando datos de ejemplo de esta página. Inicia sesión para ver y editar el contenido real.
                    </span>
                </div>
            )}

            
            <EntityHeader
                entity={{
                    id: page.id,
                    kind: page.kind,
                    slug: page.slug,
                    name: page.name,
                    description: page.description,
                    coverUrl: effectiveCover,
                    memberCount: page.memberCount,
                    accent: accent
                }}
                isOwner={isOwner}
                isCommunity={isCommunity}
                onEdit={() => setEditOpen(true)}
                onCustomize={() => setLayoutEditorOpen(true)}
                followState={useFollow(page.slug)}
            />

            <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
                <div className={`min-w-0 ${activeTab === 'agenda' ? "lg:col-span-3" : "lg:col-span-2"}`}>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <SectionTabs
                            className="w-full max-w-full overflow-hidden"
                            items={visibleTabs.map((t) => ({ value: t.id, label: t.label }))}
                            value={activeTab}
                            onValueChange={setActiveTab}
                            ariaLabel={`Secciones de ${page.name}`}
                        />

                        {visibleTabs.map((t) => (
                            <TabsContent key={t.id} value={t.id} className="mt-6 min-w-0 animate-in fade-in-50 duration-500">
                                {t.node}
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
                {activeTab !== 'agenda' && (
                    <div className="min-w-0 lg:col-span-1 mt-14">
                        <GlassCard className="p-4">
                            <h3 className="font-headline text-lg font-semibold mb-3">Red</h3>
                            <MemberAvatars count={page.memberCount} accent={accent} />
                        </GlassCard>
                    </div>
                )}
            </div>

            <p className="text-center text-xs text-muted-foreground">
                <Link href="/network" className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    ← Volver a la Red
                </Link>
            </p>
        </div>
    );
}
