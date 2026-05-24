"use client";

import React, { useState, useRef, useCallback } from "react";
import { Palette, GripVertical, Trash2, Check, Plus, ExternalLink, History } from "lucide-react";
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
        <div className="@container w-full h-full bg-card/10 backdrop-blur-3xl rounded-xl relative overflow-hidden flex flex-col p-4 @sm:p-6 border border-border/40 shadow-2xl text-foreground font-display group">
            {/* Background Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-accent/10 opacity-30 pointer-events-none group-hover:rotate-12 transition-transform duration-1000"></div>

            {/* Header */}
            <header className="flex items-center justify-between pb-6 border-b border-border/10 shrink-0 z-10 relative">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-background/40 border border-border/10 flex items-center justify-center shadow-sm">
                        <Palette className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-[10px] @sm:text-xs font-black text-foreground tracking-[0.3em] uppercase">Archive</h2>
                        <p className="text-muted-foreground text-[8px] font-bold uppercase tracking-widest mt-0.5">{savedThemes.length} Theme{savedThemes.length !== 1 ? "s" : ""} Saved</p>
                    </div>
                </div>
                <Link href="/design-canvas"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-all">
                    <Plus className="w-3.5 h-3.5" /> Genesis
                </Link>
            </header>

            {/* Theme List */}
            <main className="flex-1 space-y-2 mt-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent z-10 relative">
                {savedThemes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-6 opacity-60">
                        <div className="w-16 h-16 rounded-2xl bg-background/40 border border-border/10 flex items-center justify-center mb-4">
                            <Palette className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                        <p className="text-xs font-bold text-foreground/40 uppercase tracking-widest mb-3">No Stored Blueprints</p>
                        <Link href="/design-canvas"
                            className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest flex items-center gap-2">
                            <ExternalLink className="w-4 h-4" /> Initialize Design Canvas
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
                                    "group/item flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border relative overflow-hidden",
                                    "hover:bg-background/40 hover:shadow-lg",
                                    isDragging && "opacity-40 scale-95",
                                    isOver && "border-primary/40 bg-primary/5",
                                    isActive ? "bg-primary/10 border-primary/30" : "bg-background/20 border-border/10",
                                )}
                            >
                                {/* Drag Handle */}
                                <div className="hidden @sm:flex opacity-0 group-hover/item:opacity-40 transition-opacity cursor-grab active:cursor-grabbing shrink-0">
                                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                                </div>

                                {/* Color Preview */}
                                <div className="flex -space-x-2 shrink-0">
                                    {colors.map((c, i) => (
                                        <div key={i} className="w-6 h-6 rounded-full border border-black/20 shadow-sm"
                                            style={{ backgroundColor: c, zIndex: 3 - i }} />
                                    ))}
                                </div>

                                {/* Name & Date */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-foreground/90 tracking-tight truncate">{theme.name}</p>
                                    <p className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest mt-1">
                                        {theme.date ? new Date(theme.date).toLocaleDateString("en-US", {
                                            day: "numeric", month: "short",
                                        }) : "STABLE"}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {isActive && (
                                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                            <Check className="w-4 h-4 text-primary" />
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => handleDelete(e, theme.name)}
                                        className="opacity-0 group-hover/item:opacity-100 w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-all"
                                    >
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </main>

            {/* Quick Actions Footer */}
            <footer className="mt-6 pt-6 border-t border-border/10 flex gap-3 z-10 relative">
                <Link href="/design-canvas"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:bg-primary/20 transition-all">
                    <Palette className="w-4 h-4" /> Architect Canvas
                </Link>
            </footer>

            {/* Decorative Liquid Accents */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[80px] pointer-events-none"></div>
        </div>
    );
}
