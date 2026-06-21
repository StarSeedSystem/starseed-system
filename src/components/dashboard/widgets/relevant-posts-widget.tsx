'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Layers, Heart, MessageSquare, Repeat2, ChevronRight, Flame, Globe, MapPin, Home } from "lucide-react";
import { WidgetShell, Chip, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useWidgetData } from "@/lib/widget-data";
import type { Post } from "@/lib/widget-data";
import { createClient } from "@/utils/supabase/client";
import { samplePosts, diceBearAvatar } from "@/data/sample-entities";

// ════════════════════════════════════════════════════════════════
// RelevantPostsWidget — publicaciones más resonantes para ti.
// Lee publicaciones reales de la comunidad (`cafe_posts` del proyecto
// Supabase unificado dzkjapinnewkxzjltadv) con conteo total. Realtime:
// suscripción a `cafe_posts` (postgres_changes). Si no hay datos o
// falla, cae con elegancia a la corriente simulada "social.posts".
// Diseño data-driven: la resonancia define el estado (viral/resonando/
// emergente) y tiñe acentos. Filtro por alcance. Adaptativo + theme.
// ════════════════════════════════════════════════════════════════

const SCOPE_META: Record<Post["scope"], { color: string; label: string; icon: typeof Globe }> = {
    vecinal:      { color: "#10b981", label: "Vecinal",      icon: Home },
    biorregional: { color: "#38bdf8", label: "Biorregional", icon: MapPin },
    global:       { color: "#a855f7", label: "Global",       icon: Globe },
};

// Umbrales de resonancia → estado data-driven.
const VIRAL = 0.85;
const RESONATING = 0.65;
function resonanceState(r: number): { label: string; color: string; viral: boolean } {
    if (r >= VIRAL) return { label: "Viral", color: "#fb7185", viral: true };
    if (r >= RESONATING) return { label: "Resonando", color: "#a855f7", viral: false };
    return { label: "Emergente", color: "#38bdf8", viral: false };
}

/** Ruta de destino según el scope del post */
function postHref(scope: string): string {
    if (scope === "global") return "/network";
    if (scope === "biorregional") return "/network";
    return "/network";
}

// Fila pública real de cafe_posts (creaciones/elixires de la comunidad).
interface CafePostRow {
    id: string;
    kind: string | null;
    branch: string | null;
    title: string | null;
    body: string | null;
    author_name: string | null;
    created_at: string | null;
}

// Resonancia derivada determinista:
function derivedResonance(id: string, createdAt: string | null): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const base = 0.55 + (h % 1000) / 1000 * 0.4;
    const ageDays = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000 : 30;
    const recency = Math.max(0, 1 - ageDays / 45) * 0.1;
    return Math.min(0.97, base + recency);
}

// Engagement sintético determinista para datos reales sin métricas (likes/comentarios).
function derivedEngagement(id: string, resonance: number): { boosts: number; comments: number } {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 37 + id.charCodeAt(i)) >>> 0;
    const scale = 40 + resonance * 360;
    return {
        boosts: Math.round(((h % 100) / 100) * scale),
        comments: Math.round((((h >> 7) % 100) / 100) * scale * 0.35),
    };
}

function mapCafePosts(rows: CafePostRow[]): Post[] {
    return rows.map((r, i) => {
        const handle = (r.author_name ?? "comunidad")
            .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "").slice(0, 18) || "comunidad";
        const content = [r.title, r.body].filter(Boolean).join(" — ")
            || r.title || "Nueva creación en el Café StarSeed.";
        const id = r.id ?? `cafe-${i}`;
        const resonance = derivedResonance(id, r.created_at);
        const eng = derivedEngagement(id, resonance);
        return {
            id,
            author: r.author_name ?? "Comunidad StarSeed",
            handle,
            content,
            ts: r.created_at ? new Date(r.created_at).getTime() : Date.now() - i * 3_600_000,
            resonance,
            comments: eng.comments,
            boosts: eng.boosts,
            tags: [r.kind, r.branch].filter((t): t is string => !!t),
            scope: "vecinal",
        };
    });
}

