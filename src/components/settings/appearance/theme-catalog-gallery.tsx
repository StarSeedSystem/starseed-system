"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * ThemeCatalogGallery — catálogo de ~24 ThemePacks (theme-engine.ts +
 * theme-catalog.ts). Componente COMPARTIDO: lo montan ThemeGallery (Ajustes
 * → Apariencia → Galería) y ThemeStore, para no duplicar la UI del catálogo.
 * ---------------------------------------------------------------------------
 * Independiente del sistema DE PLANTILLAS existente (AppearanceConfig /
 * theme-utils.ts / themePresets) — aditivo, no lo sustituye. Aplicar/Claro/
 * Oscuro/Auto, favoritos (localStorage), exportar a Biblioteca (saveItem) e
 * importar desde archivo (.starseed-theme.json).
 * ═══════════════════════════════════════════════════════════════════════════ */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    listThemes,
    applyTheme as applyThemePack,
    appliedTheme as getAppliedThemePack,
    exportThemeFile,
    importThemeFile,
    type ThemePack,
} from "@/lib/design/theme-engine";
// Efecto de carga: registra el catálogo builtin si nadie lo hizo aún
// (appearance-context.tsx ya lo importa globalmente; este import es defensivo
// para que este componente funcione aislado en cualquier árbol).
import "@/lib/design/theme-catalog";
import { useMyLibraryDestinations, saveItem } from "@/lib/library/entity-library";
import { Button } from "@/components/ui/button";
import {
    Check, Star, Sun, Moon, SunMoon, Download, Upload, Sparkles, Loader2,
} from "lucide-react";

const FAVORITES_KEY = "starseed.theme.favorites.v1";

function readFavorites(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
        return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    } catch { return []; }
}

function writeFavorites(ids: string[]): void {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch { /* cuota/privado: degrada en silencio */ }
}

