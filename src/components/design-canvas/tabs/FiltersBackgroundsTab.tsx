"use client";

import React from "react";
import { Image, Layers, Droplets, Palette, Film, Waves, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingControl } from "../controls/SettingControl";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "fuchsia", onHighlight }: {
    label: string; description?: string; id?: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight?: (id: string | null) => void;
}) {
    const colors: Record<string, string> = {
        fuchsia: "accent-fuchsia-500 [&::-webkit-slider-thumb]:bg-fuchsia-400 [&::-webkit-slider-thumb]:shadow-fuchsia-500/40",
    };
    return (
        <SettingControl
            id={id || label}
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
                    colors[color] || colors.fuchsia)} />
        </SettingControl>
    );
}

export function FiltersBackgroundsTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const update = (p: Partial<CanvasState["backgrounds"]>) => {
        dispatch({ type: "SET_BACKGROUNDS", payload: p });
        scrollToPreview("preview-environment");
    };

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const { backgrounds } = state;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 flex items-center justify-center border border-fuchsia-500/20">
                    <Image className="w-5 h-5 text-fuchsia-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Filtros & Fondos</h3>
                    <p className="text-xs text-white/60">Ambiente, mesh gradients y texturas</p>
                </div>
            </div>

            <Tabs defaultValue="type" className="w-full">
                <TabsList className="w-full grid grid-cols-3 bg-white/5 p-1 rounded-xl mb-4">
                    <TabsTrigger value="type" className="text-xs">Tipo</TabsTrigger>
                    <TabsTrigger value="mesh" className="text-xs">Mesh Gen</TabsTrigger>
                    <TabsTrigger value="media" className="text-xs">Media</TabsTrigger>
                </TabsList>

                {/* TYPE TAB */}
                <TabsContent value="type" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <SettingControl
                            id="background-type"
                            label="Modo de Fondo"
                            description="Selecciona el estilo base del fondo"
                            onHighlight={handleHighlight}
                        >
                            <Select value={backgrounds.type} onValueChange={(v: any) => update({ type: v })}>
                                <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="solid">Sólido</SelectItem>
                                    <SelectItem value="gradient">Gradiente</SelectItem>
                                    <SelectItem value="mesh">Mesh 3D</SelectItem>
                                    <SelectItem value="image">Imagen</SelectItem>
                                    <SelectItem value="video">Video Loop</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingControl>

                        <SettingControl
                            id="background-pattern"
                            label="Textura Overlay"
                            description="Patrones sutiles sobre el fondo"
                            onHighlight={handleHighlight}
                        >
                            <Select value={backgrounds.pattern} onValueChange={(v: any) => update({ pattern: v })}>
                                <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="none">Clean</SelectItem>
                                    <SelectItem value="grid">Grid (Cyber)</SelectItem>
                                    <SelectItem value="dots">Dots (Technical)</SelectItem>
                                    <SelectItem value="noise">Noise (Film)</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingControl>

                        <div className="pt-4 border-t border-white/5 space-y-4">
                            <Slider
                                id="background-opacity"
                                label="Opacidad Capa"
                                description="Transparencia general del fondo"
                                value={backgrounds.opacity}
                                min={0} max={1} step={0.05}
                                onChange={v => update({ opacity: v })}
                                onHighlight={handleHighlight}
                            />
                            <Slider
                                id="background-blur"
                                label="Blur Atmosférico"
                                description="Difuminado del fondo para profundidad"
                                value={backgrounds.blur}
                                min={0} max={100} step={5} unit="px"
                                onChange={v => update({ blur: v })}
                                onHighlight={handleHighlight}
                            />
                            {backgrounds.pattern === 'noise' && (
                                <Slider
                                    id="noise-intensity"
                                    label="Intensidad Ruido"
                                    description="Fuerza del efecto de grano"
                                    value={backgrounds.noiseIntensity || 0.5}
                                    min={0} max={1} step={0.05}
                                    onChange={v => update({ noiseIntensity: v })}
                                    onHighlight={handleHighlight}
                                />
                            )}
                            {backgrounds.pattern !== 'none' && backgrounds.pattern !== 'noise' && (
                                <>
                                    <Slider
                                        id="pattern-opacity"
                                        label="Opacidad Patrón"
                                        description="Visibilidad de la textura"
                                        value={backgrounds.patternOpacity || 0.1}
                                        min={0} max={1} step={0.05}
                                        onChange={v => update({ patternOpacity: v })}
                                        onHighlight={handleHighlight}
                                    />
                                    <Slider
                                        id="pattern-scale"
                                        label="Escala Patrón"
                                        description="Tamaño de la repetición"
                                        value={backgrounds.patternScale || 20}
                                        min={4} max={100} step={2} unit="px"
                                        onChange={v => update({ patternScale: v })}
                                        onHighlight={handleHighlight}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* MESH TAB */}
                <TabsContent value="mesh" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Palette className="w-3.5 h-3.5 text-fuchsia-400" />
                            <span className="text-xs text-white/70">Puntos de Color (Mesh)</span>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {backgrounds.meshColors?.map((color, index) => (
                                <div key={index} className="space-y-1">
                                    <div
                                        className="w-full h-8 rounded-lg border border-white/10 cursor-pointer hover:border-white/30 transition-colors"
                                        style={{ backgroundColor: color }}
                                        onMouseEnter={() => handleHighlight(`mesh-color-${index}`)}
                                        onMouseLeave={() => handleHighlight(null)}
                                    />
                                    <Input
                                        type="text"
                                        value={color}
                                        onChange={(e) => {
                                            const newColors = [...(backgrounds.meshColors || [])];
                                            newColors[index] = e.target.value;
                                            update({ meshColors: newColors as [string, string, string, string] });
                                        }}
                                        className="h-6 text-[10px] text-center bg-transparent border-white/10 px-1 focus:border-white/30"
                                    />
                                </div>
                            ))}
                        </div>

                        <p className="text-[10px] text-white/40 pt-2 border-t border-white/5">
                            Estos 4 colores se mezclarán dinámicamente usando WebGL cuando el modo 'Mesh 3D' esté activo.
                        </p>
                    </div>
                </TabsContent>

                {/* MEDIA TAB */}
                <TabsContent value="media" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <SettingControl
                            id="video-url"
                            label="Video de Fondo"
                            description="URL directa (mp4, webm) para background loop"
                            onHighlight={handleHighlight}
                        >
                            <div className="flex gap-2">
                                <Input
                                    placeholder="https://..."
                                    value={backgrounds.videoUrl || ""}
                                    onChange={e => update({ videoUrl: e.target.value })}
                                    className="bg-white/5 border-white/10 text-xs"
                                />
                                <button className="p-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg hover:bg-fuchsia-500/30 transition-colors">
                                    <Play className="w-4 h-4" />
                                </button>
                            </div>
                        </SettingControl>

                        <SettingControl
                            id="blending-mode"
                            label="Modo de Mezcla"
                            description="Cómo se fusiona el video con el color de fondo"
                            onHighlight={handleHighlight}
                        >
                            <Select value={backgrounds.blendingMode || "normal"} onValueChange={(v: any) => update({ blendingMode: v })}>
                                <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="overlay">Overlay</SelectItem>
                                    <SelectItem value="soft-light">Soft Light</SelectItem>
                                    <SelectItem value="screen">Screen</SelectItem>
                                </SelectContent>
                            </Select>
                        </SettingControl>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
