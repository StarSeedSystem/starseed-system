'use client';

// ════════════════════════════════════════════════════════════════
// IdeaForgeWidget — Forja de Quimeras
// ----------------------------------------------------------------
// Combina DOS semillas de idea (selectores A y B del Códice) y forja
// una quimera determinista: el puente creativo y el nombre derivan de
// la combinación (no de Math.random). Lista local de ideas forjadas,
// favoritos (★) y filtro de disciplina como lente estética. Adaptive:
// micro muestra a ✕ b + botón forjar. Data: "creativity.ideas".
// ════════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Wand2, ChevronRight, Sparkles, Atom, Star, X, Shuffle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WidgetShell, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { IdeaForgeState, IdeaSpark } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

const ACCENT = "#ec4899";

// Puentes creativos: seleccionados de forma DETERMINISTA por la combinación.
const BRIDGES = [
    "¿Y si la estructura de uno guiara el crecimiento del otro?",
    "Busca el patrón compartido entre ambos sistemas.",
    "Imagina el segundo como metáfora operativa del primero.",
    "¿Qué emerge si los fusionas en un único organismo?",
    "Diseña un ritual que honre la tensión entre ambos conceptos.",
    "Traduce las reglas de uno al lenguaje del otro.",
    "¿Qué problema del primero resuelve la lógica del segundo?",
];

