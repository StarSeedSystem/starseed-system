// src/app/(app)/grupo/[slug]/page.tsx
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
import { PostCard } from "@/components/social/PostCard";
import { ShareButton } from "@/components/social/SocialActions";
import { GroupRoster } from "@/components/social/group-roster";
import { GroupJoinRequests } from "@/components/social/group-join-requests";
import { GovernanceToolkit, hasToolkit, toolkitMeta } from "@/components/social/toolkits";
import { EntityLibraryPanel } from "@/components/library/entity-library-panel";
import { libraryRef } from "@/lib/library/entity-library";
import { useOsEntity, useOsPosts, useOsPostCount, useMembership, useEntityOwner } from "@/hooks/use-os-entities";
// (Adenda 220) Bienvenida unificada + estados vacíos con acción.
import { EntityWelcome, type WelcomeStep } from "@/components/social/entity-welcome";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, PenSquare } from "lucide-react";
import { EntityEditorDialog } from "@/components/social/entity-editor-dialog";
import type { OsGroup } from "@/lib/os-social";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { CollectionsGrid } from "@/components/profile/collections/collections-grid";
import { samplePages, sampleGroups } from "@/data/sample-entities";
import { listPartidos, listFederativeEntities } from "@/data/sample-governance";
import { pageHref, groupHref } from "@/lib/entity-links";
import { useEntityLayout, applyTabLayout, suggestedIntegrations } from "@/lib/entity-layout";
import { EntityLayoutEditor } from "@/components/social/entity-layout-editor";
// Tema por entidad (Mezclador/Catálogo — Adenda Mezclador): aplica el
// themeId/themeMix guardado en entity-layout SOLO mientras se ve este grupo,
// y restaura el tema del sistema al salir. No-op si la entidad no tiene tema
// propio (caso de siempre).
import { useEntityThemeScope } from "@/lib/design/entity-theme-scope";
import { FreeSectionsBlock } from "@/components/social/free-sections-block";
import { EntityGalleryBlock } from "@/components/social/entity-gallery-block";
import { EntityErrorBoundary } from "@/components/social/entity-error-boundary";
import { GroupEducationPanel } from "@/components/education/group-education-panel";
import { DecisionesSection } from "@/components/governance/decisiones-section";
import { MediationSection } from "@/components/governance/mediation-section";
import { GroupFacePicker } from "@/components/profiles/group-face-picker";
import { toast } from "sonner";
import {
    UsersRound,
    Info,
    Sparkles,
    Plus,
    Check,
    Send,
    Clock,
    Lock,
    Pencil,
    Network,
    Settings2,
} from "lucide-react";

const GOLD = "#E9C46A";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

/**
 * Botón Unirme/Solicitar conectado a Supabase (os_memberships).
 *
 * Grupos "asamblea" piden APROBACIÓN del propietario en vez de unirse al
 * instante (adenda "solicitud de ingreso + aprobación"): el self-insert usa
 * `role: "pending"` (RLS de fila propia ya lo permite; el guard de rol solo
 * degrada roles PRIVILEGIADOS, y 'pending' no lo es). El estado real de la
 * fila propia (`role`, expuesto por `useMembership`) distingue "solicitud
 * enviada, aún pendiente" de "ya aprobado" — antes de esta adenda el botón
 * decía "Solicitud enviada" para siempre tras el click, aunque el propietario
 * ya hubiera aprobado (era cosmético: `setMembership` insertaba de inmediato
 * con rol de miembro pleno). Pulsar mientras está pendiente RETIRA la
 * solicitud (self-delete, ya permitido) — ética restaurativa: nada aquí es
 * definitivo, se puede volver a solicitar cuando se quiera.
 */
function JoinButton({
    groupSlug,
    accent,
    count,
    isAssembly,
}: {
    groupSlug: string;
    accent: string;
    count: number;
    isAssembly: boolean;
}) {
    const { active, role, loading, toggle } = useMembership(groupSlug, isAssembly ? "pending" : "miembro");
    const [hint, setHint] = useState(false);
    const pending = role === "pending";

    const Icon = pending ? Clock : active ? Check : isAssembly ? Send : Plus;
    const label = pending
        ? "Solicitud enviada"
        : active
          ? "Miembro"
          : isAssembly
            ? "Solicitar unirse"
            : "Unirme";
    const displayCount = count + (active && !pending ? 1 : 0);

    const handleClick = async () => {
        const res = await toggle();
        if (res.needsAuth) {
            setHint(true);
            setTimeout(() => setHint(false), 4000);
        } else if (!res.ok && res.error) {
            toast.error(res.error);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <Button
                type="button"
                variant={active ? "outline" : "default"}
                onClick={handleClick}
                disabled={loading}
                title={pending ? "Pulsa para retirar tu solicitud" : undefined}
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
            {pending && (
                <span className="text-[11px] text-muted-foreground">
                    Pendiente de aprobación del propietario del grupo.
                </span>
            )}
            {hint && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                        Inicia sesión para unirte
                    </Link>
                </span>
            )}
        </div>
    );
}

