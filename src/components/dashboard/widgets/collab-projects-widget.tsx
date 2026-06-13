'use client';

import Link from "next/link";
import { Users, Clock, Target, ChevronRight } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, StatTile, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Project } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// CollabProjectsWidget — hub colaborativo: proyectos compartidos con
// progreso, colaboradores e hitos. Datos "productivity.projects".
// Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const STATUS_COLOR: Record<Project["status"], string> = {
    activo: "#6366f1", revision: "#10b981", pausado: "#f59e0b", completado: "#38bdf8",
};
const STATUS_LABEL: Record<Project["status"], string> = {
    activo: "Activo", revision: "Revisión", pausado: "Pausado", completado: "Completado",
};

export function CollabProjectsWidget() {
    const { data, loading } = useWidgetData("productivity.projects", { refreshMs: 8000 });

    return (
        <WidgetShell
            title="Hub Colaborativo"
            subtitle="Proyectos compartidos"
            icon={Target}
            accent="#a855f7"
            live
            actions={
                <Link href="/hub" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Hub <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const sorted = [...data].sort((a, b) => b.progress - a.progress);
                const avg = data.reduce((s, p) => s + p.progress, 0) / Math.max(1, data.length);
                const totalCollabs = data.reduce((s, p) => s + p.collaborators, 0);
                const showStats = !micro && size.vTier !== "compact";
                const max = micro ? 3 : size.vTier === "expanded" ? 4 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {showStats && (
                            <div className="grid grid-cols-2 gap-2 shrink-0">
                                <StatTile label="Sincronía" value={`${Math.round(avg * 100)}%`} accent="#a855f7" icon={Target} compact />
                                <StatTile label="Colaboradores" value={totalCollabs} accent="#6366f1" icon={Users} compact />
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sorted}
                                max={max}
                                empty="Sin colaboraciones"
                                render={(p) => {
                                    const color = STATUS_COLOR[p.status];
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{p.name}</span>
                                                {!micro && <Chip color={color}>{STATUS_LABEL[p.status]}</Chip>}
                                            </div>
                                            {!micro && (
                                                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                    <span className="inline-flex items-center gap-1"><Users className="size-3" /> {p.collaborators}</span>
                                                    <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {timeUntil(p.dueTs)}</span>
                                                    <span className="ml-auto font-black tabular-nums" style={{ color }}>{Math.round(p.progress * 100)}%</span>
                                                </div>
                                            )}
                                            <div className="mt-1.5"><ProgressBar value={p.progress} color={color} height={micro ? 3 : 4} /></div>
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
