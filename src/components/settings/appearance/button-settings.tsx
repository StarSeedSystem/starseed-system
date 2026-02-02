"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MousePointerClick, Sparkles, BoxSelect, Circle } from "lucide-react";

const buttonStyles = [
    { value: 'default', label: "Estándar", description: "Limpio y funcional." },
    { value: 'neon', label: "Neón", description: "Bordes brillantes animados." },
    { value: 'liquid', label: "Líquido", description: "Efectos orgánicos de flujo." },
    { value: 'glass', label: "Cristal", description: "Transparencia esmerilada." },
    { value: 'brutal', label: "Brutalista", description: "Bordes duros y alto contraste." }
];

export function ButtonSettings() {
    const { config, updateSection } = useAppearance();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Estilo de Botones</CardTitle>
                    <CardDescription>Define la interacción táctil de tu sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {buttonStyles.map((style) => (
                            <button
                                key={style.value}
                                onClick={() => updateSection("buttons", { style: style.value as any })}
                                className={cn(
                                    "flex flex-col items-start p-4 rounded-xl border-2 transition-all hover:border-primary/50 text-left",
                                    config.buttons?.style === style.value ? "border-primary bg-primary/5" : "border-muted"
                                )}
                            >
                                <span className="font-semibold text-sm mb-1">{style.label}</span>
                                <span className="text-xs text-muted-foreground">{style.description}</span>
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Propiedades Físicas</CardTitle>
                    <CardDescription>Ajusta la forma y el comportamiento.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label className="flex items-center gap-2"><Circle className="w-4 h-4" /> Radio de Borde</Label>
                            <span className="text-sm text-muted-foreground">{config.buttons?.radius}rem</span>
                        </div>
                        <Slider
                            min={0}
                            max={2}
                            step={0.1}
                            value={[config.buttons?.radius || 0.5]}
                            onValueChange={([val]) => updateSection("buttons", { radius: val })}
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-2">
                        <div className="flex flex-col space-y-1">
                            <Label className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Resplandor (Glow)</Label>
                            <span className="text-xs text-muted-foreground">Añade una sombra luminosa a los botones primarios.</span>
                        </div>
                        <Switch
                            checked={config.buttons?.glow}
                            onCheckedChange={(checked) => updateSection("buttons", { glow: checked })}
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-2">
                        <div className="flex flex-col space-y-1">
                            <Label className="flex items-center gap-2"><MousePointerClick className="w-4 h-4" /> Animaciones</Label>
                            <span className="text-xs text-muted-foreground">Habilitar efectos de hover y click.</span>
                        </div>
                        <Switch
                            checked={config.buttons?.animation}
                            onCheckedChange={(checked) => updateSection("buttons", { animation: checked })}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
