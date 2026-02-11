"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../DesignIntegrationCanvas";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, value, min, max, step, unit, onChange, color = "rose" }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string;
}) {
    const colors: Record<string, string> = {
        rose: "accent-rose-500 [&::-webkit-slider-thumb]:bg-rose-400 [&::-webkit-slider-thumb]:shadow-rose-500/40",
        purple: "accent-purple-500 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-purple-500/40",
        cyan: "accent-cyan-500 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-cyan-500/40",
        amber: "accent-amber-500 [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-amber-500/40",
    };
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs">
                <span className="text-white/50">{label}</span>
                <span className="text-white/70 font-mono text-[11px]">{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}{unit || ""}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg",
                    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    colors[color] || colors.rose)} />
        </div>
    );
}

const SHADOW_PRESETS: { id: CanvasState["effects"]["shadowPreset"]; label: string; desc: string; style: React.CSSProperties }[] = [
    { id: "soft", label: "Suave", desc: "Sombras sutiles", style: { boxShadow: "0 2px 8px rgba(0,0,0,0.15)" } },
    { id: "medium", label: "Medio", desc: "Profundidad balanceada", style: { boxShadow: "0 4px 16px rgba(0,0,0,0.25)" } },
    { id: "dramatic", label: "Dramático", desc: "Sombras profundas", style: { boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)" } },
];

export function EffectsPhysicsTab({ state, dispatch }: Props) {
    const update = (p: Partial<CanvasState["effects"]>) => dispatch({ type: "SET_EFFECTS", payload: p });

    const sections = [
        {
            title: "Liquid Glass",
            icon: "💧",
            items: [
                { label: "Displacement Scale", key: "displacementScale" as const, min: 0, max: 300, step: 5, unit: "px", color: "cyan" as const },
                { label: "Blur Amount", key: "blurAmount" as const, min: 0, max: 2, step: 0.05, unit: "×", color: "cyan" as const },
                { label: "Refraction Index", key: "refractionIndex" as const, min: 1.0, max: 2.5, step: 0.01, color: "purple" as const },
                { label: "Chromatic Aberration", key: "chromaticAberration" as const, min: 0, max: 10, step: 0.5, unit: "px", color: "purple" as const },
                { label: "Elasticity", key: "elasticity" as const, min: 0, max: 1, step: 0.05, color: "rose" as const },
            ],
        },
        {
            title: "Glass & Backdrop",
            icon: "🔮",
            items: [
                { label: "Backdrop Blur", key: "backdropBlur" as const, min: 0, max: 40, step: 1, unit: "px", color: "rose" as const },
                { label: "Glass Saturation", key: "glassSaturation" as const, min: 100, max: 300, step: 5, unit: "%", color: "purple" as const },
                { label: "Glow Intensity", key: "glowIntensity" as const, min: 0, max: 2, step: 0.1, color: "cyan" as const },
            ],
        },
        {
            title: "Noise & Scanlines",
            icon: "📡",
            items: [
                { label: "Noise Opacity", key: "noiseOpacity" as const, min: 0, max: 0.15, step: 0.005, color: "rose" as const },
                { label: "Scanline Opacity", key: "scanlineOpacity" as const, min: 0, max: 0.1, step: 0.005, color: "purple" as const },
            ],
        },
        {
            title: "Text Diffusion",
            icon: "✨",
            items: [
                { label: "Diffusion Blur", key: "textDiffusionBlur" as const, min: 0, max: 8, step: 0.5, unit: "px", color: "cyan" as const },
                { label: "Glow Strength", key: "textDiffusionGlow" as const, min: 0, max: 2, step: 0.1, color: "purple" as const },
                { label: "Diffusion Opacity", key: "textDiffusionOpacity" as const, min: 0, max: 1, step: 0.05, color: "rose" as const },
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center border border-rose-500/20">
                    <Sparkles className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Efectos & Física</h3>
                    <p className="text-xs text-white/60">Liquid glass, refracción, blur, glow, parallax y sombras</p>
                </div>
            </div>

            {sections.map(section => (
                <div key={section.title} className="space-y-3">
                    <h4 className="text-xs text-white/60 uppercase tracking-wider">{section.icon} {section.title}</h4>
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                        {section.items.map(item => (
                            <Slider key={item.key} label={item.label} value={state.effects[item.key] as number}
                                min={item.min} max={item.max} step={item.step} unit={"unit" in item ? item.unit : undefined} color={item.color}
                                onChange={v => update({ [item.key]: v })} />
                        ))}
                    </div>
                </div>
            ))}

            {/* Parallax & Gradient */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🌀 Parallax & Gradiente</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <Slider label="Parallax Depth" value={state.effects.parallaxDepth} min={0} max={1} step={0.05} unit="×" color="cyan" onChange={v => update({ parallaxDepth: v })} />
                    <Slider label="Gradient Angle" value={state.effects.gradientAngle} min={0} max={360} step={5} unit="°" color="amber" onChange={v => update({ gradientAngle: v })} />

                    {/* Gradient Preview */}
                    <div className="relative h-16 rounded-xl overflow-hidden border border-white/5">
                        <div className="absolute inset-0" style={{
                            background: `linear-gradient(${state.effects.gradientAngle}deg, rgba(139,92,246,0.3), rgba(6,182,212,0.3), rgba(251,191,36,0.15))`,
                        }} />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] text-white/50 font-mono">{state.effects.gradientAngle}°</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Shadow Presets */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🌑 Shadow Presets</h4>
                <div className="grid grid-cols-3 gap-2">
                    {SHADOW_PRESETS.map(sp => (
                        <button key={sp.id} onClick={() => update({ shadowPreset: sp.id })}
                            className={cn("p-3 rounded-xl transition-all border text-center",
                                state.effects.shadowPreset === sp.id ? "bg-rose-500/10 border-rose-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                            <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-purple-500/30 to-cyan-500/30 mb-2" style={sp.style} />
                            <p className="text-xs text-white/80 font-medium">{sp.label}</p>
                            <p className="text-[9px] text-white/50 mt-0.5">{sp.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Liquid Glass UI Toggle */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🧊 Liquid Glass UI</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-sm text-white/70">Aplicar a la Interfaz</span>
                            <p className="text-[10px] text-white/50 mt-0.5">Activa efectos de vidrio líquido en paneles y tarjetas</p>
                        </div>
                        <button onClick={() => update({ liquidGlassUI: !state.effects.liquidGlassUI })}
                            className={cn("relative w-10 h-5 rounded-full transition-all",
                                state.effects.liquidGlassUI ? "bg-cyan-500/40" : "bg-white/10")}>
                            <div className={cn("absolute w-4 h-4 rounded-full top-0.5 transition-all",
                                state.effects.liquidGlassUI ? "left-[22px] bg-cyan-400" : "left-0.5 bg-white/40")} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Live Effect Preview */}
            <div className="space-y-2">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">Vista Previa de Efectos</h4>
                <div className="relative h-32 rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-br from-purple-900/30 to-cyan-900/30">
                    <div className="absolute inset-4 rounded-xl flex items-center justify-center"
                        style={{
                            backdropFilter: `blur(${state.effects.backdropBlur}px) saturate(${state.effects.glassSaturation}%)`,
                            WebkitBackdropFilter: `blur(${state.effects.backdropBlur}px) saturate(${state.effects.glassSaturation}%)`,
                            background: `rgba(255,255,255,0.05)`,
                            border: `1px solid rgba(255,255,255,${state.effects.glowIntensity * 0.15})`,
                            boxShadow: `0 0 ${state.effects.glowIntensity * 20}px rgba(139,92,246,${state.effects.glowIntensity * 0.3})`,
                        }}>
                        <span className="text-white/60 text-sm font-medium">Glass Effect Preview</span>
                    </div>
                    {/* Colored circles behind glass */}
                    <div className="absolute top-4 left-6 w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 opacity-60" />
                    <div className="absolute bottom-4 right-8 w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-purple-600 opacity-60" />
                    <div className="absolute top-8 right-20 w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 opacity-50" />
                </div>
            </div>
        </div>
    );
}
