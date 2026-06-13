'use client';

// ════════════════════════════════════════════════════════════════
// SerendipityLensWidget — Lente de Serendipia
// ----------------------------------------------------------------
// Discovers unexpected finds filtered by a local "strangeness" slider.
// Higher strangeness shows less-resonant (more unusual) items first.
// "Sorpréndeme" shuffles the order. Adaptive: micro shows top find only.
// Data: "discovery.serendipity". accent #a855f7.
// ════════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    Compass, ChevronRight, Lightbulb, Palette, Music, Footprints, UserPlus,
    Shuffle, type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SerendipityState, SerendipityFind } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

const ACCENT = "#a855f7";

const KIND_ICON: Record<SerendipityFind["kind"], LucideIcon> = {
    idea: Lightbulb,
    arte: Palette,
    musica: Music,
    sendero: Footprints,
    persona: UserPlus,
};

const KIND_LABEL: Record<SerendipityFind["kind"], string> = {
    idea: "Idea",
    arte: "Arte",
    musica: "Música",
    sendero: "Sendero",
    persona: "Persona",
};

export function SerendipityLensWidget() {
    const { data, loading } = useWidgetData("discovery.serendipity", { refreshMs: 14000 });

    // Local strangeness slider (initialized from data on first load)
    const [strangeness, setStrangeness] = useState<number | null>(null);
    const [shuffleSeed, setShuffleSeed] = useState(0);

    const effectiveStrangeness = strangeness ?? data?.strangeness ?? 0.45;

    // Derived list: sort by "weirdness" — strangeness reorders toward low-resonance items
    const sorted = useMemo(() => {
        if (!data?.finds) return [];
        const finds = [...data.finds];
        // shuffleSeed rotates order deterministically
        const rotated = shuffleSeed > 0
            ? [...finds.slice(shuffleSeed % finds.length), ...finds.slice(0, shuffleSeed % finds.length)]
            : finds;
        // strangeness blends between resonance-desc (0) and resonance-asc (1)
        return rotated.sort((a, b) => {
            const score = (f: SerendipityFind) =>
                (1 - effectiveStrangeness) * f.resonance + effectiveStrangeness * (1 - f.resonance);
            return score(b) - score(a);
        });
    }, [data, effectiveStrangeness, shuffleSeed]);

    const handleSurprise = useCallback(() => {
        setShuffleSeed(s => s + 1);
    }, []);

    return (
        <WidgetShell
            title="Lente de Serendipia"
            subtitle="Sincronía de lo inesperado"
            icon={Compass}
            accent={ACCENT}
            live
            actions={
                <Link
                    href="/explorer"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Explorar <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data as SerendipityState;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                if (micro) {
                    // Micro: show top find + compact slider
                    const top = sorted[0];
                    if (!top) return null;
                    const TopIcon = KIND_ICON[top.kind];
                    return (
                        <div className="flex flex-col gap-2 pt-1 h-full">
                            <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div
                                        className="shrink-0 grid place-items-center size-6 rounded-lg"
                                        style={{ background: `color-mix(in srgb, ${top.accent} 25%, transparent)` }}
                                    >
                                        <TopIcon className="size-3" style={{ color: top.accent }} />
                                    </div>
                                    <span className="text-[11px] font-bold truncate min-w-0 flex-1">{top.title}</span>
                                </div>
                            </div>
                            <input
                                type="range" min={0} max={1} step={0.01}
                                value={effectiveStrangeness}
                                onChange={e => setStrangeness(parseFloat(e.target.value))}
                                className="w-full h-1 rounded-full cursor-pointer accent-[#a855f7]"
                                style={{ accentColor: ACCENT }}
                            />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Strangeness slider */}
                        <div className="shrink-0 rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-3 py-2">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-purple-300/80">
                                    Nivel de extrañeza
                                </span>
                                <span className="text-[10px] font-black text-purple-300/80 tabular-nums">
                                    {Math.round(effectiveStrangeness * 100)}%
                                </span>
                            </div>
                            <input
                                type="range" min={0} max={1} step={0.01}
                                value={effectiveStrangeness}
                                onChange={e => {
                                    setStrangeness(parseFloat(e.target.value));
                                }}
                                className="w-full h-1.5 rounded-full cursor-pointer"
                                style={{ accentColor: ACCENT }}
                            />
                            <div className="flex justify-between mt-0.5">
                                <span className="text-[9px] text-muted-foreground/50 font-bold">Familiar</span>
                                <span className="text-[9px] text-muted-foreground/50 font-bold">Insólito</span>
                            </div>
                        </div>

                        {/* Finds list */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sorted}
                                max={max}
                                empty="Sin descubrimientos ahora"
                                render={(find) => {
                                    const FindIcon = KIND_ICON[find.kind];
                                    return (
                                        <motion.div
                                            key={find.id}
                                            layout
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.2 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-purple-500/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div
                                                    className="shrink-0 grid place-items-center size-7 rounded-lg"
                                                    style={{ background: `color-mix(in srgb, ${find.accent} 22%, transparent)` }}
                                                >
                                                    <FindIcon className="size-3.5" style={{ color: find.accent }} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate block">{find.title}</span>
                                                    <span className="text-[9px] text-muted-foreground/60 truncate block">{find.author}</span>
                                                </div>
                                                <Chip color={find.accent} soft>{KIND_LABEL[find.kind]}</Chip>
                                            </div>
                                            <div className="mt-1.5">
                                                <ProgressBar
                                                    value={find.resonance}
                                                    color={find.accent}
                                                    height={3}
                                                    label="resonancia"
                                                />
                                            </div>
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>

                        {/* Surprise button */}
                        <div className="shrink-0">
                            <button
                                onClick={handleSurprise}
                                className={cn(
                                    "w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/[0.08]",
                                    "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300/90",
                                    "hover:bg-purple-500/[0.15] hover:border-purple-500/50 transition-all cursor-pointer",
                                )}
                            >
                                <Shuffle className="size-3" />
                                Sorpréndeme
                            </button>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
