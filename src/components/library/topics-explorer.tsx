"use client";

/*
 * LibraryTopicsExplorer — "Explorar por temas y categorías" (Adenda 66 §5).
 * Agrupa el contenido PÚBLICO de la Librería (library_public_items) por su
 * CATEGORÍA y por sus TEMAS (etiquetas), para descubrir bibliotecas/recursos
 * públicos navegando por afinidad temática. Datos reales (usePublicCatalog);
 * vacío honesto cuando aún no hay nada publicado.
 *
 * Complementa (no reemplaza) a PublicCatalogSection, que navega por folders.
 */

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Compass, Tag, Loader2, ExternalLink, Users, X } from "lucide-react";
import { usePublicCatalog, PUBLIC_CATEGORIES, type PublicCategory, type PublicItem } from "@/lib/library/public-catalog";

const CATEGORY_LABEL: Record<PublicCategory, string> = {
    app: "Apps", widget: "Widgets", page: "Páginas", publication: "Publicaciones",
    board: "Pizarras", research: "Investigación", project: "Proyectos", design: "Diseño",
    animation: "Animación", function: "Funciones", "ai-source": "Fuentes IA", repo: "Repos",
    agent: "Agentes", otro: "Otro",
};

type Selection = { type: "category"; value: PublicCategory } | { type: "topic"; value: string } | null;

function itemHref(it: PublicItem): string | undefined {
    return it.payload.route || it.payload.url || undefined;
}

export function LibraryTopicsExplorer() {
    const { items, loading } = usePublicCatalog();
    const [sel, setSel] = useState<Selection>(null);

    const byCategory = useMemo(() => {
        const m = new Map<PublicCategory, number>();
        for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + 1);
        return PUBLIC_CATEGORIES.map((c) => ({ category: c, count: m.get(c) ?? 0 })).filter((x) => x.count > 0);
    }, [items]);

    const byTopic = useMemo(() => {
        const m = new Map<string, number>();
        for (const it of items) {
            for (const t of it.tags) {
                const key = t.trim();
                if (key) m.set(key, (m.get(key) ?? 0) + 1);
            }
        }
        return Array.from(m, ([topic, count]) => ({ topic, count }))
            .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "es"))
            .slice(0, 30);
    }, [items]);

    const visible = useMemo(() => {
        if (!sel) return [];
        if (sel.type === "category") return items.filter((it) => it.category === sel.value);
        return items.filter((it) => it.tags.some((t) => t.trim() === sel.value));
    }, [items, sel]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando temas y categorías…
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-muted-foreground">
                <Compass className="h-8 w-8 opacity-20" />
                <p className="text-sm">Todavía no hay bibliotecas públicas por explorar.</p>
                <p className="max-w-sm text-xs">
                    Cuando la red publique recursos con «Publicar en la Librería…», aparecerán aquí agrupados por
                    categoría y por tema.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Compass className="h-4 w-4 text-teal-300" />
                Descubre bibliotecas y recursos públicos agrupados por categoría y por tema.
            </div>

            {/* Categorías */}
            <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/70">
                    <Users className="h-3.5 w-3.5" /> Por categoría
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {byCategory.map(({ category, count }) => {
                        const active = sel?.type === "category" && sel.value === category;
                        return (
                            <button
                                key={category}
                                type="button"
                                onClick={() => setSel(active ? null : { type: "category", value: category })}
                                className={cn(
                                    "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                                    active
                                        ? "border-teal-400/50 bg-teal-500/10 text-teal-100"
                                        : "border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.05]",
                                )}
                            >
                                <span className="min-w-0 truncate">{CATEGORY_LABEL[category]}</span>
                                <span className="ml-2 shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-white/60">
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Temas (etiquetas) */}
            {byTopic.length > 0 && (
                <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/70">
                        <Tag className="h-3.5 w-3.5" /> Por tema
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {byTopic.map(({ topic, count }) => {
                            const active = sel?.type === "topic" && sel.value === topic;
                            return (
                                <button
                                    key={topic}
                                    type="button"
                                    onClick={() => setSel(active ? null : { type: "topic", value: topic })}
                                    className={cn(
                                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer",
                                        active
                                            ? "border-teal-400/50 bg-teal-500/15 text-teal-100"
                                            : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white",
                                    )}
                                >
                                    #{topic} <span className="text-white/40">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Resultados de la selección */}
            {sel && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium text-white/70">
                            {sel.type === "category" ? CATEGORY_LABEL[sel.value] : `#${sel.value}`} · {visible.length}{" "}
                            {visible.length === 1 ? "recurso" : "recursos"}
                        </p>
                        <button
                            type="button"
                            onClick={() => setSel(null)}
                            className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white cursor-pointer"
                        >
                            <X className="h-3 w-3" /> Cerrar
                        </button>
                    </div>
                    {visible.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Nada aquí todavía.</p>
                    ) : (
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {visible.map((it) => {
                                const href = itemHref(it);
                                const inner = (
                                    <GlassCard className="flex items-center gap-2 p-2.5" intensity="low">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{it.name}</p>
                                            <p className="truncate text-[10px] text-muted-foreground">
                                                {CATEGORY_LABEL[it.category]}
                                                {it.folder ? ` · ${it.folder}` : ""}
                                            </p>
                                        </div>
                                        {href && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                    </GlassCard>
                                );
                                return (
                                    <li key={it.id}>
                                        {href ? (
                                            <a
                                                href={href}
                                                target={href.startsWith("http") ? "_blank" : undefined}
                                                rel="noopener noreferrer"
                                                className="block cursor-pointer"
                                            >
                                                {inner}
                                            </a>
                                        ) : (
                                            inner
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default LibraryTopicsExplorer;
