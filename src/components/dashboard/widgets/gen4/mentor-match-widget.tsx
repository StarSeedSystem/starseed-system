'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { GraduationCap, ChevronRight, Bot, User, Sparkles, Star, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, timeUntil } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Mentor } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// MentorMatchWidget — Mentoría Híbrida (humano + IA).
// Aprendizaje inmersivo con mentoría híbrida. Filtra por tipo, ordena
// por afinidad, muestra disponibilidad y próxima sesión.
// Datos "education.mentors". Adaptativo.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<Mentor["kind"], { icon: LucideIcon; label: string; color: string }> = {
    humano: { icon: User, label: "Humano", color: "#f43f5e" },
    ia: { icon: Bot, label: "IA", color: "#06b6d4" },
    hibrido: { icon: Sparkles, label: "Híbrido", color: "#a855f7" },
};

export function MentorMatchWidget() {
    const { data, loading } = useWidgetData("education.mentors", { refreshMs: 18000 });
    const [filter, setFilter] = useState<Mentor["kind"] | "todos">("todos");

    const mentors = useMemo(() => {
        const list = data?.mentors ?? [];
        return filter === "todos" ? list : list.filter((m) => m.kind === filter);
    }, [data, filter]);

    return (
        <WidgetShell
            title="Mentoría Híbrida"
            subtitle="Humano + IA, a tu medida"
            icon={GraduationCap}
            accent="#a855f7"
            actions={
                <Link href="/network/education" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Educación <ChevronRight className="size-3" />
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
                            <div className="shrink-0 flex items-center gap-1">
                                {(["todos", "humano", "ia", "hibrido"] as const).map((k) => (
                                    <button key={k} onClick={() => setFilter(k)}
                                        className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                            filter === k ? "bg-purple-500/15 border-purple-500/40 text-purple-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground")}>
                                        {k === "todos" ? "Todos" : KIND_META[k].label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={mentors}
                                max={max}
                                empty="Sin mentores en este filtro"
                                render={(m) => {
                                    const meta = KIND_META[m.kind];
                                    const MIcon = meta.icon;
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-purple-500/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="shrink-0 grid place-items-center size-7 rounded-lg" style={{ background: `color-mix(in srgb, ${meta.color} 22%, transparent)` }}>
                                                    <MIcon className="size-3.5" style={{ color: meta.color }} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate block">{m.name}</span>
                                                    <span className="text-[9px] text-muted-foreground/60 truncate block">{m.expertise}</span>
                                                </div>
                                                <div className="shrink-0 flex flex-col items-end gap-0.5">
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: meta.color }}>
                                                        <Star className="size-2.5 fill-current" /> {(m.rating * 5).toFixed(1)}
                                                    </span>
                                                    {m.availableInMin === 0
                                                        ? <Chip color="#34d399">Ahora</Chip>
                                                        : !micro && <span className="text-[8px] text-muted-foreground/50">{timeUntil(Date.now() + m.availableInMin * 60000)}</span>}
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
