"use client";

import React from "react";
import {
    Sparkles, Activity, Zap, Move, Droplets, Magnet, Fingerprint,
    MousePointer2, Layout, Anchor, Brain, Eye, EyeOff, Sun,
    ChevronDown, ChevronUp, Cpu, PanelLeft, PanelRight, PanelTop,
    Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasState } from "../state-types";
import { SettingControl } from "../controls/SettingControl";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Props { state: CanvasState; dispatch: React.Dispatch<any>; }

// ── Reusable Slider ──────────────────────────────────────────────────────────
function Slider({ label, description, icon, id, value, min, max, step, unit, onChange, color = "blue", onHighlight }: {
    label: string; description?: string; icon?: React.ReactNode; id?: string; value: number; min: number; max: number; step: number; unit?: string;
    onChange: (v: number) => void; color?: string; onHighlight?: (id: string | null) => void;
}) {
    return (
        <SettingControl
            id={id || label}
            label={
                <div className="flex items-center gap-2">
                    {icon && <span className="opacity-50 group-hover:opacity-100 transition-opacity">{icon}</span>}
                    <span>{label}</span>
                </div>
            }
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
                    color === "cyan" && "[&::-webkit-slider-thumb]:bg-cyan-400",
                    color === "emerald" && "[&::-webkit-slider-thumb]:bg-emerald-400",
                    color === "amber" && "[&::-webkit-slider-thumb]:bg-amber-400",
                    color === "rose" && "[&::-webkit-slider-thumb]:bg-rose-400",
                    color === "purple" && "[&::-webkit-slider-thumb]:bg-purple-400",
                    color === "violet" && "[&::-webkit-slider-thumb]:bg-violet-400",
                )}
            />
        </SettingControl>
    );
}

// ── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, description, checked, onChange, color = "cyan", icon }: {
    label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; color?: string; icon?: React.ReactNode;
}) {
    const colorMap: Record<string, string> = {
        cyan: "bg-cyan-500",
        emerald: "bg-emerald-500",
        amber: "bg-amber-500",
        rose: "bg-rose-500",
        purple: "bg-purple-500",
    };
    return (
        <div className="flex items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2 min-w-0">
                {icon && <span className="opacity-60 shrink-0">{icon}</span>}
                <div className="min-w-0">
                    <p className="text-xs text-white/80 truncate">{label}</p>
                    {description && <p className="text-[10px] text-white/40 truncate">{description}</p>}
                </div>
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={cn(
                    "relative shrink-0 w-9 h-5 rounded-full transition-all duration-200",
                    checked ? colorMap[color] || "bg-cyan-500" : "bg-white/10"
                )}
            >
                <span className={cn(
                    "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200",
                    checked && "translate-x-4"
                )} />
            </button>
        </div>
    );
}

// ── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: string }) {
    return (
        <div className="flex items-center justify-between">
            <h4 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2">
                {icon}
                {label}
            </h4>
            {badge && (
                <span className="text-[10px] text-cyan-400/80 font-mono px-2 py-0.5 bg-cyan-500/10 rounded-full border border-cyan-500/20">
                    {badge}
                </span>
            )}
        </div>
    );
}

