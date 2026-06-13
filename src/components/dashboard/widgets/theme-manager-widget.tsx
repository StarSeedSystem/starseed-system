"use client";

import React, { useState, useRef, useCallback } from "react";
import { Palette, GripVertical, Trash2, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import Link from "next/link";
import { WidgetShell, MiniList } from "../kit";

// ════════════════════════════════════════════════════════════════
// ThemeManagerWidget — archivo de temas guardados. Reordenar (drag),
// aplicar (click), eliminar. Enlace al Lienzo de Diseño. Adaptativo;
// el Exocórtex de estilo es propiedad del usuario (invariante Ciberdelia).
// ════════════════════════════════════════════════════════════════
function previewColors(theme: any): string[] {
    const cfg = theme.config || {};
    const colors: string[] = [];
    if (cfg.styling?.radius !== undefined) colors.push("#8B5CF6");
    if (cfg.buttons?.style === "neon") colors.push("#00D4FF");
    if (cfg.buttons?.style === "glass") colors.push("#A78BFA");
    if (cfg.liquidGlass?.applyToUI) colors.push("#06B6D4");
    const defaults = ["#8B5CF6", "#06B6D4", "#FBBF24"];
    while (colors.length < 3) colors.push(defaults[colors.length]);
    return colors.slice(0, 3);
}

export function ThemeManagerWidget() {
    const { config, updateConfig, loadTheme, deleteTheme } = useAppearance();
    const savedThemes: any[] = config.themeStore?.savedThemes || [];

    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);
    const [activeTheme, setActiveTheme] = useState<string | null>(null);
    const dragRef = useRef<number | null>(null);

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

    const handleApply = (theme: any) => {
        loadTheme(theme.name);
        setActiveTheme(theme.name);
        setTimeout(() => setActiveTheme(null), 2000);
    };

    return (
        <WidgetShell
            title="Archivo de Temas"
            subtitle={`${savedThemes.length} guardado${savedThemes.length !== 1 ? "s" : ""}`}
            icon={Palette}
            accent="#a855f7"
            actions={
                <Link href="/design-canvas" className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                    <Plus className="size-3" /> Génesis
                </Link>
            }
        >
            {(size) => {
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                if (savedThemes.length === 0) {
                    return (
                        <div className="h-full grid place-items-center text-center px-3">
                            <div>
                                <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-white/[0.03] border border-border/40">
                                    <Palette className="size-6 text-muted-foreground/40" />
                                </div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Sin diseños guardados</p>
                                <Link href="/design-canvas" className="mt-2 inline-block text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary/80 cursor-pointer">
                                    Abrir Lienzo de Diseño
                                </Link>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="h-full pt-1">
                        <MiniList
                            items={savedThemes}
                            max={max}
                            render={(theme: any, idx: number) => {
                                const colors = previewColors(theme);
                                const isActive = activeTheme === theme.name;
                                const isOver = overIdx === idx;
                                return (
                                    <div
                                        draggable={!micro}
                                        onDragStart={() => { dragRef.current = idx; setDragIdx(idx); }}
                                        onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
                                        onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                                        onDrop={() => handleDrop(idx)}
                                        onClick={() => handleApply(theme)}
                                        className={cn(
                                            "group/item flex items-center gap-2.5 rounded-xl border px-2.5 py-2 cursor-pointer transition-colors",
                                            dragIdx === idx && "opacity-40",
                                            isOver ? "border-primary/40 bg-primary/5"
                                                : isActive ? "bg-primary/10 border-primary/30"
                                                    : "bg-white/[0.02] border-border/40 hover:border-primary/30"
                                        )}
                                    >
                                        {!micro && <GripVertical className="size-3.5 shrink-0 text-muted-foreground/30 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-grab" />}
                                        <div className="flex -space-x-1.5 shrink-0">
                                            {colors.map((c, i) => (
                                                <span key={i} className="size-5 rounded-full border border-black/30" style={{ backgroundColor: c, zIndex: 3 - i }} />
                                            ))}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] @sm:text-xs font-bold truncate">{theme.name}</p>
                                            {!micro && (
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                                                    {theme.date ? new Date(theme.date).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "Estable"}
                                                </p>
                                            )}
                                        </div>
                                        {isActive && (
                                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/20">
                                                <Check className="size-3 text-primary" />
                                            </span>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteTheme(theme.name); }}
                                            className="grid size-6 shrink-0 place-items-center rounded-lg bg-destructive/10 hover:bg-destructive/20 opacity-0 group-hover/item:opacity-100 transition-all cursor-pointer"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="size-3.5 text-destructive" />
                                        </button>
                                    </div>
                                );
                            }}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
