"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Settings, Sliders, Home, Bell, Maximize2, Minimize2, Monitor, X,
    SlidersHorizontal, ArrowUp, ArrowDown, Eye, EyeOff, RotateCcw,
} from "lucide-react";
import { SystemTab } from "./tabs/system-tab";
import { QuickSettingsTab } from "./tabs/quick-settings-tab";
import { SmartHomeTab } from "./tabs/smart-home-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePerimeter } from "@/context/perimeter-context";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useAppearance } from "@/context/appearance-context";
import { CONTROL_CENTER_NAVIGATE_EVENT, type ControlCenterNavigateDetail } from "./control-center-events";

/**
 * Catálogo de módulos rápidos del Centro de Control. El ORDEN de renderizado
 * real se decide en runtime a partir de `config.controlCenter.moduleOrder`
 * (con fallback a este orden por defecto si el id no aparece ahí) y los
 * ocultos se filtran con `config.controlCenter.hiddenModules`.
 */
interface QuickModule {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    activeColor: string;
    bgColor: string;
    borderColor: string;
    Content: React.ComponentType;
}

const QUICK_MODULES: QuickModule[] = [
    { id: "system", label: "Sistema", icon: Settings, activeColor: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20", Content: SystemTab },
    { id: "quick", label: "Control", icon: Sliders, activeColor: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20", Content: QuickSettingsTab },
    { id: "home", label: "Hogar", icon: Home, activeColor: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20", Content: SmartHomeTab },
    { id: "notif", label: "Alertas", icon: Bell, activeColor: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20", Content: NotificationsTab },
];

const DEFAULT_MODULE_ORDER = QUICK_MODULES.map((m) => m.id);

/** Ids válidos, en el orden configurado por el usuario (fallback: orden por defecto). */
function resolveModuleOrder(moduleOrder: string[] | undefined): string[] {
    const known = new Set(DEFAULT_MODULE_ORDER);
    const configured = Array.isArray(moduleOrder) ? moduleOrder.filter((id) => known.has(id)) : [];
    const missing = DEFAULT_MODULE_ORDER.filter((id) => !configured.includes(id));
    return [...configured, ...missing];
}

export function ControlCenter() {
    const { setActiveEdge } = usePerimeter();
    const { isFullscreen, toggle: toggleFullscreen, isSupported } = useFullscreen();
    const { config, updateSection } = useAppearance();
    const [editorOpen, setEditorOpen] = useState(false);

    const moduleOrder = useMemo(
        () => resolveModuleOrder(config.controlCenter?.moduleOrder),
        [config.controlCenter?.moduleOrder]
    );
    const hiddenModules = useMemo(
        () => new Set(config.controlCenter?.hiddenModules ?? []),
        [config.controlCenter?.hiddenModules]
    );

    const visibleModules = useMemo(
        () => moduleOrder
            .filter((id) => !hiddenModules.has(id))
            .map((id) => QUICK_MODULES.find((m) => m.id === id))
            .filter((m): m is QuickModule => Boolean(m)),
        [moduleOrder, hiddenModules]
    );

    // Si el módulo activo se oculta, cae al primero visible; nunca se queda sin pestaña.
    const [activeTab, setActiveTab] = useState<string>(() => visibleModules[0]?.id ?? "quick");
    useEffect(() => {
        if (!visibleModules.some((m) => m.id === activeTab)) {
            setActiveTab(visibleModules[0]?.id ?? "quick");
        }
        // Solo reacciona si la pestaña activa deja de estar disponible.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleModules]);

    // Puente: otras pestañas (p.ej. quick-settings-tab "Atmósfera del fondo")
    // piden navegar a un módulo concreto sin acoplarse a este componente.
    useEffect(() => {
        const onNavigate = (e: Event) => {
            const detail = (e as CustomEvent<ControlCenterNavigateDetail>).detail;
            if (detail?.tab && visibleModules.some((m) => m.id === detail.tab)) {
                setActiveTab(detail.tab);
            }
        };
        window.addEventListener(CONTROL_CENTER_NAVIGATE_EVENT, onNavigate);
        return () => window.removeEventListener(CONTROL_CENTER_NAVIGATE_EVENT, onNavigate);
    }, [visibleModules]);

    const handleClose = () => {
        setActiveEdge(null);
    };

    const moveModule = useCallback((id: string, dir: -1 | 1) => {
        const current = resolveModuleOrder(config.controlCenter?.moduleOrder);
        const idx = current.indexOf(id);
        const target = idx + dir;
        if (idx === -1 || target < 0 || target >= current.length) return;
        const next = [...current];
        [next[idx], next[target]] = [next[target], next[idx]];
        updateSection("controlCenter", { moduleOrder: next });
    }, [config.controlCenter?.moduleOrder, updateSection]);

    const toggleModuleHidden = useCallback((id: string) => {
        const currentHidden = new Set(config.controlCenter?.hiddenModules ?? []);
        if (currentHidden.has(id)) currentHidden.delete(id);
        else currentHidden.add(id);
        // Nunca permitimos ocultar TODOS los módulos (siempre queda al menos 1 pestaña).
        if (currentHidden.size >= QUICK_MODULES.length) return;
        updateSection("controlCenter", { hiddenModules: Array.from(currentHidden) });
    }, [config.controlCenter?.hiddenModules, updateSection]);

    const resetModules = useCallback(() => {
        updateSection("controlCenter", { moduleOrder: DEFAULT_MODULE_ORDER, hiddenModules: [] });
    }, [updateSection]);

    const editorOrder = resolveModuleOrder(config.controlCenter?.moduleOrder);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
                "bg-black/80 backdrop-blur-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col pointer-events-auto relative ring-1 ring-white/5",
                // Móvil: rellena el contenedor fullscreen del SideCurtains (antes era
                // `fixed inset-0`, que caía en la trampa del containing block del
                // transform padre y quedaba fuera de pantalla — ver SOP Bloque 3).
                "w-full h-full rounded-none",
                "md:w-[420px] md:h-[600px] md:rounded-[2rem]",
                "lg:w-[460px] lg:h-[640px]"
            )}
        >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-cyan-500/10 via-primary/5 to-transparent rounded-full blur-[100px] pointer-events-none -z-10" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/10 via-amber-500/5 to-transparent rounded-full blur-[80px] pointer-events-none -z-10" />

            {/* Premium Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shrink-0">
                        <Monitor className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                        <span className="text-sm font-semibold text-white/90 tracking-wide truncate block">Centro de Control</span>
                        <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.15em] mt-0.5 truncate">Panel de Lógica · StarSeed OS</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditorOpen((v) => !v)}
                        className={cn(
                            "w-8 h-8 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all",
                            editorOpen && "bg-white/10 text-white"
                        )}
                        title="Reordenar u ocultar módulos"
                        aria-pressed={editorOpen}
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                    </Button>
                    {isSupported && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleFullscreen}
                            className="w-8 h-8 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
                            title={isFullscreen ? "Salir pantalla completa" : "Pantalla completa del programa"}
                        >
                            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="w-8 h-8 rounded-xl hover:bg-red-500/10 text-white/50 hover:text-red-400 transition-all md:hidden"
                        title="Cerrar"
                    >
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Mini-editor de módulos: reordenar (flechas) + ocultar/mostrar */}
            <AnimatePresence>
                {editorOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="shrink-0 overflow-hidden border-b border-white/5 bg-black/40"
                    >
                        <div className="px-4 py-3 space-y-1.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">Módulos del panel</span>
                                <button
                                    type="button"
                                    onClick={resetModules}
                                    className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                                    title="Restaurar orden y visibilidad por defecto"
                                >
                                    <RotateCcw className="w-3 h-3" /> Restaurar
                                </button>
                            </div>
                            {editorOrder.map((id, idx) => {
                                const mod = QUICK_MODULES.find((m) => m.id === id);
                                if (!mod) return null;
                                const Icon = mod.icon;
                                const hidden = hiddenModules.has(id);
                                return (
                                    <div
                                        key={id}
                                        className={cn(
                                            "flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-colors",
                                            hidden ? "border-white/5 bg-white/[0.02] opacity-50" : "border-white/10 bg-white/[0.04]"
                                        )}
                                    >
                                        <Icon className={cn("w-4 h-4 shrink-0", mod.activeColor)} />
                                        <span className="flex-1 min-w-0 truncate text-xs font-medium text-white/80">{mod.label}</span>
                                        <button
                                            type="button"
                                            onClick={() => moveModule(id, -1)}
                                            disabled={idx === 0}
                                            title="Subir"
                                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                        >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveModule(id, 1)}
                                            disabled={idx === editorOrder.length - 1}
                                            title="Bajar"
                                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                        >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleModuleHidden(id)}
                                            title={hidden ? "Mostrar" : "Ocultar"}
                                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                                        >
                                            {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col z-10 min-h-0">
                {/* Tab Navigation */}
                <div className="px-4 pt-3 pb-2 shrink-0">
                    <TabsList
                        className="grid w-full bg-black/30 h-12 md:h-14 p-1 rounded-2xl gap-1.5 border border-white/5"
                        style={{ gridTemplateColumns: `repeat(${Math.max(visibleModules.length, 1)}, minmax(0, 1fr))` }}
                    >
                        {visibleModules.map((mod) => (
                            <TabItem
                                key={mod.id}
                                value={mod.id}
                                icon={mod.icon}
                                label={mod.label}
                                activeColor={mod.activeColor}
                                bgColor={mod.bgColor}
                                borderColor={mod.borderColor}
                            />
                        ))}
                    </TabsList>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative min-h-0">
                    {visibleModules.map((mod) => {
                        const Content = mod.Content;
                        return (
                            <TabsContent
                                key={mod.id}
                                value={mod.id}
                                className={cn(
                                    "h-full m-0 overflow-y-auto overscroll-contain data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300",
                                    mod.id === "notif" ? "p-0" : "p-4 md:p-5"
                                )}
                            >
                                <Content />
                            </TabsContent>
                        );
                    })}

                    {/* Scroll Fade */}
                    <div className="absolute bottom-0 left-0 w-full h-14 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                </div>
            </Tabs>

            {/* Bottom Status Bar */}
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse shrink-0" />
                    <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider truncate">Sistema · En línea</span>
                </div>
                <span className="text-[9px] font-mono text-white/20 shrink-0">v0.1α</span>
            </div>
        </motion.div>
    );
}

function TabItem({ value, icon: Icon, label, activeColor, bgColor, borderColor }: {
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    activeColor: string;
    bgColor: string;
    borderColor: string;
}) {
    return (
        <TabsTrigger
            value={value}
            className={cn(
                "h-full w-full rounded-xl transition-all duration-300 bg-transparent hover:bg-white/5 border border-transparent flex flex-col items-center justify-center gap-0.5",
                `data-[state=active]:${bgColor} data-[state=active]:${borderColor} data-[state=active]:border`,
                `data-[state=active]:${activeColor} data-[state=active]:shadow-lg`
            )}
        >
            <Icon className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[8px] md:text-[9px] font-mono uppercase tracking-wider opacity-70">{label}</span>
        </TabsTrigger>
    );
}
