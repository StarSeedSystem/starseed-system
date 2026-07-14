"use client";

/**
 * AudiomorphicApp — la app COMPLETA, NATIVA y DESBLOQUEADA (Adenda 69 · K)
 * ============================================================================
 * Port de `App.tsx` de la repo CORRECTA (github.com/alexbordongarrigos/audiomorphic-ar).
 * Sin iframe: el visualizador es código del OS.
 *
 * ⚠️ CORRECCIÓN de la Adenda 68·E: aquel port salió de
 * `StarSeedSystem/Audiomorphic-AR-app` — una versión vieja y recortada. Por eso
 * "faltaban muchas opciones del menú de ajustes". Ahora el panel es el REAL
 * (3.500+ líneas) con TODAS sus secciones.
 *
 * ── QUÉ SE QUITÓ (y por qué es una GANANCIA) ────────────────────────────────
 *  · Login (Supabase/Firebase), planes (Stripe), pantalla de suscripción,
 *    cuenta atrás de prueba y menú de perfil.
 *  · En la app real esos planes **bloqueaban de verdad**: Deriva, modos de
 *    aleatorización, detección de emoción/ritmo, autorregeneración avanzada,
 *    geometría sagrada, temas, VR/AR y guardado de presets. **Aquí está TODO
 *    abierto.**
 *
 * ── QUÉ NO SE PORTA (y se dice en la UI) ────────────────────────────────────
 *  · VR/AR/Portal AR: su motor exige React 19 (R3F v9 + @react-three/xr v6) y el
 *    OS va con React 18. Ver la sección VR/AR del panel: lo explica y enlaza a
 *    la app original. No hay botones muertos.
 *
 * ── QUÉ MEJORA ──────────────────────────────────────────────────────────────
 *  · El piloto automático ya no hace `setParams()` 60 veces por segundo (eso eran
 *    60 renders de React por segundo en el original): vive en el bucle del canvas
 *    y publica al HUD ~5 veces por segundo.
 *  · El micrófono es el MISMO motor compartido que usa la capa de fondo: si ya lo
 *    tienes encendido en el fondo, aquí no se vuelve a pedir permiso.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { AudiomorphicCanvas } from "@/components/audiomorphic/audiomorphic-canvas";
import ControlPanel from "./control-panel";
import {
    DEFAULT_PARAMS,
    resolveParams,
    type GeometryInfo,
    type VisualizerParams,
} from "@/lib/audiomorphic/types";
import {
    AUDIOMORPHIC_DEVICES_EVENT,
    AUDIOMORPHIC_MIC_EVENT,
    getInputDevices,
    getMetrics,
    getMicError,
    getMicState,
    getSelectedDeviceId,
    refreshInputDevices,
    setSelectedDeviceId,
    startMic,
    stopMic,
    type MicState,
} from "@/lib/audiomorphic/audio-analyzer";

/** Los ajustes de la app se recuerdan en el dispositivo (como en el original). */
const PARAMS_KEY = "starseed.audiomorphic.params.v1";

function loadParams(): VisualizerParams {
    if (typeof window === "undefined") return DEFAULT_PARAMS;
    try {
        const raw = window.localStorage.getItem(PARAMS_KEY);
        if (!raw) return DEFAULT_PARAMS;
        return resolveParams(JSON.parse(raw) as Partial<VisualizerParams>);
    } catch {
        return DEFAULT_PARAMS;
    }
}

