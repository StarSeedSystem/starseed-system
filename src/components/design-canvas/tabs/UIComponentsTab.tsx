"use client";

import React, { useEffect, useRef } from "react";
import {
    Component, Zap, Square, Type, CircleDot, MessageSquare, Shield,
    ToggleLeft, Users, BarChart3, Bell, Navigation, Layers, PanelTop, Palette
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState, ElementFamily } from "../DesignIntegrationCanvas";

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

const CARD_PRESETS: { id: CanvasState["components"]["cardPreset"]; label: string; desc: string }[] = [
    { id: "crystal", label: "Crystal Clear", desc: "Transparent glass" },
    { id: "liquid-action", label: "Liquid Action", desc: "Motion blur depth" },
    { id: "holographic", label: "Holographic", desc: "Prismatic shimmer" },
    { id: "hyper-crystal", label: "Hyper Crystal", desc: "Max refraction" },
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

// ─── Shared Controls ─────────────────────────────────────────
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">{label}</span>
            <button onClick={onToggle} className={cn("relative w-10 h-5 rounded-full transition-all", on ? "bg-amber-500/40" : "bg-white/10")}>
                <div className={cn("absolute w-4 h-4 rounded-full top-0.5 transition-all", on ? "left-[22px] bg-amber-400" : "left-0.5 bg-white/40")} />
            </button>
        </div>
    );
}

function Slider({ label, value, min, max, step, unit, onChange, color = "amber" }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; color?: string }) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs"><span className="text-white/50">{label}</span><span className="text-white/70 font-mono">{value}{unit}</span></div>
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
        </div>
    );
}

