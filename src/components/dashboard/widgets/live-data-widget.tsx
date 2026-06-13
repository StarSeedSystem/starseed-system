'use client';

import { Server } from "lucide-react";
import { WidgetShell, StatTile, Sparkline } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// LiveDataWidget — telemetría de red en tiempo real.
// Datos en vivo "common.metrics". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
export function LiveDataWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: 3000 });

    return (
        <WidgetShell title="Telemetría de Red" subtitle="Flujo en tiempo real" icon={Server} accent="#06b6d4" live>
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const lead = data[0];

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <StatTile label={lead.label} value={lead.display ?? lead.value} unit={lead.unit} change={lead.change} trend={lead.trend} accent={lead.color ?? "#06b6d4"} compact />
                        </div>
                    );
                }

                const cols = size.tier === "expanded" ? "grid-cols-4" : "grid-cols-2";
                const showSpark = size.vTier !== "compact" && !!lead.series;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className={`grid ${cols} gap-2 shrink-0`}>
                            {data.slice(0, size.tier === "expanded" ? 4 : 4).map((m) => (
                                <StatTile key={m.id} label={m.label} value={m.display ?? m.value} unit={m.unit} change={m.change} trend={m.trend} accent={m.color ?? "#06b6d4"} compact />
                            ))}
                        </div>
                        {showSpark && (
                            <div className="flex-1 min-h-0 rounded-xl border border-border/40 bg-white/[0.02] p-2.5 flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">{lead.label}</span>
                                <div className="flex-1 min-h-0 grid place-items-stretch">
                                    <Sparkline data={lead.series!} color={lead.color ?? "#06b6d4"} height={size.vTier === "expanded" ? 90 : 56} />
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
