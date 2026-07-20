"use client";

/**
 * ── DiversityPanel — Diversidad de conexiones ─────────────────────────────────
 * Donut SVG por los 4 sistemas + índice de equilibrio (entropía 0-100) +
 * reciprocidad (mutuas/total), con lectura clara y consejo accionable.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PieChart, Scale, GitMerge, Lightbulb } from "lucide-react";
import {
    donutSegments, balanceReading, reciprocityReading, diversityAdvice, type DonutSegment,
} from "@/lib/hub-social/diversity";
import { SYSTEM_META } from "@/lib/hub-social/meta";
import { ExportGraphButton } from "@/components/hub/export-graph-button";
import type { GraphNode, GraphMetrics, ActiveProfileLite } from "@/lib/hub-social/graph";

function Donut({ segments, total }: { segments: DonutSegment[]; total: number }) {
    const size = 184;
    const stroke = 22;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const center = size / 2;
    const gap = total > 0 ? 2 : 0; // hueco visual entre segmentos (grados en longitud)

    let acc = 0;
    const arcs = segments
        .filter((s) => s.count > 0)
        .map((s) => {
            const len = Math.max(0, s.fraction * c - gap);
            const dash = `${len} ${c - len}`;
            const offset = -acc;
            acc += s.fraction * c;
            return { s, dash, offset };
        });

    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Distribución de conexiones por sistema">
                <circle cx={center} cy={center} r={r} fill="none" stroke="currentColor" className="text-white/[0.06]" strokeWidth={stroke} />
                {arcs.map(({ s, dash, offset }) => (
                    <circle
                        key={s.system}
                        cx={center} cy={center} r={r}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={stroke}
                        strokeDasharray={dash}
                        strokeDashoffset={offset}
                        strokeLinecap="butt"
                        style={{ transition: "stroke-dasharray 300ms ease, stroke-dashoffset 300ms ease", filter: `drop-shadow(0 0 4px ${s.color}44)` }}
                    />
                ))}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                    <div className="font-headline text-3xl font-black text-foreground/95 tabular-nums">{total}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {total === 1 ? "conexión" : "conexiones"}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Meter({ value, tone }: { value: number; tone: string }) {
    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: tone, boxShadow: `0 0 8px ${tone}66` }}
            />
        </div>
    );
}

export function DiversityPanel({
    mine, metrics, profile,
}: {
    mine: GraphNode[]; metrics: GraphMetrics; profile: ActiveProfileLite | null;
}) {
    const segments = donutSegments(metrics);
    const bal = balanceReading(metrics.balanceIndex, metrics.systemsPresent.length);
    const rec = reciprocityReading(metrics.reciprocityPct);
    const advice = diversityAdvice(metrics);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <PieChart className="h-4 w-4 text-cyan-300" />
                        <h3 className="font-headline text-lg font-black tracking-tight text-foreground/95">Diversidad de conexiones</h3>
                    </div>
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-balance">
                        Cómo se reparte tu red entre los cuatro sistemas, cuán equilibrada está y cuántos vínculos son recíprocos.
                    </p>
                </div>
                <ExportGraphButton mine={mine} metrics={metrics} profile={profile} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {/* Donut + leyenda */}
                <Card className="liquid-glass-panel border-white/10">
                    <CardContent className="flex flex-col items-center gap-5 p-5 sm:flex-row">
                        <Donut segments={segments} total={metrics.total} />
                        <div className="w-full flex-1 space-y-2">
                            {segments.map((s) => {
                                const Icon = SYSTEM_META[s.system].icon;
                                return (
                                    <div key={s.system} className="space-y-1">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: s.color }}>
                                                <Icon className="h-3.5 w-3.5" /> {s.label}
                                            </span>
                                            <span className="tabular-nums text-muted-foreground">
                                                {s.count} · {s.pct}%
                                            </span>
                                        </div>
                                        <Meter value={s.pct} tone={s.color} />
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Índices */}
                <div className="grid grid-cols-1 gap-3">
                    <Card className="liquid-glass-panel border-white/10">
                        <CardContent className="space-y-2.5 p-5">
                            <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-200">
                                    <Scale className="h-3.5 w-3.5" /> Índice de equilibrio
                                </span>
                                <Badge variant="outline" className="border-transparent text-[10px] font-bold" style={{ background: `${bal.tone}1a`, color: bal.tone, borderColor: `${bal.tone}44` }}>
                                    {bal.label}
                                </Badge>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="font-headline text-4xl font-black tabular-nums" style={{ color: bal.tone }}>{metrics.balanceIndex}</span>
                                <span className="pb-1.5 text-xs text-muted-foreground">/ 100</span>
                            </div>
                            <Meter value={metrics.balanceIndex} tone={bal.tone} />
                            <p className="text-[11px] leading-relaxed text-muted-foreground">{bal.blurb}</p>
                        </CardContent>
                    </Card>

                    <Card className="liquid-glass-panel border-white/10">
                        <CardContent className="space-y-2.5 p-5">
                            <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-200">
                                    <GitMerge className="h-3.5 w-3.5" /> Reciprocidad
                                </span>
                                <Badge variant="outline" className="border-transparent text-[10px] font-bold" style={{ background: `${rec.tone}1a`, color: rec.tone, borderColor: `${rec.tone}44` }}>
                                    {rec.label}
                                </Badge>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="font-headline text-4xl font-black tabular-nums" style={{ color: rec.tone }}>{metrics.reciprocityPct}%</span>
                                <span className="pb-1.5 text-xs text-muted-foreground">
                                    {metrics.reciprocalCount} de {metrics.total} mutuos
                                </span>
                            </div>
                            <Meter value={metrics.reciprocityPct} tone={rec.tone} />
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                Vínculos donde sigues y participas a la vez: el tejido más fuerte de tu red.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Consejo accionable */}
            <Card className="liquid-glass-panel border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.05] to-transparent">
                <CardContent className="flex items-start gap-3 p-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-200">
                        <Lightbulb className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/80">Consejo para equilibrar tu red</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">{advice}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default DiversityPanel;
