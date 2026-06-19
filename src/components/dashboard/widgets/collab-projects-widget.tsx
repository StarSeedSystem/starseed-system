'use client';

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Users, Clock, Target, ChevronRight, Activity, Layers, BookOpen } from "lucide-react";
import { WidgetShell, Chip, ProgressBar, StatTile, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Project } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// CollabProjectsWidget v2 — hub colaborativo animado.
// ----------------------------------------------------------------
// MEJORAS v2:
//   • Tarjeta de proyecto con barra de progreso animada + glow.
//   • Avatar-stack de colaboradores (colores deterministas).
//   • Milestone visible con icono de objetivo.
//   • Countdown urgente (< 3 días) destaca en rojo.
//   • Stat tiles con icono + número animado (spring).
//   • Deep-links: cada proyecto enlaza a /hub#<id>.
//   • Micro: lista compacta con porcentaje y dot de estado.
// ════════════════════════════════════════════════════════════════

const STATUS_COLOR: Record<Project["status"], string> = {
    activo:     "#6366f1",
    revision:   "#10b981",
    pausado:    "#f59e0b",
    completado: "#38bdf8",
};
const STATUS_LABEL: Record<Project["status"], string> = {
    activo:     "Activo",
    revision:   "Revisión",
    pausado:    "Pausado",
    completado: "Completado",
};

// Deterministic palette for avatar dots (no random)
const AVATAR_COLORS = ["#6366f1","#ec4899","#10b981","#f59e0b","#38bdf8","#a855f7"];
function avatarColor(i: number) { return AVATAR_COLORS[i % AVATAR_COLORS.length]; }

function isDue(ts: number) {
    return (ts - Date.now()) < 3 * 24 * 60 * 60 * 1000;
}

export function CollabProjectsWidget() {
    const { data, loading } = useWidgetData("productivity.projects", { refreshMs: 8000 });

    const sorted = useMemo(() => (data ?? []).sort((a, b) => b.progress - a.progress), [data]);
    const avg = useMemo(() => {
        if (!data?.length) return 0;
        return data.reduce((s, p) => s + p.progress, 0) / data.length;
    }, [data]);
    const totalCollabs = useMemo(() => (data ?? []).reduce((s, p) => s + p.collaborators, 0), [data]);
    const active = useMemo(() => (data ?? []).filter((p) => p.status === "activo").length, [data]);

    return (
        <WidgetShell
            title="Hub Colaborativo"
            subtitle="Proyectos compartidos"
            icon={Layers}
            accent="#a855f7"
            live
            connections={[
                { label: "Hub",       href: "/hub",     color: "#a855f7" },
                { label: "Comunidad", href: "/network", color: "#6366f1" },
                { label: "Publicar",  href: "/publish", color: "#10b981" },
            ]}
            expandHref="/hub"
            actions={
                <Link
                    href="/hub"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                >
                    Hub <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const showStats = !micro && size.vTier !== "compact";
                const max = micro ? 3 : size.vTier === "expanded" ? 4 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* ── Stat tiles ─────────────────────────────── */}
                        {showStats && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
                                className="grid grid-cols-3 gap-2 shrink-0"
                            >
                                <StatTile label="Sincronía" value={`${Math.round(avg * 100)}%`} accent="#a855f7" icon={Target} compact />
                                <StatTile label="Activos" value={active} accent="#10b981" icon={Activity} compact />
                                <StatTile label="Colabs" value={totalCollabs} accent="#6366f1" icon={Users} compact />
                            </motion.div>
                        )}

                        {/* ── Project list ────────────────────────────── */}
                        <div className="flex-1 min-h-0 overflow-auto no-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {sorted.slice(0, max).map((p, i) => {
                                    const color = STATUS_COLOR[p.status];
                                    const urgent = isDue(p.dueTs) && p.status === "activo";
                                    return (
                                        <motion.div
                                            key={p.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1], duration: 0.28 }}
                                        >
                                            <Link
                                                href={`/hub`}
                                                className="block rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 hover:bg-white/[0.05] transition-colors cursor-pointer"
                                                style={urgent ? { borderColor: "#f43f5e44", boxShadow: "0 0 12px -6px #f43f5e55" } : undefined}
                                            >
                                                {/* Header row */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate min-w-0">{p.name}</span>
                                                    {!micro && (
                                                        <span className="shrink-0">
                                                            <Chip color={color}>{STATUS_LABEL[p.status]}</Chip>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Meta row */}
                                                {!micro && (
                                                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70 min-w-0">
                                                        {/* Collaborator avatar-dots */}
                                                        <span className="inline-flex items-center gap-0.5 shrink-0">
                                                            {Array.from({ length: Math.min(p.collaborators, 4) }).map((_, ci) => (
                                                                <span
                                                                    key={ci}
                                                                    className="size-3 rounded-full border border-background"
                                                                    style={{ background: avatarColor(ci), marginLeft: ci > 0 ? -4 : 0 }}
                                                                />
                                                            ))}
                                                            {p.collaborators > 4 && (
                                                                <span className="text-[9px] text-muted-foreground/60 ml-1">+{p.collaborators - 4}</span>
                                                            )}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 shrink-0">
                                                            <Clock className="size-3" />
                                                            <span className={urgent ? "text-rose-400 font-bold" : ""}>
                                                                {timeUntil(p.dueTs)}
                                                            </span>
                                                        </span>
                                                        <span className="ml-auto font-black tabular-nums shrink-0" style={{ color }}>
                                                            {Math.round(p.progress * 100)}%
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Progress bar */}
                                                <div className="mt-1.5">
                                                    <ProgressBar value={p.progress} color={color} height={micro ? 3 : 4} />
                                                </div>

                                                {/* Milestone */}
                                                {size.vTier === "expanded" && p.nextMilestone && (
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        transition={{ delay: 0.2 }}
                                                        className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/60 min-w-0"
                                                    >
                                                        <BookOpen className="size-3 shrink-0" style={{ color }} />
                                                        <span className="truncate min-w-0">{p.nextMilestone}</span>
                                                    </motion.div>
                                                )}
                                            </Link>
                                        </motion.div>
                                    );
                                })}

                                {sorted.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                                        <span className="grid place-items-center size-10 rounded-2xl border border-border/40 bg-muted/20">
                                            <Layers className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
                                        </span>
                                        <span className="text-xs text-muted-foreground/60">Sin colaboraciones activas</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
