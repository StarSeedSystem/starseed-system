"use client";

import React, { useEffect, useRef } from "react";
import {
    Component, Zap, Square, Type, CircleDot, MessageSquare, Shield,
    ToggleLeft, Users, BarChart3, Bell, Navigation, Layers, PanelTop, Palette
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState, ElementFamily } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import { SettingControl } from "../controls/SettingControl";

interface Props {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
    selectedElement?: ElementFamily;
}

// ─── Presets ──────────────────────────────────────────────────
const BUTTON_STYLES: { id: CanvasState["components"]["buttonStyle"]; label: string; desc: string; cls: string }[] = [
    { id: "default", label: "Standard", desc: "Solid fill", cls: "bg-purple-600" },
    { id: "glass", label: "Crystal Glass", desc: "Frosted blur", cls: "bg-white/10 backdrop-blur-md border border-white/20" },
    { id: "liquid", label: "Liquid", desc: "Morphing refraction", cls: "bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-lg border border-white/15" },
    { id: "neon", label: "Neon Glow", desc: "Electric borders", cls: "bg-transparent border-2 border-cyan-400 shadow-[0_0_15px_rgba(0,212,255,0.3)]" },
    { id: "brutal", label: "Brutal", desc: "Hard shadows", cls: "bg-white text-black shadow-[4px_4px_0_rgba(0,0,0,1)] border-2 border-black" },
];



const INPUT_BORDERS: { id: CanvasState["components"]["inputBorderStyle"]; label: string }[] = [
    { id: "none", label: "Sin Borde" }, { id: "subtle", label: "Sutil" },
    { id: "solid", label: "Sólido" }, { id: "glow", label: "Glow" },
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

// ─── Shared Controls ─────────────────────────────────────────
function Toggle({ on, onToggle, label, description, id, onHighlight }: {
    on: boolean; onToggle: () => void; label: string; description?: string; id?: string; onHighlight?: (id: string | null) => void;
}) {
    return (
        <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}
            headerAction={
                <button onClick={onToggle} className={cn("relative w-10 h-5 rounded-full transition-all", on ? "bg-amber-500/40" : "bg-white/10")}>
                    <div className={cn("absolute w-4 h-4 rounded-full top-0.5 transition-all", on ? "left-[22px] bg-amber-400" : "left-0.5 bg-white/40")} />
                </button>
            }
        />
    );
}

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "amber", onHighlight }: {
    label: string; description?: string; id?: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight?: (id: string | null) => void;
}) {
    return (
        <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}
            headerAction={<span className="text-white/70 font-mono text-[11px]">{value}{unit}</span>}
        >
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
                className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    `accent-${color}-500`,
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    color === "amber" && "[&::-webkit-slider-thumb]:bg-amber-400",
                    color === "cyan" && "[&::-webkit-slider-thumb]:bg-cyan-400",
                    color === "purple" && "[&::-webkit-slider-thumb]:bg-purple-400",
                    color === "rose" && "[&::-webkit-slider-thumb]:bg-rose-400",
                    color === "emerald" && "[&::-webkit-slider-thumb]:bg-emerald-400",
                )}
            />
        </SettingControl>
    );
}

function OptionChips<T extends string>({ options, value, onChange, color = "amber", label, description, id, onHighlight }: {
    options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; color?: string;
    label?: string; description?: string; id?: string; onHighlight?: (id: string | null) => void;
}) {
    const colorMap: Record<string, string> = {
        amber: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        cyan: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
        purple: "bg-purple-500/15 border-purple-500/30 text-purple-300",
        rose: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    };

    const content = (
        <div className="flex flex-wrap gap-2">
            {options.map(o => (
                <button key={o.id} onClick={() => onChange(o.id)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs transition-all border",
                        value === o.id ? colorMap[color] : "bg-white/5 border-white/5 text-white/60 hover:bg-white/8")}>
                    {o.label}
                </button>
            ))}
        </div>
    );

    if (label) {
        return (
            <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}>
                {content}
            </SettingControl>
        );
    }

    return content;
}

function SectionHeader({ icon: Icon, title, color = "text-amber-400" }: { icon: any; title: string; color?: string }) {
    return (
        <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2">
            <Icon className={cn("w-3 h-3", color)} /> {title}
        </h4>
    );
}

