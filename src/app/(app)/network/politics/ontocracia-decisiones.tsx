// src/app/(app)/network/politics/ontocracia-decisiones.tsx
'use client';

// -----------------------------------------------------------------------------
// Política · Ontocracia / Decisiones (ADITIVO)
// -----------------------------------------------------------------------------
// Tarjeta que enlaza La Red (Política) con el motor de Ontocracia (/decisiones).
// Lista las propuestas democráticas recientes (tabla `proposals`) en vivo —vía
// `useRealtimeRows('proposals', …)`— con su estado, y ofrece dos accesos:
//   • "Ver todas" → /decisiones (panel completo de gobernanza).
//   • "Proponer"  → deep-link prefilled a /decisiones?nueva=1&scope=… que abre
//                   el composer de propuestas listo para escribir.
// No duplica el motor: sólo surfacea + enlaza. RLS se aplica: el cliente sólo
// recibe las propuestas que puede leer.
// -----------------------------------------------------------------------------

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Landmark, ArrowUpRight, Plus, Vote, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRealtimeRows } from '@/lib/realtime/realtime';
import { buildProposalLink } from '@/lib/governance/links';
import type { Proposal, ProposalStatus } from '@/lib/governance/types';

// Ámbitos relevantes para la sección Política de La Red. RLS filtra el resto.
const POLITICAL_SCOPES = ['global', 'community', 'page', 'group', 'account'];

// Etiqueta + estilo por estado de propuesta (mismo lenguaje visual del sistema).
const STATUS_META: Record<string, { label: string; className: string }> = {
    open: { label: 'En votación', className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300' },
    passed: { label: 'Aprobada', className: 'border-sky-400/40 bg-sky-500/10 text-sky-300' },
    executed: { label: 'Ejecutada', className: 'border-sky-400/40 bg-sky-500/10 text-sky-300' },
    rejected: { label: 'Rechazada', className: 'border-red-400/40 bg-red-500/10 text-red-300' },
    failed: { label: 'Fallida', className: 'border-red-400/40 bg-red-500/10 text-red-300' },
    expired: { label: 'Expirada', className: 'border-zinc-400/30 bg-zinc-500/10 text-zinc-300' },
};

function statusMeta(status: ProposalStatus | string) {
    return STATUS_META[String(status)] ?? {
        label: String(status),
        className: 'border-white/15 bg-white/5 text-muted-foreground',
    };
}

// Carga las propuestas recientes (best-effort, SSR-safe). RLS recorta el set.
async function loadRecentProposals(): Promise<Proposal[]> {
    if (typeof window === 'undefined') return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('proposals')
            .select('*')
            .in('scope', POLITICAL_SCOPES)
            .order('created_at', { ascending: false })
            .limit(6);
        if (error) return [];
        return (data as Proposal[]) ?? [];
    } catch {
        return [];
    }
}

export function OntocraciaDecisionesCard() {
    // Lista viva: la carga inicial + INSERT/UPDATE/DELETE en tiempo real se
    // aplican en memoria por el hook. `idKey` por defecto es 'id'.
    const { rows, loading } = useRealtimeRows<Proposal>('proposals', loadRecentProposals);

    // Deep-link al composer prefilled (ámbito global por defecto para iniciativas
    // de red). El motor /decisiones lee estos parámetros y abre el composer.
    const proponerHref = buildProposalLink('', {
        scope: 'global',
        title: '',
        description: '',
    });

    return (
        <Card className="liquid-glass-panel border-primary/20">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="font-headline text-lg flex items-center gap-2">
                            <Landmark className="h-5 w-5 text-primary" />
                            Ontocracia · Decisiones
                        </CardTitle>
                        <CardDescription>
                            Propuestas democráticas en curso en la red. Cada decisión sólo se ejecuta al
                            cumplir el formato (tiempo, participación y umbral).
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <Link href="/decisiones">
                                Ver todas <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                        <Button
                            asChild
                            size="sm"
                            className="gap-1.5 bg-primary/20 text-primary border border-primary/50 backdrop-blur hover:bg-primary/30 glow-sm"
                        >
                            <Link href={proponerHref}>
                                <Plus className="h-3.5 w-3.5" /> Proponer
                            </Link>
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando decisiones en vivo…
                    </div>
                ) : rows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
                        <Vote className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
                        <p className="text-sm text-muted-foreground">
                            Aún no hay decisiones democráticas activas que puedas ver.
                        </p>
                        <Button asChild variant="link" size="sm" className="mt-1 text-primary">
                            <Link href={proponerHref}>Propón la primera iniciativa →</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {rows.map((p) => {
                            const meta = statusMeta(p.status);
                            return (
                                <Link
                                    key={p.id}
                                    href="/decisiones"
                                    className="group flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-all hover:border-primary/40 hover:bg-white/[0.05]"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{p.title}</p>
                                        {p.description && (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {p.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Badge variant="outline" className={meta.className}>
                                            {meta.label}
                                        </Badge>
                                        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
