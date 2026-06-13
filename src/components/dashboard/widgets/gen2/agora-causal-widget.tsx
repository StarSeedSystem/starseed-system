'use client';

import { useState } from "react";
import { motion } from "framer-motion";
import { Vote, ThumbsUp, ThumbsDown, Leaf, Building2, Globe2, Users } from "lucide-react";
import { WidgetShell, ProgressBar, Chip, MiniList } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LawProposal } from "@/lib/widget-data/types";
import { cn } from "@/lib/utils";

const scopeIcon = { vecinal: Users, municipal: Building2, biorregional: Leaf, global: Globe2 } as const;
const stageColor: Record<LawProposal["stage"], string> = {
    borrador: "hsl(var(--muted-foreground))",
    firmas: "#38bdf8",
    debate: "#f59e0b",
    votacion: "#10b981",
    ratificada: "#a78bfa",
};

export function AgoraCausalWidget() {
    const { data, loading } = useWidgetData("politics.proposals", { refreshMs: 6000 });
    const [votes, setVotes] = useState<Record<string, "favor" | "contra">>({});

    return (
        <WidgetShell title="Ágora Causal" subtitle="Soberanía directa" icon={Vote} live>
            {(size) => {
                if (loading || !data) return <Skeleton />;
                const max = size.vTier === "micro" ? 2 : size.vTier === "compact" ? 3 : size.vTier === "regular" ? 4 : 6;
                return (
                    <MiniList
                        items={data}
                        max={max}
                        render={(p) => {
                            const Scope = scopeIcon[p.scope];
                            const youVoted = votes[p.id] ?? p.youVoted ?? undefined;
                            const pct = Math.min(1, p.support / p.threshold);
                            const detailed = size.tier !== "micro";
                            return (
                                <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-2.5 @sm:p-3">
                                    <div className="flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Chip color={stageColor[p.stage]}>{p.stage}</Chip>
                                                {detailed && <Scope className="size-3 text-muted-foreground/60" />}
                                            </div>
                                            <h4 className="mt-1 text-xs @sm:text-sm font-bold leading-tight truncate">{p.title}</h4>
                                            {detailed && size.vTier !== "compact" && (
                                                <p className="mt-0.5 text-[10px] text-muted-foreground/60 line-clamp-2 leading-snug">{p.summary}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2">
                                        <ProgressBar value={pct} color={stageColor[p.stage]} showPct label={`${p.support.toLocaleString()} / ${p.threshold.toLocaleString()}`} />
                                    </div>
                                    {p.stage === "votacion" && (
                                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                                            <button
                                                onClick={() => setVotes((v) => ({ ...v, [p.id]: "favor" }))}
                                                className={cn("flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[10px] font-black uppercase tracking-wider border transition-colors",
                                                    youVoted === "favor" ? "bg-emerald-500/25 border-emerald-500/50 text-emerald-300" : "bg-white/5 border-border/40 hover:border-emerald-500/40 text-muted-foreground")}>
                                                <ThumbsUp className="size-3" /> A favor
                                            </button>
                                            <button
                                                onClick={() => setVotes((v) => ({ ...v, [p.id]: "contra" }))}
                                                className={cn("flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[10px] font-black uppercase tracking-wider border transition-colors",
                                                    youVoted === "contra" ? "bg-rose-500/25 border-rose-500/50 text-rose-300" : "bg-white/5 border-border/40 hover:border-rose-500/40 text-muted-foreground")}>
                                                <ThumbsDown className="size-3" /> Contra
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        }}
                    />
                );
            }}
        </WidgetShell>
    );
}

function Skeleton() {
    return (
        <div className="space-y-2 pt-1">
            {[0, 1, 2].map((i) => (
                <motion.div key={i} animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                    className="h-16 rounded-2xl bg-muted/15" />
            ))}
        </div>
    );
}
