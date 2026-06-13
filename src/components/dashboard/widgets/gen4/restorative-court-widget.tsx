'use client';

import Link from "next/link";
import { Scale, ChevronRight, HeartHandshake, Users2 } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, StatTile, timeUntil } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { RestorativeCase } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// RestorativeCourtWidget — Tribunal Restaurativo (Círculos de Paz).
// Invariante de la Tríada: justicia restaurativa, nunca punitiva.
// El sistema digital no bloquea: facilita mediación y reparación.
// Datos "politics.justice". Adaptativo.
// ════════════════════════════════════════════════════════════════
const STAGE_META: Record<RestorativeCase["stage"], { label: string; color: string }> = {
    apertura: { label: "Apertura", color: "#94a3b8" },
    escucha: { label: "Escucha", color: "#38bdf8" },
    acuerdo: { label: "Acuerdo", color: "#a855f7" },
    reparacion: { label: "Reparación", color: "#f59e0b" },
    cerrado: { label: "Sanado", color: "#10b981" },
};

export function RestorativeCourtWidget() {
    const { data, loading } = useWidgetData("politics.justice", { refreshMs: 15000 });

    return (
        <WidgetShell
            title="Tribunal Restaurativo"
            subtitle="Círculos de paz, no castigo"
            icon={Scale}
            accent="#10b981"
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Mediación <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && (
                            <div className="grid grid-cols-2 gap-2 shrink-0">
                                <StatTile label="Círculos activos" value={data?.activeCircles ?? 0} icon={Users2} accent="#10b981" compact />
                                <StatTile label="Sanados (ciclo)" value={data?.healedThisCycle ?? 0} icon={HeartHandshake} accent="#34d399" compact />
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={data?.cases ?? []}
                                max={max}
                                empty="Sin conflictos abiertos — comunidad en paz"
                                render={(c) => {
                                    const meta = STAGE_META[c.stage];
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-emerald-500/30 transition-colors">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold leading-snug line-clamp-2">{c.title}</span>
                                                <Chip color={meta.color}>{meta.label}</Chip>
                                            </div>
                                            {!micro && (
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    <div className="flex-1"><ProgressBar value={c.progress} color={meta.color} height={4} /></div>
                                                    <span className="text-[9px] text-muted-foreground/60 shrink-0">{c.participants} pers · {timeUntil(c.nextCircleTs)}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
