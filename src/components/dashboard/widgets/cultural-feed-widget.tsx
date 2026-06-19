'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, ChevronRight, Sparkles, Heart, Bookmark, ChevronLeft, Filter } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { FeedItem } from "@/lib/widget-data";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/entity-links";
import { postsBySystem, picsumCover, diceBearAvatar } from "@/data/sample-entities";

// ════════════════════════════════════════════════════════════════
// CulturalFeedWidget — corriente cultural de la red (obras, eventos,
// manifiestos). Lee creaciones reales de la comunidad (`cafe_posts`
// del proyecto unificado) como corriente cultural viva, con conteo
// total. Realtime: suscripción a `cafe_posts` (postgres_changes). Si
// no hay datos o falla, cae con elegancia a "common.feed" simulado
// o a postsBySystem('cultural') como último recurso.
// Animaciones stagger con framer-motion + avatares + thumbnails.
// ════════════════════════════════════════════════════════════════
const KIND_COLOR: Record<string, string> = {
    obra: "#ec4899", propuesta: "#f59e0b", debate: "#a855f7",
    misión: "#10b981", evento: "#38bdf8",
    elixir: "#10b981", receta: "#f59e0b", // tipos reales del Café
};

interface CafePostRow {
    id: string;
    kind: string | null;
    branch: string | null;
    title: string | null;
    body: string | null;
    author_name: string | null;
    created_at: string | null;
}

// Resonancia determinista derivada de id + recencia (0.50..0.97).
function derivedResonance(id: string, createdAt: string | null): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const base = 0.55 + (h % 1000) / 1000 * 0.4;
    const ageDays = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000 : 30;
    const recency = Math.max(0, 1 - ageDays / 45) * 0.1;
    return Math.min(0.97, base + recency);
}

function mapCafeFeed(rows: CafePostRow[]): FeedItem[] {
    return rows.map((r, i) => ({
        id: r.id ?? `cafe-feed-${i}`,
        title: r.title ?? "Nueva creación del Café",
        author: [r.author_name, r.branch].filter(Boolean).join(" · ") || "Comunidad StarSeed",
        kind: r.kind ?? "obra",
        ts: r.created_at ? new Date(r.created_at).getTime() : Date.now() - i * 3_600_000,
        resonance: derivedResonance(r.id ?? String(i), r.created_at),
    }));
}

/** Fallback: convierte SamplePost al shape de FeedItem */
function mapSamplePosts(): FeedItem[] {
    return postsBySystem("cultural").map((p, i) => ({
        id: p.id,
        title: p.title ?? p.body.slice(0, 60),
        author: p.authorName,
        kind: p.kind ?? "obra",
        ts: Date.now() - i * 7_200_000,
        resonance: derivedResonance(p.id, null),
    }));
}

const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

// ── Variantes de animación ────────────────────────────────────────
const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i: number) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.06, duration: 0.22, ease: "easeOut" },
    }),
    exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

