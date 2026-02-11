"use client";

import React, { useState, useReducer, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    Wand2, Palette, Type, Component, Sparkles, LayoutGrid,
    Download, RotateCcw, Eye, Monitor, Smartphone, Tablet,
    ArrowLeft, Layers, Zap, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

// Tabs
import { StitchGeneratorTab } from "./tabs/StitchGeneratorTab";
import { ColorPaletteTab } from "./tabs/ColorPaletteTab";
import { TypographyTab } from "./tabs/TypographyTab";
import { UIComponentsTab } from "./tabs/UIComponentsTab";
import { EffectsPhysicsTab } from "./tabs/EffectsPhysicsTab";
import { LayoutGeometryTab } from "./tabs/LayoutGeometryTab";
import { CanvasPreview } from "./CanvasPreview";
import { ExportPanel } from "./ExportPanel";
import { mapCanvasToAppearance, applyCanvasPalette } from "./canvas-to-appearance";

// ─── Element Family Type ─────────────────────────────────────────
export type ElementFamily =
    | "buttons" | "cards" | "inputs" | "dialogs" | "tooltips"
    | "badges" | "tabs" | "toggles" | "avatars" | "progress"
    | "toasts" | "navigation" | null;

// ─── Canvas State ────────────────────────────────────────────────
export interface CanvasState {
    palette: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        surface: string;
        textPrimary: string;
        textSecondary: string;
        glassBorder: string;
        trinity: {
            zenith: { active: string; glow: string };
            horizonte: { active: string; panel: string };
            logica: { active: string; panel: string };
            base: { active: string; neutral: string };
        };
    };
    typography: {
        fontMain: string;
        fontHeadline: string;
        fontCode: string;
        baseSize: number;
        scaleRatio: number;
        headerWeight: number;
        bodyWeight: number;
        headerTracking: number;
        bodyTracking: number;
    };
    components: {
        buttonStyle: "default" | "glass" | "liquid" | "neon" | "brutal";
        buttonRadius: number;
        buttonGlow: boolean;
        cardPreset: "crystal" | "liquid-action" | "holographic" | "hyper-crystal";
        inputBorderStyle: "none" | "subtle" | "solid" | "glow";
        inputFloatingLabel: boolean;
        animateHover: boolean;
        animateClick: boolean;
        microInteractions: boolean;
        transitionSpeed: number;
        tooltipStyle: "glass" | "solid" | "minimal";
        badgeStyle: "pill" | "square" | "dot";
        focusRingColor: string;
    };
    effects: {
        backdropBlur: number;
        glassSaturation: number;
        glowIntensity: number;
        noiseOpacity: number;
        refractionIndex: number;
        chromaticAberration: number;
        displacementScale: number;
        blurAmount: number;
        elasticity: number;
        scanlineOpacity: number;
        textDiffusionBlur: number;
        textDiffusionGlow: number;
        textDiffusionOpacity: number;
        liquidGlassUI: boolean;
        parallaxDepth: number;
        gradientAngle: number;
        shadowPreset: "soft" | "medium" | "dramatic";
    };
    geometry: {
        radiusSm: number;
        radiusMd: number;
        radiusLg: number;
        radiusXl: number;
        radiusPill: number;
        goldenRatio: number;
        dockMargin: number;
        dockMagnification: number;
        dockIconSize: number;
        windowTitleBarHeight: number;
        tabCurvature: number;
        panelBlur: number;
        spacingScale: number;
        contentMaxWidth: number;
        gridColumns: number;
    };
    shadows: {
        sm: string;
        md: string;
        lg: string;
        glowPrimary: string;
    };
    // ─── New Element Families ────────────────────────────────────
    dialogs: {
        overlayOpacity: number;
        overlayBlur: number;
        animation: "fade" | "scale" | "slide";
        closeButtonStyle: "x" | "pill" | "icon";
    };
    tabsConfig: {
        style: "underline" | "pill" | "box";
        activeColor: string;
        spacing: number;
    };
    toggles: {
        switchTrackColor: string;
        checkboxStyle: "round" | "square";
        radioSize: number;
    };
    avatars: {
        shape: "circle" | "rounded" | "square";
        sizeScale: number;
        statusDotPosition: "top-right" | "bottom-right";
    };
    progressBars: {
        height: number;
        colorScheme: "primary" | "gradient" | "rainbow";
        animated: boolean;
    };
    toasts: {
        position: "top-right" | "top-center" | "bottom-right" | "bottom-center";
        duration: number;
        style: "glass" | "solid" | "minimal";
    };
    nav: {
        dockStyle: "floating" | "attached" | "minimal";
        breadcrumbSeparator: "slash" | "arrow" | "dot";
        menuItemPadding: number;
    };
    // Stitch-generated code
    stitchCode: string;
    stitchScreenId: string;
}

