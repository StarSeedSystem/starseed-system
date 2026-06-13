'use client';

// ════════════════════════════════════════════════════════════════
// Widget Primitives — adaptive, theme-aware building blocks
// ----------------------------------------------------------------
// Every primitive is fluid (no fixed pixel widths), uses theme tokens
// (hsl(var(--primary)), text-foreground...) and degrades gracefully at
// small sizes. Widgets compose these instead of re-implementing charts.
// ════════════════════════════════════════════════════════════════

import React, { useId } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Minus, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeriesPoint, Trend } from "@/lib/widget-data/types";

// ── timeAgo / timeUntil (relative time, es) ─────────────────────
export function timeAgo(ts: number): string {
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "ahora";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

export function timeUntil(ts: number): string {
    const diff = ts - Date.now();
    if (diff <= 0) return "ahora";
    const m = Math.floor(diff / 60000);
    if (m < 60) return `en ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `en ${h}h`;
    const d = Math.floor(h / 24);
    return `en ${d}d`;
}

// ── StatTile ────────────────────────────────────────────────────
export function StatTile({
    label, value, unit, change, trend, accent = "hsl(var(--primary))", icon: Icon, compact,
}: {
    label: string; value: string | number; unit?: string;
    change?: number; trend?: Trend; accent?: string; icon?: LucideIcon; compact?: boolean;
}) {
    const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
    const trendColor = trend === "up" ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
        : trend === "down" ? "text-rose-400 bg-rose-500/15 border-rose-500/30"
            : "text-muted-foreground bg-muted/20 border-border/40";
    return (
        <div className="relative rounded-2xl border border-border/40 bg-white/[0.03] p-3 @sm:p-4 overflow-hidden group/tile transition-colors duration-300 hover:border-border/70 hover:bg-white/[0.05]">
            <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] @sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70 truncate">{label}</span>
                {Icon && <Icon className="size-3.5 shrink-0 opacity-50" style={{ color: accent }} />}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className={cn("font-black tracking-tighter tabular-nums", compact ? "text-xl" : "text-2xl @sm:text-3xl")} style={{ color: accent }}>
                    {typeof value === "number" ? value.toLocaleString() : value}
                </span>
                {unit && <span className="text-[10px] font-bold text-muted-foreground/50 uppercase">{unit}</span>}
            </div>
            {typeof change === "number" && (
                <div className={cn("mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black", trendColor)}>
                    <TrendIcon className="size-3" />
                    {change > 0 ? "+" : ""}{change.toFixed(1)}%
                </div>
            )}
        </div>
    );
}

// ── Sparkline ───────────────────────────────────────────────────
export function Sparkline({
    data, color = "hsl(var(--primary))", height = 40, fill = true, strokeWidth = 2,
}: { data: SeriesPoint[]; color?: string; height?: number; fill?: boolean; strokeWidth?: number }) {
    const gid = useId();
    if (!data || data.length < 2) return <div style={{ height }} className="w-full rounded-lg bg-muted/10" />;
    const vs = data.map(d => d.v);
    const min = Math.min(...vs), max = Math.max(...vs);
    const range = max - min || 1;
    const W = 100, H = 100;
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((d.v - min) / range) * H;
        return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} className="w-full overflow-visible">
            <defs>
                <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            {fill && <path d={area} fill={`url(#spark-${gid})`} />}
            <motion.path
                d={line} fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }}
            />
        </svg>
    );
}

// ── ProgressRing / Gauge ────────────────────────────────────────
export function ProgressRing({
    value, size = 72, stroke = 7, color = "hsl(var(--primary))", track = "hsl(var(--border))",
    label, sublabel,
}: { value: number; size?: number; stroke?: number; color?: string; track?: string; label?: string; sublabel?: string }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(1, value));
    return (
        <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeOpacity={0.25} strokeWidth={stroke} />
                <motion.circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: c * (1 - clamped) }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center leading-none">
                <div>
                    <div className="font-black tabular-nums text-sm @sm:text-base" style={{ color }}>
                        {label ?? `${Math.round(clamped * 100)}%`}
                    </div>
                    {sublabel && <div className="text-[8px] uppercase tracking-wider text-muted-foreground/60 font-bold mt-0.5">{sublabel}</div>}
                </div>
            </div>
        </div>
    );
}

