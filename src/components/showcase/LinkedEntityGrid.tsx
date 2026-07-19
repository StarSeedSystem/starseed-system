// src/components/showcase/LinkedEntityGrid.tsx
"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Rejilla de entidades NAVEGABLE: igual estética que SystemShowcase (bloqueado),
// pero cada tarjeta enlaza de verdad a su ruta dinámica:
//   · Perfil  → /profile/<username>
//   · Página  → /pagina/<slug>
//   · Grupo   → /grupo/<slug>
//   · Evento  → /evento/<slug>
// Sin dependencias nuevas. SSR-safe. Úsalo en cualquier página permitida para
// ofrecer navegación real entre perfiles, páginas, grupos y eventos.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Link from "next/link";
import {
    Users,
    LayoutGrid,
    UsersRound,
    CalendarDays,
    BadgeCheck,
    MapPin,
    ArrowUpRight,
    type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import {
    type SystemKey,
    SYSTEM_ACCENT,
    SYSTEM_LABEL,
    profilesBySystem,
    pagesBySystem,
    groupsBySystem,
} from "@/data/sample-entities";
import { eventsBySystem } from "@/data/sample-events";
import { pageHref, groupHref, profileHref, eventHref } from "@/lib/entity-links";

const GOLD = "#E9C46A";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

const dateFmt = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
});

function SectionHeader({
    icon: Icon,
    title,
    accent,
}: {
    icon: LucideIcon;
    title: string;
    accent: string;
}) {
    return (
        <div className="mb-4 flex items-center gap-3">
            <span className="shrink-0 rounded-lg p-2" style={{ background: `${accent}1f`, color: accent }}>
                <Icon className="h-5 w-5" />
            </span>
            <h3
                className="font-headline text-[clamp(1.1rem,3vw,1.45rem)] font-semibold"
                style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
            >
                {title}
            </h3>
        </div>
    );
}

/**
 * Vitrina navegable de un ecosistema. A diferencia de SystemShowcase, cada
 * tarjeta es un enlace real a su ruta dinámica.
 */
