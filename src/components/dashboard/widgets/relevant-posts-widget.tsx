'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Layers, Heart, MessageSquare, Repeat2, ChevronRight } from "lucide-react";
import { WidgetShell, Chip, timeAgo } from "../kit";
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
// Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const SCOPE_COLOR: Record<string, string> = {
    vecinal: "#10b981", biorregional: "#38bdf8", global: "#a855f7",
};

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

function mapCafePosts(rows: CafePostRow[]): Post[] {
    return rows.map((r, i) => {
        const handle = (r.author_name ?? "comunidad")
            .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "").slice(0, 18) || "comunidad";
        const content = [r.title, r.body].filter(Boolean).join(" — ")
            || r.title || "Nueva creación en el Café StarSeed.";
        return {
            id: r.id ?? `cafe-${i}`,
            author: r.author_name ?? "Comunidad StarSeed",
            handle,
            content,
            ts: r.created_at ? new Date(r.created_at).getTime() : Date.now() - i * 3_600_000,
            resonance: derivedResonance(r.id ?? String(i), r.created_at),
            comments: 0,
            boosts: 0,
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

export function RelevantPostsWidget() {
    const { data: mockData, loading } = useWidgetData("social.posts", { refreshMs: 8000 });
    const supabase = useMemo(() => createClient(), []);
    const [realData, setRealData] = useState<Post[] | null>(null);
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
                const sorted = [...data].sort((a, b) => b.resonance - a.resonance);
                const max = micro ? 2 : isExpanded ? 4 : 3;
                const shown = sorted.slice(0, max);

                return (
                    <div className="pt-1 h-full">
                        <div className="flex flex-col gap-1.5">
                            {shown.map((p, idx) => {
                                const scopeColor = SCOPE_COLOR[p.scope] ?? "#a855f7";
                                const avatarUrl = diceBearAvatar(p.handle, "lorelei");

                                return (
                                    <motion.div
                                        key={p.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: idx * 0.06, ease: "easeOut" }}
                                        whileHover={{ scale: 1.005 }}
                                    >
                                        <Link href={postHref(p.scope)} className="block cursor-pointer">
                                            <div className="relative rounded-xl border border-border/40 bg-white/[0.02] px-2.5 pt-2 pb-1.5 overflow-hidden hover:border-purple-400/25 hover:bg-white/[0.04] transition-colors">
                                                {/* Cabecera: avatar + handle + scope chip */}
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
                                                    </Link>
                                                    {!micro && <span className="shrink-0"><Chip color={scopeColor}>{p.scope}</Chip></span>}
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

                                                {/* Estadísticas de engagement */}
                                                {!micro && (
                                                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/70 min-w-0">
                                                        <span className="inline-flex items-center gap-1 shrink-0"><Heart className="size-3" /> {p.boosts}</span>
                                                        <span className="inline-flex items-center gap-1 shrink-0"><MessageSquare className="size-3" /> {p.comments}</span>
                                                        <span className="inline-flex items-center gap-1 shrink-0" style={{ color: scopeColor }}>
                                                            <Repeat2 className="size-3" /> {Math.round(p.resonance * 100)}%
                                                        </span>
                                                        <span className="ml-auto shrink-0">{timeAgo(p.ts)}</span>
                                                    </div>
                                                )}

                                                {/* Barra de resonancia animada al pie */}
                                                <motion.div
                                                    className="absolute bottom-0 left-0 h-[2px] rounded-full"
                                                    style={{ background: scopeColor }}
                                                    initial={{ width: "0%" }}
                                                    animate={{ width: `${p.resonance * 100}%` }}
                                                    transition={{ duration: 0.8, delay: idx * 0.1, ease: "easeOut" }}
                                                />
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
