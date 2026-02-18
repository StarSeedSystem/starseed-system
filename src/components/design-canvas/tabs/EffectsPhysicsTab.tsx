"use client";

import React from "react";
import { Box, Sparkles, Zap, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";

import { Switch } from "@/components/ui/switch";
import { FamilySection, SectionHeader } from "../controls/ControlGroups";
import { SettingControl } from "../controls/SettingControl";
import { OptionChips } from "../controls/OptionChips";

interface Props {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
}

// ─── Shared Controls ─────────────────────────────────────────
function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "rose", onHighlight }: {
    label: string;
    description?: string;
    id: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (v: number) => void;
    color?: string;
    onHighlight: (id: string | null) => void;
}) {
    const colors: Record<string, string> = {
        rose: "accent-rose-500 [&::-webkit-slider-thumb]:bg-rose-400 [&::-webkit-slider-thumb]:shadow-rose-500/40",
        purple: "accent-purple-500 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-purple-500/40",
        cyan: "accent-cyan-500 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-cyan-500/40",
        amber: "accent-amber-500 [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-amber-500/40",
    };
    return (
        <SettingControl
            id={id}
            label={label}
            description={description}
            onHighlight={onHighlight}
            headerAction={<span className="text-white/70 font-mono text-[11px]">{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}{unit || ""}</span>}
        >
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value ?? 0}
                onChange={e => onChange(parseFloat(e.target.value))}
                className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg",
                    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    colors[color] || colors.rose)}
            />
        </SettingControl>
    );
}

const Toggle = ({ on, onToggle, label, description, id, onHighlight }: {
    on: boolean;
    onToggle: () => void;
    label: string;
    description?: string;
    id: string;
    onHighlight: (id: string | null) => void;
}) => (
    <SettingControl id={id} label={label} description={description} onHighlight={onHighlight}>
        <Switch
            checked={on}
            onCheckedChange={onToggle}
            className={cn(on && "bg-cyan-500/40")}
        />
    </SettingControl>
);


