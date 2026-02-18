"use client";

import React from "react";
import { AppWindow, Monitor, PanelTop, Sparkles, Box, Scan, Layers } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, value, min, max, step, unit, onChange, color = "teal" }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string;
}) {
    const colors: Record<string, string> = {
        teal: "accent-teal-500 [&::-webkit-slider-thumb]:bg-teal-400 [&::-webkit-slider-thumb]:shadow-teal-500/40",
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
                    colors[color] || colors.teal)} />
        </div>
    );
}

const CARD_PRESETS: { id: CanvasState["components"]["cardPreset"]; label: string; desc: string; theme: any }[] = [
    { id: "crystal", label: "Crystal Clear", desc: "Transparent glass", theme: "glass" },
    { id: "liquid-action", label: "Liquid Action", desc: "Motion blur depth", theme: "liquid" },
    { id: "holographic", label: "Holographic", desc: "Prismatic shimmer", theme: "holographic" },
    { id: "mesh", label: "Digital Mesh", desc: "Animated gradients", theme: "mesh" },
    { id: "cyber", label: "Cyber Terminal", desc: "Scanline interface", theme: "cyber" },
    { id: "brutal", label: "Neo Brutalism", desc: "High contrast geometry", theme: "brutal" },
];

export function WidgetStyleTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const update = (p: Partial<CanvasState["widgets"]>) => {
        dispatch({ type: "SET_WIDGETS", payload: p });
        scrollToPreview("family-wrapper-widgets");
    };

    const updateComp = (p: Partial<CanvasState["components"]>) => {
        dispatch({ type: "SET_COMPONENTS", payload: p });
        scrollToPreview("family-wrapper-widgets");
    };

    const updateDialogs = (p: Partial<CanvasState["dialogs"]>) => {
        dispatch({ type: "SET_DIALOGS", payload: p });
        scrollToPreview("family-wrapper-dialogs");
    };

    const { widgets, components, dialogs } = state;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center border border-teal-500/20">
                    <AppWindow className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Estilo de Widgets</h3>
                    <p className="text-xs text-white/60">Define la apariencia visual de los widgets y ventanas.</p>
                </div>
            </div>

            {/* PREVIEW LAYOUT SELECTOR */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 mb-2">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-medium text-white">Template de Dashboard</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {(['standard', 'analyst', 'creative', 'strategic'] as const).map(template => (
                        <button
                            key={template}
                            onClick={() => update({ dashboardTemplate: template })}
                            className={cn(
                                "relative px-3 py-2.5 rounded-xl border text-left transition-all duration-300 group overflow-hidden",
                                widgets.dashboardTemplate === template
                                    ? "bg-cyan-500/20 border-cyan-500/50 text-white"
                                    : "bg-black/20 border-white/5 text-white/50 hover:bg-white/5"
                            )}
                        >
                            <span className="relative z-10 text-xs font-medium capitalize block">{template}</span>
                        </button>
                    ))}
                </div>
            </div>

            <Tabs defaultValue="materials" className="w-full">
                <TabsList className="w-full grid grid-cols-4 bg-white/5 p-1 rounded-xl mb-4">
                    <TabsTrigger value="materials" className="text-[10px]">Material</TabsTrigger>
                    <TabsTrigger value="borders" className="text-[10px]">Bordes</TabsTrigger>
                    <TabsTrigger value="shadows" className="text-[10px]">Luces</TabsTrigger>
                    <TabsTrigger value="graphs" className="text-[10px]">Graphs</TabsTrigger>
                    <TabsTrigger value="dialogs" className="text-[10px]">Diálogos</TabsTrigger>
                </TabsList>

                {/* MATERIALS TAB */}
                <TabsContent value="materials" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <label className="text-xs text-white/70 block">Tipo de Superficie</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['glass', 'solid', 'cyber', 'mesh'] as const).map(style => (
                                <button key={style} onClick={() => update({ bgStyle: style })}
                                    className={cn("p-2 rounded-xl border text-center transition-all",
                                        widgets.bgStyle === style ? "bg-teal-500/15 border-teal-500/30 text-teal-200" : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5")}>
                                    <span className="text-xs font-medium capitalize">{style}</span>
                                </button>
                            ))}
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-4">
                            <h4 className="text-[11px] uppercase tracking-wider text-teal-400 font-medium flex items-center gap-2">
                                <Sparkles className="w-3 h-3" /> Ajustes Glass
                            </h4>
                            <Slider label="Opacidad Base" value={widgets.glassOpacity || 0.6} min={0} max={1} step={0.05} unit="" onChange={v => update({ glassOpacity: v })} />
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-white/70">Textura de Ruido</span>
                                <Switch checked={widgets.noiseTexture || false} onCheckedChange={(c) => update({ noiseTexture: c })} />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-4">
                            <h4 className="text-[11px] uppercase tracking-wider text-purple-400 font-medium flex items-center gap-2">
                                <Box className="w-3 h-3" /> Presets de Tarjetas
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                                {CARD_PRESETS.map(cp => (
                                    <button key={cp.id} onClick={() => updateComp({ cardPreset: cp.id })}
                                        className={cn("relative group p-4 rounded-xl transition-all border text-left overflow-hidden",
                                            components.cardPreset === cp.id ? "border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]" : "bg-black/20 border-white/5 hover:bg-white/5")}>
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-center mb-1">
                                                <p className="text-xs text-white/90 font-bold tracking-tight">{cp.label}</p>
                                                {components.cardPreset === cp.id && <Sparkles className="w-3 h-3 text-purple-400" />}
                                            </div>
                                            <p className="text-[10px] text-white/40 leading-tight">{cp.desc}</p>
                                        </div>
                                        {/* Background Preview */}
                                        <div className="absolute inset-x-0 bottom-0 h-1 z-0 bg-gradient-to-r from-purple-500/50 to-pink-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* BORDERS TAB */}
                <TabsContent value="borders" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Scan className="w-4 h-4 text-teal-400" />
                                <span className="text-xs font-medium text-white">Estilo de Borde</span>
                            </div>
                            <Select value={widgets.borderStyle} onValueChange={(v: any) => update({ borderStyle: v })}>
                                <SelectTrigger className="w-[100px] h-7 text-[10px] bg-white/5 border-white/10 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="thin">Thin 1px</SelectItem>
                                    <SelectItem value="glow">Glow</SelectItem>
                                    <SelectItem value="neon">Neon</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Slider label="Suavizado de Esquinas" value={widgets.cornerSmoothing || 0} min={0} max={1} step={0.1} unit="" onChange={v => update({ cornerSmoothing: v })} />

                        <div className="pt-2 border-t border-white/5">
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-white/70">Header Decoration</span>
                                <Select value={widgets.headerStyle} onValueChange={(v: any) => update({ headerStyle: v })}>
                                    <SelectTrigger className="w-[120px] h-8 text-xs bg-white/5 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="simple">Simple</SelectItem>
                                        <SelectItem value="accented">Accented</SelectItem>
                                        <SelectItem value="underlined">Underlined</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* SHADOWS TAB */}
                <TabsContent value="shadows" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Layers className="w-3.5 h-3.5 text-teal-400" />
                            <span className="text-xs text-white/70">Proyección de Sombra</span>
                        </div>

                        <Select value={widgets.shadows} onValueChange={(v: any) => update({ shadows: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="none">Sin Sombra</SelectItem>
                                <SelectItem value="sm">Small (Subtle)</SelectItem>
                                <SelectItem value="md">Medium (Floating)</SelectItem>
                                <SelectItem value="lg">Large (Elevated)</SelectItem>
                                <SelectItem value="neon">Neon Glow</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </TabsContent>

                {/* GRAPHS TAB */}
                <TabsContent value="graphs" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Layers className="w-3.5 h-3.5 text-teal-400" />
                            <span className="text-xs text-white/70">ASHost Graph Style</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {(['bar', 'line', 'radar', 'dot'] as const).map(type => (
                                <button key={type} onClick={() => update({ ashostGraphType: type })}
                                    className={cn("p-2 rounded-xl border text-center transition-all",
                                        widgets.ashostGraphType === type ? "bg-teal-500/15 border-teal-500/30 text-teal-200" : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5")}>
                                    <span className="text-[10px] font-medium capitalize">{type}</span>
                                </button>
                            ))}
                        </div>

                        <div className="space-y-4 pt-2">
                            <div className="flex items-center gap-3">
                                <label className="text-xs text-white/50">Graph Color</label>
                                <div className="flex items-center gap-2 ml-auto">
                                    <input type="color" value={widgets.ashostColor} onChange={e => update({ ashostColor: e.target.value })}
                                        className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                                    <span className="text-[11px] text-white/60 font-mono uppercase">{widgets.ashostColor}</span>
                                </div>
                            </div>
                            <Slider label="Animation Speed" value={widgets.ashostSpeed} min={0.2} max={3} step={0.1} unit="x" onChange={v => update({ ashostSpeed: v })} />
                        </div>
                    </div>
                </TabsContent>

                {/* DIALOGS TAB */}
                <TabsContent value="dialogs" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <PanelTop className="w-3.5 h-3.5 text-rose-400" />
                            <span className="text-xs text-white/70">Ajustes de Diálogos</span>
                        </div>

                        <Slider label="Opacidad Overlay" value={dialogs.overlayOpacity} min={0} max={1} step={0.05} unit="" onChange={v => updateDialogs({ overlayOpacity: v })} />
                        <Slider label="Desenfoque Overlay" value={dialogs.overlayBlur} min={0} max={20} step={1} unit="px" onChange={v => updateDialogs({ overlayBlur: v })} />

                        <div className="pt-2 border-t border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-white/70">Animación</span>
                                <Select value={dialogs.animation} onValueChange={(v: any) => updateDialogs({ animation: v })}>
                                    <SelectTrigger className="w-[100px] h-7 text-[10px] bg-white/5 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="fade">Fade</SelectItem>
                                        <SelectItem value="scale">Scale</SelectItem>
                                        <SelectItem value="slide">Slide</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-white/70">Botón de Cierre</span>
                                <Select value={dialogs.closeButtonStyle} onValueChange={(v: any) => updateDialogs({ closeButtonStyle: v })}>
                                    <SelectTrigger className="w-[100px] h-7 text-[10px] bg-white/5 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                                        <SelectItem value="x">Simple X</SelectItem>
                                        <SelectItem value="pill">Pill</SelectItem>
                                        <SelectItem value="icon">Icon</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
