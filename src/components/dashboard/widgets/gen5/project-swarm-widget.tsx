'use client';

// ════════════════════════════════════════════════════════════════
// ProjectSwarmWidget — Enjambre de Propósitos (Tablero Kanban)
// ----------------------------------------------------------------
// Constelación viva de proyectos organizada como tablero kanban de tres
// columnas: Backlog · En curso · Hecho. Cada tarjeta es movible entre
// columnas con botones ◀▶ (estado local, no muta los datos servidor).
// Conteo por columna, barra de progreso global del enjambre y "Soltar
// al Ágora del Don". Datos "productivity.swarm". Adaptativo.
// ════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Network, ChevronRight, ChevronLeft, Sparkles, CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
    WidgetShell, Chip, ProgressBar,
} from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SwarmState, SwarmNode } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ── meta por estado original ─────────────────────────────────────
const STATUS_META: Record<SwarmNode["status"], { label: string; color: string }> = {
    semilla:  { label: "Semilla",  color: "#a78bfa" },
    activo:   { label: "Activo",   color: "#34d399" },
    flujo:    { label: "Flujo",    color: "#38bdf8" },
    revision: { label: "Revisión", color: "#f59e0b" },
    hecho:    { label: "Hecho",    color: "#6b7280" },
};

// ── columnas kanban ──────────────────────────────────────────────
type Column = "backlog" | "curso" | "hecho";
const COLUMNS: { id: Column; label: string; color: string }[] = [
    { id: "backlog", label: "Backlog",  color: "#a78bfa" },
    { id: "curso",   label: "En curso", color: "#38bdf8" },
    { id: "hecho",   label: "Hecho",    color: "#34d399" },
];
const COLUMN_INDEX: Record<Column, number> = { backlog: 0, curso: 1, hecho: 2 };

// Map del estado de servidor → columna kanban inicial
function statusToColumn(status: SwarmNode["status"]): Column {
    if (status === "semilla") return "backlog";
    if (status === "hecho") return "hecho";
    return "curso"; // activo, flujo, revision
}

