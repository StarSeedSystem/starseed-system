"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * Cultura · Hub social (Adenda "Cultura social")
 * ---------------------------------------------------------------------------
 * Convierte /network/culture en la zona más social de la red: Para ti ·
 * Siguiendo · Tendencias · Explorar · En vivo. NO duplica infraestructura:
 *
 *   · Feed real          → `@/lib/feed/network-feed` (fetchNetworkFeed, misma
 *     tabla `posts` que ya usa /network).
 *   · Algoritmo de feed   → `@/lib/feed/feed-algorithms` +
 *     `FeedAlgorithmSelector` (idénticos a /network — misma preferencia
 *     persistida, cero duplicación de lógica de ordenación).
 *   · Tarjetas            → `RichPostCard` (ya trae el contenido vivo de la
 *     Adenda "Cultura social" vía `LiveAttachment`).
 *   · Personas/grupos     → `@/lib/social/os-profiles` (searchUsers/
 *     searchGroups/recommendations), sin capa de búsqueda propia.
 *
 * Ámbito de "Cultura": posts de área `cultura`/`general`/sin área (la
 * política y la educación tienen sus propias secciones dedicadas).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TabsContent } from "@/components/ui/tabs";
import {
    Sparkles, Users2, TrendingUp, Compass, Radio, Search, Hash, LayoutGrid,
    Image as ImageIcon, Video, Music, Link as LinkIcon, Type, Loader2, UserPlus, Users as UsersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichPostCard } from "@/components/network/feed/rich-post-card";
import { FeedAlgorithmSelector } from "@/components/network/feed/feed-algorithm-selector";
import {
    fetchNetworkFeed, enrichAuthors, enrichCommentCounts, fetchMyConnectionIds, type FeedPost,
} from "@/lib/feed/network-feed";
import {
    applyFeedAlgorithm, loadFeedPreference, saveFeedPreference, sortByRelevance,
    type FeedAlgorithmId, type FeedWeights,
} from "@/lib/feed/feed-algorithms";
import {
    recommendations,
    type OsProfile, type SocialGroupHit, type UserRecommendation,
} from "@/lib/social/os-profiles";
// (Adenda 67 · P4-5) Búsqueda UNIFICADA con Typesense-primero y fallback
// automático a Supabase. Misma firma que `os-profiles`: sustitución directa.
import { searchUsers, searchGroups } from "@/lib/search/unified-search";
import { NetworkStoriesBar } from "@/components/stories/network-stories-bar";

// ───────────────────────────── Datos compartidos (una sola carga) ──────────

/** Un post pertenece al ámbito de Cultura si su área es cultura/general/sin área. */
function inCultureScope(p: FeedPost): boolean {
    return !p.area || p.area === "cultura" || p.area === "general";
}

function hasLiveAttachment(p: FeedPost): boolean {
    return Boolean(p.attachments?.some((a) => a.liveMode && a.liveMode !== "estatico"));
}

export interface CulturalPool {
    posts: FeedPost[];
    connectionIds: Set<string>;
    loading: boolean;
    reload: () => void;
}

