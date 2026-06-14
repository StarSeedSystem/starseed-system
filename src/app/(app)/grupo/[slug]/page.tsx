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
import { useOsEntity, useOsPosts, useMembership } from "@/hooks/use-os-entities";
import {
    UsersRound,
    Info,
    Sparkles,
    Plus,
    Check,
    Send,
    Lock,
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

    const { data: group, loading, usingFallback } = useOsEntity(slugStr, "group");

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
                            <ShareButton title={group.name} accent={accent} />
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* ── Pestañas ── */}
            <Tabs defaultValue="feed">
                <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto">
                    <TabsTrigger value="feed">Feed del grupo</TabsTrigger>
                    <TabsTrigger value="about">Acerca de</TabsTrigger>
                    <TabsTrigger value="members">Miembros</TabsTrigger>
                </TabsList>

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
            </Tabs>

            <p className="text-center text-xs text-muted-foreground">
                <Link href="/hub" className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    ← Volver al Hub de comunidades
                </Link>
            </p>
        </div>
    );
}
