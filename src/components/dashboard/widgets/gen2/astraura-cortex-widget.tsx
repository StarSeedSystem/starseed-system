'use client';

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    BrainCircuit, Pause, Search, Zap, Loader2, Check, X, ChevronLeft, type LucideIcon,
} from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// AstrauraCortexWidget — Córtex / Exocórtex (IA).
// ----------------------------------------------------------------
// PROFUNDIZACIÓN (esta versión):
//   • Sugerencias con CONFIANZA (barra) derivada de forma determinista.
//   • Aceptar / Descartar cada sugerencia (estado local) → desaparece de
//     la lista y suma al contador de acciones gestionadas.
//   • Filtro por tipo (pausa / investigar / acción / todas).
//   • Vista de escenario: al pulsar una sugerencia se abre un panel con
//     detalle, factores y acciones (aceptar / descartar / volver).
//   • Tareas de fondo con progreso (recharts no necesario aquí).
// Invariante: amplificar cognición; el exocórtex sirve al usuario.
// ════════════════════════════════════════════════════════════════

type Kind = "pausa" | "investigar" | "accion";
const kindIcon: Record<Kind, LucideIcon> = { pausa: Pause, investigar: Search, accion: Zap };
const kindColor: Record<Kind, string> = { pausa: "#38bdf8", investigar: "#a78bfa", accion: "#10b981" };
const kindLabel: Record<Kind, string> = { pausa: "Pausa", investigar: "Investigar", accion: "Acción" };

const FILTERS: { id: Kind | "all"; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "pausa", label: "Pausa" },
    { id: "investigar", label: "Estudio" },
    { id: "accion", label: "Acción" },
];

// hash determinista local para confianza por id (sin Math.random).
function confOf(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 0.55 + ((h >>> 0) / 4294967295) * 0.42;
}
function detailOf(kind: Kind): { drivers: string[]; rationale: string } {
    if (kind === "pausa") return { rationale: "Tu carga cognitiva acumulada sugiere un descanso breve para sostener la calidad de decisión.", drivers: ["carga cognitiva ↑", "sesión prolongada", "ritmo circadiano"] };
    if (kind === "investigar") return { rationale: "Detecté una propuesta relevante para tus delegaciones que aún no has revisado.", drivers: ["afinidad temática", "votación próxima", "fuentes nuevas"] };
    return { rationale: "Una acción de bajo coste con alto impacto en el procomún está disponible ahora.", drivers: ["excedente disponible", "ventana óptima", "consenso vecinal"] };
}

