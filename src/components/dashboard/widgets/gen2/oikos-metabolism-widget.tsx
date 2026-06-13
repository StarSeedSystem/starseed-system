'use client';

import { Leaf, Zap, Droplets, ArrowRightLeft } from "lucide-react";
import { WidgetShell, ProgressRing, Sparkline, ProgressBar, StatTile } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

export function OikosMetabolismWidget() {
    const { data, loading } = useWidgetData("oikos.flow", { refreshMs: 3000 });

    return (
        <WidgetShell title="Metabolismo Oikos" subtitle="Energía · agua · excedente" icon={Leaf} accent="#10b981" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const net = data.energyGenerated - data.energyConsumed;
                const balance = Math.max(0, Math.min(1, data.energyGenerated / (data.energyConsumed || 1) / 2));
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-1">
                            <ProgressRing value={balance} size={64} color={net >= 0 ? "#10b981" : "#f59e0b"}
                                label={`${net >= 0 ? "+" : ""}${net.toFixed(1)}`} sublabel="kW net" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        <div className="flex items-center gap-3">
                            <ProgressRing value={balance} size={size.tier === "expanded" ? 84 : 68}
                                color={net >= 0 ? "#10b981" : "#f59e0b"} label={`${net >= 0 ? "+" : ""}${net.toFixed(1)}`} sublabel="kW net" />
                            <div className="flex-1 grid grid-cols-2 gap-2">
                                <StatTile label="Generada" value={data.energyGenerated} unit="kW" accent="#10b981" icon={Zap} compact />
                                <StatTile label="Agua" value={data.waterCaptured} unit="L" accent="#38bdf8" icon={Droplets} compact />
                            </div>
                        </div>

                        <div className="shrink-0">
                            <Sparkline data={data.history} color="#10b981" height={size.vTier === "expanded" ? 44 : 32} />
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="space-y-1.5">
                                {data.sources.map((s) => (
                                    <ProgressBar key={s.id} value={s.share} label={s.label} showPct
                                        color={s.id === "solar" ? "#f59e0b" : s.id === "eolica" ? "#38bdf8" : "#10b981"} />
                                ))}
                            </div>
                        )}

                        {size.vTier === "expanded" && (
                            <div className="mt-auto rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-2.5">
                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1.5">
                                    <ArrowRightLeft className="size-3" /> Excedente enrutado
                                </div>
                                <div className="space-y-1">
                                    {data.surplusRouting.map((r) => (
                                        <div key={r.to} className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground/70 truncate">{r.to}</span>
                                            <span className="font-bold tabular-nums text-emerald-300">{r.amount} kW</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
