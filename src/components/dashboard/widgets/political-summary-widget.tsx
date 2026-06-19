'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Vote, Landmark, ChevronRight, ThumbsUp, ThumbsDown, Clock, Scale, Filter, Users } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, ProgressRing, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LawProposal } from "@/lib/widget-data";
import { listPartidos } from "@/data/sample-governance";
import {
    ResponsiveContainer, AreaChart, Area, XAxis, Tooltip,
    BarChart, Bar, Cell,
} from "recharts";

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
type StageFilter = "todas" | LawProposal["stage"];

const FILTERS: { id: StageFilter; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "votacion", label: "Votación" },
    { id: "debate", label: "Debate" },
    { id: "firmas", label: "Firmas" },
    { id: "ratificada", label: "Aprobadas" },
];

// Serie determinista de participación (12 ciclos) derivada del id de propuesta.
function participationSeries(seed: string): { label: string; v: number }[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 12 }, (_, i) => {
        const s = Math.sin((i / 12) * Math.PI * 2 + (h % 100) / 100 * 6.28);
        return { label: `C${i + 1}`, v: Math.round(48 + (s + 1) / 2 * 44) };
    });
}

/** Urgencia < 48h desde el deadline en ms. */
function isUrgent(deadlineTs: number): boolean {
    return deadlineTs - Date.now() < 48 * 3_600_000 && deadlineTs > Date.now();
}

const listItemVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.22 } }),
    exit:   { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const statVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: (i: number) => ({ opacity: 1, scale: 1, transition: { delay: i * 0.08, duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } }),
};

