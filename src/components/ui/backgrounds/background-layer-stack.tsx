"use client";

/*
 * BackgroundLayerStack — la PILA de capas de fondo del OS (Adenda 68 · D + E)
 * ----------------------------------------------------------------------------
 * Pinta `config.background.layers` ENCIMA del fondo base (el motor del OS:
 * Spline / WebGL / Living / Materia…, que sigue leyendo `background.type`).
 *
 * Z-INDEX — medido EN VIVO en producción, no supuesto:
 *   -50  canvas WebGL
 *   -40  Spline · Living
 *   -20  PerfStaticBackdrop  ← ¡OPACO y con opacity ~0.85 animada!
 *   -10  Liquid psychedelic (opaco cuando está activo)
 * Por eso las capas van en **-9 … -2**: por encima de TODO lo que pinta fondo
 * (si fueran a -30 quedarían lavadas bajo el backdrop translúcido — que es
 * justo el efecto de "capa intermedia apagada" que reportó el usuario) y por
 * debajo de todo el contenido en flujo (que pinta siempre sobre z-index
 * negativos). Sin eventos de puntero, salvo el modo interacción del iframe.
 *
 * ── AUDIOMORPHIC: AHORA ES NATIVO (Adenda 68 · E) ───────────────────────────
 * `engine: "nativo"` (el defecto) monta el visualizador PORTADO
 * (`AudiomorphicCanvas`), un canvas 2D con **alfa REAL** ⇒ el espiral se compone
 * de verdad sobre las capas de abajo. Ya no hay iframe, ni `mix-blend-mode:
 * screen` obligatorio, ni tour, ni login, ni "modo interacción" para poder tocar
 * los controles: TODO se configura desde el panel de fondos del OS.
 *
 * `engine: "iframe"` se mantiene como RESPALDO (app externa; único sitio con
 * VR/AR). Con él vuelven sus limitaciones conocidas: body opaco ⇒ conviene
 * `screen`, y sus controles solo se tocan en "modo interacción".
 */

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Mic, Sparkles } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import {
    audiomorphicFilter,
    buildAudiomorphicUrl,
    normalizeLayers,
    patchAudiomorphic,
    type BackgroundLayer,
} from "@/lib/appearance/background-layers";
import type { VisualizerParams } from "@/lib/audiomorphic/types";

// El motor nativo se carga en diferido: una capa apagada no cuesta NADA.
const AudiomorphicCanvas = dynamic(
    () => import("@/components/audiomorphic/audiomorphic-canvas").then((m) => m.AudiomorphicCanvas),
    { ssr: false, loading: () => null },
);

const IFRAME_ALLOW =
    "microphone; camera; autoplay; fullscreen; gyroscope; accelerometer; magnetometer; xr-spatial-tracking";

/** Primera capa de la pila (índice 0) → z-index -9; van subiendo. */
const BASE_Z = -9;

