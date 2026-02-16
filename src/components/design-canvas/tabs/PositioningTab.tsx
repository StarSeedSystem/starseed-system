"use client";

import React from "react";
import { Move, LayoutTemplate, MapPin, Layers, LayoutGrid, Maximize, BoxSelect, AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalSpaceAround, AlignVerticalSpaceBetween } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "indigo", onHighlight }: {
    label: string; description?: string; id?: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight?: (id: string | null) => void;
}) {
    const colors: Record<string, string> = {
        indigo: "accent-indigo-500 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:shadow-indigo-500/40",
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
                    colors[color] || colors.indigo)} />
        </SettingControl>
    );
}

export function PositioningTab({ state, dispatch }: Props) {
    const { scrollToPreview } = usePreviewSync();

    const update = (p: Partial<CanvasState["positioning"]>) => {
        dispatch({ type: "SET_POSITIONING", payload: p });
        scrollToPreview("family-wrapper-dialogs");
    };

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const { positioning } = state;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center border border-indigo-500/20">
                    <Move className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Posicionamiento</h3>
                    <p className="text-xs text-white/60">Layout, Z-Index y Grid System</p>
                </div>
            </div>

            <Tabs defaultValue="layout" className="w-full">
                <TabsList className="w-full grid grid-cols-3 bg-white/5 p-1 rounded-xl mb-4">
                    <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
                    <TabsTrigger value="grid" className="text-xs">Grid</TabsTrigger>
                    <TabsTrigger value="layers" className="text-xs">Capas</TabsTrigger>
                </TabsList>

                {/* LAYOUT TAB */}
                <TabsContent value="layout" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <SettingControl
                        id="positioning-density"
                        label="Densidad Global UI"
                        description="Controla qué tan compacta es la interfaz (paddings, márgenes)"
                        onHighlight={handleHighlight}
                    >
                        <div className="grid grid-cols-3 gap-2">
                            {(['comfortable', 'compact', 'spacious'] as const).map(d => (
                                <button key={d} onClick={() => update({ density: d })}
                                    className={cn("p-2 rounded-xl border text-center transition-all",
                                        positioning.density === d ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-200" : "bg-white/3 border-white/5 text-white/50 hover:bg-white/5")}>
                                    <span className="text-[10px] font-medium capitalize">{d}</span>
                                </button>
                            ))}
                        </div>
                    </SettingControl>

                    <SettingControl
                        id="positioning-container"
                        label="Comportamiento Contenedor"
                        description="Cómo se adapta el contenido al ancho de la ventana"
                        onHighlight={handleHighlight}
                    >
                        <Select value={positioning.containerFlex || "fluid"} onValueChange={(v: any) => update({ containerFlex: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="fluid">Fluido (100% width)</SelectItem>
                                <SelectItem value="fixed">Fijo (Container max-width)</SelectItem>
                                <SelectItem value="elastic">Elástico (Clamp)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>

                    <SettingControl
                        id="positioning-modal"
                        label="Posición Modal"
                        description="Ubicación predeterminada para ventanas de diálogo"
                        onHighlight={handleHighlight}
                    >
                        <Select value={positioning.modalPosition} onValueChange={(v: any) => update({ modalPosition: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="center">Centro</SelectItem>
                                <SelectItem value="top">Superior</SelectItem>
                                <SelectItem value="bottom">Inferior</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>
                </TabsContent>

                {/* GRID TAB */}
                <TabsContent value="grid" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <SettingControl
                        id="positioning-grid-visible"
                        label="Visualizar Grid"
                        description="Muestra las columnas de la grilla base sobre el diseño"
                        onHighlight={handleHighlight}
                        headerAction={
                            <Switch
                                checked={positioning.gridSystem?.visible || false}
                                onCheckedChange={(c) => update({ gridSystem: { ...positioning.gridSystem!, visible: c } })}
                            />
                        }
                    >
                        <div className="h-0" /> {/* Spacer since switch is in header */}
                    </SettingControl>

                    {positioning.gridSystem && (
                        <div className="space-y-3 pl-2 border-l-2 border-white/5">
                            <Slider label="Columnas" description="Número de columnas de la grilla" id="grid-cols" value={positioning.gridSystem.columns} min={2} max={24} step={1} unit=" col"
                                onChange={v => update({ gridSystem: { ...positioning.gridSystem!, columns: v } })} onHighlight={handleHighlight} />
                            <Slider label="Gap (Espaciado)" description="Espacio entre columnas" id="grid-gap" value={positioning.gridSystem.gap} min={0} max={64} step={4} unit="px"
                                onChange={v => update({ gridSystem: { ...positioning.gridSystem!, gap: v } })} onHighlight={handleHighlight} />
                            <Slider label="Gutter (Margen ext.)" description="Margen exterior del contenedor" id="grid-gutter" value={positioning.gridSystem.gutter || 16} min={0} max={128} step={8} unit="px"
                                onChange={v => update({ gridSystem: { ...positioning.gridSystem!, gutter: v } })} onHighlight={handleHighlight} />
                            <Slider label="Max Width" description="Ancho máximo del contenedor" id="grid-maxwidth" value={positioning.gridSystem.maxWidth || 1440} min={600} max={1920} step={40} unit="px"
                                onChange={v => update({ gridSystem: { ...positioning.gridSystem!, maxWidth: v } })} onHighlight={handleHighlight} />
                        </div>
                    )}
                </TabsContent>

                {/* LAYERS TAB */}
                <TabsContent value="layers" className="space-y-4 data-[state=active]:animate-in data-[state=active]:fade-in-50">
                    <SettingControl
                        id="positioning-zindex"
                        label="Estrategia Z-Index"
                        description="Define la jerarquía de superposición de elementos"
                        onHighlight={handleHighlight}
                    >
                        <Select value={positioning.zIndexLayering || "standard"} onValueChange={(v: any) => update({ zIndexLayering: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="standard">Standard (Dialog > Popover > Toast)</SelectItem>
                                <SelectItem value="flat">Flat (Minimal layering)</SelectItem>
                                <SelectItem value="deep">Deep (Complex hierarchy)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>

                    <Slider
                        label="Popover Offset"
                        description="Distancia de separación para popovers y menús"
                        id="positioning-offset"
                        value={positioning.popoverOffset} min={0} max={32} step={2} unit="px"
                        onChange={v => update({ popoverOffset: v })}
                        onHighlight={handleHighlight}
                    />

                    <SettingControl
                        id="positioning-tooltip"
                        label="Posición Tooltip"
                        description="Ubicación predeterminada de los tooltips"
                        onHighlight={handleHighlight}
                    >
                        <Select value={positioning.tooltipPlacement} onValueChange={(v: any) => update({ tooltipPlacement: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="top">Arriba</SelectItem>
                                <SelectItem value="bottom">Abajo</SelectItem>
                                <SelectItem value="left">Izquierda</SelectItem>
                                <SelectItem value="right">Derecha</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>
                </TabsContent>
            </Tabs>
        </div>
    );
}
