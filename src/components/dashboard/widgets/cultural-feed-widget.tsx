'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Palette, ChevronRight, Sparkles } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { FeedItem } from "@/lib/widget-data";
import { createClient } from "@/utils/supabase/client";

// ════════════════════════════════════════════════════════════════
// CulturalFeedWidget — corriente cultural de la red (obras, eventos,
// manifiestos). Lee creaciones reales de la comunidad (`cafe_posts`
// del proyecto unificado) como corriente cultural viva, con conteo
// total. Realtime: suscripción a `cafe_posts` (postgres_changes). Si
// no hay datos o falla, cae con elegancia a "common.feed" simulado.
// Adaptativo + theme-aware.
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

const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

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
            setRealData(null); // fallback elegante a simulado
        }
    }, [supabase]);

    useEffect(() => {
        let active = true;
        void (async () => { if (active) await reload(); })();
        // Realtime: nuevas obras / creaciones refrescan la corriente.
        const ch = supabase
            .channel("w-cultural-feed")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .subscribe();
        return () => { active = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const hasReal = realData !== null;
    const data = realData ?? mockData;

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
                const sorted = [...data].sort((a, b) => b.resonance - a.resonance);
                const max = micro ? 2 : size.vTier === "expanded" ? 5 : 3;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            render={(item) => (
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-pink-500/30 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-[11px] @sm:text-xs font-bold leading-snug line-clamp-2">{item.title}</span>
                                        {!micro && <Chip color={KIND_COLOR[item.kind] ?? "#ec4899"}>{item.kind}</Chip>}
                                    </div>
                                    {!micro && (
                                        <div className="mt-1.5 flex items-center justify-between gap-2">
                                            <span className="text-[10px] text-muted-foreground/70 truncate">{item.author} · {timeAgo(item.ts)}</span>
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-pink-400 shrink-0">
                                                <Sparkles className="size-3" /> {Math.round(item.resonance * 100)}%
                                            </span>
                                        </div>
                                    )}
                                    {size.vTier === "expanded" && (
                                        <div className="mt-1.5"><ProgressBar value={item.resonance} color={KIND_COLOR[item.kind] ?? "#ec4899"} height={4} /></div>
                                    )}
                                </div>
                            )}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
