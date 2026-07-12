'use client';

// ════════════════════════════════════════════════════════════════
// NetworkFeedWidget — mini-previsualizaciones del feed REAL de la Red
// (lib/feed/network-feed.ts → tabla `posts`, el mismo Lienzo Universal
// que /network). Sin datos simulados: vacío honesto si aún no hay
// publicaciones. Refresco suave cada 45s (dato vivo, no intrusivo).
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Layers, Heart, MessageSquare, Image as ImageIcon } from 'lucide-react';
import { WidgetShell, WidgetEmptyState, timeAgo } from '../kit';
import { useAppearance } from '@/context/appearance-context';
import { fetchNetworkFeed, type FeedPost } from '@/lib/feed/network-feed';

const ACCENT = '#3B82F6';
const POLL_MS = 45_000;

function initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || 'S';
}

export function NetworkFeedWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;
    const [posts, setPosts] = useState<FeedPost[] | null>(null);

    useEffect(() => {
        let alive = true;
        const load = () => { void fetchNetworkFeed({ limit: 18 }).then((rows) => { if (alive) setPosts(rows); }); };
        load();
        const t = setInterval(load, POLL_MS);
        return () => { alive = false; clearInterval(t); };
    }, []);

    return (
        <WidgetShell
            title="Feed de la Red"
            subtitle="Lienzo Universal"
            icon={Layers}
            accent={ACCENT}
            live
            expandHref="/network"
            connections={[{ label: 'Explorar red', href: '/network', color: ACCENT, icon: Layers }]}
        >
            {(size) => {
                if (posts === null) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (posts.length === 0) {
                    return (
                        <WidgetEmptyState
                            icon={Layers}
                            title="Aún no hay publicaciones"
                            message="Sé el primero en compartir algo en la Red."
                            actionLabel="Publicar"
                            actionHref="/publish"
                            accent={ACCENT}
                        />
                    );
                }

                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const max = size.vTier === 'expanded' ? 8 : size.vTier === 'compact' ? 3 : 5;

                if (micro) {
                    const top = posts[0];
                    return (
                        <Link href="/network" className="h-full flex items-center gap-2.5 px-1 cursor-pointer">
                            <span className="shrink-0 grid place-items-center size-9 rounded-full text-[10px] font-black text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}88)` }}>
                                {initials(top.author.name)}
                            </span>
                            <p className="min-w-0 flex-1 text-[10px] font-semibold text-muted-foreground/80 line-clamp-2">{top.content || 'Publicación multimedia'}</p>
                        </Link>
                    );
                }

                return (
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar pt-1">
                        <div className="flex flex-col gap-1.5">
                            {posts.slice(0, max).map((p, i) => {
                                const thumb = p.media?.[0];
                                return (
                                    <motion.div key={p.id}
                                        initial={animate ? { opacity: 0, y: 6 } : false}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: animate ? i * 0.05 : 0 }}
                                        className="rounded-xl border border-border/40 bg-white/[0.02]"
                                    >
                                        <Link href="/network" className="flex items-start gap-2.5 px-2.5 py-2 cursor-pointer">
                                            {thumb ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={thumb} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg object-cover border border-border/30" />
                                            ) : (
                                                <span className="shrink-0 grid place-items-center size-9 rounded-full text-[10px] font-black text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}88)` }}>
                                                    {initials(p.author.name)}
                                                </span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-bold truncate">{p.author.name}</span>
                                                    <span className="text-[9px] text-muted-foreground/50 shrink-0 tabular-nums">{timeAgo(Date.parse(p.createdAt) || Date.now())}</span>
                                                </div>
                                                <p className="text-[11px] text-foreground/80 leading-snug line-clamp-2 mt-0.5">{p.content || (thumb ? 'Publicación multimedia' : '')}</p>
                                                <div className="flex items-center gap-3 mt-1 text-[9px] font-bold text-muted-foreground/50">
                                                    <span className="inline-flex items-center gap-0.5"><Heart className="size-2.5" />{p.likes}</span>
                                                    <span className="inline-flex items-center gap-0.5"><MessageSquare className="size-2.5" />{p.commentsCount}</span>
                                                    {(p.media?.length ?? 0) > 1 && <span className="inline-flex items-center gap-0.5"><ImageIcon className="size-2.5" />{p.media!.length}</span>}
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default NetworkFeedWidget;
