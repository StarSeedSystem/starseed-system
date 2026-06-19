// src/app/(app)/grupo/[slug]/page.tsx
"use client";

import React, { useState } from "react";
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
import { useOsEntity, useOsPosts, useMembership, useEntityOwner } from "@/hooks/use-os-entities";
import { EntityEditorDialog } from "@/components/social/entity-editor-dialog";
import type { OsGroup } from "@/lib/os-social";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";
import { CollectionsGrid } from "@/components/profile/collections/collections-grid";
import { samplePages, sampleGroups } from "@/data/sample-entities";
import { listPartidos, listFederativeEntities } from "@/data/sample-governance";
import { pageHref, groupHref } from "@/lib/entity-links";
import { articles, courses } from "@/lib/data";
import {
    UsersRound,
    Info,
    Sparkles,
    Plus,
    Check,
    Send,
    Lock,
    Pencil,
    BookOpen,
    FileText,
    ArrowUpRight,
    Network,
} from "lucide-react";

const GOLD = "#E9C46A";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

/** Botón Unirme/Solicitar conectado a Supabase (os_memberships). */
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
    const { active, loading, toggle } = useMembership(groupSlug);
    const [hint, setHint] = useState(false);

    const Icon = active ? Check : isAssembly ? Send : Plus;
    const label = active
        ? isAssembly
            ? "Solicitud enviada"
            : "Miembro"
        : isAssembly
          ? "Solicitar unirse"
          : "Unirme";
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
                <div className="rounded-2xl border border-border/50 p-8 text-center text-sm text-muted-foreground">
                    Aún no hay publicaciones en este grupo. ¡Inicia la conversación!
                </div>
            ) : (
                posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
        </div>
    );
}

export default function GrupoPage() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");
    const slugStr = String(slug);

    const { data: group, loading, usingFallback, refetch } = useOsEntity(slugStr, "group");
    const { isOwner } = useEntityOwner("group", group?.slug ?? "");
    const [editOpen, setEditOpen] = useState(false);

    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
                <Skeleton className="aspect-[3/1] w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        );
    }

    if (!group) notFound();

    const accent = group.accent;
    const isAssembly = group.kind === "asamblea";

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {isOwner && !usingFallback && (
                <EntityEditorDialog
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    mode="edit"
                    entity={{ type: "group", data: group as OsGroup }}
                    onSaved={() => refetch()}
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
                    {group.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={group.coverUrl}
                            alt={group.name}
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
                                className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-background bg-muted ring-2"
                                style={{ ["--tw-ring-color" as any]: `${accent}55` }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={group.avatarUrl}
                                    alt={group.name}
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
                                {group.kind}
                            </Badge>
                            <h1
                                className="font-headline text-[clamp(1.5rem,5vw,2.5rem)] font-bold leading-tight"
                                style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                            >
                                {group.name}
                            </h1>
                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <UsersRound className="h-4 w-4" />
                                    {group.memberCount.toLocaleString("es-ES")} miembros
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <JoinButton
                                groupSlug={group.slug}
                                accent={accent}
                                count={group.memberCount}
                                isAssembly={isAssembly}
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
                            <ShareButton title={group.name} accent={accent} />
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* ── Pestañas ── */}
            <Tabs defaultValue="tools">
                <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto">
                    {hasToolkit(group.kind) && (
                        <TabsTrigger value="tools">{toolkitMeta(group.kind).toolkitTab}</TabsTrigger>
                    )}
                    <TabsTrigger value="feed">Feed del grupo</TabsTrigger>
                    <TabsTrigger value="about">Acerca de</TabsTrigger>
                    <TabsTrigger value="members">Miembros</TabsTrigger>
                    <TabsTrigger value="agenda">Agenda</TabsTrigger>
                    <TabsTrigger value="conexiones">Conexiones</TabsTrigger>
                    <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
                    <TabsTrigger value="colecciones">Colecciones</TabsTrigger>
                </TabsList>

                {hasToolkit(group.kind) && (
                    <TabsContent value="tools" className="mt-6">
                        <GovernanceToolkit kind={group.kind} slug={group.slug} accent={accent} name={group.name} />
                    </TabsContent>
                )}

                <TabsContent value="feed" className="mt-6">
                    <GroupFeed slug={group.slug} accent={accent} />
                </TabsContent>

                <TabsContent value="about" className="mt-6">
                    <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                        <div className="mb-3 flex items-center gap-2" style={{ color: accent }}>
                            <Info className="h-5 w-5" />
                            <h2 className="font-headline text-lg font-semibold">Acerca del grupo</h2>
                        </div>
                        <p className="leading-relaxed text-foreground/90">{group.description}</p>
                    </GlassCard>
                </TabsContent>

                <TabsContent value="members" className="mt-6">
                    <MemberAvatars
                        system="politico"
                        total={group.memberCount}
                        accent={accent}
                        seed={group.id}
                    />
                </TabsContent>

                {/* ── Agenda ── */}
                <TabsContent value="agenda" className="mt-6 animate-in fade-in-50 duration-500">
                    <UnifiedCalendar
                        title={`Agenda de ${group.name}`}
                        subtitle="Eventos y actividades de este grupo."
                    />
                </TabsContent>

                {/* ── Conexiones ── */}
                <TabsContent value="conexiones" className="mt-6 animate-in fade-in-50 duration-500">
                    <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                        <div className="mb-4 flex items-center gap-2" style={{ color: accent }}>
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
                </TabsContent>

                {/* ── Biblioteca ── */}
                <TabsContent value="biblioteca" className="mt-6 animate-in fade-in-50 duration-500">
                    <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="font-headline text-lg font-semibold" style={{ color: accent }}>Biblioteca del grupo</h2>
                                <p className="text-sm text-muted-foreground">Artículos y cursos relevantes para los miembros.</p>
                            </div>
                            <Link href="/library" className="shrink-0 whitespace-nowrap text-sm hover:underline cursor-pointer" style={{ color: accent }}>
                                Ver biblioteca →
                            </Link>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <p className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                                    <FileText className="h-3.5 w-3.5" /> Artículos
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {articles.slice(0, 3).map((a) => (
                                        <Link key={a.id} href={a.href} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                            <p className="font-medium leading-snug group-hover:text-primary transition-colors">{a.title}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{a.author}</p>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {a.tags.slice(0, 2).map((t) => (
                                                    <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
                                                ))}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                                    <BookOpen className="h-3.5 w-3.5" /> Cursos
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {courses.slice(0, 2).map((c) => (
                                        <Link key={c.id} href={c.href} className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:-translate-y-0.5 hover:border-white/25">
                                            <p className="flex items-center gap-1 font-medium leading-snug group-hover:text-primary transition-colors">
                                                {c.title} <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                                            </p>
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </TabsContent>

                {/* ── Colecciones ── */}
                <TabsContent value="colecciones" className="mt-6 animate-in fade-in-50 duration-500">
                    <CollectionsGrid />
                </TabsContent>
            </Tabs>

            <p className="text-center text-xs text-muted-foreground">
                <Link href="/hub" className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    ← Volver al Hub de comunidades
                </Link>
            </p>
        </div>
    );
}
