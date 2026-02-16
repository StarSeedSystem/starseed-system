import React, { useState, useMemo, useEffect } from "react";
import { Search, ArrowRight, Command, Type, Palette, Sparkles, LayoutGrid, Shapes, Move, AppWindow, Image, MoreHorizontal, Component } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CanvasState } from "./state-types";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (tab: string, sectionId?: string) => void;
}

interface SearchableSetting {
    id: string; // The ID used in SettingControl
    label: string;
    category: string;
    icon: React.ElementType;
    tab: string; // The tab ID to switch to
    keywords?: string[];
}

// Registry of all searchable settings
const SETTINGS_REGISTRY: SearchableSetting[] = [
    // Generative
    { id: "ai-prompt", label: "AI Prompt", category: "AI Studio", icon: Sparkles, tab: "generative", keywords: ["generate", "magic"] },

    // Colors
    { id: "palette-primary", label: "Color Primario", category: "Colores", icon: Palette, tab: "colors", keywords: ["main", "brand"] },
    { id: "palette-secondary", label: "Color Secundario", category: "Colores", icon: Palette, tab: "colors" },
    { id: "palette-accent", label: "Color de Acento", category: "Colores", icon: Palette, tab: "colors" },
    { id: "palette-background", label: "Fondo", category: "Colores", icon: Palette, tab: "colors", keywords: ["bg", "dark"] },
    { id: "palette-surface", label: "Superficie", category: "Colores", icon: Palette, tab: "colors", keywords: ["card", "panel"] },

    // Typography
    { id: "typography-fontMain", label: "Fuente Principal", category: "Tipografía", icon: Type, tab: "typography", keywords: ["sans", "serif", "body"] },
    { id: "typography-fontHeadline", label: "Fuente Títulos", category: "Tipografía", icon: Type, tab: "typography", keywords: ["header", "display"] },
    { id: "typography-fontCode", label: "Fuente Código", category: "Tipografía", icon: Type, tab: "typography", keywords: ["mono"] },
    { id: "typography-baseSize", label: "Tamaño Base", category: "Tipografía", icon: Type, tab: "typography", keywords: ["scale", "px"] },

    // Components
    { id: "components-buttonStyle", label: "Estilo de Botones", category: "Componentes", icon: Component, tab: "components", keywords: ["glass", "neon", "flat"] },
    { id: "components-buttonRadius", label: "Radio de Botones", category: "Componentes", icon: Component, tab: "components", keywords: ["rounded", "corner"] },
    { id: "components-cardPreset", label: "Preset de Tarjetas", category: "Componentes", icon: Component, tab: "components", keywords: ["crystal", "holographic"] },
    { id: "components-inputStyle", label: "Estilo de Inputs", category: "Componentes", icon: Component, tab: "components", keywords: ["form", "field"] },

    // Effects
    { id: "effects-backdropBlur", label: "Backdrop Blur", category: "Efectos", icon: Sparkles, tab: "effects", keywords: ["glass", "blur"] },
    { id: "effects-glassSaturation", label: "Saturación Cristal", category: "Efectos", icon: Sparkles, tab: "effects", keywords: ["vibrancy"] },
    { id: "effects-glowIntensity", label: "Intensidad de Brillo", category: "Efectos", icon: Sparkles, tab: "effects", keywords: ["glow", "neon"] },
    { id: "effects-chromaticAberration", label: "Aberración Cromática", category: "Efectos", icon: Sparkles, tab: "effects", keywords: ["prism", "shift"] },
    { id: "effects-noise", label: "Opacidad de Ruido", category: "Efectos", icon: Sparkles, tab: "effects", keywords: ["grain", "texture"] },
    { id: "effects-liquidGlass", label: "Liquid Glass UI", category: "Efectos", icon: Sparkles, tab: "effects", keywords: ["distort", "fluid"] },

    // Layout
    { id: "layout-radiusMd", label: "Radio Medio (Global)", category: "Geometría", icon: LayoutGrid, tab: "layout", keywords: ["border", "rounded"] },
    { id: "layout-spacingScale", label: "Escala de Espaciado", category: "Geometría", icon: LayoutGrid, tab: "layout", keywords: ["gap", "margin", "padding"] },
    { id: "layout-dockMagnification", label: "Magnificación Dock", category: "Geometría", icon: LayoutGrid, tab: "layout", keywords: ["macos", "zoom"] },

    // Iconography
    { id: "iconography-style", label: "Estilo de Iconos", category: "Iconografía", icon: Shapes, tab: "iconography", keywords: ["outline", "solid"] },
    { id: "iconography-strokeWidth", label: "Grosor de Trazo", category: "Iconografía", icon: Shapes, tab: "iconography", keywords: ["weight"] },

    // Positioning
    { id: "positioning-density", label: "Densidad Visual", category: "Posición", icon: Move, tab: "positioning", keywords: ["compact", "comfortable"] },
    { id: "positioning-modal", label: "Posición Modales", category: "Posición", icon: Move, tab: "positioning", keywords: ["dialog", "center"] },

    // Backgrounds
    { id: "backgrounds-type", label: "Tipo de Fondo", category: "Filtros", icon: Image, tab: "backgrounds", keywords: ["gradient", "image", "video"] },
    { id: "backgrounds-meshColors", label: "Colores Mesh", category: "Filtros", icon: Image, tab: "backgrounds", keywords: ["gradient", "aurora"] },

    // Secondary
    { id: "secondary-scrollbars", label: "Barras de Desplazamiento", category: "Secundarios", icon: MoreHorizontal, tab: "secondary", keywords: ["scroll", "bar"] },
    { id: "secondary-cursor", label: "Estilo de Cursor", category: "Secundarios", icon: MoreHorizontal, tab: "secondary", keywords: ["pointer", "mouse"] },
];

