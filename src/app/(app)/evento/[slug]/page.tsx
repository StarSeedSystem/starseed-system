// src/app/(app)/evento/[slug]/page.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { SocialActionButton, ShareButton } from "@/components/social/SocialActions";
import { findEvent } from "@/data/sample-events";
import { samplePages, SYSTEM_LABEL } from "@/data/sample-entities";
import { pageHref } from "@/lib/entity-links";
import {
    CalendarDays,
    Clock,
    MapPin,
    Users,
    Wifi,
    ArrowUpRight,
    Info,
} from "lucide-react";

const GOLD = "#E9C46A";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

const dayFmt = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
});

export default function EventoPage() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");

    const event = useMemo(() => findEvent(String(slug)), [slug]);

    if (!event) notFound();

    const accent = event.accent;
    const start = new Date(event.startsAt);
    const end = event.endsAt ? new Date(event.endsAt) : null;

    // Página/comunidad organizadora (para enlazar de verdad).
    const organizerPage = samplePages.find(
        (p) => pageHref(p) === `/pagina/${event.organizerPageSlug}`,
    );

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={event.cover}
                        alt={event.title}
                        onError={onImgError}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                        <Badge
                            className="mb-2 border-0 capitalize text-white"
                            style={{ background: `${accent}cc` }}
                        >
                            {event.kind} · {SYSTEM_LABEL[event.system]}
                        </Badge>
                        <h1
                            className="font-headline text-[clamp(1.4rem,5vw,2.4rem)] font-bold leading-tight text-white drop-shadow"
                            style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                        >
                            {event.title}
                        </h1>
                    </div>
                </div>
            </GlassCard>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* ── Columna principal ── */}
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <GlassCard className="p-[clamp(1rem,3vw,1.75rem)]">
                        <div className="mb-3 flex items-center gap-2" style={{ color: accent }}>
                            <Info className="h-5 w-5" />
                            <h2 className="font-headline text-lg font-semibold">Descripción</h2>
                        </div>
                        <p className="leading-relaxed text-foreground/90">{event.description}</p>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                            {event.tags.map((t) => (
                                <Badge key={t} variant="secondary" className="text-[11px]">
                                    #{t}
                                </Badge>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Organizador → enlaza a la comunidad/página real */}
                    <GlassCard className="p-[clamp(1rem,3vw,1.5rem)]">
                        <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                            Organiza
                        </p>
                        {organizerPage ? (
                            <Link
                                href={pageHref(organizerPage)}
                                className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5 cursor-pointer min-w-0"
                            >
                                <span
                                    className="h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2"
                                    style={{ ["--tw-ring-color" as any]: `${accent}55` }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={event.organizerAvatar}
                                        alt={event.organizer}
                                        onError={onImgError}
                                        className="h-full w-full object-cover"
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{event.organizer}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        Ver página de la comunidad
                                    </p>
                                </div>
                                <ArrowUpRight className="h-4 w-4 shrink-0" style={{ color: accent }} />
                            </Link>
                        ) : (
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={event.organizerAvatar}
                                        alt={event.organizer}
                                        onError={onImgError}
                                        className="h-full w-full object-cover"
                                    />
                                </span>
                                <p className="truncate font-semibold">{event.organizer}</p>
                            </div>
                        )}
                    </GlassCard>
                </div>

                {/* ── Panel lateral: detalles + acciones ── */}
                <aside className="lg:col-span-1">
                    <GlassCard className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.5rem)] lg:sticky lg:top-20">
                        <div className="flex items-start gap-3">
                            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            <div className="min-w-0">
                                <p className="text-sm font-medium capitalize">{dayFmt.format(start)}</p>
                                <p className="text-xs text-muted-foreground">Fecha</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            <div className="min-w-0">
                                <p className="text-sm font-medium">
                                    {timeFmt.format(start)}
                                    {end ? ` – ${timeFmt.format(end)}` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground">Hora</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            {event.online ? (
                                <Wifi className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            ) : (
                                <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium break-words">{event.location}</p>
                                <p className="text-xs text-muted-foreground">
                                    {event.online ? "Evento en línea" : "Lugar físico"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Users className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            <div className="min-w-0">
                                <p className="text-sm font-medium tabular-nums" style={{ color: GOLD }}>
                                    {event.attendees.toLocaleString("es-ES")}
                                </p>
                                <p className="text-xs text-muted-foreground">Asistentes</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                            <SocialActionButton
                                action="attend"
                                entityKey={event.id}
                                accent={accent}
                                count={event.attendees}
                                className="w-full"
                            />
                            <SocialActionButton
                                action="interested"
                                entityKey={event.id}
                                accent={accent}
                                className="w-full"
                            />
                            <ShareButton title={event.title} accent={accent} className="w-full" />
                        </div>
                    </GlassCard>
                </aside>
            </div>

            <p className="text-center text-xs text-muted-foreground">
                <Link href="/network/culture" className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    ← Volver a la Red
                </Link>
            </p>
        </div>
    );
}
