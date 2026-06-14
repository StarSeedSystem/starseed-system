'use client';

// ════════════════════════════════════════════════════════════════
// FlowDirectorWidget — Director de Flujo Vital
// ----------------------------------------------------------------
// Prioriza energía sobre tiempo. Muestra la marea circadiana del día,
// la energía télica actual, la ventana óptima presente y las crestas
// del día. Toggle local "Modo Fortaleza" para bloquear distracciones.
// Datos "productivity.flow". Adaptativo a todos los tamaños.
// ════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Activity, ChevronRight, Shield, ShieldOff,
    Zap, Palette, Brain, Users, Moon, Target, Coffee, MessageCircle,
    type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from "recharts";
import {
    WidgetShell, ProgressRing, MiniList, Chip,
} from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { FlowState, FlowTaskKind, FlowPhase } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ── meta por tipo de tarea ───────────────────────────────────────
const KIND_META: Record<FlowTaskKind, { icon: LucideIcon; label: string; color: string }> = {
    creativa:  { icon: Palette, label: "Creativa",  color: "#ec4899" },
    analitica: { icon: Brain,   label: "Analítica", color: "#38bdf8" },
    fisica:    { icon: Zap,     label: "Física",    color: "#f59e0b" },
    social:    { icon: Users,   label: "Social",    color: "#34d399" },
    descanso:  { icon: Moon,    label: "Descanso",  color: "#a78bfa" },
};

// ── meta por fase ────────────────────────────────────────────────
const PHASE_META: Record<FlowPhase, { label: string; color: string }> = {
    amanecer: { label: "Amanecer",  color: "#f59e0b" },
    pico:     { label: "Pico",      color: "#34d399" },
    meseta:   { label: "Meseta",    color: "#38bdf8" },
    descenso: { label: "Descenso",  color: "#fb923c" },
    reposo:   { label: "Reposo",    color: "#a78bfa" },
};

// ── acento base del widget ────────────────────────────────────────
const BASE_ACCENT = "#8b5cf6";
const FORTRESS_ACCENT = "#dc2626";

// ── modos de intención (reordenan sugerencias) ───────────────────
type FlowMode = "enfoque" | "descanso" | "social";
const MODE_META: Record<FlowMode, { label: string; icon: LucideIcon; color: string; kinds: FlowTaskKind[] }> = {
    enfoque:  { label: "Enfoque",  icon: Target,        color: "#8b5cf6", kinds: ["analitica", "creativa", "fisica", "social", "descanso"] },
    descanso: { label: "Descanso", icon: Coffee,        color: "#a78bfa", kinds: ["descanso", "fisica", "creativa", "social", "analitica"] },
    social:   { label: "Social",   icon: MessageCircle, color: "#34d399", kinds: ["social", "creativa", "fisica", "analitica", "descanso"] },
};
const MODE_ORDER: FlowMode[] = ["enfoque", "descanso", "social"];

// ── bloques de enfoque sugeridos por modo ────────────────────────
const FOCUS_BLOCKS: Record<FlowMode, { label: string; minutes: number }[]> = {
    enfoque:  [{ label: "Deep work", minutes: 90 }, { label: "Sprint analítico", minutes: 50 }, { label: "Pausa activa", minutes: 10 }],
    descanso: [{ label: "Micro-siesta", minutes: 20 }, { label: "Paseo consciente", minutes: 25 }, { label: "Respiración", minutes: 8 }],
    social:   [{ label: "Co-creación", minutes: 60 }, { label: "Encuentro abierto", minutes: 40 }, { label: "Mentoría", minutes: 30 }],
};

