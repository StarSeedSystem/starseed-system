'use client';

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    Banknote, Flag, AlertTriangle, ChevronRight, Vote, Layers, ZoomIn,
} from "lucide-react";
import { WidgetShell, MiniList, ProgressBar, Bars, Chip, timeUntil } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// VitalFlowAuditWidget — Auditoría de Flujo Vital (Transparencia Radical).
// Visualiza el destino de los fondos comunes como arterias de energía.
// Zoom macro→micro, filtro por sector, marcar transacciones sospechosas.
// Datos "politics.treasury". Invariante: transparencia en el poder público.
// ════════════════════════════════════════════════════════════════
function fmt(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
}

export function VitalFlowAuditWidget() {
    const { data, loading } = useWidgetData("politics.treasury", { refreshMs: 9000 });
    const [sector, setSector] = useState<string | null>(null);
    const [flags, setFlags] = useState<Record<string, boolean>>({});

    const allocations = useMemo(() => {
        if (!data) return [];
        const list = sector ? data.allocations.filter((a) => a.sector === sector) : data.allocations;
        return [...list].sort((a, b) => b.amount - a.amount);
    }, [data, sector]);

    const toggleFlag = useCallback((id: string) => setFlags((p) => ({ ...p, [id]: !p[id] })), []);

    return (
        <WidgetShell
            title="Auditoría de Flujo Vital"
            subtitle="Transparencia radical del procomún"
            icon={Banknote}
            accent="#22c55e"
            live
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Tesorería <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";

                if (micro) {
                    const flagged = data.allocations.reduce((t, a) => t + a.communityFlags, 0);
                    return (
                        <div className="h-full grid place-items-center text-center">
                            <div>
                                <div className="text-2xl font-black tabular-nums text-emerald-400">{fmt(data.total)}</div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">créditos · {data.period}</div>
                                {flagged > 0 && <div className="mt-1 text-[10px] text-rose-400 font-bold">{flagged} marcas de revisión</div>}
                            </div>
                        </div>
                    );
                }

                const maxList = size.vTier === "expanded" ? 5 : compact ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* Cabecera: total + sectores (arterias) */}
                        <div className="shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5">
                            <div className="flex items-baseline justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Flujo total · {data.period}</span>
                                <span className="text-lg font-black tabular-nums text-emerald-400">{fmt(data.total)}</span>
                            </div>
                            {!compact && (
                                <div className="mt-2">
                                    <Bars
                                        data={data.sectors.map((s) => ({ label: s.label.split(" ")[0], value: s.amount }))}
                                        color="#22c55e"
                                        height={42}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Filtro de sectores (zoom macro→micro) */}
                        <div className="shrink-0 flex items-center gap-1 overflow-x-auto pb-0.5">
                            <button
                                onClick={() => setSector(null)}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer shrink-0",
                                    sector === null ? "bg-white/10 border-border/60 text-foreground" : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                )}
                            >
                                <Layers className="size-2.5" /> Todo
                            </button>
                            {data.sectors.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setSector(s.id === sector ? null : s.id)}
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer shrink-0",
                                        sector === s.id ? "border-transparent text-black" : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                    )}
                                    style={sector === s.id ? { background: s.color } : undefined}
                                >
                                    {sector === s.id && <ZoomIn className="size-2.5" />} {s.label.split(" ")[0]}
                                </button>
                            ))}
                        </div>

                        {/* Asignaciones (micro-gasto) */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={allocations}
                                max={maxList}
                                empty="Sin asignaciones en este sector"
                                render={(a) => {
                                    const flagged = flags[a.id];
                                    const cFlags = a.communityFlags + (flagged ? 1 : 0);
                                    const color = data.sectors.find((s) => s.id === a.sector)?.color ?? "#22c55e";
                                    return (
                                        <div className={cn(
                                            "rounded-xl border px-2.5 py-2 transition-colors",
                                            cFlags >= 10 ? "border-rose-500/40 bg-rose-500/[0.05]" : "border-border/40 bg-white/[0.02] hover:border-emerald-500/30"
                                        )}>
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold leading-snug truncate flex-1">{a.label}</span>
                                                <button
                                                    onClick={() => toggleFlag(a.id)}
                                                    title="Marcar para revisión comunitaria"
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold tabular-nums transition-colors cursor-pointer shrink-0",
                                                        flagged ? "bg-rose-500/15 border-rose-500/40 text-rose-300" : "border-border/40 text-muted-foreground/60 hover:text-rose-300 hover:border-rose-500/40"
                                                    )}
                                                >
                                                    <Flag className="size-2.5" /> {cFlags}
                                                </button>
                                            </div>
                                            <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground/60">
                                                <span className="truncate">{a.contractor}</span>
                                                <span className="tabular-nums shrink-0 ml-2">{fmt(a.spent)} / {fmt(a.amount)}</span>
                                            </div>
                                            <div className="mt-1"><ProgressBar value={a.spent / a.amount} color={color} height={3} /></div>
                                            {cFlags >= 10 && (
                                                <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-rose-400">
                                                    <AlertTriangle className="size-2.5" /> En revisión comunitaria
                                                </div>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                        </div>

                        {/* Votaciones de presupuesto inminentes */}
                        {size.vTier === "expanded" && data.pendingVotes.length > 0 && (
                            <div className="shrink-0 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">Presupuestos por votar</div>
                                {data.pendingVotes.slice(0, 2).map((v) => (
                                    <Link key={v.id} href="/network/politics" className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2 py-1 hover:border-amber-500/40 transition-colors cursor-pointer">
                                        <Vote className="size-3 text-amber-400 shrink-0" />
                                        <span className="text-[10px] truncate flex-1">{v.label}</span>
                                        <Chip color="#f59e0b">{fmt(v.amount)}</Chip>
                                        <span className="text-[9px] text-muted-foreground/50 shrink-0">{timeUntil(v.deadlineTs)}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
