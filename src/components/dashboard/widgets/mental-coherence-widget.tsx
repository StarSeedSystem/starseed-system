'use client';

import { Brain, Sparkles, Target, Wind, Flame } from "lucide-react";
import { WidgetShell, ProgressRing, StatTile, Sparkline } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// MentalCoherenceWidget — índice de coherencia del Exocórtex.
// Datos en vivo "wellness.coherence". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
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
                { label: "Exocórtex", href: "/agent", color: "#8b5cf6", icon: Sparkles },
                { label: "Aprendizaje", href: "/network/education", color: "#38bdf8", icon: Target },
                { label: "Perfil", href: "/profile", color: "#10b981", icon: Wind },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={data.coherence} size={Math.min(100, Math.max(64, size.height - 24))} stroke={7} color="#8b5cf6" sublabel="Coherencia" />
                        </div>
                    );
                }

                const ringSize = size.vTier === "expanded" ? 110 : 88;
                const showHistory = size.vTier === "expanded" && data.history.length > 1;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing value={data.coherence} size={ringSize} stroke={7} color="#8b5cf6" sublabel="Coherencia" />
                            <div className="flex-1 min-w-0 grid grid-cols-1 gap-2">
                                <div className="grid grid-cols-3 gap-1.5">
                                    <StatTile label="Foco" value={`${Math.round(data.focus * 100)}`} accent="#38bdf8" icon={Target} compact />
                                    <StatTile label="Calma" value={`${Math.round(data.calm * 100)}`} accent="#10b981" icon={Wind} compact />
                                    <StatTile label="Energía" value={`${Math.round(data.energy * 100)}`} accent="#f59e0b" icon={Flame} compact />
                                </div>
                            </div>
                        </div>
                        {showHistory && (
                            <div className="flex-1 min-h-0 rounded-xl border border-border/40 bg-white/[0.02] p-2.5 flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">Ritmo de coherencia</span>
                                <div className="flex-1 min-h-0 grid place-items-stretch"><Sparkline data={data.history} color="#8b5cf6" height={70} /></div>
                            </div>
                        )}
                        <div className="shrink-0 flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                            <Sparkles className="size-3.5 shrink-0 text-violet-400" />
                            <span className="text-[10px] @sm:text-[11px] text-muted-foreground/80 leading-snug">{data.suggestion}</span>
                            <span className="ml-auto shrink-0 text-[10px] font-black text-violet-400 tabular-nums">{data.streakDays}d</span>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
