"use client";

import React from "react";
import { LayoutGrid, Grid3X3, Maximize2, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../DesignIntegrationCanvas";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, value, min, max, step, unit, onChange, color = "blue" }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string;
}) {
    const colors: Record<string, string> = {
        blue: "accent-blue-500 [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:shadow-blue-500/40",
        indigo: "accent-indigo-500 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:shadow-indigo-500/40",
        sky: "accent-sky-500 [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-sky-500/40",
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
                    colors[color] || colors.blue)} />
        </div>
    );
}

const SPACING_LABELS: Record<string, string> = {
    "0.8": "Compacto",
    "0.9": "Ajustado",
    "1": "Default",
    "1.1": "Holgado",
    "1.2": "Espacioso",
};

export function LayoutGeometryTab({ state, dispatch }: Props) {
    const update = (p: Partial<CanvasState["geometry"]>) => dispatch({ type: "SET_GEOMETRY", payload: p });

    const spacingLabel = SPACING_LABELS[state.geometry.spacingScale.toString()] || `${state.geometry.spacingScale}×`;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center border border-blue-500/20">
                    <LayoutGrid className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Layout & Geometría</h3>
                    <p className="text-xs text-white/60">Bordes, espaciado, grid, elevación y Dock</p>
                </div>
            </div>

            {/* Border Radius */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">⬡ Border Radius</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <Slider label="Small (chips, tags)" value={state.geometry.radiusSm} min={0} max={16} step={1} unit="px" onChange={v => update({ radiusSm: v })} />
                    <Slider label="Medium (buttons, inputs)" value={state.geometry.radiusMd} min={0} max={32} step={1} unit="px" onChange={v => update({ radiusMd: v })} color="indigo" />
                    <Slider label="Large (cards, panels)" value={state.geometry.radiusLg} min={0} max={48} step={1} unit="px" onChange={v => update({ radiusLg: v })} color="sky" />
                    <Slider label="XL (modals, sheets)" value={state.geometry.radiusXl} min={0} max={64} step={1} unit="px" onChange={v => update({ radiusXl: v })} />
                </div>

                {/* Radius Preview */}
                <div className="flex gap-3 items-end">
                    {[
                        { label: "sm", r: state.geometry.radiusSm },
                        { label: "md", r: state.geometry.radiusMd },
                        { label: "lg", r: state.geometry.radiusLg },
                        { label: "xl", r: state.geometry.radiusXl },
                    ].map(item => (
                        <div key={item.label} className="flex flex-col items-center gap-1.5">
                            <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20"
                                style={{ borderRadius: `${item.r}px` }} />
                            <span className="text-[10px] text-white/50 font-mono">{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Spacing Scale */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2"><Rows3 className="w-3 h-3" /> Escala de Espaciado</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex justify-between text-xs">
                        <span className="text-white/50">Densidad</span>
                        <span className="text-white/70 font-medium">{spacingLabel}</span>
                    </div>
                    <input type="range" min={0.8} max={1.2} step={0.1} value={state.geometry.spacingScale}
                        onChange={e => update({ spacingScale: parseFloat(e.target.value) })}
                        className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                            "accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:shadow-lg",
                            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20")} />
                    {/* Spacing preview */}
                    <div className="flex flex-col gap-1">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-6 rounded-md bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border border-blue-500/10"
                                style={{ marginBottom: `${4 * state.geometry.spacingScale}px` }} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Grid Columns */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2"><Grid3X3 className="w-3 h-3" /> Grid Columns</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map(cols => (
                            <button key={cols} onClick={() => update({ gridColumns: cols })}
                                className={cn("flex-1 p-2 rounded-xl transition-all border",
                                    state.geometry.gridColumns === cols ? "bg-indigo-500/15 border-indigo-500/30" : "bg-white/3 border-white/5 hover:bg-white/5")}>
                                <div className={cn("grid gap-1", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-2", cols === 3 && "grid-cols-3", cols === 4 && "grid-cols-4")}>
                                    {Array.from({ length: cols }).map((_, j) => (
                                        <div key={j} className="h-4 rounded-sm bg-indigo-400/30" />
                                    ))}
                                </div>
                                <span className="text-[10px] text-white/50 mt-1 block text-center">{cols} col{cols > 1 ? "s" : ""}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content Max Width */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2"><Maximize2 className="w-3 h-3" /> Content Max Width</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Slider label="Max Width" value={state.geometry.contentMaxWidth} min={768} max={1920} step={64} unit="px" onChange={v => update({ contentMaxWidth: v })} color="indigo" />
                    {/* Width preview */}
                    <div className="relative h-6 rounded-md bg-white/3 border border-white/5 overflow-hidden">
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-md bg-indigo-500/20 border border-indigo-500/20 transition-all"
                            style={{ width: `${(state.geometry.contentMaxWidth / 1920) * 100}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-white/50 font-mono">{state.geometry.contentMaxWidth}px</div>
                    </div>
                </div>
            </div>

            {/* Golden Ratio & Spacing */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">📐 Proporción & Espaciado</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <Slider label="Golden Ratio" value={state.geometry.goldenRatio} min={1.0} max={2.0} step={0.01} unit="×" onChange={v => update({ goldenRatio: v })} color="indigo" />
                    <Slider label="Panel Blur" value={state.geometry.panelBlur} min={0} max={40} step={1} unit="px" onChange={v => update({ panelBlur: v })} color="sky" />
                    <Slider label="Tab Curvature" value={state.geometry.tabCurvature} min={0} max={32} step={1} unit="px" onChange={v => update({ tabCurvature: v })} />
                </div>
            </div>

            {/* Dock Configuration */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🚀 Dock Configuration</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <Slider label="Dock Margin" value={state.geometry.dockMargin} min={0} max={32} step={1} unit="px" onChange={v => update({ dockMargin: v })} />
                    <Slider label="Icon Size" value={state.geometry.dockIconSize} min={16} max={48} step={1} unit="px" onChange={v => update({ dockIconSize: v })} color="indigo" />
                    <Slider label="Magnification" value={state.geometry.dockMagnification} min={1.0} max={2.0} step={0.05} unit="×" onChange={v => update({ dockMagnification: v })} color="sky" />
                </div>
            </div>

            {/* Window Config */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🪟 Window Parameters</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <Slider label="Title Bar Height" value={state.geometry.windowTitleBarHeight} min={28} max={64} step={1} unit="px" onChange={v => update({ windowTitleBarHeight: v })} />
                </div>
            </div>
        </div>
    );
}
