"use client";

/**
 * AudiomorphicApp — la app COMPLETA, NATIVA y DESBLOQUEADA (Adenda 68 · E)
 * ============================================================================
 * Port de `App.tsx` de la repo del usuario (StarSeedSystem/Audiomorphic-AR-app)
 * al OS. Sin iframe: el visualizador es código del OS.
 *
 * ── QUÉ SE QUITÓ (y por qué NO se pierde nada) ──────────────────────────────
 *  · `IntroGuide` (tour de bienvenida). En el original se mostraba con
 *      `if (intro.seen !== "true" || !isLoggedIn) …`
 *    ⇒ a quien no "tenía sesión" le salía SIEMPRE, en cada carga. Aquí no hay
 *    tour: entras y usas.
 *  · `useStarSeedIdentity` (detección de sesión) y `useSubscription` (planes
 *    free/code/starseed/premium) + `SubscriptionModal`.
 *    **HALLAZGO HONESTO:** revisando la repo, NINGUNA función estaba realmente
 *    bloqueada por plan — `subscription.tier` solo se usaba para pintar la
 *    etiqueta de la corona y el modal. Los "planes" eran teatro de UI. Por eso
 *    "desbloquear" aquí es literalmente **no montar ese teatro**: todos los
 *    controles, presets y modos ya estaban disponibles para todo el mundo.
 *  · La sección VR/AR del panel: su motor (R3F v9 + @react-three/xr v6 +
 *    postprocessing v3) exige React 19 y el OS va con React 18 + R3F v8. NO se
 *    finge: se enlaza a la app original, que sí lo tiene.
 *
 * ── QUÉ MEJORA ──────────────────────────────────────────────────────────────
 *  · El piloto automático ya no hace `setParams()` 60 veces por segundo (eso
 *    eran 60 renders de React por segundo en el original). Vive dentro del
 *    canvas y publica su estado al HUD ~5 veces por segundo.
 *  · El micrófono es el MISMO motor compartido que usa la capa de fondo: si ya
 *    lo tienes encendido en el fondo, aquí no se vuelve a pedir permiso.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { AudiomorphicCanvas } from "@/components/audiomorphic/audiomorphic-canvas";
import ControlPanel from "./control-panel";
import { DEFAULT_PARAMS, type GeometryInfo, type VisualizerParams } from "@/lib/audiomorphic/types";
import {
    AUDIOMORPHIC_MIC_EVENT,
    getMicError,
    getMicState,
    startMic,
    stopMic,
    type MicState,
} from "@/lib/audiomorphic/audio-analyzer";

export function AudiomorphicApp() {
    const [params, setParams] = useState<VisualizerParams>(DEFAULT_PARAMS);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [micState, setMicState] = useState<MicState>("idle");
    const [geometry, setGeometry] = useState<GeometryInfo | undefined>(undefined);

    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Estado real del micrófono (compartido con la capa de fondo).
    useEffect(() => {
        const on = (e: Event) => setMicState((e as CustomEvent<{ state: MicState }>).detail.state);
        window.addEventListener(AUDIOMORPHIC_MIC_EVENT, on);
        setMicState(getMicState());
        return () => window.removeEventListener(AUDIOMORPHIC_MIC_EVENT, on);
    }, []);

    /** El permiso SIEMPRE nace de este clic. Nunca automático. */
    const toggleAudio = useCallback(async () => {
        if (getMicState() === "live") {
            stopMic();
            return;
        }
        const ok = await startMic();
        if (!ok) console.warn("[audiomorphic] micrófono:", getMicError());
    }, []);

    // Auto-ocultar los controles con la inactividad (comportamiento original).
    const handleUserActivity = useCallback(() => {
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }, []);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        // Se escucha en el CONTENEDOR (no en window): la app puede vivir dentro
        // de una ventana del escritorio, y no debe reaccionar a lo que pasa fuera.
        el.addEventListener("mousemove", handleUserActivity);
        el.addEventListener("touchstart", handleUserActivity);
        el.addEventListener("click", handleUserActivity);
        el.addEventListener("keydown", handleUserActivity);
        handleUserActivity();
        return () => {
            el.removeEventListener("mousemove", handleUserActivity);
            el.removeEventListener("touchstart", handleUserActivity);
            el.removeEventListener("click", handleUserActivity);
            el.removeEventListener("keydown", handleUserActivity);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, [handleUserActivity]);

    const micLive = micState === "live";
    // El HUD del régimen lo pinta React (no el canvas) para no repintar texto a 60 fps.
    const hud = params.showIndicators ? geometry : undefined;

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            className="relative flex h-full w-full overflow-hidden bg-black text-white outline-none"
        >
            {/* Visualizador — OPACO aquí (la app tiene fondo negro, como el original).
                La CAPA DE FONDO del OS usa el mismo motor con `transparent`. */}
            <div className="absolute inset-0 z-0">
                <AudiomorphicCanvas params={params} onGeometry={setGeometry} forceMotion />
            </div>

            {/* Indicadores */}
            {params.showIndicators && (
                <div
                    className="pointer-events-none absolute right-6 top-6 z-20 flex gap-4 transition-opacity duration-500"
                    style={{ opacity: controlsVisible ? 1 : 0.5 }}
                >
                    <div
                        className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs backdrop-blur-sm transition-colors duration-300 ${
                            micLive
                                ? "animate-pulse border-red-500/40 bg-red-500/10 text-red-400"
                                : "border-gray-700 bg-gray-800/30 text-gray-500"
                        }`}
                    >
                        <div className={`h-2 w-2 rounded-full ${micLive ? "bg-red-500" : "bg-gray-500"}`} />
                        {micLive ? "MIC LIVE" : "MIC OFF"}
                    </div>

                    {params.autoPilot && (
                        <div className="flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 font-mono text-xs text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)] backdrop-blur-sm">
                            <span className="mr-1 animate-spin">❖</span>
                            {params.autoPilotMode === "harmonic"
                                ? "ARQUITECTURA ARMÓNICA"
                                : params.autoPilotMode === "genesis"
                                  ? "GÉNESIS GEOMÉTRICO"
                                  : "AUTO-DERIVA"}
                        </div>
                    )}
                </div>
            )}

            {/* HUD del régimen (Génesis / Armónico) */}
            {hud && (
                <div
                    className="pointer-events-none absolute bottom-5 left-5 z-20 font-mono text-[10px] text-white/50 transition-opacity duration-500"
                    style={{ opacity: controlsVisible ? 1 : 0.4 }}
                >
                    {hud.name} [α:{hud.alpha.toFixed(1)} β:{hud.beta.toFixed(2)}] · {hud.regime}
                </div>
            )}

            {/* Insignia StarSeed: aquí es GRATIS y COMPLETO, sin corona ni planes */}
            <div
                className="absolute left-6 top-6 z-40 flex items-center gap-3 transition-opacity duration-500"
                style={{ opacity: controlsVisible ? 1 : 0.4 }}
            >
                <span className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-emerald-200 backdrop-blur-md">
                    <Sparkles className="h-4 w-4 drop-shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                    <span className="hidden text-xs font-bold uppercase tracking-wider sm:inline">
                        StarSeed OS · completo
                    </span>
                </span>
            </div>

            {/* Panel de control — TODO disponible, sin bloqueos */}
            <div
                className={`absolute left-1/2 top-1/2 z-30 h-[85%] w-[92%] max-w-5xl -translate-x-1/2 -translate-y-1/2 transform transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    controlsVisible ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                }`}
                onMouseEnter={() => {
                    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    setControlsVisible(true);
                }}
                onMouseLeave={handleUserActivity}
            >
                <ControlPanel
                    params={params}
                    setParams={setParams}
                    audioActive={micLive}
                    toggleAudio={toggleAudio}
                />
            </div>
        </div>
    );
}

export default AudiomorphicApp;
