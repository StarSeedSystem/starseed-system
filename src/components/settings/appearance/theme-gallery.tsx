"use client";

import React, { useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { useAppearance, AppearanceConfig, DeepPartial } from "@/context/appearance-context";
import { themePresets, exportTheme, importTheme, applyTheme, loadCustomTheme } from "@/components/theme/theme-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import {
    Sun, Moon, Diamond, Leaf, Circle, Palette,
    Download, Upload, Check, Sparkles, GripVertical,
    Trash2, Plus, ExternalLink, Star, Globe, ChevronDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ═══════════════════════════════════════════════════════════════════════
   COMMUNITY TEMPLATES — curated theme configs
   ═══════════════════════════════════════════════════════════════════════ */

interface CommunityTemplate {
    id: string;
    name: string;
    description: string;
    author: string;
    image: string;
    config: DeepPartial<AppearanceConfig>;
    tags: string[];
}

const communityTemplates: CommunityTemplate[] = [
    {
        id: "nova-cyber",
        name: "Nova Cyber",
        description: "Futurista — cristal líquido intenso y neones.",
        author: "StarSeed Core",
        image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1480",
        tags: ["Dark", "Neon"],
        config: {
            background: { type: "image", value: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1480", blur: 0, animation: "pan" },
            liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 24, distortWidth: 0.4 },
            styling: { radius: 0.75, glassIntensity: 30, opacity: 0.7 },
            typography: { fontFamily: "Space Grotesk", scale: 1.05 },
        },
    },
    {
        id: "zen-garden",
        name: "Zen Garden",
        description: "Minimalismo natural para máxima concentración.",
        author: "Nature One",
        image: "https://images.unsplash.com/photo-1584714268709-c3dd9c92b378?q=80&w=1480",
        tags: ["Light", "Minimal"],
        config: {
            background: { type: "image", value: "https://images.unsplash.com/photo-1584714268709-c3dd9c92b378?q=80&w=1480", blur: 0, animation: "pulse" },
            liquidGlass: { enabled: false, applyToUI: false, cornerRadius: 16, distortWidth: 0.1 },
            styling: { radius: 1, glassIntensity: 5, opacity: 0.95 },
            typography: { fontFamily: "Outfit", scale: 1 },
        },
    },
    {
        id: "deep-space",
        name: "Deep Space",
        description: "Inmersión total en el cosmos.",
        author: "Voyager",
        image: "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?q=80&w=1480",
        tags: ["Dark", "Immersive"],
        config: {
            background: { type: "image", value: "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?q=80&w=1480", blur: 0, animation: "zoom" },
            liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 8, distortWidth: 0.2 },
            styling: { radius: 0.2, glassIntensity: 15, opacity: 0.6 },
            typography: { fontFamily: "Inter", scale: 0.95 },
        },
    },
    {
        id: "flow-state",
        name: "Flow State",
        description: "La experiencia original de cristal líquido.",
        author: "System",
        image: "https://i.ibb.co/MDbLn4N4/vectors.png",
        tags: ["Demo", "Vector"],
        config: {
            background: { type: "image", value: "https://i.ibb.co/MDbLn4N4/vectors.png", blur: 0, animation: "scroll" },
            liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 12, distortWidth: 0.5 },
            styling: { radius: 0.75, glassIntensity: 20, opacity: 0.85 },
            typography: { fontFamily: "Inter", scale: 1 },
        },
    },
];

/* ═══════════════════════════════════════════════════════════════════════
   PRESET DEFINITIONS — base theme presets, enriched with color/meta
   ═══════════════════════════════════════════════════════════════════════ */
interface PresetMeta {
    id: string;
    label: string;
    icon: React.ReactNode;
    colors: string[];
    accent: string;
}

