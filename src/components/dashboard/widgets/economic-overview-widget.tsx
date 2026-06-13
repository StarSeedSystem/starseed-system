'use client';

import { Wallet, Coins, Info, ArrowLeftRight } from "lucide-react";
import { WidgetShell, StatTile, Sparkline, Chip } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// EconomicOverviewWidget — pulso de recursos (SEEDS / Karma / ...)
// Adaptativo: micro → mejor métrica; compacto → grid; expandido →
// grid + sparklines + acciones. Theme-aware vía WidgetShell + kit.
// Datos en vivo (source-agnostic) desde "common.metrics".
// ════════════════════════════════════════════════════════════════
export function EconomicOverviewWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: 3500 });

    return (
        <WidgetShell title="Pulso Económico" subtitle="Matriz de recursos" icon={Wallet} accent="#10b981" live>
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const lead = data[0];

                if (micro) {
                    return (
                        <div className="h-full flex flex-col justify-center">
                            <StatTile label={lead.label} value={lead.display ?? lead.value} unit={lead.unit}
                                change={lead.change} trend={lead.trend} accent={lead.color ?? "#10b981"} compact />
                        </div>
                    );
                }

                const cols = size.tier === "expanded" ? "grid-cols-2" : "grid-cols-2";
                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        <div className={`grid ${cols} gap-2`}>
                            {data.slice(0, size.vTier === "compact" ? 2 : 4).map((m) => (
                                <StatTile key={m.id} label={m.label} value={m.display ?? m.value} unit={m.unit}
                                    change={m.change} trend={m.trend} accent={m.color ?? "#10b981"}
                                    compact={size.tier !== "expanded"} icon={Coins} />
                            ))}
                        </div>

                        {size.vTier !== "compact" && lead.series && (
                            <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">{lead.label} · 20m</span>
                                    <Chip color={lead.color ?? "#10b981"}>{lead.trend ?? "flat"}</Chip>
                                </div>
                                <Sparkline data={lead.series} color={lead.color ?? "#10b981"} height={size.vTier === "expanded" ? 48 : 34} />
                            </div>
                        )}

                        {size.vTier === "expanded" && (
                            <div className="mt-auto grid grid-cols-2 gap-2">
                                <button className="flex items-center justify-center gap-2 rounded-2xl bg-primary/10 border border-primary/25 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 cursor-pointer">
                                    <ArrowLeftRight className="size-4" /> Intercambiar
                                </button>
                                <button className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-border/40 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:bg-white/10 cursor-pointer">
                                    <Info className="size-4" /> Libro Mayor
                                </button>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