function FamilySection({ id, children }: { id: string; children: React.ReactNode }) {
    return <div id={`family-${id}`} className="space-y-3 scroll-mt-4">{children}</div>;
}

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
                        <button key={bs.id} onClick={() => update({ buttonStyle: bs.id }, "buttons")}
                            className={cn("flex items-center gap-4 w-full p-3 rounded-xl transition-all border text-left",
                                state.components.buttonStyle === bs.id ? "bg-amber-500/10 border-amber-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                            <div className={cn("px-4 py-1.5 rounded-lg text-xs font-medium shrink-0", bs.cls)}>
                                <span className={bs.id === "brutal" ? "" : "text-white/80"}>Button</span>
                            </div>
                            <div className="flex-1"><p className="text-sm text-white/80 font-medium">{bs.label}</p><p className="text-[11px] text-white/50">{bs.desc}</p></div>
                            {state.components.buttonStyle === bs.id && <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                        </button>
                    ))}
                </div>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Slider label="Border Radius" id="buttonRadius" description="Roundness of button corners" value={state.components.buttonRadius} min={0} max={9999} step={1} unit="px" onChange={v => update({ buttonRadius: v }, "buttons")} onHighlight={handleHighlight} />
                    <Toggle on={state.components.buttonGlow} id="buttonGlow" description="Enable outer glow effect" onToggle={() => update({ buttonGlow: !state.components.buttonGlow }, "buttons")} label="Glow Effect" onHighlight={handleHighlight} />
                </div>
            </FamilySection>



            {/* ═══ INPUTS ═══ */}
            <FamilySection id="inputs">
                <SectionHeader icon={Type} title="Estilo de Inputs" color="text-cyan-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips options={INPUT_BORDERS} value={state.components.inputBorderStyle} onChange={v => update({ inputBorderStyle: v }, "inputs")} color="cyan" label="Border Style" description="Visual style of the input border" id="inputBorderStyle" onHighlight={handleHighlight} />
                    <Toggle on={state.components.inputFloatingLabel} onToggle={() => update({ inputFloatingLabel: !state.components.inputFloatingLabel }, "inputs")} label="Floating Label" description="Label moves up when focused" id="inputFloatingLabel" onHighlight={handleHighlight} />
                </div>
            </FamilySection>

            {/* ═══ TOOLTIPS ═══ */}
            <FamilySection id="tooltips">
                <SectionHeader icon={MessageSquare} title="Estilo de Tooltips" color="text-cyan-400" />
                <div className="flex gap-2 flex-wrap">
                    {TOOLTIP_STYLES.map(ts => (
                        <button key={ts.id} onClick={() => update({ tooltipStyle: ts.id }, "tooltips")}
                            className={cn("px-4 py-2.5 rounded-xl text-left transition-all border",
                                state.components.tooltipStyle === ts.id ? "bg-cyan-500/10 border-cyan-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                            <p className="text-sm text-white/80 font-medium">{ts.label}</p>
                            <p className="text-[10px] text-white/50 mt-0.5">{ts.desc}</p>
                        </button>
                    ))}
                </div>
            </FamilySection>

            {/* ═══ BADGES ═══ */}
            <FamilySection id="badges">
                <SectionHeader icon={CircleDot} title="Estilo de Badges" color="text-rose-400" />
                <div className="flex gap-3">
                    {BADGE_STYLES.map(bs => (
                        <button key={bs.id} onClick={() => update({ badgeStyle: bs.id }, "badges")}
                            className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all border",
                                state.components.badgeStyle === bs.id ? "bg-rose-500/10 border-rose-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                            <div className={cn("bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center",
                                bs.id === "pill" && "px-2 py-0.5 rounded-full min-w-[20px]",
                                bs.id === "square" && "px-1.5 py-0.5 rounded-md min-w-[20px]",
                                bs.id === "dot" && "w-2.5 h-2.5 rounded-full"
                            )}>{bs.id !== "dot" && "3"}</div>
                            <span className="text-xs text-white/70">{bs.label}</span>
                        </button>
                    ))}
                </div>
            </FamilySection>

            {/* ═══ FOCUS RING ═══ */}
            <FamilySection id="focus">
                <SectionHeader icon={Shield} title="Focus Ring" color="text-amber-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50">Color del anillo</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input type="color" value={state.components.focusRingColor} onChange={e => update({ focusRingColor: e.target.value }, "inputs")}
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                            <span className="text-[11px] text-white/60 font-mono">{state.components.focusRingColor}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70"
                            style={{ boxShadow: `0 0 0 2px ${state.components.focusRingColor}66, 0 0 8px ${state.components.focusRingColor}33` }}>
                            Input enfocado
                        </div>
                        <span className="text-[10px] text-white/40">Preview</span>
                    </div>
                </div>
            </FamilySection>

            {/* ═══ TABS ═══ */}
            <FamilySection id="tabs">
                <SectionHeader icon={Layers} title="Pestañas / Tabs" color="text-purple-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[{ id: "underline" as const, label: "Underline" }, { id: "pill" as const, label: "Pill" }, { id: "box" as const, label: "Box" }]}
                        value={state.tabsConfig.style}
                        onChange={v => updateTabs({ style: v })}
                        color="purple"
                        label="Tab Style"
                        description="Visual appearance of tabs"
                        id="tabsStyle"
                        onHighlight={handleHighlight}
                    />
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50">Color activo</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input type="color" value={state.tabsConfig.activeColor} onChange={e => updateTabs({ activeColor: e.target.value })}
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                            <span className="text-[11px] text-white/60 font-mono">{state.tabsConfig.activeColor}</span>
                        </div>
                    </div>
                    <Slider label="Spacing" id="tabsSpacing" description="Gap between tab items" value={state.tabsConfig.spacing} min={0} max={12} step={1} unit="px"
                        onChange={v => updateTabs({ spacing: v })} color="purple" onHighlight={handleHighlight} />
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
                    <Toggle on={state.progressBars.animated} onToggle={() => updateProgress({ animated: !state.progressBars.animated })} label="Animación pulsante" id="progressAnimated" onHighlight={handleHighlight} />
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
            </FamilySection>

            {/* ═══ ANIMATIONS ═══ */}
            <FamilySection id="animations">
                <SectionHeader icon={Zap} title="Animaciones Globales" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <button
                        onClick={() => dispatch({ type: "SET_UI", payload: { lastAnimTrigger: Date.now() } })}
                        className="w-full py-2.5 rounded-xl bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30 hover:bg-purple-500/30 transition-all mb-2"
                    >
                        Previsualizar Animaciones
                    </button>
                    <Toggle on={state.components.animateHover} onToggle={() => update({ animateHover: !state.components.animateHover })} label="Hover Animations" id="animateHover" onHighlight={handleHighlight} />
                    <Toggle on={state.components.animateClick} onToggle={() => update({ animateClick: !state.components.animateClick })} label="Click Animations" id="animateClick" onHighlight={handleHighlight} />
                    <Toggle on={state.components.microInteractions} onToggle={() => update({ microInteractions: !state.components.microInteractions })} label="Micro-Interactions" id="microInteractions" onHighlight={handleHighlight} />
                    <Slider label="Transition Speed" id="transitionSpeed" value={state.components.transitionSpeed} min={50} max={500} step={10} unit="ms" onChange={v => update({ transitionSpeed: v })} onHighlight={handleHighlight} />
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
                    <Toggle on={state.layoutConfig.showTitleBar} onToggle={() => updateLayout({ showTitleBar: !state.layoutConfig.showTitleBar })} label="Barra de Título" id="showTitleBar" onHighlight={handleHighlight} />
                    <Slider label="Window Padding" id="windowPadding" value={state.layoutConfig.windowPadding} min={0} max={48} step={1} unit="px"
                        onChange={v => updateLayout({ windowPadding: v })} color="cyan" onHighlight={handleHighlight} />
                    <Slider label="Window Blur" id="windowBlur" value={state.layoutConfig.windowBlur} min={0} max={64} step={1} unit="px"
                        onChange={v => updateLayout({ windowBlur: v })} color="cyan" onHighlight={handleHighlight} />
                </div>
            </FamilySection>
        </div>
    );
}
