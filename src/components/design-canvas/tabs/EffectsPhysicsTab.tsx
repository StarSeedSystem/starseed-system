"use client";

import React, { useRef, useState, useEffect } from "react";
import { } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";

import { Switch } from "@/components/ui/switch";
import { SettingControl } from "../controls/SettingControl";





interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "rose", onHighlight }: {
    label: string; description?: string; id: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight: (id: string | null) => void;
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
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg",
                    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    colors[color] || colors.rose)} />
        </SettingControl>
    );
}

const SHADOW_PRESETS: { id: CanvasState["effects"]["shadowPreset"]; label: string; desc: string; style: React.CSSProperties }[] = [
    { id: "soft", label: "Suave", desc: "Sombras sutiles", style: { boxShadow: "0 2px 8px rgba(0,0,0,0.15)" } },
    { id: "medium", label: "Medio", desc: "Profundidad balanceada", style: { boxShadow: "0 4px 16px rgba(0,0,0,0.25)" } },
    { id: "dramatic", label: "Dramático", desc: "Sombras profundas", style: { boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)" } },
];

const MODE_INFO: Record<string, { label: string; description: string; emoji: string }> = {
    standard: { label: "Standard", description: "Refracción clásica con bordes naturales", emoji: "🔷" },
    polar: { label: "Polar", description: "Efecto de coordenadas polares envolvente", emoji: "🌀" },
    prominent: { label: "Prominent", description: "Realce de bordes y profundidad extra", emoji: "💎" },
    shader: { label: "Shader", description: "Renderizado GPU preciso (experimental)", emoji: "⚡" },
};

export function EffectsPhysicsTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const update = (p: Partial<CanvasState["effects"]>) => {
        dispatch({ type: "SET_EFFECTS", payload: p });
        scrollToPreview('family-wrapper-effects');
    };

    const updateEnv = (p: Partial<CanvasState["environment"]>) => {
        dispatch({ type: "SET_ENVIRONMENT", payload: p });
        scrollToPreview('preview-environment');
    };

    const mouseAreaRef = useRef<HTMLDivElement>(null);
    const [demoClickCount, setDemoClickCount] = useState(0);

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const { effects, environment: env } = state;

    const sections = [
        {
            title: "💧 Liquid Glass",
            items: [
                { label: "Escala de Desplazamiento", description: "Intensidad de la distorsión del vidrio", key: "displacementScale" as const, min: 0, max: 200, step: 5, unit: "px", color: "cyan" as const },
                { label: "Desenfoque (Blur)", description: "Suavidad de la refracción interna", key: "blurAmount" as const, min: 0, max: 4, step: 0.1, unit: "px", color: "cyan" as const },
                { label: "Saturación", description: "Intensidad del color dentro del vidrio", key: "glassSaturation" as const, min: 100, max: 200, step: 5, unit: "%", color: "purple" as const },
                { label: "Aberración Cromática", description: "Separación RGB en bordes (Prisma)", key: "chromaticAberration" as const, min: 0, max: 5, step: 0.1, unit: "px", color: "purple" as const },
                { label: "Elasticidad", description: "Rebote fluido en interacciones", key: "elasticity" as const, min: 0, max: 0.8, step: 0.05, color: "rose" as const },
            ],
        },
        {
            title: "🔮 Material de Fondo",
            items: [
                { label: "Backdrop Blur", description: "Desenfoque del fondo detrás del vidrio", key: "backdropBlur" as const, min: 0, max: 40, step: 1, unit: "px", color: "rose" as const },
                { label: "Índice de Refracción", description: "Cuánto se dobla la luz", key: "refractionIndex" as const, min: 1.0, max: 2.0, step: 0.01, color: "purple" as const },
                { label: "Opacidad Ruido (Noise)", description: "Textura de grano de película", key: "noiseOpacity" as const, min: 0, max: 0.15, step: 0.005, color: "rose" as const },
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-semibold text-white">Efectos & Física</h3>
                <p className="text-xs text-white/60">Liquid glass, refracción, blur, glow, parallax y sombras</p>
            </div>

            {/* ENVIRONMENT CONTROL */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center justify-between">
                    <span>🌌 Ambiente de Refracción</span>
                    <Switch checked={env.show} onCheckedChange={(c) => updateEnv({ show: c })} />
                </h4>

                {env.show && (
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                        <div className="grid grid-cols-3 gap-2">
                            {(['orbs', 'grid', 'abstract'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => updateEnv({ type: t })}
                                    className={cn(
                                        "px-2 py-3 rounded-xl border text-center transition-all",
                                        env.type === t
                                            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
                                            : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5 hover:text-white/70"
                                    )}
                                >
                                    <span className="text-lg block mb-1">
                                        {t === 'orbs' ? '🔮' : t === 'grid' ? '🕸️' : '🌫️'}
                                    </span>
                                    <span className="text-[10px] uppercase font-medium tracking-wide">
                                        {t}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <Slider
                            label="Intensidad del Ambiente"
                            id="env-intensity"
                            description="Brillo del entorno reflejado"
                            value={env.intensity}
                            min={0} max={1} step={0.05}
                            onChange={(v) => updateEnv({ intensity: v })}
                            color="purple"
                            onHighlight={() => { }}
                        />
                    </div>
                )}
            </div>

            {/* SLIDERS */}
            {sections.map(section => (
                <div key={section.title} className="space-y-3">
                    <h4 className="text-xs text-white/60 uppercase tracking-wider">{section.title}</h4>
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                        {section.items.map(item => (
                            <Slider key={item.key}
                                label={item.label}
                                description={item.description}
                                id={item.key}
                                value={(state.effects[item.key] as number) ?? 0}
                                min={item.min} max={item.max} step={item.step}
                                unit={"unit" in item ? item.unit : undefined}
                                color={item.color}
                                onChange={v => update({ [item.key]: v })}
                                onHighlight={handleHighlight}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* REFRACTION MODE */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🔬 Modo de Refracción</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        {(["standard", "polar", "prominent", "shader"] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => {
                                    update({ mode: m });
                                    scrollToPreview('family-wrapper-effects');
                                }}
                                className={cn(
                                    "relative overflow-hidden rounded-xl border transition-all text-left group",
                                    effects.mode === m
                                        ? "border-cyan-500/40 bg-cyan-500/10 ring-1 ring-cyan-500/20"
                                        : "border-white/5 bg-white/3 hover:bg-white/5"
                                )}
                            >
                                <div className="px-2.5 py-3">
                                    <span className="text-[11px] font-medium text-white/90 flex items-center gap-1 group-hover:text-cyan-300 transition-colors">
                                        {MODE_INFO[m].emoji} {MODE_INFO[m].label}
                                    </span>
                                    <p className="text-[9px] text-white/40 mt-0.5 leading-tight">{MODE_INFO[m].description}</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    <SettingControl
                        id="effects-overlight"
                        label="Modo Claro (Over Light)"
                        description="Optimizar bordes para fondos claros"
                        onHighlight={handleHighlight}
                    >
                        <Switch checked={effects.overLight} onCheckedChange={(c) => update({ overLight: c })} />
                    </SettingControl>
                </div>
            </div>

            {/* INTERACTIVE DEMOS MOVED TO PREVIEW */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-xs text-white/60">
                    Observe los efectos de Liquid Glass y Física en el panel de vista previa (derecha).
                </p>
            </div>

            {/* LIQUID UI TOGGLE */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider">🧊 Integración UI</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5">
                    <SettingControl
                        id="effects-liquidui-toggle"
                        label="Aplicar Globalmente"
                        description="Usar Liquid Glass en todos los componentes compatibles del sistema"
                        onHighlight={handleHighlight}
                    >
                        <Switch
                            checked={effects.liquidGlassUI}
                            onCheckedChange={() => update({ liquidGlassUI: !effects.liquidGlassUI })}
                            className={cn(effects.liquidGlassUI && "bg-cyan-500/40")}
                        />
                    </SettingControl>
                </div>
            </div>

        </div>
    );
}