const presetsMeta: PresetMeta[] = [
    { id: "light", label: "Claro", icon: <Sun className="w-5 h-5" />, colors: ["#ffffff", "#f8fafc", "#e2e8f0"], accent: "#f59e0b" },
    { id: "dark", label: "Oscuro", icon: <Moon className="w-5 h-5" />, colors: ["#0f172a", "#1e293b", "#334155"], accent: "#8b5cf6" },
    { id: "grey", label: "Gris", icon: <Circle className="w-5 h-5" />, colors: ["#374151", "#4b5563", "#6b7280"], accent: "#9ca3af" },
    { id: "natural", label: "Natural", icon: <Leaf className="w-5 h-5" />, colors: ["#14532d", "#166534", "#22c55e"], accent: "#4ade80" },
    { id: "glass", label: "Cristal", icon: <Diamond className="w-5 h-5" />, colors: ["#0c1222", "#164e63", "#06b6d4"], accent: "#22d3ee" },
    { id: "custom", label: "Personalizado", icon: <Palette className="w-5 h-5" />, colors: ["#581c87", "#7c3aed", "#a78bfa"], accent: "#c084fc" },
];

/* ═══════════════════════════════════════════════════════════════════════
   THEME GALLERY — Main export
   compact=true  → widget mode (limited height, no community section)
   compact=false → full settings mode
   ═══════════════════════════════════════════════════════════════════════ */
