'use client';

import Link from "next/link";
import { Layers, Heart, MessageSquare, Repeat2, ChevronRight } from "lucide-react";
import { WidgetShell, MiniList, Chip, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// RelevantPostsWidget — publicaciones más resonantes para ti.
// Datos en vivo "social.posts". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const SCOPE_COLOR: Record<string, string> = {
    vecinal: "#10b981", biorregional: "#38bdf8", global: "#a855f7",
};

export function RelevantPostsWidget() {
    const { data, loading } = useWidgetData("social.posts", { refreshMs: 8000 });

    return (
        <WidgetShell
            title="Publicaciones Relevantes"
            subtitle="Lo que más resuena contigo"
            icon={Layers}
            accent="#a855f7"
            live
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
                            render={(p) => (
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-[11px] font-bold truncate">@{p.handle}</span>
                                        {!micro && <Chip color={SCOPE_COLOR[p.scope] ?? "#a855f7"}>{p.scope}</Chip>}
                                    </div>
                                    <p className="text-[11px] @sm:text-xs text-foreground/90 leading-snug line-clamp-2">{p.content}</p>
                                    {!micro && (
                                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/70">
                                            <span className="inline-flex items-center gap-1"><Heart className="size-3" /> {p.boosts}</span>
                                            <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" /> {p.comments}</span>
                                            <span className="inline-flex items-center gap-1"><Repeat2 className="size-3" /> {Math.round(p.resonance * 100)}%</span>
                                            <span className="ml-auto">{timeAgo(p.ts)}</span>
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
