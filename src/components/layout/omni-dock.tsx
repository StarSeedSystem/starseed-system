"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import { useRouter, usePathname } from "next/navigation";
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
    const pathname = usePathname();

    // ¿La ruta actual corresponde a este item del dock? (resalta la sección abierta)
    const isActivePath = (p: string) => {
        if (!p || p === "#") return false;
        if (p === "/") return pathname === "/";
        return pathname === p || pathname.startsWith(p + "/");
    };

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
                                        active={isActivePath(item.path)}
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

type DockColor = "neutral" | "cyan" | "crimson" | "amber" | "emerald" | "purple";

const DOCK_PALETTE: Record<DockColor, { text: string; ring: string; glow: string; bg: string; activeBg: string }> = {
    neutral: { text: "text-foreground/80", ring: "ring-foreground/40", glow: "shadow-[0_0_18px_rgba(255,255,255,0.18)]", bg: "from-foreground/10 to-foreground/[0.02]", activeBg: "from-foreground/20 to-foreground/5" },
    cyan: { text: "text-cyan-300", ring: "ring-cyan-400/70", glow: "shadow-[0_0_18px_rgba(34,211,238,0.45)]", bg: "from-cyan-500/15 to-cyan-500/0", activeBg: "from-cyan-500/30 to-cyan-500/5" },
    crimson: { text: "text-red-300", ring: "ring-red-400/70", glow: "shadow-[0_0_18px_rgba(248,113,113,0.45)]", bg: "from-red-500/15 to-red-500/0", activeBg: "from-red-500/30 to-red-500/5" },
    amber: { text: "text-amber-300", ring: "ring-amber-400/70", glow: "shadow-[0_0_18px_rgba(251,191,36,0.45)]", bg: "from-amber-500/15 to-amber-500/0", activeBg: "from-amber-500/30 to-amber-500/5" },
    emerald: { text: "text-emerald-300", ring: "ring-emerald-400/70", glow: "shadow-[0_0_18px_rgba(52,211,153,0.45)]", bg: "from-emerald-500/15 to-emerald-500/0", activeBg: "from-emerald-500/30 to-emerald-500/5" },
    purple: { text: "text-purple-300", ring: "ring-purple-400/70", glow: "shadow-[0_0_18px_rgba(168,85,247,0.45)]", bg: "from-purple-500/15 to-purple-500/0", activeBg: "from-purple-500/30 to-purple-500/5" },
};

function DockItem({ icon, label, onClick, color = "neutral", active = false }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    color?: DockColor;
    active?: boolean;
}) {
    const p = DOCK_PALETTE[color];

    return (
        <div className="group relative flex w-[58px] lg:w-[78px] shrink-0 snap-center flex-col items-center gap-1">
            <button
                onClick={onClick}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                    "relative flex items-center justify-center w-12 h-12 lg:w-16 lg:h-16 rounded-2xl transition-all duration-300 active:scale-95 group-hover:scale-105",
                    "bg-gradient-to-br ring-1 ring-inset",
                    p.text,
                    active
                        ? cn(p.activeBg, "ring-2", p.ring, p.glow, "scale-105")
                        : cn(p.bg, "ring-white/10 hover:ring-white/25"),
                )}
            >
                {icon}
                {active && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" aria-hidden />
                )}
            </button>
            <span
                className={cn(
                    "max-w-[58px] lg:max-w-[78px] truncate text-center text-[9px] lg:text-[11px] leading-tight transition-colors",
                    active ? cn(p.text, "font-semibold") : "text-foreground/55 group-hover:text-foreground/85",
                )}
            >
                {label}
            </span>
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
