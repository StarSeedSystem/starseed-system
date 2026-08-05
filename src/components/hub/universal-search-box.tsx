"use client";

// src/components/hub/universal-search-box.tsx
// -----------------------------------------------------------------------------
// BUSCADOR UNIVERSAL (UI) del Hub de Conexiones.
//
// Caja de búsqueda en vivo (debounce) que consulta `universalSearch` a través de
// toda la red y muestra resultados CATEGORIZADOS y enlazados (interconectados).
// Refresco en TIEMPO REAL: cuando entran nuevas `posts`, re-ejecuta la búsqueda
// activa para que los resultados se mantengan frescos (vía `useRealtime`).
//
// SSR-safe: es un componente "use client"; la consulta sólo corre en el cliente.
// Estética alineada con el resto del Hub (tarjetas translúcidas, primary/cyan).
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    Search,
    Loader2,
    ArrowUpRight,
    User,
    Globe,
    MessageSquare,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
    Terminal,
    Network,
    X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/lib/realtime/realtime";
import {
    universalSearch,
    emptyResults,
    totalHits,
    SEARCH_CATEGORIES,
    type UniversalSearchResults,
    type SearchCategoryKey,
} from "@/lib/search/universal-search";

// Mapa nombre-de-icono (de SEARCH_CATEGORIES) → componente lucide.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    User,
    Globe,
    MessageSquare,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
    Terminal,
};

interface UniversalSearchBoxProps {
    /** Query inicial opcional (p.ej. proveniente del header). */
    initialQuery?: string;
    className?: string;
}

export function UniversalSearchBox({
    initialQuery = "",
    className,
}: UniversalSearchBoxProps) {
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<UniversalSearchResults>(emptyResults());
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    // Guardamos la última query "lanzada" para el refresco en tiempo real.
    const lastRunRef = useRef("");

    const runSearch = useCallback(async (q: string) => {
        const term = q.trim();
        lastRunRef.current = term;
        if (term.length < 2) {
            setResults(emptyResults());
            setSearched(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await universalSearch(term);
            // Evita pisar resultados si la query cambió mientras esperábamos.
            if (lastRunRef.current === term) {
                setResults(res);
                setSearched(true);
            }
        } finally {
            if (lastRunRef.current === term) setLoading(false);
        }
    }, []);

    // Debounce sobre la entrada del usuario.
    useEffect(() => {
        const t = setTimeout(() => {
            void runSearch(query);
        }, 280);
        return () => clearTimeout(t);
    }, [query, runSearch]);

    // ── TIEMPO REAL ──────────────────────────────────────────────────────
    // Si entran nuevas publicaciones, re-ejecuta la búsqueda activa para
    // mantener los resultados frescos. RLS aplica; SSR-safe (no-op en server).
    useRealtime("posts", { event: "INSERT" }, () => {
        const term = lastRunRef.current;
        if (term.length >= 2) void runSearch(term);
    });

    const total = totalHits(results);
    const showEmpty = searched && !loading && total === 0;

    return (
        <div className={cn("w-full space-y-6", className)}>
            {/* ── Caja de búsqueda ── */}
            <div className="relative w-full group">
                <div className="absolute inset-0 bg-primary/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar en toda la red: perfiles, páginas, publicaciones, conocimiento, cerebros, apps…"
                    aria-label="Buscar en toda la red: perfiles, páginas, publicaciones, conocimiento, cerebros, apps"
                    className="pl-12 pr-12 h-14 bg-background/40 backdrop-blur-md border-primary/20 focus-visible:ring-1 focus-visible:ring-primary/50 rounded-2xl w-full text-base transition-all shadow-inner"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2">
                    {loading && (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    {!loading && query && (
                        <button
                            type="button"
                            aria-label="Limpiar búsqueda"
                            onClick={() => setQuery("")}
                            className="text-muted-foreground hover:text-primary transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Pista inicial ── */}
            {!searched && !loading && query.trim().length < 2 && (
                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-primary/[0.04] via-transparent to-cyan-500/[0.04] backdrop-blur p-8 text-center">
                    <Network className="w-10 h-10 mx-auto mb-3 text-primary/70" />
                    <p className="text-sm font-semibold text-foreground/90">
                        Buscador Universal
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto text-balance">
                        Escribe al menos 2 caracteres para explorar perfiles,
                        páginas, publicaciones, conocimiento, memorias, cerebros,
                        apps y lienzos de toda la red en tiempo real.
                    </p>
                </div>
            )}

            {/* ── Sin resultados ── */}
            {showEmpty && (
                <div className="rounded-2xl border border-white/5 bg-black/20 backdrop-blur p-8 text-center">
                    <Search className="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-foreground/90">
                        Sin resultados para “{query.trim()}”
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Prueba con otro término o revisa la ortografía.
                    </p>
                </div>
            )}

            {/* ── Resumen de resultados ── */}
            {searched && !showEmpty && total > 0 && (
                <p className="text-xs text-muted-foreground font-semibold">
                    {total} resultado{total === 1 ? "" : "s"} en la red
                </p>
            )}

            {/* ── Resultados por categoría ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[clamp(1rem,2vw,1.5rem)]">
                {SEARCH_CATEGORIES.map((cat) => {
                    const items = results[cat.key as SearchCategoryKey] ?? [];
                    if (items.length === 0) return null;
                    const Icon = ICONS[cat.icon] ?? Network;
                    return (
                        <div
                            key={cat.key}
                            className="rounded-2xl border border-white/5 bg-black/20 backdrop-blur-md p-4 shadow-xl animate-in fade-in-50 duration-300"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary">
                                        <Icon className="w-4 h-4" />
                                    </span>
                                    <h3 className="text-sm font-black uppercase tracking-wider text-foreground/90">
                                        {cat.label}
                                    </h3>
                                </div>
                                <Badge
                                    variant="secondary"
                                    className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold"
                                >
                                    {items.length}
                                </Badge>
                            </div>
                            <ul className="space-y-1">
                                {items.map((hit) => (
                                    <li key={`${cat.key}-${hit.id}`}>
                                        <Link
                                            href={hit.href}
                                            className="group/item flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-primary/10 transition-colors"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-foreground/90 truncate">
                                                    {hit.label}
                                                </span>
                                                {hit.sub && (
                                                    <span className="block text-[11px] text-muted-foreground truncate">
                                                        {hit.sub}
                                                    </span>
                                                )}
                                            </span>
                                            <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover/item:opacity-100 group-hover/item:text-primary transition-all" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default UniversalSearchBox;
