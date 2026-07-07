"use client";

/*
 * NetworkStoriesBar — fila de Historias activas (reales, en red). Dos modos:
 *   · variant="public" → historias públicas de toda la red (fila arriba del
 *     feed de Cultura), agrupadas por autor (una burbuja por persona).
 *   · variant="mine"   → mis historias activas (cualquier audiencia), una
 *     burbuja por historia (fila en /galeria).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchMyActiveStories, fetchPublicActiveStories, type NetworkStory } from "@/lib/stories/network-stories";
import { NetworkStoryViewer } from "./network-story-viewer";

export interface NetworkStoriesBarProps {
    variant: "mine" | "public";
    title?: string;
    className?: string;
}

interface Bubble {
    key: string;
    label: string;
    first: NetworkStory;
    startIndex: number;
}

export function NetworkStoriesBar({ variant, title, className }: NetworkStoriesBarProps) {
    const [stories, setStories] = useState<NetworkStory[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);

    const reload = useCallback(() => {
        setLoading(true);
        const fetcher = variant === "mine" ? fetchMyActiveStories : fetchPublicActiveStories;
        void fetcher().then((list) => {
            setStories(list);
            setLoading(false);
        });
    }, [variant]);

    useEffect(() => {
        reload();
    }, [reload]);

    const bubbles = useMemo<Bubble[]>(() => {
        if (variant === "mine") {
            return stories.map((s, i) => ({ key: s.postId, label: new Date(s.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }), first: s, startIndex: i }));
        }
        const seen = new Map<string, Bubble>();
        stories.forEach((s, i) => {
            if (!seen.has(s.authorId)) seen.set(s.authorId, { key: s.authorId, label: s.authorName, first: s, startIndex: i });
        });
        return Array.from(seen.values());
    }, [stories, variant]);

    if (!loading && stories.length === 0) return null;

    return (
        <section className={cn("relative", className)}>
            {title && <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
                {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-muted/20" />)}
                {bubbles.map((b) => (
                    <button key={b.key} onClick={() => setViewerIndex(b.startIndex)} className="flex shrink-0 cursor-pointer flex-col items-center gap-1">
                        <span className="grid size-16 place-items-center overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-black/40 p-[2px]">
                            {b.first.mediaKind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={b.first.url} alt="" className="h-full w-full rounded-xl object-cover" />
                            ) : (
                                // eslint-disable-next-line jsx-a11y/media-has-caption
                                <video src={b.first.url} muted className="h-full w-full rounded-xl object-cover" />
                            )}
                        </span>
                        <span className="max-w-16 truncate text-[10px] font-medium text-foreground/80">{b.label}</span>
                    </button>
                ))}
            </div>

            {viewerIndex !== null && (
                <NetworkStoryViewer stories={stories} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} onChanged={reload} />
            )}
        </section>
    );
}

export default NetworkStoriesBar;