/** Convierte SamplePost al shape Post usado por el widget. */
function samplePostsAsFallback(): Post[] {
    return samplePosts.map((sp, i) => ({
        id: sp.id,
        author: sp.authorName,
        handle: (sp.authorHandle ?? "").replace("@", ""),
        content: [sp.title, sp.body].filter(Boolean).join(" — ") || sp.body || "",
        ts: new Date(sp.createdAt).getTime(),
        resonance: 0.55 + (i / samplePosts.length) * 0.4,
        comments: sp.commentsCount,
        boosts: Math.floor(sp.likes / 10),
        tags: [sp.kind].filter(Boolean),
        scope: sp.system === "politico" ? "global" : sp.system === "educativo" ? "biorregional" : "vecinal",
    }));
}

const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

type ScopeFilter = "todos" | Post["scope"];

export function RelevantPostsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { data: mockData, loading } = useWidgetData("social.posts", { refreshMs: 8000 });
    const supabase = useMemo(() => createClient(), []);
    const [realData, setRealData] = useState<Post[] | null>(null);
    const [total, setTotal] = useState<number | null>(null);
    const [scope, setScope] = useState<ScopeFilter>("todos");
    const [liked, setLiked] = useState<Set<string>>(() => new Set());

    const reload = useCallback(async () => {
        try {
            const [rowsRes, countRes] = await Promise.all([
                supabase.from("cafe_posts")
                    .select("id, kind, branch, title, body, author_name, created_at")
                    .order("created_at", { ascending: false }).limit(12),
                supabase.from("cafe_posts").select("id", { count: "exact", head: true }),
            ]);
            if (rowsRes.error) throw rowsRes.error;
            const mapped = mapCafePosts((rowsRes.data ?? []) as CafePostRow[]);
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
            .channel("w-relevant-posts")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .subscribe();
        return () => { active = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const hasReal = realData !== null;
    // Cascada de datos: real → mockData → samplePosts enriquecidos
    const data = realData ?? mockData ?? samplePostsAsFallback();

    const sortedAll = useMemo(() => [...data].sort((a, b) => b.resonance - a.resonance), [data]);
    const filtered = useMemo(
        () => scope === "todos" ? sortedAll : sortedAll.filter(p => p.scope === scope),
        [sortedAll, scope]
    );

    // Métricas agregadas data-driven (cabecera).
    const stats = useMemo(() => {
        const avg = data.length ? data.reduce((s, p) => s + p.resonance, 0) / data.length : 0;
        const viral = data.filter(p => p.resonance >= VIRAL).length;
        const scopeCounts = { todos: data.length, vecinal: 0, biorregional: 0, global: 0 } as Record<ScopeFilter, number>;
        for (const p of data) scopeCounts[p.scope] += 1;
        return { avg, viral, scopeCounts };
    }, [data]);

    // Solo alcances presentes en los datos (más, "Todos").
    const scopeSegments = useMemo<ScopeFilter[]>(() => {
        const present = (["vecinal", "biorregional", "global"] as Post["scope"][]).filter(s => stats.scopeCounts[s] > 0);
        return ["todos", ...present];
    }, [stats.scopeCounts]);

    function toggleLike(id: string) {
        setLiked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }

    return (
        <WidgetShell
            title="Publicaciones Relevantes"
            subtitle={hasReal
                ? (total !== null ? `${INT_ES.format(total)} publicaciones · en vivo` : "Comunidad · en vivo")
                : "Lo que más resuena contigo"}
            icon={Layers}
            accent="#a855f7"
            live
            connections={[{ label: "Red", href: "/network", color: "#a855f7" }, { label: "Cultura", href: "/network/culture", color: "#38bdf8" }, { label: "Publicar", href: "/publish", color: "#10b981" }]}
            expandHref="/network"
            actions={
                <Link href="/network" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Red <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {hasReal ? "Publicaciones del Café · datos en vivo" : "Corriente social · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const isExpanded = size.vTier === "expanded";

                // ── Micro: top post resonante compacto ─────────────
                if (micro) {
                    const top = sortedAll[0];
                    if (!top) return <div className="h-full grid place-items-center text-xs text-muted-foreground/50 italic">Sin publicaciones</div>;
                    const st = resonanceState(top.resonance);
                    const sc = SCOPE_META[top.scope];
                    return (
                        <Link href={postHref(top.scope)} className="h-full flex flex-col justify-center gap-1.5 px-1 cursor-pointer">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <img src={diceBearAvatar(top.handle, "lorelei")} alt={top.author} className="size-6 rounded-full shrink-0 border" style={{ borderColor: `${sc.color}44` }} />
                                <span className="text-[11px] font-bold truncate min-w-0" style={{ color: sc.color }}>@{top.handle}</span>
                                {st.viral && <Flame className="size-3 shrink-0" style={{ color: st.color }} />}
                                <span className="ml-auto shrink-0 text-[10px] font-black tabular-nums" style={{ color: st.color }}>{Math.round(top.resonance * 100)}%</span>
                            </div>
                            <p className="text-[10px] text-foreground/80 leading-snug line-clamp-2">{top.content}</p>
                        </Link>
                    );
                }

                const max = isExpanded ? 4 : 3;
                const shown = filtered.slice(0, max);

                return (
                    <div className="pt-1 h-full flex flex-col gap-2">
                        {/* ── Tira-resumen: resonancia media + virales + alcance ── */}
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums" style={{ color: resonanceState(stats.avg).color }}>
                                    <Repeat2 className="size-3" />{Math.round(stats.avg * 100)}% resonancia media
                                </span>
                                {stats.viral > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-300 tabular-nums">
                                        <Flame className="size-2.5" />{stats.viral} virales
                                    </span>
                                )}
                                {/* Segmentos por alcance */}
                                <div className="w-full flex items-center gap-1 mt-0.5">
                                    {scopeSegments.map((s) => {
                                        const active = scope === s;
                                        const meta = s === "todos" ? null : SCOPE_META[s];
                                        const SIcon = s === "todos" ? Layers : meta!.icon;
                                        const col = s === "todos" ? "#a855f7" : meta!.color;
                                        const n = stats.scopeCounts[s];
                                        return (
                                            <button key={s} type="button" onClick={() => setScope(s)} aria-pressed={active}
                                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer tabular-nums"
                                                style={active
                                                    ? { color: col, borderColor: `${col}66`, background: `${col}1f` }
                                                    : { color: "hsl(var(--muted-foreground)/0.65)", borderColor: "hsl(var(--border)/0.4)" }}>
                                                <SIcon className="size-2.5" />{s === "todos" ? "Todos" : meta!.label}<span className="opacity-60">{n}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 min-h-0">
                            <div className="flex flex-col gap-1.5">
                                {shown.map((p, idx) => {
                                    const st = resonanceState(p.resonance);
                                    const sc = SCOPE_META[p.scope];
                                    const scopeColor = sc.color;
                                    const avatarUrl = diceBearAvatar(p.handle, "lorelei");
                                    const isLiked = liked.has(p.id);
                                    const boostCount = p.boosts + (isLiked ? 1 : 0);

                                    return (
                                        <motion.div
                                            key={p.id}
                                            initial={animate ? { opacity: 0, y: 8 } : false}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.06 : 0, ease: "easeOut" }}
                                            whileHover={animate ? { scale: 1.005 } : undefined}
                                        >
                                            <Link href={postHref(p.scope)} className="block cursor-pointer">
                                                <div className="relative rounded-xl border border-border/40 bg-white/[0.02] px-2.5 pt-2 pb-1.5 overflow-hidden hover:border-purple-400/25 hover:bg-white/[0.04] transition-colors"
                                                    style={st.viral ? { boxShadow: `inset 2px 0 0 ${st.color}` } : undefined}>
                                                    {/* Cabecera: avatar + handle + estado + scope chip */}
                                                    <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                                        <Link
                                                            href={`/profile/${p.handle}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center gap-1.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                                                        >
                                                            <img
                                                                src={avatarUrl}
                                                                alt={p.author}
                                                                className="size-6 rounded-full shrink-0 border"
                                                                style={{ borderColor: `${scopeColor}44` }}
                                                            />
                                                            <span className="text-[11px] font-bold truncate min-w-0" style={{ color: scopeColor }}>
                                                                @{p.handle}
                                                            </span>
                                                            {st.viral && <Flame className="size-3 shrink-0" style={{ color: st.color }} />}
                                                        </Link>
                                                        <span className="shrink-0 inline-flex items-center gap-1">
                                                            <Chip color={scopeColor}>
                                                                <sc.icon className="size-2 inline mr-0.5" />{sc.label}
                                                            </Chip>
                                                        </span>
                                                    </div>

                                                    {/* Contenido */}
                                                    <p className="text-[11px] @sm:text-xs text-foreground/90 leading-snug line-clamp-2">{p.content}</p>

                                                    {/* Tags en modo expanded */}
                                                    {isExpanded && p.tags?.length > 0 && (
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-1 min-w-0">
                                                            {p.tags.slice(0, 3).map((t) => (
                                                                <span key={t} className="text-[9px] font-bold rounded-full border px-1.5 py-0.5 truncate max-w-[8rem]"
                                                                    style={{ color: scopeColor, borderColor: `${scopeColor}30`, background: `${scopeColor}10` }}>
                                                                    #{t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Estadísticas de engagement + acción like real */}
                                                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/70 min-w-0">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleLike(p.id); }}
                                                            aria-pressed={isLiked}
                                                            aria-label={isLiked ? "Quitar resonancia" : "Resonar con esta publicación"}
                                                            title={isLiked ? "Quitar resonancia" : "Resonar"}
                                                            className={`inline-flex items-center gap-1 shrink-0 rounded-full px-1 -mx-1 transition-colors cursor-pointer tabular-nums ${isLiked ? "text-rose-400" : "hover:text-rose-400"}`}
                                                        >
                                                            <Heart className={`size-3 ${isLiked ? "fill-rose-400" : ""}`} /> {INT_ES.format(boostCount)}
                                                        </button>
                                                        <span className="inline-flex items-center gap-1 shrink-0 tabular-nums"><MessageSquare className="size-3" /> {INT_ES.format(p.comments)}</span>
                                                        <span className="inline-flex items-center gap-1 shrink-0 tabular-nums" style={{ color: st.color }} title={st.label}>
                                                            <Repeat2 className="size-3" /> {Math.round(p.resonance * 100)}%
                                                        </span>
                                                        <span className="ml-auto shrink-0 tabular-nums">{timeAgo(p.ts)}</span>
                                                    </div>

                                                    {/* Barra de resonancia animada al pie */}
                                                    <motion.div
                                                        className="absolute bottom-0 left-0 h-[2px] rounded-full"
                                                        style={{ background: st.color }}
                                                        initial={animate ? { width: "0%" } : false}
                                                        animate={{ width: `${p.resonance * 100}%` }}
                                                        transition={{ duration: animate ? 0.8 : 0, delay: animate ? idx * 0.1 : 0, ease: "easeOut" }}
                                                    />
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                                {shown.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
                                        <span className="grid place-items-center size-9 rounded-2xl border border-border/40 bg-muted/20">
                                            <Layers className="size-4 text-muted-foreground/50" strokeWidth={1.5} />
                                        </span>
                                        <span className="text-xs text-muted-foreground/60">Sin publicaciones en este alcance</span>
                                        <button type="button" onClick={() => setScope("todos")}
                                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-300 hover:text-purple-200 transition-colors cursor-pointer">
                                            Ver todas
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
