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
    Compass, ChevronRight, ChevronLeft, Lightbulb, Palette, Music, Footprints, UserPlus,
    Shuffle, Bookmark, Sparkles, type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SerendipityState, SerendipityFind } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

const ACCENT = "#a855f7";

type Domain = SerendipityFind["kind"];

const KIND_ICON: Record<Domain, LucideIcon> = {
    idea: Lightbulb,
    arte: Palette,
    musica: Music,
    sendero: Footprints,
    persona: UserPlus,
};

const KIND_LABEL: Record<Domain, string> = {
    idea: "Idea",
    arte: "Arte",
    musica: "Música",
    sendero: "Sendero",
    persona: "Persona",
};

const DOMAIN_ORDER: Domain[] = ["idea", "arte", "musica", "sendero", "persona"];

// "Porqué" determinista de la recomendación, derivado del find.
function whyFor(find: SerendipityFind): string {
    const res = Math.round(find.resonance * 100);
    const base: Record<Domain, string> = {
        idea: "Conecta con conceptos que ya exploras en tu Códice personal",
        arte: "Coincide con la paleta y los temas de tus colecciones recientes",
        musica: "Afín a tus frecuencias y escalas modales favoritas",
        sendero: "Cerca de rutas que has marcado como significativas",
        persona: "Comparte intereses y biorregión contigo",
    };
    const band = find.resonance > 0.66
        ? "Alta resonancia: muy alineado con tu huella de afinidad."
        : find.resonance > 0.4
            ? "Resonancia media: familiar pero con un giro inesperado."
            : "Baja resonancia: deliberadamente fuera de tu zona habitual.";
    return `${base[find.kind]}. ${band} (${res}% afinidad)`;
}