export function AstrauraCortexWidget() {
    const { data, loading } = useWidgetData("ai.astraura", { refreshMs: 4000 });
    const [filter, setFilter] = useState<Kind | "all">("all");
    const [resolved, setResolved] = useState<Record<string, "accept" | "dismiss">>({});
    const [openId, setOpenId] = useState<string | null>(null);

    const managed = useMemo(() => Object.keys(resolved).length, [resolved]);

    return (
        <WidgetShell title="Córtex Astraura" subtitle="Tu exocórtex" icon={BrainCircuit} accent="#8b5cf6" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                const visible = data.suggestions
                    .filter((s) => !resolved[s.id])
                    .filter((s) => filter === "all" || s.kind === filter);
                const opened = data.suggestions.find((s) => s.id === openId) ?? null;

                const resolve = (id: string, v: "accept" | "dismiss") => {
                    setResolved((p) => ({ ...p, [id]: v }));
                    setOpenId((o) => (o === id ? null : o));
                };

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        {/* Cabecera: carga + atención */}
                        <div className="flex items-center gap-3">
                            <ProgressRing value={data.cognitiveLoad} size={micro ? 60 : 70} color="#8b5cf6"
                                label={`${Math.round(data.cognitiveLoad * 100)}%`} sublabel="carga" />
                            {!micro && (
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wider font-black text-violet-300/70">Atención</div>
                                    <p className="text-xs @sm:text-sm font-semibold leading-snug line-clamp-2">{data.attention}</p>
                                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                        <span className="font-bold tabular-nums text-violet-300">{data.pendingTasks}</span> tareas ·
                                        gestionadas <span className="font-bold tabular-nums text-emerald-300">{managed}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Filtros */}
                        {!micro && (
                            <div className="flex items-center gap-1 flex-wrap">
                                {FILTERS.map((f) => (
                                    <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                                        className={cn("rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border transition-colors cursor-pointer",
                                            filter === f.id ? "bg-violet-500/20 border-violet-500/40 text-violet-200" : "border-border/40 bg-white/[0.02] text-muted-foreground hover:text-foreground")}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Detalle de escenario o lista */}
                        {!micro && size.vTier !== "compact" && (
                            <AnimatePresence mode="wait" initial={false}>
                                {opened ? (
                                    <motion.div key="detail" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                                        className="rounded-2xl border p-2.5 space-y-2"
                                        style={{ borderColor: `color-mix(in srgb, ${kindColor[opened.kind]} 40%, transparent)`, background: `color-mix(in srgb, ${kindColor[opened.kind]} 8%, transparent)` }}>
                                        <button type="button" onClick={() => setOpenId(null)}
                                            className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer">
                                            <ChevronLeft className="size-3" />Volver
                                        </button>
                                        <p className="text-xs font-semibold leading-snug">{opened.text}</p>
                                        <p className="text-[10px] text-muted-foreground/70 leading-snug">{detailOf(opened.kind).rationale}</p>
                                        <ProgressBar value={confOf(opened.id)} label="Confianza del modelo" showPct color={kindColor[opened.kind]} height={5} />
                                        <div className="flex flex-wrap gap-1">
                                            {detailOf(opened.kind).drivers.map((d) => (
                                                <span key={d} className="rounded-md bg-white/[0.05] border border-border/40 px-1.5 py-0.5 text-[8px] text-muted-foreground/70">{d}</span>
                                            ))}
                                        </div>
                                        <div className="flex gap-1.5 pt-0.5">
                                            <button type="button" onClick={() => resolve(opened.id, "accept")}
                                                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors hover:bg-emerald-500/30 cursor-pointer">
                                                <Check className="size-3" />Aceptar
                                            </button>
                                            <button type="button" onClick={() => resolve(opened.id, "dismiss")}
                                                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-white/[0.04] border border-border/40 text-muted-foreground py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors hover:text-foreground cursor-pointer">
                                                <X className="size-3" />Descartar
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
                                        {visible.length === 0 ? (
                                            <div className="rounded-xl border border-border/40 bg-white/[0.02] py-3 text-center text-[10px] text-muted-foreground/60">
                                                Sin sugerencias {filter !== "all" ? "de este tipo" : "pendientes"}
                                            </div>
                                        ) : visible.slice(0, size.vTier === "expanded" ? 3 : 2).map((s) => {
                                            const Icon = kindIcon[s.kind as Kind];
                                            const color = kindColor[s.kind as Kind];
                                            return (
                                                <div key={s.id}
                                                    className="rounded-xl border border-border/40 bg-white/[0.03] p-2 hover:border-violet-500/30 transition-colors">
                                                    <button type="button" onClick={() => setOpenId(s.id)}
                                                        className="flex items-start gap-2 w-full text-left cursor-pointer">
                                                        <span className="grid place-items-center size-6 rounded-lg shrink-0 mt-0.5"
                                                            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
                                                            <Icon className="size-3" />
                                                        </span>
                                                        <span className="text-[11px] leading-tight line-clamp-2 flex-1">{s.text}</span>
                                                    </button>
                                                    <div className="mt-1.5 flex items-center gap-1.5">
                                                        <span className="text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full"
                                                            style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{kindLabel[s.kind as Kind]}</span>
                                                        <div className="flex-1"><ProgressBar value={confOf(s.id)} color={color} height={3} /></div>
                                                        <button type="button" onClick={() => resolve(s.id, "accept")} title="Aceptar"
                                                            className="grid place-items-center size-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer">
                                                            <Check className="size-3" />
                                                        </button>
                                                        <button type="button" onClick={() => resolve(s.id, "dismiss")} title="Descartar"
                                                            className="grid place-items-center size-6 rounded-lg bg-white/[0.04] border border-border/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                                                            <X className="size-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}

                        {/* Tareas de fondo */}
                        {size.vTier === "expanded" && !opened && (
                            <div className="mt-auto space-y-1.5">
                                {data.backgroundJobs.map((j) => (
                                    <div key={j.id} className="flex items-center gap-2">
                                        <Loader2 className="size-3 text-violet-400 animate-spin shrink-0" />
                                        <div className="flex-1"><ProgressBar value={j.progress} label={j.label} color="#8b5cf6" height={5} /></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
