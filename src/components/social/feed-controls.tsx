"use client";

/*
 * FeedControls — barra de control reutilizable de CUALQUIER feed de
 * publicaciones (Adenda 66 §7): búsqueda + orden + vista + etiquetas +
 * "Para mí" (relevancia con Astraura). Presentacional: recibe `prefs` y
 * `onChange`; la lógica de filtro/orden/relevancia vive en
 * `src/lib/social/feed-filters.ts`. Crystal Liquid Glass, español, iconos Lucide.
 */

import { useState } from "react";
import { Search, Sparkles, List, LayoutGrid, Rows3, Tag, X, Loader2, ArrowDownWideNarrow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    FEED_TAG_CATALOG, FEED_SORT_LABELS, type FeedPrefs, type FeedSort, type FeedView,
} from "@/lib/social/feed-filters";

const SORTS: FeedSort[] = ["reciente", "relevante", "popular", "cronologico", "propios"];

const VIEW_OPTS: { id: FeedView; icon: typeof List; label: string }[] = [
    { id: "lista", icon: List, label: "Lista" },
    { id: "tarjetas", icon: LayoutGrid, label: "Tarjetas" },
    { id: "compacta", icon: Rows3, label: "Compacta" },
];

export interface FeedControlsProps {
    prefs: FeedPrefs;
    onChange: (patch: Partial<FeedPrefs>) => void;
    /** Nº total de publicaciones antes de filtrar (para el contador). */
    total?: number;
    /** Nº de publicaciones tras filtrar (para el contador). */
    shown?: number;
    /** true mientras Astraura calcula la relevancia ("Para mí"). */
    ranking?: boolean;
    className?: string;
}

export function FeedControls({ prefs, onChange, total, shown, ranking, className }: FeedControlsProps) {
    const [showTags, setShowTags] = useState(false);
    const activeTags = new Set(prefs.tags);

    const toggleTag = (id: string) => {
        const next = new Set(activeTags);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange({ tags: Array.from(next) });
    };

    const filtered = typeof total === "number" && typeof shown === "number" && shown !== total;

    return (
        <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-2 sm:p-2.5", className)}>
            <div className="flex flex-wrap items-center gap-2">
                {/* Búsqueda */}
                <div className="relative min-w-[160px] flex-1">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={prefs.query}
                        onChange={(e) => onChange({ query: e.target.value })}
                        placeholder="Buscar en las publicaciones…"
                        className="h-9 rounded-xl border-white/10 bg-black/30 pl-8 pr-8 text-xs"
                        aria-label="Buscar publicaciones"
                    />
                    {prefs.query && (
                        <button
                            type="button"
                            onClick={() => onChange({ query: "" })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white cursor-pointer"
                            aria-label="Limpiar búsqueda"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Orden */}
                <Select value={prefs.sort} onValueChange={(v) => onChange({ sort: v as FeedSort })}>
                    <SelectTrigger className="h-9 w-auto gap-1.5 border-white/15 bg-black/30 text-xs" aria-label="Ordenar">
                        <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted-foreground" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                        {SORTS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                                {FEED_SORT_LABELS[s]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Vista */}
                <div className="flex items-center gap-0.5 rounded-xl border border-white/15 bg-black/30 p-0.5">
                    {VIEW_OPTS.map((v) => {
                        const Icon = v.icon;
                        const active = prefs.view === v.id;
                        return (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => onChange({ view: v.id })}
                                title={v.label}
                                aria-label={v.label}
                                aria-pressed={active}
                                className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer",
                                    active ? "bg-white/15 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white",
                                )}
                            >
                                <Icon className="h-4 w-4" />
                            </button>
                        );
                    })}
                </div>

                {/* Etiquetas */}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTags((v) => !v)}
                    className={cn(
                        "h-9 gap-1.5 border-white/15 text-xs cursor-pointer",
                        (showTags || activeTags.size > 0) && "border-primary/40 text-primary",
                    )}
                >
                    <Tag className="h-3.5 w-3.5" /> Etiquetas
                    {activeTags.size > 0 && (
                        <span className="rounded-full bg-primary/20 px-1.5 text-[10px] tabular-nums">{activeTags.size}</span>
                    )}
                </Button>

                {/* Para mí (relevancia con Astraura) */}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange({ forMe: !prefs.forMe })}
                    title="Reordena por afinidad con tu perfil (Astraura)"
                    aria-pressed={prefs.forMe}
                    className={cn(
                        "h-9 gap-1.5 border-white/15 text-xs cursor-pointer",
                        prefs.forMe && "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200",
                    )}
                >
                    {ranking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Para mí
                </Button>
            </div>

            {/* Chips de etiquetas (multi-selección) */}
            {showTags && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
                    {FEED_TAG_CATALOG.map((t) => {
                        const active = activeTags.has(t.id);
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleTag(t.id)}
                                className={cn(
                                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/15 text-primary"
                                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white",
                                )}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                    {activeTags.size > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange({ tags: [] })}
                            className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-white cursor-pointer"
                        >
                            Limpiar
                        </button>
                    )}
                </div>
            )}

            {/* Contador honesto cuando el filtro reduce la lista */}
            {filtered && (
                <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
                    Mostrando {shown} de {total} publicaciones
                    {prefs.forMe && ranking ? " · calculando relevancia…" : ""}
                </p>
            )}
        </div>
    );
}

export default FeedControls;
