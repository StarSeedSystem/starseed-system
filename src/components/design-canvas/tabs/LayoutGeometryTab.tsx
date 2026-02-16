"use client";

import React from "react";
import { LayoutGrid, Rows3, Dock, Monitor, ArrowRight, Slash, Circle } from "lucide-react";
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

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

function Slider({ label, description, id, value, min, max, step, unit, onChange, color = "blue", onHighlight }: {
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
                    color === "blue" && "[&::-webkit-slider-thumb]:bg-blue-400",
                    color === "indigo" && "[&::-webkit-slider-thumb]:bg-indigo-400",
                    color === "sky" && "[&::-webkit-slider-thumb]:bg-sky-400",
                )}
            />
        </SettingControl>
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
    const { scrollToPreview } = usePreviewSync();

    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const update = (p: Partial<CanvasState["geometry"]>) => {
        dispatch({ type: "SET_GEOMETRY", payload: p });

        // Smart scroll based on what changed
        if (p.dockIconSize !== undefined || p.dockMagnification !== undefined || p.dockMargin !== undefined || p.panelBlur !== undefined) {
            scrollToPreview("family-wrapper-navigation");
        } else {
            scrollToPreview("family-wrapper-geometry");
        }
    };

    const updateNav = (p: Partial<CanvasState["nav"]>) => {
        dispatch({ type: "SET_NAV", payload: p });
        scrollToPreview("family-wrapper-navigation");
    };

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
                    <Slider label="Small (chips, tags)" id="radiusSm" description="Border radius for small elements" value={state.geometry.radiusSm} min={0} max={16} step={1} unit="px" onChange={v => update({ radiusSm: v })} onHighlight={handleHighlight} />
                    <Slider label="Medium (buttons, inputs)" id="radiusMd" description="Border radius for medium elements" value={state.geometry.radiusMd} min={0} max={32} step={1} unit="px" onChange={v => update({ radiusMd: v })} color="indigo" onHighlight={handleHighlight} />
                    <Slider label="Large (cards, panels)" id="radiusLg" description="Border radius for large elements" value={state.geometry.radiusLg} min={0} max={48} step={1} unit="px" onChange={v => update({ radiusLg: v })} color="sky" onHighlight={handleHighlight} />
                    <Slider label="XL (modals, sheets)" id="radiusXl" description="Border radius for extra large elements" value={state.geometry.radiusXl} min={0} max={64} step={1} unit="px" onChange={v => update({ radiusXl: v })} onHighlight={handleHighlight} />
                    <Slider label="Pill (full-round)" id="radiusPill" description="Border radius for pill-shaped elements" value={state.geometry.radiusPill} min={0} max={9999} step={100} unit="px" onChange={v => update({ radiusPill: v })} color="indigo" onHighlight={handleHighlight} />
                </div>
            </div>

            {/* Spacing Scale */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2"><Rows3 className="w-3 h-3" /> Escala de Espaciado</h4>
                <SettingControl
                    id="spacing-scale"
                    label="Densidad de Espaciado"
                    description="Factor multiplicador para márgenes y paddings"
                    onHighlight={handleHighlight}
                    headerAction={<span className="text-white/70 font-mono text-[11px]">{spacingLabel}</span>}
                >
                    <input type="range" min={0.8} max={1.2} step={0.1} value={state.geometry.spacingScale}
                        onChange={e => update({ spacingScale: parseFloat(e.target.value) })}
                        className={cn("w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer",
                            "accent-blue-500",
                            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
                            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg",
                            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20",
                            "[&::-webkit-slider-thumb]:bg-blue-400")} />
                </SettingControl>
            </div>

            {/* Dock Configuration */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2"><Dock className="w-3 h-3" /> Navegación & Dock</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <SettingControl
                        id="dock-style"
                        label="Estilo de Dock"
                        description="Apariencia del contenedor de navegación"
                        onHighlight={handleHighlight}
                    >
                        <Select value={state.nav?.dockStyle || "floating"} onValueChange={(v: any) => updateNav({ dockStyle: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="floating">Flotante (Floating)</SelectItem>
                                <SelectItem value="attached">Adherido (Attached)</SelectItem>
                                <SelectItem value="minimal">Minimal (Transparent)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>

                    <SettingControl
                        id="breadcrumb"
                        label="Separador Breadcrumb"
                        description="Estilo de separación en rutas de navegación"
                        onHighlight={handleHighlight}
                    >
                        <div className="flex gap-2">
                            {(['slash', 'arrow', 'dot'] as const).map(sep => (
                                <button key={sep} onClick={() => updateNav({ breadcrumbSeparator: sep })}
                                    className={cn("flex-1 p-2 rounded-lg border flex items-center justify-center transition-all",
                                        state.nav?.breadcrumbSeparator === sep
                                            ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10")}>
                                    {sep === 'slash' && <Slash className="w-3 h-3" />}
                                    {sep === 'arrow' && <ArrowRight className="w-3 h-3" />}
                                    {sep === 'dot' && <Circle className="w-2 h-2 fill-current" />}
                                </button>
                            ))}
                        </div>
                    </SettingControl>

                    <div className="h-px bg-white/5 my-2" />

                    <Slider label="Tamaño Icono Base" description="Tamaño de los iconos en el dock" id="dock-size" value={state.geometry.dockIconSize || 48} min={32} max={80} step={4} unit="px" onChange={v => update({ dockIconSize: v })} color="indigo" onHighlight={handleHighlight} />
                    <Slider label="Magnificación" description="Factor de escala al pasar el mouse" id="dock-mag" value={state.geometry.dockMagnification || 1.5} min={1} max={2.5} step={0.1} unit="x" onChange={v => update({ dockMagnification: v })} color="sky" onHighlight={handleHighlight} />
                    <Slider label="Margen Inferior" description="Separación del borde de la pantalla" id="dock-margin" value={state.geometry.dockMargin || 16} min={0} max={64} step={4} unit="px" onChange={v => update({ dockMargin: v })} onHighlight={handleHighlight} />
                    <Slider label="Padding Items" description="Espaciado interno de items de menú" id="nav-padding" value={state.nav?.menuItemPadding || 8} min={4} max={24} step={2} unit="px" onChange={v => updateNav({ menuItemPadding: v })} onHighlight={handleHighlight} />
                </div>
            </div>

            {/* Window Parameters */}
            <div className="space-y-3">
                <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2"><Monitor className="w-3 h-3" /> Window Parameters</h4>
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <Slider label="Desenfoque Panel (Blur)" description="Efecto de desenfoque en fondos de paneles" id="win-blur" value={state.geometry.panelBlur || 24} min={0} max={64} step={4} unit="px" onChange={v => update({ panelBlur: v })} color="blue" onHighlight={handleHighlight} />

                    <SettingControl
                        id="win-border"
                        label="Estilo de Borde Panel"
                        description="Grosor y opacidad de los bordes de ventana"
                        onHighlight={handleHighlight}
                    >
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-white/50 w-12">Grosor</span>
                            <div className="flex-1">
                                <input type="range" min={0} max={4} step={1} value={state.geometry.borderWidth || 1}
                                    onChange={e => update({ borderWidth: parseFloat(e.target.value) })}
                                    className="w-full h-1 my-2 bg-white/10 rounded-full appearance-none accent-blue-500" />
                            </div>
                        </div>
                    </SettingControl>
                </div>
            </div>

        </div>
    );
}
