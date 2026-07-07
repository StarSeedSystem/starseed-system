// src/app/(app)/hub/discover-section.tsx
'use client';

/**
 * ── Sección "Descubre" del Hub de Conexiones ─────────────────────────────────
 *
 * Rediseño ADITIVO del Hub: tarjetas reales de páginas/comunidades, grupos y
 * eventos (conectadas a Supabase vía `useOsPages`/`useOsGroups`/`useOsEvents`,
 * con el mismo fallback elegante a datos de ejemplo que ya usa el resto del
 * OS) con ACCIONES RÁPIDAS (seguir/unirse/asistir + enlace a mensaje/página),
 * FILTROS por tipo y área, una sección "Sugeridos" razonada (explica POR QUÉ
 * se sugiere cada entidad) y estados vacíos bonitos.
 *
 * No sustituye "Mis Páginas" ni "Grupos" (que siguen mostrando lo suyo tal
 * cual); se inserta ANTES de ese contenido como un bloque de descubrimiento.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
    Users, Users2, CalendarDays, Search, Compass, MessageSquare,
    UserPlus, UserCheck, CalendarCheck, Sparkles, Globe, Landmark,
} from 'lucide-react';
import { useOsPages, useOsGroups, useOsEvents, useFollow, useMembership, useAttendance } from '@/hooks/use-os-entities';
import type { OsPage, OsGroup, OsEvent } from '@/lib/os-social';
import { openComposer } from '@/lib/share/bridge';

type DiscoverKind = 'pagina' | 'grupo' | 'comunidad' | 'evento';

interface DiscoverCard {
    id: string;
    kind: DiscoverKind;
    slug: string;
    name: string;
    typeLabel: string;
    description: string;
    memberCount?: number;
    avatarUrl?: string;
    href: string;
    tags: string[];
    /** Por qué se sugiere (solo se rellena para la sección "Sugeridos"). */
    reason?: string;
}

