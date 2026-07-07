"use client";

// src/components/network/feed/feed-algorithm-selector.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE ALGORITMO DE FEED — Cronológico · Relevancia · Cercanía ·
// Por área · Personalizado (con editor de pesos). Reordena en cliente la
// MISMA lista de publicaciones ya cargada (ver `@/lib/feed/feed-algorithms`).
// La elección + los pesos personalizados persisten (`loadFeedPreference` /
// `saveFeedPreference`, con patrón DEFAULTS_VERSION ya usado en el dashboard).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
    Clock, Flame, Users2, LayoutGrid, SlidersHorizontal, ChevronDown, RotateCcw,
} from "lucide-react";
import {
    FEED_ALGORITHMS,
    DEFAULT_WEIGHTS,
    type FeedAlgorithmId,
    type FeedWeights,
} from "@/lib/feed/feed-algorithms";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    Clock, Flame, Users2, LayoutGrid, SlidersHorizontal,
};

const WEIGHT_LABELS: { key: keyof FeedWeights; label: string; blurb: string }[] = [
    { key: "recencia", label: "Recencia", blurb: "Prioriza lo más nuevo." },
    { key: "afinidad", label: "Afinidad", blurb: "Prioriza tus conexiones." },
    { key: "diversidad", label: "Diversidad", blurb: "Evita repetir autor/área seguidos." },
    { key: "area", label: "Área", blurb: "Prioriza tus áreas preferidas." },
];

const AREA_OPTIONS: { id: string; label: string }[] = [
    { id: "politica", label: "Política" },
    { id: "educacion", label: "Educación" },
    { id: "cultura", label: "Cultura" },
    { id: "general", label: "General" },
];

export interface FeedAlgorithmSelectorProps {
    algorithm: FeedAlgorithmId;
    weights: FeedWeights;
    preferredAreas: string[];
    onAlgorithmChange: (id: FeedAlgorithmId) => void;
    onWeightsChange: (w: FeedWeights) => void;
    onPreferredAreasChange: (areas: string[]) => void;
    className?: string;
}

export function FeedAlgorithmSelector({
    algorithm,
    weights,
    preferredAreas,
    onAlgorithmChange,
    onWeightsChange,
    onPreferredAreasChange,
    className,
}: FeedAlgorithmSelectorProps) {
    const [expanded, setExpanded] = useState(false);

    const setWeight = (key: keyof FeedWeights, value: number) => {
        onWeightsChange({ ...weights, [key]: Math.max(0, Math.min(1, value)) });
    };

    const toggleArea = (id: string) => {
        onPreferredAreasChange(
            preferredAreas.includes(id) ? preferredAreas.filter((a) => a !== id) : [...preferredAreas, id],
        );
    };

    return (
        <div className={cn("rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md p-3", className)}>
            <div className="flex flex-wrap items-center gap-1.5">
                {FEED_ALGORITHMS.map((alg) => {
                    const Icon = ICONS[alg.icon] ?? Flame;
                    const active = algorithm === alg.id;
                    return (
                        <button
                            key={alg.id}
                            type="button"
                            title={alg.blurb}
                            onClick={() => {
                                onAlgorithmChange(alg.id);
                                if (alg.id === "personalizado") setExpanded(true);
                            }}
                            className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                                active
                                    ? "border-primary/50 bg-primary/15 text-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.15)]"
                                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25 hover:text-foreground",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {alg.label}
                        </button>
                    );
                })}

                {algorithm === "personalizado" && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                    >
                        Editor de pesos
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
                    </button>
                )}
            </div>

            {algorithm === "personalizado" && expanded && (
                <div className="mt-3 space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 animate-in fade-in-50 slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Pesos del algoritmo personalizado
                        </span>
                        <button
                            type="button"
                            onClick={() => onWeightsChange({ ...DEFAULT_WEIGHTS })}
                            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                        >
                            <RotateCcw className="h-3 w-3" /> Restablecer
                        </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {WEIGHT_LABELS.map(({ key, label, blurb }) => (
                            <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-foreground/85">{label}</span>
                                    <span className="font-mono text-muted-foreground">{Math.round(weights[key] * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={weights[key]}
                                    onChange={(e) => setWeight(key, Number(e.target.value))}
                                    className="w-full cursor-pointer accent-primary"
                                />
                                <p className="text-[10px] text-muted-foreground/70">{blurb}</p>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-foreground/85">Áreas preferidas</span>
                        <div className="flex flex-wrap gap-1.5">
                            {AREA_OPTIONS.map((a) => {
                                const active = preferredAreas.includes(a.id);
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => toggleArea(a.id)}
                                        className={cn(
                                            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                            active
                                                ? "border-primary/40 bg-primary/15 text-primary"
                                                : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25",
                                        )}
                                    >
                                        {a.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70">
                            Sin selección = todas las áreas pesan igual.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FeedAlgorithmSelector;
