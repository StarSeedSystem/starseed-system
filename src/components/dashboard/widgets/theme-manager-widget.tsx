"use client";

import React, { useState, useRef, useCallback } from "react";
import { Palette, GripVertical, Trash2, Check, Plus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import Link from "next/link";

/**
 * ThemeManagerWidget — Dashboard widget for managing saved themes.
 * Features: drag-to-reorder, quick-apply on click, delete, and link to Design Canvas.
 */
export function ThemeManagerWidget() {
    const { config, updateConfig, saveTheme, loadTheme, deleteTheme } = useAppearance();
    const savedThemes = config.themeStore?.savedThemes || [];

    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);
    const [activeTheme, setActiveTheme] = useState<string | null>(null);
    const dragRef = useRef<number | null>(null);

    const handleDragStart = (idx: number) => {
        dragRef.current = idx;
        setDragIdx(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setOverIdx(idx);
    };

    const handleDrop = useCallback((dropIdx: number) => {
        const from = dragRef.current;
        if (from === null || from === dropIdx) { setDragIdx(null); setOverIdx(null); return; }
        // Reorder in config
        const reordered = [...savedThemes];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(dropIdx, 0, moved);
        updateConfig({
            themeStore: {
                ...config.themeStore,
                savedThemes: reordered,
            },
        });
        setDragIdx(null);
        setOverIdx(null);
    }, [savedThemes, config.themeStore, updateConfig]);

    const handleApply = (theme: any) => {
        loadTheme(theme.name);
        setActiveTheme(theme.name);
        setTimeout(() => setActiveTheme(null), 2000);
    };

    const handleDelete = (e: React.MouseEvent, name: string) => {
        e.stopPropagation();
        deleteTheme(name);
    };

    // Extract a preview color from theme config
    const getPreviewColors = (theme: any): string[] => {
        const cfg = theme.config || {};
        const colors: string[] = [];
        if (cfg.styling?.radius !== undefined) colors.push("#8B5CF6"); // default purple
        if (cfg.buttons?.style === "neon") colors.push("#00D4FF");
        if (cfg.buttons?.style === "glass") colors.push("#A78BFA");
        if (cfg.liquidGlass?.applyToUI) colors.push("#06B6D4");
        // Always fill to at least 3 colors
        const defaults = ["#8B5CF6", "#06B6D4", "#FBBF24"];
        while (colors.length < 3) colors.push(defaults[colors.length]);
        return colors.slice(0, 3);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-violet-500/20">
                        <Palette className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white">Temas Guardados</h3>
                        <p className="text-[10px] text-white/30">{savedThemes.length} tema{savedThemes.length !== 1 ? "s" : ""}</p>
                    </div>
                </div>
                <Link href="/design-canvas"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[11px] text-violet-300 hover:bg-violet-500/20 transition-all">
                    <Plus className="w-3 h-3" /> Crear
                </Link>
            </div>

            {/* Theme List */}
            <div className="flex-1 space-y-1.5 min-h-0 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                {savedThemes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-6">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                            <Palette className="w-6 h-6 text-white/20" />
                        </div>
                        <p className="text-xs text-white/30 mb-2">No hay temas guardados</p>
                        <Link href="/design-canvas"
                            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Abrir Design Canvas
                        </Link>
                    </div>
                ) : (
                    savedThemes.map((theme: any, idx: number) => {
                        const colors = getPreviewColors(theme);
                        const isActive = activeTheme === theme.name;
                        const isDragging = dragIdx === idx;
                        const isOver = overIdx === idx;
                        return (
                            <div
                                key={theme.name + idx}
                                draggable
                                onDragStart={() => handleDragStart(idx)}
                                onDragOver={(e) => handleDragOver(e, idx)}
                                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                                onDrop={() => handleDrop(idx)}
                                onClick={() => handleApply(theme)}
                                className={cn(
                                    "group flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all border",
                                    "hover:bg-white/5",
                                    isDragging && "opacity-40 scale-95",
                                    isOver && "border-violet-500/40 bg-violet-500/5",
                                    isActive ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/[0.02] border-white/5",
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
                                    <p className="text-xs text-white/80 font-medium truncate">{theme.name}</p>
                                    <p className="text-[10px] text-white/25 truncate">
                                        {theme.date ? new Date(theme.date).toLocaleDateString("es-MX", {
                                            day: "numeric", month: "short",
                                        }) : "—"}
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
                                        onClick={(e) => handleDelete(e, theme.name)}
                                        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full hover:bg-red-500/20 flex items-center justify-center transition-all"
                                    >
                                        <Trash2 className="w-3 h-3 text-white/30 hover:text-red-400" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Quick Actions Footer */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                <Link href="/design-canvas"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/15 text-xs text-violet-300 hover:from-violet-500/20 hover:to-fuchsia-500/20 transition-all">
                    <Palette className="w-3.5 h-3.5" /> Design Canvas
                </Link>
            </div>
        </div>
    );
}
