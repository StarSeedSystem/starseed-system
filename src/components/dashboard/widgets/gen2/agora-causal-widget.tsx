'use client';

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Vote, ThumbsUp, ThumbsDown, Leaf, Building2, Globe2, Users, ChevronLeft, Filter, Clock, TrendingUp } from "lucide-react";
import { WidgetShell, ProgressBar, Chip, MiniList, timeUntil } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LawProposal } from "@/lib/widget-data/types";
import { cn } from "@/lib/utils";

const scopeIcon = { vecinal: Users, municipal: Building2, biorregional: Leaf, global: Globe2 } as const;
const scopeLabel = { vecinal: "Vecinal", municipal: "Municipal", biorregional: "Biorregional", global: "Global" } as const;
const stageColor: Record<LawProposal["stage"], string> = {
    borrador: "hsl(var(--muted-foreground))",
    firmas: "#38bdf8",
    debate: "#f59e0b",
    votacion: "#10b981",
    ratificada: "#a78bfa",
};
const stageLabel: Record<LawProposal["stage"], string> = {
    borrador: "Borrador", firmas: "Firmas", debate: "Debate", votacion: "Votación", ratificada: "Ratificada",
};

type Vote = "favor" | "contra";
type StageFilter = "todas" | "debate" | "votacion" | "ratificada";
const FILTERS: { id: StageFilter; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "debate", label: "En debate" },
    { id: "votacion", label: "En votación" },
    { id: "ratificada", label: "Aprobadas" },
];