export function AudiomorphicApp() {
    const [params, setParams] = useState<VisualizerParams>(DEFAULT_PARAMS);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [micState, setMicState] = useState<MicState>("idle");
    const [geometry, setGeometry] = useState<GeometryInfo | undefined>(undefined);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState<string>("");

    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Carga diferida (el servidor no tiene localStorage).
    useEffect(() => { setParams(loadParams()); }, []);

    // Persistencia de los ajustes.
    useEffect(() => {
        try {
            const { geometryData: _drop, ...persisted } = params;
            window.localStorage.setItem(PARAMS_KEY, JSON.stringify(persisted));
        } catch {
            /* cuota llena: no rompemos la app */
        }
    }, [params]);

    // Estado real del audio (compartido con la capa de fondo).
    useEffect(() => {
        const on = (e: Event) => setMicState((e as CustomEvent<{ state: MicState }>).detail.state);
        window.addEventListener(AUDIOMORPHIC_MIC_EVENT, on);
        setMicState(getMicState());
        return () => window.removeEventListener(AUDIOMORPHIC_MIC_EVENT, on);
    }, []);

    // Dispositivos de entrada.
    useEffect(() => {
        const on = () => {
            setDevices(getInputDevices());
            setDeviceId(getSelectedDeviceId());
        };
        window.addEventListener(AUDIOMORPHIC_DEVICES_EVENT, on);
        void refreshInputDevices().then(on);
        return () => window.removeEventListener(AUDIOMORPHIC_DEVICES_EVENT, on);
    }, []);

    /** El permiso SIEMPRE nace de este clic. Nunca automático. */
    const toggleAudio = useCallback(async () => {
        if (getMicState() === "live") {
            stopMic();
            return;
        }
        const ok = await startMic(params.audioSource, deviceId || undefined);
        if (!ok) console.warn("[audiomorphic] audio:", getMicError());
    }, [params.audioSource, deviceId]);

    const handleDeviceChange = useCallback(
        (id: string) => {
            setSelectedDeviceId(id);
            setDeviceId(id);
            // Si ya estaba capturando, se reabre con el dispositivo nuevo.
            if (getMicState() === "live") void startMic("microphone", id);
        },
        [],
    );

    // Auto-ocultar los controles con la inactividad (comportamiento original,
    // con el retardo REAL configurable: `menuAutoCloseTime`).
    const handleUserActivity = useCallback(() => {
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(
            () => setControlsVisible(false),
            Math.max(1, params.menuAutoCloseTime) * 1000,
        );
    }, [params.menuAutoCloseTime]);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        // Se escucha en el CONTENEDOR (no en window): la app puede vivir dentro de
        // una ventana del escritorio y no debe reaccionar a lo que pasa fuera.
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
    // El HUD del régimen lo pinta React (no el canvas) para no repintar a 60 fps.
    const hud = params.showIndicators ? geometry : undefined;

    const modeLabel =
        params.autoRandomMode === "sacred" ? "RESONANCIAS SAGRADAS"
            : params.autoRandomMode === "rhythmic" ? "RITMOS MUSICALES"
                : params.autoPilotMode === "harmonic" ? "ARQUITECTURA ARMÓNICA"
                    : params.autoPilotMode === "genesis" ? "GÉNESIS GEOMÉTRICO"
                        : "AUTO-DERIVA";

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            className="relative flex h-full w-full overflow-hidden bg-black text-white outline-none"
        >
            {/* Visualizador + su FONDO propio (los 6 modos + viñeta), como el original.
                La CAPA DE FONDO del OS usa el mismo motor SIN fondo propio ⇒ alfa real. */}
            <div className="absolute inset-0 z-0">
                <AudiomorphicCanvas params={params} onGeometry={setGeometry} withBackground forceMotion />
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
                        {micLive ? (params.audioSource === "system" ? "AUDIO SISTEMA" : "MIC LIVE") : "MIC OFF"}
                    </div>

                    {params.autoPilot && (
                        <div className="flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 font-mono text-xs text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)] backdrop-blur-sm">
                            <span className="font-bold tracking-wider">Audiomorphic</span>
                            {modeLabel}
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

            {/* Panel de control COMPLETO — todo disponible, sin bloqueos */}
            <div
                className={`absolute left-1/2 top-1/2 z-30 flex h-[90%] w-[95%] max-w-5xl -translate-x-1/2 -translate-y-1/2 transform flex-col transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
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
                    onClose={() => setControlsVisible(false)}
                    getAudioMetrics={getMetrics}
                    audioDevices={devices}
                    selectedAudioDeviceId={deviceId}
                    onAudioDeviceChange={handleDeviceChange}
                    context="app"
                />
            </div>
        </div>
    );
}

export default AudiomorphicApp;
