'use client';

// ════════════════════════════════════════════════════════════════
// ProjectSwarmWidget — Enjambre de Propósitos
// ----------------------------------------------------------------
// Constelación viva de proyectos: cada nodo brilla según urgencia×impacto.
// Chips de filtro por estado. Botón "Soltar al enjambre" por nodo (toggle
// local). Cabecera con openToSwarm (subtareas liberadas al Ágora del Don).
// Datos "productivity.swarm". Adaptativo a todos los tamaños.
// ════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import Link from "next/link";
import { Network, ChevronRight, Sparkles, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
    WidgetShell, MiniList, Chip, ProgressBar,
} from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SwarmState, SwarmNode } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ── meta por estado ──────────────────────────────────────────────
const STATUS_META: Record<SwarmNode["status"], { label: string; color: string }> = {
    semilla:  { label: "Semilla",  color: "#a78bfa" },
    activo:   { label: "Activo",   color: "#34d399" },
    flujo:    { label: "Flujo",    color: "#38bdf8" },
    revision: { label: "Revisión", color: "#f59e0b" },
    hecho:    { label: "Hecho",    color: "#6b7280" },
};

const STATUS_ORDER: SwarmNode["status"][] = ["semilla", "activo", "flujo", "revision", "hecho"];

export function ProjectSwarmWidget() {
    const { data, loading } = useWidgetData("productivity.swarm", { refreshMs: 10000 });
    const [statusFilter, setStatusFilter] = useState<SwarmNode["status"] | "todos">("todos");
    // Local set of node IDs released to the swarm
    const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set());

    const filteredNodes = useMemo<SwarmNode[]>(() => {
        const list = (data as SwarmState | undefined)?.nodes ?? [];
        return statusFilter === "todos" ? list : list.filter((n) => n.status === statusFilter);
    }, [data, statusFilter]);

    function toggleRelease(id: string) {
        setReleasedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    return (
        <WidgetShell
            title="Enjambre de Propósitos"
            subtitle="Constelación de proyectos vivos"
            icon={Network}
            accent="#06b6d4"
            live
            actions={
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Ver <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data as SwarmState;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const expanded = size.vTier === "expanded";
                const itemMax = expanded ? 6 : compact ? 2 : 4;

                // ── MICRO: top 3 nodos en lista compacta ─────────
                if (micro) {
                    const topNodes = [...d.nodes]
                        .sort((a, b) => b.urgency * b.impact - a.urgency * a.impact)
                        .slice(0, 3);
                    return (
                        <div className="flex flex-col gap-1.5 pt-1">
                            {topNodes.map((n) => {
                                const sm = STATUS_META[n.status];
                                return (
                                    <div key={n.id} className="flex items-center gap-2 min-w-0">
                                        <span
                                            className="shrink-0 size-2 rounded-full"
                                            style={{ background: n.accent, boxShadow: `0 0 5px ${n.accent}` }}
                                        />
                                        <span className="flex-1 min-w-0 text-[10px] font-bold truncate">{n.label}</span>
                                        <Chip color={sm.color}>{sm.label}</Chip>
                                    </div>
                                );
                            })}
                        </div>
                    );
                }

                // ── REGULAR / COMPACT / EXPANDED ─────────────────
                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">

                        {/* Cabecera: openToSwarm */}
                        <div className="shrink-0 flex items-center justify-between gap-2">
                            <div
                                className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
                                style={{
                                    background: "color-mix(in srgb, #06b6d4 10%, transparent)",
                                    borderColor: "color-mix(in srgb, #06b6d4 25%, transparent)",
                                }}
                            >
                                <Sparkles className="size-3 text-cyan-400" />
                                <span className="text-[10px] font-black text-cyan-300">
                                    {d.openToSwarm + releasedIds.size} subtareas
                                </span>
                                <span className="text-[9px] text-muted-foreground/60 hidden @sm:inline">
                                    soltadas al Ágora del Don
                                </span>
                            </div>
                            <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">
                                {d.nodes.length} proyectos
                            </span>
                        </div>

                        {/* Filtros de estado */}
                        {!compact && (
                            <div className="shrink-0 flex flex-wrap gap-1">
                                <button
                                    onClick={() => setStatusFilter("todos")}
                                    className={cn(
                                        "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                        statusFilter === "todos"
                                            ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                            : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                    )}
                                >
                                    Todos
                                </button>
                                {STATUS_ORDER.map((st) => {
                                    const sm = STATUS_META[st];
                                    const active = statusFilter === st;
                                    return (
                                        <button
                                            key={st}
                                            onClick={() => setStatusFilter(st)}
                                            className={cn(
                                                "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer"
                                            )}
                                            style={active
                                                ? {
                                                    background: `color-mix(in srgb, ${sm.color} 18%, transparent)`,
                                                    borderColor: `color-mix(in srgb, ${sm.color} 35%, transparent)`,
                                                    color: sm.color,
                                                }
                                                : undefined
                                            }
                                        >
                                            {sm.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Lista de nodos */}
                        <div className="flex-1 min-h-0">
                            <AnimatePresence mode="popLayout">
                                <MiniList
                                    items={filteredNodes}
                                    max={itemMax}
                                    empty="Sin proyectos en este estado"
                                    render={(node) => {
                                        const sm = STATUS_META[node.status];
                                        const priority = node.urgency * node.impact;
                                        const released = releasedIds.has(node.id);
                                        return (
                                            <motion.div
                                                layout
                                                key={node.id}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -6 }}
                                                className={cn(
                                                    "rounded-xl border px-2.5 py-2 transition-colors",
                                                    released
                                                        ? "border-cyan-500/30 bg-cyan-500/[0.06]"
                                                        : "border-border/40 bg-white/[0.02] hover:border-border/60"
                                                )}
                                            >
                                                {/* Fila superior */}
                                                <div className="flex items-start gap-2">
                                                    {/* Dot de brillo proporcional */}
                                                    <div className="shrink-0 mt-0.5 relative size-5 grid place-items-center">
                                                        <span
                                                            className="absolute inset-0 rounded-full opacity-25 animate-pulse"
                                                            style={{ background: node.accent }}
                                                        />
                                                        <span
                                                            className="size-2.5 rounded-full"
                                                            style={{
                                                                background: node.accent,
                                                                boxShadow: `0 0 ${6 + priority * 10}px ${node.accent}`,
                                                                opacity: 0.6 + priority * 0.4,
                                                            }}
                                                        />
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{node.label}</span>
                                                        </div>
                                                        {/* Barra de impacto */}
                                                        {!compact && (
                                                            <div className="mt-1">
                                                                <ProgressBar
                                                                    value={node.impact}
                                                                    color={node.accent}
                                                                    height={3}
                                                                    label="Impacto"
                                                                    showPct
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Chips y acciones */}
                                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                                        <Chip color={sm.color}>{sm.label}</Chip>
                                                        <span className="text-[8px] text-muted-foreground/50 tabular-nums">
                                                            {node.subtasks} subtareas
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Botón "Soltar al enjambre" */}
                                                {!compact && (
                                                    <div className="mt-1.5 flex justify-end">
                                                        <motion.button
                                                            whileTap={{ scale: 0.93 }}
                                                            onClick={() => toggleRelease(node.id)}
                                                            className={cn(
                                                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                                                released
                                                                    ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                                                    : "border-border/40 text-muted-foreground/50 hover:border-cyan-500/30 hover:text-cyan-400"
                                                            )}
                                                        >
                                                            {released
                                                                ? <><CheckCircle2 className="size-2.5" /> Soltado</>
                                                                : <><Sparkles className="size-2.5" /> Soltar al enjambre</>}
                                                        </motion.button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        );
                                    }}
                                />
                            </AnimatePresence>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