export function AgoraCausalWidget() {
    const { data, loading } = useWidgetData("politics.proposals", { refreshMs: 6000 });
    const [votes, setVotes] = useState<Record<string, Vote>>({});
    const [filter, setFilter] = useState<StageFilter>("todas");
    const [openId, setOpenId] = useState<string | null>(null);

    const proposals = data ?? [];

    // Conteo local de votos por propuesta (determinista desde id + voto local).
    function baseTally(p: LawProposal): { favor: number; contra: number } {
        let h = 0;
        for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
        const favor = p.support;
        const contra = Math.round(p.support * (0.25 + (h % 100) / 100 * 0.35));
        return { favor, contra };
    }

    function tally(p: LawProposal): { favor: number; contra: number } {
        const t = baseTally(p);
        const v = votes[p.id] ?? (p.youVoted === "favor" || p.youVoted === "contra" ? p.youVoted : undefined);
        if (v === "favor") return { favor: t.favor + 1, contra: t.contra };
        if (v === "contra") return { favor: t.favor, contra: t.contra + 1 };
        return t;
    }

    const filtered = useMemo(() => {
        const arr = filter === "todas" ? proposals : proposals.filter((p) => p.stage === filter);
        const order = { votacion: 0, debate: 1, firmas: 2, ratificada: 3, borrador: 4 };
        return [...arr].sort((a, b) => (order[a.stage] - order[b.stage]) || (a.deadlineTs - b.deadlineTs));
    }, [proposals, filter]);

    const openProposal = openId ? proposals.find((p) => p.id === openId) ?? null : null;

    function cast(id: string, v: Vote) {
        setVotes((prev) => ({ ...prev, [id]: prev[id] === v ? (undefined as unknown as Vote) : v }));
    }

    return (
        <WidgetShell
            title="Ágora Causal"
            subtitle="Soberanía directa"
            icon={Vote}
            accent="#10b981"
            live
            connections={[
                { label: "Gobernanza", href: "/network/politics", color: "#FFBF00" },
                { label: "Comunidades", href: "/hub", color: "#9FE870" },
            ]}
        >
            {(size) => {
                if (loading && !data) return <Skeleton />;

                // ── Vista de detalle / expandida de una propuesta ──
                if (openProposal) {
                    const t = tally(openProposal);
                    const total = t.favor + t.contra || 1;
                    const favorPct = t.favor / total;
                    const myVote = votes[openProposal.id] ?? (openProposal.youVoted === "favor" || openProposal.youVoted === "contra" ? openProposal.youVoted : undefined);
                    const Scope = scopeIcon[openProposal.scope];
                    const pct = Math.min(1, openProposal.support / openProposal.threshold);
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 h-full">
                            <button onClick={() => setOpenId(null)}
                                className="self-start inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer">
                                <ChevronLeft className="size-3" /> Volver
                            </button>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <Chip color={stageColor[openProposal.stage]}>{stageLabel[openProposal.stage]}</Chip>
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/70">
                                    <Scope className="size-3" /> {scopeLabel[openProposal.scope]}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/70 ml-auto">
                                    <Clock className="size-3" /> {timeUntil(openProposal.deadlineTs)}
                                </span>
                            </div>
                            <h4 className="text-sm @sm:text-base font-black leading-tight">{openProposal.title}</h4>
                            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{openProposal.summary}</p>

                            <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-3 space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className="text-emerald-400">A favor · {t.favor.toLocaleString()}</span>
                                    <span className="text-rose-400">En contra · {t.contra.toLocaleString()}</span>
                                </div>
                                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rose-500/30">
                                    <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400"
                                        initial={{ width: 0 }} animate={{ width: `${favorPct * 100}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
                                </div>
                                <ProgressBar value={pct} color={stageColor[openProposal.stage]} showPct
                                    label={`Apoyo: ${openProposal.support.toLocaleString()} / ${openProposal.threshold.toLocaleString()}`} height={6} />
                            </div>

                            {/* Impacto previsto */}
                            <div className="grid grid-cols-3 gap-1.5">
                                {([
                                    ["Fiscal", openProposal.impact.taxes],
                                    ["Ecología", openProposal.impact.ecology],
                                    ["Sector", openProposal.impact.sector],
                                ] as const).map(([label, val]) => {
                                    const positive = val >= 0;
                                    return (
                                        <div key={label} className="rounded-xl border border-border/40 bg-white/[0.02] px-2 py-1.5 text-center">
                                            <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60">{label}</div>
                                            <div className={cn("mt-0.5 inline-flex items-center gap-0.5 text-xs font-black tabular-nums", positive ? "text-emerald-400" : "text-rose-400")}>
                                                <TrendingUp className={cn("size-3", !positive && "rotate-180")} />
                                                {positive ? "+" : ""}{Math.round(val * 100)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-auto">
                                <VoteButton kind="favor" active={myVote === "favor"} onClick={() => cast(openProposal.id, "favor")} />
                                <VoteButton kind="contra" active={myVote === "contra"} onClick={() => cast(openProposal.id, "contra")} />
                            </div>
                        </div>
                    );
                }

                const max = size.vTier === "micro" ? 2 : size.vTier === "compact" ? 3 : size.vTier === "regular" ? 4 : 7;
                const showFilters = size.tier !== "micro" && size.vTier !== "micro";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {showFilters && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                <Filter className="size-3 shrink-0 text-muted-foreground/50" />
                                {FILTERS.map((f) => {
                                    const count = f.id === "todas" ? proposals.length : proposals.filter((p) => p.stage === f.id).length;
                                    return (
                                        <button key={f.id} onClick={() => setFilter(f.id)}
                                            className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                                filter === f.id ? "bg-emerald-500/20 border-emerald-500/45 text-emerald-300" : "border-border/40 text-muted-foreground/60 hover:border-emerald-500/30")}>
                                            {f.label} {count > 0 && <span className="opacity-60">{count}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={filtered}
                                max={max}
                                empty="Sin propuestas en esta fase"
                                render={(p) => {
                                    const Scope = scopeIcon[p.scope];
                                    const t = tally(p);
                                    const myVote = votes[p.id] ?? (p.youVoted === "favor" || p.youVoted === "contra" ? p.youVoted : undefined);
                                    const pct = Math.min(1, p.support / p.threshold);
                                    const detailed = size.tier !== "micro";
                                    return (
                                        <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-2.5 @sm:p-3 hover:border-emerald-500/30 transition-colors">
                                            <button onClick={() => setOpenId(p.id)} className="w-full text-left cursor-pointer">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Chip color={stageColor[p.stage]}>{stageLabel[p.stage]}</Chip>
                                                    {detailed && <Scope className="size-3 text-muted-foreground/60" />}
                                                    {detailed && <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground/50"><Clock className="size-2.5" />{timeUntil(p.deadlineTs)}</span>}
                                                </div>
                                                <h4 className="mt-1 text-xs @sm:text-sm font-bold leading-tight line-clamp-1">{p.title}</h4>
                                                {detailed && size.vTier !== "compact" && (
                                                    <p className="mt-0.5 text-[10px] text-muted-foreground/60 line-clamp-2 leading-snug">{p.summary}</p>
                                                )}
                                            </button>
                                            <div className="mt-2">
                                                <ProgressBar value={pct} color={stageColor[p.stage]} showPct label={`${p.support.toLocaleString()} / ${p.threshold.toLocaleString()}`} />
                                            </div>
                                            {(p.stage === "votacion" || p.stage === "debate") && (
                                                <div className="mt-2 grid grid-cols-2 gap-1.5">
                                                    <VoteButton kind="favor" compact active={myVote === "favor"} count={t.favor} onClick={() => cast(p.id, "favor")} />
                                                    <VoteButton kind="contra" compact active={myVote === "contra"} count={t.contra} onClick={() => cast(p.id, "contra")} />
                                                </div>
                                            )}
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

function VoteButton({ kind, active, onClick, compact, count }: { kind: Vote; active: boolean; onClick: () => void; compact?: boolean; count?: number }) {
    const isFavor = kind === "favor";
    const Icon = isFavor ? ThumbsUp : ThumbsDown;
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl font-black uppercase tracking-wider border transition-colors cursor-pointer",
                compact ? "py-1.5 text-[10px]" : "py-2.5 text-xs",
                active
                    ? isFavor ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-300" : "bg-rose-500/25 border-rose-500/50 text-rose-300"
                    : isFavor ? "bg-white/5 border-border/40 hover:border-emerald-500/40 text-muted-foreground" : "bg-white/5 border-border/40 hover:border-rose-500/40 text-muted-foreground"
            )}>
            <Icon className={compact ? "size-3" : "size-4"} /> {isFavor ? "A favor" : "Contra"}
            {typeof count === "number" && <span className="opacity-60 tabular-nums">{count.toLocaleString()}</span>}
        </button>
    );
}

function Skeleton() {
    return (
        <div className="space-y-2 pt-1">
            <AnimatePresence>
                {[0, 1, 2].map((i) => (
                    <motion.div key={i} animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                        className="h-16 rounded-2xl bg-muted/15" />
                ))}
            </AnimatePresence>
        </div>
    );
}