export function ThemeGallery({ compact = false }: { compact?: boolean }) {
    const { setTheme, theme } = useTheme();
    const { config, updateConfig, updateSection, saveTheme, loadTheme, deleteTheme } = useAppearance();
    const savedThemes = Array.isArray(config.themeStore?.savedThemes) ? config.themeStore.savedThemes : [];
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);
    const [activeTheme, setActiveTheme] = useState<string | null>(null);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);
    const dragRef = useRef<number | null>(null);
    const [showCommunity, setShowCommunity] = useState(false);

    React.useEffect(() => {
        setMounted(true);
        loadCustomTheme();
    }, []);

    React.useEffect(() => {
        if (theme === "custom") loadCustomTheme();
    }, [theme]);

    /* ── Preset handlers ── */
    const handlePresetClick = (id: string) => {
        setTheme(id);
        const preset = themePresets[id];
        if (preset) {
            updateConfig(preset);
            toast.success(`Tema ${id.toUpperCase()} aplicado`);
        }
    };

    /* ── Import / Export ── */
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await importTheme(file);
            applyTheme(data);
            setTheme("custom");
            toast.success("Tema importado correctamente");
        } catch {
            toast.error("Error al importar");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    /* ── Drag & drop for saved themes ── */
    const handleDragStart = (idx: number) => { dragRef.current = idx; setDragIdx(idx); };
    const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx); };
    const handleDrop = useCallback((dropIdx: number) => {
        const from = dragRef.current;
        if (from === null || from === dropIdx) { setDragIdx(null); setOverIdx(null); return; }
        const reordered = [...savedThemes];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(dropIdx, 0, moved);
        updateConfig({ themeStore: { ...config.themeStore, savedThemes: reordered } });
        setDragIdx(null);
        setOverIdx(null);
    }, [savedThemes, config.themeStore, updateConfig]);

    const handleApply = (t: any) => {
        loadTheme(t.name);
        setActiveTheme(t.name);
        setTimeout(() => setActiveTheme(null), 2000);
    };

    const handleDelete = (e: React.MouseEvent, name: string) => {
        e.stopPropagation();
        deleteTheme(name);
    };

    const getPreviewColors = (t: any): string[] => {
        if (!t || !t.config) return [];
        const cfg = t.config;
        const c: string[] = [];
        if (cfg.styling?.radius !== undefined) c.push("#8B5CF6");
        if (cfg.buttons?.style === "neon") c.push("#00D4FF");
        if (cfg.buttons?.style === "glass") c.push("#A78BFA");
        if (cfg.liquidGlass?.applyToUI) c.push("#06B6D4");
        const defaults = ["#8B5CF6", "#06B6D4", "#FBBF24"];
        while (c.length < 3) c.push(defaults[c.length]);
        return c.slice(0, 3);
    };

    const applyCommunityTemplate = (tpl: CommunityTemplate) => {
        updateConfig(tpl.config as any);
        updateSection("themeStore", { activeTemplateId: tpl.id });
        toast.success(`Tema "${tpl.name}" aplicado`);
    };

    return (
        <div className="space-y-6">
            {/* ═══════════════════════════════════════════════
                SECTION 1 — Base Theme Presets
               ═══════════════════════════════════════════════ */}
            <div>
                <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-amber-400" /> Temas Base
                </h3>
                <div className={cn(
                    "grid gap-2.5",
                    compact ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"
                )}>
                    {presetsMeta.map((p) => {
                        const isActive = mounted && theme === p.id;
                        return (
                            <button
                                key={p.id}
                                onClick={() => handlePresetClick(p.id)}
                                className={cn(
                                    "relative group flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-300",
                                    "hover:scale-[1.04] hover:shadow-lg",
                                    isActive
                                        ? "border-primary/50 bg-primary/10 shadow-primary/20 shadow-md ring-1 ring-primary/30"
                                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                                )}
                            >
                                {/* Color Preview Dots */}
                                <div className="flex -space-x-1.5 mb-1">
                                    {p.colors.map((c, i) => (
                                        <div
                                            key={i}
                                            className="w-4 h-4 rounded-full border border-black/20 shadow-sm"
                                            style={{ backgroundColor: c, zIndex: 3 - i }}
                                        />
                                    ))}
                                </div>

                                {/* Icon */}
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                    isActive
                                        ? "bg-primary/20 text-primary"
                                        : "bg-white/[0.04] text-white/40 group-hover:text-white/70"
                                )} style={isActive ? { color: p.accent } : undefined}>
                                    {p.icon}
                                </div>

                                {/* Label */}
                                <span className={cn(
                                    "text-[11px] font-medium transition-colors",
                                    isActive ? "text-primary" : "text-white/40 group-hover:text-white/70"
                                )}>
                                    {p.label}
                                </span>

                                {/* Active indicator */}
                                {isActive && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
                                        <Check className="w-3 h-3 text-primary-foreground" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 2 — Saved Themes (from Canvas)
               ═══════════════════════════════════════════════ */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                        <Palette className="w-3.5 h-3.5 text-violet-400" /> Temas Guardados
                        <span className="text-[10px] text-white/25 font-normal normal-case ml-1">
                            {savedThemes.length} tema{savedThemes.length !== 1 ? "s" : ""}
                        </span>
                    </h3>
                    <Link
                        href="/design-canvas"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[11px] text-violet-300 hover:bg-violet-500/20 transition-all"
                    >
                        <Plus className="w-3 h-3" /> Crear en Lienzo
                    </Link>
                </div>

                {savedThemes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01]">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                            <Palette className="w-6 h-6 text-white/15" />
                        </div>
                        <p className="text-xs text-white/30 mb-2">Aún no has guardado temas</p>
                        <Link
                            href="/design-canvas"
                            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                        >
                            <ExternalLink className="w-3 h-3" /> Abrir Design Canvas
                        </Link>
                    </div>
                ) : (
                    <div className={cn(
                        "space-y-1.5 overflow-y-auto pr-1",
                        compact ? "max-h-40" : "max-h-64"
                    )} style={{ scrollbarWidth: "thin" }}>
                        {savedThemes.map((t: any, idx: number) => {
                            const colors = getPreviewColors(t);
                            const isActive = activeTheme === t.name;
                            const isDragging = dragIdx === idx;
                            const isOver = overIdx === idx;
                            return (
                                <div
                                    key={t.name + idx}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                                    onDrop={() => handleDrop(idx)}
                                    onClick={() => handleApply(t)}
                                    className={cn(
                                        "group flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all border",
                                        "hover:bg-white/[0.04]",
                                        isDragging && "opacity-40 scale-95",
                                        isOver && "border-violet-500/40 bg-violet-500/5",
                                        isActive
                                            ? "bg-emerald-500/10 border-emerald-500/30"
                                            : "bg-white/[0.02] border-white/5"
                                    )}
                                >
                                    {/* Drag Handle */}
                                    <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing shrink-0">
                                        <GripVertical className="w-3.5 h-3.5 text-white/40" />
                                    </div>
                                    {/* Color Preview */}
                                    <div className="flex -space-x-1 shrink-0">
                                        {colors.map((c, i) => (
                                            <div key={i} className="w-4 h-4 rounded-full border border-black/30"
                                                style={{ backgroundColor: c, zIndex: 3 - i }} />
                                        ))}
                                    </div>
                                    {/* Name & Date */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-white/80 font-medium truncate">{t.name}</p>
                                        <p className="text-[10px] text-white/25 truncate">
                                            {t.date ? new Date(t.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}
                                        </p>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isActive && (
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-emerald-400" />
                                            </div>
                                        )}
                                        <button
                                            onClick={(e) => handleDelete(e, t.name)}
                                            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full hover:bg-red-500/20 flex items-center justify-center transition-all"
                                        >
                                            <Trash2 className="w-3 h-3 text-white/30 hover:text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 3 — Import / Export
               ═══════════════════════════════════════════════ */}
            <div className="flex gap-2 pt-2 border-t border-white/5">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { try { exportTheme(); toast.success("Tema exportado"); } catch { toast.error("Error al exportar"); } }}
                    className="flex-1 gap-2 text-xs bg-white/[0.02] border-white/10 hover:bg-white/[0.06]"
                >
                    <Download className="w-3.5 h-3.5" /> Exportar
                </Button>
                <div className="relative flex-1">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImport}
                        accept=".json"
                        className="hidden"
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full gap-2 text-xs bg-white/[0.02] border-white/10 hover:bg-white/[0.06]"
                    >
                        <Upload className="w-3.5 h-3.5" /> Importar
                    </Button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
                SECTION 4 — Community Templates (only in full mode)
               ═══════════════════════════════════════════════ */}
            {!compact && (
                <div>
                    <button
                        onClick={() => setShowCommunity(!showCommunity)}
                        className="w-full flex items-center justify-between py-2 text-sm font-semibold text-white/70 uppercase tracking-wider hover:text-white/90 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5 text-cyan-400" /> Temas de la Comunidad
                        </span>
                        <ChevronDown className={cn("w-4 h-4 text-white/30 transition-transform duration-300", showCommunity && "rotate-180")} />
                    </button>

                    {showCommunity && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            {communityTemplates.map((tpl) => (
                                <div
                                    key={tpl.id}
                                    onClick={() => applyCommunityTemplate(tpl)}
                                    className={cn(
                                        "group relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-300",
                                        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                                        config.themeStore?.activeTemplateId === tpl.id
                                            ? "border-emerald-500/30 ring-1 ring-emerald-500/20"
                                            : "border-white/[0.06] bg-white/[0.02]"
                                    )}
                                >
                                    {/* Image Header */}
                                    <div className="h-28 overflow-hidden relative">
                                        <div
                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                                            style={{ backgroundImage: `url(${tpl.image})` }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                        {/* Tags */}
                                        <div className="absolute bottom-2 left-2 flex gap-1">
                                            {tpl.tags.map((tag) => (
                                                <span key={tag} className="px-1.5 py-0.5 rounded-md bg-black/50 text-[9px] text-white/70 border border-white/10">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        {/* Active badge */}
                                        {config.themeStore?.activeTemplateId === tpl.id && (
                                            <div className="absolute top-2 right-2">
                                                <Badge className="bg-emerald-500 text-white text-[9px] gap-1 px-1.5">
                                                    <Check className="w-2.5 h-2.5" /> Activo
                                                </Badge>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-3">
                                        <p className="text-sm font-semibold text-white/90">{tpl.name}</p>
                                        <p className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{tpl.description}</p>
                                        <p className="text-[10px] text-white/20 mt-1.5">por {tpl.author}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
