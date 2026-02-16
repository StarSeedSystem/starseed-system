"use client";

import React from "react";
import Link from "next/link";
import { ThemeGallery } from "./theme-gallery";
import { LayoutSettings } from "./layout-settings";
import { BackgroundSettings } from "./background-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Paintbrush, Monitor, Sparkles, ExternalLink } from "lucide-react";
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
            <Card className="bg-white/[0.02] border-white/[0.06]">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white/90">
                        <Paintbrush className="w-5 h-5 text-cyan-400" />
                        Lienzo de Diseño
                    </CardTitle>
                    <CardDescription className="text-white/40">
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
                            <div key={item.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                <p className="text-[10px] text-white/30 uppercase tracking-wider">{item.label}</p>
                                <p className="text-sm font-semibold text-white/80 truncate">{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Active Mode Badge */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30">Modo activo:</span>
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
                            <div key={item.label} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                <span className="text-sm">{item.icon}</span>
                                <span className="text-[11px] text-white/50 font-medium">{item.label}</span>
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
                <TabsList className="grid w-full grid-cols-4 h-auto bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
                    <TabsTrigger
                        value="gallery"
                        className="gap-2 rounded-lg data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-sm text-white/40"
                    >
                        <Palette className="w-4 h-4" /> Galería
                    </TabsTrigger>
                    <TabsTrigger
                        value="canvas"
                        className="gap-2 rounded-lg data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-sm text-white/40"
                    >
                        <Paintbrush className="w-4 h-4" /> Lienzo
                    </TabsTrigger>
                    <TabsTrigger
                        value="interface"
                        className="gap-2 rounded-lg data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-sm text-white/40"
                    >
                        <Monitor className="w-4 h-4" /> Interfaz
                    </TabsTrigger>
                    <TabsTrigger
                        value="background"
                        className="gap-2 rounded-lg data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-sm text-white/40"
                    >
                        <Sparkles className="w-4 h-4" /> Fondo
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="gallery" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <ThemeGallery />
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
            </Tabs>
        </div>
    );
}