// Hash determinista estable (FNV-1a simplificado) sobre la combinación.
function comboHash(a: string, b: string): number {
    const s = `${a}::${b}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

// Nombre de quimera derivado de las dos semillas (primeras palabras).
function chimeraName(a: string, b: string): string {
    const head = (x: string) => x.split(" ")[0];
    return `${head(a)} · ${head(b)}`;
}

export function IdeaForgeWidget() {
    const { data, loading } = useWidgetData("creativity.ideas", { refreshMs: 30000 });

    // Semillas seleccionadas (índices en conceptPool). null = sin elegir aún.
    const [seedA, setSeedA] = useState<string | null>(null);
    const [seedB, setSeedB] = useState<string | null>(null);
    // Ideas forjadas localmente (las más recientes primero)
    const [forged, setForged] = useState<IdeaSpark[]>([]);
    // Favoritos por id
    const [favIds, setFavIds] = useState<Set<string>>(new Set());
    // Filtro de disciplina (lente estética)
    const [activeDiscipline, setActiveDiscipline] = useState<string | null>(null);

    const pool = useMemo(() => (data as IdeaForgeState | undefined)?.conceptPool ?? [], [data]);

    // Defaults derivados del pool (deterministas) si el usuario no eligió
    const effA = seedA ?? pool[0] ?? null;
    const effB = seedB ?? pool[1] ?? null;

    // Preview de la quimera de la combinación actual (determinista)
    const preview = useMemo<IdeaSpark | null>(() => {
        if (!effA || !effB || effA === effB) return null;
        const h = comboHash(effA, effB);
        return {
            id: `combo-${effA}-${effB}`,
            a: effA,
            b: effB,
            prompt: BRIDGES[h % BRIDGES.length],
            saved: false,
        };
    }, [effA, effB]);

    const allSparks: IdeaSpark[] = useMemo(
        () => [...forged, ...((data as IdeaForgeState | undefined)?.sparks ?? [])],
        [forged, data]
    );

    const handleForge = useCallback(() => {
        if (!preview) return;
        setForged((prev) => {
            // evita duplicar exactamente la última forja idéntica
            if (prev[0]?.id === preview.id) return prev;
            return [{ ...preview, id: `forged-${preview.a}-${preview.b}-${prev.length}` }, ...prev];
        });
    }, [preview]);

    // Avanza B a la siguiente semilla del pool (determinista, sin random)
    const cycleB = useCallback(() => {
        if (pool.length < 2) return;
        const cur = effB ?? pool[0];
        let i = (pool.indexOf(cur) + 1) % pool.length;
        if (pool[i] === effA) i = (i + 1) % pool.length;
        setSeedB(pool[i]);
    }, [pool, effA, effB]);

    const toggleFav = useCallback((id: string) => {
        setFavIds((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    }, []);

    return (
        <WidgetShell
            title="Forja de Quimeras"
            subtitle="Combina dos semillas de idea"
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
                const compact = size.vTier === "compact";

                // ── MICRO: combinación actual + forjar ───────────
                if (micro) {
                    return (
                        <div className="flex flex-col gap-2 pt-1 h-full">
                            {preview ? (
                                <div className="rounded-xl border border-pink-500/20 bg-pink-500/[0.04] px-2.5 py-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Sparkles className="size-3 shrink-0 text-pink-400" />
                                        <span className="text-[10px] font-black truncate min-w-0 flex-1" style={{ color: ACCENT }}>
                                            {preview.a}
                                        </span>
                                        <X className="size-2.5 shrink-0 text-muted-foreground/40" />
                                        <span className="text-[10px] font-black truncate min-w-0 flex-1" style={{ color: ACCENT }}>
                                            {preview.b}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 text-center">
                                    <span className="text-[10px] text-muted-foreground/60">Elige dos semillas</span>
                                </div>
                            )}
                            <button
                                onClick={handleForge}
                                disabled={!preview}
                                className={cn(
                                    "w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-pink-500/30 bg-pink-500/[0.08]",
                                    "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-pink-300/90",
                                    "hover:bg-pink-500/[0.15] hover:border-pink-500/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                                )}
                            >
                                <Wand2 className="size-3" />
                                Forjar
                            </button>
                        </div>
                    );
                }

                const max = size.vTier === "expanded" ? 5 : compact ? 1 : 3;
                const visible = allSparks.slice(0, max);

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Selectores de semillas A y B */}
                        <div className="shrink-0 flex items-center gap-1.5">
                            <select
                                value={effA ?? ""}
                                onChange={(e) => setSeedA(e.target.value)}
                                className="flex-1 min-w-0 rounded-lg border border-pink-500/30 bg-pink-500/[0.06] px-2 py-1.5 text-[10px] font-bold text-pink-200 cursor-pointer focus:outline-none focus:border-pink-500/60"
                            >
                                {pool.map((c) => <option key={c} value={c} className="bg-background text-foreground">{c}</option>)}
                            </select>
                            <div className="shrink-0 grid place-items-center size-6 rounded-full border border-border/40 bg-white/[0.04]">
                                <X className="size-3 text-muted-foreground/60" />
                            </div>
                            <select
                                value={effB ?? ""}
                                onChange={(e) => setSeedB(e.target.value)}
                                className="flex-1 min-w-0 rounded-lg border border-purple-500/30 bg-purple-500/[0.06] px-2 py-1.5 text-[10px] font-bold text-purple-200 cursor-pointer focus:outline-none focus:border-purple-500/60"
                            >
                                {pool.map((c) => <option key={c} value={c} className="bg-background text-foreground">{c}</option>)}
                            </select>
                            <button
                                onClick={cycleB}
                                aria-label="Rotar segunda semilla"
                                className="shrink-0 grid place-items-center size-7 rounded-lg border border-border/40 text-muted-foreground/60 hover:border-pink-500/40 hover:text-pink-300 transition-all cursor-pointer"
                            >
                                <Shuffle className="size-3" />
                            </button>
                        </div>

                        {/* Quimera resultante (preview determinista) */}
                        <AnimatePresence mode="wait">
                            {preview ? (
                                <motion.div
                                    key={preview.id}
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    transition={{ duration: 0.2 }}
                                    className="shrink-0 rounded-2xl border border-pink-500/25 bg-gradient-to-br from-pink-500/[0.07] to-purple-500/[0.04] px-3 py-2.5"
                                >
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Atom className="size-3.5 text-pink-400 shrink-0" />
                                        <span className="text-[11px] @sm:text-xs font-black text-pink-200 truncate">
                                            {chimeraName(preview.a, preview.b)}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-1.5 rounded-lg border border-border/30 bg-white/[0.02] px-2 py-1.5">
                                        <Sparkles className="size-3 text-pink-400/70 shrink-0 mt-0.5" />
                                        <p className="text-[10px] @sm:text-[11px] italic leading-snug text-muted-foreground/80 line-clamp-2">
                                            {preview.prompt}
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2.5 text-center">
                                    <span className="text-[10px] text-muted-foreground/60">Elige dos semillas distintas para forjar.</span>
                                </div>
                            )}
                        </AnimatePresence>

                        {/* Botón forjar */}
                        <button
                            onClick={handleForge}
                            disabled={!preview}
                            className={cn(
                                "shrink-0 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/30 bg-pink-500/[0.08]",
                                "px-3 py-2 text-[10px] font-black uppercase tracking-wider text-pink-300/90",
                                "hover:bg-pink-500/[0.16] hover:border-pink-500/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                            )}
                        >
                            <Wand2 className="size-3.5" />
                            Forjar quimera
                        </button>

                        {/* Filtro de disciplina */}
                        {(data as IdeaForgeState | undefined)?.disciplines?.length && !compact ? (
                            <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                {(data as IdeaForgeState).disciplines.map((dsc) => (
                                    <button
                                        key={dsc}
                                        onClick={() => setActiveDiscipline((prev) => prev === dsc ? null : dsc)}
                                        className="shrink-0 cursor-pointer"
                                    >
                                        <Chip color={activeDiscipline === dsc ? ACCENT : undefined} soft={activeDiscipline !== dsc}>
                                            {dsc}
                                        </Chip>
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {/* Ideas forjadas (lista local) */}
                        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-auto custom-scrollbar">
                            {visible.length === 0 ? (
                                <div className="grid place-items-center h-full text-center px-3">
                                    <span className="text-[10px] text-muted-foreground/50">Aún no has forjado ideas. Combina dos semillas y pulsa Forjar.</span>
                                </div>
                            ) : (
                                visible.map((spark) => {
                                    const fav = favIds.has(spark.id);
                                    return (
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
                                                onClick={() => toggleFav(spark.id)}
                                                aria-pressed={fav}
                                                aria-label="Favorito"
                                                className={cn(
                                                    "shrink-0 grid place-items-center size-5 rounded-md border transition-all cursor-pointer",
                                                    fav
                                                        ? "border-amber-400/50 bg-amber-400/[0.15] text-amber-300"
                                                        : "border-border/40 bg-white/[0.02] text-muted-foreground/40 hover:border-amber-400/40 hover:text-amber-300",
                                                )}
                                            >
                                                <Star className={cn("size-2.5", fav && "fill-current")} />
                                            </button>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>

                        {/* Resumen de favoritos */}
                        {favIds.size > 0 && (
                            <div className="shrink-0 inline-flex items-center gap-1 self-start rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-0.5 text-[9px] font-black text-amber-300">
                                <Star className="size-2.5 fill-current" />
                                {favIds.size} favorita{favIds.size > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
