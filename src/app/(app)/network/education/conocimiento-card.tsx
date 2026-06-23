// src/app/(app)/network/education/conocimiento-card.tsx
'use client';

// -----------------------------------------------------------------------------
// Educación · Red de Conocimiento (ADITIVO)
// -----------------------------------------------------------------------------
// Tarjeta destacada que conecta la sección Educación de La Red con el Módulo 3
// (Red de Conocimiento, /conocimiento): categorías jerárquicas, temas
// transversales y la galaxia 3D navegable. No duplica el módulo: lo enlaza y
// explica cómo se relaciona con los cursos y temas de esta página.
// -----------------------------------------------------------------------------

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Network, ArrowUpRight, Workflow, Tags, Globe2 } from 'lucide-react';

export function ConocimientoCard() {
    return (
        <Card className="liquid-glass-panel border-amber-400/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="font-headline text-xl flex items-center gap-2">
                            <Network className="h-6 w-6 text-amber-300" />
                            Red de Conocimiento
                        </CardTitle>
                        <CardDescription className="mt-1 max-w-2xl">
                            La estructura completa del saber de StarSeed vive en el Módulo de Conocimiento:
                            categorías jerárquicas, temas vinculados a varias ramas y una galaxia 3D navegable.
                            Las categorías y temas que ves aquí abajo son ventanas a esa misma red.
                        </CardDescription>
                    </div>
                    <Button
                        asChild
                        className="gap-1.5 bg-amber-500/20 text-amber-200 border border-amber-400/40 backdrop-blur hover:bg-amber-500/30"
                    >
                        <Link href="/conocimiento">
                            Explorar la red <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                    <Link
                        href="/conocimiento"
                        className="group flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-all hover:border-amber-400/40 hover:bg-white/[0.05]"
                    >
                        <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div>
                            <p className="text-sm font-medium">Lista (árbol)</p>
                            <p className="text-xs text-muted-foreground">Categorías y sub-categorías jerárquicas.</p>
                        </div>
                    </Link>
                    <Link
                        href="/conocimiento"
                        className="group flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-all hover:border-amber-400/40 hover:bg-white/[0.05]"
                    >
                        <Tags className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div>
                            <p className="text-sm font-medium">Mapa Conceptual 2D</p>
                            <p className="text-xs text-muted-foreground">Temas transversales y sus vínculos.</p>
                        </div>
                    </Link>
                    <Link
                        href="/conocimiento"
                        className="group flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-all hover:border-amber-400/40 hover:bg-white/[0.05]"
                    >
                        <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div>
                            <p className="text-sm font-medium">Red 3D</p>
                            <p className="text-xs text-muted-foreground">Galaxia navegable del conocimiento.</p>
                        </div>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