export function ProjectSwarmWidget() {
    const { data, loading } = useWidgetData("productivity.swarm", { refreshMs: 10000 });
    // Estado kanban local: override de columna por id de nodo
    const [columnOverride, setColumnOverride] = useState<Record<string, Column>>({});
    // Subtareas soltadas al Ágora del Don
    const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set());

    const nodes = useMemo<SwarmNode[]>(() => (data as SwarmState | undefined)?.nodes ?? [], [data]);

    function columnOf(node: SwarmNode): Column {
        return columnOverride[node.id] ?? statusToColumn(node.status);
    }

    function moveNode(id: string, dir: -1 | 1, current: Column) {
        const next = COLUMN_INDEX[current] + dir;
        if (next < 0 || next > 2) return;
        const target = COLUMNS[next].id;
        setColumnOverride((prev) => ({ ...prev, [id]: target }));
    }

    function toggleRelease(id: string) {
        setReleasedIds((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    }

    // Agrupación por columna (deriva de columnOf)
    const byColumn = useMemo(() => {
        const map: Record<Column, SwarmNode[]> = { backlog: [], curso: [], hecho: [] };
        for (const n of nodes) map[columnOf(n)].push(n);
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, columnOverride]);

    const doneCount = byColumn.hecho.length;
    const progress = nodes.length > 0 ? doneCount / nodes.length : 0;

    return (
        <WidgetShell
            title="Enjambre de Propósitos"
            subtitle="Tablero kanban de proyectos vivos"
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
                // Tablero horizontal sólo si hay ancho suficiente
                const boardMode = size.tier === "expanded" || (size.tier === "regular" && !compact);

                // ── MICRO: top 3 nodos en lista compacta ─────────
                if (micro) {
                    const topNodes = [...nodes]
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

                // ── Tarjeta kanban reutilizable ──────────────────
                const renderCard = (node: SwarmNode, col: Column, dense: boolean) => {
                    const idx = COLUMN_INDEX[col];
                    const released = releasedIds.has(node.id);
                    const priority = node.urgency * node.impact;
                    return (
                        <motion.div
                            layout
                            key={node.id}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.18 }}
                            className={cn(
                                "rounded-xl border px-2 py-1.5 transition-colors",
                                released
                                    ? "border-cyan-500/30 bg-cyan-500/[0.06]"
                                    : "border-border/40 bg-white/[0.02] hover:border-border/60"
                            )}
                        >
                            <div className="flex items-start gap-1.5">
                                <span
                                    className="shrink-0 mt-1 size-2 rounded-full"
                                    style={{
                                        background: node.accent,
                                        boxShadow: `0 0 ${4 + priority * 8}px ${node.accent}`,
                                    }}
                                />
                                <span className="min-w-0 flex-1 text-[10px] @sm:text-[11px] font-bold leading-snug line-clamp-2">
                                    {node.label}
                                </span>
                                <span className="shrink-0 text-[8px] text-muted-foreground/45 tabular-nums">
                                    {node.subtasks}st
                                </span>
                            </div>

                            {!dense && (
                                <div className="mt-1.5">
                                    <ProgressBar value={node.impact} color={node.accent} height={3} label="Impacto" showPct />
                                </div>
                            )}

                            {/* Controles de movimiento + soltar */}
                            <div className="mt-1.5 flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => moveNode(node.id, -1, col)}
                                        disabled={idx === 0}
                                        aria-label="Mover a columna anterior"
                                        className={cn(
                                            "grid place-items-center size-5 rounded-md border transition-all cursor-pointer",
                                            idx === 0
                                                ? "border-border/20 text-muted-foreground/20 cursor-not-allowed"
                                                : "border-border/40 text-muted-foreground/60 hover:border-cyan-500/40 hover:text-cyan-300"
                                        )}
                                    >
                                        <ChevronLeft className="size-3" />
                                    </button>
                                    <button
                                        onClick={() => moveNode(node.id, 1, col)}
                                        disabled={idx === 2}
                                        aria-label="Mover a columna siguiente"
                                        className={cn(
                                            "grid place-items-center size-5 rounded-md border transition-all cursor-pointer",
                                            idx === 2
                                                ? "border-border/20 text-muted-foreground/20 cursor-not-allowed"
                                                : "border-border/40 text-muted-foreground/60 hover:border-cyan-500/40 hover:text-cyan-300"
                                        )}
                                    >
                                        <ChevronRight className="size-3" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => toggleRelease(node.id)}
                                    aria-pressed={released}
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer",
                                        released
                                            ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                            : "border-border/40 text-muted-foreground/50 hover:border-cyan-500/30 hover:text-cyan-400"
                                    )}
                                >
                                    {released
                                        ? <><CheckCircle2 className="size-2.5" /> Soltado</>
                                        : <><Sparkles className="size-2.5" /> Soltar</>}
                                </button>
                            </div>
                        </motion.div>
                    );
                };

                // ── Cabecera: progreso + Ágora ───────────────────
                const header = (
                    <div className="shrink-0 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div
                                className="flex items-center gap-1.5 rounded-xl border px-2 py-1"
                                style={{
                                    background: "color-mix(in srgb, #06b6d4 10%, transparent)",
                                    borderColor: "color-mix(in srgb, #06b6d4 25%, transparent)",
                                }}
                            >
                                <Sparkles className="size-3 text-cyan-400" />
                                <span className="text-[10px] font-black text-cyan-300">
                                    {d.openToSwarm + releasedIds.size}
                                </span>
                                <span className="text-[9px] text-muted-foreground/60 hidden @sm:inline">al Ágora del Don</span>
                            </div>
                            <span className="text-[10px] font-black tabular-nums text-cyan-300">
                                {Math.round(progress * 100)}%
                            </span>
                        </div>
                        <ProgressBar value={progress} color="#06b6d4" height={4} label="Progreso del enjambre" />
                    </div>
                );

                // ── BOARD: tres columnas en paralelo ─────────────
                if (boardMode) {
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 h-full">
                            {header}
                            <div className="flex-1 min-h-0 grid grid-cols-3 gap-1.5">
                                {COLUMNS.map((col) => (
                                    <div key={col.id} className="flex flex-col min-h-0">
                                        <div className="shrink-0 flex items-center justify-between mb-1 px-0.5">
                                            <span
                                                className="text-[9px] font-black uppercase tracking-wider truncate"
                                                style={{ color: col.color }}
                                            >
                                                {col.label}
                                            </span>
                                            <span className="text-[9px] font-bold tabular-nums text-muted-foreground/50">
                                                {byColumn[col.id].length}
                                            </span>
                                        </div>
                                        <div
                                            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 rounded-xl p-1"
                                            style={{ background: `color-mix(in srgb, ${col.color} 5%, transparent)` }}
                                        >
                                            <AnimatePresence mode="popLayout">
                                                {byColumn[col.id].length === 0 ? (
                                                    <span className="text-[9px] text-muted-foreground/35 text-center py-2">—</span>
                                                ) : (
                                                    byColumn[col.id].map((node) => renderCard(node, col.id, true))
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }

                // ── COMPACT / REGULAR estrecho: columnas apiladas ─
                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {header}
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {COLUMNS.map((col) => {
                                const items = byColumn[col.id];
                                if (items.length === 0) return null;
                                return (
                                    <div key={col.id} className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between px-0.5">
                                            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: col.color }}>
                                                {col.label}
                                            </span>
                                            <span className="text-[9px] font-bold tabular-nums text-muted-foreground/50">
                                                {items.length}
                                            </span>
                                        </div>
                                        <AnimatePresence mode="popLayout">
                                            {items.slice(0, compact ? 2 : 4).map((node) => renderCard(node, col.id, compact))}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