export function ThemeCatalogGallery({ compact = false }: { compact?: boolean }) {
    const { resolvedTheme } = useTheme();
    const { destinations } = useMyLibraryDestinations();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [mounted, setMounted] = useState(false);
    const [themes, setThemes] = useState<ThemePack[]>([]);
    const [applied, setApplied] = useState<{ id: string; mode: string } | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [exportingId, setExportingId] = useState<string | null>(null);

    const refresh = useCallback(() => {
        setThemes(listThemes());
        setApplied(getAppliedThemePack());
        setFavorites(readFavorites());
    }, []);

    useEffect(() => {
        setMounted(true);
        refresh();
        window.addEventListener("starseed:theme-applied", refresh);
        window.addEventListener("starseed:themes", refresh);
        return () => {
            window.removeEventListener("starseed:theme-applied", refresh);
            window.removeEventListener("starseed:themes", refresh);
        };
    }, [refresh]);

    const toggleFavorite = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
        setFavorites(next);
        writeFavorites(next);
    };

    const handleApply = (pack: ThemePack, mode: "light" | "dark" | "auto") => {
        const resolved: "light" | "dark" = mode === "auto" ? (resolvedTheme === "light" ? "light" : "dark") : mode;
        const ok = applyThemePack(pack.id, resolved);
        if (ok) {
            setApplied({ id: pack.id, mode: resolved });
            toast.success(`Tema «${pack.name}» aplicado`, {
                description: `Variante ${resolved === "dark" ? "oscura" : "clara"}${mode === "auto" ? " (auto)" : ""}`,
            });
        } else {
            toast.error("No se pudo aplicar el tema");
        }
    };

    const handleExport = async (pack: ThemePack) => {
        if (!destinations.length) {
            toast.error("Inicia sesión para guardar temas en tu biblioteca");
            return;
        }
        setExportingId(pack.id);
        try {
            const content = await exportThemeFile(pack).text();
            const res = await saveItem(
                destinations[0].ref,
                {
                    type: "file",
                    title: `${pack.name}.starseed-theme.json`,
                    content,
                    mime: "application/json",
                    description: pack.description,
                },
                null,
            );
            if (res.ok) toast.success("Tema exportado a tu biblioteca", { description: destinations[0].label });
            else toast.error("No se pudo guardar el archivo");
        } catch {
            toast.error("No se pudo exportar el tema");
        } finally {
            setExportingId(null);
        }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const pack = importThemeFile(text);
            if (!pack) {
                toast.error("Archivo de tema inválido (se esperaba un .starseed-theme.json)");
            } else {
                refresh();
                toast.success(`Tema «${pack.name}» importado`, { description: "Ya está en tu catálogo — aplícalo cuando quieras." });
            }
        } catch {
            toast.error("No se pudo leer el archivo");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // Favoritos primero, resto en el orden del catálogo.
    const sorted = [...themes].sort((a, b) => {
        const fa = favorites.includes(a.id) ? 0 : 1;
        const fb = favorites.includes(b.id) ? 0 : 1;
        return fa - fb;
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" /> Catálogo StarSeed
                    <span className="text-[10px] text-muted-foreground/60 font-normal normal-case ml-1">
                        {themes.length} tema{themes.length !== 1 ? "s" : ""}
                    </span>
                </h3>
                <div>
                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-xs cursor-pointer">
                        <Upload className="w-3.5 h-3.5" /> Importar tema
                    </Button>
                </div>
            </div>

            <div className={cn("grid gap-3", compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
                {sorted.map((pack) => {
                    const isApplied = mounted && applied?.id === pack.id;
                    const isFav = favorites.includes(pack.id);
                    const colors = pack.preview?.colors?.length ? pack.preview.colors : ["#8B5CF6", "#06B6D4", "#FBBF24"];
                    return (
                        <div
                            key={pack.id}
                            className={cn(
                                "relative rounded-2xl border p-3.5 transition-all duration-300 bg-foreground/[0.02]",
                                isApplied
                                    ? "border-primary/50 ring-1 ring-primary/30 bg-primary/5"
                                    : "border-border/50 hover:border-border hover:bg-foreground/[0.04]",
                            )}
                        >
                            <button
                                type="button"
                                onClick={(e) => toggleFavorite(e, pack.id)}
                                className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors cursor-pointer"
                                title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
                                aria-label="Favorito"
                            >
                                <Star className={cn("w-3.5 h-3.5", isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                            </button>

                            <div className="flex items-center gap-2 mb-2">
                                <div className="flex -space-x-1.5">
                                    {colors.slice(0, 3).map((c, i) => (
                                        <div key={i} className="w-4 h-4 rounded-full border border-black/20 shadow-sm" style={{ backgroundColor: c, zIndex: 3 - i }} />
                                    ))}
                                </div>
                                {isApplied && (
                                    <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                                        <Check className="w-3 h-3" /> Activo · {applied?.mode === "dark" ? "oscuro" : "claro"}
                                    </span>
                                )}
                            </div>

                            <p className="text-sm font-semibold text-foreground/90 pr-6">{pack.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 min-h-[2.2em]">{pack.description}</p>

                            <div className="flex items-center gap-1.5 mt-3">
                                <Button size="sm" variant="outline" onClick={() => handleApply(pack, "light")} className="h-7 px-2 text-[11px] gap-1 flex-1 cursor-pointer">
                                    <Sun className="w-3 h-3" /> Claro
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleApply(pack, "dark")} className="h-7 px-2 text-[11px] gap-1 flex-1 cursor-pointer">
                                    <Moon className="w-3 h-3" /> Oscuro
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleApply(pack, "auto")} className="h-7 px-2 text-[11px] gap-1 flex-1 cursor-pointer">
                                    <SunMoon className="w-3 h-3" /> Auto
                                </Button>
                            </div>

                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleExport(pack)}
                                disabled={exportingId === pack.id}
                                className="w-full mt-1.5 h-7 text-[11px] gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
                            >
                                {exportingId === pack.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Exportar a biblioteca
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ThemeCatalogGallery;