// ── Color Swatch Row ─────────────────────────────────────────────────────────
function ColorPillar({ label, color, onChange, accent }: {
    label: string; color: string; onChange: (v: string) => void; accent: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="relative shrink-0">
                <input
                    type="color"
                    value={color}
                    onChange={e => onChange(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0 appearance-none"
                    style={{ outline: `2px solid ${accent}40` }}
                />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: accent }}>{label}</p>
                <p className="text-[10px] text-white/40 font-mono">{color.toUpperCase()}</p>
            </div>
            <div className="w-4 h-4 rounded-full shrink-0 border border-white/10" style={{ backgroundColor: color }} />
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function TrinityTab({ state, dispatch }: Props) {
    const handleHighlight = (id: string | null) => {
        dispatch({ type: "SET_UI", payload: { activeHighlight: id } });
    };

    const updateTrinity = (p: Partial<CanvasState["trinityConfig"]>) => {
        dispatch({
            type: "SET_STATE",
            payload: { trinityConfig: { ...state.trinityConfig, ...p } }
        });
    };

    const updateNav = (p: Partial<CanvasState["nav"]>) => {
        dispatch({
            type: "SET_STATE",
            payload: { nav: { ...state.nav, ...p } }
        });
    };

    const updatePalette = (p: Partial<CanvasState["palette"]>) => {
        dispatch({ type: "SET_PALETTE", payload: p });
    };

    const tc = state.trinityConfig;
    const nav = state.nav;
    const trinity = state.palette.trinity;

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-cyan-500/20">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white">Interfaz Trinidad</h3>
                    <p className="text-xs text-white/60">Sistema bio-inspirado y fluido</p>
                </div>
            </div>

            {/* ── Info Note ── */}
            <div className="flex gap-3 p-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/60 leading-relaxed">
                    Los ajustes de esta sección se reflejan en <span className="text-cyan-400 font-medium">tiempo real</span> en la Vista Previa del Lienzo. Desplázate hacia abajo en la preview para ver el panel Trinity activo.
                </p>
            </div>

            {/* ── 1. Física & Energía ── */}
            <div className="space-y-4">
                <SectionHeader
                    icon={<Activity className="w-3 h-3 text-cyan-400" />}
                    label="Física & Energía"
                    badge="Fluid Dynamics"
                />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <Slider
                        label="Nivel de Energía"
                        icon={<Zap className="w-3 h-3" />}
                        description="Velocidad y respuesta de las partículas"
                        id="energy-level"
                        value={tc?.energyLevel ?? 0.5}
                        min={0} max={1} step={0.05}
                        onChange={v => updateTrinity({ energyLevel: v })}
                        color="cyan"
                        onHighlight={handleHighlight}
                    />
                    <Slider
                        label="Tensión de Fluido / Goo"
                        icon={<Droplets className="w-3 h-3" />}
                        description="Viscosidad y efecto 'Gooey' en uniones"
                        id="fluid-tension"
                        value={tc?.fluidTension ?? 0.7}
                        min={0} max={1} step={0.05}
                        onChange={v => updateTrinity({ fluidTension: v })}
                        color="indigo"
                        onHighlight={handleHighlight}
                    />
                    <Slider
                        label="Radio Metaball"
                        icon={<span className="text-[10px] font-bold">◉</span>}
                        description="Tamaño de las esferas de fusión"
                        id="metaball-radius"
                        value={tc?.metaballRadius ?? 0.5}
                        min={0} max={1} step={0.05}
                        onChange={v => updateTrinity({ metaballRadius: v })}
                        color="blue"
                        onHighlight={handleHighlight}
                    />
                </div>
            </div>

            {/* ── 2. Paneles Trinity ── */}
            <div className="space-y-4">
                <SectionHeader
                    icon={<Layout className="w-3 h-3 text-purple-400" />}
                    label="Paneles Trinity"
                />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <ToggleRow
                        label="Panel Zenith (IA)"
                        description="Barra superior de inteligencia artificial"
                        checked={tc?.showZenith ?? true}
                        onChange={v => updateTrinity({ showZenith: v })}
                        color="cyan"
                        icon={<Brain className="w-3 h-3 text-cyan-400" />}
                    />
                    <ToggleRow
                        label="Panel Creación"
                        description="Dock lateral izquierdo de herramientas"
                        checked={tc?.showCreation ?? true}
                        onChange={v => updateTrinity({ showCreation: v })}
                        color="emerald"
                        icon={<PanelLeft className="w-3 h-3 text-emerald-400" />}
                    />
                    <ToggleRow
                        label="Panel Lógica"
                        description="Panel lateral derecho de control"
                        checked={tc?.showLogic ?? true}
                        onChange={v => updateTrinity({ showLogic: v })}
                        color="amber"
                        icon={<PanelRight className="w-3 h-3 text-amber-400" />}
                    />
                    <div className="border-t border-white/5 pt-4 space-y-4">
                        <Slider
                            label="Opacidad de Paneles"
                            id="panel-opacity"
                            value={tc?.panelOpacity ?? 0.85}
                            min={0} max={1} step={0.05}
                            onChange={v => updateTrinity({ panelOpacity: v })}
                            color="purple"
                            onHighlight={handleHighlight}
                        />
                        <Slider
                            label="Blur de Paneles"
                            unit="px"
                            id="panel-blur"
                            value={tc?.panelBlur ?? 20}
                            min={0} max={60} step={2}
                            onChange={v => updateTrinity({ panelBlur: v })}
                            color="violet"
                            onHighlight={handleHighlight}
                        />
                    </div>
                    {/* ── Peek distances ── */}
                    <div className="border-t border-white/5 pt-4 space-y-4">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Peek cuando inactivo</p>
                        <Slider
                            label="Peek Creación"
                            description="% del panel oculto cuando no está activo"
                            unit="%"
                            id="creation-peek"
                            icon={<PanelLeft className="w-3 h-3" />}
                            value={tc?.creationPeek ?? 67}
                            min={0} max={95} step={1}
                            onChange={v => updateTrinity({ creationPeek: v })}
                            color="emerald"
                            onHighlight={handleHighlight}
                        />
                        <Slider
                            label="Peek Lógica"
                            description="% del panel oculto cuando no está activo"
                            unit="%"
                            id="logic-peek"
                            icon={<PanelRight className="w-3 h-3" />}
                            value={tc?.logicPeek ?? 80}
                            min={0} max={95} step={1}
                            onChange={v => updateTrinity({ logicPeek: v })}
                            color="amber"
                            onHighlight={handleHighlight}
                        />
                    </div>
                    {/* ── Zenith position ── */}
                    {(tc?.showZenith ?? true) && (
                        <div className="border-t border-white/5 pt-4">
                            <SettingControl
                                id="zenith-position"
                                label="Posición del Zenith"
                                description="Dónde se ancla la barra de IA"
                                onHighlight={handleHighlight}
                            >
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[
                                        { id: 'top', label: 'Arriba', icon: ChevronUp },
                                        { id: 'bottom', label: 'Abajo', icon: ChevronDown },
                                        { id: 'left', label: 'Izq.', icon: PanelLeft },
                                        { id: 'right', label: 'Der.', icon: PanelRight },
                                    ].map(pos => (
                                        <button
                                            key={pos.id}
                                            onClick={() => updateTrinity({ absolutePosition: pos.id as any })}
                                            className={cn(
                                                "p-2 rounded-lg border flex flex-col items-center gap-1 transition-all",
                                                (tc?.absolutePosition ?? 'bottom') === pos.id
                                                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                            )}
                                        >
                                            <pos.icon className="w-3.5 h-3.5" />
                                            <span className="text-[9px] font-bold uppercase">{pos.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </SettingControl>
                        </div>
                    )}
                </div>
            </div>

            {/* ── 3. Modos de Interacción ── */}
            <div className="space-y-4">
                <SectionHeader
                    icon={<Move className="w-3 h-3 text-purple-400" />}
                    label="Modos de Interacción"
                />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    <SettingControl
                        id="interaction-mode"
                        label="Comportamiento del Puntero"
                        description="Cómo reacciona la interfaz a la presencia del usuario"
                        onHighlight={handleHighlight}
                    >
                        <div className="flex gap-2">
                            {[
                                { id: 'magnetic', label: 'Magnético', icon: Magnet },
                                { id: 'touch', label: 'Táctil', icon: Fingerprint },
                                { id: 'static', label: 'Estático', icon: MousePointer2 },
                            ].map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => updateTrinity({ interactionMode: mode.id as any })}
                                    className={cn(
                                        "flex-1 p-2 rounded-lg border flex flex-col items-center gap-2 transition-all",
                                        tc?.interactionMode === mode.id
                                            ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                    )}
                                >
                                    <mode.icon className="w-4 h-4" />
                                    <span className="text-[10px] font-bold uppercase">{mode.label}</span>
                                </button>
                            ))}
                        </div>
                    </SettingControl>
                    <SettingControl
                        id="morph-state"
                        label="Estado de la Materia"
                        description="Apariencia base de los componentes"
                        onHighlight={handleHighlight}
                    >
                        <Select value={tc?.morphState || "liquid"} onValueChange={(v: any) => updateTrinity({ morphState: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="solid">Sólido (Cristal)</SelectItem>
                                <SelectItem value="liquid">Líquido (Plasma)</SelectItem>
                                <SelectItem value="ethereal">Etéreo (Gas/Luz)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>
                </div>
            </div>

            {/* ── 4. Aura & Resplandor ── */}
            <div className="space-y-4">
                <SectionHeader
                    icon={<Sparkles className="w-3 h-3 text-cyan-400" />}
                    label="Aura & Resplandor"
                />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <ToggleRow
                        label="Mostrar Aura IA"
                        description="Halo de energía alrededor del panel Zenith"
                        checked={tc?.showAura ?? true}
                        onChange={v => updateTrinity({ showAura: v })}
                        color="cyan"
                        icon={<Sun className="w-3 h-3 text-cyan-400" />}
                    />
                    {(tc?.showAura ?? true) && (
                        <Slider
                            label="Intensidad del Aura"
                            id="aura-intensity"
                            value={tc?.auraIntensity ?? 0.7}
                            min={0} max={1} step={0.05}
                            onChange={v => updateTrinity({ auraIntensity: v })}
                            color="cyan"
                            onHighlight={handleHighlight}
                        />
                    )}
                    <div className="border-t border-white/5 pt-3 space-y-3">
                        <ToggleRow
                            label="Color Shadow"
                            description="Sombra de color en paneles seleccionados"
                            checked={nav?.trinityColorShadow ?? true}
                            onChange={v => updateNav({ trinityColorShadow: v })}
                            color="purple"
                        />
                        <ToggleRow
                            label="Corner Blend"
                            description="Degradado de color en esquinas de paneles"
                            checked={nav?.trinityCornerBlend ?? true}
                            onChange={v => updateNav({ trinityCornerBlend: v })}
                            color="purple"
                        />
                        <ToggleRow
                            label="Resplandor de Bordes"
                            description="Líneas de luz en los bordes de la interfaz"
                            checked={nav?.trinityGlow ?? true}
                            onChange={v => updateNav({ trinityGlow: v })}
                            color="cyan"
                        />
                    </div>
                </div>
            </div>

            {/* ── 5. Dock de Navegación ── */}
            <div className="space-y-4">
                <SectionHeader
                    icon={<Anchor className="w-3 h-3 text-rose-400" />}
                    label="Dock de Navegación"
                />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-5">
                    {/* Position */}
                    <SettingControl
                        id="dock-position"
                        label="Posición del Dock"
                        onHighlight={handleHighlight}
                    >
                        <div className="grid grid-cols-4 gap-1.5">
                            {[
                                { id: 'bottom', label: 'Abajo', icon: ChevronDown },
                                { id: 'top', label: 'Arriba', icon: ChevronUp },
                                { id: 'left', label: 'Izq.', icon: PanelLeft },
                                { id: 'right', label: 'Der.', icon: PanelRight },
                            ].map(pos => (
                                <button
                                    key={pos.id}
                                    onClick={() => updateNav({ dockPosition: pos.id as any })}
                                    className={cn(
                                        "p-2 rounded-lg border flex flex-col items-center gap-1 transition-all",
                                        nav?.dockPosition === pos.id
                                            ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                                            : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                    )}
                                >
                                    <pos.icon className="w-3.5 h-3.5" />
                                    <span className="text-[9px] font-bold uppercase">{pos.label}</span>
                                </button>
                            ))}
                        </div>
                    </SettingControl>

                    {/* Physics */}
                    <SettingControl
                        id="dock-physics"
                        label="Física del Dock"
                        onHighlight={handleHighlight}
                    >
                        <Select value={nav?.trinityPhysics || "spring"} onValueChange={(v: any) => updateNav({ trinityPhysics: v })}>
                            <SelectTrigger className="w-full h-9 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value="spring">Spring (Elástico)</SelectItem>
                                <SelectItem value="elastic">Elastic (Rebote)</SelectItem>
                                <SelectItem value="smooth">Smooth (Suave)</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingControl>

                    <Slider
                        label="Auto-hide Delay"
                        unit="s"
                        id="auto-hide-delay"
                        value={nav?.trinityAutoHideDelay ?? 3}
                        min={0} max={10} step={0.5}
                        onChange={v => updateNav({ trinityAutoHideDelay: v })}
                        color="rose"
                        onHighlight={handleHighlight}
                    />
                    <Slider
                        label="Peek Distance"
                        unit="px"
                        id="peek-distance"
                        value={nav?.trinityPeekDistance ?? 8}
                        min={0} max={20} step={1}
                        onChange={v => updateNav({ trinityPeekDistance: v })}
                        color="rose"
                        onHighlight={handleHighlight}
                    />
                </div>
            </div>

            {/* ── 6. Pilares Cromáticos ── */}
            <div className="space-y-4">
                <SectionHeader
                    icon={<Cpu className="w-3 h-3 text-amber-400" />}
                    label="Pilares Cromáticos"
                />
                <div className="bg-white/3 rounded-2xl p-4 border border-white/5 space-y-4">
                    <ColorPillar
                        label="Zenith (IA)"
                        color={trinity?.zenith?.active || "#06B6D4"}
                        accent="#06B6D4"
                        onChange={v => updatePalette({
                            trinity: { ...trinity, zenith: { ...trinity?.zenith, active: v } }
                        })}
                    />
                    <ColorPillar
                        label="Horizonte (Nav)"
                        color={trinity?.horizonte?.active || "#EF4444"}
                        accent="#EF4444"
                        onChange={v => updatePalette({
                            trinity: { ...trinity, horizonte: { ...trinity?.horizonte, active: v } }
                        })}
                    />
                    <ColorPillar
                        label="Creación (Lienzo)"
                        color={trinity?.nucleo?.creation || "#10B981"}
                        accent="#10B981"
                        onChange={v => updatePalette({
                            trinity: {
                                ...trinity,
                                nucleo: { ...(trinity?.nucleo || {}), creation: v }
                            }
                        })}
                    />
                    <ColorPillar
                        label="Lógica (Control)"
                        color={trinity?.nucleo?.logic || "#F59E0B"}
                        accent="#F59E0B"
                        onChange={v => updatePalette({
                            trinity: {
                                ...trinity,
                                nucleo: { ...(trinity?.nucleo || {}), logic: v }
                            }
                        })}
                    />
                    <ColorPillar
                        label="Base (Núcleo)"
                        color={trinity?.base?.active || "#8B5CF6"}
                        accent="#8B5CF6"
                        onChange={v => updatePalette({
                            trinity: { ...trinity, base: { ...trinity?.base, active: v } }
                        })}
                    />
                </div>
            </div>
        </div>
    );
}
