"use client";

import React from "react";
import Link from "next/link";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { TypographySettings } from "./typography-settings";
import { LayoutSettings } from "./layout-settings";
import { BackgroundSettings } from "./background-settings";
import { UiElementSettings } from "./ui-element-settings";
import { ThemeStore } from "./theme-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Type, Layout, PaintBucket, Image as ImageIcon, Sliders, Droplets, ShoppingBag, Cpu, MousePointerClick, SquareDashedBottomCode, Paintbrush, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppearance } from "@/context/appearance-context";

function LienzoCanvasTab() {
    const { config } = useAppearance();
    const savedCount = config.themeStore?.savedThemes?.length || 0;

    // Read live config values for inline summary
    const font = config.typography?.fontFamily || "Inter";
    const glassIntensity = config.styling?.glassIntensity ?? 16;
    const radius = config.styling?.radius ?? 0.75;
    const activeMode = config.themeStore?.activeMode || "crystal";

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Paintbrush className="w-5 h-5 text-cyan-400" />
                        Lienzo de Diseño
                    </CardTitle>
                    <CardDescription>
                        Herramienta visual para paletas, tipografía, efectos, geometría y generación con Stitch AI.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Config Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fuente</p>
                            <p className="text-sm font-semibold truncate">{font}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Glass</p>
                            <p className="text-sm font-semibold">{glassIntensity}px blur</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Radius</p>
                            <p className="text-sm font-semibold">{radius}rem</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Temas</p>
                            <p className="text-sm font-semibold">{savedCount} guardado{savedCount !== 1 ? "s" : ""}</p>
                        </div>
                    </div>

                    {/* Active Mode Badge */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Modo activo:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 capitalize">
                            {activeMode}
                        </span>
                    </div>

                    {/* CTA Button */}
                    <Link href="/design-canvas">
                        <button className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-medium text-white bg-gradient-to-r from-cyan-500/80 to-purple-500/80 hover:from-cyan-500 hover:to-purple-500 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-300">
                            <Paintbrush className="w-4 h-4" />
                            Abrir Lienzo de Diseño
                            <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-60" />
                        </button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}

export function AppearanceEditor() {
    return (
        <div className="space-y-6">

            {/* 1. Base Theme */}
            <Card>
                <CardHeader>
                    <CardTitle>Tema Base</CardTitle>
                    <CardDescription>Comienza seleccionando un estilo visual global.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ThemeSelector />
                </CardContent>
            </Card>

            {/* 2. Granular Controls */}
            <Tabs defaultValue="typography" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 h-auto">
                    <TabsTrigger value="typography" className="gap-2"><Type className="w-4 h-4" /> Tipografía</TabsTrigger>
                    <TabsTrigger value="layout" className="gap-2"><Layout className="w-4 h-4" /> Interfaz</TabsTrigger>
                    {/* New UI Elements Tab */}
                    <TabsTrigger value="ui-elements" className="gap-2"><SquareDashedBottomCode className="w-4 h-4" /> Elementos UI</TabsTrigger>
                    <TabsTrigger value="background" className="gap-2"><ImageIcon className="w-4 h-4" /> Fondo</TabsTrigger>
                    {/* Removed standalone Crystal tab */}

                    <TabsTrigger value="store" className="gap-2"><ShoppingBag className="w-4 h-4" /> Tienda</TabsTrigger>
                    <TabsTrigger value="canvas" className="gap-2"><Paintbrush className="w-4 h-4" /> Lienzo</TabsTrigger>
                </TabsList>

                <TabsContent value="typography" className="mt-4">
                    <TypographySettings />
                </TabsContent>

                <TabsContent value="layout" className="mt-4">
                    <LayoutSettings />
                </TabsContent>

                {/* New Tab Content */}
                <TabsContent value="ui-elements" className="mt-4">
                    <UiElementSettings />
                </TabsContent>


                <TabsContent value="background" className="mt-4">
                    <BackgroundSettings />
                </TabsContent>



                <TabsContent value="store" className="mt-4">
                    <ThemeStore />
                </TabsContent>

                <TabsContent value="canvas" className="mt-4">
                    <LienzoCanvasTab />
                </TabsContent>
            </Tabs>

        </div>
    );
}
