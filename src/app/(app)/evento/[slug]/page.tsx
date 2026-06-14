// src/app/(app)/evento/[slug]/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { ShareButton } from "@/components/social/SocialActions";
import { useOsEntity, useAttendance } from "@/hooks/use-os-entities";
import {
    CalendarDays,
    Clock,
    MapPin,
    Users,
    Wifi,
    ArrowUpRight,
    Info,
    Sparkles,
    CalendarCheck,
    Star,
    Check,
    Lock,
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

/** Botones de asistencia conectados a Supabase (os_event_attendance). */
function AttendanceButtons({
    eventSlug,
    accent,
    count,
}: {
    eventSlug: string;
    accent: string;
    count: number;
}) {
    const { status, loading, toggle } = useAttendance(eventSlug);
    const [hint, setHint] = useState(false);

    const attending = status === "asiste";
    const interested = status === "interesa";
    const displayCount = count + (status !== null ? 1 : 0);

    const act = async (target: string) => {
        const res = await toggle(target);
        if (res.needsAuth) {
            setHint(true);
            setTimeout(() => setHint(false), 4000);
        }
    };

    return (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
            <Button
                type="button"
                variant={attending ? "outline" : "default"}
                onClick={() => act("asiste")}
                disabled={loading}
                className="w-full gap-2 cursor-pointer transition-all"
                style={
                    attending
                        ? { borderColor: `${accent}88`, color: accent }
                        : { background: accent, color: "#0b0b12", borderColor: accent }
                }
                aria-pressed={attending}
            >
                {attending ? <Check className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />}
                <span>{attending ? "Asistiré ✓" : "Asistiré"}</span>
                <span className="tabular-nums opacity-80">· {displayCount.toLocaleString("es-ES")}</span>
            </Button>
            <Button
                type="button"
                variant="outline"
                onClick={() => act("interesa")}
                disabled={loading}
                className="w-full gap-2 cursor-pointer"
                style={interested ? { borderColor: `${accent}88`, color: accent } : { borderColor: `${accent}55` }}
                aria-pressed={interested}
            >
                <Star className="h-4 w-4" />
                <span>{interested ? "Interesado/a" : "Me interesa"}</span>
            </Button>
            <ShareButton title="" accent={accent} className="w-full" />
            {hint && (
                <span className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                        Inicia sesión para confirmar asistencia
                    </Link>
                </span>
            )}
        </div>
    );
}

export default function EventoPage() {
    const params = useParams();
    const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? "");
    const slugStr = String(slug);

    const { data: event, loading, usingFallback } = useOsEntity(slugStr, "event");
    // Página organizadora real (para enlazar y obtener nombre/portada).
    const { data: organizer } = useOsEntity(event?.organizerSlug ?? "", "page");

    if (loading) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                <Skeleton className="aspect-video w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        );
    }

    if (!event) notFound();

    const accent = organizer?.accent ?? GOLD;
    const start = event.startsAt ? new Date(event.startsAt) : null;
    const online = /línea|linea|multiverso|online/i.test(event.location);

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            {usingFallback && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="min-w-0">
                        Mostrando datos de ejemplo de este evento. Inicia sesión para confirmar tu asistencia real.
                    </span>
                </div>
            )}

            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                    {event.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={event.coverUrl}
                            alt={event.title}
                            onError={onImgError}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                        <Badge
                            className="mb-2 border-0 capitalize text-white"
                            style={{ background: `${accent}cc` }}
                        >
                            {event.kind}
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
                        {event.tags.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-1.5">
                                {event.tags.map((t) => (
                                    <Badge key={t} variant="secondary" className="text-[11px]">
                                        #{t}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </GlassCard>

                    {/* Organizador → enlaza a la comunidad/página real */}
                    {organizer && (
                        <GlassCard className="p-[clamp(1rem,3vw,1.5rem)]">
                            <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                                Organiza
                            </p>
                            <Link
                                href={`/pagina/${organizer.slug}`}
                                className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/5 cursor-pointer min-w-0"
                            >
                                <span
                                    className="h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 bg-muted"
                                    style={{ ["--tw-ring-color" as any]: `${accent}55` }}
                                >
                                    {organizer.avatarUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={organizer.avatarUrl}
                                            alt={organizer.name}
                                            onError={onImgError}
                                            className="h-full w-full object-cover"
                                        />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold">{organizer.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        Ver página de la comunidad
                                    </p>
                                </div>
                                <ArrowUpRight className="h-4 w-4 shrink-0" style={{ color: accent }} />
                            </Link>
                        </GlassCard>
                    )}
                </div>

                {/* ── Panel lateral: detalles + acciones ── */}
                <aside className="lg:col-span-1">
                    <GlassCard className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.5rem)] lg:sticky lg:top-20">
                        {start && (
                            <>
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
                                        <p className="text-sm font-medium">{timeFmt.format(start)}</p>
                                        <p className="text-xs text-muted-foreground">Hora</p>
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="flex items-start gap-3">
                            {online ? (
                                <Wifi className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            ) : (
                                <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium break-words">{event.location}</p>
                                <p className="text-xs text-muted-foreground">
                                    {online ? "Evento en línea" : "Lugar físico"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Users className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                            <div className="min-w-0">
                                <p className="text-sm font-medium tabular-nums" style={{ color: GOLD }}>
                                    {event.attendeeCount.toLocaleString("es-ES")}
                                </p>
                                <p className="text-xs text-muted-foreground">Asistentes</p>
                            </div>
                        </div>

                        <AttendanceButtons
                            eventSlug={event.slug}
                            accent={accent}
                            count={event.attendeeCount}
                        />
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
