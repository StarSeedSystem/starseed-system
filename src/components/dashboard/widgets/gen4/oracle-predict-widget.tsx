'use client';

import Link from "next/link";
import { Telescope, ChevronRight, TrendingUp, Minus, AlertTriangle, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { OracleScenario } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// OraclePredictWidget — Oráculo Predictivo del Exocórtex.
// La IA proyecta escenarios probabilísticos sobre la red (cosecha,
// votaciones, carga mesh…) con probabilidad, confianza y factores.
// Datos "ai.oracle". Adaptativo. Invariante: amplificar cognición.
// ════════════════════════════════════════════════════════════════
const IMPACT_META: Record<OracleScenario["impact"], { icon: LucideIcon; color: string }> = {
    positivo: { icon: TrendingUp, color: "#34d399" },
    neutro: { icon: Minus, color: "#94a3b8" },
    riesgo: { icon: AlertTriangle, color: "#fb7185" },
};

export function OraclePredictWidget() {
    const { data, loading } = useWidgetData("ai.oracle", { refreshMs: 16000 });

    return (
        <WidgetShell
            title="Oráculo Predictivo"
            subtitle={data ? `Precisión del modelo ${Math.round(data.modelAccuracy * 100)}%` : "Escenarios del Exocórtex"}
            icon={Telescope}
            accent="#06b6d4"
            live
            actions={
                <Link href="/agent" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Exocórtex <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 4 : size.vTier === "compact" ? 2 : 3;

                return (
                    <div className="flex-1 min-h-0 h-full pt-1">
                        <MiniList
                            items={data?.scenarios ?? []}
                            max={max}
                            empty="Sin escenarios calculados"
                            render={(s) => {
                                const meta = IMPACT_META[s.impact];
                                const Icon = meta.icon;
                                return (
                                    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-cyan-500/30 transition-colors">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-[11px] @sm:text-xs font-bold leading-snug line-clamp-2 flex-1">{s.question}</span>
                                            <Chip color={meta.color}><Icon className="size-2.5" /> {s.horizon}</Chip>
                                        </div>
                                        {!micro && <p className="mt-0.5 text-[10px] text-muted-foreground/70 leading-snug line-clamp-1">{s.outcome}</p>}
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <div className="flex-1"><ProgressBar value={s.probability} color={meta.color} height={4} /></div>
                                            <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: meta.color }}>{Math.round(s.probability * 100)}%</span>
                                        </div>
                                        {size.vTier === "expanded" && s.drivers.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {s.drivers.map((d) => (
                                                    <span key={d} className="rounded-md bg-white/[0.04] border border-border/40 px-1.5 py-0.5 text-[8px] text-muted-foreground/70">{d}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            }}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
