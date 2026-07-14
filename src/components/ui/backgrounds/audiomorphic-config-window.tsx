'use client';

// ════════════════════════════════════════════════════════════════
// AudiomorphicConfigWindow — ventana de configuración del fondo
// ----------------------------------------------------------------
// Abre una ventana del OS ENCIMA con (1) vista previa interactiva en vivo
// del visualizador (donde el navegador pide permiso de micrófono/cámara) y
// (2) controles: modo (auto reactivo al micrófono / manual autónomo),
// micrófono, cámara/AR, preset visual y opacidad del overlay. Todo se
// guarda en config.background.audiomorphic (sync soberana) y un botón lo
// aplica como fondo del sistema. Escucha 'starseed:open-audiomorphic-config'.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
    AudioWaveform, Power, X, ExternalLink, Mic, Sparkles, Zap,
} from "lucide-react";
import { OSWindow } from "@/components/dashboard/apps/os-window";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import {
    audiomorphicLayer,
    buildAudiomorphicUrl,
    normalizeLayers,
    patchAudiomorphic,
    patchLayer,
    setAudiomorphicEnabled,
    type BlendMode,
} from "@/lib/appearance/background-layers";

const IFRAME_ALLOW =
    "microphone; camera; autoplay; fullscreen; gyroscope; accelerometer; magnetometer; xr-spatial-tracking";

// Modos de mezcla útiles para superponer el espiral sobre otro fondo. "screen"
// es el que hace desaparecer el #050505 opaco de la app (verificado en vivo).
const BLENDS: { id: BlendMode; label: string }[] = [
    { id: "screen", label: "Screen (quita el negro)" },
    { id: "lighten", label: "Aclarar" },
    { id: "normal", label: "Normal (opaco)" },
    { id: "overlay", label: "Superponer" },
    { id: "color-dodge", label: "Sobreexponer" },
];