export function LinkedEntityGrid({
    system,
    className,
}: {
    system: SystemKey;
    className?: string;
}) {
    const accent = SYSTEM_ACCENT[system];
    const profiles = profilesBySystem(system);
    const pages = pagesBySystem(system);
    const groups = groupsBySystem(system);
    const events = eventsBySystem(system);

    return (
        <section className={className} aria-label={`Vitrina navegable ${SYSTEM_LABEL[system]}`}>
            {/* ── Perfiles ── */}
            {profiles.length > 0 && (
                <div className="mb-8">
                    <SectionHeader icon={Users} title="Perfiles" accent={accent} />
                    <div className={GRID}>
                        {profiles.map((p) => (
                            <Link key={p.id} href={profileHref(p)} className="cursor-pointer">
                                <GlassCard variant="hover" className="h-full p-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span
                                            className="h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2"
                                            style={{ ["--tw-ring-color" as any]: `${p.accent}55` }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={p.avatar}
                                                alt={p.name}
                                                loading="lazy"
                                                onError={onImgError}
                                                className="h-full w-full object-cover"
                                            />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1 min-w-0">
                                                <p className="truncate font-semibold">{p.name}</p>
                                                {p.verified && (
                                                    <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: p.accent }} />
                                                )}
                                            </div>
                                            <p className="truncate text-xs text-muted-foreground">{p.handle}</p>
                                        </div>
                                        <ArrowUpRight className="h-4 w-4 shrink-0" style={{ color: p.accent }} />
                                    </div>
                                    <p className="mt-3 text-sm text-foreground/80 line-clamp-2">{p.bio}</p>
                                </GlassCard>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Páginas ── */}
            {pages.length > 0 && (
                <div className="mb-8">
                    <SectionHeader icon={LayoutGrid} title="Páginas y comunidades" accent={accent} />
                    <div className={GRID}>
                        {pages.map((p) => (
                            <Link key={p.id} href={pageHref(p)} className="cursor-pointer">
                                <GlassCard variant="hover" className="flex h-full flex-col overflow-hidden">
                                    <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={p.cover}
                                            alt={p.title}
                                            loading="lazy"
                                            onError={onImgError}
                                            className="absolute inset-0 h-full w-full object-cover"
                                        />
                                        {p.status && (
                                            <Badge
                                                className="absolute left-2 top-2 border-0 text-[10px] text-white"
                                                style={{ background: `${p.accent}cc` }}
                                            >
                                                {p.status}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex flex-1 flex-col p-4">
                                        <Badge
                                            variant="outline"
                                            className="mb-2 w-fit capitalize text-[10px]"
                                            style={{ borderColor: `${p.accent}55`, color: p.accent }}
                                        >
                                            {p.kind}
                                        </Badge>
                                        <h4 className="font-semibold leading-snug">{p.title}</h4>
                                        <p className="mt-1 flex-1 text-sm text-muted-foreground line-clamp-2">
                                            {p.description}
                                        </p>
                                        <span className="mt-3 flex items-center gap-1 border-t border-white/10 pt-3 text-xs text-muted-foreground">
                                            <Users className="h-3.5 w-3.5" />
                                            {p.members.toLocaleString("es-ES")} miembros
                                        </span>
                                    </div>
                                </GlassCard>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Grupos ── */}
            {groups.length > 0 && (
                <div className="mb-8">
                    <SectionHeader icon={UsersRound} title="Grupos" accent={accent} />
                    <div className={GRID}>
                        {groups.map((g) => (
                            <Link key={g.id} href={groupHref(g)} className="cursor-pointer">
                                <GlassCard variant="hover" className="flex h-full flex-col overflow-hidden">
                                    <div className="relative aspect-[3/1] w-full overflow-hidden bg-muted/40">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={g.cover}
                                            alt={g.name}
                                            loading="lazy"
                                            onError={onImgError}
                                            className="absolute inset-0 h-full w-full object-cover"
                                        />
                                    </div>
                                    <div className="flex flex-1 flex-col p-4">
                                        <div className="-mt-9 mb-2 flex items-end gap-3">
                                            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-background bg-muted">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={g.avatar}
                                                    alt=""
                                                    loading="lazy"
                                                    onError={onImgError}
                                                    className="h-full w-full object-cover"
                                                />
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className="mb-1 capitalize text-[10px]"
                                                style={{ borderColor: `${g.accent}55`, color: g.accent }}
                                            >
                                                {g.kind}
                                            </Badge>
                                        </div>
                                        <h4 className="font-semibold leading-snug">{g.name}</h4>
                                        <p className="mt-1 flex-1 text-sm text-muted-foreground line-clamp-2">
                                            {g.description}
                                        </p>
                                        <span className="mt-3 flex items-center gap-1 border-t border-white/10 pt-3 text-xs text-muted-foreground">
                                            <UsersRound className="h-3.5 w-3.5" />
                                            {g.members.toLocaleString("es-ES")}
                                        </span>
                                    </div>
                                </GlassCard>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Eventos ── */}
            {events.length > 0 && (
                <div className="mb-8">
                    <SectionHeader icon={CalendarDays} title="Eventos próximos" accent={accent} />
                    <div className={GRID}>
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
                                        <Badge
                                            className="absolute left-2 top-2 border-0 capitalize text-[10px] text-white"
                                            style={{ background: `${e.accent}cc` }}
                                        >
                                            {e.kind}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-1 flex-col gap-1.5 p-4">
                                        <h4 className="font-semibold leading-snug">{e.title}</h4>
                                        <p className="flex items-center gap-1.5 text-xs" style={{ color: GOLD }}>
                                            <CalendarDays className="h-3.5 w-3.5" />
                                            {dateFmt.format(new Date(e.startsAt))}
                                        </p>
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{e.location}</span>
                                        </p>
                                    </div>
                                </GlassCard>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

export default LinkedEntityGrid;