/** Carga UNA vez el fondo de publicaciones de Cultura + mis conexiones. */
function useCulturalFeedPool(): CulturalPool {
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [connectionIds, setConnectionIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        (async () => {
            try {
                const raw = await fetchNetworkFeed({ limit: 80 });
                const withAuthors = await enrichAuthors(raw);
                const withCounts = await enrichCommentCounts(withAuthors);
                if (alive) setPosts(withCounts.filter(inCultureScope));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        void fetchMyConnectionIds().then((ids) => {
            if (alive) setConnectionIds(ids);
        });
        return () => {
            alive = false;
        };
    }, [tick]);

    return { posts, connectionIds, loading, reload: () => setTick((t) => t + 1) };
}

// ───────────────────────────── Filtro por tipo de contenido ────────────────

type ContentFilter = "todo" | "texto" | "imagen" | "video" | "audio" | "enlace" | "vivo";

const CONTENT_FILTERS: { id: ContentFilter; label: string; icon: typeof Type }[] = [
    { id: "todo", label: "Todo", icon: LayoutGrid },
    { id: "texto", label: "Texto", icon: Type },
    { id: "imagen", label: "Imagen", icon: ImageIcon },
    { id: "video", label: "Vídeo", icon: Video },
    { id: "audio", label: "Audio", icon: Music },
    { id: "enlace", label: "Enlace", icon: LinkIcon },
    { id: "vivo", label: "En vivo", icon: Radio },
];

function postContentType(p: FeedPost): ContentFilter {
    if (hasLiveAttachment(p)) return "vivo";
    const first = p.attachments?.[0];
    const kind = (first?.kind || "").toLowerCase();
    if (kind === "imagen" || kind === "video" || kind === "audio" || kind === "enlace") return kind;
    if (kind) return "todo"; // otras superficies (app/pizarra/servidor/página…): se cuentan en "Todo"
    if (p.media && p.media.length > 0) return "imagen"; // legado
    return "texto";
}

function ContentFilterBar({ value, onChange }: { value: ContentFilter; onChange: (v: ContentFilter) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {CONTENT_FILTERS.map((f) => {
                const FIcon = f.icon;
                const active = value === f.id;
                return (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => onChange(f.id)}
                        className={cn(
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                            active
                                ? "border-primary/50 bg-primary/15 text-primary"
                                : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25 hover:text-foreground",
                        )}
                    >
                        <FIcon className="h-3.5 w-3.5" /> {f.label}
                    </button>
                );
            })}
        </div>
    );
}

// ───────────────────────────── Grid masonry (medios) ───────────────────────

function MediaGridCard({ post }: { post: FeedPost }) {
    const media = post.attachments?.[0];
    const url: string | undefined = media?.thumbnail || media?.url || post.media?.[0] || undefined;
    const isVideo = (media?.kind || "").toLowerCase() === "video";
    return (
        <Link
            href={`/post/${post.postId}`}
            className="mb-4 block break-inside-avoid overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition-transform hover:scale-[1.01]"
        >
            {url ? (
                isVideo ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={url} muted playsInline className="w-full bg-black object-cover" />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={post.content?.slice(0, 60) || "Publicación"} loading="lazy" className="w-full object-cover" />
                )
            ) : (
                <div className="grid aspect-square place-items-center bg-white/[0.03] text-white/20">
                    <ImageIcon className="h-8 w-8" />
                </div>
            )}
            <div className="space-y-1 p-2.5">
                <p className="line-clamp-2 text-xs text-white/75">{post.content || "Sin descripción"}</p>
                <div className="flex items-center gap-2 text-[10px] text-white/40">
                    <span>{post.author.name}</span>
                    <span>· {post.likes} me gusta</span>
                </div>
            </div>
        </Link>
    );
}

function MasonryGrid({ posts }: { posts: FeedPost[] }) {
    return (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {posts.map((p) => (
                <MediaGridCard key={p.id} post={p} />
            ))}
        </div>
    );
}

// ───────────────────────────── Lista estándar (RichPostCard) ───────────────

function PostList({ posts, loading, emptyMessage }: { posts: FeedPost[]; loading: boolean; emptyMessage: string }) {
    if (loading) {
        return (
            <div className="space-y-6">
                {[1, 2].map((i) => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
                ))}
            </div>
        );
    }
    if (posts.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }
    return (
        <div className="space-y-6">
            {posts.map((p) => (
                <RichPostCard key={p.id} post={p} />
            ))}
        </div>
    );
}

/** Aplica el filtro por tipo de contenido; con imagen/vídeo usa grid masonry (tarjetas visuales). */
function FilterablePosts({ posts, loading, emptyMessage }: { posts: FeedPost[]; loading: boolean; emptyMessage: string }) {
    const [filter, setFilter] = useState<ContentFilter>("todo");

    const filtered = useMemo(() => {
        if (filter === "todo") return posts;
        return posts.filter((p) => postContentType(p) === filter);
    }, [posts, filter]);

    const useMasonry = filter === "imagen" || filter === "video";

    return (
        <div className="space-y-4">
            <ContentFilterBar value={filter} onChange={setFilter} />
            {loading ? (
                <PostList posts={[]} loading emptyMessage={emptyMessage} />
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-muted-foreground">
                    Nada con este filtro todavía. Prueba otro tipo de contenido.
                </div>
            ) : useMasonry ? (
                <MasonryGrid posts={filtered} />
            ) : (
                <PostList posts={filtered} loading={false} emptyMessage={emptyMessage} />
            )}
        </div>
    );
}

// ───────────────────────────── Para ti ──────────────────────────────────────

