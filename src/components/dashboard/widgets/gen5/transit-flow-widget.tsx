'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Waves, ChevronRight,
    Bus, Car, Plane, Bike,
    type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
    WidgetShell, StatTile, MiniList, ProgressBar, Chip, timeUntil,
} from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { TransitState, TransitVehicle } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// TransitFlowWidget — Topología de Tránsito Orgánico
// ----------------------------------------------------------------
// Movilidad compartida como corrientes de luz. Muestra estadísticas
// de red (rutas activas, CO₂ ahorrado), lista de vehículos con ETA,
// ocupación y solicitud rápida por vehículo.
// Datos: "location.transit". Adaptativo.
// ════════════════════════════════════════════════════════════════

type VehicleKind = TransitVehicle["kind"];

const KIND_META: Record<VehicleKind, { icon: LucideIcon; label: string }> = {
    capsula:  { icon: Bus,  label: "Cápsula"  },
    vehiculo: { icon: Car,  label: "Vehículo" },
    dron:     { icon: Plane, label: "Dron"     },
    bici:     { icon: Bike, label: "Bici"     },
};

const ACCENT = "#38bdf8";

export function TransitFlowWidget() {
    const { data, loading } = useWidgetData("location.transit", { refreshMs: 8000 });
    const [requested, setRequested] = useState<Set<string>>(new Set());

    const sorted = useMemo(
        () => ((data as TransitState | undefined)?.vehicles ?? []).slice().sort((a, b) => a.etaMin - b.etaMin),
        [data],
    );

    return (
        <WidgetShell
            title="Tránsito Orgánico"
            subtitle="Movilidad compartida · corrientes de luz"
            icon={Waves}
            accent={ACCENT}
            live
            actions={
                <Link
                    href="/explorer"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Red <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data as TransitState;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const expanded = size.vTier === "expanded";

                // ── Micro: ETA más próximo + rutas activas ─────────────
                if (micro) {
                    const closest = sorted[0];
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            {closest && (
                                <>
                                    {(() => {
                                        const meta = KIND_META[closest.kind];
                                        const VIcon = meta.icon;
                                        return (
                                            <div
                                                className="shrink-0 grid place-items-center size-9 rounded-xl"
                                                style={{ background: `color-mix(in srgb, ${closest.accent} 22%, transparent)` }}
                                            >
                                                <VIcon className="size-4" style={{ color: closest.accent }} />
                                            </div>
                                        );
                                    })()}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-black text-foreground truncate">{closest.label}</p>
                                        <p className="text-[9px] font-bold" style={{ color: ACCENT }}>
                                            ETA {closest.etaMin} min
                                        </p>
                                    </div>
                                </>
                            )}
                            <div className="shrink-0 text-right">
                                <p className="text-xl font-black tabular-nums" style={{ color: ACCENT }}>{d.activeRoutes}</p>
                                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">rutas</p>
                            </div>
                        </div>
                    );
                }

                const listMax = expanded ? 4 : compact ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* Stats row */}
                        {!compact && (
                            <div className="shrink-0 grid grid-cols-2 gap-1.5">
                                <StatTile
                                    label="Rutas activas"
                                    value={d.activeRoutes}
                                    accent={ACCENT}
                                    compact
                                />
                                <StatTile
                                    label="CO₂ ahorrado"
                                    value={d.co2SavedKg}
                                    unit="kg"
                                    accent="#34d399"
                                    compact
                                />
                            </div>
                        )}

                        {/* Compact: inline stats */}
                        {compact && (
                            <div className="shrink-0 flex items-center gap-3">
                                <span className="text-xl font-black tabular-nums" style={{ color: ACCENT }}>
                                    {d.activeRoutes}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">rutas activas</span>
                                <span className="text-muted-foreground/30 text-xs">·</span>
                                <span className="text-[10px] font-bold text-emerald-400">{d.co2SavedKg} kg CO₂</span>
                            </div>
                        )}

                        {/* Vehicle list */}
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <MiniList
                                items={sorted}
                                max={listMax}
                                empty="Sin vehículos disponibles"
                                render={(v) => {
                                    const meta = KIND_META[v.kind];
                                    const VIcon = meta.icon;
                                    const done = requested.has(v.id);
                                    const etaLabel = v.etaMin <= 1
                                        ? "Ahora"
                                        : timeUntil(Date.now() + v.etaMin * 60000);

                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-500/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                {/* Icon */}
                                                <div
                                                    className="shrink-0 grid place-items-center size-7 rounded-lg"
                                                    style={{ background: `color-mix(in srgb, ${v.accent} 22%, transparent)` }}
                                                >
                                                    <VIcon className="size-3.5" style={{ color: v.accent }} />
                                                </div>

                                                {/* Label + occupancy */}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-bold truncate leading-tight">{v.label}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <div className="flex-1 min-w-0">
                                                            <ProgressBar
                                                                value={v.occupancy}
                                                                color={v.occupancy > 0.8 ? "#fb7185" : v.occupancy > 0.5 ? "#fbbf24" : "#34d399"}
                                                                height={4}
                                                            />
                                                        </div>
                                                        <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">
                                                            {Math.round(v.occupancy * 100)}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* ETA + action */}
                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    {v.etaMin <= 1
                                                        ? <Chip color={ACCENT}>Ahora</Chip>
                                                        : (
                                                            <motion.span
                                                                key={etaLabel}
                                                                initial={{ opacity: 0, y: -4 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                className="text-[10px] font-bold tabular-nums"
                                                                style={{ color: ACCENT }}
                                                            >
                                                                {etaLabel}
                                                            </motion.span>
                                                        )
                                                    }
                                                    <button
                                                        onClick={() => setRequested(prev => {
                                                            const next = new Set(prev);
                                                            next.has(v.id) ? next.delete(v.id) : next.add(v.id);
                                                            return next;
                                                        })}
                                                        className={cn(
                                                            "text-[9px] font-black uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors cursor-pointer",
                                                            done
                                                                ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                                                                : "bg-white/[0.04] border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-sky-500/40",
                                                        )}
                                                    >
                                                        {done ? "Solicitado" : "Solicitar"}
                                                    </button>
                                                </div>
                                            </div>
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