/** Composer + feed real del grupo (os_posts, entity_type = group). */
function GroupFeed({ slug, accent }: { slug: string; accent: string }) {
    const { posts, loading, needsAuth, publish } = useOsPosts("group", slug);
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
            <GlassCard className="p-4">
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={
                        needsAuth
                            ? "Inicia sesión para publicar en este grupo…"
                            : "Comparte algo con el grupo…"
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
                <EmptyState
                    icon={FileText}
                    title="Aún no hay publicaciones en este grupo"
                    description="Inicia la conversación: escribe arriba o crea algo más elaborado en el Lienzo Universal."
                    action={<Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5"><Link href="/crear"><PenSquare className="h-3.5 w-3.5" /> Abrir el Lienzo</Link></Button>}
                />
            ) : (
                posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
        </div>
    );
}

export default function GrupoPage() {
    // Límite de error LOCAL (Adenda 76 · G3): ningún dato raro de la nube
    // (os_groups/entity_state/toolkits/paneles) vuelve a tirar la app entera;
    // degrada a una recuperación suave con «Reintentar». `notFound()` se
    // re-lanza dentro del boundary, así que un grupo inexistente sigue dando 404.
    return (
        <EntityErrorBoundary label="grupo" backHref="/hub" backLabel="Volver al Hub de comunidades">
            <GrupoPageContent />
        </EntityErrorBoundary>
    );
}

function GrupoPageContent() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");
    const slugStr = String(slug);

    const { data: group, loading, usingFallback, refetch } = useOsEntity(slugStr, "group");
    const { isOwner } = useEntityOwner("group", group?.slug ?? "");
    const [editOpen, setEditOpen] = useState(false);
    const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);

    // ── Formato personalizado (entity_state 'layout'): acento/portada, orden y
    // visibilidad de pestañas, secciones libres e integraciones sugeridas.
    const entityRef = useMemo(
        () => (group?.slug ? ({ kind: "group" as const, id: group.slug }) : null),
        [group?.slug],
    );
    const {
        layout, setAccent, setCoverUrl, setTheme, reorderTabs, setTabVisible,
        addSection, updateSection, removeSection, toggleIntegration,
        addGalleryImage, removeGalleryImage,
    } = useEntityLayout(entityRef);

    // Tema propio del grupo (si el dueño eligió uno) — scoped: se aplica al
    // montar esta página y se restaura el tema del sistema al salir.
    useEntityThemeScope(layout);

    const groupKind = group?.kind ?? "colectivo";
    const groupHasToolkit = hasToolkit(groupKind);
    const accentForTabs = layout.accent || group?.accent || "#22d3ee";
    const suggestions = useMemo(() => suggestedIntegrations(groupHasToolkit), [groupHasToolkit]);
    // (Adenda 220) pestaña activa declarada ANTES (la bienvenida navega entre
    // pestañas) + recuento real de publicaciones.
    const [activeTab, setActiveTab] = useState("");
    const postCount = useOsPostCount("group", group?.slug);
    const coverForWelcome = layout.coverUrl || group?.coverUrl || "";

    // Definición de pestañas (base + integraciones activas), en su orden natural.
    const baseTabs = useMemo(() => {
        if (!group) return [] as Array<{ id: string; label: string; node: React.ReactNode }>;
        const list: Array<{ id: string; label: string; node: React.ReactNode }> = [];
        // ── (Adenda 220) INICIO: bienvenida unificada, primera pestaña para todos ──
        const welcomeSteps: WelcomeStep[] = isOwner ? [
            { id: "portada", label: "Portada", done: Boolean(coverForWelcome), onClick: () => setLayoutEditorOpen(true), hint: "Personalizar" },
            { id: "foto", label: "Foto del grupo", done: Boolean(group.avatarUrl), onClick: () => setEditOpen(true), hint: "Editar" },
            { id: "desc", label: "Descripción", done: Boolean(group.description?.trim()), onClick: () => setEditOpen(true), hint: "Editar" },
            { id: "post", label: "Primera publicación", done: (postCount ?? 0) > 0, onClick: () => setActiveTab("feed"), hint: "Feed" },
            { id: "miembros", label: "Segundo miembro", done: (group.memberCount ?? 0) > 1, onClick: () => setActiveTab("members"), hint: "Miembros" },
        ] : [];
        list.push({
            id: "dashboard",
            label: "Inicio",
            node: (
                <EntityWelcome
                    kind="group"
                    name={group.name}
                    description={group.description}
                    accent={accentForTabs}
                    isOwner={isOwner}
                    storageKey={`group:${group.slug}`}
                    stats={[
                        { label: "miembros", value: group.memberCount ?? null, icon: UsersRound },
                        { label: "publicaciones", value: postCount, icon: FileText },
                    ]}
                    steps={welcomeSteps}
                    actions={
                        <>
                            <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={() => setActiveTab("feed")} style={{ borderColor: `${accentForTabs}55`, color: accentForTabs }}>
                                <PenSquare className="h-3.5 w-3.5" /> Publicar en el grupo
                            </Button>
                            <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={() => setActiveTab("members")}>
                                <UsersRound className="h-3.5 w-3.5" /> Ver miembros
                            </Button>
                        </>
                    }
                />
            ),
        });
        if (groupHasToolkit) {
            list.push({
                id: "tools",
                label: toolkitMeta(groupKind).toolkitTab,
                node: <GovernanceToolkit kind={group.kind} slug={group.slug} accent={accentForTabs} name={group.name} entityKind="group" />,
            });
        }
        list.push({ id: "feed", label: "Feed del grupo", node: <GroupFeed slug={group.slug} accent={accentForTabs} /> });
        list.push({
            id: "about",
            label: "Acerca de",
            node: (
                <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="mb-3 flex items-center gap-2" style={{ color: accentForTabs }}>
                        <Info className="h-5 w-5" />
                        <h2 className="font-headline text-lg font-semibold">Acerca del grupo</h2>
                    </div>
                    <p className="leading-relaxed text-foreground/90">
                        {group.description?.trim()
                            ? group.description
                            : "Este grupo todavía no ha añadido una descripción."}
                    </p>
                </GlassCard>
            ),
        });
        list.push({
            id: "members",
            label: "Miembros",
            node: (
                <div className="space-y-6">
                    {/* Solo el propietario ve/gestiona esto (la propia GroupJoinRequests
                        se auto-oculta si !isOwner); embebido en la MISMA pestaña "Miembros"
                        que el directorio — sin ruta nueva en el dock. */}
                    <GroupJoinRequests groupSlug={group.slug} accent={accentForTabs} isOwner={isOwner} />
                    <GroupRoster slug={group.slug} accent={accentForTabs} total={group.memberCount ?? 0} />
                </div>
            ),
        });
        list.push({
            id: "agenda",
            label: "Agenda",
            node: <UnifiedCalendar title={`Agenda de ${group.name}`} subtitle="Eventos y actividades de este grupo." />,
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
                    ref={libraryRef("group", group.slug)}
                    accent={accentForTabs}
                    title={`Biblioteca de ${group.name}`}
                    subtitle="Referencias guardadas por los miembros del grupo, organizadas en folders propios."
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
                    emptyHint="Añade bloques de contenido propios para este grupo (markdown libre)."
                />
            ),
        });
        if (layout.integrations.educacion) {
            list.push({ id: "integracion-educacion", label: "Educación", node: <GroupEducationPanel slug={group.slug} accent={accentForTabs} entityKind="group" /> });
        }
        if (layout.integrations.gobernanza) {
            list.push({ id: "integracion-gobernanza", label: "Gobernanza", node: <DecisionesSection kind={group.kind} slug={group.slug} accent={accentForTabs} name={group.name} /> });
            // Justicia restaurativa (Círculos de Paz) por grupo — pestaña propia dentro
            // del ecosistema de gobernanza (Adenda 125). Invariante §6: no punitiva.
            list.push({ id: "integracion-justicia", label: "Justicia restaurativa", node: <MediationSection entityKind="group" slug={group.slug} accent={accentForTabs} name={group.name} /> });
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
                        emptyHint="Añade imágenes destacadas de este grupo."
                    />
                ),
            });
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group, groupHasToolkit, groupKind, accentForTabs, layout.sections, layout.integrations, layout.gallery, isOwner, postCount, coverForWelcome]);

    const orderedTabs = useMemo(() => {
        const o = applyTabLayout(baseTabs, layout.tabs);
        // (Adenda 220) «Inicio» va primero salvo que el dueño ya lo hubiera
        // recolocado a mano en su layout guardado.
        const i = o.findIndex((t) => t.id === "dashboard");
        if (i > 0 && !layout.tabs.some((t) => t.id === "dashboard")) {
            const [d] = o.splice(i, 1);
            o.unshift(d);
        }
        return o;
    }, [baseTabs, layout.tabs]);
    const visibleTabs = useMemo(() => orderedTabs.filter((t) => t.visible), [orderedTabs]);

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

    if (!group) notFound();

    const accent = accentForTabs;
    const isAssembly = group.kind === "asamblea";
    const effectiveCover = layout.coverUrl || group.coverUrl;
    // Defensa en profundidad (Adenda 76 · G3): `normalizeGroup` ya reduce
    // null→0/""/kind por defecto, pero blindamos también la vista para que
    // NINGÚN objeto de grupo crudo/legacy (no normalizado) haga saltar
    // `.toLocaleString()` u otros accesos. Cero cambio visual con datos sanos.
    const safeMemberCount =
        typeof group.memberCount === "number" && Number.isFinite(group.memberCount)
            ? group.memberCount
            : 0;
    const groupName = group.name?.trim() ? group.name : "Grupo";
    const groupKindLabel = group.kind || "colectivo";

    return (
        <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
            {isOwner && !usingFallback && (
                <EntityEditorDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    mode="edit"
                    entity={{ type: "group", data: group as OsGroup }}
                    onSaved={() => refetch()}
                />
            )}
            {isOwner && (
                <EntityLayoutEditor
                    open={layoutEditorOpen}
                    onOpenChange={setLayoutEditorOpen}
                    baseAccent={group.accent}
                    tabs={orderedTabs}
                    layout={layout}
                    suggestions={suggestions}
                    onSetAccent={setAccent}
                    onSetCoverUrl={setCoverUrl}
                    onSetTheme={setTheme}
                    onReorderTabs={reorderTabs}
                    onSetTabVisible={setTabVisible}
                    onToggleIntegration={toggleIntegration}
                    entityRef={entityRef ?? undefined}
                />
            )}
            {usingFallback && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="min-w-0">
                        Mostrando datos de ejemplo de este grupo. Inicia sesión para ver y editar el contenido real.
                    </span>
                </div>
            )}

            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted/40">
                    {effectiveCover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={effectiveCover}
                            alt={groupName}
                            onError={onImgError}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                </div>

                <div className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.75rem)]">
                    {group.avatarUrl && (
                        <div className="-mt-16 flex items-end gap-4">
                            <span
                                className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-background bg-muted ring-2"
                                style={{ ["--tw-ring-color" as any]: `${accent}55` }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={group.avatarUrl}
                                    alt={groupName}
                                    onError={onImgError}
                                    className="h-full w-full object-cover"
                                />
                            </span>
                        </div>
                    )}

                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Badge
                                variant="outline"
                                className="mb-2 w-fit capitalize"
                                style={{ borderColor: `${accent}55`, color: accent }}
                            >
                                {groupKindLabel}
                            </Badge>
                            <h1
                                className="font-headline text-[clamp(1.5rem,5vw,2.5rem)] font-bold leading-tight"
                                style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                            >
                                {groupName}
                            </h1>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <UsersRound className="h-4 w-4" />
                                    {safeMemberCount.toLocaleString("es-ES")} miembros
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <JoinButton
                                groupSlug={group.slug}
                                accent={accent}
                                count={safeMemberCount}
                                isAssembly={isAssembly}
                            />
                            {/* Cuenta/Perfil (Adenda 125): con qué faceta pública participas
                                en este grupo. Presentation-only; el censo/voto siguen por
                                CUENTA. Se auto-oculta con ≤1 perfil o sin sesión. */}
                            <GroupFacePicker groupSlug={group.slug} />
                            {isOwner && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setEditOpen(true)}
                                    className="gap-2 cursor-pointer"
                                    style={{ borderColor: `${accent}55`, color: accent }}
                                >
                                    <Pencil className="h-4 w-4" />
                                    Editar
                                </Button>
                            )}
                            {isOwner && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setLayoutEditorOpen(true)}
                                    className="gap-2 cursor-pointer"
                                    style={{ borderColor: `${accent}55`, color: accent }}
                                >
                                    <Settings2 className="h-4 w-4" />
                                    Personalizar
                                </Button>
                            )}
                            <ShareButton title={groupName} accent={accent} />
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* ── Pestañas (orden/visibilidad personalizables desde "Personalizar") ──
                Carril unificado del OS (`SectionTabs`): scroll-x REAL + máscara +
                snap, alcanzable en cualquier ancho. (Adenda 68 §C) */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <SectionTabs
                    items={visibleTabs.map((t) => ({ value: t.id, label: t.label }))}
                    value={activeTab}
                    onValueChange={setActiveTab}
                    ariaLabel={`Secciones de ${groupName}`}
                />

                {visibleTabs.map((t) => (
                    <TabsContent key={t.id} value={t.id} className="mt-6 min-w-0 animate-in fade-in-50 duration-500">
                        {t.node}
                    </TabsContent>
                ))}
            </Tabs>

            <p className="text-center text-xs text-muted-foreground">
                <Link href="/hub" className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    ← Volver al Hub de comunidades
                </Link>
            </p>
        </div>
    );
}
