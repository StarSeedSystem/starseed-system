'use client';

import { useMemo, useState } from "react";
import { GitBranch, BadgeCheck, Target, ChevronRight, Lock, Zap, Award, Sparkles } from "lucide-react";
import { WidgetShell, ProgressBar, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SkillBranch } from "@/lib/widget-data/types";
import { cn } from "@/lib/utils";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

const ACCENT = "#a78bfa";

interface FlatNode {
    node: SkillBranch;
    depth: number;
    parentId: string | null;
    locked: boolean;     // requisito: el padre debe alcanzar maestría >= 0.5
}

function flatten(branch: SkillBranch, depth = 0, parentId: string | null = null, parentMastery = 1, acc: FlatNode[] = []): FlatNode[] {
    if (depth > 0) acc.push({ node: branch, depth, parentId, locked: parentMastery < 0.5 });
    branch.children?.forEach((c) => flatten(c, depth + 1, branch.id, branch.mastery, acc));
    return acc;
}

// XP determinista derivado del id + maestría (no aleatorio).
function xpFor(node: SkillBranch): { xp: number; next: number } {
    let h = 0;
    for (let i = 0; i < node.id.length; i++) h = (h * 31 + node.id.charCodeAt(i)) >>> 0;
    const next = 800 + (h % 5) * 200;
    return { xp: Math.round(node.mastery * next), next };
}

export function SkillTreeWidget() {
    const { data, loading } = useWidgetData("education.skilltree", { refreshMs: 15000 });
    const [active, setActive] = useState<string | null>(null);
    const [disc, setDisc] = useState<string | null>(null);

    const rows = useMemo(() => (data ? flatten(data) : []), [data]);
    const disciplines = useMemo(() => Array.from(new Set(rows.map((r) => r.node.discipline))), [rows]);
    const filtered = useMemo(() => (disc ? rows.filter((r) => r.node.discipline === disc) : rows), [rows, disc]);
    const activeRow = active ? rows.find((r) => r.node.id === active) ?? null : null;

    return (
        <WidgetShell title="Árbol de Habilidades" subtitle="Maestría aplicada" icon={GitBranch} accent={ACCENT}
            connections={[{ label: "Biblioteca", href: "/library", color: "#a855f7" }, { label: "Educación", href: "/network/education", color: "#7FB8FF" }]}>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const max = size.vTier === "micro" ? 3 : size.vTier === "compact" ? 4 : size.vTier === "regular" ? 6 : 10;
                const overall = rows.length ? rows.reduce((s, r) => s + r.node.mastery, 0) / rows.length : 0;
                const certified = rows.filter((r) => r.node.certified).length;

                // ── Panel de detalle de rama seleccionada ──
                if (activeRow && size.tier !== "micro") {
                    const n = activeRow.node;
                    const { xp, next } = xpFor(n);
                    const ring = [{ name: "m", value: Math.round(n.mastery * 100), fill: ACCENT }];
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 h-full">
                            <button onClick={() => setActive(null)}
                                className="self-start inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer">
                                <ChevronRight className="size-3 rotate-180" /> Volver
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="relative size-20 shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadialBarChart innerRadius="72%" outerRadius="100%" data={ring} startAngle={90} endAngle={-270}>
                                            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                            <RadialBar background={{ fill: "hsl(var(--muted)/0.25)" }} dataKey="value" cornerRadius={8} />
                                        </RadialBarChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 grid place-items-center">
                                        <span className="text-base font-black tabular-nums text-violet-300">{Math.round(n.mastery * 100)}%</span>
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <h4 className="text-sm font-black leading-tight truncate">{n.label}</h4>
                                        {n.certified && <BadgeCheck className="size-4 text-violet-400 shrink-0" />}
                                    </div>
                                    <Chip color={ACCENT}>{n.discipline}</Chip>
                                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-amber-300">
                                        <Zap className="size-3.5" /> {xp.toLocaleString()} <span className="text-muted-foreground/50">/ {next.toLocaleString()} XP</span>
                                    </div>
                                </div>
                            </div>
                            {n.microMission ? (
                                <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] p-3">
                                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-violet-300 mb-1">
                                        <Target className="size-3.5" /> Misión activa
                                    </div>
                                    <p className="text-xs text-violet-100/90 leading-snug">{n.microMission}</p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3 flex items-center gap-2">
                                    <Award className="size-4 text-emerald-400 shrink-0" />
                                    <p className="text-xs text-emerald-100/90 leading-snug">Rama dominada. Sin misiones pendientes.</p>
                                </div>
                            )}
                            <div className="mt-auto rounded-xl border border-border/40 bg-white/[0.02] p-2.5">
                                <ProgressBar value={n.mastery} color={ACCENT} showPct label="Progreso de maestría" />
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.vTier !== "micro" && (
                            <div className="flex items-center gap-1.5 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2">
                                <Sparkles className="size-3.5 text-violet-300 shrink-0" />
                                <span className="text-[10px] uppercase tracking-wider font-black text-violet-300">Maestría global</span>
                                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300"><BadgeCheck className="size-3" />{certified}</span>
                                <span className="text-lg font-black tabular-nums text-violet-300 ml-2">{Math.round(overall * 100)}%</span>
                            </div>
                        )}
                        {/* Selección de rama por disciplina */}
                        {size.tier !== "micro" && disciplines.length > 1 && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                                <button onClick={() => setDisc(null)}
                                    className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer",
                                        !disc ? "bg-violet-500/20 border-violet-500/45 text-violet-300" : "border-border/40 text-muted-foreground/60 hover:border-violet-500/30")}>
                                    Todas
                                </button>
                                {disciplines.map((d) => (
                                    <button key={d} onClick={() => setDisc(disc === d ? null : d)}
                                        className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer capitalize",
                                            disc === d ? "bg-violet-500/20 border-violet-500/45 text-violet-300" : "border-border/40 text-muted-foreground/60 hover:border-violet-500/30")}>
                                        {d}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar space-y-1.5">
                            {filtered.slice(0, max).map(({ node, depth, locked }) => (
                                <button key={node.id} onClick={() => !locked && setActive(node.id)} disabled={locked}
                                    className={cn("w-full text-left rounded-xl border p-2 transition-colors",
                                        locked ? "border-border/30 bg-white/[0.01] opacity-55 cursor-not-allowed" : "border-border/40 bg-white/[0.03] hover:border-violet-500/40 cursor-pointer")}
                                    style={{ marginLeft: depth > 1 ? (depth - 1) * 10 : 0 }}>
                                    <div className="flex items-center gap-2">
                                        {depth > 1 && <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />}
                                        <span className="text-xs font-bold truncate flex-1">{node.label}</span>
                                        {locked
                                            ? <Lock className="size-3 text-muted-foreground/50 shrink-0" />
                                            : node.certified && <BadgeCheck className="size-3.5 text-violet-400 shrink-0" />}
                                        <span className="text-[10px] font-black tabular-nums text-violet-300">{Math.round(node.mastery * 100)}%</span>
                                    </div>
                                    <div className="mt-1.5"><ProgressBar value={locked ? 0 : node.mastery} color={locked ? "hsl(var(--muted-foreground))" : ACCENT} height={5} /></div>
                                    {locked && <p className="mt-1 text-[9px] text-muted-foreground/60 italic">Requiere 50% en la rama anterior</p>}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
