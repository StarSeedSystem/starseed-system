"use client";

import React, { useState, useEffect } from "react";
import { useAppearance } from "@/context/appearance-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
    Waves,
    Save,
    Download,
    Upload,
    RefreshCw,
    Trash2,
    Check,
    Monitor,
    Smartphone,
    LayoutTemplate
} from "lucide-react";
import { toast } from "sonner"; // Assuming sonner is used, or we can use a basic alert if not available

const buttonStyles = [
    { value: 'default', label: "Estándar", description: "Limpio y funcional." },
    { value: 'neon', label: "Neón", description: "Bordes brillantes animados." },
    { value: 'liquid', label: "Líquido", description: "Efectos orgánicos de flujo." },
    { value: 'glass', label: "Cristal", description: "Transparencia esmerilada." },
    { value: 'brutal', label: "Brutalista", description: "Bordes duros y alto contraste." }
];

export function UiElementSettings() {
    const {
        config,
        updateSection,
        saveTheme,
        loadTheme,
        deleteTheme,
        exportTheme,
        importTheme,
        resetConfig
    } = useAppearance();

    const { liquidGlass, styling, buttons, animations, background, themeStore } = config;

    // Local state for theme naming
    const [themeNameInput, setThemeNameInput] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Helper for Liquid Glass updates
    const updateLiquidGlass = (key: string, value: any) => {
        updateSection("liquidGlass", { [key]: value });
        // Live update CSS vars for immediate feedback if needed
        if (typeof value === 'number') {
            if (key === 'distortRadius') document.documentElement.style.setProperty('--glass-blur', `${value * 50}px`);
            if (key === 'distortWidth') document.documentElement.style.setProperty('--glass-opacity', `${value}`);
            if (key === 'smoothStepEdge') document.documentElement.style.setProperty('--glass-saturation', `${100 + (value * 100)}%`);
        }
    };

    // Mode Selection Handler
    const setMode = (mode: 'custom' | 'crystal' | 'liquid' | 'solid-crystal' | 'primary') => {
        updateSection('themeStore', { activeMode: mode });

        // Auto-configure base settings for the selected mode
        if (mode === 'crystal') {
            updateSection('buttons', { style: 'glass' });
            updateSection('styling', { crystalPreset: 'clear', radius: 1, borderWidth: 1 });
            updateSection('liquidGlass', { enabled: false });
        } else if (mode === 'liquid') {
            updateSection('buttons', { style: 'liquid' });
            updateSection('styling', { radius: 1.5, fluidity: 80 });
            updateSection('liquidGlass', { enabled: true, applyToUI: true });
        } else if (mode === 'solid-crystal') {
            updateSection('buttons', { style: 'glass' });
            updateSection('styling', { crystalPreset: 'clear', radius: 1, borderWidth: 1 });
            // Hybrid: Liquid variables are handled by global overrides, but we enable the engine
        } else if (mode === 'solid-crystal') {
            updateSection('buttons', { style: 'glass' });
            updateSection('styling', { crystalPreset: 'clear', radius: 1, borderWidth: 1 });
            // Hybrid: Liquid variables are handled by global overrides, but we enable the engine
            updateSection('liquidGlass', { enabled: true, applyToUI: false });
        } else if (mode === 'primary') {
            updateSection('buttons', { style: 'liquid' }); // Uses liquid geometry
            updateSection('styling', { radius: 1.5, fluidity: 50 }); // Matches repo defaults
            updateSection('liquidGlass', { enabled: true, applyToUI: true }); // Full engine support
        } else {
            // Custom mode leaves settings as is, or allows manual control
        }
    };

    const handleSaveTheme = () => {
        if (!themeNameInput.trim()) return;
        saveTheme(themeNameInput);
        setThemeNameInput("");
        setIsSaving(false);
        // Toast handling would go here
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* HERDER & MODE SELECTION */}
            <div className="grid gap-6">
                <Card className="border-primary/10 bg-gradient-to-r from-primary/5 to-transparent overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Sparkles className="w-32 h-32" />
                    </div>
                    <CardHeader>
                        <CardTitle className="text-2xl flex items-center gap-2">
                            <LayoutTemplate className="w-6 h-6 text-primary" />
                            Arquitectura de Diseño
                        </CardTitle>
                        <CardDescription className="text-base">
                            Define el comportamiento físico y visual de la interfaz global.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Crystal Mode */}
                            <button
                                onClick={() => setMode('crystal')}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
                                    themeStore.activeMode === 'crystal'
                                        ? "border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
                                        : "border-muted bg-card hover:bg-muted/50"
                                )}
                            >
                                <div className={cn("p-3 rounded-full", themeStore.activeMode === 'crystal' ? "bg-cyan-500 text-white" : "bg-muted text-muted-foreground")}>
                                    <Sparkles className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold">Modo Cristal</div>
                                    <div className="text-xs text-muted-foreground">Alta fidelidad, refracción y elegancia.</div>
                                </div>
                            </button>

                            {/* Liquid Mode */}
                            <button
                                onClick={() => setMode('liquid')}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
                                    themeStore.activeMode === 'liquid'
                                        ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                                        : "border-muted bg-card hover:bg-muted/50"
                                )}
                            >
                                <div className={cn("p-3 rounded-full", themeStore.activeMode === 'liquid' ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground")}>
                                    <Droplets className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold">Modo Líquido</div>
                                    <div className="text-xs text-muted-foreground">Fluidez orgánica y dinámica React.</div>
                                </div>
                            </button>

                            {/* Solid Crystal Mode */}
                            <button
                                onClick={() => setMode('solid-crystal')}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
                                    themeStore.activeMode === 'solid-crystal'
                                        ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                                        : "border-muted bg-card hover:bg-muted/50"
                                )}
                            >
                                <div className={cn("p-3 rounded-full", themeStore.activeMode === 'solid-crystal' ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>
                                    <Box className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold">Cristal Sólido</div>
                                    <div className="text-xs text-muted-foreground">Tabs Líquidos + Botones Cristal.</div>
                                </div>
                            </button>

                            {/* Primary Mode (Repo Based) */}
                            <button
                                onClick={() => setMode('primary')}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
                                    themeStore.activeMode === 'primary'
                                        ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                                        : "border-muted bg-card hover:bg-muted/50"
                                )}
                            >
                                <div className={cn("p-3 rounded-full", themeStore.activeMode === 'primary' ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground")}>
                                    <Zap className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold">Modo Principal</div>
                                    <div className="text-xs text-muted-foreground">Estilo Original Liquid Glass.</div>
                                </div>
                            </button>

                            {/* Custom Mode */}
                            <button
                                onClick={() => setMode('custom')}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
                                    themeStore.activeMode === 'custom'
                                        ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10"
                                        : "border-muted bg-card hover:bg-muted/50"
                                )}
                            >
                                <div className={cn("p-3 rounded-full", themeStore.activeMode === 'custom' ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground")}>
                                    <Wand2 className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold">Personalizado</div>
                                    <div className="text-xs text-muted-foreground">Configuración manual avanzada.</div>
                                </div>
                            </button>
                        </div>
                    </CardContent>
                </Card>

                {/* THEME TOOLBAR */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Gestión de Temas</CardTitle>
                            <Badge variant="outline" className="font-mono text-xs">{themeStore.savedThemes.length} Guardados</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Save Input Trigger */}
                            {isSaving ? (
                                <div className="flex items-center gap-2 bg-muted/50 p-1 pr-2 rounded-full border animate-in fade-in slide-in-from-left-2">
                                    <Input
                                        autoFocus
                                        value={themeNameInput}
                                        onChange={(e) => setThemeNameInput(e.target.value)}
                                        placeholder="Nombre del tema..."
                                        className="h-8 border-0 bg-transparent focus-visible:ring-0 min-w-[150px]"
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveTheme()}
                                    />
                                    <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={handleSaveTheme}>
                                        <Check className="w-4 h-4 text-green-500" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={() => setIsSaving(false)}>
                                        <span className="text-xs">✕</span>
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="secondary" size="sm" onClick={() => setIsSaving(true)}>
                                    <Save className="w-4 h-4 mr-2" /> Guardar Actual
                                </Button>
                            )}

                            <div className="w-px h-6 bg-border mx-2" />

                            <Button variant="outline" size="sm" onClick={exportTheme}>
                                <Download className="w-4 h-4 mr-2" /> Exportar JSON
                            </Button>

                            <div className="relative">
                                <Button variant="outline" size="sm" onClick={() => document.getElementById('theme-upload')?.click()}>
                                    <Upload className="w-4 h-4 mr-2" /> Importar
                                </Button>
                                <input
                                    type="file"
                                    id="theme-upload"
                                    accept=".json"
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            importTheme(e.target.files[0]);
                                            e.target.value = ''; // reset so same file can be selected again
                                        }
                                    }}
                                />
                            </div>

                            <div className="ml-auto">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (confirm("¿Seguro que quieres resetear toda la apariencia?")) resetConfig();
                                    }}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" /> Resetear Fábrica
                                </Button>
                            </div>
                        </div>
                    </CardContent>

                    {/* Saved Themes List (Collapsible or visible if items exist) */}
                    {themeStore.savedThemes.length > 0 && (
                        <CardFooter className="pt-0 border-t bg-muted/20">
                            <ScrollArea className="w-full whitespace-nowrap pt-4 pb-2">
                                <div className="flex w-max space-x-2">
                                    {themeStore.savedThemes.map((theme) => (
                                        <div key={theme.id} className="group relative">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => loadTheme(theme.id)}
                                                className="pl-3 pr-8 bg-background"
                                            >
                                                <Palette className="w-3 h-3 mr-2 text-primary" />
                                                {theme.name}
                                            </Button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`¿Borrar tema "${theme.name}"?`)) deleteTheme(theme.id);
                                                }}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardFooter>
                    )}
                </Card>
            </div>

            {/* SETTINGS TABS */}
            <Tabs defaultValue="general" className="w-full">
                <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50 gap-2 scrollbar-none">
                    <TabsTrigger value="general" className="gap-2 min-w-[100px]"><Box className="w-4 h-4" /> General</TabsTrigger>
                    <TabsTrigger value="toques" className="gap-2 min-w-[100px]"><MousePointerClick className="w-4 h-4" /> Botones</TabsTrigger>

                    {/* Dynamic Label based on Mode */}
                    <TabsTrigger value="visuals" className="gap-2 min-w-[100px]">
                        {themeStore.activeMode === 'crystal' ? <Sparkles className="w-4 h-4 text-cyan-500" /> :
                            (themeStore.activeMode === 'liquid' || themeStore.activeMode === 'primary') ? <Droplets className="w-4 h-4 text-blue-500" /> :
                                <Eye className="w-4 h-4" />}
                        {themeStore.activeMode === 'crystal' ? "Cristales" : (themeStore.activeMode === 'liquid' || themeStore.activeMode === 'primary') ? "Fluidos" : "Visuales"}
                    </TabsTrigger>

                    <TabsTrigger value="animations" className="gap-2 min-w-[100px]"><Move3d className="w-4 h-4" /> Animaciones</TabsTrigger>
                    <TabsTrigger value="advanced" className="gap-2 min-w-[100px]"><Wand2 className="w-4 h-4" /> IA</TabsTrigger>
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

                    {/* DYNAMIC SETTINGS BASED ON MODE */}

                    {/* CRYSTAL MODE PRESETS */}
                    {(themeStore.activeMode === 'crystal' || themeStore.activeMode === 'custom') && (
                        <Card className="border-cyan-500/20 bg-cyan-500/5 mb-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" /> Preajustes de Cristal</CardTitle>
                                <CardDescription>Configuraciones ópticas avanzadas para el material de la interfaz.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {[
                                        { value: 'none', label: "Manual", description: "Control personalizado." },
                                        { value: 'clear', label: "Clear Crystal", description: "Puro, nítido y altamente transparente." },
                                        { value: 'frosted', label: "Frosted Glass", description: "Privacidad difusa y suave." },
                                        { value: 'holographic', label: "Holographic", description: "Dispersión prismática de luz." },
                                        { value: 'obsidian', label: "Obsidian", description: "Vidrio volcánico oscuro." },
                                        { value: 'quantic', label: "Quantic", description: "Interferencia digital y ruido." },
                                        { value: 'organic-frosted', label: "Organic Frosted", description: "Efecto de hielo orgánico." },
                                    ].map((preset) => (
                                        <button
                                            key={preset.value}
                                            onClick={() => updateSection("styling", { crystalPreset: preset.value as any })}
                                            className={cn(
                                                "flex flex-col items-start p-4 rounded-xl border-2 transition-all hover:border-cyan-500/50 text-left relative overflow-hidden",
                                                styling.crystalPreset === preset.value
                                                    ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                                    : "border-muted/50 hover:bg-muted/10 bg-background/50"
                                            )}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                                            <span className="font-semibold text-sm mb-1 z-10">{preset.label}</span>
                                            <span className="text-xs text-muted-foreground z-10">{preset.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* LIQUID MODE SETTINGS */}
                    {(themeStore.activeMode === 'liquid' || themeStore.activeMode === 'primary' || themeStore.activeMode === 'solid-crystal' || themeStore.activeMode === 'custom') && (
                        <Card className="border-blue-500/20 bg-blue-500/5 mb-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Droplets className="w-5 h-5 text-blue-400" /> Dinámica de Fluidos</CardTitle>
                                <CardDescription>Controla la viscosidad y reacción de la interfaz líquida.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
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

                                {/* Deep Integration Liquid Glass React */}
                                <div className="pt-4 border-t border-blue-500/10">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-base">Efecto Deep Liquid (React)</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Habilita el motor físico de liquid-glass-react v1.0
                                            </p>
                                        </div>
                                        <Switch
                                            checked={liquidGlass.enabled}
                                            onCheckedChange={(c) => updateLiquidGlass("enabled", c)}
                                        />
                                    </div>

                                    {liquidGlass?.enabled && (
                                        <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 pt-4">

                                            {/* Row 1: Distortion & Blur */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs text-muted-foreground">Escala de Desplazamiento</Label>
                                                    <span className="text-xs font-mono">{liquidGlass.displacementScale ?? 64}</span>
                                                </div>
                                                <Slider
                                                    min={0} max={200} step={1}
                                                    value={[liquidGlass.displacementScale ?? 64]}
                                                    onValueChange={([v]) => updateLiquidGlass("displacementScale", v)}
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs text-muted-foreground">Desenfoque (Blur)</Label>
                                                    <span className="text-xs font-mono">{liquidGlass.blurAmount ?? 0.0625}</span>
                                                </div>
                                                <Slider
                                                    min={0} max={2} step={0.001}
                                                    value={[liquidGlass.blurAmount ?? 0.0625]}
                                                    onValueChange={([v]) => updateLiquidGlass("blurAmount", v)}
                                                />
                                            </div>

                                            {/* Row 2: Saturation & Aberration */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs text-muted-foreground">Saturación</Label>
                                                    <span className="text-xs font-mono">{liquidGlass.saturation ?? 130}</span>
                                                </div>
                                                <Slider
                                                    min={0} max={200} step={1}
                                                    value={[liquidGlass.saturation ?? 130]}
                                                    onValueChange={([v]) => updateLiquidGlass("saturation", v)}
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs text-muted-foreground">Intensidad Aberración</Label>
                                                    <span className="text-xs font-mono">{liquidGlass.aberrationIntensity ?? 2}</span>
                                                </div>
                                                <Slider
                                                    min={0} max={10} step={0.1}
                                                    value={[liquidGlass.aberrationIntensity ?? 2]}
                                                    onValueChange={([v]) => updateLiquidGlass("aberrationIntensity", v)}
                                                />
                                            </div>

                                            {/* Row 3: Elasticity & Radius */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs text-muted-foreground">Elasticidad</Label>
                                                    <span className="text-xs font-mono">{liquidGlass.elasticity ?? 0.15}</span>
                                                </div>
                                                <Slider
                                                    min={0} max={1} step={0.01}
                                                    value={[liquidGlass.elasticity ?? 0.15]}
                                                    onValueChange={([v]) => updateLiquidGlass("elasticity", v)}
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between">
                                                    <Label className="text-xs text-muted-foreground">Radio de Esquinas</Label>
                                                    <span className="text-xs font-mono">{liquidGlass.cornerRadius ?? 100}</span>
                                                </div>
                                                <Slider
                                                    min={0} max={300} step={1}
                                                    value={[liquidGlass.cornerRadius ?? 100]}
                                                    onValueChange={([v]) => updateLiquidGlass("cornerRadius", v)}
                                                />
                                            </div>

                                            {/* Mode Selection */}
                                            <div className="md:col-span-2 space-y-2">
                                                <Label className="text-xs text-muted-foreground">Modo de Renderizado</Label>
                                                <Select
                                                    value={liquidGlass.mode ?? "standard"}
                                                    onValueChange={(v) => updateLiquidGlass("mode", v)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecciona un modo" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="standard">Standard</SelectItem>
                                                        <SelectItem value="polar">Polar</SelectItem>
                                                        <SelectItem value="prominent">Prominent</SelectItem>
                                                        <SelectItem value="shader">Shader-only</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Common Layer Settings */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Base Material</CardTitle>
                            <CardDescription>Ajustes universales de opacidad y desenfoque.</CardDescription>
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
                                    <Label>Intensidad Blur (Backdrop)</Label>
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

                    {/* NEW: Text Diffusion Settings */}
                    <Card className="border-indigo-500/20 bg-indigo-500/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Type className="w-5 h-5 text-indigo-400" /> Difusión de Texto 3D</CardTitle>
                            <CardDescription>Capa de cristal líquido bajo el texto para máxima legibilidad visual.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Radio de Difusión (Blur)</Label>
                                    <span className="text-sm font-mono text-indigo-400">{config.textDiffusion?.blur ?? 15}px</span>
                                </div>
                                <Slider
                                    min={0} max={30} step={1}
                                    value={[config.textDiffusion?.blur ?? 15]}
                                    onValueChange={([v]) => updateSection("textDiffusion", { blur: v })}
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Opacidad de Capa</Label>
                                    <span className="text-sm font-mono text-indigo-400">{Math.round((config.textDiffusion?.opacity ?? 0.7) * 100)}%</span>
                                </div>
                                <Slider
                                    min={0} max={1} step={0.05}
                                    value={[config.textDiffusion?.opacity ?? 0.7]}
                                    onValueChange={([v]) => updateSection("textDiffusion", { opacity: v })}
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label>Intensidad de Resplandor (Glow)</Label>
                                    <span className="text-sm font-mono text-indigo-400">{Math.round((config.textDiffusion?.glowStrength ?? 0.5) * 100)}%</span>
                                </div>
                                <Slider
                                    min={0} max={1} step={0.05}
                                    value={[config.textDiffusion?.glowStrength ?? 0.5]}
                                    onValueChange={([v]) => updateSection("textDiffusion", { glowStrength: v })}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 4. Animations Tab (Unchanged mostly) */}
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
        </div >
    );
}
