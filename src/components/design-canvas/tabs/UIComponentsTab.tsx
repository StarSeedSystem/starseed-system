"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Component, Zap, Type, MessageSquare, Shield,
    ToggleLeft, Users, BarChart3, Bell, Navigation, Layers, PanelTop,
    SeparatorHorizontal, Palette, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState, ElementFamily } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import { SettingControl } from "../controls/SettingControl";
import { SectionHeader, FamilySection } from "../controls/ControlGroups";
import { OptionChips } from "../controls/OptionChips";
import { Toggle } from "../controls/Toggle";
import { Slider } from "../controls/Slider";
import { StitchCheckbox } from "../../stitch/StitchCheckbox";
import { StitchRadio } from "../../stitch/StitchRadio";

interface Props {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
    selectedElement?: ElementFamily;
}

// ─── Presets ──────────────────────────────────────────────────
const BUTTON_STYLES: { id: CanvasState["components"]["buttonStyle"]; label: string; desc: string; cls: string }[] = [
    { id: "glass", label: "Crystal Glass", desc: "Frosted blur", cls: "bg-white/10 backdrop-blur-md border border-white/20" },
    { id: "liquid", label: "Liquid", desc: "Morphing refraction", cls: "bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-lg border border-white/15" },
    { id: "neon", label: "Neon Glow", desc: "Electric borders", cls: "bg-transparent border-2 border-cyan-400 shadow-[0_0_15px_rgba(0,212,255,0.3)]" },
    { id: "brutal", label: "Brutal", desc: "Hard shadows", cls: "bg-white text-black shadow-[4px_4px_0_rgba(0,0,0,1)] border-2 border-black" },
];



const INPUT_BORDERS: { id: CanvasState["components"]["inputBorderStyle"]; label: string; desc: string; cls: string }[] = [
    { id: "default", label: "Standard", desc: "Sólido minimalista", cls: "bg-white/5 border border-white/20 rounded-md" },
    { id: "glass", label: "Crystal Glass", desc: "Borde refractivo frosted", cls: "bg-white/5 backdrop-blur-sm border border-white/15 rounded-md" },
    { id: "liquid", label: "Liquid Action", desc: "Entrada enfocada en energía", cls: "bg-gradient-to-r from-cyan-500/15 to-purple-500/15 border border-cyan-400/30 rounded-md" },
    { id: "neon", label: "Neon Pulse", desc: "Bordes eléctricos brillantes", cls: "bg-transparent border-2 border-cyan-400/60 shadow-[0_0_8px_rgba(0,212,255,0.3)] rounded-md" },
    { id: "brutal", label: "Brutalism", desc: "Geometría de alto contraste", cls: "bg-white/10 border-2 border-white/40 shadow-[2px_2px_0_rgba(255,255,255,0.2)] rounded-none" },
];

const TOOLTIP_STYLES: { id: CanvasState["components"]["tooltipStyle"]; label: string; desc: string }[] = [
    { id: "glass", label: "Glass", desc: "Frosted translúcido" },
    { id: "solid", label: "Sólido", desc: "Fondo opaco" },
    { id: "minimal", label: "Minimal", desc: "Solo texto" },
];

const BADGE_STYLES: { id: CanvasState["components"]["badgeStyle"]; label: string }[] = [
    { id: "pill", label: "Pill" }, { id: "square", label: "Cuadrado" }, { id: "dot", label: "Dot" },
];

const WINDOW_STYLES: { id: CanvasState["layoutConfig"]["windowStyle"]; label: string; desc: string }[] = [
    { id: "standard", label: "Standard", desc: "Classic window with title bar" },
    { id: "cyber", label: "Cyber", desc: "Angular, sci-fi aesthetic" },
    { id: "floating", label: "Floating", desc: "Border-less, ethereal feel" },
];

const FRAME_TYPES: { id: CanvasState["layoutConfig"]["frameType"]; label: string; desc: string }[] = [
    { id: "minimal", label: "Minimal", desc: "Thin 1px border" },
    { id: "thick", label: "Thick", desc: "Bold, industrial scale" },
    { id: "glass", label: "Glass", desc: "Soft refractive borders" },
];

// ─── Shared Controls are imported from ../controls/ ─────────

