"use client";

/**
 * AudiomorphicCanvas — el visualizador NATIVO del OS (Adenda 69 · K)
 * ============================================================================
 * UN solo componente para las DOS superficies:
 *
 *   • APP  (`/audiomorphic`)      → `withBackground` → pinta también el FONDO
 *                                    propio del visualizador (6 modos + viñeta),
 *                                    igual que la app original.
 *   • FONDO (capa de `background`) → sin fondo propio → **alfa REAL**: el espiral
 *                                    se compone de verdad sobre las capas del OS.
 *                                    Sin iframe, sin `mix-blend-mode: screen`.
 *
 * ── RENDIMIENTO (reglas del OS) ─────────────────────────────────────────────
 *  · Pestaña oculta (`document.hidden`) → el bucle SE PARA (0 % CPU).
 *  · `prefers-reduced-motion` → un fotograma estático y fuera (salvo `forceMotion`).
 *  · Modo "eco" (`device-tier`) → menos iteraciones, DPR 1 y tope de ~30 fps.
 *  · React NO re-renderiza por fotograma: piloto y renderer son objetos mutables
 *    que el bucle consulta.
 */

import React, { useEffect, useRef, useState } from "react";
import { AudiomorphicRenderer } from "@/lib/audiomorphic/renderer";
import { AudiomorphicBackground } from "@/lib/audiomorphic/background-modes";
import { AudiomorphicAutopilot } from "@/lib/audiomorphic/autopilot";
import { acquireMic, getMetrics } from "@/lib/audiomorphic/audio-analyzer";
import { resolveParams, SILENT_METRICS, type GeometryInfo, type VisualizerParams } from "@/lib/audiomorphic/types";
import { PERF_CHANGED_EVENT, resolveApplied } from "@/lib/perf/device-tier";

export interface AudiomorphicCanvasProps {
    /** Parámetros del visualizador (parciales: el resto cae a los del original). */
    params?: Partial<VisualizerParams> | null;
    /** `true` ⇒ capa de fondo del OS (sin fondo propio, alfa real). */
    transparent?: boolean;
    /** `true` ⇒ pinta el fondo propio del visualizador (bgMode + viñeta). */
    withBackground?: boolean;
    className?: string;
    /** Congela el bucle sin desmontar (p. ej. capa oculta). */
    paused?: boolean;
    /** Ignora `prefers-reduced-motion` (solo si el usuario lo pide explícitamente). */
    forceMotion?: boolean;
    /** Datos vivos del Génesis/Armónico para el HUD (con throttle, no por fotograma). */
    onGeometry?: (g: GeometryInfo | undefined) => void;
}

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
}

export function AudiomorphicCanvas({
    params,
    transparent = false,
    withBackground = false,
    className,
    paused = false,
    forceMotion = false,
    onGeometry,
}: AudiomorphicCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);

    // Los parámetros viven en un ref: el bucle lee SIEMPRE lo último sin re-montar.
    const paramsRef = useRef<VisualizerParams>(resolveParams(params));
    const pausedRef = useRef(paused);
    const onGeometryRef = useRef(onGeometry);

    const [perf, setPerf] = useState<"high" | "mid" | "eco">("high");

    useEffect(() => { paramsRef.current = resolveParams(params); }, [params]);
    useEffect(() => { pausedRef.current = paused; }, [paused]);
    useEffect(() => { onGeometryRef.current = onGeometry; }, [onGeometry]);

    // Nivel de rendimiento real del dispositivo (se recalcula si el usuario lo cambia).
    useEffect(() => {
        const read = () => { try { setPerf(resolveApplied()); } catch { setPerf("high"); } };
        read();
        window.addEventListener(PERF_CHANGED_EVENT, read);
        return () => window.removeEventListener(PERF_CHANGED_EVENT, read);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const host = hostRef.current;
        if (!canvas || !host) return;

        const eco = perf === "eco";
        const renderer = new AudiomorphicRenderer(
            canvas,
            {
                transparent,
                maxIter: eco ? 700 : perf === "mid" ? 1400 : undefined,
                maxDpr: eco ? 1 : perf === "mid" ? 1.5 : 2,
            },
            paramsRef.current.baseHue,
        );

        const bgCanvas = bgCanvasRef.current;
        const background = withBackground && bgCanvas ? new AudiomorphicBackground(bgCanvas) : null;

        const pilot = new AudiomorphicAutopilot(paramsRef.current);
        const releaseMic = acquireMic();

        let vw = host.clientWidth;
        let vh = host.clientHeight;

        const resize = (w: number, h: number) => {
            vw = w;
            vh = h;
            renderer.resize(w, h);
            background?.resize(w, h);
        };

        const ro = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (box) resize(box.width, box.height);
        });
        ro.observe(host);
        resize(vw, vh);

        // Movimiento reducido: un fotograma estático y fuera. Sin bucle, sin CPU.
        const still = prefersReducedMotion() && !forceMotion;

        let raf = 0;
        let lastFrame = 0;
        let lastGeometryPush = 0;
        const minFrameMs = eco ? 33 : 0; // ~30 fps en eco; libre en el resto

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame);

            // Pestaña oculta o capa en pausa → no se dibuja nada.
            if (pausedRef.current || (typeof document !== "undefined" && document.hidden)) return;
            if (minFrameMs && now - lastFrame < minFrameMs) return;
            lastFrame = now;

            const p = paramsRef.current;
            const metrics = getMetrics(p.sensitivity, p.freqRange);

            if (p.autoPilot) pilot.step(p, metrics, { width: vw, height: vh });
            const live = pilot.apply(p);

            background?.render(live, metrics);
            renderer.render(live, metrics);

            // El HUD se refresca ~5 veces por segundo, no 60: React no debe
            // re-renderizar por fotograma (era el coste oculto del original).
            const push = onGeometryRef.current;
            if (push && now - lastGeometryPush > 200) {
                lastGeometryPush = now;
                push(live.geometryData);
            }
        };

        if (still) {
            background?.render(paramsRef.current, SILENT_METRICS);
            renderer.render(paramsRef.current, SILENT_METRICS);
        } else {
            raf = requestAnimationFrame(frame);
        }

        const onVisibility = () => { lastFrame = 0; };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            releaseMic();
        };
        // `transparent`/`perf`/`withBackground` recrean el contexto (alpha y DPR se fijan al crearlo).
    }, [transparent, perf, forceMotion, withBackground]);

    return (
        <div ref={hostRef} className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
            {withBackground && (
                <canvas
                    key={`bg-${perf}`}
                    ref={bgCanvasRef}
                    className="pointer-events-none absolute inset-0 block h-full w-full"
                />
            )}
            <canvas
                key={`${transparent ? "alpha" : "opaque"}-${perf}`}
                ref={canvasRef}
                className="relative block h-full w-full"
            />
        </div>
    );
}

export default AudiomorphicCanvas;
