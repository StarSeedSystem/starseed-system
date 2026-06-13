'use client';

import Link from "next/link";
import { Wheat, Sprout, Leaf, ChevronRight, Salad } from "lucide-react";
import { WidgetShell, StatTile, ProgressBar, ProgressRing, Sparkline, MiniList } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// FoodOracleWidget — Oráculo de Soberanía Alimentaria.
// Estado de cultivos, invernaderos, reservas y predicción de cosecha.
// Perfil dietético personalizado. Datos "oikos.food".
// Invariante: nutrición óptima gratuita y sin desperdicios.
// ════════════════════════════════════════════════════════════════
export function FoodOracleWidget() {
    const { data, loading } = useWidgetData("oikos.food", { refreshMs: 12000 });

    return (
        <WidgetShell
            title="Soberanía Alimentaria"
            subtitle="Cosecha y reservas del Oikos"
            icon={Wheat}
            accent="#22c55e"
            live
            actions={
                <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Despensa <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const ready = data.crops.filter((c) => c.readiness >= 0.95).length;

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={Math.min(1, data.reserveDays / 90)} size={Math.min(100, Math.max(64, size.height - 24))} stroke={7} color="#22c55e" label={`${data.reserveDays}d`} sublabel="reservas" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="shrink-0 grid grid-cols-3 gap-1.5">
                            <StatTile label="Cosecha hoy" value={`${data.harvestTodayKg}`} unit="kg" accent="#22c55e" icon={Sprout} compact />
                            <StatTile label="Reservas" value={`${data.reserveDays}`} unit="d" accent="#10b981" icon={Wheat} compact />
                            <StatTile label="Listos" value={`${ready}`} unit={`/${data.crops.length}`} accent="#f59e0b" icon={Leaf} compact />
                        </div>

                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={data.crops}
                                max={size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 2 : 3}
                                render={(c) => (
                                    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                        <span className="text-[11px] font-bold w-20 truncate shrink-0">{c.label}</span>
                                        <div className="flex-1"><ProgressBar value={c.readiness} color={c.readiness >= 0.95 ? "#22c55e" : "#f59e0b"} height={5} /></div>
                                        <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0 w-14 text-right">
                                            {c.readiness >= 0.95 ? "listo" : `~${c.etaDays}d`}
                                        </span>
                                    </div>
                                )}
                            />
                        </div>

                        {size.vTier === "expanded" && (
                            <div className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] p-2.5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Rendimiento previsto · 7d</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold"><Salad className="size-3" /> {data.diet}</span>
                                </div>
                                <Sparkline data={data.prediction} color="#22c55e" height={44} fill />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
