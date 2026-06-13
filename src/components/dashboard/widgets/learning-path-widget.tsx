'use client';

import Link from "next/link";
import { GraduationCap, Bot, User, Users, ChevronRight, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, ProgressBar, ProgressRing } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { LearningPath } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// LearningPathWidget — rutas de aprendizaje del usuario (mentoría
// híbrida humano + IA). Datos "education.paths". Adaptativo.
// ════════════════════════════════════════════════════════════════
const MENTOR_ICON: Record<LearningPath["mentorKind"], LucideIcon> = {
    humano: User, ia: Bot, hibrido: Users,
};

export function LearningPathWidget() {
    const { data, loading } = useWidgetData("education.paths", { refreshMs: 15000 });

    return (
        <WidgetShell
            title="Ruta de Aprendizaje"
            subtitle="Mentoría humano · IA"
            icon={GraduationCap}
            accent="#a855f7"
            actions={
                <Link href="/network/education" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Aprender <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const sorted = [...data].sort((a, b) => b.progress - a.progress);
                const max = micro ? 3 : size.vTier === "expanded" ? 4 : 3;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            empty="Sin rutas activas"
                            render={(p) => {
                                const MentorIcon = MENTOR_ICON[p.mentorKind];
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer">
                                        {!micro && <div className="shrink-0"><ProgressRing value={p.progress} size={38} stroke={4} color={p.accent} /></div>}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{p.title}</span>
                                                {micro && <span className="text-[10px] font-black tabular-nums shrink-0" style={{ color: p.accent }}>{Math.round(p.progress * 100)}%</span>}
                                            </div>
                                            {micro ? (
                                                <div className="mt-1"><ProgressBar value={p.progress} color={p.accent} height={3} /></div>
                                            ) : (
                                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                    <span className="truncate">{p.discipline}</span>
                                                    <span className="inline-flex items-center gap-1 shrink-0"><MentorIcon className="size-3" /> {p.mentor}</span>
                                                </div>
                                            )}
                                            {size.vTier === "expanded" && (
                                                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                                                    <ChevronRight className="size-3 shrink-0" style={{ color: p.accent }} />
                                                    <span className="truncate">{p.nextLesson}</span>
                                                </div>
                                            )}
                                        </div>
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
