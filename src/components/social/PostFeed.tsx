// src/components/social/PostFeed.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/social/PostCard";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedControls } from "@/components/social/feed-controls";
import { useFeedPrefs, useFeedFiltered } from "@/lib/social/feed-filters";
import { fetchMyProfile } from "@/lib/social/os-profiles";
import { useCafePosts } from "@/hooks/use-cafe-posts";
import { useRealtime } from "@/lib/realtime/realtime";
import {
    changeKey,
    feedTopic,
    onChange as onLiveChange,
    shouldProcessChange,
    FEED_GLOBAL_ENTITY,
    FEED_GLOBAL_TOPIC,
} from "@/lib/sync/live-signal";
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

    // (Ola 224) Guard de deduplicación: el feed recibe refetch() desde 4 fuentes
    // redundantes a propósito (useRealtime de `posts`, de `os_posts`, y los dos
    // onLiveChange del broadcast). Se agrupa con coalescing: cualquier llamada
    // dentro de 400 ms se ignora y solo se ejecuta un refetch real al final.
    const dedupeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // (Ola 224 S1F) refetch en refs para no rearmar el callback ni llamarlo desmontado
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;
    const montadoRef = useRef(true);
    useEffect(() => {
        montadoRef.current = true;
        return () => {
            montadoRef.current = false;
            if (dedupeTimer.current) clearTimeout(dedupeTimer.current);
        };
    }, []);
    const refetchDedupe = useCallback(() => {
        if (dedupeTimer.current) return;
        dedupeTimer.current = setTimeout(() => {
            dedupeTimer.current = null;
            if (montadoRef.current) refetchRef.current();
        }, 400);
    }, []);

    // ── Filtros · orden · búsqueda inteligente (Adenda 66 §7) ──
    // Preferencias POR PERFIL (perfil activo) y POR ENTORNO (grupo/perfil/canal).
    const envKey = groupId ? `group:${groupId}` : profileId ? `profile:${profileId}` : `channel:${channelKey}`;
    const { prefs, setPrefs } = useFeedPrefs(envKey);
    // Contexto propio (para "propios" y para la relevancia con Astraura).
    const [me, setMe] = useState<{ name?: string; ctx?: string }>({});
    useEffect(() => {
        let alive = true;
        fetchMyProfile()
            .then((p) => {
                if (!alive || !p) return;
                const ctx = [
                    `Perfil: ${p.displayName}.`,
                    p.bio ? `Bio: ${p.bio}.` : "",
                    p.tags?.length ? `Intereses: ${p.tags.join(", ")}.` : "",
                ]
                    .filter(Boolean)
                    .join(" ");
                setMe({ name: p.displayName, ctx });
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);
    const { visible, ranking } = useFeedFiltered(posts, prefs, { myName: me.name, profileContext: me.ctx });
    const listGap = prefs.view === "compacta" ? "space-y-2" : prefs.view === "lista" ? "space-y-3" : "space-y-6";

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
        () => refetchDedupe(),
    );

    // TIEMPO REAL (Adenda 63 §4/§8): publicaciones del OS (`os_posts`) —
    // INSERT/UPDATE/DELETE. Es la tabla donde publican los perfiles y las
    // secciones (política/educación/cultura). Camino REDUNDANTE: solo funciona
    // si `os_posts` está en la publicación `supabase_realtime`. El camino que
    // SIEMPRE funciona es el broadcast de abajo; se deduplican con la misma clave.
    useRealtime("os_posts", { event: "*" }, (payload) => {
        const row = (payload?.new ?? payload?.old) as { id?: string | null; created_at?: string | null } | null;
        if (!shouldProcessChange(changeKey(FEED_GLOBAL_TOPIC, row?.id, row?.created_at))) return;
        refetchDedupe();
    });

    // TIEMPO REAL SIN DDL (broadcast): `createPost` emite en `feed:global` y en
    // el tema de la entidad. Escuchamos el global por el canal COMPARTIDO
    // `ent:feed:global` (así llegan también las publicaciones de OTRAS cuentas,
    // no solo las de otros dispositivos míos) y el tema de esta instancia del
    // feed. No depende de ninguna migración.
    React.useEffect(() => {
        const offGlobal = onLiveChange(FEED_GLOBAL_TOPIC, () => refetchDedupe(), { entity: FEED_GLOBAL_ENTITY });
        const offChannel = onLiveChange(feedTopic(channelKey), () => refetchDedupe());
        return () => {
            offGlobal();
            offChannel();
            // (Ola 224) Limpia el temporizador pendiente de deduplicación al desmontar.
            if (dedupeTimer.current) {
                clearTimeout(dedupeTimer.current);
                dedupeTimer.current = null;
            }
        };
    }, [refetchDedupe, channelKey]);

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
        <div className="space-y-4">
            {usingFallback && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="min-w-0">{fallbackNotice}</span>
                </div>
            )}

            {/* Barra de control (solo si hay algo que filtrar/ordenar). */}
            {posts.length > 0 && (
                <FeedControls
                    prefs={prefs}
                    onChange={setPrefs}
                    total={posts.length}
                    shown={visible.length}
                    ranking={ranking}
                />
            )}

            <div className={listGap}>
                {visible.map((post) => (
                    <PostCard key={post.id} post={post} />
                ))}
            </div>

            {visible.length === 0 &&
                (posts.length === 0 ? (
                    <EmptyState
                        icon={PenSquare}
                        title="Aún no hay publicaciones"
                        description="Sé quien comparta lo primero en este espacio."
                        action={emptyCta ? (
                            <Button asChild variant="outline" size="sm" className="gap-1.5 cursor-pointer">
                                <Link href={emptyCta.href}>
                                    <PenSquare className="h-3.5 w-3.5" /> {emptyCta.label}
                                </Link>
                            </Button>
                        ) : undefined}
                    />
                ) : (
                    <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
                        <p>Ninguna publicación coincide con los filtros.</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 cursor-pointer"
                            onClick={() => setPrefs({ query: "", tags: [] })}
                        >
                            Limpiar filtros
                        </Button>
                    </div>
                ))}
        </div>
    );
}
