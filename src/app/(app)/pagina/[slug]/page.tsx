// src/app/(app)/pagina/[slug]/page.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { PostFeed } from "@/components/social/PostFeed";
import { SocialActionButton, ShareButton } from "@/components/social/SocialActions";
import { MemberAvatars } from "@/components/social/MemberAvatars";
import { samplePages, SYSTEM_LABEL } from "@/data/sample-entities";
import { eventsByOrganizerSlug } from "@/data/sample-events";
import { matchesPage, pageSlug, eventHref } from "@/lib/entity-links";
import { Users, CalendarDays, MapPin, ArrowUpRight, Info } from "lucide-react";

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

export default function PaginaPage() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");

    const page = useMemo(
        () => samplePages.find((p) => matchesPage(p, String(slug))),
        [slug],
    );

    if (!page) notFound();

    const accent = page.accent;
    const isCommunity = page.kind === "comunidad";
    const events = eventsByOrganizerSlug(pageSlug(page));

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={page.cover}
                        alt={page.title}
                        onError={onImgError}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                    {page.status && (
                        <Badge
                            className="absolute left-4 top-4 border-0 text-[11px] text-white"
                            style={{ background: `${accent}cc` }}
                        >
                            {page.status}
                        </Badge>
                    )}
                </div>

                <div className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Badge
                                variant="outline"
                                className="mb-2 w-fit capitalize"
                                style={{ borderColor: `${accent}55`, color: accent }}
                            >
                                {page.kind} · {SYSTEM_LABEL[page.system]}
                            </Badge>
                            <h1
                                className="font-headline text-[clamp(1.5rem,5vw,2.5rem)] font-bold leading-tight"
                                style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                            >
                                {page.title}
                            </h1>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Users className="h-4 w-4" />
                                {page.members.toLocaleString("es-ES")} miembros
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <SocialActionButton
                                action={isCommunity ? "join" : "follow"}
                                entityKey={page.id}
                                accent={accent}
                                count={page.members}
                            />
                            <ShareButton title={page.title} accent={accent} />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {page.tags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-[11px]">
                                #{t}
                            </Badge>
                        ))}
                    </div>
                </div>
            </GlassCard>

            {/* ── Pestañas ── */}
            <Tabs defaultValue="posts">
                <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto">
                    <TabsTrigger value="posts">Publicaciones</TabsTrigger>
                    <TabsTrigger value="about">Acerca de</TabsTrigger>
                    <TabsTrigger value="members">Miembros</TabsTrigger>
                    <TabsTrigger value="events">Eventos</TabsTrigger>
                </TabsList>

                <TabsContent value="posts" className="mt-6">
                    <PostFeed
                        groupId={page.id}
                        channelKey={`page-${page.id}`}
                        fallbackNotice="Mostrando publicaciones de ejemplo de esta página. Inicia sesión para ver el flujo real."
                    />
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
                        system={page.system}
                        total={page.members}
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
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={e.cover}
                                                alt={e.title}
                                                loading="lazy"
                                                onError={onImgError}
                                                className="absolute inset-0 h-full w-full object-cover"
                                            />
                                        </div>
                                        <div className="flex flex-1 flex-col gap-2 p-4">
                                            <h3 className="font-semibold leading-snug">{e.title}</h3>
                                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <CalendarDays className="h-3.5 w-3.5" />
                                                {dateFmt.format(new Date(e.startsAt))}
                                            </p>
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
