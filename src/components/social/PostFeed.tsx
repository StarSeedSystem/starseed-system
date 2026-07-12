// src/components/social/PostFeed.tsx
"use client";

import React from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/social/PostCard";
import { useCafePosts } from "@/hooks/use-cafe-posts";
import { useRealtime } from "@/lib/realtime/realtime";
import { Sparkles, PenSquare } from "lucide-react";

interface PostFeedProps {
    groupId?: string;
    profileId?: string;
    channelKey?: string;
    limit?: number;
    /** Texto del aviso cuando se muestran datos de ejemplo. */
    fallbackNotice?: string;
    /** CTA del estado vacío (p. ej. "Crea tu primera publicación" → /crear). */
    emptyCta?: { label: string; href: string };
}

/**
 * Feed de publicaciones conectado a `cafe_posts` con realtime. Muestra skeletons
 * mientras carga, las tarjetas reales (PostCard) y un aviso elegante cuando se
 * está usando contenido de ejemplo (sin sesión o sin datos).
 */
export function PostFeed({
    groupId,
    profileId,
    channelKey = "feed",
    limit = 30,
    fallbackNotice = "Mostrando publicaciones de ejemplo. Inicia sesión para ver el flujo real de la red.",
    emptyCta,
}: PostFeedProps) {
    const { posts, loading, usingFallback, refetch } = useCafePosts({
        groupId,
        profileId,
        channelKey,
        limit,
    });

    // TIEMPO REAL: re-cargamos el feed cuando cambia la tabla `posts` para que
    // nuevas publicaciones y ediciones aparezcan en vivo (el hook ya escucha
    // `cafe_posts`; esto cubre además la tabla `posts`). SSR-safe vía el hook.
    useRealtime(
        "posts",
        {
            event: "*",
            filter: groupId
                ? `group_id=eq.${groupId}`
                : profileId
                  ? `profile_id=eq.${profileId}`
                  : undefined,
        },
        () => refetch(),
    );

    // TIEMPO REAL (Adenda 63 §4/§8): publicaciones del OS (`os_posts`) —
    // INSERT/UPDATE/DELETE. Es la tabla donde publican los perfiles y las
    // secciones (política/educación/cultura); así las publicaciones nuevas
    // aparecen en vivo en todos los dispositivos sin recargar.
    useRealtime("os_posts", { event: "*" }, () => refetch());

    if (loading) {
        return (
            <div className="space-y-6">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-2xl border border-border/50 p-[clamp(0.85rem,2.5vw,1.25rem)] space-y-3"
                    >
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                            <div className="space-y-2 flex-1">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-3 w-1/4" />
                            </div>
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-40 w-full rounded-xl" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {usingFallback && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="min-w-0">{fallbackNotice}</span>
                </div>
            )}
            {posts.map((post) => (
                <PostCard key={post.id} post={post} />
            ))}
            {posts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
                    <p>Aún no hay publicaciones. ¡Sé el primero en compartir algo!</p>
                    {emptyCta && (
                        <Button asChild variant="outline" size="sm" className="mt-4 gap-1.5 cursor-pointer">
                            <Link href={emptyCta.href}>
                                <PenSquare className="h-3.5 w-3.5" /> {emptyCta.label}
                            </Link>
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
