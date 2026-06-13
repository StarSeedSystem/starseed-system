'use client';

import Link from "next/link";
import { BrainCircuit, Plus, ArrowRight, Sparkles, Library, MessageSquare } from "lucide-react";
import { WidgetShell, MiniList, ProgressBar, Chip } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// NexusQuickAccessWidget — acceso rápido al Exocórtex (Astraura).
// Datos en vivo "ai.astraura". Adaptativo + theme-aware.
// El Exocórtex es propiedad del usuario (invariante Ciberdelia).
// ════════════════════════════════════════════════════════════════
const KIND_COLOR: Record<string, string> = {
    pausa: "#38bdf8", investigar: "#a855f7", accion: "#f59e0b",
};

export function NexusQuickAccessWidget() {
    const { data, loading } = useWidgetData("ai.astraura", { refreshMs: 5000 });

    return (
        <WidgetShell
            title="Nexus IA"
            subtitle="Tu Exocórtex"
            icon={BrainCircuit}
            accent="#6366f1"
            live
            actions={
                <Link href="/agent" className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                    <Plus className="size-3" /> Iniciar
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                <Sparkles className="size-3 text-indigo-400" /> Atención
                            </div>
                            <p className="mt-0.5 text-[11px] @sm:text-xs font-semibold leading-snug line-clamp-2">{data.attention}</p>
                            {!micro && <div className="mt-1.5"><ProgressBar value={data.cognitiveLoad} color="#6366f1" label="Carga cognitiva" showPct height={4} /></div>}
                        </div>

                        {!micro && size.vTier !== "compact" && (
                            <div className="flex-1 min-h-0">
                                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
                                    {data.suggestions.length ? "Sugerencias" : "Trabajos en curso"}
                                </div>
                                <MiniList
                                    items={data.suggestions.length ? data.suggestions : []}
                                    max={size.vTier === "expanded" ? 4 : 2}
                                    empty="Exocórtex en reposo"
                                    render={(s) => (
                                        <Link href="/agent" className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5 hover:border-primary/30 transition-colors cursor-pointer">
                                            <Chip color={KIND_COLOR[s.kind] ?? "#6366f1"}>{s.kind}</Chip>
                                            <span className="text-[11px] truncate flex-1">{s.text}</span>
                                            <ArrowRight className="size-3 shrink-0 text-muted-foreground/40" />
                                        </Link>
                                    )}
                                />
                            </div>
                        )}

                        {size.vTier === "expanded" && data.backgroundJobs.length > 0 && (
                            <div className="shrink-0 space-y-1.5">
                                {data.backgroundJobs.slice(0, 2).map((j) => (
                                    <div key={j.id} className="flex items-center gap-2 text-[10px]">
                                        <span className="w-24 truncate text-muted-foreground/70">{j.label}</span>
                                        <div className="flex-1"><ProgressBar value={j.progress} color="#6366f1" height={3} /></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!micro && (
                            <footer className="mt-auto grid grid-cols-2 gap-2 shrink-0">
                                <Link href="/library" className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-white/[0.03] border border-border/40 hover:border-primary/30 transition-colors cursor-pointer">
                                    <Library className="size-3.5 text-muted-foreground/60" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/80">Biblioteca</span>
                                </Link>
                                <Link href="/agent" className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-white/[0.03] border border-border/40 hover:border-emerald-500/30 transition-colors cursor-pointer">
                                    <MessageSquare className="size-3.5 text-muted-foreground/60" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/80">Hilos</span>
                                </Link>
                            </footer>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