const KIND_META: Record<DiscoverKind, { label: string; icon: typeof Users; accent: string }> = {
    pagina: { label: 'Página', icon: Globe, accent: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
    comunidad: { label: 'Comunidad', icon: Users2, accent: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
    grupo: { label: 'Grupo', icon: Users, accent: 'text-purple-300 border-purple-500/30 bg-purple-500/10' },
    evento: { label: 'Evento', icon: CalendarDays, accent: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
};

function pageToCard(p: OsPage): DiscoverCard {
    const kind: DiscoverKind = p.kind === 'comunidad' ? 'comunidad' : 'pagina';
    return {
        id: `pagina-${p.slug}`,
        kind,
        slug: p.slug,
        name: p.name,
        typeLabel: KIND_META[kind].label,
        description: p.description,
        memberCount: p.memberCount,
        avatarUrl: p.avatarUrl,
        href: `/pagina/${p.slug}`,
        tags: p.tags,
    };
}

function groupToCard(g: OsGroup): DiscoverCard {
    return {
        id: `grupo-${g.slug}`,
        kind: 'grupo',
        slug: g.slug,
        name: g.name,
        typeLabel: KIND_META.grupo.label,
        description: g.description,
        memberCount: g.memberCount,
        avatarUrl: g.avatarUrl,
        href: `/pagina/${g.slug}`,
        tags: g.tags,
    };
}

function eventToCard(e: OsEvent): DiscoverCard {
    return {
        id: `evento-${e.slug}`,
        kind: 'evento',
        slug: e.slug,
        name: e.title,
        typeLabel: KIND_META.evento.label,
        description: e.description,
        memberCount: e.attendeeCount,
        href: `/evento/${e.slug}`,
        tags: e.tags,
    };
}

/** Botón de mensaje directo, compartido por los tres tipos de acción rápida. */
function MessageButton({ card }: { card: DiscoverCard }) {
    // Abre el Compositor Universal con destino "mensaje" hacia esta entidad (no
    // existe una superficie de mensajería dedicada todavía; reutiliza el mismo
    // puente `openComposer` que usa el resto del OS en vez de enlazar a una
    // ruta inexistente).
    const sendMessage = () => {
        openComposer({
            type: 'mixto',
            destinations: [{ kind: 'mensaje', id: card.slug, label: card.name }],
            content: { title: `Para ${card.name}` },
        });
    };
    return (
        <button
            type="button"
            onClick={sendMessage}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
            title="Enviar mensaje"
        >
            <MessageSquare className="w-3.5 h-3.5" />
        </button>
    );
}

const primaryBtnClass = (active: boolean) =>
    cn(
        'btn-pill h-8 cursor-pointer text-xs font-semibold',
        active && 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    );

/** Acciones rápidas de páginas/comunidades: Seguir + mensaje. Un único hook real. */
function FollowActions({ card }: { card: DiscoverCard }) {
    const follow = useFollow(card.slug);
    const Icon = follow.active ? UserCheck : UserPlus;
    return (
        <div className="flex items-center gap-2">
            <Button size="sm" variant={follow.active ? 'outline' : 'default'} className={primaryBtnClass(follow.active)} onClick={() => void follow.toggle()}>
                <Icon className="w-3.5 h-3.5 mr-1.5" /> {follow.active ? 'Siguiendo' : 'Seguir'}
            </Button>
            <MessageButton card={card} />
        </div>
    );
}

/** Acciones rápidas de grupos: Unirse + mensaje. */
function MembershipActions({ card }: { card: DiscoverCard }) {
    const membership = useMembership(card.slug);
    const Icon = membership.active ? UserCheck : UserPlus;
    return (
        <div className="flex items-center gap-2">
            <Button size="sm" variant={membership.active ? 'outline' : 'default'} className={primaryBtnClass(membership.active)} onClick={() => void membership.toggle()}>
                <Icon className="w-3.5 h-3.5 mr-1.5" /> {membership.active ? 'Miembro' : 'Unirse'}
            </Button>
            <MessageButton card={card} />
        </div>
    );
}

/** Acciones rápidas de eventos: Asistir + mensaje. */
function AttendanceActions({ card }: { card: DiscoverCard }) {
    const attendance = useAttendance(card.slug);
    return (
        <div className="flex items-center gap-2">
            <Button size="sm" variant={attendance.active ? 'outline' : 'default'} className={primaryBtnClass(attendance.active)} onClick={() => void attendance.toggle()}>
                <CalendarCheck className="w-3.5 h-3.5 mr-1.5" /> {attendance.active ? 'Asistiré' : 'Asistir'}
            </Button>
            <MessageButton card={card} />
        </div>
    );
}

/** Enruta a las acciones rápidas según el tipo de tarjeta (un solo hook real por tarjeta). */
function QuickActions({ card }: { card: DiscoverCard }) {
    if (card.kind === 'evento') return <AttendanceActions card={card} />;
    if (card.kind === 'grupo') return <MembershipActions card={card} />;
    return <FollowActions card={card} />;
}

function DiscoverCardView({ card, reasonBadge }: { card: DiscoverCard; reasonBadge?: boolean }) {
    const meta = KIND_META[card.kind];
    return (
        <Card className="liquid-glass-panel border-white/10 hover:border-primary/30 transition-all duration-300 h-full overflow-hidden">
            <CardContent className="p-4 flex flex-col gap-3 h-full">
                <div className="flex items-start gap-3">
                    <Link href={card.href} className="shrink-0">
                        <Avatar className="h-11 w-11 ring-2 ring-white/10">
                            <AvatarImage src={card.avatarUrl} />
                            <AvatarFallback className="bg-primary/15 text-primary font-bold">{card.name[0]}</AvatarFallback>
                        </Avatar>
                    </Link>
                    <div className="min-w-0 flex-1">
                        <Link href={card.href} className="cursor-pointer">
                            <p className="font-semibold text-sm text-foreground truncate hover:text-primary transition-colors">{card.name}</p>
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', meta.accent)}>
                                {meta.label}
                            </Badge>
                            {typeof card.memberCount === 'number' && card.memberCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Users className="w-3 h-3" /> {card.memberCount.toLocaleString()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {card.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{card.description}</p>
                )}

                {reasonBadge && card.reason && (
                    <div className="flex items-start gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
                        <span className="text-[11px] text-primary/90 leading-snug">{card.reason}</span>
                    </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-1">
                    <QuickActions card={card} />
                </div>
            </CardContent>
        </Card>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center flex flex-col items-center gap-3">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-muted-foreground">
                <Compass className="w-6 h-6" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">{label}</p>
        </div>
    );
}

/** Razona por qué se sugiere una entidad (heurística simple y honesta, sin IA de red). */
function reasonFor(card: DiscoverCard, index: number): string {
    if (card.tags.length > 0) {
        return `Comparte etiquetas contigo: ${card.tags.slice(0, 2).join(', ')}.`;
    }
    if (typeof card.memberCount === 'number' && card.memberCount > 0) {
        return `Activa: ${card.memberCount.toLocaleString()} ${card.kind === 'evento' ? 'asistentes confirmados' : 'miembros'}.`;
    }
    if (index === 0) return 'Recién publicada en la red — sé de los primeros en unirte.';
    return 'Parte del ecosistema StarSeed que aún no exploras.';
}

export function HubDiscoverSection({ focus }: { focus: 'paginas' | 'grupos' }) {
    const { data: pages, loading: pagesLoading } = useOsPages();
    const { data: groups, loading: groupsLoading } = useOsGroups();
    const { data: events, loading: eventsLoading } = useOsEvents();

    const [typeFilter, setTypeFilter] = useState<'todos' | DiscoverKind>('todos');
    const [query, setQuery] = useState('');

    const allCards: DiscoverCard[] = useMemo(() => {
        const pageCards = pages.map(pageToCard);
        const groupCards = focus === 'grupos' ? groups.map(groupToCard) : [];
        const eventCards = events.map(eventToCard);
        return [...pageCards, ...groupCards, ...eventCards];
    }, [pages, groups, events, focus]);

    const loading = pagesLoading || (focus === 'grupos' && groupsLoading) || eventsLoading;

    const filtered = useMemo(() => {
        return allCards.filter((c) => {
            const typeOk = typeFilter === 'todos' || c.kind === typeFilter;
            const q = query.trim().toLowerCase();
            const searchOk = !q || c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q));
            return typeOk && searchOk;
        });
    }, [allCards, typeFilter, query]);

    const suggested = useMemo(() => {
        return [...allCards]
            .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
            .slice(0, 3)
            .map((c, i) => ({ ...c, reason: reasonFor(c, i) }));
    }, [allCards]);

    const availableKinds: DiscoverKind[] = focus === 'grupos'
        ? ['grupo', 'comunidad', 'evento']
        : ['pagina', 'comunidad', 'evento'];

    return (
        <div className="space-y-6 mb-8">
            {/* Cabecera + filtros */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                        <Compass className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-foreground/90">Descubre</h3>
                        <p className="text-[11px] text-muted-foreground">Comunidades, grupos y eventos reales de la red</p>
                    </div>
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar por nombre o etiqueta…"
                        className="w-full h-9 rounded-xl border border-white/10 bg-black/20 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setTypeFilter('todos')}
                    className={cn(
                        'inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        typeFilter === 'todos' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25',
                    )}
                >
                    <Landmark className="w-3 h-3" /> Todos
                </button>
                {availableKinds.map((k) => {
                    const meta = KIND_META[k];
                    return (
                        <button
                            key={k}
                            onClick={() => setTypeFilter(k)}
                            className={cn(
                                'inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                                typeFilter === k ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25',
                            )}
                        >
                            <meta.icon className="w-3 h-3" /> {meta.label}s
                        </button>
                    );
                })}
            </div>

            {/* Sugeridos razonados */}
            {!loading && suggested.length > 0 && (
                <div>
                    <div className="section-label mb-3 px-1 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" /> Sugeridos para ti
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {suggested.map((card) => (
                            <DiscoverCardView key={card.id} card={card} reasonBadge />
                        ))}
                    </div>
                </div>
            )}

            {/* Resultado filtrado */}
            <div>
                <div className="section-label mb-3 px-1">
                    {typeFilter === 'todos' ? 'Explorar todo' : `Explorar ${KIND_META[typeFilter].label.toLowerCase()}s`}
                </div>
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-36 rounded-2xl bg-muted/20 animate-pulse border border-border/10" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        label={
                            query
                                ? `Sin resultados para "${query}". Prueba con otro término.`
                                : 'Aún no hay entidades de este tipo en la red. Sé el primero en crear una.'
                        }
                    />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map((card) => (
                            <DiscoverCardView key={card.id} card={card} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default HubDiscoverSection;