export function CulturalFeedWidget() {
    const { data: mockData, loading } = useWidgetData("common.feed", { refreshMs: 7000 });
    const supabase = useMemo(() => createClient(), []);
    const [realData, setRealData] = useState<FeedItem[] | null>(null);
    const [total, setTotal] = useState<number | null>(null);

    const reload = useCallback(async () => {
        try {
            const [rowsRes, countRes] = await Promise.all([
                supabase.from("cafe_posts")
                    .select("id, kind, branch, title, body, author_name, created_at")
                    .order("created_at", { ascending: false }).limit(12),
                supabase.from("cafe_posts").select("id", { count: "exact", head: true }),
            ]);
            if (rowsRes.error) throw rowsRes.error;
            const mapped = mapCafeFeed((rowsRes.data ?? []) as CafePostRow[]);
            setRealData(mapped.length ? mapped : null);
            if (!countRes.error && typeof countRes.count === "number") setTotal(countRes.count);
        } catch {
            setRealData(null);
        }
    }, [supabase]);

    useEffect(() => {
        let active = true;
        void (async () => { if (active) await reload(); })();
        const ch = supabase
            .channel("w-cultural-feed")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .subscribe();
        return () => { active = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const hasReal = realData !== null;
    // Tres niveles de fallback: real → mock → sample
    const data = realData ?? mockData ?? mapSamplePosts();

    const [likes, setLikes] = useState<Record<string, boolean>>({});
    const [saves, setSaves] = useState<Record<string, boolean>>({});
    const [kindFilter, setKindFilter] = useState<string | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);

    const kinds = useMemo(() => Array.from(new Set((data ?? []).map((i) => i.kind))), [data]);
    const openItem = openId ? (data ?? []).find((i) => i.id === openId) ?? null : null;

    return (
        <WidgetShell
            title="Corriente Cultural"
            subtitle={hasReal
                ? (total !== null ? `${INT_ES.format(total)} obras · en vivo` : "Creaciones · en vivo")
                : "Obras · eventos · manifiestos"}
            icon={Palette}
            accent="#ec4899"
            expandHref="/network/culture"
            connections={[{ label: "Cultura", href: "/network/culture", color: "#C9A8FF" }, { label: "Publicar", href: "/publish", color: "#FFBF00" }, { label: "Gráfica Viva", href: "/network/graph", color: "#6366f1" }]}
            live
            actions={
                <Link href="/network/culture" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Ver <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {hasReal ? "Corriente del Café · datos en vivo" : "Corriente cultural · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Vista ampliada de una obra ──
                if (openItem && !micro) {
                    const c = KIND_COLOR[openItem.kind] ?? "#ec4899";
                    const liked = !!likes[openItem.id];
                    const saved = !!saves[openItem.id];
                    // Avatar del autor
                    const avatarUrl = diceBearAvatar(openItem.author, "glass");
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 h-full">
                            <button onClick={() => setOpenId(null)}
                                className="self-start inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer">
                                <ChevronLeft className="size-3" /> Volver
                            </button>
                            <Chip color={c}>{openItem.kind}</Chip>
                            <h4 className="text-sm @sm:text-base font-black leading-tight">{openItem.title}</h4>
                            {/* Autor con avatar */}
                            <div className="flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={avatarUrl} alt={openItem.author} width={24} height={24}
                                    className="size-6 rounded-full border border-border/40 shrink-0 object-cover" />
                                <p className="text-[11px] text-muted-foreground/80">{openItem.author} · {timeAgo(openItem.ts)}</p>
                            </div>
                            <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-3">
                                <div className="flex items-center justify-between text-[10px] font-bold mb-1.5">
                                    <span className="text-muted-foreground/70">Resonancia colectiva</span>
                                    <span className="inline-flex items-center gap-1 text-pink-400"><Sparkles className="size-3" />{Math.round(openItem.resonance * 100)}%</span>
                                </div>
                                {/* Barra de resonancia con gradiente rosa → púrpura */}
                                <div className="relative h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                                        style={{ width: `${openItem.resonance * 100}%`, background: "linear-gradient(90deg, #ec4899, #a855f7)" }} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-auto">
                                <button onClick={() => setLikes((p) => ({ ...p, [openItem.id]: !p[openItem.id] }))}
                                    className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider border transition-colors cursor-pointer",
                                        liked ? "bg-pink-500/25 border-pink-500/50 text-pink-300" : "bg-white/5 border-border/40 hover:border-pink-500/40 text-muted-foreground")}>
                                    <Heart className={cn("size-4", liked && "fill-current")} /> Me gusta
                                </button>
                                <button onClick={() => setSaves((p) => ({ ...p, [openItem.id]: !p[openItem.id] }))}
                                    className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider border transition-colors cursor-pointer",
                                        saved ? "bg-amber-500/25 border-amber-500/50 text-amber-300" : "bg-white/5 border-border/40 hover:border-amber-500/40 text-muted-foreground")}>
                                    <Bookmark className={cn("size-4", saved && "fill-current")} /> Guardar
                                </button>
                            </div>
                        </div>
                    );
                }

                const base = kindFilter ? data.filter((i) => i.kind === kindFilter) : data;
                const sorted = [...base].sort((a, b) => b.resonance - a.resonance);
                const max = micro ? 2 : size.vTier === "expanded" ? 5 : 3;

                // Ítem de mayor resonancia (para badge TOP)
                const topId = sorted[0]?.id;

                return (
                    <div className="pt-1 h-full flex flex-col gap-2">
                        {/* Filtros con AnimatePresence */}
                        {!micro && kinds.length > 1 && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                <Filter className="size-3 shrink-0 text-muted-foreground/50" />
                                <button onClick={() => setKindFilter(null)}
                                    className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                        !kindFilter ? "bg-pink-500/20 border-pink-500/45 text-pink-300" : "border-border/40 text-muted-foreground/60 hover:border-pink-500/30")}>
                                    Todo
                                </button>
                                {kinds.map((k) => (
                                    <button key={k} onClick={() => setKindFilter(kindFilter === k ? null : k)}
                                        className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                            kindFilter === k ? "bg-pink-500/20 border-pink-500/45 text-pink-300" : "border-border/40 text-muted-foreground/60 hover:border-pink-500/30")}
                                        style={kindFilter === k ? undefined : { color: KIND_COLOR[k] ?? undefined }}>
                                        {k}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            {/* AnimatePresence en el contenedor: al cambiar filtro anima salida/entrada */}
                            <AnimatePresence mode="popLayout">
                                <MiniList
                                    key={kindFilter ?? "all"}
                                    items={sorted}
                                    max={max}
                                    empty="Sin obras en este filtro"
                                    render={(item, idx) => {
                                        const c = KIND_COLOR[item.kind] ?? "#ec4899";
                                        const liked = !!likes[item.id];
                                        const saved = !!saves[item.id];
                                        const isTop = !micro && item.id === topId;
                                        const thumbUrl = picsumCover(item.id);
                                        const avatarUrl = size.vTier === "expanded" ? diceBearAvatar(item.author, "glass") : null;
                                        return (
                                            <motion.div
                                                key={item.id}
                                                custom={idx}
                                                variants={itemVariants}
                                                initial="hidden"
                                                animate="visible"
                                                exit="exit"
                                                className="rounded-xl border border-border/40 bg-white/[0.02] hover:border-pink-500/30 transition-colors overflow-hidden"
                                                style={{ borderLeftWidth: 3, borderLeftColor: c }}
                                            >
                                                <button onClick={() => !micro && setOpenId(item.id)} className={cn("w-full text-left", !micro && "cursor-pointer")}>
                                                    <div className="flex items-start gap-2 px-2.5 py-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    {/* Título como Link a /article/<slug> además del openId */}
                                                                    {!micro ? (
                                                                        <Link href={`/article/${slugify(item.title)}`}
                                                                            onClick={(e) => { e.stopPropagation(); }}
                                                                            className="text-[11px] @sm:text-xs font-bold leading-snug line-clamp-2 hover:text-pink-300 transition-colors block">
                                                                            {item.title}
                                                                        </Link>
                                                                    ) : (
                                                                        <span className="text-[11px] font-bold leading-snug line-clamp-2 block">{item.title}</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    {isTop && (
                                                                        <span className="text-[7px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-px">TOP</span>
                                                                    )}
                                                                    {!micro && <Chip color={c}>{item.kind}</Chip>}
                                                                </div>
                                                            </div>
                                                            {!micro && (
                                                                <div className="mt-1 flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                        {/* Avatar (expanded only) */}
                                                                        {avatarUrl && (
                                                                            // eslint-disable-next-line @next/next/no-img-element
                                                                            <img src={avatarUrl} alt={item.author} width={16} height={16}
                                                                                className="size-4 rounded-full border border-border/40 shrink-0 object-cover" />
                                                                        )}
                                                                        <span className="text-[10px] text-muted-foreground/70 truncate">{item.author} · {timeAgo(item.ts)}</span>
                                                                    </div>
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-pink-400 shrink-0">
                                                                        <Sparkles className="size-3" /> {Math.round(item.resonance * 100)}%
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Thumbnail (no micro) */}
                                                        {!micro && (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={thumbUrl} alt="" aria-hidden width={60} height={40}
                                                                className="shrink-0 rounded-lg object-cover border border-border/30"
                                                                style={{ width: 60, height: 40 }} />
                                                        )}
                                                    </div>
                                                </button>
                                                {!micro && (
                                                    <>
                                                        {/* Barra de resonancia degradado */}
                                                        {size.vTier === "expanded" && (
                                                            <div className="mx-2.5 mb-1">
                                                                <div className="relative h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                                                                    <div className="absolute inset-y-0 left-0 rounded-full"
                                                                        style={{ width: `${item.resonance * 100}%`, background: "linear-gradient(90deg, #ec4899, #a855f7)" }} />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {size.vTier !== "expanded" && (
                                                            <div className="mx-2.5 mb-1">
                                                                <ProgressBar value={item.resonance} color={c} height={3} />
                                                            </div>
                                                        )}
                                                        <div className="px-2.5 pb-2 flex items-center gap-1.5">
                                                            <button onClick={() => setLikes((p) => ({ ...p, [item.id]: !p[item.id] }))} title="Me gusta"
                                                                className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-colors cursor-pointer",
                                                                    liked ? "bg-pink-500/20 border-pink-500/40 text-pink-300" : "border-border/40 text-muted-foreground/60 hover:border-pink-500/30")}>
                                                                <Heart className={cn("size-2.5", liked && "fill-current")} /> {liked ? "Te gusta" : "Gusta"}
                                                            </button>
                                                            <button onClick={() => setSaves((p) => ({ ...p, [item.id]: !p[item.id] }))} title="Guardar"
                                                                className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-colors cursor-pointer",
                                                                    saved ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "border-border/40 text-muted-foreground/60 hover:border-amber-500/30")}>
                                                                <Bookmark className={cn("size-2.5", saved && "fill-current")} /> {saved ? "Guardada" : "Guardar"}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </motion.div>
                                        );
                                    }}
                                />
                            </AnimatePresence>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
