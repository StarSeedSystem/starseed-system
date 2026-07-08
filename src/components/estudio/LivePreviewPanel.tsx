"use client";

/*
 * LivePreviewPanel — previsualización EN VIVO del componente REAL del
 * sistema, con los overrides locales de esta sesión de edición aplicados
 * por FUERA (variables CSS escopadas a un contenedor + `style` inline en
 * el nodo concreto). Nunca edita Button/Tabs/Card/WidgetShell: los importa
 * tal cual y les pasa `style`/`className` como cualquier consumidor normal.
 *
 * Nota honesta sobre "Ventana": el chrome real del escritorio
 * (DesktopWindowFrame/OSWindow) es modal o depende del store global de
 * ventanas — no se puede incrustar en línea dentro de un panel sin romper
 * el layout. En su lugar se reutiliza la clase `.crystal-window` REAL
 * (src/app/globals.css) sobre un marco propio, que es la misma piel visual
 * que usan las ventanas del sistema.
 */

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Sparkles, Star, Zap, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WidgetShell } from "@/components/dashboard/kit/widget-shell";
import type { ElementFamily, ElementOverride, GradientStop } from "./types";
import { ENTRY_MOTION, hoverClassName, overrideToDirectStyle, overrideToWrapperVars } from "./property-defaults";

function gradientCss(stops: GradientStop[] | undefined): string | undefined {
    if (!stops || stops.length < 2) return undefined;
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    return `linear-gradient(135deg, ${sorted.map((s) => `${s.color} ${s.offset}%`).join(", ")})`;
}

export interface LivePreviewPanelProps {
    family: ElementFamily;
    override: ElementOverride;
    /** Cambia para reproducir de nuevo la animación de entrada (p.ej. al aplicar una variación de Aurora). */
    replayKey?: number;
}

