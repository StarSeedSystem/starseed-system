// src/app/(app)/hub/red-section.tsx
'use client';

/**
 * ── Sección "Red · Nodos" del Hub de Conexiones ──────────────────────────────
 *
 * SECCIÓN PRINCIPAL del Hub (Adenda 66 §8): es la pestaña por defecto al entrar.
 * Reúne todo lo relativo a la red: el Panorama (feed y nodos), la Política
 * (gobernanza), la Educación (biblioteca/cursos) y la Cultura (multiverso y
 * eventos).
 *
 * SOLO DATOS REALES (Adenda 66 §8): los contadores en vivo (nodos, conexiones,
 * propuestas activas, publicaciones) se leen de Supabase (`os_pages`, `os_groups`,
 * `os_events`, `proposals`, `posts` + conexiones reales del usuario). Sin datos →
 * "—" honesto (nunca cifras inventadas). El "Pulso de la Red" muestra las últimas
 * publicaciones REALES del feed, con estado vacío honesto + CTA.
 *
 * Diseño additivo y no destructivo: NO duplica las páginas existentes, las reúne
 * y enlaza. Todas las rutas antiguas (`/network`, `/network/politics`,
 * `/network/education`, `/network/culture`) siguen funcionando. Estética "Crystal
 * Liquid Glass", en español.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Network, Scale, School, Palette, ArrowUpRight, Sparkles, Radio,
    Landmark, BookOpen, Map, Boxes, Vote, CalendarDays, Users2, Server,
    Share2, Loader2,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { fetchMyConnectionIds, fetchNetworkFeed, enrichAuthors, type FeedPost } from '@/lib/feed/network-feed';
import { ConnectionsHub } from '@/components/hub/connections-hub';

// ─────────────────────────────────────────────────────────────────────────────
// Datos REALES en vivo de la Red (contadores + pulso del feed).
// ─────────────────────────────────────────────────────────────────────────────

interface RedLiveStats {
    loading: boolean;
    entities: number | null;    // os_pages + os_groups + os_events
    connections: number | null; // conexiones reales del usuario
    proposals: number | null;   // proposals con status = 'open'
    posts: number | null;       // publicaciones (posts, sin comentarios)
    pages: number | null;
    events: number | null;
}

const EMPTY_STATS: RedLiveStats = {
    loading: true,
    entities: null,
    connections: null,
    proposals: null,
    posts: null,
    pages: null,
    events: null,
};

/** Cuenta filas de una tabla (head + count exacto). Nunca lanza: null si falla. */
async function countRows(
    supabase: ReturnType<typeof createClient>,
    table: string,
    refine?: (q: any) => any,
): Promise<number | null> {
    try {
        let q: any = supabase.from(table).select('*', { count: 'exact', head: true });
        if (refine) q = refine(q);
        const { count, error } = await q;
        if (error) return null;
        return count ?? 0;
    } catch {
        return null;
    }
}

function useRedLiveStats(): RedLiveStats {
    const [stats, setStats] = useState<RedLiveStats>(EMPTY_STATS);

    useEffect(() => {
        let alive = true;
        (async () => {
            const supabase = createClient();
            const [pages, groups, events, proposals, posts, connIds] = await Promise.all([
                countRows(supabase, 'os_pages'),
                countRows(supabase, 'os_groups'),
                countRows(supabase, 'os_events'),
                countRows(supabase, 'proposals', (q) => q.eq('status', 'open')),
                countRows(supabase, 'posts', (q) => q.neq('type', 'comment')),
                fetchMyConnectionIds().catch(() => new Set<string>()),
            ]);
            if (!alive) return;
            const allNull = pages == null && groups == null && events == null;
            const entities = allNull ? null : (pages ?? 0) + (groups ?? 0) + (events ?? 0);
            setStats({
                loading: false,
                entities,
                connections: connIds.size,
                proposals,
                posts,
                pages,
                events,
            });
        })();
        return () => {
            alive = false;
        };
    }, []);

    return stats;
}

