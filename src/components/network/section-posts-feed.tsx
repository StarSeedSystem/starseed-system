// src/components/network/section-posts-feed.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Feed VIVO de una sección de La Red (Adenda 63 §8): muestra las publicaciones
// reales de `os_posts` dirigidas a la cola canónica de la sección (entity_type
// "page" + slug politica/educacion/cultura/biblioteca — las que crean la Zona
// de Publicación /crear y /publish). Realtime incluido vía useOsPosts
// (sync-manager sobre os_posts). Estado vacío honesto con CTA a /crear.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/social/PostCard";
import { useOsPosts } from "@/hooks/use-os-entities";
import { SECTION_SLUGS } from "@/components/creation/creation-config";
import { PenSquare, Radio } from "lucide-react";

export type SectionFeedDest = keyof typeof SECTION_SLUGS;

export function SectionPostsFeed({
    dest,
    title = "Publicaciones de la sección",
    limit,
}: {
    dest: SectionFeedDest;
    title?: string;
    /** Recorta la lista (por defecto muestra todo lo cargado, máx. 30). */
    limit?: number;
}) {
    const { posts, loading } = useOsPosts("page", SECTION_SLUGS[dest]);
    const shown = typeof limit === "number" ? posts.slice(0, limit) : posts;
    const createHref = `/crear?area=publicar&dest=${dest}`;

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" aria-hidden />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
                    </span>
                    <Radio className="h-3.5 w-3.5" />
                    {title} ({shown.length})
                </span>
                <Button asChild variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs cursor-pointer">
                    <Link href={createHref}>
                        <PenSquare className="h-3.5 w-3.5" /> Publicar
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[0, 1].map((i) => (
                        <div key={i} className="space-y-3 rounded-2xl border border-border/50 p-4">
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-3 w-1/4" />
                                </div>
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/5" />
                        </div>
                    ))}
                </div>
            ) : shown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center text-sm text-muted-foreground">
                    <p>Aún no hay publicaciones en esta sección.</p>
                    <Button asChild variant="outline" size="sm" className="mt-4 gap-1.5 cursor-pointer">
                        <Link href={createHref}>
                            <PenSquare className="h-3.5 w-3.5" /> Crea la primera publicación
                        </Link>
                    </Button>
                </div>
            ) : (
                <div className="space-y-4">
                    {shown.map((post) => (
                        <PostCard key={post.id} post={post} />
                    ))}
                </div>
            )}
        </section>
    );
}