const defaultCanvasState: CanvasState = {
    palette: {
        primary: "#8B5CF6",
        secondary: "#A78BFA",
        accent: "#FBBF24",
        background: "#0F0F23",
        surface: "rgba(15, 15, 35, 0.65)",
        textPrimary: "#F8FAFC",
        textSecondary: "rgba(248, 250, 252, 0.7)",
        glassBorder: "rgba(255, 255, 255, 0.12)",
        trinity: {
            zenith: { active: "#007FFF", glow: "rgba(0, 127, 255, 0.5)" },
            horizonte: { active: "#39FF14", panel: "#10B981" },
            logica: { active: "#FFBF00", panel: "#D4AF37" },
            base: { active: "#DC143C", neutral: "#F8F9FA" },
        },
    },
    typography: {
        fontMain: "Inter",
        fontHeadline: "Rajdhani",
        fontCode: "JetBrains Mono",
        baseSize: 16,
        scaleRatio: 1.618,
        headerWeight: 300,
        bodyWeight: 400,
        headerTracking: 0.05,
        bodyTracking: 0.01,
    },
    components: {
        buttonStyle: "glass",
        buttonRadius: 9999,
        buttonGlow: true,
        cardPreset: "crystal",
        inputBorderStyle: "subtle",
        inputFloatingLabel: true,
        animateHover: true,
        animateClick: true,
        microInteractions: true,
        transitionSpeed: 200,
        tooltipStyle: "glass",
        badgeStyle: "pill",
        focusRingColor: "#8B5CF6",
    },
    effects: {
        backdropBlur: 16,
        glassSaturation: 180,
        glowIntensity: 0.8,
        noiseOpacity: 0.03,
        refractionIndex: 1.52,
        chromaticAberration: 2.0,
        displacementScale: 100,
        blurAmount: 0.5,
        elasticity: 0.35,
        scanlineOpacity: 0.03,
        textDiffusionBlur: 0,
        textDiffusionGlow: 0.5,
        textDiffusionOpacity: 0.7,
        liquidGlassUI: true,
        parallaxDepth: 0.3,
        gradientAngle: 135,
        shadowPreset: "medium",
    },
    geometry: {
        radiusSm: 4,
        radiusMd: 12,
        radiusLg: 24,
        radiusXl: 42,
        radiusPill: 9999,
        goldenRatio: 1.618,
        dockMargin: 16,
        dockMagnification: 1.35,
        dockIconSize: 24,
        windowTitleBarHeight: 44,
        tabCurvature: 16,
        panelBlur: 20,
        spacingScale: 1,
        contentMaxWidth: 1280,
        gridColumns: 3,
    },
    shadows: {
        sm: "0 1px 3px rgba(0,0,0,0.2)",
        md: "0 4px 12px rgba(0,0,0,0.25)",
        lg: "0 8px 32px rgba(0,0,0,0.3)",
        glowPrimary: "0 0 20px rgba(139,92,246,0.4)",
    },
    // ─── New Element Family Defaults ─────────────────────────────
    dialogs: {
        overlayOpacity: 0.6,
        overlayBlur: 8,
        animation: "scale",
        closeButtonStyle: "x",
    },
    tabsConfig: {
        style: "pill",
        activeColor: "#8B5CF6",
        spacing: 4,
    },
    toggles: {
        switchTrackColor: "#8B5CF6",
        checkboxStyle: "round",
        radioSize: 16,
    },
    avatars: {
        shape: "circle",
        sizeScale: 1,
        statusDotPosition: "bottom-right",
    },
    progressBars: {
        height: 6,
        colorScheme: "primary",
        animated: true,
    },
    toasts: {
        position: "bottom-right",
        duration: 4000,
        style: "glass",
    },
    nav: {
        dockStyle: "floating",
        breadcrumbSeparator: "slash",
        menuItemPadding: 8,
    },
    stitchCode: "",
    stitchScreenId: "",
};

