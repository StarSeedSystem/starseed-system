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
import { Check, ImagePlus, PaintBucket, Sparkles } from "lucide-react";

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

    return (
        <div className="space-y-6">
            <Tabs defaultValue="solid" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="solid" className="gap-2"><PaintBucket className="h-4 w-4" /> Sólido</TabsTrigger>
                    <TabsTrigger value="gradient" className="gap-2"><Sparkles className="h-4 w-4" /> Gradiente</TabsTrigger>
                    <TabsTrigger value="image" className="gap-2"><ImagePlus className="h-4 w-4" /> Imagen</TabsTrigger>
                    <TabsTrigger value="webgl" className="gap-2">🌐 WebGL</TabsTrigger>
                </TabsList>

                <TabsContent value="webgl">
                    <Card>
                        <CardHeader>
                            <CardTitle>Fondos Generativos (WebGL)</CardTitle>
                            <CardDescription>Experiencias visuales renderizadas en tiempo real.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                {['hex', 'nebula', 'grid', 'waves'].map((variant) => (
                                    <button
                                        key={variant}
                                        onClick={() => updateSection("background", { type: 'webgl', webglVariant: variant as any })}
                                        className={cn(
                                            "h-24 rounded-xl border-2 flex items-center justify-center capitalize font-bold transition-all hover:scale-105",
                                            config.background.type === 'webgl' && config.background.webglVariant === variant
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-muted bg-muted/20"
                                        )}
                                    >
                                        {variant}
                                    </button>
                                ))}
                            </div>

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