export function SettingsCommandCenter({ open, onOpenChange, onSelect }: Props) {
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);

    // Filter results
    const results = useMemo(() => {
        if (!query.trim()) return SETTINGS_REGISTRY.slice(0, 8); // Show recent/popular by default
        const lowerQuery = query.toLowerCase();
        return SETTINGS_REGISTRY.filter(item =>
            item.label.toLowerCase().includes(lowerQuery) ||
            item.category.toLowerCase().includes(lowerQuery) ||
            item.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
        ).slice(0, 10);
    }, [query]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!open) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % results.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex(prev => (prev - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (results[activeIndex]) {
                    handleSelect(results[activeIndex]);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, results, activeIndex]);

    const handleSelect = (item: SearchableSetting) => {
        onSelect(item.tab, item.id);
        onOpenChange(false);
        setQuery(""); // Reset query
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 border-white/10 bg-black/80 backdrop-blur-2xl text-white max-w-xl gap-0 overflow-hidden shadow-2xl shadow-cyan-500/20 ring-1 ring-white/10">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5 bg-white/2">
                    <Search className="w-5 h-5 text-cyan-400" />
                    <input
                        className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-white/30 text-white selection:bg-cyan-500/30"
                        placeholder="Buscar ajuste... (ej. 'Blur', 'Fuente', 'Botón')"
                        value={query}
                        onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
                        autoFocus
                    />
                    <div className="flex items-center gap-1.5 opacity-50">
                        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-white/20 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-white/70">
                            ESC
                        </kbd>
                    </div>
                </div>

                {/* Results List */}
                <div className="max-h-[350px] overflow-y-auto py-2 px-2 space-y-0.5">
                    {results.length === 0 ? (
                        <div className="py-12 text-center text-white/30 text-sm flex flex-col items-center gap-3">
                            <Sparkles className="w-8 h-8 text-white/10" />
                            <span>No se encontraron resultados para "{query}"</span>
                        </div>
                    ) : (
                        results.map((item, index) => (
                            <button
                                key={item.id}
                                onClick={() => handleSelect(item)}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition-all group border border-transparent",
                                    index === activeIndex
                                        ? "bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-white/10 shadow-lg shadow-black/20"
                                        : "hover:bg-white/5 hover:border-white/5"
                                )}
                                onMouseEnter={() => setActiveIndex(index)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 border border-white/5 transition-all",
                                        index === activeIndex ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300" : "text-white/50"
                                    )}>
                                        <item.icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className={cn(
                                            "text-sm font-medium transition-colors",
                                            index === activeIndex ? "text-cyan-100" : "text-white/80"
                                        )}>
                                            {item.label}
                                        </div>
                                        <div className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5">
                                            <span className={cn(index === activeIndex && "text-cyan-200/50")}>{item.category}</span>
                                            {index === activeIndex && item.keywords && (
                                                <span className="opacity-50">· {item.keywords.slice(0, 2).join(", ")}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {index === activeIndex && (
                                    <ArrowRight className="w-4 h-4 text-cyan-400 animate-pulse mr-1" />
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="bg-white/5 px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
                    <div className="flex gap-4">
                        <span className="text-[10px] text-white/30 flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5 bg-white/10 px-1 rounded text-white/50"><Command className="w-2.5 h-2.5" /> K</div> para abrir
                        </span>
                        <span className="text-[10px] text-white/30 flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5 bg-white/10 px-1 rounded text-white/50"><ArrowRight className="w-2.5 h-2.5" /></div> para ir
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse"></div>
                        <span className="text-[10px] text-cyan-400/80 font-medium tracking-wide uppercase">Stitch Intelligence</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
