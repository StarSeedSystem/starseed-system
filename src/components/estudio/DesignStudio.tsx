"use client";

/*
 * DesignStudio — shell del "Estudio Universal de Diseño": selector de
 * elemento objetivo, vista previa en vivo del componente REAL, panel de
 * propiedades, herramientas creativas 2D/3D y el panel de Aurora, más
 * guardar/compartir. Aditivo y autónomo — ruta nueva `/estudio` (ver
 * DesignStudio.md más abajo en el reporte de la ola para el porqué frente a
 * construir sobre `/design-canvas`).
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Sliders, Shapes, Box, Bot, Blend, Layers } from "lucide-react";
import { ELEMENT_FAMILIES } from "./element-catalog";
import type { ElementFamily, ElementOverride, ThemeDraftMeta } from "./types";
import { makeId } from "./types";
import { defaultOverride } from "./property-defaults";
import { LivePreviewPanel } from "./LivePreviewPanel";
import { PropertyPanel } from "./PropertyPanel";
import { Canvas2DEditor } from "./Canvas2DEditor";
import { Material3DPanel } from "./Material3DPanel";
import { AuroraDesignerPanel } from "./AuroraDesignerPanel";
import { SaveSharePanel } from "./SaveSharePanel";
// Mezclador de Diseños (theme-mixer.ts): fusión por slots — aditivo, entrada
// nueva dentro del Estudio sin tocar el resto de sus herramientas.
import { ThemeMixerPanel } from "@/components/design/theme-mixer-panel";
// Fondo + CAPAS de fondo (Adenda 68 · D). `BackgroundSettings` existía pero
// estaba HUÉRFANO: ninguna ruta lo montaba, así que "Ajustes → Apariencia →
// Fondo" no existía de verdad en el OS (el fondo solo se podía cambiar desde
// widgets y desde la pestaña Hogar de Trinity — que es justo por donde se
// coló Audiomorphic). Aquí queda por fin accesible: /estudio → "Fondo".
import { BackgroundSettings } from "@/components/settings/appearance/background-settings";

type ToolTab = "props" | "2d" | "3d" | "aurora" | "mezclador" | "fondo";

export function DesignStudio() {
    const router = useRouter();
    const [family, setFamily] = useState<ElementFamily>("button");
    const [tool, setTool] = useState<ToolTab>("props");
    const [overrides, setOverrides] = useState<Partial<Record<ElementFamily, ElementOverride>>>({});
    const [replayKey, setReplayKey] = useState(0);
    const [meta, setMeta] = useState<ThemeDraftMeta>(() => ({
        id: makeId("theme"), name: "Mi tema StarSeed", description: "", style: "personalizado",
    }));

    const current = overrides[family] ?? defaultOverride();

    function updateCurrent(next: ElementOverride) {
        setOverrides((prev) => ({ ...prev, [family]: next }));
    }

    function loadTokensIntoCurrent(tokens: ElementOverride["tokens"]) {
        setOverrides((prev) => {
            const base = prev[family] ?? defaultOverride();
            return { ...prev, [family]: { ...base, tokens: { ...base.tokens, ...tokens, vars: { ...base.tokens.vars, ...tokens.vars } } } };
        });
        setReplayKey((k) => k + 1);
    }

    function handleUseAsset(url: string) {
        setOverrides((prev) => ({ ...prev, background: { ...(prev.background ?? defaultOverride()), customBackgroundUrl: url } }));
        setFamily("background");
        setTool("props");
        setReplayKey((k) => k + 1);
    }

    function selectFamily(f: ElementFamily) {
        setFamily(f);
        setReplayKey((k) => k + 1);
    }

    const toolTabs = useMemo(() => ([
        { id: "props" as const, label: "Propiedades", icon: Sliders },
        { id: "2d" as const, label: "Diseño 2D", icon: Shapes },
        { id: "3d" as const, label: "Material 3D", icon: Box },
        { id: "aurora" as const, label: "Aurora", icon: Bot },
        { id: "mezclador" as const, label: "Mezclador", icon: Blend },
        { id: "fondo" as const, label: "Fondo", icon: Layers },
    ]), []);

    return (
        <div className="min-h-screen bg-[#050507] pb-16 text-slate-200">
            {/* Keyframes propios, namespaced `ss-estudio-*` — aditivos, respetan
                reduced-motion y el modo eco del OS (mismo patrón que starseed-materials.css). */}
            <style>{`
                @keyframes ss-estudio-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
                .ss-estudio-hover-pulse:hover, .ss-estudio-hover-pulse:focus-visible { animation: ss-estudio-pulse 900ms ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .ss-estudio-hover-pulse:hover, .ss-estudio-hover-pulse:focus-visible { animation: none; }
                }
                html[data-perf="eco"] .ss-estudio-hover-pulse:hover, html[data-perf="eco"] .ss-estudio-hover-pulse:focus-visible { animation: none; }
            `}</style>

            <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-black/30 px-4 py-3 backdrop-blur-xl sm:px-6">
                <div className="flex items-center gap-3">
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-white/60" onClick={() => router.back()}>
                        <ArrowLeft className="h-3.5 w-3.5" /> Volver
                    </Button>
                    <div>
                        <h1 className="font-headline text-lg font-light tracking-wide text-white sm:text-xl">Estudio Universal de Diseño</h1>
                        <p className="text-[11px] text-white/40">Edita cualquier elemento del sistema con vista previa en vivo — nunca toca componentes base.</p>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
                {/* Selector de elemento objetivo */}
                <div className="mb-4 flex flex-wrap gap-1.5">
                    {ELEMENT_FAMILIES.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => selectFamily(f.id)}
                            className={cn(
                                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                                family === f.id
                                    ? "border-white/25 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.08)]"
                                    : "border-transparent bg-white/[0.03] text-white/40 hover:bg-white/5 hover:text-white/80",
                            )}
                            title={f.hint}
                        >
                            <f.icon className="h-3.5 w-3.5" /> {f.label}
                        </button>
                    ))}
                </div>

                {/* Grid principal: vista previa + herramientas (apilable en móvil) */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                    <div className="space-y-4">
                        <LivePreviewPanel family={family} override={current} replayKey={replayKey} />
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">Guardar y compartir</h2>
                            <SaveSharePanel family={family} value={current} meta={meta} onMetaChange={setMeta} onLoadTokens={loadTokensIntoCurrent} />
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <Tabs value={tool} onValueChange={(v) => setTool(v as ToolTab)}>
                            <TabsList className="w-full">
                                {toolTabs.map((t) => (
                                    <TabsTrigger key={t.id} value={t.id} className="gap-1.5 text-xs">
                                        <t.icon className="h-3.5 w-3.5" /> {t.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                            <TabsContent value="props" className="pt-3">
                                <PropertyPanel family={family} value={current} onChange={updateCurrent} onOpenCanvas2D={() => setTool("2d")} />
                            </TabsContent>
                            <TabsContent value="2d" className="pt-3">
                                <Canvas2DEditor onUse={handleUseAsset} />
                            </TabsContent>
                            <TabsContent value="3d" className="pt-3">
                                <Material3DPanel value={current} onChange={updateCurrent} />
                            </TabsContent>
                            <TabsContent value="aurora" className="pt-3">
                                <AuroraDesignerPanel family={family} value={current} onChange={updateCurrent} />
                            </TabsContent>
                            <TabsContent value="fondo" className="pt-3">
                                <BackgroundSettings />
                            </TabsContent>
                            <TabsContent value="mezclador" className="pt-3">
                                <ThemeMixerPanel compact />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DesignStudio;