function ConfigWindow({ onClose }: { onClose: () => void }) {
    const { config, updateConfig } = useAppearance();
    const layers = normalizeLayers(config.background.layers);
    const layer = audiomorphicLayer(layers);
    const isActive = !!layer;
    const a = layer?.audiomorphic;

    const opacity = layer?.opacity ?? 0.9;
    const blend = layer?.blend ?? "screen";

    const patchLayerCfg = (p: Parameters<typeof patchLayer>[2]) =>
        layer && updateConfig({ background: { layers: patchLayer(layers, layer.id, p) } } as any);
    const patchAudio = (p: Parameters<typeof patchAudiomorphic>[2]) =>
        layer && updateConfig({ background: { layers: patchAudiomorphic(layers, layer.id, p) } } as any);

    const activate = () => updateConfig({ background: { layers: setAudiomorphicEnabled(layers, true) } } as any);
    const deactivate = () => updateConfig({ background: { layers: setAudiomorphicEnabled(layers, false) } } as any);

    // Vista previa: la app COMPLETA e interactiva (aquí es donde el usuario
    // concede el micrófono con su propio botón "Iniciar Micrófono" y cierra su
    // tour). `source=starseed-os` es el ÚNICO parámetro que la app entiende.
    const previewUrl = buildAudiomorphicUrl(a);

    return (
        <OSWindow
            title="Audiomorphic · Capa de fondo"
            subtitle="Visualizador completo + ajustes de la capa"
            icon={AudioWaveform}
            accent="#A855F7"
            onClose={onClose}
            actions={
                <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                    title="Abrir en pestaña" aria-label="Abrir en pestaña"
                    className="grid place-items-center size-8 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                    <ExternalLink className="size-4" />
                </a>
            }
            toolbar={
                <>
                    {!isActive ? (
                        <button type="button" onClick={activate}
                            className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/50 bg-purple-400/15 px-3 py-1 text-[11px] font-bold text-purple-100 hover:bg-purple-400/25 transition-colors cursor-pointer">
                            <Power className="size-3.5" /> Añadir como capa de fondo
                        </button>
                    ) : (
                        <>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-200">
                                <Zap className="size-3.5" /> Capa activa
                            </span>
                            <button type="button" onClick={deactivate}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 px-3 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                                <X className="size-3.5" /> Quitar capa
                            </button>
                        </>
                    )}
                    <span className="text-[10px] text-muted-foreground/55 ml-auto">Los ajustes se guardan automáticamente</span>
                </>
            }
        >
            <div className="absolute inset-0 flex flex-col lg:flex-row">
                {/* Visualizador COMPLETO e interactivo: aquí se concede el micrófono
                    con su propio botón y se eligen sus presets (Deriva/Armónico/Génesis). */}
                <div className="relative flex-1 min-h-[42%] bg-black">
                    <iframe
                        key={previewUrl}
                        src={previewUrl}
                        title="Audiomorphic"
                        className="absolute inset-0 w-full h-full border-0 bg-black"
                        allow={IFRAME_ALLOW}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        referrerPolicy="no-referrer"
                    />
                    <div className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 backdrop-blur">
                        Visualizador completo · pulsa aquí «Iniciar Micrófono»
                    </div>
                </div>

                {/* Controles REALES de la capa (lo que el OS sí puede gobernar) */}
                <div className="w-full lg:w-[330px] shrink-0 overflow-auto custom-scrollbar p-4 space-y-4 border-t lg:border-t-0 lg:border-l border-border/40 bg-card/70">
                    {!isActive && (
                        <p className="rounded-xl border border-dashed border-border/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
                            Audiomorphic <b>no está activo</b> como fondo. Puedes usarlo aquí sin más, o añadirlo como
                            capa (botón de arriba) para que se superponga a tu fondo.
                        </p>
                    )}

                    {isActive && layer && a && (
                        <>
                            <div>
                                <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
                                    <span>Opacidad de la capa</span>
                                    <span className="tabular-nums text-purple-200">{Math.round(opacity * 100)}%</span>
                                </div>
                                <input type="range" min={0} max={1} step={0.01} value={opacity}
                                    onChange={(e) => patchLayerCfg({ opacity: Number(e.target.value) })}
                                    aria-label="Opacidad de la capa" className="w-full cursor-pointer accent-purple-400" />
                            </div>

                            <div>
                                <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
                                    <Sparkles className="size-3" /> Modo de mezcla
                                </div>
                                <select
                                    value={blend}
                                    onChange={(e) => patchLayerCfg({ blend: e.target.value as BlendMode })}
                                    className="w-full cursor-pointer rounded-lg border border-border/50 bg-black/25 px-2 py-1.5 text-xs outline-none focus:border-purple-400/60"
                                >
                                    {BLENDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                                </select>
                                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/55">
                                    La app tiene fondo <b>opaco</b> (#050505): no admite transparencia real en el iframe.
                                    Con <b>screen</b> ese negro desaparece y solo se ve el espiral sobre tu fondo.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => patchAudio({ mic: !a.mic, interactive: !a.mic ? true : a.interactive })}
                                aria-pressed={a.mic}
                                className={cn(
                                    "w-full inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors cursor-pointer",
                                    a.mic
                                        ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                                        : "border-border/50 text-muted-foreground hover:bg-white/5",
                                )}
                            >
                                <Mic className="size-3.5" /> {a.mic ? "Micrófono activado" : "Activar micrófono en la capa"}
                            </button>
                            <p className="text-[10px] leading-relaxed text-muted-foreground/55">
                                El permiso lo concedes <b>tú</b> pulsando «Iniciar Micrófono» dentro del visualizador
                                (aquí al lado, o en el modo interacción de la capa). El OS nunca lo pide solo.
                            </p>
                        </>
                    )}

                    <p className="text-[10px] leading-relaxed text-muted-foreground/55 border-t border-border/30 pt-3">
                        Se abre con <code>?source=starseed-os</code>: el visualizador te reconoce como cuenta StarSeed
                        (sin muro de acceso, con su insignia StarSeed) — es el <b>único</b> parámetro que su app entiende.
                        Los presets del espiral y la sensibilidad se ajustan en sus propios controles, no por URL.
                    </p>
                </div>
            </div>
        </OSWindow>
    );
}

export function AudiomorphicConfigHost() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    useEffect(() => {
        const h = () => setOpen(true);
        window.addEventListener("starseed:open-audiomorphic-config", h);
        return () => window.removeEventListener("starseed:open-audiomorphic-config", h);
    }, []);
    if (!mounted || !open) return null;
    return createPortal(<ConfigWindow onClose={() => setOpen(false)} />, document.body);
}