function LayerBody({ layer }: { layer: BackgroundLayer }) {
    switch (layer.kind) {
        case "color":
            return <div className="absolute inset-0" style={{ background: layer.value || "#000" }} />;
        case "gradiente":
            return <div className="absolute inset-0" style={{ background: layer.value || "" }} />;
        case "imagen":
            return layer.value ? (
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url('${layer.value}')` }}
                />
            ) : null;
        case "video":
            return layer.value ? (
                <video
                    key={layer.value}
                    src={layer.value}
                    className="absolute inset-0 h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                />
            ) : null;
        default:
            return null;
    }
}

/** MOTOR NATIVO — transparencia real, cero iframe. */
function AudiomorphicNativeLayer({ layer }: { layer: BackgroundLayer }) {
    const a = layer.audiomorphic!;
    return (
        <div
            className="absolute inset-0"
            style={{
                transform: a.scale !== 1 ? `scale(${a.scale})` : undefined,
                transformOrigin: "center",
                filter: audiomorphicFilter(a),
            }}
        >
            <AudiomorphicCanvas
                transparent
                params={a.visual as Partial<VisualizerParams>}
                // El fondo NUNCA pinta el HUD de texto del régimen.
                // (`showIndicators` va a false en el defecto del motor.)
            />
        </div>
    );
}

/** RESPALDO — la app externa por iframe (con sus limitaciones conocidas). */
function AudiomorphicIframeLayer({ layer, onExitInteractive }: {
    layer: BackgroundLayer;
    onExitInteractive: () => void;
}) {
    const a = layer.audiomorphic!;
    const interactive = a.interactive === true;
    // La URL NO depende de `interactive` → el iframe no se remonta al entrar/salir
    // del modo interacción, así que el micrófono y la escena siguen vivos.
    const src = buildAudiomorphicUrl(a);

    return (
        <>
            <iframe
                key={src}
                src={src}
                title="Audiomorphic"
                className="absolute inset-0 h-full w-full border-0"
                style={{
                    transform: a.scale !== 1 ? `scale(${a.scale})` : undefined,
                    transformOrigin: "center",
                    filter: audiomorphicFilter(a),
                    pointerEvents: interactive ? "auto" : "none",
                    background: "#050505",
                }}
                loading="lazy"
                referrerPolicy="no-referrer"
                allow={IFRAME_ALLOW}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
            {interactive && (
                <div className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
                    <Sparkles className="size-4 shrink-0 text-purple-300" />
                    <p className="min-w-0 flex-1 text-[11px] leading-tight text-white/80">
                        <b className="text-white">Modo interacción</b> (respaldo por iframe).{" "}
                        Cierra su bienvenida («Saltar») y usa sus controles.
                        {a.mic ? " Pulsa «Iniciar Micrófono» dentro del visualizador." : ""}{" "}
                        Pulsa <b className="text-white">Listo</b> para enviarlo al fondo.
                    </p>
                    <button
                        type="button"
                        onClick={onExitInteractive}
                        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-400/15 px-3 py-1 text-[11px] font-bold text-emerald-100 transition-colors hover:bg-emerald-400/25"
                    >
                        <Check className="size-3.5" /> Listo
                    </button>
                </div>
            )}
        </>
    );
}

export function BackgroundLayerStack() {
    const { config, updateConfig } = useAppearance();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const layers = normalizeLayers(config.background.layers);
    if (!mounted || layers.length === 0) return null;

    const exitInteractive = (id: string) => {
        updateConfig({
            background: { layers: patchAudiomorphic(config.background.layers, id, { interactive: false }) },
        } as never);
    };

    return (
        <>
            {layers.map((layer, i) => {
                if (!layer.visible) return null;
                const am = layer.kind === "audiomorphic" ? layer.audiomorphic : undefined;
                // El modo interacción SOLO existe en el respaldo por iframe.
                const interactive = am?.engine === "iframe" && am.interactive === true;
                return (
                    <div
                        key={layer.id}
                        aria-hidden={!interactive}
                        className="fixed inset-0 h-full w-full overflow-hidden transition-opacity duration-700"
                        style={{
                            zIndex: interactive ? 60 : BASE_Z + i,
                            opacity: interactive ? 1 : layer.opacity,
                            mixBlendMode: interactive ? "normal" : (layer.blend as React.CSSProperties["mixBlendMode"]),
                            pointerEvents: interactive ? "auto" : "none",
                        }}
                    >
                        {am ? (
                            am.engine === "iframe" ? (
                                <AudiomorphicIframeLayer layer={layer} onExitInteractive={() => exitInteractive(layer.id)} />
                            ) : (
                                <AudiomorphicNativeLayer layer={layer} />
                            )
                        ) : (
                            <LayerBody layer={layer} />
                        )}
                        {am?.mic && !interactive && (
                            <span className="sr-only">
                                <Mic aria-hidden /> Micrófono activado en el visualizador
                            </span>
                        )}
                    </div>
                );
            })}
        </>
    );
}
