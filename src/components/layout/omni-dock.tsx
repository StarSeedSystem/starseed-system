"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Home, User, MessageSquare, Bell, Users, Book, Library, Network, Settings,
    Plus, BrainCircuit, Brain, Sparkles, Wrench, Zap, Eye, Cpu, Server,
    Database, CalendarDays, Pencil, Check, RotateCcw, X, ArrowLeft, ArrowRight,
    ChevronLeft, ChevronRight,
} from "lucide-react";

import { useAppearance } from "@/context/appearance-context";
import { TrinityFab } from "./trinity-fab";
import {
    loadDockConfig,
    saveDockConfig,
    resetDockConfig,
    DOCK_PRESETS,
    type DockItemConfig,
    type DockIconKey,
} from "./dock-config";

const ICON_MAP: Record<DockIconKey, React.ComponentType<{ className?: string }>> = {
    Home, User, MessageSquare, Bell, Users, Book, Library, Network, Settings,
    BrainCircuit, Brain, Sparkles, Wrench, Zap, Eye, Cpu, Server, Database,
    CalendarDays, Plus,
};

export function OmniDock() {
    const { activeEdge } = usePerimeter();
    const { config } = useAppearance();
    const router = useRouter();

    const { dockBehavior = "anchor-only" } = config?.trinity || {};

    let isVisible = false;
    if (dockBehavior === "always-visible") isVisible = true;
    else isVisible = activeEdge === "anchor";

    const [items, setItems] = useState<DockItemConfig[]>(DOCK_PRESETS);
    const [editMode, setEditMode] = useState(false);

    // Sombras de scroll del dock: indican que hay MÁS opciones al deslizar.
    const stripRef = useRef<HTMLDivElement | null>(null);
    const [shadow, setShadow] = useState<{ l: boolean; r: boolean }>({ l: false, r: false });
    const updateShadows = useCallback(() => {
        const el = stripRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setShadow({ l: el.scrollLeft > 4, r: el.scrollLeft < max - 4 });
    }, []);

    useEffect(() => { setItems(loadDockConfig()); }, []);

    // Recalcula las sombras al abrir el dock, cambiar items o redimensionar.
    useEffect(() => {
        if (!isVisible) return;
        const id = window.setTimeout(updateShadows, 60); // tras la animación de entrada
        window.addEventListener("resize", updateShadows);
        return () => { window.clearTimeout(id); window.removeEventListener("resize", updateShadows); };
    }, [isVisible, items, editMode, updateShadows]);

    const persist = (next: DockItemConfig[]) => {
        setItems(next);
        saveDockConfig(next);
    };

    const toggleEnabled = (id: string) => {
        persist(items.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)));
    };

    const move = (id: string, direction: -1 | 1) => {
        const idx = items.findIndex((it) => it.id === id);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= items.length) return;
        const next = [...items];
        const [el] = next.splice(idx, 1);
        next.splice(newIdx, 0, el);
        persist(next);
    };

    const reset = () => {
        if (confirm('¿Restablecer el dock a su configuración por defecto?')) {
            resetDockConfig();
            setItems(DOCK_PRESETS);
        }
    };

    const visibleItems = useMemo(() => items.filter((it) => it.enabled), [items]);

    return (
        <>
        {/* Trinity Móvil · Bloque 2 — FAB de acceso a los 4 menús cardinales.
            Se monta aquí (mismo árbol que el dock, layout raíz) para existir en
            todas las páginas. Él mismo decide si renderizarse (auto/on/off). */}
        <TrinityFab />
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 left-0 right-0 z-[70] flex flex-col items-center pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8 pointer-events-none"
                >
                    {editMode && (
                        <div className="pointer-events-auto mb-3 w-full max-w-3xl px-4">
                            <DockEditor
                                items={items}
                                onToggle={toggleEnabled}
                                onMove={move}
                                onReset={reset}
                                onClose={() => setEditMode(false)}
                            />
                        </div>
                    )}

                    {/*
                        Píldora del dock: el borde/cristal queda intacto; dentro, un strip
                        (.omni-dock-strip, ver globals.css) que en <1024px hace scroll-x con
                        scroll-snap + máscara de degradado en los bordes para que el dock
                        completo sea usable en 320–1023px sin perder ningún item. En <lg
                        los items van compactos (48px, ≥44px táctil); en ≥lg, diseño original.
                    */}
                    <div className="
                        omni-dock-pill
                        glass-depth glass-edge glass-sheen-slow
                        pointer-events-auto
                        bg-card/40 dark:bg-black/40 backdrop-blur-3xl
                        border border-foreground/10
                        rounded-[--radius-full]
                        shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]
                        mb-2 sm:mb-4 max-w-[calc(100vw-0.75rem)] lg:max-w-[96vw]
                        p-2 lg:p-5
                        relative
                    ">
                        {/* Sombras de scroll: aparecen del lado donde hay más opciones */}
                        <div
                            aria-hidden
                            className={cn(
                                "pointer-events-none absolute inset-y-2 left-0 w-10 rounded-l-[--radius-full] z-10 transition-opacity duration-300",
                                "bg-gradient-to-r from-black/45 to-transparent",
                                shadow.l ? "opacity-100" : "opacity-0"
                            )}
                        />
                        <div
                            aria-hidden
                            className={cn(
                                "pointer-events-none absolute inset-y-2 right-0 w-10 rounded-r-[--radius-full] z-10 transition-opacity duration-300",
                                "bg-gradient-to-l from-black/45 to-transparent",
                                shadow.r ? "opacity-100" : "opacity-0"
                            )}
                        />
                        {/* Chevron sutil que confirma que se puede seguir desplazando */}
                        {shadow.r && (
                            <span aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 z-20 text-foreground/50 animate-pulse">
                                <ChevronRight className="w-4 h-4" />
                            </span>
                        )}
                        {shadow.l && (
                            <span aria-hidden className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 z-20 text-foreground/50 animate-pulse">
                                <ChevronLeft className="w-4 h-4" />
                            </span>
                        )}
                        <div
                            ref={stripRef}
                            onScroll={updateShadows}
                            className="omni-dock-strip flex items-end gap-1.5 lg:gap-4"
                        >
                            {visibleItems.map((item) => {
                                const Icon = ICON_MAP[item.iconKey] ?? Home;
                                return (
                                    <DockItem
                                        key={item.id}
                                        icon={<Icon className="w-5 h-5 lg:w-7 lg:h-7" />}
                                        label={item.label}
                                        color={item.color}
                                        onClick={() => router.push(item.path)}
                                    />
                                );
                            })}

                            <div className="w-px h-10 lg:h-14 bg-foreground/10 mx-1 lg:mx-2 self-center rounded-full shrink-0" aria-hidden />

                            <DockItem
                                icon={<Pencil className="w-5 h-5 lg:w-7 lg:h-7" />}
                                label={editMode ? "Cerrar editor" : "Personalizar dock"}
                                color="neutral"
                                onClick={() => setEditMode((v) => !v)}
                            />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}