export function PoliticalSummaryWidget() {
    const { data, loading } = useWidgetData("politics.proposals", { refreshMs: 6000 });
    // Local vote overrides (optimistic UI on top of youVoted from server)
    const [localVotes, setLocalVotes] = useState<Record<string, VoteState>>({});
    const [filter, setFilter] = useState<StageFilter>("todas");

    const proposals = data ?? [];

    // Partidos para sección "coalición" en expanded
    const topPartidos = useMemo(() => listPartidos().slice(0, 3), []);

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

    // Distribución por fase (para BarChart) + serie de participación (AreaChart).
    const stageDist = useMemo(() => {
        const order: LawProposal["stage"][] = ["firmas", "debate", "votacion", "ratificada"];
        return order.map((st) => ({
            stage: st,
            label: STAGE_META[st].label,
            value: proposals.filter((p) => p.stage === st).length,
            color: STAGE_META[st].color,
        }));
    }, [proposals]);

    const partSeries = useMemo(() => participationSeries(proposals[0]?.id ?? "seed"), [proposals]);

    // Most urgent: votacion first, then by deadline (con filtro por fase)
    const sorted = useMemo(() => {
        const base = filter === "todas" ? proposals : proposals.filter((p) => p.stage === filter);
        return [...base].sort((a, b) => {
            const stageOrder = { votacion: 0, debate: 1, firmas: 2, borrador: 3, ratificada: 4 };
            const sd = (stageOrder[a.stage] ?? 5) - (stageOrder[b.stage] ?? 5);
            if (sd !== 0) return sd;
            return a.deadlineTs - b.deadlineTs;
        });
    }, [proposals, filter]);

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
                    const urgent = isUrgent(topUrgent.deadlineTs);
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <div style={topUrgent.stage === "votacion" ? { animation: "pulse 2s infinite" } : undefined}>
                                <ProgressRing value={ratio} size={52} stroke={5} color={STAGE_META[topUrgent.stage].color}
                                    label={`${Math.round(ratio * 100)}%`} sublabel="apoyo" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black line-clamp-2 leading-tight">{topUrgent.title}</p>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    <p className="text-[9px] uppercase tracking-wide font-bold" style={{ color: STAGE_META[topUrgent.stage].color }}>
                                        {STAGE_META[topUrgent.stage].label} · {timeUntil(topUrgent.deadlineTs)}
                                    </p>
                                    {urgent && (
                                        <span className="text-[8px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full px-1.5 py-px">URGENTE</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }

                const maxItems = size.vTier === "expanded" ? 4 : size.vTier === "compact" ? 2 : 3;
                const showStats = size.vTier !== "compact";

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">

                        {/* Métricas resumen — entrada escalonada */}
                        {showStats && (
                            <div className="shrink-0 grid grid-cols-3 gap-1.5">
                                {[
                                    { label: "En votación", value: stats.inVoting, color: ACCENT, icon: Vote },
                                    { label: "Ratificadas", value: stats.ratified, color: "#10b981", icon: Scale },
                                    { label: "Tu voz",      value: stats.youVoted, color: "#38bdf8", icon: ThumbsUp },
                                ].map(({ label, value, color, icon: Icon }, i) => (
                                    <motion.div key={label}
                                        custom={i}
                                        variants={statVariants}
                                        initial="hidden"
                                        animate="visible"
                                        className="rounded-xl border border-border/40 bg-white/[0.02] px-2 py-1.5 flex flex-col items-center gap-0.5">
                                        <Icon className="size-3.5" style={{ color }} />
                                        <span className="text-base font-black tabular-nums" style={{ color }}>{value}</span>
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 text-center leading-tight">{label}</span>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Barra de consenso global */}
                        {showStats && (
                            <div className="shrink-0">
                                <ProgressBar value={stats.avgRatio} label="Consenso medio" showPct color={ACCENT} height={5} />
                            </div>
                        )}

                        {/* Mini-gráficas de gobernanza (recharts) — solo si hay alto */}
                        {size.vTier === "expanded" && (
                            <div className="shrink-0 grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2 pt-1.5 pb-1">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-0.5">Participación cívica</p>
                                    <div className="h-12">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={partSeries} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                                                <defs>
                                                    <linearGradient id="ps-part" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                                                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <XAxis dataKey="label" hide />
                                                <Tooltip cursor={false} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10, padding: "2px 6px" }}
                                                    labelStyle={{ display: "none" }} formatter={(v: number) => [`${v}%`, "Participa"]} />
                                                <Area type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={2} fill="url(#ps-part)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2 pt-1.5 pb-1">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-0.5">Propuestas por fase</p>
                                    <div className="h-12">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={stageDist} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                                                <XAxis dataKey="label" hide />
                                                <Tooltip cursor={{ fill: "hsl(var(--muted)/0.2)" }} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10, padding: "2px 6px" }}
                                                    labelStyle={{ fontWeight: 700 }} formatter={(v: number) => [v, "propuestas"]} />
                                                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                                    {stageDist.map((d) => <Cell key={d.stage} fill={d.color} />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sección Partidos (solo expanded) */}
                        {size.vTier === "expanded" && topPartidos.length > 0 && (
                            <div className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Partidos</p>
                                <div className="flex flex-col gap-1">
                                    {topPartidos.map((p) => (
                                        <Link key={p.slug} href={`/partido/${p.slug}`}
                                            className="flex items-center gap-2 hover:bg-white/[0.04] rounded-lg px-1 py-0.5 transition-colors cursor-pointer group">
                                            <span className="size-2 rounded-full shrink-0" style={{ background: p.accent }} />
                                            <span className="text-[10px] font-bold truncate flex-1 group-hover:text-foreground transition-colors text-muted-foreground/80">{p.name}</span>
                                            <span className="text-[9px] font-semibold text-muted-foreground/50 shrink-0 tabular-nums">
                                                <Users className="size-2.5 inline mr-0.5" />{p.members.toLocaleString("es-ES")}
                                            </span>
                                            <ChevronRight className="size-2.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                                        </Link>
                                    ))}
                                </div>
                                {/* Coalición */}
                                {topPartidos[0]?.coalitions?.[0] && (
                                    <p className="mt-1.5 text-[8px] text-muted-foreground/50 font-semibold">
                                        Coalición: {topPartidos[0].coalitions.map(c => c.name).join(" · ")}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Filtro por fase legislativa — con AnimatePresence en el trigger */}
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                <Filter className="size-3 shrink-0 text-muted-foreground/50" />
                                {FILTERS.map((f) => {
                                    const c = f.id === "todas" ? proposals.length : proposals.filter((p) => p.stage === f.id).length;
                                    return (
                                        <button key={f.id} onClick={() => setFilter(f.id)}
                                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer ${filter === f.id ? "bg-amber-500/20 border-amber-500/45 text-amber-300" : "border-border/40 text-muted-foreground/60 hover:border-amber-500/30"}`}>
                                            {f.label}{c > 0 && <span className="opacity-60"> {c}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Lista de propuestas — animada con AnimatePresence */}
                        <div className="flex-1 min-h-0">
                            <AnimatePresence mode="popLayout">
                                <MiniList
                                    key={filter}
                                    items={sorted}
                                    max={maxItems}
                                    empty="Sin propuestas activas"
                                    render={(p, idx) => {
                                        const stageInfo = STAGE_META[p.stage];
                                        const ratio = Math.min(1, p.support / p.threshold);
                                        const effectiveVote = localVotes[p.id] !== undefined ? localVotes[p.id] : (p.youVoted ?? null);
                                        const canVote = p.stage === "votacion" || p.stage === "debate";
                                        const urgent = isUrgent(p.deadlineTs);
                                        const isVoting = p.stage === "votacion";
                                        return (
                                            <motion.div
                                                key={p.id}
                                                custom={idx}
                                                variants={listItemVariants}
                                                initial="hidden"
                                                animate="visible"
                                                exit="exit"
                                                whileHover={{ scale: 1.005 }}
                                                className="rounded-xl border border-border/40 bg-white/[0.02] hover:border-amber-500/20 transition-colors overflow-hidden"
                                                style={isVoting ? { boxShadow: `0 0 0 1px ${stageInfo.color}22` } : undefined}
                                            >
                                                {/* Enlace al área de política (partes no-voto) */}
                                                <Link href="/network/politics" className="block px-2.5 pt-2 pb-1 cursor-pointer">
                                                    {/* Fila 1: título + chip stage + urgente */}
                                                    <div className="flex items-start gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[11px] @sm:text-xs font-bold line-clamp-2 leading-snug">{p.title}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                <span style={isVoting ? { animation: "pulse 2s infinite" } : undefined}>
                                                                    <Chip color={stageInfo.color}>{stageInfo.label}</Chip>
                                                                </span>
                                                                <span className="text-[9px] text-muted-foreground/60 font-semibold">{SCOPE_LABEL[p.scope]}</span>
                                                                {urgent && (
                                                                    <span className="text-[8px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full px-1.5 py-px">URGENTE</span>
                                                                )}
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
                                                </Link>

                                                {/* Botones de voto (si aplica) — fuera del Link */}
                                                {canVote && (
                                                    <div className="px-2.5 pb-2 flex items-center gap-1.5">
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
                            </AnimatePresence>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
