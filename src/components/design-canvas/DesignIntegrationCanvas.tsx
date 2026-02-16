"use client";

import React, { useState, useReducer, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    Wand2, Palette, Type, Component, Sparkles, LayoutGrid, ArrowLeft,
    Download, Settings2, Share2, Sidebar, Smartphone, Tablet, Undo2, X, ZoomIn, ZoomOut, Bot, Shapes, AppWindow, Image, Move, MoreHorizontal,
    Monitor, Eye, RotateCcw, Zap, Check, Layers, User, Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import { motion, AnimatePresence } from "framer-motion";


// Tabs
import { StitchGeneratorTab } from "./tabs/StitchGeneratorTab";

import { ColorPaletteTab } from "./tabs/ColorPaletteTab";

import { TypographyTab } from "./tabs/TypographyTab";
import { UIComponentsTab } from "./tabs/UIComponentsTab";
import { EffectsPhysicsTab } from "./tabs/EffectsPhysicsTab";
import { LayoutGeometryTab } from "./tabs/LayoutGeometryTab";
import { IconographyTab } from "./tabs/IconographyTab";
import { PositioningTab } from "./tabs/PositioningTab";
import { WidgetStyleTab } from "./tabs/WidgetStyleTab";
import { FiltersBackgroundsTab } from "./tabs/FiltersBackgroundsTab";
import { SecondaryElementsTab } from "./tabs/SecondaryElementsTab";
import { CanvasPreview } from "./CanvasPreview";
import { ExportPanel } from "./ExportPanel";
import { SettingsCommandCenter } from "./SettingsCommandCenter";
import { mapCanvasToAppearance, applyCanvasPalette } from "./canvas-to-appearance";
import { usePreviewSync } from "./hooks/usePreviewSync";
import { CanvasState, ElementFamily, defaultCanvasState } from "./state-types";

type CanvasAction =
    | { type: "SET_PALETTE"; payload: Partial<CanvasState["palette"]> }
    | { type: "SET_TYPOGRAPHY"; payload: Partial<CanvasState["typography"]> }
    | { type: "SET_COMPONENTS"; payload: Partial<CanvasState["components"]> }
    | { type: "SET_EFFECTS"; payload: Partial<CanvasState["effects"]> }
    | { type: "SET_ENVIRONMENT"; payload: Partial<CanvasState["environment"]> }
    | { type: "SET_GEOMETRY"; payload: Partial<CanvasState["geometry"]> }
    | { type: "SET_SHADOWS"; payload: Partial<CanvasState["shadows"]> }
    | { type: "SET_STITCH_CODE"; payload: { code: string; screenId?: string } }
    | { type: "SET_TRINITY"; payload: Partial<CanvasState["palette"]["trinity"]> }
    | { type: "SET_DIALOGS"; payload: Partial<CanvasState["dialogs"]> }
    | { type: "SET_TABS_CONFIG"; payload: Partial<CanvasState["tabsConfig"]> }
    | { type: "SET_TOGGLES"; payload: Partial<CanvasState["toggles"]> }
    | { type: "SET_AVATARS"; payload: Partial<CanvasState["avatars"]> }
    | { type: "SET_PROGRESS"; payload: Partial<CanvasState["progressBars"]> }
    | { type: "SET_TOASTS"; payload: Partial<CanvasState["toasts"]> }
    | { type: "SET_NAV"; payload: Partial<CanvasState["nav"]> }
    | { type: "SET_ICONOGRAPHY"; payload: Partial<CanvasState["iconography"]> }
    | { type: "SET_POSITIONING"; payload: Partial<CanvasState["positioning"]> }
    | { type: "SET_WIDGETS"; payload: Partial<CanvasState["widgets"]> }
    | { type: "SET_BACKGROUNDS"; payload: Partial<CanvasState["backgrounds"]> }
    | { type: "SET_SECONDARY"; payload: Partial<CanvasState["secondary"]> }
    | { type: "SET_AI_CONFIG"; payload: Partial<CanvasState["aiConfig"]> }
    | { type: "SET_LAYOUT_CONFIG"; payload: Partial<CanvasState["layoutConfig"]> }
    | { type: "SET_UI"; payload: Partial<CanvasState["ui"]> }
    | { type: "LOAD_STATE"; payload: CanvasState }
    | { type: "RESET" };

function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
    switch (action.type) {
        case "SET_PALETTE":
            return { ...state, palette: { ...state.palette, ...action.payload } };
        case "SET_TYPOGRAPHY":
            return { ...state, typography: { ...state.typography, ...action.payload } };
        case "SET_COMPONENTS":
            return { ...state, components: { ...state.components, ...action.payload } };
        case "SET_EFFECTS":
            return { ...state, effects: { ...state.effects, ...action.payload } };
        case "SET_ENVIRONMENT":
            return { ...state, environment: { ...state.environment, ...action.payload } };
        case "SET_GEOMETRY":
            return { ...state, geometry: { ...state.geometry, ...action.payload } };
        case "SET_SHADOWS":
            return { ...state, shadows: { ...state.shadows, ...action.payload } };
        case "SET_STITCH_CODE":
            return { ...state, stitchCode: action.payload.code, stitchScreenId: action.payload.screenId || "" };
        case "SET_TRINITY":
            return { ...state, palette: { ...state.palette, trinity: { ...state.palette.trinity, ...action.payload } } };
        case "SET_DIALOGS":
            return { ...state, dialogs: { ...state.dialogs, ...action.payload } };
        case "SET_TABS_CONFIG":
            return { ...state, tabsConfig: { ...state.tabsConfig, ...action.payload } };
        case "SET_TOGGLES":
            return { ...state, toggles: { ...state.toggles, ...action.payload } };
        case "SET_AVATARS":
            return { ...state, avatars: { ...state.avatars, ...action.payload } };
        case "SET_PROGRESS":
            return { ...state, progressBars: { ...state.progressBars, ...action.payload } };
        case "SET_TOASTS":
            return { ...state, toasts: { ...state.toasts, ...action.payload } };
        case "SET_NAV":
            return { ...state, nav: { ...state.nav, ...action.payload } };
        case "SET_ICONOGRAPHY":
            return { ...state, iconography: { ...state.iconography, ...action.payload } };
        case "SET_POSITIONING":
            return { ...state, positioning: { ...state.positioning, ...action.payload } };
        case "SET_WIDGETS":
            return { ...state, widgets: { ...state.widgets, ...action.payload } };
        case "SET_BACKGROUNDS":
            return { ...state, backgrounds: { ...state.backgrounds, ...action.payload } };
        case "SET_SECONDARY":
            return { ...state, secondary: { ...state.secondary, ...action.payload } };
        case "SET_AI_CONFIG":
            return { ...state, aiConfig: { ...state.aiConfig, ...action.payload } };
        case "SET_LAYOUT_CONFIG":
            return { ...state, layoutConfig: { ...state.layoutConfig, ...action.payload } };
        case "SET_UI":
            return { ...state, ui: { ...state.ui, ...action.payload } };
        case "LOAD_STATE":
            return { ...action.payload };
        case "RESET":
            return { ...defaultCanvasState };
        default:
            return state;
    }
}