export function EffectsPhysicsTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const update = (p: Partial<CanvasState["effects"]>) => {
        dispatch({ type: "SET_EFFECTS", payload: p });
    };

    const updateAnim = (p: Partial<CanvasState["animations"]>) => {
        dispatch({ type: "SET_ANIMATIONS", payload: p });
    };

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    return (
        <div className="space-y-8 p-1 pb-20">
            {/* 🎨 VISUAL EFFECTS */}
            <FamilySection id="visual-effects">
                <SectionHeader icon={Sparkles} title="Propiedades Visuales" color="text-rose-400" />
                <div className="bg-white/3 rounded-2xl p-5 border border-white/5 space-y-5">
                    <Slider label="Backdrop Blur" id="backdropBlur" value={state.effects.backdropBlur} min={0} max={40} unit="px" onChange={v => update({ backdropBlur: v })} onHighlight={handleHighlight} color="rose" />
                    <Slider label="Glass Saturation" id="glassSaturation" value={state.effects.glassSaturation} min={0.5} max={3} step={0.1} onChange={v => update({ glassSaturation: v })} onHighlight={handleHighlight} color="rose" />
                    <Slider label="Chromatic Aberration" id="chromaticAberration" value={state.effects.chromaticAberration} min={0} max={20} unit="px" onChange={v => update({ chromaticAberration: v })} onHighlight={handleHighlight} color="rose" />
                    <Slider label="Noise Opacity" id="noiseOpacity" value={state.effects.noiseOpacity} min={0} max={1} step={0.01} onChange={v => update({ noiseOpacity: v })} onHighlight={handleHighlight} color="rose" />
                </div>
            </FamilySection>

            {/* 🎬 GLOBAL ANIMATIONS */}
            <FamilySection id="animations">
                <SectionHeader icon={Zap} title="🎬 Animaciones Globales" color="text-purple-400" />
                <div className="bg-white/3 rounded-2xl p-5 border border-white/5 space-y-5">
                    <button
                        onClick={() => dispatch({ type: "SET_UI", payload: { lastAnimTrigger: Date.now() } })}
                        className="w-full py-3.5 rounded-xl bg-purple-500/10 text-purple-300 text-[11px] font-bold border border-purple-500/20 hover:bg-purple-500/20 active:scale-[0.98] transition-all mb-4 flex items-center justify-center gap-2 tracking-widest uppercase shadow-lg shadow-purple-500/5"
                    >
                        <Play size={14} className="fill-current" />
                        Reproducir Entrada
                    </button>

                    <OptionChips
                        label="Efecto Hover"
                        id="anim-hover"
                        onHighlight={handleHighlight}
                        color="purple"
                        options={[
                            { label: "None", value: "none" },
                            { label: "Lift", value: "lift" },
                            { label: "Glow", value: "glow" },
                            { label: "Scale", value: "scale" },
                            { label: "Liquid", value: "liquid" }
                        ]}
                        value={state.animations.hover}
                        onChange={v => updateAnim({ hover: v as any })}
                    />

                    <OptionChips
                        label="Efecto Click"
                        id="anim-click"
                        onHighlight={handleHighlight}
                        color="purple"
                        options={[
                            { label: "None", value: "none" },
                            { label: "Ripple", value: "ripple" },
                            { label: "Press", value: "press" },
                            { label: "Bounce", value: "bounce" }
                        ]}
                        value={state.animations.click}
                        onChange={v => updateAnim({ click: v as any })}
                    />

                    <OptionChips
                        label="Entrada"
                        id="anim-entrance"
                        onHighlight={handleHighlight}
                        color="purple"
                        options={[
                            { label: "None", value: "none" },
                            { label: "Fade", value: "fade" },
                            { label: "Slide", value: "slide-up" },
                            { label: "Scale", value: "scale-in" },
                            { label: "Blur", value: "blur-in" }
                        ]}
                        value={state.animations.entrance}
                        onChange={v => updateAnim({ entrance: v as any })}
                    />

                    <div className="grid grid-cols-2 gap-5 pt-3 border-t border-white/5">
                        <Slider label="Duración" id="anim-duration" value={state.animations.duration} min={100} max={2000} step={50} unit="ms" onChange={v => updateAnim({ duration: v })} onHighlight={handleHighlight} color="purple" />
                        <Slider label="Stagger" id="anim-stagger" value={state.animations.stagger} min={0} max={500} step={10} unit="ms" onChange={v => updateAnim({ stagger: v })} onHighlight={handleHighlight} color="purple" />
                    </div>

                    <OptionChips
                        label="Easing"
                        id="anim-easing"
                        onHighlight={handleHighlight}
                        color="purple"
                        options={[
                            { label: "Smooth", value: "ease-out" },
                            { label: "Elastic", value: "elastic" },
                            { label: "Spring", value: "spring" }
                        ]}
                        value={state.animations.easing}
                        onChange={v => updateAnim({ easing: v as any })}
                    />

                    <Toggle
                        on={state.animations.microInteractions}
                        onToggle={() => updateAnim({ microInteractions: !state.animations.microInteractions })}
                        label="Micro-Interacciones"
                        id="microInteractions"
                        onHighlight={handleHighlight}
                    />
                </div>
            </FamilySection>

            {/* 🧪 PHYSICS & MATERIALS */}
            <FamilySection id="physics-materials">
                <SectionHeader icon={Box} title="Física y Materiales" color="text-cyan-400" />
                <div className="bg-white/3 rounded-2xl p-5 border border-white/5 space-y-5">
                    <Slider label="Displacement Scale" id="displacementScale" value={state.effects.displacementScale} min={0} max={20} unit="x" onChange={v => update({ displacementScale: v })} onHighlight={handleHighlight} color="cyan" />
                    <Slider label="Refraction Index" id="refractionIndex" value={state.effects.refractionIndex} min={0} max={1} step={0.01} onChange={v => update({ refractionIndex: v })} onHighlight={handleHighlight} color="cyan" />
                    <Slider label="Elasticity" id="elasticity" value={state.effects.elasticity} min={0} max={1} step={0.01} onChange={v => update({ elasticity: v })} onHighlight={handleHighlight} color="cyan" />
                </div>
            </FamilySection>
        </div>
    );
}
