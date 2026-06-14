'use client';

import { Server } from "lucide-react";
import { useEffect, useState } from "react";
import { WidgetShell, StatTile, Sparkline } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// LiveDataWidget — telemetría de red en tiempo real.
// Datos en vivo "common.metrics". Adaptativo + theme-aware.
// Intervalo de refresco real (3 s) y hora de la última lectura con
// Date; cifras formateadas con Intl.NumberFormat (es-ES).
// ════════════════════════════════════════════════════════════════
const REFRESH_MS = 3000;
// Cifras grandes con separador de millares (es-ES).
const NUM_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

function formatMetricValue(v: { display?: string; value: number }): string {
    if (v.display) return v.display;
    return NUM_ES.format(v.value);
}

export function LiveDataWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: REFRESH_MS });

    // Hora real de la última lectura recibida (se refresca con cada tick).
    const [updatedTs, setUpdatedTs] = useState<number>(() => Date.now());
    useEffect(() => { if (data) setUpdatedTs(Date.now()); }, [data]);
    const updated = new Date(updatedTs).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    return (
        <WidgetShell
            title="Telemetría de Red"
            subtitle="Flujo en tiempo real"
            icon={Server}
            accent="#06b6d4"
            live
            connections={[{ label: "Explorer", href: "/explorer", color: "#06b6d4" }, { label: "Grafo", href: "/network/graph", color: "#22d3ee" }, { label: "Panel", href: "/dashboard", color: "#a855f7" }]}
            expandHref="/explorer"
            footer={
                !loading && data ? (
                    <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/60 min-w-0">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                            <span className="size-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_#22d3ee]" />
                            <span className="truncate tabular-nums">{data.length} señales · refresco {REFRESH_MS / 1000}s</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{updated}</span>
                    </div>
                ) : undefined
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const lead = data[0];

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <StatTile label={lead.label} value={formatMetricValue(lead)} unit={lead.unit} change={lead.change} trend={lead.trend} accent={lead.color ?? "#06b6d4"} compact />
                        </div>
                    );
                }

                const cols = size.tier === "expanded" ? "grid-cols-4" : "grid-cols-2";
                const showSpark = size.vTier !== "compact" && !!lead.series;
                const count = size.tier === "expanded" ? 4 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className={`grid ${cols} gap-2 shrink-0`}>
                            {data.slice(0, count).map((m) => (
                                <StatTile key={m.id} label={m.label} value={formatMetricValue(m)} unit={m.unit} change={m.change} trend={m.trend} accent={m.color ?? "#06b6d4"} compact />
                            ))}
                        </div>
                        {showSpark && (
                            <div className="flex-1 min-h-0 rounded-xl border border-border/40 bg-white/[0.02] p-2.5 flex flex-col">
                                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 truncate min-w-0">{lead.label}</span>
                                    <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color: lead.color ?? "#06b6d4" }}>{formatMetricValue(lead)}{lead.unit ? ` ${lead.unit}` : ""}</span>
                                </div>
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
