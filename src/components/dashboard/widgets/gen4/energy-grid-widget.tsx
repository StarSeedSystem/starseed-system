'use client';

import Link from "next/link";
import { Zap, ChevronRight, BatteryCharging, Share2, Leaf } from "lucide-react";
import { WidgetShell, ProgressRing, Sparkline, ProgressBar, StatTile } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// EnergyGridWidget — Energía Comunal (microred).
// Comunismo de abundancia: el excedente se dona al procomún. Muestra
// generación vs consumo, batería, fuentes, kW compartidos y CO₂ evitado.
// Datos "oikos.energy". Adaptativo.
// ════════════════════════════════════════════════════════════════
export function EnergyGridWidget() {
    const { data, loading } = useWidgetData("oikos.energy", { refreshMs: 6000 });

    return (
        <WidgetShell
            title="Energía Comunal"
            subtitle="Microred del Oikos"
            icon={Zap}
            accent="#38bdf8"
            live
            actions={
                <Link href="/dashboard?cat=economia" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Oikos <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const net = d.generationKw - d.consumptionKw;
                const ratio = Math.max(0, Math.min(1, d.generationKw / Math.max(0.1, d.consumptionKw) / 2));

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={ratio} size={68} color="#38bdf8" label={`${d.generationKw}`} sublabel="kW gen" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing value={ratio} size={64} color={net >= 0 ? "#34d399" : "#fb7185"} label={net >= 0 ? `+${net.toFixed(1)}` : net.toFixed(1)} sublabel="kW neto" />
                            <div className="flex-1 grid grid-cols-2 gap-1.5">
                                <StatTile label="Genera" value={d.generationKw} unit="kW" accent="#fbbf24" compact />
                                <StatTile label="Consume" value={d.consumptionKw} unit="kW" accent="#fb7185" compact />
                            </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-3 text-[10px]">
                            <span className="inline-flex items-center gap-1 text-sky-300"><BatteryCharging className="size-3" /> {Math.round(d.batteryLevel * 100)}%</span>
                            <span className="inline-flex items-center gap-1 text-emerald-300"><Share2 className="size-3" /> {d.sharedToGrid} kW al procomún</span>
                            <span className="inline-flex items-center gap-1 text-lime-300"><Leaf className="size-3" /> {d.co2AvoidedKg} kg CO₂</span>
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="space-y-1 shrink-0">
                                {d.sources.map((s) => (
                                    <div key={s.id} className="flex items-center gap-2">
                                        <span className="text-[9px] w-14 shrink-0 text-muted-foreground/70 truncate">{s.label}</span>
                                        <div className="flex-1"><ProgressBar value={s.share} color="#38bdf8" height={4} /></div>
                                        <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right">{Math.round(s.share * 100)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 flex items-end">
                            <Sparkline data={d.history} color="#38bdf8" height={size.vTier === "expanded" ? 48 : 28} />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
