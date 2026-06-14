'use client';

import Link from "next/link";
import { Rocket, Plus, Users, ChevronRight } from "lucide-react";
import { WidgetShell, MiniList, ProgressRing, ProgressBar, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Project } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// ActiveProjectsWidget — proyectos en génesis del usuario.
// Datos en vivo "productivity.projects". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const STATUS_LABEL: Record<Project["status"], string> = {
    activo: "Activo", pausado: "Pausado", revision: "Revisión", completado: "Completado",
};

export function ActiveProjectsWidget() {
    const { data, loading } = useWidgetData("productivity.projects", { refreshMs: 7000 });

    return (
        <WidgetShell
            title="Génesis Activa"
            subtitle="Proyectos en curso"
            icon={Rocket}
            accent="#6366f1"
            live
            expandHref="/hub"
            actions={
                <Link href="/hub" className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                    <Plus className="size-3" /> Nuevo
                </Link>
            }
            connections={[
                { label: "Hub", href: "/hub", color: "#6366f1", icon: Users },
                { label: "Publicar", href: "/publish", color: "#ec4899", icon: Rocket },
                { label: "Biblioteca", href: "/library", color: "#10b981", icon: ChevronRight },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const active = [...data].filter(p => p.status !== "completado").sort((a, b) => b.progress - a.progress);
                const max = micro ? 3 : size.vTier === "expanded" ? 5 : 4;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={active}
                            max={max}
                            empty="Sin proyectos activos"
                            render={(p) => (
                                <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer">
                                    {!micro && (
                                        <div className="shrink-0">
                                            <ProgressRing value={p.progress} size={38} stroke={4} color={p.accent} />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{p.name}</span>
                                            {micro && <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: p.accent }}>{Math.round(p.progress * 100)}%</span>}
                                        </div>
                                        {micro ? (
                                            <div className="mt-1"><ProgressBar value={p.progress} color={p.accent} height={3} /></div>
                                        ) : (
                                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                <span className="truncate">{STATUS_LABEL[p.status]}</span>
                                                <span className="inline-flex items-center gap-1 shrink-0"><Users className="size-3" /> {p.collaborators}</span>
                                                <span className="ml-auto shrink-0 tabular-nums">{timeUntil(p.dueTs)}</span>
                                            </div>
                                        )}
                                        {size.vTier === "expanded" && (
                                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                                                <ChevronRight className="size-3 shrink-0" style={{ color: p.accent }} />
                                                <span className="truncate">{p.nextMilestone}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