function ParaTiTab({ pool }: { pool: CulturalPool }) {
    const [algorithm, setAlgorithm] = useState<FeedAlgorithmId>("relevancia");
    const [weights, setWeights] = useState<FeedWeights>(loadFeedPreference().weights);
    const [preferredAreas, setPreferredAreas] = useState<string[]>([]);

    useEffect(() => {
        const pref = loadFeedPreference();
        setAlgorithm(pref.algorithm);
        setWeights(pref.weights);
        setPreferredAreas(pref.preferredAreas);
    }, []);

    const persist = (next: { algorithm?: FeedAlgorithmId; weights?: FeedWeights; preferredAreas?: string[] }) => {
        saveFeedPreference({
            algorithm: next.algorithm ?? algorithm,
            weights: next.weights ?? weights,
            preferredAreas: next.preferredAreas ?? preferredAreas,
        });
    };

    const posts = useMemo(
        () => applyFeedAlgorithm(pool.posts, { algorithm, weights, preferredAreas }, { connectionIds: pool.connectionIds }),
        [pool.posts, pool.connectionIds, algorithm, weights, preferredAreas],
    );

    return (
        <div className="space-y-4">
            <FeedAlgorithmSelector
                algorithm={algorithm}
                weights={weights}
                preferredAreas={preferredAreas}
                onAlgorithmChange={(id) => {
                    setAlgorithm(id);
                    persist({ algorithm: id });
                }}
                onWeightsChange={(w) => {
                    setWeights(w);
                    persist({ weights: w });
                }}
                onPreferredAreasChange={(areas) => {
                    setPreferredAreas(areas);
                    persist({ preferredAreas: areas });
                }}
            />
            <FilterablePosts
                posts={posts}
                loading={pool.loading}
                emptyMessage="Aún no hay publicaciones en Cultura. ¡Comparte la primera desde «Publicar»!"
            />
        </div>
    );
}

// ───────────────────────────── Siguiendo ────────────────────────────────────

function SiguiendoTab({ pool }: { pool: CulturalPool }) {
    const posts = useMemo(
        () => pool.posts.filter((p) => pool.connectionIds.has(p.author.id)),
        [pool.posts, pool.connectionIds],
    );

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Basado en tus conexiones reales (personas con quienes ya comentas o a quienes das «me gusta»).
            </p>
            <PostList
                posts={posts}
                loading={pool.loading}
                emptyMessage="Todavía no ves publicaciones de conexiones aquí. Comenta o da «me gusta» a alguien en Explorar para empezar a seguir su actividad."
            />
        </div>
    );
}

// ───────────────────────────── Tendencias ───────────────────────────────────

