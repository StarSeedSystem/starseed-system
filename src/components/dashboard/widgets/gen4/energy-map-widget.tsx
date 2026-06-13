'use client';

import Link from "next/link";
import { Sparkles, ChevronRight, Activity, Brain, HeartPulse } from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar, Sparkline } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// EnergyMapWidget — Mapa de Energía (Bienestar + Astrología).
// Coherencia global, centros energéticos, biorritmo (físico/emocional/
// intelectual) e influencias cósmicas del día. Datos "astro.energy".
// Adaptativo. Invariante: tecnología para expandir la consciencia.
// ════════════════════════════════════════════════════════════════
function rhythmPct(v: number) { return (v + 1) / 2; }

export function EnergyMapWidget() {
    const { data, loading } = useWidgetData("astro.energy", { refreshMs: 20000 });

    return (
        <WidgetShell
            title="Mapa de Energía"
            subtitle="Coherencia y ciclos vitales"
            icon={Sparkles}
            accent="#a855f7"
            actions={
                <Link href="/dashboard?cat=ayudantia" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Bienestar <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={d.overallCoherence} size={68} color="#a855f7" sublabel="coherencia" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing value={d.overallCoherence} size={58} color="#a855f7" sublabel="coherencia" />
                            <div className="flex-1 space-y-1.5">
                                {[
                                    { k: "Físico", v: d.biorhythm.physical, icon: Activity, color: "#34d399" },
                                    { k: "Emocional", v: d.biorhythm.emotional, icon: HeartPulse, color: "#f472b6" },
                                    { k: "Intelectual", v: d.biorhythm.intellectual, icon: Brain, color: "#38bdf8" },
                                ].map((b) => {
                                    const BIcon = b.icon;
                                    return (
                                        <div key={b.k} className="flex items-center gap-1.5">
                                            <BIcon className="size-3 shrink-0" style={{ color: b.color }} />
                                            <span className="text-[9px] w-16 shrink-0 text-muted-foreground/70">{b.k}</span>
                                            <div className="flex-1"><ProgressBar value={rhythmPct(b.v)} color={b.color} height={4} /></div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="grid grid-cols-7 gap-1 shrink-0">
                                {d.centers.map((c) => (
                                    <div key={c.id} className="flex flex-col items-center gap-0.5" title={`${c.label}: ${c.note}`}>
                                        <div className="w-full h-10 rounded-md bg-muted/20 overflow-hidden flex items-end">
                                            <div className="w-full rounded-md transition-all" style={{ height: `${Math.round(c.balance * 100)}%`, background: c.color }} />
                                        </div>
                                        <span className="text-[7px] text-muted-foreground/60 truncate w-full text-center">{c.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {size.vTier === "expanded" && d.cosmicInfluence.length > 0 && (
                            <div className="shrink-0 space-y-1">
                                {d.cosmicInfluence.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[10px]">
                                        <span className="font-bold w-16 shrink-0" style={{ color: "#c084fc" }}>{c.body}</span>
                                        <span className="text-muted-foreground/70 truncate flex-1">{c.effect}</span>
                                        <div className="w-12 shrink-0"><ProgressBar value={c.intensity} color="#c084fc" height={3} /></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 flex items-end">
                            <Sparkline data={d.history} color="#a855f7" height={size.vTier === "expanded" ? 36 : 24} />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
