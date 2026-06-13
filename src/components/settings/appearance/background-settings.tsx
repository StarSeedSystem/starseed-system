"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Check, ImagePlus, PaintBucket, Sparkles, Activity, Grip, Waves, Droplets } from "lucide-react";

const solidColors = [
    "#000000", "#1a1a1a", "#ffffff", "#f4f4f5", "#0f172a", "#1e293b",
    "#450a0a", "#172554", "#1a2e05", "#4c1d95"
];

const gradients = [
    { value: 'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)', label: "Ocean" },
    { value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: "Deep Purple" },
    { value: 'linear-gradient(to top, #30cfd0 0%, #330867 100%)', label: "Night" },
    { value: 'linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)', label: "Dream" },
    { value: 'linear-gradient(to right, #fa709a 0%, #fee140 100%)', label: "Sunset" },
    { value: 'conic-gradient(at center top, rgb(15, 23, 42), rgb(88, 28, 135), rgb(15, 23, 42))', label: "Spotlight" }
];

const images = [
    { value: 'https://images.unsplash.com/photo-1432251407527-504a6b4174a2?q=80&w=1480', label: "Nebula" },
    { value: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=1480', label: "Starscape" },
    { value: 'https://images.unsplash.com/photo-1614850523060-8da1d56ae167?q=80&w=1480', label: "Fluid" },
    { value: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1480', label: "Tech Globe" },
    { value: 'https://i.ibb.co/MDbLn4N4/vectors.png', label: "Vector Winds" },
    { value: 'https://img.freepik.com/free-vector/flat-floral-spring-pattern-design_23-2150117078.jpg', label: "Spring" },
    { value: 'https://images.fineartamerica.com/images/artworkimages/mediumlarge/3/beautiful-orange-and-pastel-flowers-seamless-pattern-julien.jpg', label: "Flowers" },
    { value: 'https://media.istockphoto.com/id/1430511443/vector/christmas-mistletoe-foliage-and-berries-vector-seamless-pattern.jpg?s=612x612&w=0&k=20&c=oqxlH7ytgd5yjBQroACirJ1gH7Au1tq8gmsdeGd-Crk=', label: "Mistletoe" },
];

export function BackgroundSettings() {
    const { config, updateSection } = useAppearance();

    const handleCustomImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateSection("background", { type: 'image', value: e.target.value });
    };

    // Fondos psicodélicos de colores líquidos, fluidos e interactivos.
    const liquidPresets = [
        { id: "liquid-aurora", label: "Aurora Líquida", desc: "Cintas verde-cian que respiran", grad: "from-emerald-400 via-cyan-400 to-violet-500" },
        { id: "liquid-plasma", label: "Plasma Psicodélico", desc: "Magenta y cian en fusión fluida", grad: "from-pink-500 via-violet-500 to-cyan-400" },
        { id: "liquid-lava", label: "Lava Solar", desc: "Naranjas y rojos en movimiento", grad: "from-amber-400 via-red-500 to-pink-500" },
        { id: "liquid-oceanic", label: "Marea Profunda", desc: "Azules abisales y turquesa", grad: "from-sky-500 via-blue-600 to-teal-400" },
        { id: "liquid-iris", label: "Iris Cuántica", desc: "Espectro completo iridiscente", grad: "from-violet-500 via-pink-400 to-lime-400" },
    ];

    // Tema Materia Viva — oro + cristal + geometría sagrada (rediseño Nexus/Café).
    // SOP: architecture/integracion-portal-starseed-os.md → "Tema Materia Viva (v1)"
    const materiaPresets = [
        { id: "materia-oro-vivo", label: "Oro Vivo", desc: "Ámbar y oro sobre verde profundo", grad: "linear-gradient(135deg, #0d130e 0%, #2a2410 55%, #e9c46a 100%)", dot: "#e9c46a" },
        { id: "materia-cristal-liquido", label: "Cristal Líquido", desc: "Cian y lavanda cristalinos", grad: "linear-gradient(135deg, #0d130e 0%, #14222a 55%, #7fd8e8 100%)", dot: "#9aa7ff" },
        { id: "materia-bosque-dorado", label: "Bosque Dorado", desc: "Lima y musgo con destellos de oro", grad: "linear-gradient(135deg, #0d130e 0%, #1c2a10 55%, #a8c66c 100%)", dot: "#d9ed92" },
    ] as const;
    const materiaIntensity = config.background.intensity ?? 0.7;

    return (
        <div className="space-y-6">
            <Tabs defaultValue="solid" className="w-full">
                <TabsList className="grid w-full grid-cols-7 mb-6">
                    <TabsTrigger value="solid" className="gap-2"><PaintBucket className="h-4 w-4" /> Sólido</TabsTrigger>
                    <TabsTrigger value="gradient" className="flex-1">Gradiente</TabsTrigger>
                    <TabsTrigger value="image" className="flex-1">Imagen</TabsTrigger>
                    <TabsTrigger value="filters" className="flex-1 flex gap-2 items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5" />
                        Filtros
                    </TabsTrigger>
                    <TabsTrigger value="webgl" className="flex-1 flex gap-2 items-center justify-center">
                        <Activity className="w-3.5 h-3.5" />
                        Fondos Dinámicos
                    </TabsTrigger>
                    <TabsTrigger value="liquid" className="flex-1 flex gap-2 items-center justify-center">
                        <Droplets className="w-3.5 h-3.5" />
                        Líquidos
                    </TabsTrigger>
                    <TabsTrigger value="materia" className="flex-1 flex gap-2 items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5" />
                        Materia Viva ✦
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="liquid">
                    <Card>
                        <CardHeader>
                            <h3 className="text-lg font-medium mb-1">Fondos Psicodélicos Líquidos</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                                Colores líquidos, fluidos e interactivos que respiran y reaccionan al cursor.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {liquidPresets.map((preset) => (
                                    <button
                                        key={preset.id}
                                        onClick={() => updateSection("background", { type: preset.id as any })}
                                        className={cn(
                                            "group relative overflow-hidden h-24 p-4 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] active:scale-95",
                                            (config.background.type as any) === preset.id ? "border-primary ring-2 ring-primary/30" : "border-muted hover:border-border"
                                        )}
                                    >
                                        <div className={cn("absolute inset-0 opacity-50 group-hover:opacity-70 bg-gradient-to-br transition-opacity animate-gradient-x", preset.grad)} />
                                        <div className="absolute inset-0 bg-black/30" />
                                        <div className="relative">
                                            <div className="font-semibold text-white drop-shadow">{preset.label}</div>
                                            <div className="text-[11px] text-white/80 drop-shadow">{preset.desc}</div>
                                        </div>
                                        {(config.background.type as any) === preset.id && (
                                            <Check className="absolute top-2 right-2 w-4 h-4 text-white drop-shadow" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="materia">
                    <Card>
                        <CardHeader>
                            <h3 className="text-lg font-medium mb-1">Materia Viva ✦</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                                Oro, cristal y geometría sagrada del rediseño Nexus/Café. Canvas 2D ligero:
                                Flor de la Vida en rotación lenta, partículas ascendentes y brillo que sigue al cursor.
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <style>{`
                                @keyframes ssMateriaFloat {
                                    0% { transform: translateY(12px) scale(0.8); opacity: 0; }
                                    25% { opacity: 1; }
                                    75% { opacity: 0.85; }
                                    100% { transform: translateY(-44px) scale(1.05); opacity: 0; }
                                }
                            `}</style>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {materiaPresets.map((preset) => (
                                    <button
                                        key={preset.id}
                                        onClick={() => updateSection("background", { type: preset.id })}
                                        className={cn(
                                            "group relative overflow-hidden h-24 p-4 rounded-2xl border-2 text-left transition-all hover:scale-[1.02] active:scale-95",
                                            config.background.type === preset.id ? "border-primary ring-2 ring-primary/30" : "border-muted hover:border-border"
                                        )}
                                    >
                                        {/* Mini previsualización CSS animada: gradiente dorado + puntos flotantes */}
                                        <div className="absolute inset-0 opacity-70 group-hover:opacity-90 transition-opacity" style={{ background: preset.grad }} />
                                        <div className="absolute inset-0 bg-black/25" />
                                        <span className="absolute rounded-full" style={{ width: 5, height: 5, left: "68%", bottom: 8, background: preset.dot, boxShadow: `0 0 8px ${preset.dot}`, animation: "ssMateriaFloat 3.2s ease-in-out infinite" }} />
                                        <span className="absolute rounded-full" style={{ width: 4, height: 4, left: "82%", bottom: 6, background: preset.dot, boxShadow: `0 0 6px ${preset.dot}`, animation: "ssMateriaFloat 4.1s ease-in-out 1.1s infinite" }} />
                                        <span className="absolute rounded-full" style={{ width: 3, height: 3, left: "56%", bottom: 10, background: "#e9c46a", boxShadow: "0 0 6px #e9c46a", animation: "ssMateriaFloat 3.7s ease-in-out 2s infinite" }} />
                                        <div className="relative">
                                            <div className="font-semibold text-white drop-shadow">{preset.label}</div>
                                            <div className="text-[11px] text-white/80 drop-shadow">{preset.desc}</div>
                                        </div>
                                        {config.background.type === preset.id && (
                                            <Check className="absolute top-2 right-2 w-4 h-4 text-white drop-shadow" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-3 pt-4 border-t">
                                <div className="flex justify-between">
                                    <Label>Intensidad</Label>
                                    <span className="text-xs text-muted-foreground">{Math.round(materiaIntensity * 100)}</span>
                                </div>
                                <Slider
                                    min={0} max={100} step={1}
                                    value={[Math.round(materiaIntensity * 100)]}
                                    onValueChange={([val]) => updateSection("background", { intensity: val / 100 })}
                                />
                                <p className="text-xs text-muted-foreground">Escala la cantidad de partículas y el brillo del patrón sagrado.</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="webgl">
                    <Card>
                        <CardHeader>
                            <h3 className="text-lg font-medium mb-1">Fondos Dinámicos (WebGL)</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Experiencias visuales renderizadas en tiempo real.</p>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { id: 'hex', name: 'Hex', icon: Activity },
                                    { id: 'nebula', name: 'Nebula', icon: Sparkles },
                                    { id: 'grid', name: 'Grid', icon: Grip },
                                    { id: 'waves', name: 'Waves', icon: Waves },
                                    { id: 'liquid', name: 'Liquid', icon: Droplets },
                                ].map((variant) => (
                                    <button
                                        key={variant.id}
                                        onClick={() => updateSection("background", { type: 'webgl', webglVariant: variant.id as any })}
                                        className={cn(
                                            "flex flex-col items-center justify-center p-6 gap-2 rounded-xl border-2 transition-all hover:scale-105 active:scale-95",
                                            config.background.webglVariant === variant.id ? "border-primary bg-primary/10 text-primary" : "border-muted hover:bg-muted/50"
                                        )}
                                    >
                                        <variant.icon className="w-8 h-8 opacity-70" />
                                        <span className="font-medium capitalize">{variant.name}</span>
                                    </button>
                                ))}
                            </div>

                            {config.background.webglVariant === 'liquid' && (
                                <div className="space-y-4 pt-4 border-t">
                                    <Label>Colores del Líquido</Label>
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                        {[0, 1, 2, 3, 4, 5].map((index) => (
                                            <div key={index} className="flex flex-col gap-1">
                                                <input
                                                    type="color"
                                                    value={config.background.liquidColors?.[index] || "#000000"}
                                                    onChange={(e) => {
                                                        const newColors = [...(config.background.liquidColors || [])];
                                                        newColors[index] = e.target.value;
                                                        updateSection("background", { liquidColors: newColors });
                                                    }}
                                                    className="w-full h-10 rounded-md cursor-pointer border border-border"
                                                />
                                                <span className="text-[10px] text-center text-muted-foreground uppercase">
                                                    Color {index + 1}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 pt-4 border-t">
                                <Label>Velocidad de Simulación</Label>
                                <Slider
                                    min={0} max={2} step={0.1}
                                    value={[config.background.webglSpeed || 0.5]}
                                    onValueChange={([val]) => updateSection("background", { webglSpeed: val })}
                                />

                                <Label>Zoom / Escala</Label>
                                <Slider
                                    min={0.5} max={3} step={0.1}
                                    value={[config.background.webglZoom || 1.0]}
                                    onValueChange={([val]) => updateSection("background", { webglZoom: val })}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="filters">
                    <Card>
                        <CardHeader>
                            <CardTitle>Filtros de Capa</CardTitle>
                            <CardDescription>Aplica efectos dinámicos sobre cualquier fondo.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg border">
                                <div className="space-y-1">
                                    <h4 className="font-medium">Ondas Dinámicas</h4>
                                    <p className="text-xs text-muted-foreground">Efecto de metal líquido interactivo.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Switch comp wasn't imported, checking imports. If not present, use checkbox or button toggle */}
                                    <Button
                                        variant={config.background.filter?.enabled && config.background.filter?.type === 'waves' ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => {
                                            const isEnabled = !(config.background.filter?.enabled && config.background.filter?.type === 'waves');
                                            updateSection("background", {
                                                filter: {
                                                    ...(config.background.filter || { settings: { opacity: 0.5, blendMode: 'overlay' } }),
                                                    enabled: isEnabled,
                                                    type: isEnabled ? 'waves' : 'none'
                                                }
                                            });
                                        }}
                                    >
                                        {config.background.filter?.enabled && config.background.filter?.type === 'waves' ? "Activado" : "Desactivado"}
                                    </Button>
                                </div>
                            </div>

                            {config.background.filter?.type === 'waves' && (
                                <div className="space-y-4 pt-4 border-t animate-in fade-in slide-in-from-top-4 duration-300">
                                    <Label>Propiedades de Ondas</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs text-muted-foreground">Metallicidad</Label>
                                                <span className="text-xs text-muted-foreground">{(config.background.filter.settings.waveMetalness || 0.75).toFixed(2)}</span>
                                            </div>
                                            <Slider
                                                min={0} max={1} step={0.05}
                                                value={[config.background.filter.settings.waveMetalness ?? 0.75]}
                                                onValueChange={([val]) => updateSection("background", {
                                                    filter: {
                                                        ...config.background.filter!,
                                                        settings: { ...(config.background.filter?.settings || { opacity: 0.5, blendMode: 'overlay' }), waveMetalness: val }
                                                    }
                                                })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs text-muted-foreground">Rugosidad</Label>
                                                <span className="text-xs text-muted-foreground">{(config.background.filter.settings.waveRoughness || 0.25).toFixed(2)}</span>
                                            </div>
                                            <Slider
                                                min={0} max={1} step={0.05}
                                                value={[config.background.filter.settings.waveRoughness ?? 0.25]}
                                                onValueChange={([val]) => updateSection("background", {
                                                    filter: {
                                                        ...config.background.filter!,
                                                        settings: { ...(config.background.filter?.settings || { opacity: 0.5, blendMode: 'overlay' }), waveRoughness: val }
                                                    }
                                                })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="solid">
                    <Card>
                        <CardHeader>
                            <CardTitle>Colores Sólidos</CardTitle>
                            <CardDescription>Minimalismo puro para máximo enfoque.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-5 md:grid-cols-10 gap-4">
                                {solidColors.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => updateSection("background", { type: 'solid', value: color })}
                                        className={cn(
                                            "h-12 w-full rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                            config.background.value === color && config.background.type === 'solid' ? "border-primary scale-110" : "border-transparent"
                                        )}
                                        style={{ backgroundColor: color }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="gradient">
                    <Card>
                        <CardHeader>
                            <CardTitle>Gradientes Atmosféricos</CardTitle>
                            <CardDescription>Añade profundidad y dinamismo.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {gradients.map((g) => (
                                    <button
                                        key={g.label}
                                        onClick={() => updateSection("background", { type: 'gradient', value: g.value })}
                                        className={cn(
                                            "group relative h-24 w-full overflow-hidden rounded-xl border-2 transition-all hover:border-primary/50",
                                            config.background.value === g.value && config.background.type === 'gradient' ? "border-primary" : "border-transparent"
                                        )}
                                    >
                                        <div className="absolute inset-0" style={{ background: g.value }} />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                        <span className="absolute bottom-2 left-2 text-xs font-medium text-white drop-shadow-md">
                                            {g.label}
                                        </span>
                                        {config.background.value === g.value && config.background.type === 'gradient' && (
                                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="image">
                    <Card>
                        <CardHeader>
                            <CardTitle>Imágenes de Entorno</CardTitle>
                            <CardDescription>Usa fondos inmersivos de alta calidad.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {images.map((img) => (
                                    <button
                                        key={img.label}
                                        onClick={() => updateSection("background", { type: 'image', value: img.value })}
                                        className={cn(
                                            "group relative h-24 w-full overflow-hidden rounded-xl border-2 transition-all hover:border-primary/50",
                                            config.background.value === img.value && config.background.type === 'image' ? "border-primary" : "border-transparent"
                                        )}
                                    >
                                        <div
                                            className="absolute inset-0 bg-cover bg-center"
                                            style={{ backgroundImage: `url(${img.value})` }}
                                        />
                                        <span className="absolute bottom-2 left-2 text-xs font-bold text-white drop-shadow-md z-10">
                                            {img.label}
                                        </span>
                                        {config.background.value === img.value && config.background.type === 'image' && (
                                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 z-10">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <Label>URL Personalizada</Label>
                                <Input
                                    placeholder="https://..."
                                    onChange={handleCustomImage}
                                    // Don't bind value strictly if selected preset is one of the grid items to avoid confusion, 
                                    // but binding it allows editing. Let's bind.
                                    value={config.background.type === 'image' ? config.background.value : ''}
                                />
                                <p className="text-xs text-muted-foreground">Pega un enlace directo a una imagen.</p>
                            </div>

                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Card>
                <CardHeader>
                    <CardTitle>Animación de Fondo</CardTitle>
                    <CardDescription>Añade movimiento cinemático a tu fondo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { value: 'none', label: 'Estático', icon: '⏹️' },
                            { value: 'pan', label: 'Panorámica', icon: '↔️' },
                            { value: 'zoom', label: 'Zoom Suave', icon: '🔍' },
                            { value: 'pulse', label: 'Respiración', icon: '✨' },
                            { value: 'scroll', label: 'Flujo', icon: '⬇️' },
                        ].map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => updateSection("background", { animation: opt.value as any })}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all hover:border-primary/50",
                                    config.background.animation === opt.value ? "border-primary bg-primary/5" : "border-muted"
                                )}
                            >
                                <span className="text-2xl">{opt.icon}</span>
                                <span className="text-sm font-medium">{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
