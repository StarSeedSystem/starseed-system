'use client';

import Link from "next/link";
import { Activity, ChevronRight, TrendingUp, TrendingDown, Minus, Sparkles, Heart, Users, AlertTriangle } from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar, Sparkline } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Trend } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// SocietyPulseWidget — Monitor de Cohesión Macro-Social.
// El pulso del organismo colectivo: armonía global, abundancia,
// bienestar, participación ontocrática, salud por región y
// alerta de fractura con invitación a enviar apoyo.
// Datos "society.cohesion". Adaptativo. Invariante: democracia
// directa, soberanía directa, cohesión sin coerción.
// ════════════════════════════════════════════════════════════════

function TrendIcon({ trend }: { trend: Trend }) {
    if (trend === "up") return <TrendingUp className="size-3 text-emerald-400 shrink-0" />;
    if (trend === "down") return <TrendingDown className="size-3 text-rose-400 shrink-0" />;
    return <Minus className="size-3 text-muted-foreground/50 shrink-0" />;
}

function trendColor(trend: Trend) {
    if (trend === "up") return "#34d399";
    if (trend === "down") return "#fb7185";
    return undefined;
}

export function SocietyPulseWidget() {
    const { data, loading } = useWidgetData("society.cohesion", { refreshMs: 12000 });

    return (
        <WidgetShell
            title="Pulso de la Sociedad"
            subtitle="Cohesión Macro-Social"
            icon={Activity}
            accent="#10b981"
            live
            actions={
                <Link
                    href="/network/politics"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Red <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: anillo de armonía + sparkline ──────────────────────
                if (micro) {
                    return (
                        <div className="h-full flex items-center justify-center gap-3">
                            <ProgressRing
                                value={d.harmonyIndex}
                                size={64}
                                stroke={6}
                                color="#10b981"
                                label={`${Math.round(d.harmonyIndex * 100)}`}
                                sublabel="armonía"
                            />
                            <div className="flex-1 min-w-0">
                                <Sparkline data={d.history} color="#10b981" height={36} />
                            </div>
                        </div>
                    );
                }

                const isExpanded = size.vTier === "expanded";
                const isCompact = size.vTier === "compact";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* ── Alerta de fractura ────────────────────────────────── */}
                        {d.fracture && (
                            <div className="shrink-0 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-2.5 py-2">
                                <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-black uppercase tracking-wide text-amber-300">
                                        Fractura detectada
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/80 leading-snug truncate">
                                        <strong className="text-amber-200/90">{d.fracture.region}</strong> — {d.fracture.reason}
                                    </span>
                                </div>
                                <Link
                                    href="/network/politics"
                                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-400/40 text-amber-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide hover:bg-amber-400/15 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    <Sparkles className="size-2.5" /> Apoyar
                                </Link>
                            </div>
                        )}

                        {/* ── Armonía global + métricas ─────────────────────────── */}
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing
                                value={d.harmonyIndex}
                                size={isExpanded ? 80 : 64}
                                stroke={7}
                                color="#10b981"
                                label={`${Math.round(d.harmonyIndex * 100)}`}
                                sublabel="armonía global"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                                {/* Abundancia */}
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="size-3 shrink-0 text-amber-400/80" />
                                    <div className="flex-1 min-w-0">
                                        <ProgressBar value={d.abundance} color="#f59e0b" height={4} showPct={false} />
                                    </div>
                                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                        {Math.round(d.abundance * 100)}%
                                    </span>
                                </div>
                                {/* Bienestar */}
                                <div className="flex items-center gap-1.5">
                                    <Heart className="size-3 shrink-0 text-rose-400/80" />
                                    <div className="flex-1 min-w-0">
                                        <ProgressBar value={d.wellbeing} color="#fb7185" height={4} showPct={false} />
                                    </div>
                                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                        {Math.round(d.wellbeing * 100)}%
                                    </span>
                                </div>
                                {/* Participación */}
                                <div className="flex items-center gap-1.5">
                                    <Users className="size-3 shrink-0 text-sky-400/80" />
                                    <div className="flex-1 min-w-0">
                                        <ProgressBar value={d.participation} color="#38bdf8" height={4} showPct={false} />
                                    </div>
                                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                        {Math.round(d.participation * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── Leyenda de las barras ─────────────────────────────── */}
                        {!isCompact && (
                            <div className="shrink-0 flex items-center gap-3 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">
                                <span className="inline-flex items-center gap-1"><Sparkles className="size-2.5 text-amber-400/70" /> Abundancia</span>
                                <span className="inline-flex items-center gap-1"><Heart className="size-2.5 text-rose-400/70" /> Bienestar</span>
                                <span className="inline-flex items-center gap-1"><Users className="size-2.5 text-sky-400/70" /> Participación</span>
                            </div>
                        )}

                        {/* ── Regiones ──────────────────────────────────────────── */}
                        <div className="flex-1 min-h-0 overflow-hidden space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 block">
                                Regiones
                            </span>
                            {d.regions.slice(0, isExpanded ? 5 : isCompact ? 2 : 4).map((rg) => (
                                <div key={rg.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2 py-1">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <span
                                                className="text-[10px] font-bold truncate"
                                                style={{ color: rg.accent }}
                                            >
                                                {rg.label}
                                            </span>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <TrendIcon trend={rg.trend} />
                                                <span
                                                    className="text-[9px] tabular-nums font-black"
                                                    style={{ color: trendColor(rg.trend) ?? "var(--muted-foreground)" }}
                                                >
                                                    {Math.round(rg.cohesion * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                        <ProgressBar
                                            value={rg.cohesion}
                                            color={rg.accent}
                                            height={3}
                                            showPct={false}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Sparkline histórico ───────────────────────────────── */}
                        <div className="shrink-0">
                            <Sparkline
                                data={d.history}
                                color="#10b981"
                                height={isExpanded ? 44 : 28}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
