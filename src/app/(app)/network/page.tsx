"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RichPostCard } from "@/components/network/feed/rich-post-card";
import { FeedAlgorithmSelector } from "@/components/network/feed/feed-algorithm-selector";
import { TiltCard } from "@/components/ui/tilt-card";
import { Button } from "@/components/ui/button";
import { Send, Image as ImageIcon, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import {
    fetchNetworkFeed,
    enrichAuthors,
    enrichCommentCounts,
    fetchMyConnectionIds,
    type FeedPost,
} from "@/lib/feed/network-feed";
import {
    applyFeedAlgorithm,
    loadFeedPreference,
    saveFeedPreference,
    type FeedAlgorithmId,
    type FeedWeights,
} from "@/lib/feed/feed-algorithms";
import { publish } from "@/lib/publish/publish";
import { getCurrentUserId } from "@/lib/os-social";
import MentionInput from "@/components/mentions/mention-input";
import { createClient } from "@/utils/supabase/client";

export default function NetworkPage() {
    const [rawPosts, setRawPosts] = useState<FeedPost[]>([]);
    const [connectionIds, setConnectionIds] = useState<Set<string>>(new Set());
    const [newPostContent, setNewPostContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);

    // ── Preferencia de algoritmo (persistida, migrada por versión) ──
    const [algorithm, setAlgorithm] = useState<FeedAlgorithmId>("relevancia");
    const [weights, setWeights] = useState<FeedWeights>(loadFeedPreference().weights);
    const [preferredAreas, setPreferredAreas] = useState<string[]>([]);
    // Propuestas activas REALES (proposals con status = 'open'); null = sin dato → "—".
    const [activeProposals, setActiveProposals] = useState<number | null>(null);

    useEffect(() => {
        const pref = loadFeedPreference();
        setAlgorithm(pref.algorithm);
        setWeights(pref.weights);
        setPreferredAreas(pref.preferredAreas);
    }, []);

    useEffect(() => {
        loadFeed();
        void fetchMyConnectionIds().then(setConnectionIds);
        // Contador REAL de propuestas activas (mismo criterio que el Hub / Política).
        // Defensivo: cualquier fallo deja el valor en null → "—" honesto.
        (async () => {
            try {
                const supabase = createClient();
                const { count, error } = await supabase
                    .from("proposals")
                    .select("*", { count: "exact", head: true })
                    .eq("status", "open");
                if (!error) setActiveProposals(count ?? 0);
            } catch {
                /* sin dato → "—" */
            }
        })();
    }, []);

    // Conceptos distintos en circulación (etiquetas únicas del feed) — dato REAL,
    // sustituye al antiguo "Seeds en Flujo" que no tenía fuente de datos.
    const conceptCount = useMemo(() => {
        const s = new Set<string>();
        for (const p of rawPosts) for (const t of p.tags) s.add(t);
        return s.size;
    }, [rawPosts]);

    const loadFeed = async () => {
        try {
            const posts = await fetchNetworkFeed();
            const withAuthors = await enrichAuthors(posts);
            const withCounts = await enrichCommentCounts(withAuthors);
            setRawPosts(withCounts);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const persistPreference = useCallback(
        (next: { algorithm?: FeedAlgorithmId; weights?: FeedWeights; preferredAreas?: string[] }) => {
            const merged = {
                algorithm: next.algorithm ?? algorithm,
                weights: next.weights ?? weights,
                preferredAreas: next.preferredAreas ?? preferredAreas,
            };
            saveFeedPreference(merged);
        },
        [algorithm, weights, preferredAreas],
    );

    const handleAlgorithmChange = (id: FeedAlgorithmId) => {
        setAlgorithm(id);
        persistPreference({ algorithm: id });
    };
    const handleWeightsChange = (w: FeedWeights) => {
        setWeights(w);
        persistPreference({ weights: w });
    };
    const handlePreferredAreasChange = (areas: string[]) => {
        setPreferredAreas(areas);
        persistPreference({ preferredAreas: areas });
    };

    // El feed se reordena en CLIENTE sobre los mismos datos ya cargados: cambiar
    // de algoritmo no vuelve a pedir la red, sólo reordena.
    const posts = useMemo(
        () =>
            applyFeedAlgorithm(
                rawPosts,
                { algorithm, weights, preferredAreas },
                { connectionIds },
            ),
        [rawPosts, algorithm, weights, preferredAreas, connectionIds],
    );

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPostContent.trim() || publishing) return;

        setPublishing(true);
        const uid = await getCurrentUserId();
        if (!uid) {
            toast.error("Inicia sesión para publicar en la red.");
            setPublishing(false);
            return;
        }

        const promise = publish({
            type: "texto",
            format: "texto-plano",
            fromProfiles: [uid],
            destinations: [{ kind: "red", id: "feed", label: "Feed público" }],
            content: { body: newPostContent.trim() },
        });

        toast.promise(promise, {
            loading: "Transmitiendo a la Red StarSeed...",
            success: "¡Señal transmitida con éxito!",
            error: "No se pudo transmitir",
        });

        try {
            const res = await promise;
            if (res.ok) {
                setNewPostContent("");
                await loadFeed();
            }
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="w-full mx-auto max-w-6xl px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] space-y-[clamp(1.5rem,3vw,3rem)] animate-in fade-in duration-500 pb-24">
            {/* El "Cerebro" (gráfica viva) se trasladó al Exocórtex / Astraura AI (/agent → pestaña Cerebro). */}

            {/* Feed Section */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-[clamp(1rem,2vw,2rem)] relative z-10">

                {/* Main Feed */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Create Post Input */}
                    <TiltCard intensity={5} className="w-full">
                        <form onSubmit={handleCreatePost} className="p-4 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg group focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 p-0.5 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
                                    <div className="w-full h-full rounded-full bg-background flex items-center justify-center text-xs font-bold text-foreground">ME</div>
                                </div>
                                <div className="flex-1 space-y-3">
                                    <MentionInput
                                        value={newPostContent}
                                        onChange={setNewPostContent}
                                        placeholder="Difunde un concepto o señal a la red… Usa @ para mencionar y # para etiquetar."
                                        rows={3}
                                    />
                                    <div className="flex items-center justify-between border-t border-border/10 pt-3">
                                        <div className="flex gap-2">
                                            <Button type="button" variant="ghost" size="icon" className="text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-full h-10 w-10 btn-pill cursor-pointer">
                                                <ImageIcon className="w-4 h-4" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="text-pink-500 hover:text-pink-400 hover:bg-pink-500/10 rounded-full h-10 w-10 btn-pill cursor-pointer">
                                                <LinkIcon className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <Button type="submit" disabled={!newPostContent.trim() || publishing} className="btn-pill bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 backdrop-blur-md px-6 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)] cursor-pointer">
                                            Difundir <Send className="w-3 h-3 ml-2" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </TiltCard>

                    {/* Selector de algoritmo de feed */}
                    <FeedAlgorithmSelector
                        algorithm={algorithm}
                        weights={weights}
                        preferredAreas={preferredAreas}
                        onAlgorithmChange={handleAlgorithmChange}
                        onWeightsChange={handleWeightsChange}
                        onPreferredAreasChange={handlePreferredAreasChange}
                    />

                    {/* Posts List */}
                    <div className="space-y-6">
                        {loading ? (
                            // Skeleton Loader
                            [1, 2].map(i => (
                                <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse border border-border/10" />
                            ))
                        ) : posts.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-muted-foreground">
                                Aún no hay publicaciones en tu red. ¡Comparte la primera!
                            </div>
                        ) : (
                            posts.map(post => (
                                <RichPostCard key={post.id} post={post} />
                            ))
                        )}
                    </div>
                </div>

                {/* Trending Panel (Right Side) */}
                <div className="hidden lg:block space-y-4">
                    {/* Live Network Stats */}
                    <TiltCard intensity={8}>
                        <div className="p-5 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg">
                            <h3 className="section-label mb-4">Red en Vivo</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: "Publicaciones", value: rawPosts.length > 0 ? String(rawPosts.length) : "—", color: "text-cyan-500 dark:text-cyan-400", bg: "bg-cyan-500/10" },
                                    { label: "Conexiones", value: connectionIds.size > 0 ? String(connectionIds.size) : "—", color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-500/10" },
                                    { label: "Propuestas Activas", value: activeProposals != null ? String(activeProposals) : "—", color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10" },
                                    { label: "Conceptos", value: conceptCount > 0 ? String(conceptCount) : "—", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                                ].map(stat => (
                                    <div key={stat.label} className={`rounded-xl p-3 text-center ${stat.bg} border border-border/5`}>
                                        <div className={`text-xl font-bold font-headline ${stat.color}`}>{stat.value}</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TiltCard>

                    {/* Trending Concepts */}
                    <TiltCard intensity={6} className="sticky top-24">
                        <div className="p-5 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg">
                            <h3 className="section-label mb-4">Conceptos en Tendencia</h3>
                            <div className="space-y-3">
                                {(() => {
                                    const counts = new Map<string, number>();
                                    for (const p of rawPosts) {
                                        for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
                                    }
                                    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
                                    if (top.length === 0) {
                                        return (
                                            <p className="text-sm text-muted-foreground">
                                                Aún no hay etiquetas en tendencia. Aparecerán a medida que la red publique.
                                            </p>
                                        );
                                    }
                                    return top.map(([tagName, count]) => (
                                        <div key={tagName} className="flex items-center justify-between group cursor-pointer p-2 hover:bg-white/5 dark:hover:bg-white/5 rounded-lg transition-colors -mx-2">
                                            <span className="text-foreground/80 group-hover:text-primary transition-colors text-sm font-medium">
                                                #{tagName}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">{count}</span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </TiltCard>

                    {/* Suggested Connections */}
                    <TiltCard intensity={6}>
                        <div className="p-5 rounded-2xl liquid-glass-panel border-white/10 dark:border-white/5 shadow-lg">
                            <h3 className="section-label mb-4">Conexiones Sugeridas</h3>
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Aún no hay sugerencias. A medida que interactúes con la red (comentarios, me
                                    gusta) aparecerán aquí las voces más afines.
                                </p>
                                <Link href="/hub" className="inline-flex text-xs font-semibold text-primary hover:underline">
                                    Explorar el Hub Social →
                                </Link>
                            </div>
                        </div>
                    </TiltCard>
                </div>

            </section>
        </div>
    );
}
