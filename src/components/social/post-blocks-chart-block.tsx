"use client";

// src/components/social/post-blocks-chart-block.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Adenda 138 (rendimiento): bloque "grafica" del Lienzo Universal, extraído de
// post-blocks-renderer.tsx para poder cargarse con next/dynamic({ssr:false})
// desde allí. recharts (~105KB gzip) solo se descarga cuando un post RENDERIZA
// de verdad un bloque de tipo "grafica" — antes se bundleaba de forma estática
// en post-blocks-renderer.tsx, que se monta para CADA post en CUALQUIER feed
// (perfil, página, red/cultura, red/política…), metiendo recharts en el First
// Load de esas rutas aunque ningún post tuviera gráfica. Mismo componente,
// mismo render — solo cambia CUÁNDO se descarga el JS de recharts.
// ─────────────────────────────────────────────────────────────────────────────

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import type { PostBlock, ChartDatum } from "@/lib/creation/post-blocks";

const CHART_COLORS = ["#39FF14", "#007FFF", "#FFBF00", "#DC143C", "#B24BF3", "#10B981", "#F472B6", "#38BDF8"];

const TOOLTIP_STYLE = {
    background: "#0b0b12",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    fontSize: 12,
    color: "#fff",
};

// ── Gráfica (recharts, responsive) ───────────────────────────────────────────

export function GraficaBlock({ block, reduced }: { block: PostBlock; reduced: boolean }) {
    const data: ChartDatum[] = (block.data || []).filter((d) => Number.isFinite(d.value));
    if (data.length === 0) return null;
    const kind = block.chartType || "bar";
    const animate = !reduced;

    return (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            {block.text && <p className="mb-2 text-xs font-semibold text-foreground/80">{block.text}</p>}
            <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {kind === "line" ? (
                        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[1]} strokeWidth={2} dot isAnimationActive={animate} />
                        </LineChart>
                    ) : kind === "area" ? (
                        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="value" stroke={CHART_COLORS[0]} fill={`${CHART_COLORS[0]}33`} strokeWidth={2} isAnimationActive={animate} />
                        </AreaChart>
                    ) : kind === "pie" ? (
                        <PieChart>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="80%" isAnimationActive={animate}>
                                {data.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    ) : (
                        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={animate}>
                                {data.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
