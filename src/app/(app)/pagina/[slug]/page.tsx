// src/app/(app)/pagina/[slug]/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { PostCard } from "@/components/social/PostCard";
import { ShareButton } from "@/components/social/SocialActions";
import { MemberAvatars } from "@/components/social/MemberAvatars";
import { GovernanceToolkit, hasToolkit, toolkitMeta } from "@/components/social/toolkits";
import { eventHref } from "@/lib/entity-links";
import {
    useOsEntity,
    useOsEvents,
    useOsPosts,
    useFollow,
    useEntityOwner,
} from "@/hooks/use-os-entities";
import { EntityEditorDialog } from "@/components/social/entity-editor-dialog";
import type { OsPage } from "@/lib/os-social";
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

    const events = useMemo(
        () => (page ? allEvents.filter((e) => e.organizerSlug === page.slug) : []),
        [allEvents, page],
    );

    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
                <Skeleton className="aspect-[3/1] w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        );
    }

    if (!page) notFound();

    const accent = page.accent;
    const isCommunity = page.kind === "comunidad";

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {isOwner && !usingFallback && (
                <EntityEditorDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    mode="edit"
                    entity={{ type: "page", data: page as OsPage }}
                    onSaved={() => refetch()}
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

            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted/40">
                    {page.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={page.coverUrl}
                            alt={page.name}
                            onError={onImgError}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                </div>

                <div className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Badge
                                variant="outline"
                                className="mb-2 w-fit capitalize"
                                style={{ borderColor: `${accent}55`, color: accent }}
                            >
                                {page.kind}
                            </Badge>
                            <h1
                                className="font-headline text-[clamp(1.5rem,5vw,2.5rem)] font-bold leading-tight"
                                style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                            >
                                {page.name}
                            </h1>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Users className="h-4 w-4" />
                                {page.memberCount.toLocaleString("es-ES")} miembros
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <FollowButton
                                pageSlug={page.slug}
                                accent={accent}
                                count={page.memberCount}
                                isCommunity={isCommunity}
                            />
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
                            <ShareButton title={page.name} accent={accent} />
                        </div>
                    </div>
                    {page.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {page.tags.map((t) => (
                                <Badge key={t} variant="secondary" className="text-[11px]">
                                    #{t}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </GlassCard>

            {/* ── Pestañas ── */}
            <Tabs defaultValue={hasToolkit(page.kind) ? "tools" : "posts"}>
                <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto">
                    {hasToolkit(page.kind) && (
                        <TabsTrigger value="tools">{toolkitMeta(page.kind).toolkitTab}</TabsTrigger>
                    )}
                    <TabsTrigger value="posts">Publicaciones</TabsTrigger>
                    <TabsTrigger value="about">Acerca de</TabsTrigger>
                    <TabsTrigger value="members">Miembros</TabsTrigger>
                    <TabsTrigger value="events">Eventos</TabsTrigger>
                </TabsList>

                {hasToolkit(page.kind) && (
                    <TabsContent value="tools" className="mt-6">
                        <GovernanceToolkit kind={page.kind} slug={page.slug} accent={accent} name={page.name} />
                    </TabsContent>
                )}

                <TabsContent value="posts" className="mt-6">
                    <PageFeed slug={page.slug} accent={accent} />
                </TabsContent>

                <TabsContent value="about" className="mt-6">
                    <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                        <div className="mb-3 flex items-center gap-2" style={{ color: accent }}>
                            <Info className="h-5 w-5" />
                            <h2 className="font-headline text-lg font-semibold">Acerca de</h2>
                        </div>
                        <p className="leading-relaxed text-foreground/90">{page.description}</p>
                    </GlassCard>
                </TabsContent>

                <TabsContent value="members" className="mt-6">
                    <MemberAvatars
                        system="politico"
                        total={page.memberCount}
                        accent={accent}
                        seed={page.id}
                    />
                </TabsContent>

                <TabsContent value="events" className="mt-6">
                    {events.length === 0 ? (
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
                                            <span
                                                className="mt-1 flex items-center gap-1 text-xs font-medium"
                                                style={{ color: accent }}
                                            >
                                                Ver evento <ArrowUpRight className="h-3.5 w-3.5" />
                                            </span>
                                        </div>
                                    </GlassCard>
                                </Link>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <p className="text-center text-xs text-muted-foreground">
                <Link href="/network" className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    ← Volver a la Red
                </Link>
            </p>
        </div>
    );
}
