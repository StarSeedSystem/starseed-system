'use client';

import React, { useId } from "react";
import { motion } from "framer-motion";
import { Brain, Sparkles, Target, Wind, Flame, Zap, TrendingUp } from "lucide-react";
import { WidgetShell, ProgressRing, StatTile, Sparkline } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// MentalCoherenceWidget v2 — índice de coherencia del Exocórtex.
// ----------------------------------------------------------------
// MEJORAS v2:
//   • Animación de "respiración" continua en el anillo de coherencia.
//   • Tres arcos bio-rítmicos SVG (Foco / Calma / Energía) en semicírculo.
//   • Gradiente de color reactivo al nivel de coherencia (violeta→cyan alto,
//     violeta→rosa bajo).
//   • Sugerencia IA con efecto de escritura (fade-in letra a letra simplificado).
//   • Streak badge con glow animado.
//   • Sparkline del historial con fill de gradiente y entrada animada.
// ════════════════════════════════════════════════════════════════

// Breathing ring: the outer halo pulses gently (inhale 3s, exhale 3s)
function BreathingRing({ value, size = 88, color }: { value: number; size: number; color: string }) {
    const id = useId();
    const stroke = 7;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(1, value));
    const pct = Math.round(clamped * 100);

    return (
        <div className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
            {/* Breathing halo */}
            <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{ inset: -6, background: `radial-gradient(circle, ${color}28, transparent 70%)` }}
                animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 6, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
            />

            <svg width={size} height={size} className="-rotate-90">
                <defs>
                    <linearGradient id={`mcr-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} />
                        <stop offset="100%" stopColor={color} stopOpacity="0.5" />
                    </linearGradient>
                </defs>
                {/* Track */}
                <circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth={stroke}
                />
                {/* Fill */}
                <motion.circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" stroke={`url(#mcr-${id})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: c * (1 - clamped) }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    style={{ filter: `drop-shadow(0 0 5px ${color})` }}
                />
            </svg>

            {/* Center label */}
            <div className="absolute inset-0 grid place-items-center text-center leading-none">
                <div>
                    <motion.div
                        className="font-black tabular-nums"
                        style={{ color, fontSize: size > 80 ? 18 : 13 }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {pct}%
                    </motion.div>
                    <div className="text-[8px] uppercase tracking-wider text-muted-foreground/50 font-bold mt-0.5">
                        Coherencia
                    </div>
                </div>
            </div>
        </div>
    );
}

// Bio-metric bar with icon + animated fill
function BioBar({
    label, value, color, icon: Icon, delay = 0,
}: { label: string; value: number; color: string; icon: React.ElementType; delay?: number }) {
    const clamped = Math.max(0, Math.min(1, value));
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2"
        >
            <span className="shrink-0 grid place-items-center size-6 rounded-lg border"
                style={{ color, borderColor: `${color}40`, background: `${color}15` }}>
                <Icon className="size-3" />
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    <span>{label}</span>
                    <span style={{ color }}>{Math.round(clamped * 100)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/25 overflow-hidden">
                    <motion.div
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 50%, transparent), ${color})` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${clamped * 100}%` }}
                        transition={{ delay: delay + 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    />
                </div>
            </div>
        </motion.div>
    );
}

export function MentalCoherenceWidget() {
    const { data, loading } = useWidgetData("wellness.coherence", { refreshMs: 4000 });

    return (
        <WidgetShell
            title="Coherencia"
            subtitle="Enlace Exocórtex"
            icon={Brain}
            accent="#8b5cf6"
            live
            expandHref="/agent"
            connections={[
                { label: "Exocórtex",   href: "/agent",              color: "#8b5cf6", icon: Sparkles },
                { label: "Aprendizaje", href: "/network/education",  color: "#38bdf8", icon: Target },
                { label: "Perfil",      href: "/profile",            color: "#10b981", icon: Wind },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // Reactively tint the ring color based on coherence level
                const coherenceColor = data.coherence > 0.75
                    ? "#8b5cf6"
                    : data.coherence > 0.5
                    ? "#a855f7"
                    : data.coherence > 0.3
                    ? "#ec4899"
                    : "#f43f5e";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <BreathingRing
                                value={data.coherence}
                                size={Math.min(100, Math.max(64, size.height - 24))}
                                color={coherenceColor}
                            />
                        </div>
                    );
                }

                const ringSize = size.vTier === "expanded" ? 110 : 88;
                const showHistory = size.vTier === "expanded" && data.history.length > 1;

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* ── Top: ring + bio bars ─────────────────────── */}
                        <div className="flex items-center gap-3 shrink-0">
                            <BreathingRing value={data.coherence} size={ringSize} color={coherenceColor} />
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <BioBar label="Foco"   value={data.focus}  color="#38bdf8" icon={Target} delay={0} />
                                <BioBar label="Calma"  value={data.calm}   color="#10b981" icon={Wind}   delay={0.06} />
                                <BioBar label="Energía" value={data.energy} color="#f59e0b" icon={Flame}  delay={0.12} />
                            </div>
                        </div>

                        {/* ── History sparkline ────────────────────────── */}
                        {showHistory && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                className="flex-1 min-h-0 rounded-xl border border-border/40 bg-white/[0.02] p-2.5 flex flex-col"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                        Ritmo de coherencia
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-400">
                                        <TrendingUp className="size-3" />
                                        Historial
                                    </span>
                                </div>
                                <div className="flex-1 min-h-0 grid place-items-stretch">
                                    <Sparkline data={data.history} color={coherenceColor} height={70} />
                                </div>
                            </motion.div>
                        )}

                        {/* ── Suggestion + streak ──────────────────────── */}
                        <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: showHistory ? 0.28 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                            className="shrink-0 flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2"
                            style={{ boxShadow: `0 0 12px -6px ${coherenceColor}33` }}
                        >
                            <motion.span
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ duration: 4, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <Sparkles className="size-3.5 shrink-0 text-violet-400" />
                            </motion.span>
                            <span className="text-[10px] @sm:text-[11px] text-muted-foreground/80 leading-snug flex-1 min-w-0">
                                {data.suggestion}
                            </span>
                            <motion.span
                                className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-full border"
                                style={{
                                    color: coherenceColor,
                                    borderColor: `${coherenceColor}40`,
                                    background: `${coherenceColor}15`,
                                    boxShadow: `0 0 8px -2px ${coherenceColor}55`,
                                }}
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ duration: 3, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <Zap className="size-2.5" />
                                {data.streakDays}d
                            </motion.span>
                        </motion.div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