function useRedPulse(): { posts: FeedPost[]; loading: boolean } {
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const raw = await fetchNetworkFeed({ limit: 3 });
                const withAuthors = await enrichAuthors(raw);
                if (alive) setPosts(withAuthors);
            } catch {
                if (alive) setPosts([]);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    return { posts, loading };
}

/** Formatea un contador real: "—" honesto mientras carga o si no hay dato. */
function fmt(v: number | null, loading: boolean): string {
    if (loading) return '···';
    if (v == null) return '—';
    return v.toLocaleString();
}

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Date.now() - then;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
}

// ── Nodos temáticos de la Red (cada uno enlaza a su ruta real ya existente) ──
interface RedNode {
    id: string;
    label: string;
    href: string;
    tagline: string;
    description: string;
    icon: React.ReactNode;
    accent: string; // clases de color (borde/fondo/hover)
    glow: string;   // sombra tokenizada
    chips: { label: string; icon: React.ReactNode }[];
    /** Clave del contador real a mostrar (se resuelve con las stats en vivo). */
    countKey?: 'posts' | 'proposals' | 'events';
    countLabel?: string;
}

const RED_NODES: RedNode[] = [
    {
        id: 'panorama',
        label: 'Red · Panorama',
        href: '/network',
        tagline: 'El latido vivo',
        description:
            'Feed social del ecosistema, nodos y sinapsis en tiempo real. El pulso de toda la red StarSeed.',
        icon: <Network className="w-6 h-6" />,
        accent: 'border-cyan-500/30 hover:border-cyan-400/50 bg-cyan-500/[0.06]',
        glow: 'shadow-[0_0_30px_rgba(34,211,238,0.12)]',
        chips: [
            { label: 'Feed', icon: <Radio className="w-3 h-3" /> },
            { label: 'Nodos', icon: <Boxes className="w-3 h-3" /> },
        ],
        countKey: 'posts',
        countLabel: 'publicaciones',
    },
    {
        id: 'politics',
        label: 'Política',
        href: '/network/politics',
        tagline: 'Ontocracia en acción',
        description:
            'Democracia directa, propuestas, votación segura y mapa de gobernanza: Entidades Federativas y Partidos.',
        icon: <Scale className="w-6 h-6" />,
        accent: 'border-amber-500/30 hover:border-amber-400/50 bg-amber-500/[0.06]',
        glow: 'shadow-[0_0_30px_rgba(245,158,11,0.12)]',
        chips: [
            { label: 'Gobernanza', icon: <Landmark className="w-3 h-3" /> },
            { label: 'Votos', icon: <Vote className="w-3 h-3" /> },
        ],
        countKey: 'proposals',
        countLabel: 'propuestas activas',
    },
    {
        id: 'education',
        label: 'Educación',
        href: '/network/education',
        tagline: 'Biblioteca universal',
        description:
            'Aprendizaje inmersivo, cursos, artículos y conocimiento abierto con mentoría híbrida humano + IA.',
        icon: <School className="w-6 h-6" />,
        accent: 'border-emerald-500/30 hover:border-emerald-400/50 bg-emerald-500/[0.06]',
        glow: 'shadow-[0_0_30px_rgba(16,185,129,0.12)]',
        chips: [
            { label: 'Cursos', icon: <BookOpen className="w-3 h-3" /> },
            { label: 'Conocimiento', icon: <Sparkles className="w-3 h-3" /> },
        ],
    },
    {
        id: 'culture',
        label: 'Cultura',
        href: '/network/culture',
        tagline: 'Multiverso y expresión',
        description:
            'Arte, Multiverso, feed cultural en vivo y eventos físicos coordinados desde el mapa de la comunidad.',
        icon: <Palette className="w-6 h-6" />,
        accent: 'border-purple-500/30 hover:border-purple-400/50 bg-purple-500/[0.06]',
        glow: 'shadow-[0_0_30px_rgba(168,85,247,0.12)]',
        chips: [
            { label: 'Multiverso', icon: <Map className="w-3 h-3" /> },
            { label: 'Eventos', icon: <CalendarDays className="w-3 h-3" /> },
        ],
        countKey: 'events',
        countLabel: 'eventos',
    },
];

