// src/hooks/use-cafe-posts.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
    type CafePostRow,
    type NormalizedPost,
    normalizeCafePost,
    getFallbackPosts,
} from "@/lib/social-posts";

interface UseCafePostsOptions {
    /** Filtra por grupo (cafe_posts.group_id). */
    groupId?: string;
    /** Filtra por perfil autor (cafe_posts.profile_id). */
    profileId?: string;
    /** Identificador único del canal realtime. */
    channelKey?: string;
    /** Límite de filas. */
    limit?: number;
}

interface UseCafePostsResult {
    posts: NormalizedPost[];
    loading: boolean;
    usingFallback: boolean;
    refetch: () => void;
}

/**
 * Lee publicaciones reales de `cafe_posts` ordenadas por fecha desc, se suscribe a
 * cambios en tiempo real y degrada a datos de ejemplo si no hay sesión/datos o si
 * Supabase no está configurado. SSR-safe: todo ocurre dentro de useEffect.
 */
export function useCafePosts(options: UseCafePostsOptions = {}): UseCafePostsResult {
    const { groupId, profileId, channelKey = "global", limit = 30 } = options;

    const [posts, setPosts] = useState<NormalizedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);
    const mountedRef = useRef(true);

    const fetchPosts = useCallback(async () => {
        try {
            const supabase = createClient();
            let query = supabase
                .from("cafe_posts")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(limit);

            if (groupId) query = query.eq("group_id", groupId);
            if (profileId) query = query.eq("profile_id", profileId);

            const { data, error } = await query;
            if (!mountedRef.current) return;

            if (error || !data || data.length === 0) {
                // Sin datos reales: estado vacío real (sin datos de ejemplo).
                setPosts([]);
                setUsingFallback(false);
            } else {
                setPosts((data as CafePostRow[]).map(normalizeCafePost));
                setUsingFallback(false);
            }
        } catch {
            if (!mountedRef.current) return;
            setPosts([]);
            setUsingFallback(false);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [groupId, profileId, limit]);

    useEffect(() => {
        mountedRef.current = true;
        setLoading(true);
        fetchPosts();

        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
        try {
            const supabase = createClient();
            channel = supabase
                .channel(`posts-${channelKey}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "cafe_posts" },
                    () => {
                        fetchPosts();
                    },
                )
                .subscribe();
        } catch {
            // Realtime no disponible: seguimos con la carga puntual.
        }

        return () => {
            mountedRef.current = false;
            if (channel) {
                try {
                    createClient().removeChannel(channel);
                } catch {
                    /* noop */
                }
            }
        };
    }, [fetchPosts, channelKey]);

    return { posts, loading, usingFallback, refetch: fetchPosts };
}