// ─── Main Component ──────────────────────────────────────────────
export function DesignIntegrationCanvas() {
    const router = useRouter();
    const [state, dispatch] = useReducer(canvasReducer, defaultCanvasState);
    const [activeTab, setActiveTab] = useState("generative");
    const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile" | "tablet">("desktop");
    const [showExport, setShowExport] = useState(false);
    const [quickApplied, setQuickApplied] = useState(false);
    const [integrated, setIntegrated] = useState(false);
    const [selectedElement, setSelectedElement] = useState<ElementFamily>(null);
    const { updateConfig, saveTheme } = useAppearance();



    const settingsRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    // ─── Auto-Save / Persistence ─────────────────────────────────────
    const STORAGE_KEY = "starseed-canvas-autosave";

    // Load on Mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                dispatch({ type: "LOAD_STATE", payload: parsed });
            } catch (e) {
                console.error("Failed to parse auto-saved canvas state", e);
            }
        }
    }, []);

    // Save on Change (Debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }, 1000);
        return () => clearTimeout(timer);
    }, [state]);

    // ─── Global Toast Logic ───
    const [showGlobalToast, setShowGlobalToast] = useState(false);
    useEffect(() => {
        if (state.toasts.lastTrigger > 0) {
            setShowGlobalToast(true);
            const timer = setTimeout(() => setShowGlobalToast(false), state.toasts.duration);
            return () => clearTimeout(timer);
        }
    }, [state.toasts.lastTrigger, state.toasts.duration]);

    const deviceWidths = { desktop: "100%", mobile: "390px", tablet: "768px" };

    // Map certain preview families to their corresponding tabs
    const familyToTab: Record<string, string> = {
        palette: "colors",
        typography: "typography",
        effects: "effects",
        geometry: "layout",
        iconography: "iconography",
        widgets: "widgets",
        backgrounds: "backgrounds",
        positioning: "positioning",
        secondary: "secondary",
        layouts: "components",
        buttons: "components",
        inputs: "components",
        cards: "components",
        tooltips: "components",
        badges: "components",
        "liquid-examples": "effects",
    };

    // When an element is selected in the preview, switch to the right tab and scroll to it
    const handleSelectElement = useCallback((family: ElementFamily) => {
        setSelectedElement(family);
        if (family) {
            const tab = familyToTab[family] || "components";
            setActiveTab(tab);
            // Scroll to the section in the settings panel after tab switch
            if (tab === "components" || tab === "effects" || tab === "widgets" || tab === "iconography") {
                setTimeout(() => {
                    const el = document.getElementById(`family-${family}`);
                    if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                        // Add highlight effect
                        el.classList.add("ring-2", "ring-cyan-500", "ring-offset-2", "ring-offset-black");
                        setTimeout(() => el.classList.remove("ring-2", "ring-cyan-500", "ring-offset-2", "ring-offset-black"), 2000);
                    }
                }, 150);
            }
        }
    }, []);

    // Auto-scroll preview panel when the active tab changes
    const tabToPreviewId: Record<string, string> = {
        colors: "family-wrapper-palette",
        typography: "family-wrapper-typography",
        effects: "family-wrapper-effects",
        layout: "family-wrapper-geometry",
        iconography: "family-wrapper-iconography",
        secondary: "family-wrapper-secondary",
        widgets: "family-wrapper-widgets",
        components: "family-wrapper-buttons", // Default to buttons for components tab
        backgrounds: "preview-environment",
        layouts: "family-wrapper-layouts",
        positioning: "grid-system-overlay", // Approximate
    };

    // Hook for preview synchronization
    const { scrollToPreview } = usePreviewSync();

    useEffect(() => {
        const targetId = tabToPreviewId[activeTab];
        if (targetId) {
            // slightly delay scroll to ensure DOM is ready
            setTimeout(() => {
                scrollToPreview(targetId);
            }, 100);
        }
    }, [activeTab, scrollToPreview]);

    // Keyboard Shortcuts (Cmd+K for Settings)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                dispatch({ type: "SET_UI", payload: { settingsOpen: !state.ui.settingsOpen } });
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [state.ui.settingsOpen]);

    // Real-time CSS Variable Sync for Live Preview
    useEffect(() => {
        requestAnimationFrame(() => {
            applyCanvasPalette(state);
        });
    }, [state]);

    const handleApplyToContext = useCallback((mapped: Record<string, any>) => {
        updateConfig(mapped);
    }, [updateConfig]);

    const handleSaveTheme = useCallback((name: string, config: Record<string, any>) => {
        saveTheme(name);
    }, [saveTheme]);

    // Enhanced Tab Switching
    const handleTabChange = useCallback((value: string) => {
        setActiveTab(value);
    }, [setActiveTab]);


    // Quick Apply — immediate push to AppearanceProvider
    const handleQuickApply = useCallback(() => {
        const mapped = mapCanvasToAppearance(state);
        applyCanvasPalette(state);
        updateConfig(mapped);
        setQuickApplied(true);
        setTimeout(() => setQuickApplied(false), 2500);
    }, [state, updateConfig]);

    // Integrate to System — apply + save to library
    const handleIntegrate = useCallback(() => {
        const mapped = mapCanvasToAppearance(state);
        applyCanvasPalette(state);
        updateConfig(mapped);

        const saved = JSON.parse(localStorage.getItem("starseed-saved-themes") || "[]");
        const themeEntry = {
            id: `theme_${Date.now()}`,
            name: `Tema ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}`,
            date: new Date().toISOString(),
            canvasState: state,
            appearanceConfig: mapped,
        };
        saved.push(themeEntry);
        localStorage.setItem("starseed-saved-themes", JSON.stringify(saved));

        saveTheme(themeEntry.name);
        setIntegrated(true);
        setTimeout(() => setIntegrated(false), 3000);
        saveTheme(themeEntry.name);
        setIntegrated(true);
        setTimeout(() => setIntegrated(false), 3000);
    }, [state, updateConfig, saveTheme]);

    // Handle selection from Command Center
    const handleSettingsSelect = useCallback((tab: string, sectionId?: string) => {
        dispatch({ type: "SET_UI", payload: { settingsOpen: false } });
        if (tab) setActiveTab(tab);

        if (sectionId) {
            // Highlight specific control
            dispatch({ type: "SET_UI", payload: { activeHighlight: sectionId } });

            // Scroll to specific setting
            setTimeout(() => {
                const el = document.getElementById(sectionId);
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("ring-2", "ring-cyan-500", "ring-offset-2", "ring-offset-black");
                    setTimeout(() => el.classList.remove("ring-2", "ring-cyan-500", "ring-offset-2", "ring-offset-black"), 2000);
                }
            }, 300);

            // Clear highlight after 2 seconds
            setTimeout(() => {
                dispatch({ type: "SET_UI", payload: { activeHighlight: null } });
            }, 2000);
        }
    }, []);

    const tabs = [
        { id: "generative", label: "AI Studio", icon: Bot, color: "text-cyan-400" },

        { id: "colors", label: "Colores", icon: Palette, color: "text-purple-400" },
        { id: "typography", label: "Tipografía", icon: Type, color: "text-emerald-400" },
        { id: "components", label: "Componentes", icon: Component, color: "text-amber-400" },
        { id: "effects", label: "Efectos", icon: Sparkles, color: "text-rose-400" },
        { id: "layout", label: "Geometría", icon: LayoutGrid, color: "text-blue-400" },
        { id: "iconography", label: "Iconografía", icon: Shapes, color: "text-pink-400" },
        { id: "positioning", label: "Posición", icon: Move, color: "text-indigo-400" },
        { id: "widgets", label: "Widgets", icon: AppWindow, color: "text-teal-400" },
        { id: "backgrounds", label: "Filtros", icon: Image, color: "text-fuchsia-400" },
        { id: "secondary", label: "Secundarios", icon: MoreHorizontal, color: "text-slate-400" },
    ];

    return (
        <div className="flex flex-col h-screen">
            {/* ── Header ── */}
            <header className="flex-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl z-10">
                <div>
                    <h1 className="text-2xl font-bold font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-400">
                        Lienzo de Integración de Diseños UI
                    </h1>
                    <p className="text-white/40 text-sm mt-1">
                        Design Integration Canvas — Stitch MCP × StarSeed Network
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Device Toggle */}
                    <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
                        {([
                            { id: "desktop" as const, icon: Monitor },
                            { id: "tablet" as const, icon: Tablet },
                            { id: "mobile" as const, icon: Smartphone },
                        ]).map(d => (
                            <button
                                key={d.id}
                                onClick={() => setPreviewDevice(d.id)}
                                className={cn(
                                    "p-2 rounded-full transition-all",
                                    previewDevice === d.id
                                        ? "bg-purple-500/30 text-purple-300"
                                        : "text-white/30 hover:text-white/60"
                                )}
                            >
                                <d.icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 text-white/60"
                        onClick={() => router.push("/settings/appearance")}>
                        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Ajustes
                    </Button>

                    <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 text-white/60"
                        onClick={() => {
                            localStorage.removeItem("starseed-canvas-autosave");
                            dispatch({ type: "RESET" });
                        }}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
                    </Button>

                    <Button size="sm" onClick={handleQuickApply}
                        className={cn("border-0 text-white transition-all",
                            quickApplied ? "bg-gradient-to-r from-green-500 to-emerald-500"
                                : "bg-gradient-to-r from-amber-500/80 to-orange-500/80 hover:from-amber-500 hover:to-orange-500")}>
                        {quickApplied ? (<><Check className="w-3.5 h-3.5 mr-1.5" /> Aplicado</>) : (<><Zap className="w-3.5 h-3.5 mr-1.5" /> Aplicar</>)}
                    </Button>

                    <Button size="sm" onClick={handleIntegrate}
                        className={cn("border-0 text-white transition-all",
                            integrated ? "bg-gradient-to-r from-green-500 to-emerald-500"
                                : "bg-gradient-to-r from-purple-500/80 to-pink-500/80 hover:from-purple-500 hover:to-pink-500")}>
                        {integrated ? (<><Check className="w-3.5 h-3.5 mr-1.5" /> Integrado</>) : (<><Layers className="w-3.5 h-3.5 mr-1.5" /> Integrar</>)}
                    </Button>

                    <Button size="sm" className="bg-gradient-to-r from-cyan-500/80 to-purple-500/80 hover:from-cyan-500 hover:to-purple-500 text-white border-0"
                        onClick={() => setShowExport(!showExport)}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar
                    </Button>
                </div>
            </header>

            {/* ── Export Panel (Conditional) ── */}
            {showExport && (
                <ExportPanel
                    state={state}
                    onClose={() => setShowExport(false)}
                    onApplyToContext={handleApplyToContext}
                    onSaveTheme={handleSaveTheme}
                    onImport={(loadedState) => {
                        dispatch({ type: "LOAD_STATE", payload: loadedState });
                        setShowExport(false);
                    }}
                />
            )}

            {/* ── Main Content Area ── */}
            <main className="flex-1 flex overflow-hidden">
                {/* Left Panel: Settings / Controls */}
                <div className="w-[380px] flex-none bg-black/20 backdrop-blur-xl border-r border-white/5 flex flex-col z-20">
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
                        <div className="px-4 pt-4 pb-2 border-b border-white/5 bg-black/20 shadow-lg z-10">
                            {/* Command Center Search Trigger */}
                            <div className="relative mb-2 group">
                                <div className="absolute inset-0 bg-cyan-500/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity blur-lg pointer-events-none" />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 group-hover:text-cyan-400 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Buscar ajuste..."
                                    className="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 pl-9 pr-8 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:bg-black/60 transition-all cursor-pointer hover:border-white/20"
                                    readOnly
                                    onClick={() => dispatch({ type: "SET_UI", payload: { settingsOpen: true } })}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 pointer-events-none">
                                    <kbd className="h-4 px-1 flex items-center justify-center rounded bg-white/5 border border-white/10 text-[9px] font-mono text-white/30">⌘K</kbd>
                                </div>
                            </div>

                            <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-transparent mt-3 p-0 mb-1">
                                {tabs.map(tab => (
                                    <TabsTrigger
                                        key={tab.id}
                                        value={tab.id}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-300",
                                            activeTab === tab.id
                                                ? "bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] backdrop-blur-md"
                                                : "bg-transparent border-transparent text-white/40 hover:text-white/90 hover:bg-white/5 hover:border-white/5"
                                        )}
                                    >
                                        <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.id ? tab.color : "opacity-50")} />
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/10">
                            <TabsContent value="generative" className="h-full mt-0 p-0">
                                <StitchGeneratorTab dispatch={dispatch} state={state} />
                            </TabsContent>

                            <TabsContent value="colors" className="h-full mt-0 p-0">
                                <ColorPaletteTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="typography" className="h-full mt-0 p-0">
                                <TypographyTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="components" className="h-full mt-0 p-0">
                                <UIComponentsTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="effects" className="h-full mt-0 p-0">
                                <EffectsPhysicsTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="layout" className="h-full mt-0 p-0">
                                <LayoutGeometryTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="iconography" className="h-full mt-0 p-0">
                                <IconographyTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="positioning" className="h-full mt-0 p-0">
                                <PositioningTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="widgets" className="h-full mt-0 p-0">
                                <WidgetStyleTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="backgrounds" className="h-full mt-0 p-0">
                                <FiltersBackgroundsTab dispatch={dispatch} state={state} />
                            </TabsContent>
                            <TabsContent value="secondary" className="h-full mt-0 p-0">
                                <SecondaryElementsTab dispatch={dispatch} state={state} />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                <div
                    id="canvas-preview-container"
                    className="flex-1 overflow-y-auto custom-scrollbar transition-all duration-500 ease-out"
                    style={{ width: deviceWidths[previewDevice], maxWidth: "100%" }}
                >
                    <CanvasPreview
                        state={state}
                        device={previewDevice}
                        selectedElement={selectedElement}
                        onSelectElement={handleSelectElement}
                        onClose={() => { }}
                        onApplyToContext={handleApplyToContext}
                        onSaveTheme={handleSaveTheme}
                        onImport={(loadedState) => dispatch({ type: "LOAD_STATE", payload: loadedState })}
                    />
                </div>
            </main>

            {/* ── Global Notification Portal ── */}
            <AnimatePresence>
                {showGlobalToast && (
                    <div className={cn(
                        "fixed z-[100] pointer-events-none flex p-8",
                        state.toasts.position === "top-right" && "top-0 right-0 items-start justify-end",
                        state.toasts.position === "top-center" && "top-0 left-0 right-0 items-start justify-center",
                        state.toasts.position === "bottom-right" && "bottom-0 right-0 items-end justify-end",
                        state.toasts.position === "bottom-center" && "bottom-0 left-0 right-0 items-end justify-center",
                    )}>
                        <motion.div
                            initial={
                                state.toasts.style === "blast"
                                    ? { scale: 0, rotate: 45, opacity: 0 }
                                    : { opacity: 0, y: state.toasts.position.includes("top") ? -40 : 40, scale: 0.9 }
                            }
                            animate={
                                state.toasts.style === "blast"
                                    ? { scale: 1, rotate: 0, opacity: 1, transition: { type: "spring", damping: 12 } }
                                    : { opacity: 1, y: 0, scale: 1 }
                            }
                            exit={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
                            className={cn(
                                "pointer-events-auto min-w-[320px] max-w-[400px] flex items-center gap-4 p-5 rounded-2xl shadow-2xl relative overflow-hidden",
                                state.toasts.style === "glass" && "backdrop-blur-2xl bg-white/10 border border-white/20",
                                state.toasts.style === "solid" && "bg-zinc-900 border border-zinc-800",
                                state.toasts.style === "minimal" && "bg-black/80 backdrop-blur-md border-l-4",
                                state.toasts.style === "neon" && "bg-black/60 backdrop-blur-xl border-2 shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]",
                                state.toasts.style === "cyber" && "bg-black border-2 rounded-none",
                                state.toasts.style === "blast" && "bg-gradient-to-br from-primary to-secondary text-white shadow-[0_0_50px_rgba(var(--primary-rgb),0.5)]"
                            )}
                            style={{
                                borderLeftColor: state.toasts.style === "minimal" ? state.palette.primary : undefined,
                                borderColor: (state.toasts.style === "neon" || state.toasts.style === "cyber") ? state.palette.primary : undefined,
                                clipPath: state.toasts.style === "cyber" ? "polygon(0% 0%, 95% 0%, 100% 15%, 100% 100%, 5% 100%, 0% 85%)" : undefined,
                                boxShadow: state.toasts.style === "neon" ? `0 0 40px ${state.palette.primary}44` : undefined,
                            } as any}
                        >
                            {/* Cyber Background Lines */}
                            {state.toasts.style === "cyber" && (
                                <div className="absolute inset-0 opacity-10 pointer-events-none">
                                    <div className="absolute inset-x-0 top-0 h-px bg-white animate-scanline" />
                                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.05)_50%,transparent_100%)]" />
                                </div>
                            )}

                            {/* Neon Glow Overlay */}
                            {state.toasts.style === "neon" && (
                                <div className="absolute inset-0 bg-primary/5 animate-pulse-slow" />
                            )}

                            <div className={cn(
                                "p-2.5 rounded-xl flex-none",
                                state.toasts.style === "blast" ? "bg-white/20" : "bg-primary/20"
                            )}>
                                <Sparkles className={cn("w-5 h-5", state.toasts.style === "blast" ? "text-white" : "text-primary")} />
                            </div>

                            <div className="flex-1 space-y-1">
                                <h4 className={cn(
                                    "text-sm font-bold uppercase tracking-wider",
                                    state.toasts.style === "cyber" && "font-mono"
                                )}>
                                    Ajuste Aplicado
                                </h4>
                                <p className={cn(
                                    "text-xs opacity-70 leading-relaxed",
                                    state.toasts.style === "neon" && "text-primary/90"
                                )}>
                                    El sistema ha sincronizado los cambios estéticos del lienzo con éxito.
                                </p>
                            </div>

                            <button
                                onClick={() => setShowGlobalToast(false)}
                                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <X className="w-4 h-4 opacity-40 hover:opacity-100" />
                            </button>

                            {/* Progress bar timer */}
                            <motion.div
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: state.toasts.duration / 1000, ease: "linear" }}
                                className="absolute bottom-0 left-0 h-1 bg-primary/40"
                                style={{ background: state.toasts.style === "blast" ? "rgba(255,255,255,0.4)" : undefined }}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Settings Command Center ── */}
            <SettingsCommandCenter
                open={state.ui.settingsOpen}
                onOpenChange={(open) => dispatch({ type: "SET_UI", payload: { settingsOpen: open } })}
                onSelect={handleSettingsSelect}
            />
        </div>
    );
}
