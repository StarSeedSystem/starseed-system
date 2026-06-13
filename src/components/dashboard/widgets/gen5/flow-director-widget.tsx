'use client';

// ════════════════════════════════════════════════════════════════
// FlowDirectorWidget — Director de Flujo Vital
// ----------------------------------------------------------------
// Prioriza energía sobre tiempo. Muestra la marea circadiana del día,
// la energía télica actual, la ventana óptima presente y las crestas
// del día. Toggle local "Modo Fortaleza" para bloquear distracciones.
// Datos "productivity.flow". Adaptativo a todos los tamaños.
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import Link from "next/link";
import {
    Activity, ChevronRight, Shield, ShieldOff,
    Zap, Palette, Brain, Users, Moon, type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
    WidgetShell, ProgressRing, Sparkline, MiniList, Chip,
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

export function FlowDirectorWidget() {
    const { data, loading } = useWidgetData("productivity.flow", { refreshMs: 8000 });
    const [fortressMode, setFortressMode] = useState(false);

    const accent = fortressMode ? FORTRESS_ACCENT : BASE_ACCENT;

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
                const suggMeta = KIND_META[d.suggestion.taskType];
                const SuggIcon = suggMeta.icon;
                const peakMax = expanded ? 5 : compact ? 2 : 3;

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
                                            {d.suggestion.reason}
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

                        {/* Curva circadiana */}
                        {!compact && (
                            <div className="shrink-0">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1 block">
                                    Mareas del día
                                </span>
                                <Sparkline
                                    data={d.circadian}
                                    color={accent}
                                    height={expanded ? 52 : 36}
                                    fill
                                    strokeWidth={2}
                                />
                            </div>
                        )}

                        {/* Lista de ventanas del día */}
                        <div className="flex-1 min-h-0">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1 block">
                                Ventanas
                            </span>
                            <MiniList
                                items={d.peaks}
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