type CanvasAction =
    | { type: "SET_PALETTE"; payload: Partial<CanvasState["palette"]> }
    | { type: "SET_TYPOGRAPHY"; payload: Partial<CanvasState["typography"]> }
    | { type: "SET_COMPONENTS"; payload: Partial<CanvasState["components"]> }
    | { type: "SET_EFFECTS"; payload: Partial<CanvasState["effects"]> }
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
    const [activeTab, setActiveTab] = useState("stitch");
    const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile" | "tablet">("desktop");
    const [showExport, setShowExport] = useState(false);
    const [quickApplied, setQuickApplied] = useState(false);
    const [integrated, setIntegrated] = useState(false);
    const [selectedElement, setSelectedElement] = useState<ElementFamily>(null);
    const { updateConfig, saveTheme } = useAppearance();
    const settingsRef = useRef<HTMLDivElement>(null);

    const deviceWidths = { desktop: "100%", mobile: "390px", tablet: "768px" };

    // When an element is selected in the preview, switch to components tab and scroll to it
    const handleSelectElement = useCallback((family: ElementFamily) => {
        setSelectedElement(family);
        if (family) {
            setActiveTab("components");
            // Scroll to the section after tab switch
            setTimeout(() => {
                const el = document.getElementById(`family-${family}`);
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }, 150);
        }
    }, []);

    const handleApplyToContext = useCallback((mapped: Record<string, any>) => {
        updateConfig(mapped);
    }, [updateConfig]);

    const handleSaveTheme = useCallback((name: string, config: Record<string, any>) => {
        saveTheme(name);
    }, [saveTheme]);

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
    }, [state, updateConfig, saveTheme]);

    const tabs = [
        { id: "stitch", label: "Stitch AI", icon: Wand2, color: "text-cyan-400" },
        { id: "colors", label: "Colores", icon: Palette, color: "text-purple-400" },
        { id: "typography", label: "Tipografía", icon: Type, color: "text-emerald-400" },
        { id: "components", label: "Componentes", icon: Component, color: "text-amber-400" },
        { id: "effects", label: "Efectos", icon: Sparkles, color: "text-rose-400" },
        { id: "layout", label: "Geometría", icon: LayoutGrid, color: "text-blue-400" },
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
                        onClick={() => dispatch({ type: "RESET" })}>
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
                />
            )}

            {/* ── Body: Tabs + Sticky Preview ── */}
            <div className="flex flex-1 min-h-0">
                {/* Left: Controls — scrolls independently */}
                <div className="w-full lg:w-[55%] flex flex-col border-r border-white/5 overflow-hidden bg-slate-950/80 backdrop-blur-2xl">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
                        <TabsList className="flex-none flex flex-wrap justify-start gap-1 px-4 pt-4 pb-2 bg-transparent h-auto border-b border-white/5">
                            {tabs.map(tab => (
                                <TabsTrigger
                                    key={tab.id}
                                    value={tab.id}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all",
                                        "data-[state=active]:bg-white/10 data-[state=active]:shadow-lg",
                                        "hover:bg-white/5"
                                    )}
                                >
                                    <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.id ? tab.color : "text-white/40")} />
                                    <span className={activeTab === tab.id ? "text-white" : "text-white/50"}>{tab.label}</span>
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        <div ref={settingsRef} className="flex-1 overflow-y-auto p-4">
                            <TabsContent value="stitch" className="mt-0 h-full">
                                <StitchGeneratorTab state={state} dispatch={dispatch} />
                            </TabsContent>
                            <TabsContent value="colors" className="mt-0">
                                <ColorPaletteTab state={state} dispatch={dispatch} />
                            </TabsContent>
                            <TabsContent value="typography" className="mt-0">
                                <TypographyTab state={state} dispatch={dispatch} />
                            </TabsContent>
                            <TabsContent value="components" className="mt-0">
                                <UIComponentsTab state={state} dispatch={dispatch} selectedElement={selectedElement} />
                            </TabsContent>
                            <TabsContent value="effects" className="mt-0">
                                <EffectsPhysicsTab state={state} dispatch={dispatch} />
                            </TabsContent>
                            <TabsContent value="layout" className="mt-0">
                                <LayoutGeometryTab state={state} dispatch={dispatch} />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Right: Sticky Live Preview with independent scroll */}
                <div className="hidden lg:flex w-[45%] flex-col bg-black/30 sticky top-0 h-screen">
                    <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
                        <div className="flex items-center gap-2 text-white/50 text-xs">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Vista Previa — {previewDevice === "desktop" ? "Escritorio" : previewDevice === "tablet" ? "Tablet" : "Móvil"}</span>
                            {selectedElement && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px]">
                                    {selectedElement}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex justify-center">
                        <div
                            className="transition-all duration-500 ease-out"
                            style={{ width: deviceWidths[previewDevice], maxWidth: "100%" }}
                        >
                            <CanvasPreview
                                state={state}
                                device={previewDevice}
                                selectedElement={selectedElement}
                                onSelectElement={handleSelectElement}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
