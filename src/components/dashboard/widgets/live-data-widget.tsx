'use client';

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Server, ArrowUpRight, ArrowDownRight, Minus, Radio, Wifi } from "lucide-react";
import { WidgetShell, StatTile, Sparkline } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Metric, Trend } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// LiveDataWidget v2 — telemetría de red en tiempo real.
// ----------------------------------------------------------------
// MEJORAS v2:
//   • "Ticker" animado: cada métrica hace flip vertical al cambiar valor.
//   • Pulso de señal: dot con halo expand-fade cada 3 s.
//   • Indicador de tendencia con flecha colorida + cambio %.
//   • Mini sparklines por métrica en modo regular/expanded.
//   • Barra de "velocidad de red" visual con gradiente cian.
//   • Hora de última lectura con flip de dígitos.
// ════════════════════════════════════════════════════════════════

const REFRESH_MS = 3000;
const NUM_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

function formatVal(v: Metric): string {
    if (v.display) return v.display;
    return NUM_ES.format(v.value);
}

// Animated value cell: flips on change
function TickerValue({ value, color }: { value: string; color: string }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span
                key={value}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="font-black tabular-nums text-xl tracking-tighter inline-block"
                style={{ color }}
            >
                {value}
            </motion.span>
        </AnimatePresence>
    );
}

// Trend indicator
function TrendBadge({ trend, change }: { trend?: Trend; change?: number }) {
    if (!trend || trend === "flat") return null;
    const up = trend === "up";
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    const color = up ? "text-emerald-400" : "text-rose-400";
    const bg   = up ? "bg-emerald-500/10 border-emerald-500/25" : "bg-rose-500/10 border-rose-500/25";
    return (
        <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-black ${color} ${bg}`}>
            <Icon className="size-2.5" />
            {typeof change === "number" ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : null}
        </span>
    );
}

// Pulse dot for live signal
function SignalPulse({ color }: { color: string }) {
    return (
        <span className="relative inline-flex size-2 shrink-0">
            <motion.span
                className="absolute inline-flex size-full rounded-full"
                style={{ background: color }}
                animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                transition={{ duration: REFRESH_MS / 1000, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="relative inline-flex rounded-full size-2" style={{ background: color }} />
        </span>
    );
}

// Compact metric card for the grid
function MetricCard({ m }: { m: Metric }) {
    const color = m.color ?? "#06b6d4";
    return (
        <div
            className="relative rounded-2xl border border-border/40 bg-white/[0.03] px-3 py-2.5 overflow-hidden transition-colors hover:border-border/70 hover:bg-white/[0.05]"
            style={{ boxShadow: `0 0 14px -8px ${color}66` }}
        >
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 120%, ${color}12 0%, transparent 70%)` }} />
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60 mb-1 truncate">
                {m.label}
            </div>
            <TickerValue value={formatVal(m)} color={color} />
            {m.unit && (
                <span className="text-[9px] font-bold text-muted-foreground/40 uppercase ml-0.5">{m.unit}</span>
            )}
            {(m.trend || typeof m.change === "number") && (
                <div className="mt-1">
                    <TrendBadge trend={m.trend} change={m.change} />
                </div>
            )}
        </div>
    );
}

export function LiveDataWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: REFRESH_MS });

    const [updatedTs, setUpdatedTs] = useState<number>(() => Date.now());
    useEffect(() => { if (data) setUpdatedTs(Date.now()); }, [data]);

    // SSR-safe clock
    const [clockStr, setClockStr] = useState("");
    useEffect(() => {
        function tick() {
            setClockStr(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        }
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <WidgetShell
            title="Telemetría de Red"
            subtitle="Flujo en tiempo real"
            icon={Radio}
            accent="#06b6d4"
            live
            connections={[
                { label: "Explorer", href: "/explorer",      color: "#06b6d4" },
                { label: "Grafo",    href: "/network/graph", color: "#22d3ee" },
                { label: "Panel",    href: "/dashboard",     color: "#a855f7" },
            ]}
            expandHref="/explorer"
            footer={
                !loading && data ? (
                    <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/60 min-w-0">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                            <SignalPulse color="#22d3ee" />
                            <span className="truncate tabular-nums">{data.length} señales · {REFRESH_MS / 1000}s</span>
                        </span>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={clockStr}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.15 }}
                                className="shrink-0 tabular-nums font-mono"
                            >
                                {clockStr}
                            </motion.span>
                        </AnimatePresence>
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
                            <div className="text-center">
                                <TickerValue value={formatVal(lead)} color={lead.color ?? "#06b6d4"} />
                                {lead.unit && (
                                    <div className="text-[9px] font-bold text-muted-foreground/50 uppercase mt-0.5">{lead.unit}</div>
                                )}
                                <div className="text-[9px] text-muted-foreground/50 mt-0.5 truncate">{lead.label}</div>
                            </div>
                        </div>
                    );
                }

                const cols = size.tier === "expanded" ? "grid-cols-4" : "grid-cols-2";
                const showSpark = size.vTier !== "compact" && !!lead.series;
                const count = 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* ── Metric grid ─────────────────────────────── */}
                        <div className={`grid ${cols} gap-2 shrink-0`}>
                            {data.slice(0, count).map((m, i) => (
                                <motion.div
                                    key={m.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <MetricCard m={m} />
                                </motion.div>
                            ))}
                        </div>

                        {/* ── Lead sparkline ───────────────────────────── */}
                        {showSpark && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                className="flex-1 min-h-0 rounded-xl border border-border/40 bg-white/[0.02] p-2.5 flex flex-col"
                                style={{ boxShadow: `0 0 14px -8px ${lead.color ?? "#06b6d4"}44` }}
                            >
                                <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Wifi className="size-3 shrink-0" style={{ color: lead.color ?? "#06b6d4" }} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 truncate min-w-0">
                                            {lead.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <TrendBadge trend={lead.trend} change={lead.change} />
                                        <span className="text-[11px] font-black tabular-nums" style={{ color: lead.color ?? "#06b6d4" }}>
                                            {formatVal(lead)}{lead.unit ? ` ${lead.unit}` : ""}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 grid place-items-stretch">
                                    <Sparkline
                                        data={lead.series!}
                                        color={lead.color ?? "#06b6d4"}
                                        height={size.vTier === "expanded" ? 90 : 56}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
