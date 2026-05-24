import React from "react";
import { CanvasState, CanvasAction } from "../state-types";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wand2, Zap, Layers, Activity } from "lucide-react";

export function SplineIntegrationTab({
    state,
    dispatch
}: {
    state: CanvasState;
    dispatch: React.Dispatch<CanvasAction>;
}) {
    const sConfig = state.splineConfig;

    const handleChange = (key: keyof CanvasState['splineConfig'], value: any) => {
        dispatch({
            type: "SET_SPLINE_CONFIG",
            payload: {
                [key]: value
            } as any
        });
    };

    if (!sConfig) return null;

    return (
        <ScrollArea className="h-full px-4 py-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="space-y-8 max-w-xl mx-auto">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold tracking-widest text-[#007fff] uppercase flex items-center gap-2">
                            <Wand2 className="w-4 h-4" />
                            Spline 3D Core
                        </h3>
                        <p className="text-xs text-white/50 mt-1">Configuración global del motor 3D interactivo.</p>
                    </div>
                    <Switch
                        checked={sConfig.enabled}
                        onCheckedChange={(v) => handleChange('enabled', v)}
                    />
                </div>

                <div className="space-y-6 opacity-80" style={{ opacity: sConfig.enabled ? 1 : 0.5, pointerEvents: sConfig.enabled ? 'auto' : 'none' }}>

                    {/* Opacity Controls */}
                    <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-xs font-semibold text-white/70 flex items-center gap-2 uppercase tracking-wide">
                            <Layers className="w-4 h-4" /> Opacidad de Capas
                        </h4>

                        <div className="space-y-3">
                            <div className="flex justify-between text-xs text-white/60">
                                <Label>Materiales Primarios (Botones)</Label>
                                <span>{Math.round(sConfig.primaryOpacity * 100)}%</span>
                            </div>
                            <Slider
                                value={[sConfig.primaryOpacity]}
                                min={0}
                                max={1}
                                step={0.05}
                                onValueChange={([v]) => handleChange('primaryOpacity', v)}
                            />
                        </div>

                        <div className="space-y-3 pt-2">
                            <div className="flex justify-between text-xs text-white/60">
                                <Label>Materiales Secundarios (Fondos)</Label>
                                <span>{Math.round(sConfig.secondaryOpacity * 100)}%</span>
                            </div>
                            <Slider
                                value={[sConfig.secondaryOpacity]}
                                min={0}
                                max={1}
                                step={0.05}
                                onValueChange={([v]) => handleChange('secondaryOpacity', v)}
                            />
                        </div>
                    </div>

                    {/* Behavior Controls */}
                    <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-xs font-semibold text-white/70 flex items-center gap-2 uppercase tracking-wide">
                            <Activity className="w-4 h-4" /> Comportamiento
                        </h4>

                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-white/70">Reactividad de Cursor (Interactive)</Label>
                            <Switch
                                checked={sConfig.interactive}
                                onCheckedChange={(v) => handleChange('interactive', v)}
                            />
                        </div>

                        <div className="space-y-3 pt-4">
                            <div className="flex justify-between text-xs text-white/60">
                                <Label>Velocidad de Animación (Runtime)</Label>
                                <span>{sConfig.animationSpeed.toFixed(1)}x</span>
                            </div>
                            <Slider
                                value={[sConfig.animationSpeed]}
                                min={0}
                                max={3}
                                step={0.1}
                                onValueChange={([v]) => handleChange('animationSpeed', v)}
                            />
                        </div>
                    </div>

                    {/* Fallback */}
                    <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/5">
                        <h4 className="text-xs font-semibold text-white/70 flex items-center gap-2 uppercase tracking-wide">
                            <Zap className="w-4 h-4" /> Optimización (Fallback)
                        </h4>
                        <div className="space-y-2">
                            <Label className="text-xs text-white/60">Color de base antes de Cargar 3D</Label>
                            <input
                                type="color"
                                value={sConfig.fallbackColor || '#0ea5e9'}
                                onChange={(e) => handleChange('fallbackColor', e.target.value)}
                                className="w-full h-8 rounded border-0 cursor-pointer bg-transparent"
                            />
                        </div>
                    </div>

                </div>
            </div>
        </ScrollArea>
    );
}
