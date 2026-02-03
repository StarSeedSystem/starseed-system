"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Layout,
    Sparkles,
    Wand2,
    Box,
    Type,
    Circle,
    Maximize,
    Layers,
    Activity,
    Move3d,
    Palette,
    MousePointerClick,
    Eye,
    Zap,
    Square,
    Droplets,
    Snowflake,
    Waves
} from "lucide-react";

const buttonStyles = [
    { value: 'default', label: "Estándar", description: "Limpio y funcional." },
    { value: 'neon', label: "Neón", description: "Bordes brillantes animados." },
    { value: 'liquid', label: "Líquido", description: "Efectos orgánicos de flujo." },
    { value: 'glass', label: "Cristal", description: "Transparencia esmerilada." },
    { value: 'brutal', label: "Brutalista", description: "Bordes duros y alto contraste." }
];

export function UiElementSettings() {
    const { config, updateSection } = useAppearance();
    const { liquidGlass, styling, buttons, animations, background } = config;

    // Helper for Liquid Glass updates
    const updateLiquidGlass = (key: string, value: any) => {
        updateSection("liquidGlass", { [key]: value });
        // Live update CSS vars
        if (typeof value === 'number') {
            if (key === 'distortRadius') document.documentElement.style.setProperty('--glass-blur', `${value * 50}px`);
            if (key === 'distortWidth') document.documentElement.style.setProperty('--glass-opacity', `${value}`);
            if (key === 'smoothStepEdge') document.documentElement.style.setProperty('--glass-saturation', `${100 + (value * 100)}%`);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="border-primary/10 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Layout className="w-6 h-6 text-primary" />
                        Elementos UI
                    </CardTitle>
                    <CardDescription>
                        Central de personalización de botones, paneles y efectos visuales.
                    </CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50 gap-2">
                    <TabsTrigger value="general" className="gap-2"><Box className="w-4 h-4" /> General</TabsTrigger>
                    <TabsTrigger value="toques" className="gap-2"><MousePointerClick className="w-4 h-4" /> Botones</TabsTrigger>
                    <TabsTrigger value="visuals" className="gap-2"><Sparkles className="w-4 h-4" /> Visuales</TabsTrigger>
                    <TabsTrigger value="animations" className="gap-2"><Move3d className="w-4 h-4" /> Animaciones</TabsTrigger>
                    <TabsTrigger value="advanced" className="gap-2"><Wand2 className="w-4 h-4" /> Avanzado (IA)</TabsTrigger>
                </TabsList>

                {/* 1. General UI Settings */}
                <TabsContent value="general" className="space-y-6 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Geometría y Estructura</CardTitle>
                            <CardDescription>Define la forma física de los elementos.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Radius */}
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className="flex items-center gap-2"><Circle className="w-4 h-4" /> Radio Global</Label>
                                    <span className="text-sm text-muted-foreground">{styling.radius}rem</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={1.5}
                                    step={0.1}
                                    value={[styling.radius]}
                                    onValueChange={([val]) => updateSection("styling", { radius: val })}
                                />
                            </div>

                            {/* Border Width */}
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className="flex items-center gap-2"><Maximize className="w-4 h-4" /> Grosor de Borde</Label>
                                    <span className="text-sm text-muted-foreground">{styling.borderWidth}px</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={4}
                                    step={0.5}
                                    value={[styling.borderWidth || 1]}
                                    onValueChange={([val]) => updateSection("styling", { borderWidth: val })}
                                />
                            </div>

                            {/* Spacing / Density Placeholder */}
                            <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-muted/20">
                                <div className="space-y-0.5">
                                    <Label>Modo Compacto</Label>
                                    <p className="text-xs text-muted-foreground">Reduce el espaciado para mostrar más contenido.</p>
                                </div>
                                <Switch disabled checked={false} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 2. Buttons Sub-Tab */}
                <TabsContent value="toques" className="space-y-6 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Tema de Botones</CardTitle>
                            <CardDescription>Selecciona el estilo base para interacciones.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {buttonStyles.map((style) => (
                                    <button
                                        key={style.value}
                                        onClick={() => updateSection("buttons", { style: style.value as any })}
                                        className={cn(
                                            "flex flex-col items-start p-4 rounded-xl border-2 transition-all hover:border-primary/50 text-left",
                                            buttons?.style === style.value ? "border-primary bg-primary/5 shadow-sm" : "border-muted"
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
                            <CardTitle>Comportamiento</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between space-x-2">
                                <div className="flex flex-col space-y-1">
                                    <Label className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Resplandor (Glow)</Label>
                                    <span className="text-xs text-muted-foreground">Añade una sombra luminosa a botones primarios.</span>
                                </div>
                                <Switch
                                    checked={buttons?.glow}
                                    onCheckedChange={(checked) => updateSection("buttons", { glow: checked })}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 3. Visuals & Legibility (Merged) */}
                <TabsContent value="visuals" className="space-y-6 mt-6">
                    {/* Common Layer Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Transparencia y Desenfoque</CardTitle>
                            <CardDescription>Ajustes base del material "Glass".</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Opacidad de Capa</Label>
                                    <span className="text-sm text-muted-foreground">{Math.round(styling.opacity * 100)}%</span>
                                </div>
                                <Slider
                                    min={0.1}
                                    max={1}
                                    step={0.05}
                                    value={[styling.opacity]}
                                    onValueChange={([val]) => updateSection("styling", { opacity: val })}
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Intensidad Blur</Label>
                                    <span className="text-sm text-muted-foreground">{styling.glassIntensity}px</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={40}
                                    step={1}
                                    value={[styling.glassIntensity]}
                                    onValueChange={([val]) => updateSection("styling", { glassIntensity: val })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Integrated Legibility Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" /> Legibilidad y Contraste</CardTitle>
                            <CardDescription>Optimiza la lectura sobre fondos complejos.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <Label>Opacidad de Fondo (Overlay)</Label>
                                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                        {Math.round((background.overlayOpacity || 0) * 100)}%
                                    </span>
                                </div>
                                <Slider
                                    min={0}
                                    max={0.95}
                                    step={0.05}
                                    value={[background.overlayOpacity || 0]}
                                    onValueChange={([val]) => updateSection("background", { overlayOpacity: val })}
                                />
                            </div>
                            <div className="space-y-4">
                                <Label>Modo de Contraste</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <Button
                                        variant={background.overlayColor === 'black' ? 'default' : 'outline'}
                                        onClick={() => updateSection("background", { overlayColor: 'black' })}
                                        className="gap-2"
                                    >
                                        <div className="w-3 h-3 rounded-full bg-black border border-white/20" /> Oscuro
                                    </Button>
                                    <Button
                                        variant={background.overlayColor === 'white' ? 'default' : 'outline'}
                                        onClick={() => updateSection("background", { overlayColor: 'white' })}
                                        className="gap-2"
                                    >
                                        <div className="w-3 h-3 rounded-full bg-white border border-black/10" /> Claro
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Dynamic Theme Settings */}
                    <Card className="border-l-4 border-l-primary/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Palette className="w-5 h-5" /> Ajustes del Tema: {buttons.style.toUpperCase()}
                            </CardTitle>
                            <CardDescription>Configuración específica para el estilo seleccionado.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Crystal Specific */}
                            {buttons.style === 'glass' && (
                                <>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Droplets className="w-4 h-4" /> Refracción</Label>
                                            <span className="text-sm text-muted-foreground">{(styling.refraction || 0).toFixed(1)}</span>
                                        </div>
                                        <Slider
                                            min={0} max={1} step={0.1}
                                            value={[styling.refraction || 0]}
                                            onValueChange={([v]) => updateSection("styling", { refraction: v })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Zap className="w-4 h-4" /> Aberración Cromática</Label>
                                            <span className="text-sm text-muted-foreground">{styling.chromaticAberration}px</span>
                                        </div>
                                        <Slider
                                            min={0} max={10} step={1}
                                            value={[styling.chromaticAberration || 0]}
                                            onValueChange={([v]) => updateSection("styling", { chromaticAberration: v })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Snowflake className="w-4 h-4" /> Opacidad Gélida (Frost)</Label>
                                            <span className="text-sm text-muted-foreground">{(styling.frostOpacity ?? 0.5).toFixed(2)}</span>
                                        </div>
                                        <Slider
                                            min={0} max={1} step={0.05}
                                            value={[styling.frostOpacity ?? 0.5]}
                                            onValueChange={([v]) => updateSection("styling", { frostOpacity: v })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Waves className="w-4 h-4" /> Ruido de Textura</Label>
                                            <span className="text-sm text-muted-foreground">{(styling.glassNoise ?? 0.05).toFixed(2)}</span>
                                        </div>
                                        <Slider
                                            min={0} max={0.2} step={0.01}
                                            value={[styling.glassNoise ?? 0.05]}
                                            onValueChange={([v]) => updateSection("styling", { glassNoise: v })}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Liquid Specific */}
                            {buttons.style === 'liquid' && (
                                <>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Waves className="w-4 h-4" /> Fluidez (Velocidad)</Label>
                                            <span className="text-sm text-muted-foreground">{styling.fluidity ?? 50}</span>
                                        </div>
                                        <Slider
                                            min={0} max={100} step={1}
                                            value={[styling.fluidity ?? 50]}
                                            onValueChange={([v]) => updateSection("styling", { fluidity: v })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Droplets className="w-4 h-4" /> Tensión Superficial</Label>
                                            <span className="text-sm text-muted-foreground">{styling.surfaceTension ?? 50}</span>
                                        </div>
                                        <Slider
                                            min={0} max={100} step={1}
                                            value={[styling.surfaceTension ?? 50]}
                                            onValueChange={([v]) => updateSection("styling", { surfaceTension: v })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between pt-2">
                                        <Label>Motor "Liquid Glass" (Experimental)</Label>
                                        <Switch
                                            checked={liquidGlass?.enabled}
                                            onCheckedChange={(c) => updateLiquidGlass("enabled", c)}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Neon Specific */}
                            {buttons.style === 'neon' && (
                                <>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <Label className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Intensidad de Resplandor</Label>
                                            <span className="text-sm text-muted-foreground">{(styling.glowIntensity || 0).toFixed(1)}</span>
                                        </div>
                                        <Slider
                                            min={0} max={1} step={0.1}
                                            value={[styling.glowIntensity || 0]}
                                            onValueChange={([v]) => updateSection("styling", { glowIntensity: v })}
                                        />
                                        <div className="flex items-center justify-between pt-2">
                                            <Label className="flex items-center gap-2"><Activity className="w-4 h-4" /> Efecto Ticker (Parpadeo)</Label>
                                            <Switch
                                                checked={styling.neonTicker ?? false}
                                                onCheckedChange={(c) => updateSection("styling", { neonTicker: c })}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            {/* Brutalist Specific */}
                            {buttons.style === 'brutal' && (
                                <>
                                    <div className="flex items-center justify-between py-2">
                                        <Label className="flex items-center gap-2"><Square className="w-4 h-4" /> Sombras Duras</Label>
                                        <Switch
                                            checked={styling.hardShadows}
                                            onCheckedChange={(c) => updateSection("styling", { hardShadows: c })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between py-2">
                                        <Label className="flex items-center gap-2"><Type className="w-4 h-4" /> Textos en Mayúsculas</Label>
                                        <Switch
                                            checked={styling.uppercase}
                                            onCheckedChange={(c) => updateSection("styling", { uppercase: c })}
                                        />
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 4. NEW: Animations Tab */}
                <TabsContent value="animations" className="space-y-6 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Motor de Animaciones</CardTitle>
                            <CardDescription>Controla la cinemática de la interfaz.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Master Toggle */}
                            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg border">
                                <div className="flex flex-col space-y-1">
                                    <Label className="text-base">Sistema de Animación</Label>
                                    <span className="text-sm text-muted-foreground">Habilita o deshabilita la mayoría de los efectos de movimiento.</span>
                                </div>
                                <Switch
                                    checked={animations?.enabled ?? true}
                                    onCheckedChange={(c) => updateSection("animations", { enabled: c })}
                                />
                            </div>

                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Interaction Animations */}
                                <div className="space-y-4 p-4 border rounded-lg">
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        <MousePointerClick className="w-4 h-4" /> Interacciones
                                    </h3>

                                    <div className="flex items-center justify-between">
                                        <Label className="cursor-pointer">Escala al Hover</Label>
                                        <Switch
                                            checked={animations?.hover ?? true}
                                            onCheckedChange={(c) => updateSection("animations", { hover: c })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label className="cursor-pointer">Efecto Click</Label>
                                        <Switch
                                            checked={animations?.click ?? true}
                                            onCheckedChange={(c) => updateSection("animations", { click: c })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label className="cursor-pointer">Micro-interacciones</Label>
                                        <Switch
                                            checked={animations?.microInteractions ?? true}
                                            onCheckedChange={(c) => updateSection("animations", { microInteractions: c })}
                                        />
                                    </div>
                                </div>

                                {/* System Animations */}
                                <div className="space-y-4 p-4 border rounded-lg">
                                    <h3 className="font-semibold text-sm flex items-center gap-2">
                                        <Layers className="w-4 h-4" /> Sistema
                                    </h3>

                                    <div className="flex items-center justify-between">
                                        <Label className="cursor-pointer">Transiciones de Página</Label>
                                        <Switch
                                            checked={animations?.pageTransition ?? true}
                                            onCheckedChange={(c) => updateSection("animations", { pageTransition: c })}
                                        />
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <Label>Entrada de Herramientas (Trinity)</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['fade', 'scale', 'slide', 'elastic'].map((mode) => (
                                                <Button
                                                    key={mode}
                                                    variant={animations?.trinityEntry === mode ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => updateSection("animations", { trinityEntry: mode as any })}
                                                    className="text-xs"
                                                >
                                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 5. Advanced / AI Placeholders */}
                <TabsContent value="advanced" className="space-y-6 mt-6">
                    <Card className="border-dashed">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wand2 className="w-5 h-5 text-purple-500" />
                                Generador AI de Interfaces
                            </CardTitle>
                            <CardDescription>Genera estilos únicos usando inteligencia artificial.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="h-32 bg-muted/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                                [Área del Lienzo de Creación Universal]
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="w-full">Explorar Librería Online</Button>
                                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">Generar con IA</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