export function SerendipityLensWidget() {
    const { data, loading } = useWidgetData("discovery.serendipity", { refreshMs: 14000 });

    // Local strangeness slider (initialized from data on first load)
    const [strangeness, setStrangeness] = useState<number | null>(null);
    const [shuffleSeed, setShuffleSeed] = useState(0);
    // Filtro por dominio (null = todos)
    const [domain, setDomain] = useState<Domain | null>(null);
    // Guardados locales (por id)
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    // Find seleccionado para la vista de detalle (por id)
    const [detailId, setDetailId] = useState<string | null>(null);

    const effectiveStrangeness = strangeness ?? data?.strangeness ?? 0.45;

    // Derived list: sort by "weirdness" + filtro de dominio
    const sorted = useMemo(() => {
        if (!data?.finds) return [];
        let finds = [...data.finds];
        if (domain) finds = finds.filter((f) => f.kind === domain);
        // shuffleSeed rotates order deterministically
        const rotated = shuffleSeed > 0 && finds.length > 0
            ? [...finds.slice(shuffleSeed % finds.length), ...finds.slice(0, shuffleSeed % finds.length)]
            : finds;
        // strangeness blends between resonance-desc (0) and resonance-asc (1)
        return rotated.sort((a, b) => {
            const score = (f: SerendipityFind) =>
                (1 - effectiveStrangeness) * f.resonance + effectiveStrangeness * (1 - f.resonance);
            return score(b) - score(a);
        });
    }, [data, effectiveStrangeness, shuffleSeed, domain]);

    const detailFind = useMemo(
        () => (detailId ? (data?.finds ?? []).find((f) => f.id === detailId) ?? null : null),
        [detailId, data]
    );

    const handleSurprise = useCallback(() => {
        setShuffleSeed(s => s + 1);
        setDetailId(null);
    }, []);

    const toggleSave = useCallback((id: string) => {
        setSavedIds((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
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
                const compactV = size.vTier === "compact";
                const max = size.vTier === "expanded" ? 6 : compactV ? 2 : 4;

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

                // ── VISTA DE DETALLE (porqué de la recomendación) ─
                if (detailFind) {
                    const DIcon = KIND_ICON[detailFind.kind];
                    const saved = savedIds.has(detailFind.id);
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 h-full">
                            <button
                                onClick={() => setDetailId(null)}
                                className="shrink-0 inline-flex items-center gap-1 self-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-purple-300 transition-colors cursor-pointer"
                            >
                                <ChevronLeft className="size-3" /> Volver
                            </button>
                            <div className="shrink-0 rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.08] to-fuchsia-500/[0.03] px-3 py-3">
                                <div className="flex items-center gap-2.5 mb-2">
                                    <div
                                        className="shrink-0 grid place-items-center size-10 rounded-xl"
                                        style={{ background: `color-mix(in srgb, ${detailFind.accent} 25%, transparent)` }}
                                    >
                                        <DIcon className="size-5" style={{ color: detailFind.accent }} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="text-sm font-black leading-tight block">{detailFind.title}</span>
                                        <span className="text-[10px] text-muted-foreground/60 truncate block">{detailFind.author}</span>
                                    </div>
                                    <Chip color={detailFind.accent} soft>{KIND_LABEL[detailFind.kind]}</Chip>
                                </div>
                                <div className="flex items-start gap-1.5 rounded-lg border border-purple-500/20 bg-white/[0.02] px-2.5 py-2 mb-2">
                                    <Sparkles className="size-3 text-purple-400/80 shrink-0 mt-0.5" />
                                    <p className="text-[11px] leading-snug text-muted-foreground/85">{whyFor(detailFind)}</p>
                                </div>
                                <ProgressBar value={detailFind.resonance} color={detailFind.accent} height={4} label="resonancia" showPct />
                            </div>
                            <div className="flex-1" />
                            <div className="shrink-0 grid grid-cols-2 gap-1.5">
                                <Link
                                    href="/explorer"
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/[0.08] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300/90 hover:bg-purple-500/[0.15] transition-all cursor-pointer"
                                >
                                    <Compass className="size-3" /> Explorar
                                </Link>
                                <button
                                    onClick={() => toggleSave(detailFind.id)}
                                    className={cn(
                                        "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                        saved
                                            ? "border-purple-500/50 bg-purple-500/[0.15] text-purple-200"
                                            : "border-border/40 bg-white/[0.02] text-muted-foreground/70 hover:border-purple-500/30 hover:text-purple-300"
                                    )}
                                >
                                    <Bookmark className={cn("size-3", saved && "fill-current")} />
                                    {saved ? "Guardado" : "Guardar"}
                                </button>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Filtro por dominio */}
                        {!compactV && (
                            <div className="shrink-0 flex flex-wrap gap-1">
                                <button
                                    onClick={() => setDomain(null)}
                                    className={cn(
                                        "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                        domain === null
                                            ? "bg-purple-500/15 border-purple-500/40 text-purple-300"
                                            : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                    )}
                                >
                                    Todos
                                </button>
                                {DOMAIN_ORDER.map((dm) => {
                                    const active = domain === dm;
                                    return (
                                        <button
                                            key={dm}
                                            onClick={() => setDomain(active ? null : dm)}
                                            className={cn(
                                                "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                                active
                                                    ? "bg-purple-500/15 border-purple-500/40 text-purple-300"
                                                    : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                            )}
                                        >
                                            {KIND_LABEL[dm]}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

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
                                    const saved = savedIds.has(find.id);
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
                                            <button
                                                onClick={() => setDetailId(find.id)}
                                                className="w-full flex items-center gap-2 min-w-0 text-left cursor-pointer"
                                            >
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
                                            </button>
                                            <div className="mt-1.5 flex items-center gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <ProgressBar value={find.resonance} color={find.accent} height={3} label="resonancia" />
                                                </div>
                                                <button
                                                    onClick={() => setDetailId(find.id)}
                                                    aria-label="Ver porqué"
                                                    className="shrink-0 grid place-items-center size-5 rounded-md border border-border/40 text-muted-foreground/55 hover:border-purple-500/40 hover:text-purple-300 transition-all cursor-pointer"
                                                >
                                                    <Compass className="size-3" />
                                                </button>
                                                <button
                                                    onClick={() => toggleSave(find.id)}
                                                    aria-pressed={saved}
                                                    aria-label="Guardar"
                                                    className={cn(
                                                        "shrink-0 grid place-items-center size-5 rounded-md border transition-all cursor-pointer",
                                                        saved
                                                            ? "border-purple-500/50 bg-purple-500/[0.15] text-purple-200"
                                                            : "border-border/40 text-muted-foreground/55 hover:border-purple-500/40 hover:text-purple-300"
                                                    )}
                                                >
                                                    <Bookmark className={cn("size-3", saved && "fill-current")} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>

                        {/* Surprise button + contador de guardados */}
                        <div className="shrink-0 flex items-center gap-1.5">
                            <button
                                onClick={handleSurprise}
                                className={cn(
                                    "flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/[0.08]",
                                    "px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300/90",
                                    "hover:bg-purple-500/[0.15] hover:border-purple-500/50 transition-all cursor-pointer",
                                )}
                            >
                                <Shuffle className="size-3" />
                                Sorpréndeme
                            </button>
                            {savedIds.size > 0 && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-purple-500/30 bg-purple-500/[0.08] px-2.5 py-1.5 text-[10px] font-black text-purple-300/90 tabular-nums">
                                    <Bookmark className="size-3 fill-current" />
                                    {savedIds.size}
                                </span>
                            )}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