function TendenciasTab({ pool }: { pool: CulturalPool }) {
    const [activeTag, setActiveTag] = useState<string | null>(null);

    const topTags = useMemo(() => {
        const counts = new Map<string, number>();
        for (const p of pool.posts) {
            for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [pool.posts]);

    const ranked = useMemo(() => sortByRelevance(pool.posts), [pool.posts]);
    const filtered = useMemo(
        () => (activeTag ? ranked.filter((p) => p.tags.includes(activeTag)) : ranked),
        [ranked, activeTag],
    );

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground/90">
                    <TrendingUp className="h-4 w-4 text-amber-400" /> Conceptos en tendencia
                </h3>
                {topTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aún no hay suficientes etiquetas para calcular tendencias.</p>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {topTags.map(([tag, count]) => {
                            const active = activeTag === tag;
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setActiveTag(active ? null : tag)}
                                    className={cn(
                                        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                                        active
                                            ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                                            : "border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground",
                                    )}
                                >
                                    <Hash className="h-3 w-3" /> {tag}
                                    <span className="text-[10px] text-white/40">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <PostList
                posts={filtered}
                loading={pool.loading}
                emptyMessage="Sin publicaciones en tendencia todavía."
            />
        </div>
    );
}

// ───────────────────────────── Explorar ─────────────────────────────────────

function groupHref(g: SocialGroupHit): string {
    return g.kind === "grupo" ? `/grupo/${g.slug}` : `/pagina/${g.slug}`;
}

function PersonCard({ p, reason }: { p: OsProfile; reason?: string }) {
    return (
        <Link
            href={`/profile/${p.username}`}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
        >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/40 to-purple-500/40 text-sm font-bold text-white">
                {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt={p.displayName} className="h-full w-full object-cover" />
                ) : (
                    p.displayName.slice(0, 1).toUpperCase()
                )}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground/90">{p.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
                {reason && <span className="mt-0.5 block truncate text-[10px] text-cyan-300/70">{reason}</span>}
            </span>
            <UserPlus className="h-4 w-4 shrink-0 text-white/25" />
        </Link>
    );
}

function GroupCard({ g }: { g: SocialGroupHit }) {
    return (
        <Link
            href={groupHref(g)}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
        >
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-white">
                <UsersIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground/90">{g.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {g.kind === "grupo" ? "Grupo" : g.kind === "comunidad" ? "Comunidad" : "Página"} · {g.memberCount.toLocaleString()} miembros
                </span>
            </span>
        </Link>
    );
}

function ExplorarTab() {
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [users, setUsers] = useState<OsProfile[]>([]);
    const [groups, setGroups] = useState<SocialGroupHit[]>([]);
    const [recs, setRecs] = useState<UserRecommendation[]>([]);
    const [searching, setSearching] = useState(false);
    const [recsLoaded, setRecsLoaded] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        let alive = true;
        if (!debounced) {
            setUsers([]);
            setGroups([]);
            return;
        }
        setSearching(true);
        Promise.all([searchUsers(debounced), searchGroups(debounced)])
            .then(([u, g]) => {
                if (!alive) return;
                setUsers(u);
                setGroups(g);
            })
            .finally(() => alive && setSearching(false));
        return () => {
            alive = false;
        };
    }, [debounced]);

    useEffect(() => {
        let alive = true;
        void recommendations().then((r) => {
            if (alive) {
                setRecs(r);
                setRecsLoaded(true);
            }
        });
        return () => {
            alive = false;
        };
    }, []);

    const showingResults = debounced.length > 0;

    return (
        <div className="space-y-5">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busca personas, páginas, grupos o comunidades…"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-foreground placeholder:text-white/30 focus:border-primary/40 focus:outline-none"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/30" />}
            </div>

            {showingResults ? (
                <div className="space-y-5">
                    <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            Personas {users.length > 0 && `(${users.length})`}
                        </h3>
                        {users.length === 0 && !searching ? (
                            <p className="text-sm text-muted-foreground">Sin personas para «{debounced}».</p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {users.map((u) => (
                                    <PersonCard key={u.userId} p={u} />
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            Páginas, grupos y comunidades {groups.length > 0 && `(${groups.length})`}
                        </h3>
                        {groups.length === 0 && !searching ? (
                            <p className="text-sm text-muted-foreground">Sin resultados para «{debounced}».</p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {groups.map((g) => (
                                    <GroupCard key={`${g.kind}:${g.slug}`} g={g} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    <div>
                        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Quizá te guste
                        </h3>
                        {!recsLoaded ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {[1, 2].map((i) => (
                                    <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
                                ))}
                            </div>
                        ) : recs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Añade etiquetas a tu perfil o únete a un grupo para recibir sugerencias razonadas de afinidad.
                            </p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {recs.map((r) => (
                                    <PersonCard key={r.userId} p={r} reason={r.reason} />
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">Escribe arriba para buscar páginas, grupos y comunidades por nombre o etiqueta.</p>
                </div>
            )}
        </div>
    );
}

// ───────────────────────────── En vivo ──────────────────────────────────────

function EnVivoTab({ pool }: { pool: CulturalPool }) {
    const live = useMemo(() => pool.posts.filter(hasLiveAttachment), [pool.posts]);
    return (
        <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className="h-3.5 w-3.5 text-rose-300" /> Publicaciones con edición colaborativa activa o canal en vivo del autor.
            </p>
            <PostList
                posts={live}
                loading={pool.loading}
                emptyMessage="Aún no hay contenido en vivo. Crea uno adjuntando una pizarra/app en modo «Edición en tiempo real» o «Canal en vivo» desde el Composer."
            />
        </div>
    );
}

// ───────────────────────────── Export: pestañas + catálogo ─────────────────

export const CULTURE_SOCIAL_TABS: { value: string; label: string; icon: typeof Sparkles }[] = [
    { value: "para-ti", label: "Para ti", icon: Sparkles },
    { value: "siguiendo", label: "Siguiendo", icon: Users2 },
    { value: "tendencias", label: "Tendencias", icon: TrendingUp },
    { value: "explorar", label: "Explorar", icon: Compass },
    { value: "en-vivo", label: "En vivo", icon: Radio },
];

/**
 * Renderiza las 5 `TabsContent` del hub social (Para ti/Siguiendo/Tendencias/
 * Explorar/En vivo). Debe montarse DENTRO de un `<Tabs>` (mismo árbol que las
 * pestañas Mapa/Agenda ya existentes en la página) — comparte UNA sola carga
 * del fondo de publicaciones entre las pestañas que lo necesitan.
 */
export function CultureSocialTabs() {
    const pool = useCulturalFeedPool();

    return (
        <>
            {/* Historias activas de toda la red (reales, en Supabase) — siempre visible sobre el feed de Cultura. */}
            <NetworkStoriesBar variant="public" title="Historias" className="mb-4" />

            <TabsContent value="para-ti" className="animate-in fade-in-50 duration-500">
                <ParaTiTab pool={pool} />
            </TabsContent>
            <TabsContent value="siguiendo" className="animate-in fade-in-50 duration-500">
                <SiguiendoTab pool={pool} />
            </TabsContent>
            <TabsContent value="tendencias" className="animate-in fade-in-50 duration-500">
                <TendenciasTab pool={pool} />
            </TabsContent>
            <TabsContent value="explorar" className="animate-in fade-in-50 duration-500">
                <ExplorarTab />
            </TabsContent>
            <TabsContent value="en-vivo" className="animate-in fade-in-50 duration-500">
                <EnVivoTab pool={pool} />
            </TabsContent>
        </>
    );
}

export default CultureSocialTabs;
