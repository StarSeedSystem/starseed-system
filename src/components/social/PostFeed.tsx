// src/components/social/PostFeed.tsx
"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/social/PostCard";
import { useCafePosts } from "@/hooks/use-cafe-posts";
import { Sparkles } from "lucide-react";

interface PostFeedProps {
    groupId?: string;
    profileId?: string;
    channelKey?: string;
    limit?: number;
    /** Texto del aviso cuando se muestran datos de ejemplo. */
    fallbackNotice?: string;
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
}: PostFeedProps) {
    const { posts, loading, usingFallback } = useCafePosts({
        groupId,
        profileId,
        channelKey,
        limit,
    });

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
                <div className="rounded-2xl border border-border/50 p-8 text-center text-sm text-muted-foreground">
                    Aún no hay publicaciones. ¡Sé el primero en compartir algo!
                </div>
            )}
        </div>
    );
}
