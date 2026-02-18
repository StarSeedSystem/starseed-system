"use client";

import React, { useState } from "react";
import { Palette, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import { SettingControl } from "../controls/SettingControl";

interface ColorPaletteTabProps {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
}

function ColorSwatch({
    label,
    color,
    onChange,
    id,
    onHighlight
}: {
    label: string;
    color: string;
    onChange: (val: string) => void;
    id?: string;
    onHighlight?: (id: string | null) => void;
}) {
    return (
        <div
            className="flex items-center gap-3 group"
            onMouseEnter={() => id && onHighlight && onHighlight(id)}
            onMouseLeave={() => id && onHighlight && onHighlight(null)}
        >
            <div className="relative">
                <div
                    className="w-10 h-10 rounded-xl border border-white/10 shadow-inner cursor-pointer transition-transform group-hover:scale-105"
                    style={{ backgroundColor: color }}
                />
                <input
                    type="color"
                    value={color.startsWith("rgba") || color.startsWith("#") ? (color.startsWith("#") ? color : "#000000") : color}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-xs text-white/70 font-medium truncate">{label}</p>
                    {/* Optional Info Icon could go here via TooltipTrigger/SettingControl logic if needed */}
                </div>
                <p className="text-[10px] text-white/50 font-mono">{color}</p>
            </div>
        </div>
    );
}

function RangeSlider({
    label,
    value,
    min,
    max,
    step,
    unit,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (val: number) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs">
                <span className="text-white/50">{label}</span>
                <span className="text-white/70 font-mono">
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
                className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-500
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-purple-500/40
                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20
                    [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
            />
        </div>
    );
}

export function ColorPaletteTab({ state, dispatch }: ColorPaletteTabProps) {
    const [expandedSection, setExpandedSection] = useState<string | null>("core");

    const toggleSection = (s: string) => setExpandedSection(expandedSection === s ? null : s);

    const { scrollToPreview } = usePreviewSync();

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const updateColor = (key: keyof CanvasState["palette"], value: string) => {
        dispatch({ type: "SET_PALETTE", payload: { [key]: value } });
        scrollToPreview("family-wrapper-palette");
    };

    const updateTrinity = (axis: string, field: string, value: string) => {
        dispatch({
            type: "SET_TRINITY",
            payload: {
                [axis]: { ...state.palette.trinity[axis as keyof typeof state.palette.trinity], [field]: value },
            },
        });
        scrollToPreview("family-wrapper-palette");
    };

    const sections = [
        {
            id: "core",
            title: "Colores Principales",
            colors: [
                { label: "Primario", key: "primary" as const, color: state.palette.primary },
                { label: "Secundario", key: "secondary" as const, color: state.palette.secondary },
                { label: "Acento", key: "accent" as const, color: state.palette.accent },
                { label: "Fondo", key: "background" as const, color: state.palette.background },
            ],
        },
        {
            id: "text",
            title: "Texto & Superficie",
            colors: [
                { label: "Texto Principal", key: "textPrimary" as const, color: state.palette.textPrimary },
                { label: "Superficie", key: "surface" as const, color: state.palette.surface },
                { label: "Borde Cristal", key: "glassBorder" as const, color: state.palette.glassBorder },
            ],
        },
    ];

    const trinityAxes = [
        {
            axis: "zenith", label: "⬆ Zenith", desc: "Exploración universal", fields: [
                { field: "active", label: "Activo" },
                { field: "glow", label: "Glow" },
            ]
        },
        {
            axis: "horizonte", label: "➡ Horizonte", desc: "Comunidad social", fields: [
                { field: "active", label: "Activo" },
                { field: "panel", label: "Panel" },
            ]
        },
        {
            axis: "nucleo", label: "⬇ Núcleo", desc: "Producción y lógica", fields: [
                { field: "creation", label: "Creación" },
                { field: "logic", label: "Lógica" },
                { field: "panel", label: "Panel" },
            ]
        },
        {
            axis: "base", label: "◆ Base", desc: "Sistema central", fields: [
                { field: "active", label: "Activo" },
                { field: "neutral", label: "Neutral" },
            ]
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/20">
                    <Palette className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Paleta de Colores</h3>
                    <p className="text-xs text-white/60">Trinity axes, colores base, cristal y glow</p>
                </div>
            </div>

            {/* COLOR PRESETS */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2">🎨 Presets de Color</h4>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: "Cyber Neon", colors: { primary: "#d946ef", secondary: "#06b6d4", accent: "#f43f5e", background: "#0f172a" } },
                        { label: "Deep Sea", colors: { primary: "#3b82f6", secondary: "#10b981", accent: "#f59e0b", background: "#020617" } },
                        { label: "Golden Rose", colors: { primary: "#f43f5e", secondary: "#fbbf24", accent: "#ec4899", background: "#18181b" } },
                        { label: "Matrix Edge", colors: { primary: "#22c55e", secondary: "#14b8a6", accent: "#84cc16", background: "#050505" } },
                    ].map(preset => (
                        <button key={preset.label} onClick={() => dispatch({ type: "SET_PALETTE", payload: preset.colors })}
                            className="p-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/20 transition-all text-left flex items-center gap-2">
                            <div className="flex -space-x-1.5">
                                <div className="w-3.5 h-3.5 rounded-full border border-black/20" style={{ backgroundColor: preset.colors.primary }} />
                                <div className="w-3.5 h-3.5 rounded-full border border-black/20" style={{ backgroundColor: preset.colors.secondary }} />
                                <div className="w-3.5 h-3.5 rounded-full border border-black/20" style={{ backgroundColor: preset.colors.accent }} />
                            </div>
                            <span className="text-[10px] font-bold text-white/70">{preset.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Core & Text Colors */}
            {sections.map(section => (
                <div key={section.id} className="space-y-3">
                    <button
                        onClick={() => toggleSection(section.id)}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <h4 className="text-xs text-white/60 uppercase tracking-wider font-semibold">{section.title}</h4>
                        {expandedSection === section.id ? (
                            <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                        )}
                    </button>
                    {expandedSection === section.id && (
                        <div className="grid grid-cols-2 gap-4 bg-white/3 rounded-2xl p-4 border border-white/5">
                            {section.colors.map(c => (
                                <ColorSwatch
                                    key={c.key}
                                    id={c.key}
                                    label={c.label}
                                    color={c.color}
                                    onChange={(val) => updateColor(c.key, val)}
                                    onHighlight={handleHighlight}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {/* Trinity Axes */}
            <div className="space-y-3">
                <button
                    onClick={() => toggleSection("trinity")}
                    className="flex items-center justify-between w-full text-left"
                >
                    <h4 className="text-xs text-white/60 uppercase tracking-wider font-semibold">Ejes Trinity</h4>
                    {expandedSection === "trinity" ? (
                        <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                    )}
                </button>
                {expandedSection === "trinity" && (
                    <div className="space-y-4">
                        {trinityAxes.map(ta => {
                            const axisData = (state.palette.trinity?.[ta.axis as keyof typeof state.palette.trinity] || {}) as Record<string, string>;
                            return (
                                <div key={ta.axis} className="bg-white/3 rounded-2xl p-4 border border-white/5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <span className="text-sm font-medium text-white/80">{ta.label}</span>
                                            <span className="text-xs text-white/50 ml-2">{ta.desc}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {ta.fields.map(f => {
                                            const id = `trinity-${ta.axis}-${f.field}`;
                                            return (
                                                <ColorSwatch
                                                    key={f.field}
                                                    id={id}
                                                    label={f.label}
                                                    color={axisData[f.field] || "#000000"}
                                                    onChange={(val) => updateTrinity(ta.axis, f.field, val)}
                                                    onHighlight={handleHighlight}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Live Palette Preview */}
            <div className="space-y-2">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">Vista Previa de Paleta</h4>
                <div className="flex gap-1.5 rounded-2xl overflow-hidden h-12 border border-white/5">
                    {[
                        state.palette.primary,
                        state.palette.secondary,
                        state.palette.accent,
                        state.palette.trinity?.zenith?.active || "#06B6D4",
                        state.palette.trinity?.horizonte?.active || "#EF4444",
                        state.palette.trinity?.nucleo?.creation || "#10B981",
                        state.palette.trinity?.base?.active || "#8B5CF6",
                    ].map((c, i) => (
                        <div
                            key={i}
                            className="flex-1 transition-all hover:flex-[2]"
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
