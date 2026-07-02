"use client";

import React from "react";
import Link from "next/link";
import { ThemeGallery } from "./theme-gallery";
import { OsThemeSelector } from "./os-theme-selector";
import { CursorSettingsPanel } from "@/components/desktop/cursor-fx";
import { PerformanceSettings } from "./performance-settings";
import { LayoutSettings } from "./layout-settings";
import { BackgroundSettings } from "./background-settings";
import { CuratedThemesGallery } from "./curated-themes-gallery";
import { GoogleFontsPicker } from "./google-fonts-picker";
import { AccessibilitySettings } from "./accessibility-settings";
import { WidgetsDesignSettings } from "./widgets-design-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Paintbrush, Monitor, Sparkles, ExternalLink, Type, Accessibility, Check, Undo2, RotateCcw, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppearance } from "@/context/appearance-context";
import { SettingExampleModal } from "@/components/settings/setting-example-modal";

/* ─── Vista previa en vivo: componentes que reflejan el config actual ─── */
function LivePreview() {
    const { config } = useAppearance();
    const radius = `${config.styling?.radius ?? 0.5}rem`;
    const fontScale = config.typography?.scale ?? 1;
    const fontFamily = config.typography?.fontFamily ?? "Inter";

    return (
        <div className="space-y-4" style={{ fontSize: `calc(1rem * ${fontScale})` }}>
            {/* Tipografía */}
            <div>
                <p className="font-semibold text-foreground/90" style={{ fontFamily }}>
                    Título de ejemplo
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={{ fontFamily }}>
                    Párrafo de muestra con la fuente «{fontFamily}» y tu escala tipográfica actual.
                </p>
            </div>

            {/* Tarjeta cristal */}
            <div
                className="border border-border/60 bg-card/40 backdrop-blur-md p-3"
                style={{ borderRadius: radius, backdropFilter: `blur(${config.styling?.glassIntensity ?? 16}px)` }}
            >
                <p className="text-xs font-semibold text-foreground/80">Tarjeta de muestra</p>
                <p className="text-[11px] text-muted-foreground">Refleja radio, cristal y opacidad activos.</p>
            </div>

            {/* Botones */}
            <div className="flex flex-wrap gap-2 items-center">
                <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[hsl(var(--primary))] hover:opacity-90 transition-opacity cursor-pointer"
                    style={{ borderRadius: `${config.buttons?.radius ?? 0.5}rem` }}
                >
                    Primario
                </button>
                <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium border border-border/60 bg-card/40 hover:bg-card/70 transition-colors cursor-pointer"
                    style={{ borderRadius: `${config.buttons?.radius ?? 0.5}rem` }}
                >
                    Secundario
                </button>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                    Etiqueta
                </span>
            </div>
        </div>
    );
}

/* ─── Barra superior: autoguardado, deshacer y restablecer ─── */
function AppearanceToolbar() {
    const { undo, canUndo, resetConfig } = useAppearance();

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card/30 backdrop-blur-md px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-500/90">
                <Check className="w-3.5 h-3.5" />
                Guardado automáticamente
            </span>
            <div className="flex items-center gap-2">
                <SettingExampleModal
                    title="Vista previa global"
                    description="Así se ven tus elementos clave con la configuración actual. Cualquier cambio se refleja al instante."
                    points={[
                        "Tipografía: fuente y escala aplicadas a títulos y textos.",
                        "Tarjetas: radio, intensidad de cristal y opacidad.",
                        "Botones y etiquetas: radio y color de acento (primary).",
                    ]}
                    trigger={
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-border/60 bg-card/40 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                        >
                            <Eye className="w-3.5 h-3.5" /> Ver ejemplo
                        </button>
                    }
                >
                    <LivePreview />
                </SettingExampleModal>
                <button
                    type="button"
                    onClick={undo}
                    disabled={!canUndo}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Undo2 className="w-3.5 h-3.5" /> Deshacer
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (typeof window !== "undefined" && !window.confirm("¿Restablecer toda la apariencia a los valores por defecto?")) return;
                        resetConfig();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-destructive/40 bg-destructive/5 text-destructive/90 hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                    <RotateCcw className="w-3.5 h-3.5" /> Restablecer
                </button>
            </div>
        </div>
    );
}

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
            {/* Barra superior: autoguardado · deshacer · restablecer · ejemplo */}
            <AppearanceToolbar />

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
                    {/* Cursor y animaciones de clic (triángulo StarSeed, onda líquida…). */}
                    <CursorSettingsPanel />
                    {/* Rendimiento: Auto/Alto/Eco — fluidez en móviles. */}
                    <PerformanceSettings />
                    {/* Estilos: aplican un AppearanceConfig completo coordinado */}
                    <div>
                        <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
                            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Estilos
                                <SettingExampleModal
                                    title="Estilos coordinados"
                                    description="Cada estilo aplica un conjunto coordinado de ajustes (cristal, radios, botones, fondos) para dar un lenguaje visual coherente a todo el sistema."
                                    points={[
                                        "Afecta a widgets, perfiles, páginas, mensajes, posts y menús.",
                                        "Ajusta a la vez botones, tarjetas, fondos y tipografía.",
                                        "Puedes deshacer el cambio desde la barra superior.",
                                    ]}
                                >
                                    <LivePreview />
                                </SettingExampleModal>
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

                <TabsContent value="typography" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                    <div className="flex items-center justify-end">
                        <SettingExampleModal
                            title="Tipografía"
                            description="Controla la fuente y la escala de tamaño base de todo el sistema operativo social."
                            points={[
                                "La fuente se aplica a títulos, párrafos, botones y menús.",
                                "La escala multiplica el tamaño base de forma proporcional.",
                                "Los cambios se guardan al instante y son reversibles.",
                            ]}
                            trigger={
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-border/60 bg-card/40 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                                >
                                    <Eye className="w-3.5 h-3.5" /> Ver ejemplo
                                </button>
                            }
                        >
                            <LivePreview />
                        </SettingExampleModal>
                    </div>
                    <GoogleFontsPicker />
                </TabsContent>

                <TabsContent value="canvas" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <LienzoCanvasTab />
                </TabsContent>

                <TabsContent value="interface" className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
                    {/* Disposición general de la interfaz */}
                    <LayoutSettings />
                    {/* Estilo de los widgets del dashboard (adaptado al tema vs. identidad propia) */}
                    <WidgetsDesignSettings />
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
