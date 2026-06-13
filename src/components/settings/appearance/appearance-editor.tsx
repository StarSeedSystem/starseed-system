"use client";

import React from "react";
import Link from "next/link";
import { ThemeGallery } from "./theme-gallery";
import { OsThemeSelector } from "./os-theme-selector";
import { LayoutSettings } from "./layout-settings";
import { BackgroundSettings } from "./background-settings";
import { CuratedThemesGallery } from "./curated-themes-gallery";
import { GoogleFontsPicker } from "./google-fonts-picker";
import { AccessibilitySettings } from "./accessibility-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Paintbrush, Monitor, Sparkles, ExternalLink, Type, Accessibility } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppearance } from "@/context/appearance-context";

/* ─── Lienzo de Diseño tab ─── */
function LienzoCanvasTab() {
    const { config } = useAppearance();
    const savedCount = config.themeStore?.savedThemes?.length || 0;

    const font = config.typography?.fontFamily || "Inter";
    const glassIntensity = config.styling?.glassIntensity ?? 16;
    const radius = config.styling?.radius ?? 0.75;
    const activeMode = config.themeStore?.activeMode || "crystal";

    return (
        <div className="space-y-4">
            <Card className="bg-foreground/[0.02] border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground/90">
                        <Paintbrush className="w-5 h-5 text-cyan-500" />
                        Lienzo de Diseño
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Herramienta visual avanzada para paletas, tipografía, efectos, geometría, componentes UI y generación con Stitch AI.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Config Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Fuente", value: font },
                            { label: "Glass", value: `${glassIntensity}px blur` },
                            { label: "Radius", value: `${radius}rem` },
                            { label: "Temas", value: `${savedCount} guardado${savedCount !== 1 ? "s" : ""}` },
                        ].map((item) => (
                            <div key={item.label} className="p-3 rounded-xl bg-foreground/[0.03] border border-border/50">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                                <p className="text-sm font-semibold text-foreground/80 truncate">{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Active Mode Badge */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Modo activo:</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 capitalize">
                            {activeMode}
                        </span>
                    </div>

                    {/* Capabilities list */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                        {[
                            { icon: "🎨", label: "Colores & Paletas" },
                            { icon: "🔤", label: "Tipografía" },
                            { icon: "✨", label: "Efectos & Física" },
                            { icon: "📐", label: "Geometría & Layout" },
                            { icon: "🧩", label: "Componentes UI" },
                            { icon: "🤖", label: "Stitch AI" },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-foreground/[0.02] border border-border/50">
                                <span className="text-sm">{item.icon}</span>
                                <span className="text-[11px] text-muted-foreground font-medium">{item.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* CTA Button */}
                    <Link href="/design-canvas">
                        <button className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-medium text-white bg-gradient-to-r from-cyan-500/80 to-purple-500/80 hover:from-cyan-500 hover:to-purple-500 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-300 mt-2">
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

/* ═══════════════════════════════════════════════════════════════════════
   MAIN EXPORT — formerly "AppearanceEditor", now "UIDesignEditor"
   ═══════════════════════════════════════════════════════════════════════ */
export function AppearanceEditor() {
    return (
        <div className="space-y-6">
            {/* Tabs */}
            <Tabs defaultValue="gallery" className="w-full">
                <TabsList className="flex flex-wrap w-full sm:w-auto justify-center mx-auto h-auto bg-foreground/[0.03] border border-border/50 rounded-xl p-1 gap-1">
                    <TabsTrigger
                        value="gallery"
                        className="flex-1 sm:flex-none px-4 gap-2 rounded-lg data-[state=active]:bg-foreground/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                        <Palette className="w-4 h-4" /> Galería
                    </TabsTrigger>
                    <TabsTrigger
                        value="typography"
                        className="flex-1 sm:flex-none px-4 gap-2 rounded-lg data-[state=active]:bg-foreground/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                        <Type className="w-4 h-4" /> Tipografía
                    </TabsTrigger>
                    <TabsTrigger
                        value="canvas"
                        className="flex-1 sm:flex-none px-4 gap-2 rounded-lg data-[state=active]:bg-foreground/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                        <Paintbrush className="w-4 h-4" /> Lienzo
                    </TabsTrigger>
                    <TabsTrigger
                        value="interface"
                        className="flex-1 sm:flex-none px-4 gap-2 rounded-lg data-[state=active]:bg-foreground/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                        <Monitor className="w-4 h-4" /> Interfaz
                    </TabsTrigger>
                    <TabsTrigger
                        value="background"
                        className="flex-1 sm:flex-none px-4 gap-2 rounded-lg data-[state=active]:bg-foreground/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                        <Sparkles className="w-4 h-4" /> Fondo
                    </TabsTrigger>
                    <TabsTrigger
                        value="a11y"
                        className="flex-1 sm:flex-none px-4 gap-2 rounded-lg data-[state=active]:bg-foreground/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                        <Accessibility className="w-4 h-4" /> Accesibilidad
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="gallery" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
                    {/* Tema del sistema: identidad global vía data-os-theme (Café, etc.) */}
                    <OsThemeSelector />
                    {/* Estilos: aplican un AppearanceConfig completo coordinado */}
                    <div>
                        <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
                            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Estilos
                            </h3>
                            <p className="text-[11px] text-muted-foreground max-w-md text-right">
                                Cada estilo adapta widgets, perfiles, páginas, mensajes, posts, menús, botones y fondos al lenguaje coherente que elijas.
                            </p>
                        </div>
                        <CuratedThemesGallery />
                    </div>
                    {/* Galería original (presets base + comunidad + import/export) */}
                    <ThemeGallery />
                </TabsContent>

                <TabsContent value="typography" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <GoogleFontsPicker />
                </TabsContent>

                <TabsContent value="canvas" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <LienzoCanvasTab />
                </TabsContent>

                <TabsContent value="interface" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <LayoutSettings />
                </TabsContent>

                <TabsContent value="background" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <BackgroundSettings />
                </TabsContent>

                <TabsContent value="a11y" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <AccessibilitySettings />
                </TabsContent>
            </Tabs>
        </div>
    );
}
