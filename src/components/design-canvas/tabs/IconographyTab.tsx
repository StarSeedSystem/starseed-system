"use client";

import React, { useState } from "react";
import { Shapes, Sparkles, Wand2, Box, Menu, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { usePreviewSync } from "../hooks/usePreviewSync";
import { SettingControl } from "../controls/SettingControl";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "pink", onHighlight }: {
    label: string; description?: string; id?: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight?: (id: string | null) => void;
}) {
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
                    `accent-${color}-500`,
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg",
                    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                    color === "pink" && "[&::-webkit-slider-thumb]:bg-pink-400",
                )}
            />
        </SettingControl>
    );
}

export function IconographyTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();
    const [aiPrompt, setAiPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const update = (p: Partial<CanvasState["iconography"]>) => {
        dispatch({ type: "SET_ICONOGRAPHY", payload: p });
        scrollToPreview("family-wrapper-iconography");
    };

    const handleGenerate = () => {
        if (!aiPrompt) return;
        setIsGenerating(true);
        setTimeout(() => {
            setIsGenerating(false);
            update({ activeCollection: "ai-generated" });
        }, 1500);
    };

    const { iconography } = state;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center border border-pink-500/20">
                    <Shapes className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Iconografía</h3>
                    <p className="text-xs text-white/60">Sistemas de iconos y símbolos</p>
                </div>
            </div>

            <Tabs defaultValue="style" className="w-full">
                <TabsList className="w-full grid grid-cols-3 bg-white/5 p-1 rounded-xl mb-4">
                    <TabsTrigger value="style" className="text-xs">Estilo</TabsTrigger>
                    <TabsTrigger value="sets" className="text-xs">Sets</TabsTrigger>
                    <TabsTrigger value="ai" className="text-xs"><Sparkles className="w-3 h-3 mr-1" /> AI Gen</TabsTrigger>
                </TabsList>

                {/* STYLE TAB */}
                <TabsContent value="style" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <SettingControl
                        id="icon-style"
                        label="Estilo de Renderizado"
                        description="Define si los iconos son de línea o rellenos"
                        onHighlight={handleHighlight}
                    >
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => update({ style: "stroke" })}
                                className={cn("p-3 rounded-xl transition-all border text-center",
                                    iconography.style === "stroke" ? "bg-pink-500/10 border-pink-500/30 text-pink-200" : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5")}>
                                <span className="block text-lg mb-1">✏️</span>
                                <span className="text-[10px] font-medium">Línea (Stroke)</span>
                            </button>
                            <button onClick={() => update({ style: "solid" })}
                                className={cn("p-3 rounded-xl transition-all border text-center",
                                    iconography.style === "solid" ? "bg-pink-500/10 border-pink-500/30 text-pink-200" : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5")}>
                                <span className="block text-lg mb-1">⬛</span>
                                <span className="text-[10px] font-medium">Relleno (Solid)</span>
                            </button>
                        </div>
                    </SettingControl>

                    <Slider label="Grosor (Stroke)" description="Anchura de línea para iconos SVG" id="icon-stroke" value={iconography.strokeWidth} min={0.5} max={3} step={0.1} unit="px" onChange={v => update({ strokeWidth: v })} onHighlight={handleHighlight} />
                    <Slider label="Escala Global" description="Tamaño relativo de todos los iconos" id="icon-scale" value={iconography.scale} min={0.5} max={1.5} step={0.1} unit="x" onChange={v => update({ scale: v })} onHighlight={handleHighlight} />

                    <SettingControl
                        id="icon-animation"
                        label="Animación Interactiva"
                        description="Efecto al pasar el cursor sobre elementos interactivos"
                        onHighlight={handleHighlight}
                    >
                        <Select value={iconography.animation || "none"} onValueChange={(v: any) => update({ animation: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="none">Ninguna</SelectItem>
                                <SelectItem value="pulse">Pulso (Pulse)</SelectItem>
                                <SelectItem value="bounce">Rebote (Bounce)</SelectItem>
                                <SelectItem value="spin">Giro (Spin)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>
                </TabsContent>

                {/* SETS TAB */}
                <TabsContent value="sets" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <SettingControl
                        id="icon-set"
                        label="Librería de Iconos"
                        description="Colección base para los iconos del sistema"
                        onHighlight={handleHighlight}
                    >
                        <Select value={iconography.activeCollection} onValueChange={(v: any) => update({ activeCollection: v })}>
                            <SelectTrigger className="w-full h-12 text-xs bg-white/5 border-white/10 text-white">
                                <div className="flex items-center gap-3 text-left">
                                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                                        {iconography.activeCollection === "lucide" && <Sparkles className="w-4 h-4" />}
                                        {iconography.activeCollection === "custom" && <Box className="w-4 h-4" />}
                                        {iconography.activeCollection === "ai-generated" && <Wand2 className="w-4 h-4" />}
                                        {(iconography.activeCollection === "stitch-liquid" || iconography.activeCollection === "stitch-organic") && <Sparkles className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <div className="font-medium">
                                            {iconography.activeCollection === "lucide" && "Lucide Standard"}
                                            {iconography.activeCollection === "custom" && "Trinity Custom"}
                                            {iconography.activeCollection === "ai-generated" && "AI Generated Set"}
                                            {iconography.activeCollection === "stitch-liquid" && "Liquid Crystal Set"}
                                            {iconography.activeCollection === "stitch-organic" && "Organic Bio Set"}
                                        </div>
                                        <div className="text-[10px] text-white/50">
                                            {iconography.activeCollection === "lucide" && "Clean, consistent monoline icons"}
                                            {iconography.activeCollection === "custom" && "Uploaded SVG sprite sheet"}
                                            {iconography.activeCollection === "ai-generated" && "Created via Stitch"}
                                            {iconography.activeCollection === "stitch-liquid" && "Premium 3D Liquid Crystal"}
                                            {iconography.activeCollection === "stitch-organic" && "Living Bio-Luminescent"}
                                        </div>
                                    </div>
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="lucide">Lucide Standard</SelectItem>
                                <SelectItem value="custom">Trinity Custom</SelectItem>
                                <SelectItem value="ai-generated">AI Generated Set</SelectItem>
                                <SelectItem value="stitch-liquid">Stitch Liquid Crystal</SelectItem>
                                <SelectItem value="stitch-organic">Stitch Organic Bio-Tech</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>

                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-3">
                        <h4 className="text-[11px] uppercase tracking-wider text-pink-300/80 font-medium">Overrides Específicos</h4>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-white/70">Navegación</span>
                            <Select value={iconography.navigationIcons || 'default'} onValueChange={(v: any) => update({ navigationIcons: v })}>
                                <SelectTrigger className="w-[120px] h-8 text-[10px] bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="default">Default</SelectItem>
                                    <SelectItem value="filled">Filled</SelectItem>
                                    <SelectItem value="minimal">Minimal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-white/70">Widgets</span>
                            <Select value={iconography.widgetIcons || 'default'} onValueChange={(v: any) => update({ widgetIcons: v })}>
                                <SelectTrigger className="w-[120px] h-8 text-[10px] bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="default">Default</SelectItem>
                                    <SelectItem value="playful">Playful</SelectItem>
                                    <SelectItem value="professional">Professional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </TabsContent>

                {/* AI GENERATION TAB */}
                <TabsContent value="ai" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-2xl p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-pink-500/20 rounded-lg">
                                <Wand2 className="w-5 h-5 text-pink-300" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Generador de Iconos AI</h4>
                                <p className="text-xs text-white/60">Describe el estilo y Stitch generará un set consistente.</p>
                            </div>
                        </div>

                        <Input
                            placeholder="Ej: 'Futuristic neon line icons, thin stroke, glowing'"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            className="bg-black/20 border-white/10 text-xs h-9"
                        />

                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating || !aiPrompt}
                            className="w-full bg-pink-500 hover:bg-pink-600 text-white text-xs"
                        >
                            {isGenerating ? <Sparkles className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
                            {isGenerating ? "Generando..." : "Generar Set"}
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
