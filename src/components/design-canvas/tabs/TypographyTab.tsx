"use client";

import React from "react";
import { Type } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../DesignIntegrationCanvas";

interface TypographyTabProps {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
}

const FONT_OPTIONS = [
    { label: "Inter", value: "Inter", style: "Modern sans-serif" },
    { label: "Rajdhani", value: "Rajdhani", style: "Geometric display" },
    { label: "Outfit", value: "Outfit", style: "Rounded geometric" },
    { label: "Space Grotesk", value: "Space Grotesk", style: "Monospaced-inspired" },
    { label: "Sora", value: "Sora", style: "Variable geometric" },
    { label: "Exo 2", value: "Exo 2", style: "Futuristic" },
    { label: "Orbitron", value: "Orbitron", style: "Sci-fi display" },
    { label: "System UI", value: "system-ui", style: "System default" },
];

const MONO_FONTS = [
    { label: "JetBrains Mono", value: "JetBrains Mono" },
    { label: "Fira Code", value: "Fira Code" },
    { label: "Source Code Pro", value: "Source Code Pro" },
    { label: "IBM Plex Mono", value: "IBM Plex Mono" },
];

function SliderControl({
    label,
    value,
    min,
    max,
    step,
    unit,
    onChange,
    color = "purple",
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (val: number) => void;
    color?: string;
}) {
    const colorClasses: Record<string, string> = {
        purple: "accent-purple-500 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-purple-500/40",
        emerald: "accent-emerald-500 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:shadow-emerald-500/40",
        cyan: "accent-cyan-500 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-cyan-500/40",
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs">
                <span className="text-white/50">{label}</span>
                <span className="text-white/70 font-mono text-[11px]">
                    {value}{unit || ""}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className={cn(
                    "w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg",
                    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110",
                    colorClasses[color] || colorClasses.purple
                )}
            />
        </div>
    );
}

export function TypographyTab({ state, dispatch }: TypographyTabProps) {
    const update = (payload: Partial<CanvasState["typography"]>) => {
        dispatch({ type: "SET_TYPOGRAPHY", payload });
    };

    const scalePreview = (level: number) => {
        return Math.round(state.typography.baseSize * Math.pow(state.typography.scaleRatio, level));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/20">
                    <Type className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Tipografía</h3>
                    <p className="text-xs text-white/60">Familias, escalas, pesos y tracking</p>
                </div>
            </div>

            {/* Font Families */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">Familias Tipográficas</h4>

                {/* Main Font */}
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-3">
                    <label className="text-xs text-white/50">Cuerpo Principal</label>
                    <div className="grid grid-cols-2 gap-2">
                        {FONT_OPTIONS.map(f => (
                            <button
                                key={f.value}
                                onClick={() => update({ fontMain: f.value })}
                                className={cn(
                                    "px-3 py-2.5 rounded-xl text-left transition-all border",
                                    state.typography.fontMain === f.value
                                        ? "bg-emerald-500/15 border-emerald-500/30 shadow-lg shadow-emerald-500/5"
                                        : "bg-white/3 border-white/5 hover:bg-white/5"
                                )}
                            >
                                <span
                                    className="text-sm text-white/80 block"
                                    style={{ fontFamily: f.value }}
                                >
                                    {f.label}
                                </span>
                                <span className="text-[10px] text-white/50">{f.style}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Headline Font */}
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-3">
                    <label className="text-xs text-white/50">Titulares</label>
                    <div className="grid grid-cols-2 gap-2">
                        {FONT_OPTIONS.slice(0, 6).map(f => (
                            <button
                                key={f.value}
                                onClick={() => update({ fontHeadline: f.value })}
                                className={cn(
                                    "px-3 py-2 rounded-xl text-left transition-all border",
                                    state.typography.fontHeadline === f.value
                                        ? "bg-cyan-500/15 border-cyan-500/30"
                                        : "bg-white/3 border-white/5 hover:bg-white/5"
                                )}
                            >
                                <span className="text-sm text-white/80" style={{ fontFamily: f.value }}>
                                    {f.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Monospace Font */}
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-3">
                    <label className="text-xs text-white/50">Código / Monospace</label>
                    <div className="grid grid-cols-2 gap-2">
                        {MONO_FONTS.map(f => (
                            <button
                                key={f.value}
                                onClick={() => update({ fontCode: f.value })}
                                className={cn(
                                    "px-3 py-2 rounded-xl text-left transition-all border font-mono",
                                    state.typography.fontCode === f.value
                                        ? "bg-amber-500/15 border-amber-500/30"
                                        : "bg-white/3 border-white/5 hover:bg-white/5"
                                )}
                            >
                                <span className="text-xs text-white/70">{f.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Scale & Sizing */}
            <div className="space-y-4">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">Escala & Tamaño</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <SliderControl
                        label="Tamaño Base"
                        value={state.typography.baseSize}
                        min={12}
                        max={24}
                        step={1}
                        unit="px"
                        onChange={(v) => update({ baseSize: v })}
                        color="emerald"
                    />
                    <SliderControl
                        label="Ratio de Escala"
                        value={state.typography.scaleRatio}
                        min={1.1}
                        max={2.0}
                        step={0.01}
                        unit="×"
                        onChange={(v) => update({ scaleRatio: v })}
                        color="cyan"
                    />

                    {/* Scale Preview */}
                    <div className="pt-3 border-t border-white/5 space-y-2">
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">Escala Resultante</p>
                        {[3, 2, 1, 0, -1].map(level => (
                            <div key={level} className="flex items-baseline gap-3">
                                <span className="text-[10px] text-white/20 w-8">H{3 - level > 0 ? 3 - level : "·"}</span>
                                <span
                                    className="text-white/60 transition-all"
                                    style={{
                                        fontSize: `${scalePreview(level)}px`,
                                        fontFamily: level > 0 ? state.typography.fontHeadline : state.typography.fontMain,
                                        fontWeight: level > 0 ? state.typography.headerWeight : state.typography.bodyWeight,
                                    }}
                                >
                                    {scalePreview(level)}px — Texto de ejemplo
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Weights & Tracking */}
            <div className="space-y-4">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">Pesos & Espaciado</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <SliderControl
                        label="Peso de Titulares"
                        value={state.typography.headerWeight}
                        min={100}
                        max={900}
                        step={100}
                        onChange={(v) => update({ headerWeight: v })}
                        color="emerald"
                    />
                    <SliderControl
                        label="Peso del Cuerpo"
                        value={state.typography.bodyWeight}
                        min={100}
                        max={700}
                        step={100}
                        onChange={(v) => update({ bodyWeight: v })}
                        color="cyan"
                    />
                    <SliderControl
                        label="Tracking Titulares"
                        value={state.typography.headerTracking}
                        min={-0.05}
                        max={0.2}
                        step={0.005}
                        unit="em"
                        onChange={(v) => update({ headerTracking: v })}
                        color="emerald"
                    />
                    <SliderControl
                        label="Tracking Cuerpo"
                        value={state.typography.bodyTracking}
                        min={0}
                        max={0.1}
                        step={0.005}
                        unit="em"
                        onChange={(v) => update({ bodyTracking: v })}
                        color="cyan"
                    />
                </div>
            </div>
        </div>
    );
}
