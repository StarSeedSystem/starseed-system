"use client";

/**
 * AudiomorphicCanvas — el visualizador NATIVO del OS (Adenda 68 · E)
 * ============================================================================
 * UN solo componente para las DOS superficies:
 *
 *   • APP  (`/audiomorphic`)      → `transparent={false}` (fondo negro, como la
 *                                    app original).
 *   • FONDO (capa de `background`) → `transparent`         → **alfa REAL**: el
 *                                    espiral se compone de verdad sobre las
 *                                    capas de abajo. Sin iframe, sin
 *                                    `mix-blend-mode: screen`, sin trucos.
 *
 * ── RENDIMIENTO (reglas del OS) ─────────────────────────────────────────────
 *  · Pestaña oculta (`document.hidden`) → el bucle SE PARA (0 % CPU). Es un
 *    canvas 2D con 2.000 iteraciones por fotograma: dejarlo corriendo detrás
 *    sería quemar batería para nadie.
 *  · `prefers-reduced-motion` → NO se anima: se pinta **un fotograma estático**
 *    y se para. (El usuario puede forzar la animación con `forceMotion`.)
 *  · Modo "eco" (`device-tier`) → menos detalle (iteraciones), DPR 1 y tope de
 *    ~30 fps. Se degrada, no se apaga.
 *  · React NO re-renderiza por fotograma: el piloto automático y el renderer
 *    son objetos mutables leídos por el bucle (`requestAnimationFrame`).
 *
 * ⚠️ `alpha` del contexto 2D solo puede fijarse al CREAR el contexto: por eso
 * el <canvas> se remonta (`key`) si cambia `transparent`.
 */

import React, { useEffect, useRef, useState } from "react";
import { AudiomorphicRenderer } from "@/lib/audiomorphic/renderer";
import { AudiomorphicAutopilot } from "@/lib/audiomorphic/autopilot";
import { acquireMic, getMetrics } from "@/lib/audiomorphic/audio-analyzer";
import { resolveParams, type GeometryInfo, type VisualizerParams } from "@/lib/audiomorphic/types";
import { PERF_CHANGED_EVENT, resolveApplied } from "@/lib/perf/device-tier";

export interface AudiomorphicCanvasProps {
    /** Parámetros del visualizador (parciales: el resto cae a los del original). */
    params?: Partial<VisualizerParams> | null;
    /** `true` ⇒ canvas con transparencia REAL (capa de fondo). */
    transparent?: boolean;
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
    className,
    paused = false,
    forceMotion = false,
    onGeometry,
}: AudiomorphicCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
        const pilot = new AudiomorphicAutopilot(paramsRef.current);
        const releaseMic = acquireMic();

        const ro = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (box) renderer.resize(box.width, box.height);
        });
        ro.observe(host);
        renderer.resize(host.clientWidth, host.clientHeight);

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

            if (p.autoPilot) pilot.step(p, metrics);
            const live = pilot.apply(p);

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
            // Un único fotograma (sin piloto): la espiral queda quieta.
            renderer.render(paramsRef.current, { volume: 0, frequency: 0 });
        } else {
            raf = requestAnimationFrame(frame);
        }

        // Al volver a la pestaña, el canvas conserva su último fotograma: nada que
        // repintar. Solo hace falta reanudar el reloj de fps.
        const onVisibility = () => { lastFrame = 0; };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            releaseMic();
        };
        // `transparent` y `perf` recrean el contexto (alpha/DPR se fijan al crearlo).
    }, [transparent, perf, forceMotion]);

    return (
        <div ref={hostRef} className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
            <canvas
                key={`${transparent ? "alpha" : "opaque"}-${perf}`}
                ref={canvasRef}
                className="block h-full w-full"
                // Sin `background` ⇒ el canvas es transparente de verdad cuando
                // `transparent` está activo. La APP pone su propio fondo negro fuera.
            />
        </div>
    );
}

export default AudiomorphicCanvas;