export function LivePreviewPanel({ family, override: o, replayKey = 0 }: LivePreviewPanelProps) {
    const reduced = useReducedMotion();
    const wrapperVars = useMemo(() => overrideToWrapperVars(o), [o]);
    const directStyle = useMemo(() => overrideToDirectStyle(o), [o]);
    const hoverCls = hoverClassName(o.animation?.hover);
    const materialClass = o.tokens.materialClass && o.tokens.materialClass !== "none" ? o.tokens.materialClass : "";
    const entry = reduced ? "none" : (o.animation?.entry ?? "fade");
    const motionProps = ENTRY_MOTION[entry];

    return (
        <div
            className="relative flex min-h-[260px] w-full items-center justify-center overflow-auto rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(120,90,200,0.12),transparent_55%)] p-6 @container"
            style={wrapperVars}
        >
            <motion.div
                key={`${family}-${replayKey}`}
                initial={motionProps.initial}
                animate={motionProps.animate}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="w-full max-w-md"
            >
                {family === "button" && (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button style={directStyle} className={hoverCls}>Acción principal</Button>
                        <Button variant="secondary" style={directStyle} className={hoverCls}>Secundario</Button>
                        <Button variant="outline" style={directStyle} className={hoverCls}>Contorno</Button>
                    </div>
                )}

                {family === "tabs" && (
                    <Tabs defaultValue="inicio" className="w-full">
                        <TabsList style={directStyle} className={cn("w-full", hoverCls)}>
                            <TabsTrigger value="inicio">Inicio</TabsTrigger>
                            <TabsTrigger value="red">Red</TabsTrigger>
                            <TabsTrigger value="perfil">Perfil</TabsTrigger>
                        </TabsList>
                        <TabsContent value="inicio" className="rounded-xl border border-white/10 p-4 text-sm text-white/60">
                            Vista previa de contenido bajo la pestaña activa.
                        </TabsContent>
                    </Tabs>
                )}

                {family === "window" && (
                    <div
                        className={cn("crystal-window relative mx-auto w-full overflow-hidden text-white", materialClass, hoverCls)}
                        style={directStyle}
                    >
                        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                            <span className="flex gap-1.5">
                                <span className="size-3 rounded-full" style={{ background: "#DC143C" }} />
                                <span className="size-3 rounded-full" style={{ background: "#FFBF00" }} />
                                <span className="size-3 rounded-full" style={{ background: "#39FF14" }} />
                            </span>
                            <span className="ml-2 text-xs font-semibold">Ventana StarSeed</span>
                        </div>
                        <div className="space-y-2 p-5 text-sm text-white/60">
                            <p>Contenido de ejemplo dentro de la ventana.</p>
                            <div className="h-2 w-2/3 rounded-full bg-white/10" />
                            <div className="h-2 w-1/2 rounded-full bg-white/10" />
                        </div>
                    </div>
                )}

                {family === "icon" && (
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {[Sparkles, Star, Zap, Bell].map((Ic, i) => (
                            <div
                                key={i}
                                className={cn("grid size-16 place-items-center rounded-2xl border border-white/15", materialClass, hoverCls)}
                                style={{
                                    background: materialClass ? undefined : (gradientCss(o.gradient) ?? "linear-gradient(135deg, hsl(var(--primary-hsl)), hsl(var(--accent-hsl)))"),
                                    ...directStyle,
                                }}
                            >
                                <Ic className="size-6 text-white drop-shadow" strokeWidth={2} />
                            </div>
                        ))}
                    </div>
                )}

                {family === "widget" && (
                    <div className={cn("mx-auto h-56 w-full max-w-xs", hoverCls)} style={directStyle}>
                        <WidgetShell
                            title="Widget de ejemplo"
                            subtitle="Vista previa"
                            icon={LayoutGrid}
                            accent="hsl(var(--primary-hsl))"
                            designMode={materialClass ? "original" : "theme"}
                            live
                        >
                            <div className="space-y-2">
                                <div className="h-2 w-4/5 rounded-full bg-white/10" />
                                <div className="h-2 w-3/5 rounded-full bg-white/10" />
                                <div className="h-2 w-2/3 rounded-full bg-white/10" />
                            </div>
                        </WidgetShell>
                    </div>
                )}

                {family === "card" && (
                    <Card className={cn("crystal-card mx-auto w-full max-w-sm", materialClass, hoverCls)} style={directStyle}>
                        <CardHeader>
                            <CardTitle>Tarjeta StarSeed</CardTitle>
                            <CardDescription>Vista previa en vivo de esta tarjeta.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-white/60">
                            Este es el contenido de ejemplo de la tarjeta, con tus ajustes aplicados.
                        </CardContent>
                    </Card>
                )}

                {family === "background" && (
                    <div
                        className={cn("mx-auto h-56 w-full overflow-hidden rounded-2xl border border-white/10", hoverCls)}
                        style={{
                            backgroundImage: o.customBackgroundUrl ? `url(${o.customBackgroundUrl})` : gradientCss(o.gradient) ?? "linear-gradient(135deg, hsl(var(--primary-hsl)), hsl(var(--accent-hsl)))",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            ...directStyle,
                        }}
                    />
                )}

                {family === "theme" && (
                    <div className="mx-auto w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-white/50">Tema completo</span>
                            <div className="flex gap-1.5">
                                <Button size="sm" style={directStyle}>Primario</Button>
                                <Button size="sm" variant="secondary" style={directStyle}>Secundario</Button>
                            </div>
                        </div>
                        <Card className={cn("crystal-card", materialClass)} style={directStyle}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Componente de ejemplo</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 text-xs text-white/60">
                                Todos los componentes comparten los mismos tokens.
                            </CardContent>
                        </Card>
                        <Tabs defaultValue="a">
                            <TabsList className="w-full">
                                <TabsTrigger value="a">Uno</TabsTrigger>
                                <TabsTrigger value="b">Dos</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

export default LivePreviewPanel;
