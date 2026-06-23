// src/app/(app)/network/culture/crear-realtime.tsx
'use client';

// -----------------------------------------------------------------------------
// Cultura · Crear + Tiempo real (ADITIVO)
// -----------------------------------------------------------------------------
// Dos piezas que enriquecen la sección Cultura de La Red sin tocar su estructura:
//   • <CrearAffordances/>  — accesos directos para CREAR: el Composer universal
//                            (/publicar) y el Lienzo / Pizarra (/pizarra).
//   • <CulturalFeedLive/>  — indicador en vivo: escucha INSERT en la tabla
//                            `posts` (useRealtime) y avisa cuando hay nuevas
//                            publicaciones culturales en la red. SSR-safe.
// No duplica el feed ni el composer: enlaza a los sistemas ya existentes.
// -----------------------------------------------------------------------------

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PenSquare, LayoutDashboard, Sparkles, Radio } from 'lucide-react';
import { useRealtime } from '@/lib/realtime/realtime';

/** Accesos directos de creación cultural: Composer (/publicar) y Lienzo (/pizarra). */
export function CrearAffordances() {
    return (
        <Card className="liquid-glass-panel border-purple-400/20 bg-gradient-to-br from-purple-500/[0.05] to-transparent">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-purple-300" />
                    <div>
                        <p className="font-semibold">Crea y comparte cultura</p>
                        <p className="text-sm text-muted-foreground">
                            Publica cualquier formato con el Composer universal o construye en el Lienzo
                            y compártelo como post — de forma inmediata o por propuesta democrática.
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button
                        asChild
                        className="gap-1.5 bg-purple-500/20 text-purple-200 border border-purple-400/40 backdrop-blur hover:bg-purple-500/30"
                    >
                        <Link href="/publicar">
                            <PenSquare className="h-4 w-4" /> Publicar
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="gap-1.5">
                        <Link href="/pizarra">
                            <LayoutDashboard className="h-4 w-4" /> Lienzo
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Indicador en vivo del feed cultural. Escucha INSERT en `posts` y muestra un
 * contador de novedades. No re-renderiza el feed (eso lo mantiene la página);
 * sólo señala actividad nueva para que el usuario refresque cuando quiera.
 */
export function CulturalFeedLive() {
    const [newCount, setNewCount] = useState(0);

    useRealtime('posts', { event: 'INSERT' }, () => {
        setNewCount((n) => n + 1);
    });

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" aria-hidden />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
                </span>
                <Radio className="h-3.5 w-3.5" />
                Feed cultural en vivo
            </span>
            {newCount > 0 ? (
                <button
                    type="button"
                    onClick={() => {
                        setNewCount(0);
                        if (typeof window !== 'undefined') window.location.reload();
                    }}
                    className="flex items-center gap-1.5 text-primary transition-colors hover:underline"
                >
                    <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
                        {newCount}
                    </Badge>
                    {newCount === 1 ? 'nueva publicación · actualizar' : 'nuevas publicaciones · actualizar'}
                </button>
            ) : (
                <span className="text-xs text-muted-foreground/70">Sin novedades</span>
            )}
        </div>
    );
}