export function FlowDirectorWidget() {
    const { data, loading } = useWidgetData("productivity.flow", { refreshMs: 8000 });
    const [fortressMode, setFortressMode] = useState(false);
    const [mode, setMode] = useState<FlowMode>("enfoque");

    const modeMeta = MODE_META[mode];
    const accent = fortressMode ? FORTRESS_ACCENT : modeMeta.color;

    // Curva circadiana enriquecida para recharts (hora + valor 0..100)
    const curve = useMemo(() => {
        const c = (data as FlowState | undefined)?.circadian ?? [];
        return c.map((p) => ({ hour: p.t, energy: Math.round(p.v * 100) }));
    }, [data]);
    const nowHour = new Date().getHours();
    const nowPoint = curve.find((p) => p.hour === nowHour) ?? null;

    return (
        <WidgetShell
            title="Director de Flujo"
            subtitle="Mareas de energía vital"
            icon={Activity}
            accent={accent}
            live
            actions={
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Ver <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data as FlowState;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const expanded = size.vTier === "expanded";

                const phaseMeta = PHASE_META[d.phase];
                // El modo activo reordena la sugerencia y las ventanas del día
                const modeKinds = modeMeta.kinds;
                const rankOf = (k: FlowTaskKind) => {
                    const i = modeKinds.indexOf(k);
                    return i === -1 ? 99 : i;
                };
                const suggKind = modeKinds[0] ?? d.suggestion.taskType;
                const suggMeta = KIND_META[suggKind];
                const SuggIcon = suggMeta.icon;
                const orderedPeaks = [...d.peaks].sort((a, b) => rankOf(a.kind) - rankOf(b.kind) || a.startHour - b.startHour);
                const peakMax = expanded ? 5 : compact ? 2 : 3;
                const blocks = FOCUS_BLOCKS[mode];

                // ── MICRO: solo anillo de energía ────────────────
                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing
                                value={d.energyNow}
                                size={72}
                                stroke={8}
                                color={accent}
                                label={`${Math.round(d.energyNow * 100)}%`}
                                sublabel={phaseMeta.label}
                            />
                        </div>
                    );
                }

                // ── REGULAR / COMPACT / EXPANDED ─────────────────
                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">

                        {/* Anillo + sugerencia */}
                        <div className="shrink-0 flex items-center gap-3">
                            <ProgressRing
                                value={d.energyNow}
                                size={compact ? 60 : 72}
                                stroke={7}
                                color={phaseMeta.color}
                                label={`${Math.round(d.energyNow * 100)}%`}
                                sublabel={phaseMeta.label}
                            />
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                {/* Sugerencia óptima */}
                                <div
                                    className="rounded-xl border px-2.5 py-2"
                                    style={{
                                        background: `color-mix(in srgb, ${suggMeta.color} 12%, transparent)`,
                                        borderColor: `color-mix(in srgb, ${suggMeta.color} 28%, transparent)`,
                                    }}
                                >
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <SuggIcon className="size-3 shrink-0" style={{ color: suggMeta.color }} />
                                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: suggMeta.color }}>
                                            Ahora: {suggMeta.label}
                                        </span>
                                    </div>
                                    {!compact && (
                                        <p className="text-[9px] text-muted-foreground/70 leading-snug line-clamp-2">
                                            {suggKind === d.suggestion.taskType
                                                ? d.suggestion.reason
                                                : `En modo ${modeMeta.label.toLowerCase()}: prioriza energía ${suggMeta.label.toLowerCase()}.`}
                                        </p>
                                    )}
                                </div>

                                {/* Toggle Modo Fortaleza */}
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setFortressMode((prev) => !prev)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                        fortressMode
                                            ? "bg-red-500/15 border-red-500/40 text-red-400"
                                            : "bg-white/[0.04] border-border/40 text-muted-foreground/60 hover:border-violet-500/40 hover:text-violet-300"
                                    )}
                                >
                                    {fortressMode
                                        ? <Shield className="size-2.5" />
                                        : <ShieldOff className="size-2.5" />}
                                    {fortressMode ? "Fortaleza ON" : "Fortaleza"}
                                </motion.button>
                            </div>
                        </div>

                        {/* Selector de modo de intención */}
                        <div className="shrink-0 grid grid-cols-3 gap-1">
                            {MODE_ORDER.map((m) => {
                                const mm = MODE_META[m];
                                const MIcon = mm.icon;
                                const active = mode === m;
                                return (
                                    <motion.button
                                        key={m}
                                        whileTap={{ scale: 0.96 }}
                                        onClick={() => setMode(m)}
                                        className={cn(
                                            "inline-flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                            !active && "border-border/40 bg-white/[0.02] text-muted-foreground/55 hover:text-foreground"
                                        )}
                                        style={active ? {
                                            background: `color-mix(in srgb, ${mm.color} 16%, transparent)`,
                                            borderColor: `color-mix(in srgb, ${mm.color} 40%, transparent)`,
                                            color: mm.color,
                                        } : undefined}
                                    >
                                        <MIcon className="size-3 shrink-0" />
                                        <span className="truncate">{mm.label}</span>
                                    </motion.button>
                                );
                            })}
                        </div>

                        {/* Curva de energía circadiana (recharts) con la hora actual marcada */}
                        {!compact && curve.length > 0 && (
                            <div className="shrink-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">
                                        Energía circadiana
                                    </span>
                                    <span className="text-[9px] font-bold tabular-nums" style={{ color: accent }}>
                                        {nowHour}:00 · {Math.round(d.energyNow * 100)}%
                                    </span>
                                </div>
                                <div style={{ height: expanded ? 80 : 56 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={curve} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="flowCurve" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                                                    <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis
                                                dataKey="hour"
                                                tick={{ fontSize: 8, fill: "currentColor", opacity: 0.4 }}
                                                ticks={[0, 6, 12, 18, 23]}
                                                tickFormatter={(h) => `${h}h`}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis hide domain={[0, 100]} />
                                            <Tooltip
                                                cursor={{ stroke: accent, strokeOpacity: 0.3 }}
                                                contentStyle={{
                                                    background: "hsl(var(--popover))",
                                                    border: "1px solid hsl(var(--border))",
                                                    borderRadius: 10,
                                                    fontSize: 10,
                                                    padding: "4px 8px",
                                                }}
                                                labelFormatter={(h) => `${h}:00 h`}
                                                formatter={(v: number) => [`${v}%`, "Energía"]}
                                            />
                                            <ReferenceLine x={nowHour} stroke={accent} strokeOpacity={0.55} strokeDasharray="3 3" />
                                            <Area type="monotone" dataKey="energy" stroke={accent} strokeWidth={2} fill="url(#flowCurve)" />
                                            {nowPoint && (
                                                <ReferenceDot x={nowPoint.hour} y={nowPoint.energy} r={3.5} fill={accent} stroke="hsl(var(--background))" strokeWidth={1.5} />
                                            )}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* Bloques de enfoque sugeridos por modo */}
                        {!compact && (
                            <div className="shrink-0">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1 block">
                                    Bloques sugeridos
                                </span>
                                <div className="flex flex-wrap gap-1">
                                    {blocks.map((b) => (
                                        <span
                                            key={b.label}
                                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold"
                                            style={{
                                                background: `color-mix(in srgb, ${modeMeta.color} 9%, transparent)`,
                                                borderColor: `color-mix(in srgb, ${modeMeta.color} 24%, transparent)`,
                                                color: modeMeta.color,
                                            }}
                                        >
                                            {b.label}
                                            <span className="tabular-nums text-muted-foreground/55">{b.minutes}m</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Lista de ventanas del día */}
                        <div className="flex-1 min-h-0">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1 block">
                                Ventanas
                            </span>
                            <MiniList
                                items={orderedPeaks}
                                max={peakMax}
                                empty="Sin ventanas configuradas"
                                render={(peak) => {
                                    const meta = KIND_META[peak.kind];
                                    const PKIcon = meta.icon;
                                    const isNow = Math.abs(peak.startHour - new Date().getHours()) < 2;
                                    return (
                                        <div
                                            className={cn(
                                                "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors",
                                                isNow
                                                    ? "border-violet-500/30 bg-violet-500/[0.07]"
                                                    : "border-border/40 bg-white/[0.02]"
                                            )}
                                        >
                                            <div
                                                className="shrink-0 grid place-items-center size-6 rounded-lg"
                                                style={{ background: `color-mix(in srgb, ${meta.color} 22%, transparent)` }}
                                            >
                                                <PKIcon className="size-3" style={{ color: meta.color }} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10px] font-bold truncate block">{peak.label}</span>
                                                <span className="text-[9px] text-muted-foreground/55">{peak.startHour}:00 h</span>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-0.5">
                                                <Chip color={meta.color}>{meta.label}</Chip>
                                                {isNow && (
                                                    <span className="text-[8px] font-black text-violet-400 uppercase tracking-wider">
                                                        Ahora
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
