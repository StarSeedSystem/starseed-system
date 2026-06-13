'use client';

import { motion } from "framer-motion";
import { Sparkles, Sun, Moon, Compass } from "lucide-react";
import { WidgetShell, ProgressRing, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { AstroTransit } from "@/lib/widget-data/types";

export function NatalChartWidget() {
    const { data, loading } = useWidgetData("astro.natal", { refreshMs: 12000 });

    return (
        <WidgetShell title="Sincronía Vital" subtitle="Carta y tránsitos" icon={Sparkles} accent="#e879f9">
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                return (
                    <div className="flex flex-col h-full pt-1 gap-3">
                        <div className="flex items-center gap-3">
                            <ProgressRing value={data.coherence} size={micro ? 58 : 70} color="#e879f9"
                                label={`${Math.round(data.coherence * 100)}%`} sublabel="coher." />
                            {!micro && (
                                <div className="flex-1 grid grid-cols-3 gap-1.5 text-center">
                                    <Triad icon={Sun} label="Sol" value={data.sun} />
                                    <Triad icon={Moon} label="Luna" value={data.moon} />
                                    <Triad icon={Compass} label="Asc" value={data.ascendant} />
                                </div>
                            )}
                        </div>

                        {!micro && size.vTier !== "compact" && (
                            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                                <MiniList
                                    items={data.transits}
                                    max={size.vTier === "expanded" ? 4 : 2}
                                    render={(t: AstroTransit) => (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.03] p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-black truncate">{t.body} en {t.sign} {t.degree}°</span>
                                                {t.aspect && <Chip color="#e879f9">{t.aspect}</Chip>}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2">
                                                <div className="flex-1 h-1.5 rounded-full bg-muted/25 overflow-hidden">
                                                    <motion.div className="h-full bg-fuchsia-400" initial={{ width: 0 }} animate={{ width: `${t.intensity * 100}%` }} />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground/60 line-clamp-1 max-w-[55%]">{t.note}</span>
                                            </div>
                                        </div>
                                    )}
                                />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

function Triad({ icon: Icon, label, value }: { icon: typeof Sun; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border/40 bg-white/[0.03] py-1.5">
            <Icon className="size-3.5 mx-auto text-fuchsia-300" />
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold mt-0.5">{label}</div>
            <div className="text-[11px] font-black truncate px-1">{value}</div>
        </div>
    );
}