function OptionChips<T extends string>({ options, value, onChange, color = "amber" }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; color?: string }) {
    const colorMap: Record<string, string> = {
        amber: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        cyan: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
        purple: "bg-purple-500/15 border-purple-500/30 text-purple-300",
        rose: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    };
    return (
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
    const update = (p: Partial<CanvasState["components"]>) => dispatch({ type: "SET_COMPONENTS", payload: p });

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
                        <button key={bs.id} onClick={() => update({ buttonStyle: bs.id })}
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
                    <Slider label="Border Radius" value={state.components.buttonRadius} min={0} max={9999} step={1} unit="px" onChange={v => update({ buttonRadius: v })} />
                    <Toggle on={state.components.buttonGlow} onToggle={() => update({ buttonGlow: !state.components.buttonGlow })} label="Glow Effect" />
                </div>
            </FamilySection>

            {/* ═══ CARDS ═══ */}
            <FamilySection id="cards">
                <SectionHeader icon={Square} title="Presets de Tarjetas" color="text-purple-400" />
                <div className="grid grid-cols-2 gap-2">
                    {CARD_PRESETS.map(cp => (
                        <button key={cp.id} onClick={() => update({ cardPreset: cp.id })}
                            className={cn("p-3 rounded-xl transition-all border text-left",
                                state.components.cardPreset === cp.id ? "bg-purple-500/10 border-purple-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                            <p className="text-sm text-white/80 font-medium">{cp.label}</p>
                            <p className="text-[10px] text-white/50 mt-0.5">{cp.desc}</p>
                        </button>
                    ))}
                </div>
            </FamilySection>

            {/* ═══ INPUTS ═══ */}
            <FamilySection id="inputs">
                <SectionHeader icon={Type} title="Estilo de Inputs" color="text-cyan-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips options={INPUT_BORDERS} value={state.components.inputBorderStyle} onChange={v => update({ inputBorderStyle: v })} color="cyan" />
                    <Toggle on={state.components.inputFloatingLabel} onToggle={() => update({ inputFloatingLabel: !state.components.inputFloatingLabel })} label="Floating Label" />
                </div>
            </FamilySection>

            {/* ═══ TOOLTIPS ═══ */}
            <FamilySection id="tooltips">
                <SectionHeader icon={MessageSquare} title="Estilo de Tooltips" color="text-cyan-400" />
                <div className="flex gap-2 flex-wrap">
                    {TOOLTIP_STYLES.map(ts => (
                        <button key={ts.id} onClick={() => update({ tooltipStyle: ts.id })}
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
                        <button key={bs.id} onClick={() => update({ badgeStyle: bs.id })}
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
                            <input type="color" value={state.components.focusRingColor} onChange={e => update({ focusRingColor: e.target.value })}
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
                        onChange={v => dispatch({ type: "SET_TABS_CONFIG", payload: { style: v } })}
                        color="purple"
                    />
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50">Color activo</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input type="color" value={state.tabsConfig.activeColor} onChange={e => dispatch({ type: "SET_TABS_CONFIG", payload: { activeColor: e.target.value } })}
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                            <span className="text-[11px] text-white/60 font-mono">{state.tabsConfig.activeColor}</span>
                        </div>
                    </div>
                    <Slider label="Spacing" value={state.tabsConfig.spacing} min={0} max={12} step={1} unit="px"
                        onChange={v => dispatch({ type: "SET_TABS_CONFIG", payload: { spacing: v } })} color="purple" />
                </div>
            </FamilySection>

            {/* ═══ TOGGLES ═══ */}
            <FamilySection id="toggles">
                <SectionHeader icon={ToggleLeft} title="Toggles / Controles" color="text-emerald-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-white/50">Color del switch</label>
                        <div className="flex items-center gap-2 ml-auto">
                            <input type="color" value={state.toggles.switchTrackColor} onChange={e => dispatch({ type: "SET_TOGGLES", payload: { switchTrackColor: e.target.value } })}
                                className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                            <span className="text-[11px] text-white/60 font-mono">{state.toggles.switchTrackColor}</span>
                        </div>
                    </div>
                    <OptionChips
                        options={[{ id: "round" as const, label: "Redondeado" }, { id: "square" as const, label: "Cuadrado" }]}
                        value={state.toggles.checkboxStyle}
                        onChange={v => dispatch({ type: "SET_TOGGLES", payload: { checkboxStyle: v } })}
                        color="emerald"
                    />
                    <Slider label="Tamaño Radio" value={state.toggles.radioSize} min={12} max={24} step={1} unit="px"
                        onChange={v => dispatch({ type: "SET_TOGGLES", payload: { radioSize: v } })} color="emerald" />
                </div>
            </FamilySection>

            {/* ═══ DIALOGS ═══ */}
            <FamilySection id="dialogs">
                <SectionHeader icon={PanelTop} title="Diálogos / Ventanas Emergentes" color="text-rose-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Slider label="Opacidad overlay" value={state.dialogs.overlayOpacity} min={0} max={1} step={0.05} unit=""
                        onChange={v => dispatch({ type: "SET_DIALOGS", payload: { overlayOpacity: v } })} color="rose" />
                    <Slider label="Blur overlay" value={state.dialogs.overlayBlur} min={0} max={24} step={1} unit="px"
                        onChange={v => dispatch({ type: "SET_DIALOGS", payload: { overlayBlur: v } })} color="rose" />
                    <OptionChips
                        options={[{ id: "fade" as const, label: "Fade" }, { id: "scale" as const, label: "Scale" }, { id: "slide" as const, label: "Slide" }]}
                        value={state.dialogs.animation}
                        onChange={v => dispatch({ type: "SET_DIALOGS", payload: { animation: v } })}
                        color="rose"
                    />
                    <OptionChips
                        options={[{ id: "x" as const, label: "✕ Botón" }, { id: "pill" as const, label: "Pill" }, { id: "icon" as const, label: "Icono" }]}
                        value={state.dialogs.closeButtonStyle}
                        onChange={v => dispatch({ type: "SET_DIALOGS", payload: { closeButtonStyle: v } })}
                        color="rose"
                    />
                </div>
            </FamilySection>

            {/* ═══ AVATARS ═══ */}
            <FamilySection id="avatars">
                <SectionHeader icon={Users} title="Avatares" color="text-purple-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[{ id: "circle" as const, label: "Circular" }, { id: "rounded" as const, label: "Redondeado" }, { id: "square" as const, label: "Cuadrado" }]}
                        value={state.avatars.shape}
                        onChange={v => dispatch({ type: "SET_AVATARS", payload: { shape: v } })}
                        color="purple"
                    />
                    <Slider label="Escala de tamaño" value={state.avatars.sizeScale} min={0.6} max={1.5} step={0.05} unit="x"
                        onChange={v => dispatch({ type: "SET_AVATARS", payload: { sizeScale: v } })} color="purple" />
                    <OptionChips
                        options={[{ id: "top-right" as const, label: "Arriba-Derecha" }, { id: "bottom-right" as const, label: "Abajo-Derecha" }]}
                        value={state.avatars.statusDotPosition}
                        onChange={v => dispatch({ type: "SET_AVATARS", payload: { statusDotPosition: v } })}
                        color="purple"
                    />
                </div>
            </FamilySection>

            {/* ═══ PROGRESS BARS ═══ */}
            <FamilySection id="progress">
                <SectionHeader icon={BarChart3} title="Barras de Progreso" color="text-emerald-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Slider label="Altura" value={state.progressBars.height} min={2} max={16} step={1} unit="px"
                        onChange={v => dispatch({ type: "SET_PROGRESS", payload: { height: v } })} color="emerald" />
                    <OptionChips
                        options={[{ id: "primary" as const, label: "Primario" }, { id: "gradient" as const, label: "Gradiente" }, { id: "rainbow" as const, label: "Arcoíris" }]}
                        value={state.progressBars.colorScheme}
                        onChange={v => dispatch({ type: "SET_PROGRESS", payload: { colorScheme: v } })}
                        color="emerald"
                    />
                    <Toggle on={state.progressBars.animated} onToggle={() => dispatch({ type: "SET_PROGRESS", payload: { animated: !state.progressBars.animated } })} label="Animación pulsante" />
                </div>
            </FamilySection>

            {/* ═══ TOASTS ═══ */}
            <FamilySection id="toasts">
                <SectionHeader icon={Bell} title="Notificaciones / Toasts" color="text-amber-400" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <OptionChips
                        options={[
                            { id: "top-right" as const, label: "↗ Arriba-Der" },
                            { id: "top-center" as const, label: "↑ Arriba-Centro" },
                            { id: "bottom-right" as const, label: "↘ Abajo-Der" },
                            { id: "bottom-center" as const, label: "↓ Abajo-Centro" },
                        ]}
                        value={state.toasts.position}
                        onChange={v => dispatch({ type: "SET_TOASTS", payload: { position: v } })}
                        color="amber"
                    />
                    <Slider label="Duración" value={state.toasts.duration} min={1000} max={10000} step={500} unit="ms"
                        onChange={v => dispatch({ type: "SET_TOASTS", payload: { duration: v } })} />
                    <OptionChips
                        options={[{ id: "glass" as const, label: "Glass" }, { id: "solid" as const, label: "Sólido" }, { id: "minimal" as const, label: "Minimal" }]}
                        value={state.toasts.style}
                        onChange={v => dispatch({ type: "SET_TOASTS", payload: { style: v } })}
                        color="amber"
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
                        onChange={v => dispatch({ type: "SET_NAV", payload: { dockStyle: v } })}
                        color="cyan"
                    />
                    <OptionChips
                        options={[{ id: "slash" as const, label: "/" }, { id: "arrow" as const, label: "›" }, { id: "dot" as const, label: "•" }]}
                        value={state.nav.breadcrumbSeparator}
                        onChange={v => dispatch({ type: "SET_NAV", payload: { breadcrumbSeparator: v } })}
                        color="cyan"
                    />
                    <Slider label="Padding de ítems" value={state.nav.menuItemPadding} min={4} max={16} step={1} unit="px"
                        onChange={v => dispatch({ type: "SET_NAV", payload: { menuItemPadding: v } })} color="cyan" />
                </div>
            </FamilySection>

            {/* ═══ ANIMATIONS ═══ */}
            <FamilySection id="animations">
                <SectionHeader icon={Zap} title="Animaciones Globales" />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Toggle on={state.components.animateHover} onToggle={() => update({ animateHover: !state.components.animateHover })} label="Hover Animations" />
                    <Toggle on={state.components.animateClick} onToggle={() => update({ animateClick: !state.components.animateClick })} label="Click Animations" />
                    <Toggle on={state.components.microInteractions} onToggle={() => update({ microInteractions: !state.components.microInteractions })} label="Micro-Interactions" />
                    <Slider label="Transition Speed" value={state.components.transitionSpeed} min={50} max={500} step={10} unit="ms" onChange={v => update({ transitionSpeed: v })} />
                </div>
            </FamilySection>
        </div>
    );
}
