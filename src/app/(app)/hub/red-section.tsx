// src/app/(app)/hub/red-section.tsx
'use client';

/**
 * ── Sección "Red · Nodos" del Hub de Conexiones ──────────────────────────────
 *
 * Fusiona el antiguo apartado "Nodos" (La Red) DENTRO del Hub de Conexiones.
 * Esta sección es el hogar único de todo lo relativo a la red: el Panorama
 * (feed y nodos), la Política (gobernanza), la Educación (biblioteca/cursos) y
 * la Cultura (multiverso y eventos).
 *
 * Diseño additivo y no destructivo: NO duplica las páginas existentes, sino que
 * las reúne y enlaza. Todas las rutas antiguas (`/network`, `/network/politics`,
 * `/network/education`, `/network/culture`) siguen funcionando y se abren desde
 * aquí como sub-páginas del Hub. Estética "Crystal Liquid Glass", en español.
 */

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Network, Scale, School, Palette, ArrowUpRight, Sparkles, Radio,
    Landmark, BookOpen, Map, Boxes, Vote, CalendarDays, Users2, Server,
} from 'lucide-react';

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
                                    Integrado en el Hub
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground max-w-2xl text-balance leading-relaxed">
                                Todo lo relativo a la red —{' '}
                                <span className="text-cyan-300/90">Panorama</span>,{' '}
                                <span className="text-amber-300/90">política</span>,{' '}
                                <span className="text-emerald-300/90">educación</span> y{' '}
                                <span className="text-purple-300/90">cultura</span>{' '}
                                — reunido en un solo lugar. El Hub es ahora el hogar de los Nodos.
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

            {/* ── Estado de la Red en vivo (defensivo: sin datos aún muestra "—") ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Nodos', value: '—', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                    { label: 'Sinapsis', value: '—', color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/20' },
                    { label: 'Propuestas activas', value: '—', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
                    { label: 'Seeds en flujo', value: '—', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                ].map((stat) => (
                    <div key={stat.label} className={cn('rounded-2xl p-4 text-center border shadow-inner backdrop-blur', stat.bg)}>
                        <div className={cn('text-2xl font-black font-headline', stat.color)}>{stat.value}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* ── Nodos temáticos: Panorama, Política, Educación, Cultura ── */}
            <div>
                <div className="section-label mb-3 px-1">Explora los nodos de la red</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RED_NODES.map((node) => (
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
                                        <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
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
                    ))}
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
