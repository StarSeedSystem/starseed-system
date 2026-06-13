'use client';

// ════════════════════════════════════════════════════════════════
// IdeaForgeWidget — Incubadora de Quimeras
// ----------------------------------------------------------------
// Collides two random concepts from the pool with a creative bridge
// prompt. "Colisionar" generates a new local spark. "Guardar" toggles
// saved state. Discipline chips act as aesthetic filters. Adaptive:
// micro shows current spark (a ✕ b) + collide button only.
// Data: "creativity.ideas". accent #ec4899.
// ════════════════════════════════════════════════════════════════

import { useState, useCallback } from "react";
import Link from "next/link";
import { Wand2, ChevronRight, Sparkles, Atom, Save, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WidgetShell, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { IdeaForgeState, IdeaSpark } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

const ACCENT = "#ec4899";

// Local bridge prompts (fallback / supplement)
const LOCAL_BRIDGES = [
    "¿Y si la estructura de uno guiara el crecimiento del otro?",
    "Busca el patrón compartido entre ambos sistemas.",
    "Imagina el segundo como metáfora operativa del primero.",
    "¿Qué emerge si los fusionas en un único organismo?",
    "Diseña un ritual que honre la tensión entre ambos conceptos.",
];

let _idCounter = 100;
function nextId() { return `local-${_idCounter++}`; }

function pickRandom<T>(arr: T[], exclude?: T): T {
    const pool = exclude !== undefined ? arr.filter(x => x !== exclude) : arr;
    return pool[Math.floor(Math.random() * pool.length)];
}

export function IdeaForgeWidget() {
    const { data, loading } = useWidgetData("creativity.ideas", { refreshMs: 30000 });

    // Local sparks list (prepend to server data)
    const [localSparks, setLocalSparks] = useState<IdeaSpark[]>([]);
    // Local saved toggles (by id)
    const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
    // Selected discipline filter (null = all)
    const [activeDiscipline, setActiveDiscipline] = useState<string | null>(null);

    const allSparks: IdeaSpark[] = [
        ...localSparks,
        ...(data?.sparks ?? []),
    ];

    const handleCollide = useCallback(() => {
        const pool = data?.conceptPool ?? [];
        if (pool.length < 2) return;
        const a = pickRandom(pool);
        const b = pickRandom(pool, a);
        const prompt = pickRandom(LOCAL_BRIDGES);
        const newSpark: IdeaSpark = { id: nextId(), a, b, prompt, saved: false };
        setLocalSparks(prev => [newSpark, ...prev]);
    }, [data]);

    const toggleSaved = useCallback((id: string) => {
        setSavedMap(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const isSaved = (spark: IdeaSpark) => savedMap[spark.id] ?? spark.saved;

    return (
        <WidgetShell
            title="Incubadora de Quimeras"
            subtitle="Colisión creativa de conceptos"
            icon={Atom}
            accent={ACCENT}
            actions={
                <Link
                    href="/library"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Biblioteca <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const micro = size.tier === "micro" || size.vTier === "micro";
                const currentSpark = allSparks[0];

                if (micro) {
                    return (
                        <div className="flex flex-col gap-2 pt-1 h-full">
                            {currentSpark ? (
                                <div className="rounded-xl border border-pink-500/20 bg-pink-500/[0.04] px-2.5 py-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Sparkles className="size-3 shrink-0 text-pink-400" />
                                        <span className="text-[10px] font-black truncate min-w-0 flex-1" style={{ color: ACCENT }}>
                                            {currentSpark.a}
                                        </span>
                                        <X className="size-2.5 shrink-0 text-muted-foreground/40" />
                                        <span className="text-[10px] font-black truncate min-w-0 flex-1" style={{ color: ACCENT }}>
                                            {currentSpark.b}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 text-center">
                                    <span className="text-[10px] text-muted-foreground/60">Sin chispas aún</span>
                                </div>
                            )}
                            <button
                                onClick={handleCollide}
                                className={cn(
                                    "w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-pink-500/30 bg-pink-500/[0.08]",
                                    "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-pink-300/90",
                                    "hover:bg-pink-500/[0.15] hover:border-pink-500/50 transition-all cursor-pointer",
                                )}
                            >
                                <Wand2 className="size-3" />
                                Colisionar
                            </button>
                        </div>
                    );
                }

                const max = size.vTier === "expanded" ? 4 : size.vTier === "compact" ? 1 : 2;
                const visibleSparks = allSparks.slice(0, max);

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Featured collision card */}
                        <AnimatePresence mode="wait">
                            {currentSpark && (
                                <motion.div
                                    key={currentSpark.id}
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    transition={{ duration: 0.22 }}
                                    className="shrink-0 rounded-2xl border border-pink-500/25 bg-gradient-to-br from-pink-500/[0.07] to-purple-500/[0.04] px-3 py-3"
                                >
                                    {/* Concept collision row */}
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <div className="flex-1 rounded-xl border border-pink-500/30 bg-pink-500/[0.08] px-2 py-1.5 text-center min-w-0">
                                            <span className="text-[11px] @sm:text-xs font-black text-pink-200 block truncate">{currentSpark.a}</span>
                                        </div>
                                        <div className="shrink-0 grid place-items-center size-6 rounded-full border border-border/40 bg-white/[0.04]">
                                            <X className="size-3 text-muted-foreground/60" />
                                        </div>
                                        <div className="flex-1 rounded-xl border border-purple-500/30 bg-purple-500/[0.08] px-2 py-1.5 text-center min-w-0">
                                            <span className="text-[11px] @sm:text-xs font-black text-purple-200 block truncate">{currentSpark.b}</span>
                                        </div>
                                    </div>
                                    {/* Bridge prompt */}
                                    <div className="flex items-start gap-1.5 rounded-lg border border-border/30 bg-white/[0.02] px-2 py-1.5">
                                        <Sparkles className="size-3 text-pink-400/70 shrink-0 mt-0.5" />
                                        <p className="text-[10px] @sm:text-[11px] italic leading-snug text-muted-foreground/80 line-clamp-2">
                                            {currentSpark.prompt}
                                        </p>
                                    </div>
                                    {/* Save current */}
                                    <button
                                        onClick={() => toggleSaved(currentSpark.id)}
                                        className={cn(
                                            "mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1",
                                            "text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border",
                                            isSaved(currentSpark)
                                                ? "border-pink-500/40 bg-pink-500/[0.12] text-pink-300"
                                                : "border-border/40 bg-white/[0.02] text-muted-foreground/60 hover:border-pink-500/30 hover:text-pink-300/80",
                                        )}
                                    >
                                        <Save className="size-3" />
                                        {isSaved(currentSpark) ? "Guardada" : "Guardar chispa"}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Discipline filter chips */}
                        {data?.disciplines?.length && size.vTier !== "compact" ? (
                            <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                {data.disciplines.map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setActiveDiscipline(prev => prev === d ? null : d)}
                                        className="shrink-0 cursor-pointer"
                                    >
                                        <Chip
                                            color={activeDiscipline === d ? ACCENT : undefined}
                                            soft={activeDiscipline !== d}
                                        >
                                            {d}
                                        </Chip>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {/* Previous sparks list */}
                        {visibleSparks.length > 1 && (
                            <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-auto custom-scrollbar">
                                {visibleSparks.slice(1).map((spark) => (
                                    <motion.div
                                        key={spark.id}
                                        layout
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.18 }}
                                        className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 flex items-center gap-2 min-w-0 hover:border-pink-500/25 transition-colors"
                                    >
                                        <Atom className="size-3.5 shrink-0 text-pink-400/60" />
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] font-bold truncate block text-foreground/80">
                                                {spark.a} <span className="text-muted-foreground/50">✕</span> {spark.b}
                                            </span>
                                            <span className="text-[9px] text-muted-foreground/50 truncate block line-clamp-1">{spark.prompt}</span>
                                        </div>
                                        <button
                                            onClick={() => toggleSaved(spark.id)}
                                            className={cn(
                                                "shrink-0 grid place-items-center size-5 rounded-md border transition-all cursor-pointer",
                                                isSaved(spark)
                                                    ? "border-pink-500/40 bg-pink-500/[0.15] text-pink-300"
                                                    : "border-border/40 bg-white/[0.02] text-muted-foreground/40 hover:border-pink-500/30",
                                            )}
                                        >
                                            <Save className="size-2.5" />
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Collide button */}
                        <div className="shrink-0">
                            <button
                                onClick={handleCollide}
                                className={cn(
                                    "w-full inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/30 bg-pink-500/[0.08]",
                                    "px-3 py-2 text-[10px] font-black uppercase tracking-wider text-pink-300/90",
                                    "hover:bg-pink-500/[0.16] hover:border-pink-500/50 transition-all cursor-pointer",
                                )}
                            >
                                <Wand2 className="size-3.5" />
                                Colisionar conceptos
                            </button>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
