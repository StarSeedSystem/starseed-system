'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Vote, Landmark, ChevronRight, ThumbsUp, ThumbsDown, Clock, Scale } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, ProgressRing, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LawProposal } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// PoliticalSummaryWidget — resumen de gobernanza directa.
// Datos en vivo "politics.proposals". Lista por urgencia, Chip por
// stage, barra support/threshold, deadline, voto local.
// Adaptativo + theme-aware. Accent "#FFBF00". Link a /network/politics.
// ════════════════════════════════════════════════════════════════

const ACCENT = "#FFBF00";

const STAGE_META: Record<LawProposal["stage"], { color: string; label: string }> = {
    borrador:   { color: "#94a3b8", label: "Borrador"  },
    firmas:     { color: "#38bdf8", label: "Firmas"    },
    debate:     { color: "#a855f7", label: "Debate"    },
    votacion:   { color: "#FFBF00", label: "Votación"  },
    ratificada: { color: "#10b981", label: "Ratificada"},
};

const SCOPE_LABEL: Record<LawProposal["scope"], string> = {
    vecinal:      "Vecinal",
    municipal:    "Municipal",
    biorregional: "Biorregional",
    global:       "Global",
};

type VoteState = "favor" | "contra" | null;

export function PoliticalSummaryWidget() {
    const { data, loading } = useWidgetData("politics.proposals", { refreshMs: 6000 });
    // Local vote overrides (optimistic UI on top of youVoted from server)
    const [localVotes, setLocalVotes] = useState<Record<string, VoteState>>({});

    const proposals = data ?? [];

    const stats = useMemo(() => {
        const inVoting  = proposals.filter(p => p.stage === "votacion").length;
        const ratified  = proposals.filter(p => p.stage === "ratificada").length;
        const youVoted  = proposals.filter(p => {
            const lv = localVotes[p.id];
            return lv !== undefined ? lv !== null : p.youVoted != null;
        }).length;
        const avgRatio = proposals.length
            ? proposals.reduce((a, p) => a + Math.min(1, p.support / p.threshold), 0) / proposals.length
            : 0;
        return { inVoting, ratified, youVoted, avgRatio };
    }, [proposals, localVotes]);

    // Most urgent: votacion first, then by deadline
    const sorted = useMemo(() => [...proposals].sort((a, b) => {
        const stageOrder = { votacion: 0, debate: 1, firmas: 2, borrador: 3, ratificada: 4 };
        const sd = (stageOrder[a.stage] ?? 5) - (stageOrder[b.stage] ?? 5);
        if (sd !== 0) return sd;
        return a.deadlineTs - b.deadlineTs;
    }), [proposals]);

    const topUrgent = sorted[0];

    function castVote(id: string, v: VoteState) {
        setLocalVotes(prev => ({ ...prev, [id]: prev[id] === v ? null : v }));
    }

    return (
        <WidgetShell
            title="Gobernanza Directa"
            subtitle="Propuestas y votación"
            icon={Landmark}
            accent={ACCENT}
            connections={[
                { label: "Comunidades", href: "/hub", color: "#9FE870" },
                { label: "Cultura", href: "/network/culture", color: "#C9A8FF" },
                { label: "Educación", href: "/network/education", color: "#7FB8FF" },
            ]}
            live
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Ágora <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: propuesta más urgente + barra ──────────
                if (micro) {
                    if (!topUrgent) return <div className="h-full grid place-items-center text-xs text-muted-foreground/50 italic">Sin propuestas</div>;
                    const ratio = Math.min(1, topUrgent.support / topUrgent.threshold);
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={ratio} size={52} stroke={5} color={STAGE_META[topUrgent.stage].color}
                                label={`${Math.round(ratio * 100)}%`} sublabel="apoyo" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black line-clamp-2 leading-tight">{topUrgent.title}</p>
                                <p className="text-[9px] uppercase tracking-wide font-bold mt-0.5" style={{ color: STAGE_META[topUrgent.stage].color }}>
                                    {STAGE_META[topUrgent.stage].label} · {timeUntil(topUrgent.deadlineTs)}
                                </p>
                            </div>
                        </div>
                    );
                }

                const maxItems = size.vTier === "expanded" ? 4 : size.vTier === "compact" ? 2 : 3;
                const showStats = size.vTier !== "compact";

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">

                        {/* Métricas resumen */}
                        {showStats && (
                            <div className="shrink-0 grid grid-cols-3 gap-1.5">
                                {[
                                    { label: "En votación", value: stats.inVoting, color: ACCENT, icon: Vote },
                                    { label: "Ratificadas", value: stats.ratified, color: "#10b981", icon: Scale },
                                    { label: "Tu voz",      value: stats.youVoted, color: "#38bdf8", icon: ThumbsUp },
                                ].map(({ label, value, color, icon: Icon }) => (
                                    <div key={label} className="rounded-xl border border-border/40 bg-white/[0.02] px-2 py-1.5 flex flex-col items-center gap-0.5">
                                        <Icon className="size-3.5" style={{ color }} />
                                        <span className="text-base font-black tabular-nums" style={{ color }}>{value}</span>
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 text-center leading-tight">{label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Barra de consenso global */}
                        {showStats && (
                            <div className="shrink-0">
                                <ProgressBar value={stats.avgRatio} label="Consenso medio" showPct color={ACCENT} height={5} />
                            </div>
                        )}

                        {/* Lista de propuestas */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sorted}
                                max={maxItems}
                                empty="Sin propuestas activas"
                                render={(p) => {
                                    const stageInfo = STAGE_META[p.stage];
                                    const ratio = Math.min(1, p.support / p.threshold);
                                    const effectiveVote = localVotes[p.id] !== undefined ? localVotes[p.id] : (p.youVoted ?? null);
                                    const canVote = p.stage === "votacion" || p.stage === "debate";
                                    return (
                                        <motion.div
                                            whileHover={{ scale: 1.005 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-amber-500/20 transition-colors"
                                        >
                                            {/* Fila 1: título + chip stage */}
                                            <div className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] @sm:text-xs font-bold line-clamp-2 leading-snug">{p.title}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <Chip color={stageInfo.color}>{stageInfo.label}</Chip>
                                                        <span className="text-[9px] text-muted-foreground/60 font-semibold">{SCOPE_LABEL[p.scope]}</span>
                                                    </div>
                                                </div>
                                                {/* Deadline */}
                                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground/60">
                                                    <Clock className="size-2.5" />{timeUntil(p.deadlineTs)}
                                                </span>
                                            </div>

                                            {/* Barra support/threshold */}
                                            <div className="mt-1.5">
                                                <ProgressBar value={ratio} color={stageInfo.color} height={4} />
                                                <div className="flex items-center justify-between mt-0.5">
                                                    <span className="text-[8px] text-muted-foreground/50 font-bold">
                                                        {p.support.toLocaleString()} / {p.threshold.toLocaleString()}
                                                    </span>
                                                    <span className="text-[8px] font-black tabular-nums" style={{ color: stageInfo.color }}>
                                                        {Math.round(ratio * 100)}%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Botones de voto (si aplica) */}
                                            {canVote && (
                                                <div className="mt-1.5 flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => castVote(p.id, "favor")}
                                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${effectiveVote === "favor" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/60 hover:border-emerald-500/30 hover:text-emerald-400"}`}
                                                    >
                                                        <ThumbsUp className="size-2.5" /> A favor
                                                    </button>
                                                    <button
                                                        onClick={() => castVote(p.id, "contra")}
                                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${effectiveVote === "contra" ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "border-border/40 text-muted-foreground/60 hover:border-rose-500/30 hover:text-rose-400"}`}
                                                    >
                                                        <ThumbsDown className="size-2.5" /> En contra
                                                    </button>
                                                    {effectiveVote && (
                                                        <span className="ml-auto text-[8px] font-bold uppercase tracking-wide"
                                                            style={{ color: effectiveVote === "favor" ? "#10b981" : "#f43f5e" }}>
                                                            Votado
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
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
