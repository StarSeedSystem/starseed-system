'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Radar, ChevronRight,
    Sprout, Printer, Droplets, Wrench, HeartPulse, Hammer,
    type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
    WidgetShell, MiniList, Chip, ProgressRing, RadialNodeGraph,
    timeUntil,
} from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { AbundanceState, ResourceNode } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// AbundanceRadarWidget — Radar de Nodos de Abundancia
// ----------------------------------------------------------------
// Recursos comunitarios de libre acceso en tu entorno inmediato.
// Radar visual con RadialNodeGraph, lista filtrable por kind,
// ETA o disponibilidad, y acción rápida por nodo.
// Datos: "location.resources". Adaptativo.
// ════════════════════════════════════════════════════════════════

type ResourceKind = ResourceNode["kind"];

const KIND_META: Record<ResourceKind, { icon: LucideIcon; label: string }> = {
    huerto:      { icon: Sprout,    label: "Huerto"      },
    impresora3d: { icon: Printer,   label: "Impresora 3D" },
    agua:        { icon: Droplets,  label: "Agua"         },
    herramientas:{ icon: Wrench,    label: "Herramientas" },
    sanacion:    { icon: HeartPulse,label: "Sanación"     },
    taller:      { icon: Hammer,    label: "Taller"       },
};

const ACCENT = "#10b981";
const KINDS: ResourceKind[] = ["huerto", "impresora3d", "agua", "herramientas", "sanacion", "taller"];

export function AbundanceRadarWidget() {
    const { data, loading } = useWidgetData("location.resources", { refreshMs: 10000 });
    const [filter, setFilter] = useState<ResourceKind | "todos">("todos");
    const [requested, setRequested] = useState<Set<string>>(new Set());

    const nodes = useMemo(() => {
        const list = (data as AbundanceState | undefined)?.nodes ?? [];
        return filter === "todos" ? list : list.filter((n) => n.kind === filter);
    }, [data, filter]);

    const maxDist = useMemo(() => {
        const all = (data as AbundanceState | undefined)?.nodes ?? [];
        return Math.max(...all.map((n) => n.distanceKm), 0.1);
    }, [data]);

    const radarNodes = useMemo(() =>
        nodes.map((n, i) => ({
            id: n.id,
            label: n.label,
            distance: Math.min(0.95, n.distanceKm / maxDist),
            angle: (i / Math.max(nodes.length, 1)) * 2 * Math.PI - Math.PI / 2,
            signal: n.available ? 1 : 0.35,
            accent: n.accent,
        })),
    [nodes, maxDist]);

    return (
        <WidgetShell
            title="Radar de Abundancia"
            subtitle="Recursos comunitarios cercanos"
            icon={Radar}
            accent={ACCENT}
            live
            actions={
                <Link
                    href="/explorer"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Mapa <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data as AbundanceState;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const expanded = size.vTier === "expanded";

                // ── Micro: radar compacto + readyNow ──────────────────
                if (micro) {
                    const top = d.nodes[0];
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing
                                value={d.readyNow / Math.max(d.nodes.length, 1)}
                                size={56}
                                color={ACCENT}
                                label={String(d.readyNow)}
                                sublabel="listos"
                            />
                            {top && (
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black text-foreground truncate">{top.label}</p>
                                    <p className="text-[9px] text-muted-foreground/60">{top.distanceKm} km</p>
                                </div>
                            )}
                        </div>
                    );
                }

                const listMax = expanded ? 6 : compact ? 2 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* Header stat */}
                        <div className="shrink-0 flex items-center gap-2">
                            <motion.span
                                key={d.readyNow}
                                initial={{ scale: 0.75, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-2xl font-black tabular-nums"
                                style={{ color: ACCENT }}
                            >
                                {d.readyNow}
                            </motion.span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                listos ahora
                            </span>
                        </div>

                        {/* Radar visual (regular / expanded) */}
                        {!compact && (
                            <div className="shrink-0">
                                <RadialNodeGraph
                                    nodes={radarNodes}
                                    height={expanded ? 160 : 120}
                                />
                            </div>
                        )}

                        {/* Kind filter (not compact) */}
                        {!compact && (
                            <div className="shrink-0 flex items-center gap-1 flex-wrap">
                                <button
                                    onClick={() => setFilter("todos")}
                                    className={cn(
                                        "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                        filter === "todos"
                                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                            : "border-border/40 text-muted-foreground/60 hover:text-foreground",
                                    )}
                                >
                                    Todos
                                </button>
                                {KINDS.map((k) => (
                                    <button
                                        key={k}
                                        onClick={() => setFilter(k)}
                                        className={cn(
                                            "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                            filter === k
                                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                                : "border-border/40 text-muted-foreground/60 hover:text-foreground",
                                        )}
                                    >
                                        {KIND_META[k].label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Node list */}
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <MiniList
                                items={nodes}
                                max={listMax}
                                empty="Sin nodos en este filtro"
                                render={(n) => {
                                    const meta = KIND_META[n.kind];
                                    const KIcon = meta.icon;
                                    const done = requested.has(n.id);
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-emerald-500/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="shrink-0 grid place-items-center size-7 rounded-lg"
                                                    style={{ background: `color-mix(in srgb, ${n.accent} 20%, transparent)` }}
                                                >
                                                    <KIcon className="size-3.5" style={{ color: n.accent }} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-bold truncate leading-tight">{n.label}</p>
                                                    <p className="text-[9px] text-muted-foreground/60">{n.distanceKm} km</p>
                                                </div>
                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    {n.available
                                                        ? <Chip color="#10b981">Disponible</Chip>
                                                        : <Chip color="#f59e0b">{timeUntil(Date.now() + n.etaMin * 60000)}</Chip>
                                                    }
                                                    <button
                                                        onClick={() => setRequested(prev => {
                                                            const next = new Set(prev);
                                                            next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                                                            return next;
                                                        })}
                                                        className={cn(
                                                            "text-[9px] font-black uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors cursor-pointer",
                                                            done
                                                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                                                                : "bg-white/[0.04] border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-emerald-500/40",
                                                        )}
                                                    >
                                                        {done ? "En ruta" : n.available ? "Ir" : "Reservar"}
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