function DockItem({ icon, label, onClick, color = "neutral" }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    color?: "neutral" | "cyan" | "crimson" | "amber" | "emerald" | "purple";
}) {
    const colorStyles = {
        neutral: "hover:bg-foreground/10 text-foreground/80 hover:text-foreground",
        cyan: "text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]",
        crimson: "text-red-600 dark:text-red-400 hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(248,113,113,0.3)]",
        amber: "text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]",
        emerald: "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)]",
        purple: "text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]",
    };

    return (
        <div className="group relative flex flex-col items-center gap-1.5 lg:gap-2 shrink-0 snap-center">
            <span className="
                absolute bottom-full mb-3 left-1/2 -translate-x-1/2
                scale-0 opacity-0
                group-hover:scale-100 group-hover:opacity-100
                transition-all duration-300 origin-bottom
                bg-foreground text-background text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full
                border border-background/20 whitespace-nowrap drop-shadow-md z-[100]
                pointer-events-none
                after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2
                after:border-4 after:border-transparent after:border-t-foreground
            ">
                {label}
            </span>
            <button
                onClick={onClick}
                className={cn(
                    "relative flex items-center justify-center w-12 h-12 lg:w-16 lg:h-16 rounded-[--radius-full] transition-all duration-300 active:scale-95 group-hover:scale-110",
                    "before:absolute before:inset-0 before:rounded-[--radius-full] before:border before:border-transparent hover:before:border-foreground/20",
                    colorStyles[color]
                )}
            >
                {icon}
            </button>
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/20 group-hover:bg-foreground/80 transition-colors" />
        </div>
    );
}

function DockEditor({
    items, onToggle, onMove, onReset, onClose,
}: {
    items: DockItemConfig[];
    onToggle: (id: string) => void;
    onMove: (id: string, direction: -1 | 1) => void;
    onReset: () => void;
    onClose: () => void;
}) {
    return (
        <div className="bg-card/60 backdrop-blur-2xl border border-foreground/15 rounded-3xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs uppercase tracking-wider font-bold text-foreground/80">
                    Personalizar dock
                </h4>
                <div className="flex gap-1.5">
                    <button onClick={onReset} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full border border-foreground/10 hover:bg-foreground/5">
                        <RotateCcw className="w-3 h-3" /> Restablecer
                    </button>
                    <button onClick={onClose} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full border border-foreground/10 hover:bg-foreground/5">
                        <Check className="w-3 h-3" /> Listo
                    </button>
                </div>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
                Activa o desactiva los iconos y reordénalos. Los items "Hermes" (Agente, Cerebro, Skills, Tools, Sentidos, MCPs) son opciones predeterminadas que puedes mostrar u ocultar.
            </p>
            <div className="grid sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
                {items.map((it) => {
                    const Icon = ICON_MAP[it.iconKey] ?? Home;
                    return (
                        <div
                            key={it.id}
                            className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs',
                                it.enabled
                                    ? 'border-foreground/15 bg-foreground/[0.03]'
                                    : 'border-foreground/5 bg-foreground/[0.01] opacity-60'
                            )}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">{it.label}</span>
                            <button onClick={() => onMove(it.id, -1)} className="p-1 hover:bg-foreground/10 rounded">
                                <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button onClick={() => onMove(it.id, 1)} className="p-1 hover:bg-foreground/10 rounded">
                                <ArrowRight className="w-3 h-3" />
                            </button>
                            <button onClick={() => onToggle(it.id)} className="p-1 hover:bg-foreground/10 rounded">
                                {it.enabled ? <Check className="w-3 h-3 text-emerald-400" /> : <X className="w-3 h-3 text-muted-foreground" />}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
