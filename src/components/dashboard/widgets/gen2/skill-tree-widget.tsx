'use client';

import { useState } from "react";
import { GitBranch, BadgeCheck, Target, ChevronRight } from "lucide-react";
import { WidgetShell, ProgressBar, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SkillBranch } from "@/lib/widget-data/types";

function flatten(branch: SkillBranch, depth = 0, acc: { node: SkillBranch; depth: number }[] = []) {
    if (depth > 0) acc.push({ node: branch, depth });
    branch.children?.forEach((c) => flatten(c, depth + 1, acc));
    return acc;
}

export function SkillTreeWidget() {
    const { data, loading } = useWidgetData("education.skilltree", { refreshMs: 15000 });
    const [active, setActive] = useState<string | null>(null);

    return (
        <WidgetShell title="Árbol de Habilidades" subtitle="Maestría aplicada" icon={GitBranch} accent="#a78bfa">
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const rows = flatten(data);
                const max = size.vTier === "micro" ? 3 : size.vTier === "compact" ? 4 : size.vTier === "regular" ? 6 : 10;
                const overall = rows.reduce((s, r) => s + r.node.mastery, 0) / rows.length;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.vTier !== "micro" && (
                            <div className="flex items-center justify-between rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2">
                                <span className="text-[10px] uppercase tracking-wider font-black text-violet-300">Maestría global</span>
                                <span className="text-lg font-black tabular-nums text-violet-300">{Math.round(overall * 100)}%</span>
                            </div>
                        )}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar space-y-1.5">
                            {rows.slice(0, max).map(({ node, depth }) => {
                                const isActive = active === node.id;
                                return (
                                    <button key={node.id} onClick={() => setActive(isActive ? null : node.id)}
                                        className="w-full text-left rounded-xl border border-border/40 bg-white/[0.03] p-2 hover:border-violet-500/40 transition-colors"
                                        style={{ marginLeft: depth > 1 ? (depth - 1) * 10 : 0 }}>
                                        <div className="flex items-center gap-2">
                                            {depth > 1 && <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />}
                                            <span className="text-xs font-bold truncate flex-1">{node.label}</span>
                                            {node.certified && <BadgeCheck className="size-3.5 text-violet-400 shrink-0" />}
                                            <span className="text-[10px] font-black tabular-nums text-violet-300">{Math.round(node.mastery * 100)}%</span>
                                        </div>
                                        <div className="mt-1.5"><ProgressBar value={node.mastery} color="#a78bfa" height={5} /></div>
                                        {isActive && node.microMission && (
                                            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-violet-200/80">
                                                <Target className="size-3" /> {node.microMission}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
