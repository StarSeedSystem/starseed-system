'use client';

import Link from "next/link";
import { Recycle, TreePine, Droplets, Wind, ScanLine, ChevronRight, CircleCheck } from "lucide-react";
import { WidgetShell, StatTile, ProgressRing, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// RegenTracerWidget — Trazador de Ciclo Vital / Huella Regenerativa.
// Impacto ecológico positivo del usuario + ciclo cerrado de objetos.
// Escáner AR de "verdad material". Datos "oikos.regen".
// Invariante: circularidad material, sin desperdicio ni contaminación.
// ════════════════════════════════════════════════════════════════
export function RegenTracerWidget() {
    const { data, loading } = useWidgetData("oikos.regen", { refreshMs: 14000 });

    return (
        <WidgetShell
            title="Huella Regenerativa"
            subtitle="Ciclo material cerrado"
            icon={Recycle}
            accent="#22c55e"
            live
            actions={
                <Link href="/explorer" className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                    <ScanLine className="size-3" /> Escáner AR
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={data.cycleClosed} size={Math.min(100, Math.max(64, size.height - 24))} stroke={7} color="#22c55e" sublabel="ciclo cerrado" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing value={data.cycleClosed} size={size.vTier === "expanded" ? 92 : 74} stroke={7} color="#22c55e" sublabel="circularidad" />
                            <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                                <StatTile label="CO₂ evitado" value={`${data.co2OffsetKg}`} unit="kg" accent="#22c55e" icon={Wind} compact />
                                <StatTile label="Árboles" value={`${data.treesPlanted}`} accent="#10b981" icon={TreePine} compact />
                                <StatTile label="Compost" value={`${data.compostKg}`} unit="kg" accent="#f59e0b" icon={Recycle} compact />
                                <StatTile label="Agua" value={`${(data.waterSavedL / 1000).toFixed(1)}`} unit="m³" accent="#38bdf8" icon={Droplets} compact />
                            </div>
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="flex-1 min-h-0 space-y-1.5">
                                {data.goals.map((g) => (
                                    <div key={g.id} className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                        <div className="flex items-center justify-between text-[10px] mb-1">
                                            <span className="font-bold text-muted-foreground/80">{g.label}</span>
                                            <span className="tabular-nums text-muted-foreground/60">{g.progress}/{g.target} {g.unit}</span>
                                        </div>
                                        <ProgressBar value={g.progress / g.target} color="#22c55e" height={4} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {size.vTier === "expanded" && data.scanned && (
                            <div className="shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-2.5 py-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                                    <ScanLine className="size-3" /> Último escaneo AR
                                </div>
                                <div className="mt-0.5 flex items-center gap-2">
                                    <span className="text-[11px] font-bold truncate flex-1">{data.scanned.name}</span>
                                    {data.scanned.recyclable && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400"><CircleCheck className="size-3" /> Reciclable</span>}
                                </div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground/60 truncate">{data.scanned.materials.join(" · ")}</div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
