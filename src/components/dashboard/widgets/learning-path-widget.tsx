'use client';

import Link from "next/link";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { GraduationCap, Bot, User, Users, ChevronRight, TrendingUp, PlayCircle, CheckCircle2, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, ProgressBar, ProgressRing } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LearningPath } from "@/lib/widget-data";
import { useEffect } from "react";

// ════════════════════════════════════════════════════════════════
// LearningPathWidget — rutas de aprendizaje del usuario (mentoría
// híbrida humano + IA). Datos "education.paths". Adaptativo.
// Progreso en % entero (redondeo consistente) y próxima acción
// concreta destacada como CTA.
// ════════════════════════════════════════════════════════════════
const MENTOR_ICON: Record<LearningPath["mentorKind"], LucideIcon> = {
    humano: User, ia: Bot, hibrido: Users,
};
const MENTOR_LABEL: Record<LearningPath["mentorKind"], string> = {
    humano: "Mentor humano", ia: "Exocórtex IA", hibrido: "Mentoría híbrida",
};
// Porcentajes localizados y consistentes (es-ES, sin decimales).
const PCT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const fmtPct = (p: number) => PCT_ES.format(Math.round(p * 100));

/** Número animado que cuenta desde 0 hasta `target` al montar. */
function AnimatedPct({ target, color }: { target: number; color: string }) {
    const mv = useMotionValue(0);
    const rounded = useTransform(mv, (v) => `${Math.round(v)}%`);

    useEffect(() => {
        const ctrl = animate(mv, target, { duration: 0.8, ease: "easeOut" });
        return ctrl.stop;
    }, [mv, target]);

    return (
        <motion.span style={{ color }} className="text-[10px] font-black tabular-nums shrink-0">
            {rounded}
        </motion.span>
    );
}

/** Línea vertical SVG animada que conecta los items de la ruta. */
function PathTreeLine({ color, count }: { color: string; count: number }) {
    const height = count * 64; // ~64px por item
    return (
        <div className="absolute left-[18px] top-8 bottom-0 pointer-events-none" style={{ height }}>
            <svg width="2" height={height} style={{ overflow: "visible" }}>
                <motion.line
                    x1="1" y1="0" x2="1" y2={height}
                    stroke={color} strokeWidth="1.5"
                    strokeDasharray="4 3"
                    strokeOpacity={0.4}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
                />
            </svg>
        </div>
    );
}

export function LearningPathWidget() {
    const { data, loading } = useWidgetData("education.paths", { refreshMs: 15000 });

    return (
        <WidgetShell
            title="Ruta de Aprendizaje"
            subtitle="Mentoría humano · IA"
            icon={GraduationCap}
            accent="#a855f7"
            connections={[{ label: "Educación", href: "/network/education", color: "#7FB8FF" }, { label: "Biblioteca", href: "/library", color: "#FFBF00" }, { label: "Agente IA", href: "/agent", color: "#22d3ee" }]}
            expandHref="/network/education"
            actions={
                <Link href="/network/education" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Aprender <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                !loading && data && data.length ? (() => {
                    const avg = data.reduce((s, p) => s + p.progress, 0) / data.length;
                    const done = data.filter((p) => p.progress >= 0.999).length;
                    return (
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/70 min-w-0">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                <span className="size-1.5 rounded-full shrink-0" style={{ background: "#a855f7" }} />
                                <span className="truncate">{data.length} rutas · {done} completadas</span>
                            </span>
                            <span className="shrink-0 inline-flex items-center gap-1">
                                <TrendingUp className="size-3" style={{ color: "#a855f7" }} />
                                <span className="font-black tabular-nums" style={{ color: "#a855f7" }}>{fmtPct(avg)}%</span>
                                <span className="text-muted-foreground/50">medio</span>
                            </span>
                        </div>
                    );
                })() : undefined
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const isExpanded = size.vTier === "expanded";
                const sorted = [...data].sort((a, b) => b.progress - a.progress);
                const max = micro ? 3 : isExpanded ? 4 : 3;
                const shown = sorted.slice(0, max);

                return (
                    <div className="pt-1 h-full">
                        {/* Árbol visual de rutas (solo en expanded + normal, no micro) */}
                        {!micro && (
                            <div className="relative">
                                {isExpanded && shown.length > 1 && (
                                    <PathTreeLine color="#a855f7" count={shown.length} />
                                )}
                                <div className="flex flex-col gap-1.5">
                                    {shown.map((p, idx) => {
                                        const MentorIcon = MENTOR_ICON[p.mentorKind];
                                        const pct = Math.round(p.progress * 100);
                                        const isDone = p.progress >= 0.999;

                                        return (
                                            <motion.div
                                                key={p.title}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.3, delay: idx * 0.07, ease: "easeOut", type: "spring", stiffness: 220, damping: 20 }}
                                                whileHover={{ y: -1 }}
                                            >
                                                <Link href="/network/education" className="block cursor-pointer">
                                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 hover:bg-white/[0.04] transition-colors">
                                                        <div className="shrink-0 relative">
                                                            <ProgressRing value={p.progress} size={38} stroke={4} color={p.accent} />
                                                            {isDone && (
                                                                <span className="absolute inset-0 grid place-items-center">
                                                                    <CheckCircle2 className="size-3.5" style={{ color: p.accent }} />
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[11px] @sm:text-xs font-bold truncate min-w-0">{p.title}</span>
                                                                <AnimatedPct target={pct} color={p.accent} />
                                                            </div>
                                                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70 min-w-0">
                                                                <span className="truncate min-w-0 capitalize">{p.discipline}</span>
                                                                <span className="inline-flex items-center gap-1 shrink-0" title={MENTOR_LABEL[p.mentorKind]}>
                                                                    <MentorIcon className="size-3" style={{ color: p.accent }} /> {p.mentor}
                                                                </span>
                                                            </div>

                                                            {/* CTA "Continuar" — visible en normal y expanded */}
                                                            {!isDone && (
                                                                <div
                                                                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold min-w-0 max-w-full"
                                                                    style={{ color: p.accent, borderColor: `color-mix(in srgb, ${p.accent} 35%, transparent)`, background: `color-mix(in srgb, ${p.accent} 10%, transparent)` }}
                                                                >
                                                                    <PlayCircle className="size-3 shrink-0" />
                                                                    <span className="uppercase tracking-wider shrink-0">Continuar</span>
                                                                    {isExpanded && (
                                                                        <span className="truncate min-w-0 font-semibold normal-case tracking-normal text-foreground/80">{p.nextLesson}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Link>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Modo micro: lista horizontal de progreso compacta */}
                        {micro && (
                            <MiniList
                                items={sorted}
                                max={max}
                                empty="Sin rutas activas"
                                render={(p) => (
                                    <Link href="/network/education" className="block cursor-pointer">
                                        <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <span className="text-[11px] font-bold truncate min-w-0">{p.title}</span>
                                                    <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: p.accent }}>{fmtPct(p.progress)}%</span>
                                                </div>
                                                <ProgressBar value={p.progress} color={p.accent} height={3} />
                                            </div>
                                        </div>
                                    </Link>
                                )}
                            />
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
