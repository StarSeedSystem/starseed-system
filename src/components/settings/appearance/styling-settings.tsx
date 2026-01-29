"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";

export function StylingSettings() {
    const { config, updateSection } = useAppearance();

    const handleRadiusChange = (val: number[]) => updateSection("styling", { radius: val[0] });
    const handleBlurChange = (val: number[]) => updateSection("styling", { glassIntensity: val[0] });
    const handleOpacityChange = (val: number[]) => updateSection("styling", { opacity: val[0] });

    const resetStyling = () => {
        updateSection("styling", { radius: 0.5, glassIntensity: 10, opacity: 0.8 });
    };

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Controls */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                        <CardTitle>Efectos Visuales</CardTitle>
                        <CardDescription>Ajusta la materialidad de la interfaz.</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={resetStyling} title="Restablecer">
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-8 pt-6">
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Redondeo (Radius)</Label>
                            <span className="text-sm text-muted-foreground">{config.styling.radius}rem</span>
                        </div>
                        <Slider
                            min={0}
                            max={1.5}
                            step={0.1}
                            value={[config.styling.radius]}
                            onValueChange={handleRadiusChange}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Desenfoque (Glass Blur)</Label>
                            <span className="text-sm text-muted-foreground">{config.styling.glassIntensity}px</span>
                        </div>
                        <Slider
                            min={0}
                            max={40}
                            step={1}
                            value={[config.styling.glassIntensity]}
                            onValueChange={handleBlurChange}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Opacidad de Capa</Label>
                            <span className="text-sm text-muted-foreground">{Math.round(config.styling.opacity * 100)}%</span>
                        </div>
                        <Slider
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={[config.styling.opacity]}
                            onValueChange={handleOpacityChange}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Live Preview */}
            <Card className="flex flex-col justify-center items-center p-8 bg-muted/20 border-dashed relative overflow-hidden">
                <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-20" />

                <div
                    className="relative z-10 w-64 h-40 flex flex-col items-center justify-center border shadow-lg transition-all duration-300"
                    style={{
                        borderRadius: `${config.styling.radius}rem`,
                        backdropFilter: `blur(${config.styling.glassIntensity}px)`,
                        backgroundColor: `rgba(255, 255, 255, ${config.styling.opacity})`,
                        borderColor: `rgba(255, 255, 255, 0.2)`
                    }}
                >
                    <div className="text-sm font-semibold mb-2">Vista Previa</div>
                    <div className="text-xs text-muted-foreground text-center px-4">
                        Así se verán los paneles flotantes y tarjetas.
                    </div>

                    {/* Inner Element to test nested radius */}
                    <div
                        className="mt-4 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium shadow-sm transition-all duration-300"
                        style={{
                            borderRadius: `calc(${config.styling.radius}rem * 0.5)`
                        }}
                    >
                        Botón Ejemplo
                    </div>
                </div>
            </Card>
        </div>
    );
}
