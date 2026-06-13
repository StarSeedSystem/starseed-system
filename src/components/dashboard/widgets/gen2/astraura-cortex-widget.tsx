'use client';

import { motion } from "framer-motion";
import { BrainCircuit, Pause, Search, Zap, Loader2 } from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { AstrauraState } from "@/lib/widget-data/types";

const kindIcon = { pausa: Pause, investigar: Search, accion: Zap } as const;
const kindColor = { pausa: "#38bdf8", investigar: "#a78bfa", accion: "#10b981" } as const;

export function AstrauraCortexWidget() {
    const { data, loading } = useWidgetData("ai.astraura", { refreshMs: 4000 });

    return (
        <WidgetShell title="Córtex Astraura" subtitle="Tu exocórtex" icon={BrainCircuit} accent="#8b5cf6" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        <div className="flex items-center gap-3">
                            <ProgressRing value={data.cognitiveLoad} size={micro ? 60 : 72} color="#8b5cf6"
                                label={`${Math.round(data.cognitiveLoad * 100)}%`} sublabel="carga" />
                            {!micro && (
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wider font-black text-violet-300/70">Atención</div>
                                    <p className="text-xs @sm:text-sm font-semibold leading-snug line-clamp-2">{data.attention}</p>
                                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                        <span className="font-bold tabular-nums text-violet-300">{data.pendingTasks}</span> tareas ·
                                        intervención <span className="font-bold tabular-nums text-violet-300">{Math.round(data.interventionLevel * 100)}%</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!micro && size.vTier !== "compact" && (
                            <div className="space-y-1.5">
                                {data.suggestions.slice(0, size.vTier === "expanded" ? 3 : 2).map((s) => {
                                    const Icon = kindIcon[s.kind];
                                    return (
                                        <motion.div key={s.id} whileHover={{ x: 3 }}
                                            className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.03] p-2 cursor-pointer">
                                            <span className="grid place-items-center size-6 rounded-lg shrink-0"
                                                style={{ background: `color-mix(in srgb, ${kindColor[s.kind]} 18%, transparent)`, color: kindColor[s.kind] }}>
                                                <Icon className="size-3" />
                                            </span>
                                            <span className="text-[11px] leading-tight line-clamp-2">{s.text}</span>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}

                        {size.vTier === "expanded" && (
                            <div className="mt-auto space-y-1.5">
                                {data.backgroundJobs.map((j) => (
                                    <div key={j.id} className="flex items-center gap-2">
                                        <Loader2 className="size-3 text-violet-400 animate-spin shrink-0" />
                                        <div className="flex-1"><ProgressBar value={j.progress} label={j.label} color="#8b5cf6" height={5} /></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
