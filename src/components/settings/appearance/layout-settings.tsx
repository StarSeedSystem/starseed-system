"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    LayoutDashboard, AppWindow,
    PanelBottom, PanelRight,
    MousePointerClick, Minimize2, Maximize2,
    Eye, EyeOff, Activity, Move, Anchor,
    Layout, MousePointer2, Smartphone, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function LayoutSettings() {
    const { config, updateSection } = useAppearance();
    const { trinity } = config;

    const updateTrinity = (key: string, value: any) => {
        updateSection("trinity", { ...trinity, [key]: value });
    };

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Trinity General Configuration (Mode & Style) */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        Interfaz Trinity
                    </CardTitle>
                    <CardDescription>
                        Configuración global del sistema de interfaz.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                    {/* Interaction Mode */}
                    <div className="space-y-3">
                        <Label className="text-base flex items-center gap-2">
                            <MousePointer2 className="w-4 h-4" />
                            Modo de Interacción
                        </Label>
                        <RadioGroup
                            value={trinity.mode || "floating"}
                            onValueChange={(val) => updateTrinity("mode", val)}
                            className="grid grid-cols-2 gap-4"
                        >
                            <div className="relative">
                                <RadioGroupItem value="floating" id="mode-floating" className="peer sr-only" />
                                <Label
                                    htmlFor="mode-floating"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer transition-all"
                                >
                                    <Move className="mb-2 h-5 w-5" />
                                    <span className="text-sm font-medium">Flotante</span>
                                    <span className="text-[10px] text-muted-foreground text-center">Arrastrable y dinámico</span>
                                </Label>
                            </div>
                            <div className="relative">
                                <RadioGroupItem value="docked" id="mode-docked" className="peer sr-only" />
                                <Label
                                    htmlFor="mode-docked"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer transition-all"
                                >
                                    <Layout className="mb-2 h-5 w-5" />
                                    <span className="text-sm font-medium">Fijo</span>
                                    <span className="text-[10px] text-muted-foreground text-center">Posición estática</span>
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Visual Style */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-base flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                Estilo Visual
                            </Label>
                            <Select
                                value={trinity.style || "glass"}
                                onValueChange={(val) => updateTrinity("style", val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar estilo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="glass">Cristal (Glassmorphism)</SelectItem>
                                    <SelectItem value="solid">Sólido</SelectItem>
                                    <SelectItem value="minimal">Minimalista</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Define la apariencia de los componentes de la interfaz.
                            </p>
                        </div>


                        <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-muted/20">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Expandido al Inicio</Label>
                            </div>
                            <Switch
                                checked={trinity.isExpanded}
                                onCheckedChange={(checked) => updateTrinity("isExpanded", checked)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Menu Customization */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MousePointerClick className="w-5 h-5 text-primary" />
                        Personalización de Menús
                    </CardTitle>
                    <CardDescription>
                        Ajusta la apariencia y comportamiento de los elementos del menú.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Icon Scale */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <Label>Escala de Iconos</Label>
                            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                {trinity.menuCustomization?.iconScale ?? 1}x
                            </span>
                        </div>
                        <Slider
                            defaultValue={[trinity.menuCustomization?.iconScale ?? 1]}
                            max={1.5}
                            min={0.8}
                            step={0.1}
                            onValueChange={(vals) => updateTrinity("menuCustomization", { ...trinity.menuCustomization, iconScale: vals[0] })}
                            className="cursor-pointer"
                        />
                    </div>

                    {/* Animation Speed */}
                    <div className="space-y-3">
                        <Label>Velocidad de Animación</Label>
                        <Select
                            value={trinity.menuCustomization?.animationSpeed || "normal"}
                            onValueChange={(val) => updateTrinity("menuCustomization", { ...trinity.menuCustomization, animationSpeed: val })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Normal" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="slow">Lento (Cinemático)</SelectItem>
                                <SelectItem value="normal">Normal (Fluido)</SelectItem>
                                <SelectItem value="fast">Rápido (Reactivo)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Show Labels Toggle */}
                    <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-muted/20">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Mostrar Etiquetas</Label>
                        </div>
                        <Switch
                            checked={trinity.menuCustomization?.showLabels !== false}
                            onCheckedChange={(checked) => updateTrinity("menuCustomization", { ...trinity.menuCustomization, showLabels: checked })}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* OmniDock Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AppWindow className="w-5 h-5 text-primary" />
                        OmniDock
                    </CardTitle>
                    <CardDescription>Comportamiento de la barra inferior.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <RadioGroup
                        value={trinity.dockBehavior || "anchor-only"}
                        onValueChange={(val) => updateTrinity("dockBehavior", val)}
                        className="space-y-3"
                    >
                        {[
                            { value: "always-visible", label: "Siempre Visible", desc: "Fijo en la parte inferior", icon: LayoutDashboard },
                            { value: "auto-hide", label: "Auto-ocultar", desc: "Aparece al acercarse", icon: Minimize2 },
                            { value: "anchor-only", label: "Solo Ancla", desc: "Activa con el borde inferior", icon: Anchor },
                        ].map((opt) => (
                            <div key={opt.value} className="flex items-center space-x-2">
                                <RadioGroupItem value={opt.value} id={`dock-${opt.value}`} />
                                <Label htmlFor={`dock-${opt.value}`} className="flex flex-1 items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <opt.icon className="h-4 w-4 text-muted-foreground" />
                                        <div className="grid gap-0.5">
                                            <span className="font-medium text-sm">{opt.label}</span>
                                            <span className="text-xs text-muted-foreground">{opt.desc}</span>
                                        </div>
                                    </div>
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>
                </CardContent>
            </Card>

            {/* Perimeter / Edge Settings */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Maximize2 className="w-5 h-5 text-primary" />
                        Perímetro Sensible
                    </CardTitle>
                    <CardDescription>Ajusta el rango de detección para los bordes activos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <Label>Sensibilidad de Activación</Label>
                            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{trinity.edgeSensitivity || 20}px</span>
                        </div>
                        <Slider
                            defaultValue={[trinity.edgeSensitivity || 20]}
                            max={100}
                            min={5}
                            step={5}
                            onValueChange={(vals) => updateTrinity("edgeSensitivity", vals[0])}
                            className="cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground px-1">
                            <span>Baja (Preciso)</span>
                            <span>Alta (Fácil acceso)</span>
                        </div>
                    </div>
                </CardContent>
            </Card>


            {/* Legibility & Interface Controls (Moved to UI Elements) */}
            {/* Removed Card */}
        </div>
    );
}
