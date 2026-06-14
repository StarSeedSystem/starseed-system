// src/app/(app)/grupo/[slug]/page.tsx
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
import { sampleGroups, SYSTEM_LABEL } from "@/data/sample-entities";
import { matchesGroup } from "@/lib/entity-links";
import { UsersRound, Activity, Info } from "lucide-react";

const GOLD = "#E9C46A";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

export default function GrupoPage() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");

    const group = useMemo(
        () => sampleGroups.find((g) => matchesGroup(g, String(slug))),
        [slug],
    );

    if (!group) notFound();

    const accent = group.accent;
    // Las asambleas se "solicitan"; círculos/colectivos se "unen".
    const joinAction = group.kind === "asamblea" ? "request" : "join";

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={group.cover}
                        alt={group.name}
                        onError={onImgError}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                </div>

                <div className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="-mt-16 flex items-end gap-4">
                        <span
                            className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-background bg-muted ring-2"
                            style={{ ["--tw-ring-color" as any]: `${accent}55` }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={group.avatar}
                                alt={group.name}
                                onError={onImgError}
                                className="h-full w-full object-cover"
                            />
                        </span>
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Badge
                                variant="outline"
                                className="mb-2 w-fit capitalize"
                                style={{ borderColor: `${accent}55`, color: accent }}
                            >
                                {group.kind} · {SYSTEM_LABEL[group.system]}
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
                                    {group.members.toLocaleString("es-ES")} miembros
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Activity className="h-4 w-4" />
                                    {group.activity}
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <SocialActionButton
                                action={joinAction}
                                entityKey={group.id}
                                accent={accent}
                                count={group.members}
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
                    <PostFeed
                        groupId={group.id}
                        channelKey={`group-${group.id}`}
                        fallbackNotice="Mostrando publicaciones de ejemplo de este grupo. Inicia sesión para ver el flujo real."
                    />
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
                        system={group.system}
                        total={group.members}
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
