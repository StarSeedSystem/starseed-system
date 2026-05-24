"use client";

import React from "react";
import {
    Image as ImageIcon, Video, Palette, Sparkles, Layers,
    Settings2, RefreshCw, Bot, Waves, Play
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import { SettingControl } from "../controls/SettingControl";
import { Input } from "@/components/ui/input";

interface Props {
    state: CanvasState;
    dispatch: React.Dispatch<any>;
}

// ─── Shared Controls ─────────────────────────────────────────
function Toggle({ on, onToggle, label, description, id, onHighlight }: {
    on: boolean; onToggle: () => void; label: string; description?: string; id?: string; onHighlight?: (id: string | null) => void;
}) {
    return (
        <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}
            headerAction={
                <button onClick={onToggle} className={cn("relative w-10 h-5 rounded-full transition-all", on ? "bg-fuchsia-500/40" : "bg-white/10")}>
                    <div className={cn("absolute w-4 h-4 rounded-full top-0.5 transition-all", on ? "left-[22px] bg-fuchsia-400" : "left-0.5 bg-white/40")} />
                </button>
            }
        />
    );
}

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "fuchsia", onHighlight }: {
    label: string; description?: string; id?: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight?: (id: string | null) => void;
}) {
    return (
        <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}
            headerAction={<span className="text-white/70 font-mono text-[11px]">{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}{unit}</span>}
        >
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
                className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                    `accent-${color}-500`,
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    color === "fuchsia" && "[&::-webkit-slider-thumb]:bg-fuchsia-400",
                    color === "cyan" && "[&::-webkit-slider-thumb]:bg-cyan-400",
                )}
            />
        </SettingControl>
    );
}