// ── Bars (mini bar chart) ───────────────────────────────────────
export function Bars({
    data, color = "hsl(var(--primary))", height = 48,
}: { data: { label?: string; value: number }[]; color?: string; height?: number }) {
    const max = Math.max(...data.map(d => d.value), 0.0001);
    return (
        <div className="flex items-end gap-1.5 w-full" style={{ height }}>
            {data.map((d, i) => (
                <motion.div key={i} className="flex-1 rounded-t-md min-w-[3px]"
                    style={{ background: `linear-gradient(to top, ${color}, color-mix(in srgb, ${color} 40%, transparent))` }}
                    initial={{ height: 0 }} animate={{ height: `${(d.value / max) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.04, ease: "easeOut" }}
                    title={d.label ? `${d.label}: ${d.value}` : String(d.value)}
                />
            ))}
        </div>
    );
}

// ── ProgressBar ─────────────────────────────────────────────────
export function ProgressBar({
    value, color = "hsl(var(--primary))", showPct, label, height = 8,
}: { value: number; color?: string; showPct?: boolean; label?: string; height?: number }) {
    const clamped = Math.max(0, Math.min(1, value));
    return (
        <div className="w-full">
            {(label || showPct) && (
                <div className="flex justify-between items-center mb-1 text-[10px] font-bold">
                    {label && <span className="text-muted-foreground/70 truncate">{label}</span>}
                    {showPct && <span className="tabular-nums" style={{ color }}>{Math.round(clamped * 100)}%</span>}
                </div>
            )}
            <div className="w-full rounded-full bg-muted/25 overflow-hidden" style={{ height }}>
                <motion.div className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})` }}
                    initial={{ width: 0 }} animate={{ width: `${clamped * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
            </div>
        </div>
    );
}

// ── MiniList ────────────────────────────────────────────────────
export function MiniList<T>({
    items, render, empty = "Sin datos", max, emptyIcon: EmptyIcon = Inbox,
}: { items: T[]; render: (item: T, i: number) => React.ReactNode; empty?: string; max?: number; emptyIcon?: LucideIcon }) {
    const shown = max ? items.slice(0, max) : items;
    if (!shown.length) return (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
            <span className="grid place-items-center size-9 rounded-2xl border border-border/40 bg-muted/20">
                <EmptyIcon className="size-4 text-muted-foreground/50" strokeWidth={1.5} />
            </span>
            <span className="text-xs text-muted-foreground/60">{empty}</span>
        </div>
    );
    return (
        <div className="flex flex-col gap-1.5">
            {shown.map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    {render(item, i)}
                </motion.div>
            ))}
        </div>
    );
}

// ── Pill / Chip ─────────────────────────────────────────────────
export function Chip({ children, color = "hsl(var(--primary))", soft = true }: { children: React.ReactNode; color?: string; soft?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] @sm:text-[10px] font-black uppercase tracking-wider border whitespace-nowrap max-w-full overflow-hidden"
            style={soft
                ? { background: `color-mix(in srgb, ${color} 15%, transparent)`, borderColor: `color-mix(in srgb, ${color} 30%, transparent)`, color }
                : { background: color, borderColor: color, color: "white" }}>
            {children}
        </span>
    );
}

// ── RadialNodeGraph (mesh / codex relationships) ────────────────
export function RadialNodeGraph({
    nodes, height = 180, onSelect,
}: {
    nodes: { id: string; label: string; distance: number; angle: number; signal?: number; accent?: string }[];
    height?: number; onSelect?: (id: string) => void;
}) {
    const cx = 50, cy = 50;
    return (
        <svg viewBox="0 0 100 100" style={{ height }} className="w-full">
            {[0.33, 0.66, 1].map((r, i) => (
                <circle key={i} cx={cx} cy={cy} r={r * 45} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth={0.4} />
            ))}
            {nodes.map((n) => {
                const r = n.distance * 45;
                const x = cx + Math.cos(n.angle) * r;
                const y = cy + Math.sin(n.angle) * r;
                const color = n.accent ?? "hsl(var(--primary))";
                return (
                    <g key={n.id}>
                        {n.distance > 0 && <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity={0.25} strokeWidth={0.4} />}
                        <motion.circle
                            cx={x} cy={y} r={n.distance === 0 ? 3.4 : 2.2 + (n.signal ?? 0.5) * 1.6}
                            fill={color} className={onSelect ? "cursor-pointer" : ""}
                            onClick={() => onSelect?.(n.id)}
                            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
                            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                        />
                    </g>
                );
            })}
        </svg>
    );
}
