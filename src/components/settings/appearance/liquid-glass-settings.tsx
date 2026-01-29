"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RotateCcw, Droplets, Eye, Layers } from "lucide-react";

export function LiquidGlassSettings() {
    const { config, updateSection } = useAppearance();
    const { liquidGlass } = config;

    // Handle missing config gracefully
    if (!liquidGlass) return null;

    const handleChange = (key: keyof typeof liquidGlass, value: number | boolean) => {
        updateSection("liquidGlass", { [key]: value });

        // Live update custom properties for instant feedback
        if (typeof value === 'number') {
            if (key === 'distortRadius') { // Mapping Radius -> Blur
                document.documentElement.style.setProperty('--glass-blur', `${value * 50}px`);
            }
            if (key === 'distortWidth') { // Mapping Width -> Opacity
                document.documentElement.style.setProperty('--glass-opacity', `${value}`);
            }
            if (key === 'smoothStepEdge') { // Mapping Smooth -> Saturation
                document.documentElement.style.setProperty('--glass-saturation', `${100 + (value * 100)}%`);
            }
        }
    };

    const handleReset = () => {
        const defaults = {
            enabled: true,
            distortWidth: 0.4, // Opacity
            distortHeight: 0.2, // Unused
            distortRadius: 0.4, // Blur (20px)
            smoothStepEdge: 0.8, // Saturation (180%)
            distanceOffset: 0.15,
        };
        updateSection("liquidGlass", defaults);

        // Force update CSS vars
        document.documentElement.style.setProperty('--glass-blur', `${defaults.distortRadius * 50}px`);
        document.documentElement.style.setProperty('--glass-opacity', `${defaults.distortWidth}`);
        document.documentElement.style.setProperty('--glass-saturation', `${100 + (defaults.smoothStepEdge * 100)}%`);
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base font-semibold flex items-center gap-2">
                            <Droplets className="w-4 h-4 text-primary" />
                            Modo Cristal (Apple-style)
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Habilita el diseño de cristal premium estático.
                        </p>
                    </div>
                    <Switch
                        checked={liquidGlass.enabled}
                        onCheckedChange={(c) => handleChange("enabled", c)}
                    />
                </div>

                <div className="flex items-center justify-between border-t pt-4">
                    <div className="space-y-0.5">
                        <Label className="text-base">Aplicar a UI</Label>
                        <p className="text-sm text-muted-foreground">
                            Aplica el efecto a todos los botones y tarjetas.
                        </p>
                    </div>
                    <Switch
                        checked={liquidGlass.applyToUI}
                        onCheckedChange={(c) => handleChange("applyToUI", c)}
                    />
                </div>
            </div>

            <div className="grid gap-6 border rounded-lg p-4 bg-muted/20">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Propiedades del Material</h3>

                {/* Opacity Control */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                            <Eye className="w-4 h-4" /> Opacidad ({Math.round(liquidGlass.distortWidth * 100)}%)
                        </Label>
                    </div>
                    <Slider
                        value={[liquidGlass.distortWidth]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([v]) => handleChange("distortWidth", v)}
                    />
                    <p className="text-xs text-muted-foreground">Controla la transparencia del cristal.</p>
                </div>

                {/* Blur Control */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                            <Layers className="w-4 h-4" /> Difuminado ({(liquidGlass.distortRadius * 50).toFixed(0)}px)
                        </Label>
                    </div>
                    <Slider
                        value={[liquidGlass.distortRadius]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([v]) => handleChange("distortRadius", v)}
                    />
                    <p className="text-xs text-muted-foreground">Intensidad del efecto "frosted glass" de fondo.</p>
                </div>

                {/* Saturation Control */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                            Saturación ({Math.round(100 + (liquidGlass.smoothStepEdge * 100))}%)
                        </Label>
                    </div>
                    <Slider
                        value={[liquidGlass.smoothStepEdge]}
                        min={0}
                        max={1.5}
                        step={0.1}
                        onValueChange={([v]) => handleChange("smoothStepEdge", v)}
                    />
                    <p className="text-xs text-muted-foreground">Vibrancia de los colores detrás del cristal.</p>
                </div>
            </div>

            <div className="pt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 text-muted-foreground hover:text-foreground">
                    <RotateCcw className="h-4 w-4" /> Restaurar Estilo Original
                </Button>
            </div>
        </div>
    );
}