function OptionChips<T extends string>({ options, value, onChange, color = "fuchsia", label, description, id, onHighlight }: {
    options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; color?: string;
    label?: string; description?: string; id?: string; onHighlight?: (id: string | null) => void;
}) {
    const colorMap: Record<string, string> = {
        fuchsia: "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300",
        cyan: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
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

function SectionHeader({ icon: Icon, title, color = "text-fuchsia-400" }: { icon: any; title: string; color?: string }) {
    return (
        <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2">
            <Icon className={cn("w-3 h-3", color)} /> {title}
        </h4>
    );
}

function FamilySection({ id, children }: { id: string; children: React.ReactNode }) {
    return <div id={`family-${id}`} className="space-y-3 scroll-mt-4">{children}</div>;
}

export function BackgroundsTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const update = (p: Partial<CanvasState["backgrounds"]>, family?: string) => {
        dispatch({ type: "SET_BACKGROUNDS", payload: p });
        if (family) scrollToPreview(`family-wrapper-${family}`);
    };

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const { backgrounds, palette } = state;

    const BK_TYPES = [
        { id: "solid", label: "Sólido", icon: Palette },
        { id: "gradient", label: "Gradiente", icon: Layers },
        { id: "mesh", label: "Mesh", icon: Sparkles },
        { id: "video", label: "Video", icon: Video },
        { id: "image", label: "Imagen", icon: ImageIcon }
    ];

    return (
        <div className="space-y-8 p-1 pb-20">
            {/* ═══ TIPO DE FONDO ═══ */}
            <FamilySection id="background-types">
                <SectionHeader icon={ImageIcon} title="Ambiente y Fondo" />
                <div className="grid grid-cols-5 gap-2">
                    {BK_TYPES.map(type => (
                        <button
                            key={type.id}
                            onClick={() => update({ type: type.id as any })}
                            className={cn(
                                "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all",
                                backgrounds.type === type.id
                                    ? "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400"
                                    : "bg-white/3 border-white/5 hover:bg-white/5 text-white/50"
                            )}
                        >
                            <type.icon className="w-4 h-4" />
                            <span className="text-[10px] font-medium">{type.label}</span>
                        </button>
                    ))}
                </div>
            </FamilySection>

            {/* ═══ CONTROLES ESPECÍFICOS ═══ */}
            <div className="bg-white/3 rounded-2xl p-5 border border-white/5 space-y-6">
                {backgrounds.type === "solid" && (
                    <SettingControl id="surfaceColor" label="Color de Fondo" onHighlight={handleHighlight}>
                        <div className="flex gap-2">
                            <Input
                                type="color"
                                value={palette.surface}
                                onChange={(e) => dispatch({ type: "SET_PALETTE", payload: { surface: e.target.value } })}
                                className="w-12 h-10 p-1 bg-transparent border-white/10"
                            />
                            <Input
                                value={palette.surface}
                                onChange={(e) => dispatch({ type: "SET_PALETTE", payload: { surface: e.target.value } })}
                                className="bg-white/5 border-white/10 text-xs font-mono"
                            />
                        </div>
                    </SettingControl>
                )}

                {backgrounds.type === "mesh" && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            {backgrounds.meshColors.map((color, i) => (
                                <SettingControl key={i} id={`meshColor${i}`} label={`Nodo ${i + 1}`} onHighlight={handleHighlight}>
                                    <div className="flex gap-2">
                                        <Input
                                            type="color"
                                            value={color}
                                            onChange={(e) => {
                                                const newColors = [...backgrounds.meshColors];
                                                newColors[i] = e.target.value;
                                                update({ meshColors: newColors as any });
                                            }}
                                            className="w-10 h-8 p-1 bg-transparent border-white/10"
                                        />
                                        <Input
                                            value={color}
                                            onChange={(e) => {
                                                const newColors = [...backgrounds.meshColors];
                                                newColors[i] = e.target.value;
                                                update({ meshColors: newColors as any });
                                            }}
                                            className="h-8 bg-white/5 border-white/10 text-[10px] font-mono"
                                        />
                                    </div>
                                </SettingControl>
                            ))}
                        </div>
                        <Slider
                            label="Velocidad Mesh"
                            id="meshSpeed"
                            value={backgrounds.meshSpeed}
                            min={0}
                            max={20}
                            step={0.5}
                            onChange={(v) => update({ meshSpeed: v })}
                            onHighlight={handleHighlight}
                        />
                    </div>
                )}

                {backgrounds.type === "video" && (
                    <div className="space-y-4">
                        <SettingControl id="videoUrl" label="URL del Video (MP4)" onHighlight={handleHighlight}>
                            <div className="flex gap-2">
                                <Input
                                    value={backgrounds.videoUrl}
                                    onChange={(e) => update({ videoUrl: e.target.value })}
                                    placeholder="https://example.com/video.mp4"
                                    className="bg-white/5 border-white/10 text-xs"
                                />
                                <button className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                    <RefreshCw className="w-4 h-4 opacity-40" />
                                </button>
                            </div>
                        </SettingControl>
                        <p className="text-[10px] text-white/30 italic">Sugerencia: Usa loops abstractos para un efecto premium.</p>
                    </div>
                )}

                <div className="pt-4 border-t border-white/5 space-y-5">
                    <Slider
                        label="Ruido (Noise)"
                        id="noiseIntensity"
                        value={backgrounds.noiseIntensity}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => update({ noiseIntensity: v })}
                        onHighlight={handleHighlight}
                    />

                    <OptionChips
                        label="Patrón overlay"
                        id="backgroundPattern"
                        options={[
                            { id: "none", label: "Ninguno" },
                            { id: "grid", label: "Grilla" },
                            { id: "dots", label: "Puntos" },
                            { id: "noise", label: "Ruido" },
                        ]}
                        value={backgrounds.pattern}
                        onChange={(v: any) => update({ pattern: v })}
                        onHighlight={handleHighlight}
                    />

                    {backgrounds.pattern !== "none" && (
                        <div className="grid grid-cols-2 gap-4">
                            <Slider
                                label="Escala"
                                id="patternScale"
                                value={backgrounds.patternScale || 1}
                                min={10}
                                max={100}
                                step={1}
                                onChange={(v) => update({ patternScale: v })}
                                onHighlight={handleHighlight}
                            />
                            <Slider
                                label="Patrón Opacidad"
                                id="patternOpacity"
                                value={backgrounds.patternOpacity || 0.1}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(v) => update({ patternOpacity: v })}
                                onHighlight={handleHighlight}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ FILTROS MAESTROS ═══ */}
            <FamilySection id="background-filters">
                <SectionHeader icon={Settings2} title="Ajustes de Post-Procesado" color="text-slate-400" />
                <div className="bg-white/3 rounded-2xl p-5 border border-white/5 space-y-6">
                    <Slider
                        label="Desenfoque (Blur)"
                        id="backgroundBlur"
                        value={backgrounds.blur}
                        min={0}
                        max={100}
                        step={1}
                        unit="px"
                        onChange={(v) => update({ blur: v })}
                        onHighlight={handleHighlight}
                    />

                    <Slider
                        label="Opacidad Capa"
                        id="backgroundOpacity"
                        value={backgrounds.opacity}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => update({ opacity: v })}
                        onHighlight={handleHighlight}
                    />

                    <OptionChips
                        label="Modo de Mezcla"
                        id="blendingMode"
                        options={[
                            { id: "normal", label: "Normal" },
                            { id: "overlay", label: "Overlay" },
                            { id: "multiply", label: "Multiply" },
                            { id: "screen", label: "Screen" },
                        ]}
                        value={backgrounds.blendingMode}
                        onChange={(v: any) => update({ blendingMode: v })}
                        onHighlight={handleHighlight}
                    />
                </div>
            </FamilySection>

            {/* ═══ AI STUDIO INTEGRATION ═══ */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-purple-500/10 rounded-2xl p-5 border border-white/10 space-y-3">
                <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-cyan-400" />
                    <span className="text-sm font-bold text-white/90">AI Background Studio</span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                    Genera visuales cuánticos o degradados fractales usando Stitch.
                </p>
                <button className="w-full py-2.5 rounded-xl bg-white/5 border border-white/20 hover:bg-white/10 transition-all text-xs font-bold text-cyan-400 flex items-center justify-center gap-2 mt-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Generar con IA
                </button>
            </div>
        </div>
    );
}
