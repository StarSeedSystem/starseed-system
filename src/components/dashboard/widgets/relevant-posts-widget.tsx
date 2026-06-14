'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers, Heart, MessageSquare, Repeat2, ChevronRight } from "lucide-react";
import { WidgetShell, MiniList, Chip, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Post } from "@/lib/widget-data";
import { createClient } from "@/utils/supabase/client";

// ════════════════════════════════════════════════════════════════
// RelevantPostsWidget — publicaciones más resonantes para ti.
// Intenta leer publicaciones reales de la comunidad (cafe_posts del
// proyecto Supabase unificado dzkjapinnewkxzjltadv); si no hay datos
// o falla, cae con elegancia a la corriente simulada "social.posts".
// Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const SCOPE_COLOR: Record<string, string> = {
    vecinal: "#10b981", biorregional: "#38bdf8", global: "#a855f7",
};

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

// Resonancia derivada determinista (sin datos sociales reales aún):
// recencia + variación estable por id → 0.45..0.97.
function derivedResonance(id: string, createdAt: string | null): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const base = 0.55 + (h % 1000) / 1000 * 0.4; // 0.55..0.95
    const ageDays = createdAt ? (Date.now() - new Date(createdAt).getTime()) / 86_400_000 : 30;
    const recency = Math.max(0, 1 - ageDays / 45) * 0.1; // hasta +0.1 para lo reciente
    return Math.min(0.97, base + recency);
}

// Mapea filas reales a la forma Post que ya consume la UI.
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

export function RelevantPostsWidget() {
    const { data: mockData, loading } = useWidgetData("social.posts", { refreshMs: 8000 });
    const supabase = useMemo(() => createClient(), []);
    const [realData, setRealData] = useState<Post[] | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data: rows, error } = await supabase
                    .from("cafe_posts")
                    .select("id, kind, branch, title, body, author_name, created_at")
                    .order("created_at", { ascending: false })
                    .limit(12);
                if (error) throw error;
                if (!active) return;
                const mapped = mapCafePosts((rows ?? []) as CafePostRow[]);
                setRealData(mapped.length ? mapped : null);
            } catch {
                if (active) setRealData(null); // fallback elegante a simulado
            }
        })();
        return () => { active = false; };
    }, [supabase]);

    const data = realData ?? mockData;

    return (
        <WidgetShell
            title="Publicaciones Relevantes"
            subtitle="Lo que más resuena contigo"
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
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const sorted = [...data].sort((a, b) => b.resonance - a.resonance);
                const max = micro ? 2 : size.vTier === "expanded" ? 4 : 3;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            empty="Sin publicaciones"
                            render={(p) => (
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                    <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                        <span className="text-[11px] font-bold truncate min-w-0">@{p.handle}</span>
                                        {!micro && <span className="shrink-0"><Chip color={SCOPE_COLOR[p.scope] ?? "#a855f7"}>{p.scope}</Chip></span>}
                                    </div>
                                    <p className="text-[11px] @sm:text-xs text-foreground/90 leading-snug line-clamp-2">{p.content}</p>
                                    {!micro && size.vTier === "expanded" && p.tags?.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1 min-w-0">
                                            {p.tags.slice(0, 3).map((t) => (
                                                <span key={t} className="text-[9px] font-bold text-muted-foreground/60 truncate max-w-[8rem]">#{t}</span>
                                            ))}
                                        </div>
                                    )}
                                    {!micro && (
                                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/70 min-w-0">
                                            <span className="inline-flex items-center gap-1 shrink-0"><Heart className="size-3" /> {p.boosts}</span>
                                            <span className="inline-flex items-center gap-1 shrink-0"><MessageSquare className="size-3" /> {p.comments}</span>
                                            <span className="inline-flex items-center gap-1 shrink-0" style={{ color: SCOPE_COLOR[p.scope] ?? "#a855f7" }}><Repeat2 className="size-3" /> {Math.round(p.resonance * 100)}%</span>
                                            <span className="ml-auto shrink-0">{timeAgo(p.ts)}</span>
                                        </div>
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