// ── Accesos rápidos adicionales que también viven "en la red" ──
const RED_SHORTCUTS: { label: string; href: string; icon: React.ReactNode; hint: string }[] = [
    { label: 'Red 3D · VR/AR', href: '/red-3d', icon: <Boxes className="w-4 h-4" />, hint: 'Grafo inmersivo' },
    { label: 'Partidos', href: '/hub?tab=parties', icon: <Users2 className="w-4 h-4" />, hint: 'Acción colectiva' },
    { label: 'Votos', href: '/hub?tab=vote-management', icon: <Vote className="w-4 h-4" />, hint: 'Gestión de voto' },
    { label: 'Calendario', href: '/hub?tab=calendar', icon: <CalendarDays className="w-4 h-4" />, hint: 'Red y eventos' },
    { label: 'Servidores de Apps', href: '/servidores-apps', icon: <Server className="w-4 h-4" />, hint: 'Apps en vivo compartidas' },
];

export function HubRedSection() {
    const stats = useRedLiveStats();
    const { posts: pulse, loading: pulseLoading } = useRedPulse();

    const nodeCount = (node: RedNode): number | null => {
        if (!node.countKey) return null;
        return stats[node.countKey];
    };

    return (
        <div className="space-y-8 animate-in fade-in-50 duration-500">
            {/* ── Encabezado de la sección ── */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.05] via-purple-500/[0.04] to-amber-500/[0.04] p-6 shadow-inner">
                <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" aria-hidden />
                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.15)] shrink-0">
                            <Network className="w-7 h-7" />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl font-black tracking-tight font-headline text-foreground/95">
                                    La Red · Nodos
                                </h2>
                                <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-cyan-500/30 text-cyan-300 bg-cyan-500/5">
                                    Sección principal
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground max-w-2xl text-balance leading-relaxed">
                                Todo lo relativo a la red —{' '}
                                <span className="text-cyan-300/90">Panorama</span>,{' '}
                                <span className="text-amber-300/90">política</span>,{' '}
                                <span className="text-emerald-300/90">educación</span> y{' '}
                                <span className="text-purple-300/90">cultura</span>{' '}
                                — reunido en un solo lugar. El Hub es el hogar de los Nodos.
                            </p>
                        </div>
                    </div>
                    <Button asChild variant="outline" className="btn-pill border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 shrink-0">
                        <Link href="/network">
                            Abrir Panorama <ArrowUpRight className="w-4 h-4 ml-1.5" />
                        </Link>
                    </Button>
                </div>
            </div>

            {/* ── Estado de la Red en vivo (contadores REALES de Supabase; "—" si no hay) ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { key: 'entities', label: 'Nodos', value: stats.entities, icon: <Boxes className="w-4 h-4" />, color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                    { key: 'connections', label: 'Conexiones', value: stats.connections, icon: <Share2 className="w-4 h-4" />, color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/20' },
                    { key: 'proposals', label: 'Propuestas activas', value: stats.proposals, icon: <Vote className="w-4 h-4" />, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
                    { key: 'posts', label: 'Publicaciones', value: stats.posts, icon: <Radio className="w-4 h-4" />, color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                ].map((stat) => (
                    <div key={stat.key} className={cn('rounded-2xl p-4 text-center border shadow-inner backdrop-blur', stat.bg)}>
                        <div className={cn('mb-1.5 inline-flex items-center justify-center rounded-lg bg-white/[0.04] p-1.5', stat.color)}>
                            {stat.icon}
                        </div>
                        <div className={cn('text-2xl font-black font-headline', stat.color)}>{fmt(stat.value, stats.loading)}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* ── Pulso de la Red: últimas publicaciones REALES (feed vivo) ── */}
            <div>
                <div className="section-label mb-3 px-1 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-cyan-300" /> Pulso de la Red
                </div>
                <Card className="liquid-glass-panel border-white/10">
                    <CardContent className="p-4">
                        {pulseLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizando el feed de la red…
                            </div>
                        ) : pulse.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-6 text-center">
                                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-muted-foreground">
                                    <Radio className="w-6 h-6" />
                                </div>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    Aún no hay publicaciones en la red. Difunde la primera señal y aparecerá aquí en vivo.
                                </p>
                                <Button asChild size="sm" className="btn-pill">
                                    <Link href="/network">
                                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Publicar en la Red
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {pulse.map((p) => (
                                    <Link
                                        key={p.id}
                                        href="/network"
                                        className="group/pulse flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-cyan-500/30"
                                    >
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-purple-500/30 text-[11px] font-bold text-foreground/90">
                                            {(p.author.name || 'S')[0]?.toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-foreground truncate">
                                                    {p.author.name || 'Ciudadano StarSeed'}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(p.createdAt)}</span>
                                            </div>
                                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                {p.content || 'Publicación sin texto (adjuntos).'}
                                            </p>
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 shrink-0 opacity-0 transition-all group-hover/pulse:opacity-100 group-hover/pulse:text-cyan-300" />
                                    </Link>
                                ))}
                                <Link href="/network" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline">
                                    Ver todo el feed <ArrowUpRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Conexiones de la Red (Adenda 76 · G3): explorador social enriquecido
                — tarjetas por sistema/tipo, filtros, buscador y "Mis conexiones". ── */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.015] p-4 sm:p-5 shadow-inner">
                <ConnectionsHub />
            </div>

            {/* ── Nodos temáticos: Panorama, Política, Educación, Cultura ── */}
            <div>
                <div className="section-label mb-3 px-1">Explora los nodos de la red</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RED_NODES.map((node) => {
                        const count = nodeCount(node);
                        return (
                            <Link key={node.id} href={node.href} className="group block">
                                <Card className={cn(
                                    'liquid-glass-panel h-full border transition-all duration-300 overflow-hidden relative',
                                    node.accent, node.glow,
                                )}>
                                    <div className="absolute -bottom-10 -right-10 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity pointer-events-none">
                                        <div className="[&>svg]:w-32 [&>svg]:h-32">{node.icon}</div>
                                    </div>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-foreground/90 group-hover:scale-110 transition-transform">
                                                    {node.icon}
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base font-headline group-hover:text-primary transition-colors">
                                                        {node.label}
                                                    </CardTitle>
                                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                                                        {node.tagline}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Contador REAL de la sección (si hay dato) o "—" honesto. */}
                                            {node.countKey && (
                                                <Badge variant="outline" className="shrink-0 text-[10px] border-white/15 bg-white/[0.04] text-foreground/80">
                                                    {count == null ? '—' : count.toLocaleString()} {node.countLabel}
                                                </Badge>
                                            )}
                                            {!node.countKey && (
                                                <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="relative space-y-3">
                                        <CardDescription className="text-sm leading-relaxed text-balance">
                                            {node.description}
                                        </CardDescription>
                                        <div className="flex flex-wrap gap-1.5">
                                            {node.chips.map((chip) => (
                                                <span
                                                    key={chip.label}
                                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full"
                                                >
                                                    {chip.icon} {chip.label}
                                                </span>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* ── Accesos rápidos de la red ── */}
            <div>
                <div className="section-label mb-3 px-1">Accesos rápidos</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {RED_SHORTCUTS.map((s) => (
                        <Link key={s.label} href={s.href} className="group">
                            <Card className="liquid-glass-panel border-white/10 hover:border-primary/40 transition-all duration-300 h-full">
                                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                                    <div className="p-2 rounded-xl bg-white/[0.05] border border-white/10 text-foreground/80 group-hover:text-primary group-hover:scale-110 transition-all">
                                        {s.icon}
                                    </div>
                                    <span className="text-xs font-bold text-foreground/90 leading-tight">{s.label}</span>
                                    <span className="text-[10px] text-muted-foreground">{s.hint}</span>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default HubRedSection;
