"use client";

import React, { useState } from "react";
import { useAppearance } from "@/context/appearance-context";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check, Plus, Trash2, Link as LinkIcon, Type } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TypographySettings() {
    const { config, updateSection, addCustomFont, removeCustomFont } = useAppearance();
    const [newFont, setNewFont] = useState({ name: "", url: "", family: "" });
    const [isOpen, setIsOpen] = useState(false);

    const fonts = [
        { name: "Inter", value: "Inter", category: "Sans Serif" },
        { name: "Satoshi", value: "Satoshi", category: "Modern Sans" },
        { name: "Roboto", value: "Roboto", category: "Geometric" },
        { name: "Outfit", value: "Outfit", category: "Modern" },
        { name: "Space Grotesk", value: "Space Grotesk", category: "Display" },
        { name: "Source Code Pro", value: "Source Code Pro", category: "Monospace" },
        { name: "System", value: "System", category: "Native" },
        ...(config.typography.customFonts?.map(f => ({
            name: f.name,
            value: f.name,
            category: "Custom"
        })) || [])
    ];

    const handleFontChange = (value: string) => {
        updateSection("typography", { fontFamily: value });
    };

    const handleScaleChange = (value: number[]) => {
        updateSection("typography", { scale: value[0] });
    };

    const handleAddFont = () => {
        if (!newFont.name || !newFont.url) return;
        addCustomFont({
            name: newFont.name,
            url: newFont.url,
            family: newFont.family || `"${newFont.name}", sans-serif`
        });
        setNewFont({ name: "", url: "", family: "" });
        setIsOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Tipografía Principal</CardTitle>
                        <CardDescription>Define la voz visual de la aplicación.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {fonts.map((f) => {
                                const isActive = config.typography.fontFamily === f.value;
                                const fontStyle = f.value === "System" ? "system-ui" : f.value;
                                // For custom fonts, we might not have the font loaded in this specific context unless checking for it,
                                // but if it's applied globally via context, it might work if the name matches.

                                return (
                                    <div
                                        key={f.value}
                                        onClick={() => handleFontChange(f.value)}
                                        className={cn(
                                            "cursor-pointer rounded-xl border-2 p-4 transition-all hover:bg-accent relative overflow-hidden",
                                            isActive ? "border-primary bg-primary/5" : "border-transparent bg-muted/30 hover:border-muted-foreground/30"
                                        )}
                                    >
                                        {isActive && (
                                            <div className="absolute top-2 right-2 text-primary">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-2">
                                            <span
                                                className="text-2xl font-bold"
                                                style={{ fontFamily: fontStyle }}
                                            >
                                                Aa
                                            </span>
                                            <div>
                                                <p className="font-semibold text-sm" style={{ fontFamily: fontStyle }}>{f.name}</p>
                                                <p className="text-xs text-muted-foreground">{f.category}</p>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Escala y Legibilidad</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label>Tamaño Base</Label>
                                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{config.typography.scale}x</span>
                            </div>
                            <Slider
                                min={0.8}
                                max={1.2}
                                step={0.05}
                                value={[config.typography.scale]}
                                onValueChange={handleScaleChange}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Compacto</span>
                                <span>Cómodo</span>
                            </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-4 border border-dashed">
                            <p className="text-sm text-muted-foreground mb-2">Vista Previa</p>
                            <div style={{ fontSize: `${config.typography.scale}em` }}>
                                <h4 className="font-bold mb-1">El veloz murciélago</h4>
                                <p className="text-muted-foreground leading-relaxed">
                                    Come feliz cardillo y kiwi. La cigüeña tocaba el saxofón detrás del palenque de paja.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Fuentes Personalizadas</CardTitle>
                        <CardDescription>Añade fuentes externas (Google Fonts, CDN).</CardDescription>
                    </div>
                    <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <Plus className="h-4 w-4" />
                                Añadir Fuente
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Añadir Nueva Fuente</DialogTitle>
                                <DialogDescription>
                                    Introduce los detalles de la fuente CSS (ej. Google Fonts).
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="font-name">Nombre</Label>
                                    <Input
                                        id="font-name"
                                        placeholder="Ej: Lobster"
                                        value={newFont.name}
                                        onChange={e => setNewFont({ ...newFont, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="font-url">URL CSS</Label>
                                    <Input
                                        id="font-url"
                                        placeholder="https://fonts.googleapis.com/css2?..."
                                        value={newFont.url}
                                        onChange={e => setNewFont({ ...newFont, url: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="font-family">Font Family CSS (Opcional)</Label>
                                    <Input
                                        id="font-family"
                                        placeholder="'Lobster', cursive"
                                        value={newFont.family}
                                        onChange={e => setNewFont({ ...newFont, family: e.target.value })}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleAddFont}>Guardar Fuente</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    {config.typography.customFonts?.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {config.typography.customFonts.map((font) => (
                                <div key={font.name} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                            <Type className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium truncate">{font.name}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">{font.family}</p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => removeCustomFont(font.name)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            No hay fuentes personalizadas añadidas.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
