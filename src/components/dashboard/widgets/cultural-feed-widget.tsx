'use client';

import Link from "next/link";
import { Palette, ChevronRight, Sparkles } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// CulturalFeedWidget — corriente cultural de la red (obras, eventos,
// manifiestos). Datos en vivo "common.feed". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const KIND_COLOR: Record<string, string> = {
    obra: "#ec4899", propuesta: "#f59e0b", debate: "#a855f7",
    misión: "#10b981", evento: "#38bdf8",
};

export function CulturalFeedWidget() {
    const { data, loading } = useWidgetData("common.feed", { refreshMs: 7000 });

    return (
        <WidgetShell
            title="Corriente Cultural"
            subtitle="Obras · eventos · manifiestos"
            icon={Palette}
            accent="#ec4899"
            live
            actions={
                <Link href="/network/culture" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Ver <ChevronRight className="size-3" />
                </Link>
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