// ─── Main ────────────────────────────────────────────────────
export function UIComponentsTab({ state, dispatch, selectedElement }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    // Generic update for 'components' state
    const update = (p: Partial<CanvasState["components"]>, family?: string) => {
        dispatch({ type: "SET_COMPONENTS", payload: p });
        if (family) scrollToPreview(`family-wrapper-${family}`);
    };

    // Specific updaters with scroll sync
    const updateTabs = (p: Partial<CanvasState["tabsConfig"]>) => {
        dispatch({ type: "SET_TABS_CONFIG", payload: p });
        scrollToPreview('family-wrapper-tabs');
    };

    const updateToggles = (p: Partial<CanvasState["toggles"]>) => {
        dispatch({ type: "SET_TOGGLES", payload: p });
        scrollToPreview('family-wrapper-toggles');
    };

    const updateDialogs = (p: Partial<CanvasState["dialogs"]>) => {
        dispatch({ type: "SET_DIALOGS", payload: p });
        scrollToPreview('family-wrapper-dialogs');
    };

    const updateAvatars = (p: Partial<CanvasState["avatars"]>) => {
        dispatch({ type: "SET_AVATARS", payload: p });
        scrollToPreview('family-wrapper-avatars');
    };

    const updateProgress = (p: Partial<CanvasState["progressBars"]>) => {
        dispatch({ type: "SET_PROGRESS", payload: p });
        scrollToPreview('family-wrapper-progress');
    };

    const updateToasts = (p: Partial<CanvasState["toasts"]>) => {
        dispatch({ type: "SET_TOASTS", payload: p });
        scrollToPreview('family-wrapper-toasts');
    };

    const updateNav = (p: Partial<CanvasState["nav"]>) => {
        dispatch({ type: "SET_NAV", payload: p });
        scrollToPreview('family-wrapper-navigation');
    };

    const updateLayout = (p: Partial<CanvasState["layoutConfig"]>) => {
        dispatch({ type: "SET_LAYOUT_CONFIG", payload: p });
        scrollToPreview('family-wrapper-layouts');
    };

    const updateSecondary = (p: Partial<CanvasState["secondary"]>) => {
        dispatch({ type: "SET_SECONDARY", payload: p });
        scrollToPreview('family-wrapper-separators');
    };

    const updateIconography = (p: Partial<CanvasState["iconography"]>) => {
        dispatch({ type: "SET_ICONOGRAPHY", payload: p });
        scrollToPreview('family-wrapper-iconography');
    };


    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/20">
                    <Component className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Componentes UI</h3>
                    <p className="text-xs text-white/60">Configura cada familia de elementos de la interfaz</p>
                </div>
            </div>

            {/* ═══ BUTTONS ═══ */}
            <FamilySection id="buttons">
                <SectionHeader icon={Zap} title="Estilo de Botones" />
                <div className="space-y-2">
                    {BUTTON_STYLES.map(bs => (
                        <div key={bs.id} onClick={() => update({ buttonStyle: bs.id }, "buttons")}
                            role="button"
                            tabIndex={0}
                            aria-pressed={state.components.buttonStyle === bs.id}
                            aria-label={`Estilo de botón: ${bs.label}`}
                            className={cn("w-full p-2.5 rounded-xl border transition-all flex items-center gap-3 cursor-pointer",
                                state.components.buttonStyle === bs.id ? "bg-amber-500/10 border-amber-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    update({ buttonStyle: bs.id }, "buttons");
                                }
                            }}
                        >
                            {/* Mini-preview swatch */}
                            <div className={cn("w-8 h-5 rounded-md shrink-0 transition-all", bs.cls)} />
                            <div className="flex-1">
                                <p className="text-sm text-white/80 font-medium">{bs.label}</p>
                                <p className="text-[11px] text-white/50">{bs.desc}</p>
                            </div>
                            {state.components.buttonStyle === bs.id && (
                                <motion.div
                                    layoutId="button-style-indicator"
                                    className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 shadow-[0_0_10px_#fbbf24]"
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <p className="text-[10px] text-white/40 italic px-1">Nota: El redondeado de botones se gestiona en la pestaña "Geometría" para consistencia global.</p>
                    <Toggle on={state.components.buttonGlow} id="buttonGlow" description="Enable outer glow effect" onToggle={() => update({ buttonGlow: !state.components.buttonGlow }, "buttons")} label="Glow Effect" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />

                    <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                        <label className="text-xs text-white/50" htmlFor="focusRingColor">Color de Enfoque (Ring)</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input id="focusRingColor" type="color" value={state.components.focusRingColor} onChange={e => update({ focusRingColor: e.target.value })}
                                aria-label="Color de enfoque del anillo"
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                            <span className="text-[11px] text-white/60 font-mono uppercase">{state.components.focusRingColor}</span>
                        </div>
                    </div>
                </div>
            </FamilySection>

            {/* ═══ INPUTS ═══ */}
            <FamilySection id="inputs">
                <SectionHeader icon={Type} title="Estilo de Inputs" color="text-cyan-400" />
                <div className="space-y-3">
                    {INPUT_BORDERS.map(ib => (
                        <div key={ib.id} onClick={() => update({ inputBorderStyle: ib.id }, "inputs")}
                            role="button"
                            tabIndex={0}
                            aria-pressed={state.components.inputBorderStyle === ib.id}
                            aria-label={`Estilo de input: ${ib.label}`}
                            className={cn("w-full p-2.5 rounded-xl border transition-all flex items-center gap-3 cursor-pointer",
                                state.components.inputBorderStyle === ib.id ? "bg-cyan-500/10 border-cyan-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    update({ inputBorderStyle: ib.id }, "inputs");
                                }
                            }}
                        >
                            {/* Mini-preview swatch */}
                            <div className={cn("w-8 h-5 shrink-0 transition-all", ib.cls)} />
                            <div className="flex-1">
                                <p className="text-sm text-white/80 font-medium">{ib.label}</p>
                                <p className="text-[11px] text-white/50">{ib.desc}</p>
                            </div>
                            {state.components.inputBorderStyle === ib.id && (
                                <motion.div
                                    layoutId="input-border-indicator"
                                    className="w-2.5 h-2.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_10px_#22d3ee]"
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Toggle on={state.components.inputFloatingLabel} onToggle={() => update({ inputFloatingLabel: !state.components.inputFloatingLabel }, "inputs")} label="Floating Label" description="Label moves up when focused" id="inputFloatingLabel" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />
                </div>
            </FamilySection>

            {/* ═══ BADGES ═══ */}
            <FamilySection id="badges">
                <SectionHeader icon={Shield} title="Badges & Estatus" color="text-amber-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5">
                    <OptionChips
                        options={BADGE_STYLES}
                        value={state.components.badgeStyle}
                        onChange={v => update({ badgeStyle: v }, "badges")}
                        color="amber"
                        label="Badge Style"
                        id="badgeStyle"
                        onHighlight={handleHighlight}
                    />
                </div>
            </FamilySection>

            {/* ═══ TOOLTIPS ═══ */}
            <FamilySection id="tooltips">
                <SectionHeader icon={MessageSquare} title="Estilo de Tooltips" color="text-cyan-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5">
                    <div className="flex gap-2 flex-wrap">
                        {TOOLTIP_STYLES.map(ts => (
                            <button key={ts.id} onClick={() => update({ tooltipStyle: ts.id }, "tooltips")}
                                className={cn("px-4 py-2 rounded-xl text-left transition-all border",
                                    state.components.tooltipStyle === ts.id ? "bg-cyan-500/10 border-cyan-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                                <p className="text-[11px] text-white/80 font-medium">{ts.label}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </FamilySection>

            {/* ═══ TABS ═══ */}
            <FamilySection id="tabs">
                <SectionHeader icon={Layers} title="Pestañas / Tabs" color="text-purple-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[
                            { id: "underline" as const, label: "Underline" },
                            { id: "pill" as const, label: "Pill" },
                            { id: "box" as const, label: "Box" },
                            { id: "ghost" as const, label: "Ghost" }
                        ]}
                        value={state.tabsConfig.style}
                        onChange={v => updateTabs({ style: v })}
                        color="purple"
                        label="Tab Style"
                        id="tabsStyle"
                        onHighlight={handleHighlight}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Activo</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={state.tabsConfig.activeColor} onChange={e => updateTabs({ activeColor: e.target.value })}
                                    className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                                <span className="text-[10px] text-white/60 font-mono">{state.tabsConfig.activeColor}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] text-white/40 uppercase tracking-wider font-bold">Inactivo</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={state.tabsConfig.inactiveColor || "#ffffff66"} onChange={e => updateTabs({ inactiveColor: e.target.value })}
                                    className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                                <span className="text-[10px] text-white/60 font-mono">{state.tabsConfig.inactiveColor}</span>
                            </div>
                        </div>
                    </div>

                    <OptionChips
                        options={[
                            { id: "line" as const, label: "Line" },
                            { id: "pill" as const, label: "Pill Glow" },
                            { id: "dot" as const, label: "Dot" },
                            { id: "neon" as const, label: "Neon" }
                        ]}
                        value={state.tabsConfig.indicatorStyle}
                        onChange={v => updateTabs({ indicatorStyle: v })}
                        color="purple"
                        label="Indicator Style"
                        id="tabsIndicator"
                        onHighlight={handleHighlight}
                    />

                    <OptionChips
                        options={[
                            { id: "smooth" as const, label: "Smooth" },
                            { id: "elastic" as const, label: "Elastic" },
                            { id: "bounce" as const, label: "Bounce" }
                        ]}
                        value={state.tabsConfig.animationType}
                        onChange={v => updateTabs({ animationType: v })}
                        color="purple"
                        label="Animation Type"
                        id="tabsAnimation"
                        onHighlight={handleHighlight}
                    />

                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <Slider label="Padding" id="tabsPadding" value={state.tabsConfig.tabPadding} min={8} max={32} step={1} unit="px"
                            onChange={v => updateTabs({ tabPadding: v })} color="purple" onHighlight={handleHighlight} />

                        <Slider label="Spacing" id="tabsSpacing" value={state.tabsConfig.spacing} min={0} max={20} step={1} unit="px"
                            onChange={v => updateTabs({ spacing: v })} color="purple" onHighlight={handleHighlight} />

                        <Slider label="Indicator Thickness" id="tabsThickness" value={state.tabsConfig.indicatorThickness} min={1} max={6} step={1} unit="px"
                            onChange={v => updateTabs({ indicatorThickness: v })} color="purple" onHighlight={handleHighlight} />

                        <Slider label="Active Opacity" id="tabsOpacity" value={state.tabsConfig.activeBgOpacity} min={0} max={1} step={0.05} unit=""
                            onChange={v => updateTabs({ activeBgOpacity: v })} color="purple" onHighlight={handleHighlight} />
                    </div>
                </div>
            </FamilySection>

            {/* ═══ TOGGLES ═══ */}
            <FamilySection id="toggles">
                <SectionHeader icon={ToggleLeft} title="Toggles / Controles" color="text-emerald-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50">Color del switch</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input type="color" value={state.toggles.switchTrackColor} onChange={e => updateToggles({ switchTrackColor: e.target.value })}
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                            <span className="text-[11px] text-white/60 font-mono">{state.toggles.switchTrackColor}</span>
                        </div>
                    </div>
                    <OptionChips
                        options={[{ id: "round" as const, label: "Redondeado" }, { id: "square" as const, label: "Cuadrado" }]}
                        value={state.toggles.checkboxStyle}
                        onChange={v => updateToggles({ checkboxStyle: v })}
                        color="emerald"
                        label="Checkbox Style"
                        id="checkboxStyle"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "standard" as const, label: "Standard" },
                            { id: "cyber" as const, label: "Cyber" },
                            { id: "fluid" as const, label: "Fluid" }
                        ]}
                        value={state.toggles.switchStyle}
                        onChange={v => updateToggles({ switchStyle: v })}
                        color="emerald"
                        label="Estilo de Switch"
                        id="switchStyle"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Tamaño Radio" id="radioSize" value={state.toggles.radioSize} min={12} max={24} step={1} unit="px"
                        onChange={v => updateToggles({ radioSize: v })} color="emerald" onHighlight={handleHighlight} />

                    <div className="space-y-3 pt-4 border-t border-white/5">
                        <SettingControl id="modoSync" label="MODO SYNC" headerAction={
                            <StitchCheckbox
                                checked={true}
                                onChange={() => { }}
                                style={state.toggles.checkboxStyle}
                                activeColor={state.toggles.switchTrackColor}
                            />
                        } />
                        <SettingControl id="autoFix" label="AUTO-FIX" headerAction={
                            <StitchRadio
                                checked={true}
                                onChange={() => { }}
                                size={state.toggles.radioSize}
                                activeColor={state.toggles.switchTrackColor}
                            />
                        } />
                    </div>
                </div>
            </FamilySection>

            {/* ═══ AVATARS ═══ */}
            <FamilySection id="avatars">
                <SectionHeader icon={Users} title="Avatares" color="text-purple-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[{ id: "circle" as const, label: "Circular" }, { id: "rounded" as const, label: "Redondeado" }, { id: "square" as const, label: "Cuadrado" }]}
                        value={state.avatars.shape}
                        onChange={v => updateAvatars({ shape: v })}
                        color="purple"
                        label="Shape"
                        id="avatarShape"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Escala de tamaño" id="avatarSize" value={state.avatars.sizeScale} min={0.6} max={1.5} step={0.05} unit="x"
                        onChange={v => updateAvatars({ sizeScale: v })} color="purple" onHighlight={handleHighlight} />
                    <OptionChips
                        options={[{ id: "top-right" as const, label: "Arriba-Derecha" }, { id: "bottom-right" as const, label: "Abajo-Derecha" }]}
                        value={state.avatars.statusDotPosition}
                        onChange={v => updateAvatars({ statusDotPosition: v })}
                        color="purple"
                        label="Status Dot"
                        id="avatarStatusDot"
                        onHighlight={handleHighlight}
                    />
                </div>
            </FamilySection>

            {/* ═══ PROGRESS BARS ═══ */}
            <FamilySection id="progress">
                <SectionHeader icon={BarChart3} title="Barras de Progreso" color="text-emerald-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[
                            { id: "flat" as const, label: "Flat" },
                            { id: "rounded" as const, label: "Rounded" },
                            { id: "neon" as const, label: "Neón" },
                            { id: "cyber" as const, label: "Cyber" }
                        ]}
                        value={state.progressBars.barStyle}
                        onChange={v => updateProgress({ barStyle: v })}
                        color="emerald"
                        label="Estilo"
                        id="progressStyle"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Altura" id="progressHeight" value={state.progressBars.height} min={2} max={16} step={1} unit="px"
                        onChange={v => updateProgress({ height: v })} color="emerald" onHighlight={handleHighlight} />
                    <OptionChips
                        options={[{ id: "primary" as const, label: "Primario" }, { id: "gradient" as const, label: "Gradiente" }, { id: "rainbow" as const, label: "Arcoíris" }]}
                        value={state.progressBars.colorScheme}
                        onChange={v => updateProgress({ colorScheme: v })}
                        color="emerald"
                        label="Color Scheme"
                        id="progressColor"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "top" as const, label: "Arriba" },
                            { id: "inline" as const, label: "En Línea" },
                            { id: "hidden" as const, label: "Oculto" }
                        ]}
                        value={state.progressBars.labelPosition}
                        onChange={v => updateProgress({ labelPosition: v })}
                        color="emerald"
                        label="Posición Label"
                        id="progressLabel"
                        onHighlight={handleHighlight}
                    />
                    <Toggle on={state.progressBars.animated} onToggle={() => updateProgress({ animated: !state.progressBars.animated })} label="Animación pulsante" id="progressAnimated" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />
                    <Slider label="Velocidad de Pulso" id="pulseSpeed" value={state.progressBars.pulseSpeed} min={0.5} max={5} step={0.5} unit="s"
                        onChange={v => updateProgress({ pulseSpeed: v })} color="emerald" onHighlight={handleHighlight} />
                </div>
            </FamilySection>

            {/* ═══ TOASTS ═══ */}
            <FamilySection id="toasts">
                <SectionHeader icon={Bell} title="Notificaciones / Toasts" color="text-amber-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <button
                        onClick={() => updateToasts({ lastTrigger: Date.now() })}
                        className="w-full py-2.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 hover:bg-amber-500/30 transition-all mb-2"
                    >
                        Probar Notificación Live
                    </button>
                    <OptionChips
                        options={[
                            { id: "top-right" as const, label: "↗ Arriba-Der" },
                            { id: "top-center" as const, label: "↑ Arriba-Centro" },
                            { id: "bottom-right" as const, label: "↘ Abajo-Der" },
                            { id: "bottom-center" as const, label: "↓ Abajo-Centro" },
                        ]}
                        value={state.toasts.position}
                        onChange={v => updateToasts({ position: v })}
                        color="amber"
                        label="Position"
                        id="toastPosition"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Duración" id="toastDuration" value={state.toasts.duration} min={1000} max={10000} step={500} unit="ms"
                        onChange={v => updateToasts({ duration: v })} onHighlight={handleHighlight} />
                    <OptionChips
                        options={[
                            { id: "glass" as const, label: "Glass" },
                            { id: "solid" as const, label: "Sólido" },
                            { id: "minimal" as const, label: "Minimal" },
                            { id: "neon" as const, label: "Neón" },
                            { id: "cyber" as const, label: "Cyber" },
                            { id: "blast" as const, label: "Blast" }
                        ]}
                        value={state.toasts.style}
                        onChange={v => updateToasts({ style: v })}
                        color="amber"
                        label="Style"
                        id="toastStyle"
                        onHighlight={handleHighlight}
                    />
                </div>
            </FamilySection>

            {/* ═══ NAVIGATION ═══ */}
            <FamilySection id="navigation">
                <SectionHeader icon={Navigation} title="Navegación / Dock" color="text-cyan-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[{ id: "floating" as const, label: "Flotante" }, { id: "attached" as const, label: "Fijo" }, { id: "minimal" as const, label: "Minimal" }]}
                        value={state.nav.dockStyle}
                        onChange={v => updateNav({ dockStyle: v })}
                        color="cyan"
                        label="Dock Style"
                        id="dockStyle"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "bottom" as const, label: "⬇ Abajo" },
                            { id: "top" as const, label: "⬆ Arriba" },
                            { id: "left" as const, label: "⬅ Izquierda" },
                            { id: "right" as const, label: "➡ Derecha" }
                        ]}
                        value={state.nav.dockPosition}
                        onChange={v => updateNav({ dockPosition: v })}
                        color="cyan"
                        label="Posición del Dock"
                        id="dockPosition"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "glass" as const, label: "Glass" },
                            { id: "solid" as const, label: "Sólido" },
                            { id: "transparent" as const, label: "Transparente" }
                        ]}
                        value={state.nav.dockBg}
                        onChange={v => updateNav({ dockBg: v })}
                        color="cyan"
                        label="Fondo del Dock"
                        id="dockBg"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "standard" as const, label: "Standard" },
                            { id: "social" as const, label: "Social" },
                            { id: "productivity" as const, label: "Work" }
                        ]}
                        value={state.nav.dockIcons}
                        onChange={v => updateNav({ dockIcons: v })}
                        color="cyan"
                        label="Icon Preset"
                        id="dockIcons"
                        onHighlight={handleHighlight}
                    />
                    <div className="flex items-center justify-between py-1">
                        <Toggle
                            on={state.nav.showLabels}
                            onToggle={() => updateNav({ showLabels: !state.nav.showLabels })}
                            label="Mostrar Etiquetas"
                            id="showLabels"
                            onHighlight={handleHighlight}
                            config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }}
                        />
                    </div>
                    <Slider label="Escala de Iconos" id="iconScale" value={state.nav.iconScale} min={0.5} max={1.5} step={0.1} unit="x"
                        onChange={v => updateNav({ iconScale: v })} color="cyan" onHighlight={handleHighlight} />
                    <Slider label="Elevación" id="dockElevation" value={state.nav.dockElevation} min={0} max={24} step={1} unit="px"
                        onChange={v => updateNav({ dockElevation: v })} color="cyan" onHighlight={handleHighlight} />
                    <OptionChips
                        options={[{ id: "slash" as const, label: "/" }, { id: "arrow" as const, label: "›" }, { id: "dot" as const, label: "•" }]}
                        value={state.nav.breadcrumbSeparator}
                        onChange={v => updateNav({ breadcrumbSeparator: v })}
                        color="cyan"
                        label="Separator"
                        id="breadcrumbSeparator"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Padding de ítems" id="menuItemPadding" value={state.nav.menuItemPadding} min={4} max={16} step={1} unit="px"
                        onChange={v => updateNav({ menuItemPadding: v })} color="cyan" onHighlight={handleHighlight} />
                </div>

                {/* ─── TRINITY SETTINGS ─── */}
                <div className="mt-3 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 rounded-2xl p-4 border border-purple-500/10 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Interfaz Trinidad</span>
                    </div>
                    <OptionChips
                        options={[
                            { id: "gooey" as const, label: "Gooey" },
                            { id: "minimal" as const, label: "Minimal" },
                            { id: "glass" as const, label: "Glass" }
                        ]}
                        value={state.nav.trinityStyle}
                        onChange={v => updateNav({ trinityStyle: v })}
                        color="purple"
                        label="Estilo Trinity"
                        id="trinityStyle"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "horizontal" as const, label: "Horizontal" },
                            { id: "arc" as const, label: "Arco" },
                            { id: "radial" as const, label: "Radial" }
                        ]}
                        value={state.nav.trinityLayout}
                        onChange={v => updateNav({ trinityLayout: v })}
                        color="purple"
                        label="Disposición"
                        id="trinityLayout"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "spring" as const, label: "Spring" },
                            { id: "elastic" as const, label: "Elástico" },
                            { id: "smooth" as const, label: "Suave" }
                        ]}
                        value={state.nav.trinityPhysics}
                        onChange={v => updateNav({ trinityPhysics: v })}
                        color="purple"
                        label="Física de Paneles"
                        id="trinityPhysics"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Peek Distance" id="trinityPeek" value={state.nav.trinityPeekDistance} min={2} max={20} step={1} unit="px"
                        onChange={v => updateNav({ trinityPeekDistance: v })} color="purple" onHighlight={handleHighlight} />
                    <Slider label="Auto-Hide Delay" id="trinityAutoHide" value={state.nav.trinityAutoHideDelay} min={1} max={8} step={0.5} unit="s"
                        onChange={v => updateNav({ trinityAutoHideDelay: v })} color="purple" onHighlight={handleHighlight} />
                    <div className="space-y-2">
                        <Toggle on={state.nav.trinityGlow} onToggle={() => updateNav({ trinityGlow: !state.nav.trinityGlow })} label="Glow de Proximidad" description="Destello luminoso al acercarse al borde" id="trinityGlow" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />
                        <Toggle on={state.nav.trinityCornerBlend} onToggle={() => updateNav({ trinityCornerBlend: !state.nav.trinityCornerBlend })} label="Fusión de Esquinas" description="Mezcla cromática aditiva en esquinas" id="trinityCornerBlend" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />
                        <Toggle on={state.nav.trinityColorShadow} onToggle={() => updateNav({ trinityColorShadow: !state.nav.trinityColorShadow })} label="Sombras de Color" description="Paneles proyectan sombra teñida de su propio color" id="trinityColorShadow" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />
                    </div>
                </div>
            </FamilySection>



            {/* ═══ LAYOUTS ═══ */}
            <FamilySection id="layouts">
                <SectionHeader icon={PanelTop} title="Sistemas de Layout" color="text-blue-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={WINDOW_STYLES}
                        value={state.layoutConfig.windowStyle}
                        onChange={v => updateLayout({ windowStyle: v })}
                        color="cyan"
                        label="Estilo de Ventana"
                        id="windowStyle"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={FRAME_TYPES}
                        value={state.layoutConfig.frameType}
                        onChange={v => updateLayout({ frameType: v })}
                        color="cyan"
                        label="Tipo de Frame"
                        id="frameType"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "top" as const, label: "Arriba" },
                            { id: "side" as const, label: "Lateral" },
                            { id: "bottom" as const, label: "Abajo" }
                        ]}
                        value={state.layoutConfig.tabLayout}
                        onChange={v => updateLayout({ tabLayout: v })}
                        color="cyan"
                        label="Distribución de Tabs"
                        id="tabLayout"
                        onHighlight={handleHighlight}
                    />
                    <Toggle on={state.layoutConfig.showTitleBar} onToggle={() => updateLayout({ showTitleBar: !state.layoutConfig.showTitleBar })} label="Barra de Título" id="showTitleBar" onHighlight={handleHighlight} config={{ style: state.toggles.switchStyle, activeColor: state.toggles.switchTrackColor }} />
                    <Slider label="Window Padding" id="windowPadding" value={state.layoutConfig.windowPadding} min={0} max={48} step={1} unit="px"
                        onChange={v => updateLayout({ windowPadding: v })} color="cyan" onHighlight={handleHighlight} />
                    <Slider label="Window Blur" id="windowBlur" value={state.layoutConfig.windowBlur} min={0} max={64} step={1} unit="px"
                        onChange={v => updateLayout({ windowBlur: v })} color="cyan" onHighlight={handleHighlight} />
                </div>
            </FamilySection>
            {/* ═══ SEPARATORS ═══ */}
            <FamilySection id="separators">
                <SectionHeader icon={SeparatorHorizontal} title="Separadores / Divisores" color="text-rose-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[
                            { id: "none" as const, label: "Ninguno" },
                            { id: "line" as const, label: "Línea" },
                            { id: "gradient" as const, label: "Gradiente" },
                            { id: "dotted" as const, label: "Punteado" },
                            { id: "glow" as const, label: "Glow" }
                        ]}
                        value={state.secondary.dividers}
                        onChange={v => updateSecondary({ dividers: v })}
                        color="rose"
                        label="Tipo"
                        id="dividerType"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Grosor" id="dividerThickness" value={state.secondary.dividerThickness} min={1} max={4} step={0.5} unit="px"
                        onChange={v => updateSecondary({ dividerThickness: v })} color="rose" onHighlight={handleHighlight} />
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50">Color</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input type="color" value={state.secondary.dividerColor?.startsWith('rgba') ? '#ffffff' : (state.secondary.dividerColor || '#ffffff')} onChange={e => updateSecondary({ dividerColor: e.target.value })}
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                        </div>
                    </div>
                    {/* Live preview */}
                    <div className="py-2">
                        <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Vista Previa</div>
                        <div className="flex flex-col gap-3">
                            <div className="text-[10px] text-white/40">Contenido arriba</div>
                            <div
                                className={cn(
                                    state.secondary.dividers === 'none' ? 'hidden' : '',
                                    state.secondary.dividers === 'glow' ? 'shadow-[0_0_8px_rgba(255,255,255,0.2)]' : ''
                                )}
                                style={{
                                    height: `${state.secondary.dividerThickness}px`,
                                    background: state.secondary.dividers === 'gradient'
                                        ? `linear-gradient(to right, transparent, ${state.secondary.dividerColor || 'rgba(255,255,255,0.1)'}, transparent)`
                                        : state.secondary.dividers === 'glow'
                                            ? `linear-gradient(to right, transparent, ${state.secondary.dividerColor || 'rgba(255,255,255,0.2)'}, transparent)`
                                            : state.secondary.dividerColor || 'rgba(255,255,255,0.1)',
                                    borderStyle: state.secondary.dividers === 'dotted' ? 'dotted' : undefined,
                                    borderWidth: state.secondary.dividers === 'dotted' ? `${state.secondary.dividerThickness}px 0 0 0` : undefined,
                                    borderColor: state.secondary.dividers === 'dotted' ? (state.secondary.dividerColor || 'rgba(255,255,255,0.1)') : undefined,
                                }}
                            />
                            <div className="text-[10px] text-white/40">Contenido abajo</div>
                        </div>
                    </div>
                </div>
            </FamilySection>

            {/* ═══ ICON PRESETS ═══ */}
            <FamilySection id="iconography">
                <SectionHeader icon={Sparkles} title="Presets de Iconos" color="text-indigo-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[
                            { id: "outline" as const, label: "✏️ Outline" },
                            { id: "solid" as const, label: "■ Solid" },
                            { id: "duotone" as const, label: "◐ Duotone" },
                            { id: "neon" as const, label: "💡 Neon" },
                            { id: "glass" as const, label: "🪟 Glass" },
                            { id: "minimal" as const, label: "— Minimal" }
                        ]}
                        value={state.iconography.iconPreset}
                        onChange={v => updateIconography({ iconPreset: v })}
                        color="indigo"
                        label="Icon Style"
                        id="iconPreset"
                        onHighlight={handleHighlight}
                    />
                    <OptionChips
                        options={[
                            { id: "stroke" as const, label: "Trazo" },
                            { id: "solid" as const, label: "Sólido" }
                        ]}
                        value={state.iconography.style}
                        onChange={v => updateIconography({ style: v })}
                        color="indigo"
                        label="Estilo"
                        id="iconStyle"
                        onHighlight={handleHighlight}
                    />
                    <Slider label="Grosor Trazo" id="iconStroke" value={state.iconography.strokeWidth} min={1} max={3} step={0.5} unit="px"
                        onChange={v => updateIconography({ strokeWidth: v })} color="indigo" onHighlight={handleHighlight} />
                    <OptionChips
                        options={[
                            { id: "none" as const, label: "Ninguna" },
                            { id: "pulse" as const, label: "Pulso" },
                            { id: "bounce" as const, label: "Rebote" },
                            { id: "spin" as const, label: "Giro" }
                        ]}
                        value={state.iconography.animation}
                        onChange={v => updateIconography({ animation: v })}
                        color="indigo"
                        label="Animación"
                        id="iconAnimation"
                        onHighlight={handleHighlight}
                    />
                </div>
            </FamilySection>
        </div>
    );
}
