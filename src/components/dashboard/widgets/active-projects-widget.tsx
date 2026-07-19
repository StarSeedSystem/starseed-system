'use client';

import Link from "next/link";
import { Rocket, Plus, Users, ChevronRight, Landmark, Pause, RefreshCw, CheckCircle2, Activity, ArrowRight, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, ProgressRing, ProgressBar, Chip, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Project } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// ActiveProjectsWidget — proyectos en génesis del usuario.
// Datos en vivo "productivity.projects". Adaptativo + theme-aware.
// Enhancements: progress bars, status chips, "aporta"/ver links,
// interconnects to /network/politics and /hub.
// ════════════════════════════════════════════════════════════════

const STATUS_META: Record<Project["status"], { label: string; color: string; icon: LucideIcon }> = {
    activo:     { label: "Activo",     color: "#10b981", icon: Activity },
    pausado:    { label: "Pausado",    color: "#f59e0b", icon: Pause },
    revision:   { label: "Revisión",   color: "#6366f1", icon: RefreshCw },
    completado: { label: "Completado", color: "#22d3ee", icon: CheckCircle2 },
};

/** Decide a good destination route for a project based on keywords. */
function projectRoute(p: Project): string {
    const name = p.name.toLowerCase();
    if (/ley|energía|voto|política|propuesta|gobernanza/.test(name)) return "/network/politics";
    if (/comunit|sangha|oikos|hub|círculo|colectivo/.test(name)) return "/hub";
    return "/hub";
}

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
                { label: "Política", href: "/network/politics", color: "#DC143C", icon: Landmark },
                { label: "Publicar", href: "/publish", color: "#ec4899", icon: Rocket },
                { label: "Biblioteca", href: "/library", color: "#10b981", icon: ChevronRight },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const active = [...data].filter(p => p.status !== "completado").sort((a, b) => b.progress - a.progress);
                const max = micro ? 3 : size.vTier === "expanded" ? 5 : 4;
                const completedCount = data.filter(p => p.status === "completado").length;

                return (
                    <div className="pt-1 h-full flex flex-col gap-1.5">
                        <MiniList
                            items={active}
                            max={max}
                            empty="Sin proyectos activos"
                            render={(p) => {
                                const statusMeta = STATUS_META[p.status];
                                const SIcon = statusMeta.icon;
                                const route = projectRoute(p);
                                return (
                                    <div className="rounded-xl border border-border/40 bg-white/[0.02] hover:border-indigo-500/25 hover:bg-white/[0.04] transition-all">
                                        <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-1.5">
                                            {!micro && (
                                                <div className="shrink-0">
                                                    <ProgressRing value={p.progress} size={38} stroke={4} color={p.accent} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                {/* Title row */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate">{p.name}</span>
                                                    {micro ? (
                                                        <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: p.accent }}>{Math.round(p.progress * 100)}%</span>
                                                    ) : (
                                                        <Chip color={statusMeta.color}>
                                                            <SIcon className="size-2.5 inline mr-0.5" />{statusMeta.label}
                                                        </Chip>
                                                    )}
                                                </div>

                                                {/* Progress bar */}
                                                <div className="mt-1.5">
                                                    <ProgressBar value={p.progress} color={p.accent} height={micro ? 3 : 4} />
                                                </div>

                                                {/* Meta row */}
                                                {!micro && (
                                                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                                        <span className="inline-flex items-center gap-0.5 shrink-0">
                                                            <Users className="size-2.5" /> {p.collaborators}
                                                        </span>
                                                        <span className="tabular-nums shrink-0 ml-auto">{timeUntil(p.dueTs)}</span>
                                                    </div>
                                                )}

                                                {/* Expanded: next milestone + action links */}
                                                {size.vTier === "expanded" && (
                                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                                                        <span className="text-[9px] text-muted-foreground/55 truncate flex-1">
                                                            <ChevronRight className="size-2.5 inline -mt-0.5" style={{ color: p.accent }} />
                                                            {p.nextMilestone}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <Link href={route}
                                                                className="inline-flex items-center gap-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer">
                                                                <ArrowRight className="size-2" /> Aporta
                                                            </Link>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }}
                        />

                        {/* Footer summary */}
                        {!micro && data.length > 0 && (
                            <div className="shrink-0 flex items-center justify-between gap-2 rounded-xl border border-border/30 bg-white/[0.015] px-2.5 py-1.5 mt-auto">
                                <span className="text-[9px] text-muted-foreground/55 font-bold uppercase tracking-wide">
                                    {active.length} activos · {completedCount} completados
                                </span>
                                <Link href="/hub"
                                    className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">
                                    Ver Hub <ChevronRight className="size-3" />
                                </Link>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
