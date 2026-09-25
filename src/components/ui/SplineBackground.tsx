"use client";

import React, { Suspense, forwardRef, useEffect, useRef, useImperativeHandle } from "react";
import Spline from "@splinetool/react-spline";
import { Application } from "@splinetool/runtime";
import { gobernarFondoSpline } from "@/lib/perf/fondo-vivo";

export interface SplineBackgroundProps {
    url: string;
    className?: string;
    onLoad?: (splineApp: Application) => void;
    fallbackColor?: string;
    /**
     * (2026-09-24) Calidad adaptativa: resolución y ritmo según el equipo y la carga
     * del sistema en vivo (ver `@/lib/perf/calidad-fondo`). Solo para fondos a pantalla
     * completa detrás de todo; una escena interactiva en primer plano no lo quiere.
     */
    adaptativo?: boolean;
}

export const SplineBackground = forwardRef<Application | null, SplineBackgroundProps>(({
    url,
    className = "",
    onLoad,
    fallbackColor = "rgba(16,185,129,0.1)",
    adaptativo = false,
}, ref) => {
    const splineAppRef = useRef<Application | null>(null);
    const soltarGobernador = useRef<(() => void) | null>(null);
    const limpiarMarcas = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => splineAppRef.current as Application);

    // Al desmontar: soltar el gobernador y los vigilantes de la marca de agua.
    useEffect(() => () => {
        soltarGobernador.current?.();
        soltarGobernador.current = null;
        limpiarMarcas.current?.();
        limpiarMarcas.current = null;
    }, []);

    const handleLoad = (splineApp: Application) => {
        splineAppRef.current = splineApp;
        if (onLoad) {
            onLoad(splineApp);
        }
        if (adaptativo && !soltarGobernador.current) {
            try {
                soltarGobernador.current = gobernarFondoSpline(splineApp as unknown as Parameters<typeof gobernarFondoSpline>[0]);
            } catch { /* sin gobernador: el fondo sigue como antes */ }
        }

        // ── ELIMINAR el logo "Built with Spline" EN LA FUENTE ──────────────
        // El runtime de Spline NO dibuja el logo como nodo del DOM: lo pinta en
        // el <canvas> como un pase de post-proceso WebGL (`pipeline.logoOverlayPass`,
        // método `pipeline.setWatermark`). Por eso ocultar el DOM nunca funcionó.
        // Accedemos al pipeline del renderer de la Application y desactivamos ese
        // pase. Reintentos + intervalo por si el runtime lo reactiva al cargar la
        // textura del logo o al redimensionar.
        const app = splineApp as any;
        const disableWatermark = () => {
            try {
                const pipeline =
                    app?._renderer?.pipeline ??
                    app?.renderer?.pipeline ??
                    app?._scene?._renderer?.pipeline;
                if (!pipeline) return;
                if (typeof pipeline.setWatermark === "function") pipeline.setWatermark(null);
                if (pipeline.logoOverlayPass) pipeline.logoOverlayPass.enabled = false;
                if (typeof pipeline.updateRenderToScreen === "function") pipeline.updateRenderToScreen();
            } catch { /* noop */ }
        };
        disableWatermark();
        [60, 200, 500, 1000, 2000, 4000].forEach(ms => setTimeout(disableWatermark, ms));
        let wmTicks = 0;
        const wmIv = window.setInterval(() => { disableWatermark(); if (++wmTicks > 40) clearInterval(wmIv); }, 750);

        // Eliminar el logo "Built with Spline" inyectado por el runtime. El runtime
        // lo re-inyecta, así que observamos PERMANENTEMENTE + intervalo de respaldo
        // y cubrimos varios patrones (enlace a spline, aria-label, texto "Built with").
        const killSplineWatermarks = () => {
            const sels = [
                'a[href*="spline.design"]',
                'a[href*="spline"]',
                '[aria-label*="Spline" i]',
                '[class*="spline-watermark" i]',
                '#spline-watermark',
            ];
            sels.forEach(sel => {
                try {
                    document.querySelectorAll(sel).forEach(el => {
                        (el as HTMLElement).style.setProperty('display', 'none', 'important');
                        (el as HTMLElement).style.setProperty('opacity', '0', 'important');
                        try { el.parentNode?.removeChild(el); } catch { /* noop */ }
                    });
                } catch { /* selector no soportado */ }
            });
            // Respaldo: cualquier <a> cuyo texto sea "Built with Spline"
            try {
                document.querySelectorAll('a').forEach(a => {
                    if ((a.textContent || '').toLowerCase().includes('built with spline')) {
                        (a as HTMLElement).style.setProperty('display', 'none', 'important');
                        try { a.parentNode?.removeChild(a); } catch { /* noop */ }
                    }
                });
            } catch { /* noop */ }
        };
        [100, 600, 1500, 3000, 6000].forEach(ms => setTimeout(killSplineWatermarks, ms));
        // (2026-09-24) Antes: CADA mutación del DOM de toda la página (subtree de <body>)
        // lanzaba 5 querySelectorAll + un recorrido de TODOS los <a>, y además un intervalo
        // cada 2 s para siempre. En un OS que muta el DOM sin parar eso era trabajo
        // continuo del hilo principal por culpa del fondo. Ahora se agrupan las mutaciones
        // (una pasada como mucho cada 1,5 s) y el intervalo de respaldo baja a 10 s.
        let pendiente = 0;
        const programar = () => {
            if (pendiente) return;
            pendiente = window.setTimeout(() => { pendiente = 0; killSplineWatermarks(); }, 1500);
        };
        const obs = new MutationObserver(programar);
        obs.observe(document.body, { childList: true, subtree: true });
        const iv = window.setInterval(killSplineWatermarks, 10_000); // respaldo
        const limpiar = () => { obs.disconnect(); clearInterval(iv); clearInterval(wmIv); if (pendiente) clearTimeout(pendiente); };
        limpiarMarcas.current?.();
        limpiarMarcas.current = limpiar;
        (window as any).__splineKill = limpiar;
    };

    return (
        <div className={`absolute inset-0 -z-10 overflow-hidden ${className}`}>
            <Suspense fallback={<div className="absolute inset-0" style={{ backgroundColor: fallbackColor, transition: 'opacity 0.5s' }} />}>
                <Spline
                    scene={url}
                    onLoad={handleLoad}
                    className="w-full h-full pointer-events-none"
                    style={{ pointerEvents: 'none' }}
                />
            </Suspense>
            {/* Máscara que cubre el logotipo "Built with Spline" (esquina inferior
                derecha) por si el runtime lo reinyecta dentro de su shadow DOM y
                la limpieza por selector no lo alcanza. Funde con el fondo. */}
            <div
                aria-hidden
                className="absolute bottom-0 right-0 z-[1] pointer-events-none"
                style={{
                    width: 170,
                    height: 44,
                    background: "radial-gradient(120% 120% at 100% 100%, hsl(var(--background)) 35%, transparent 75%)",
                }}
            />
        </div>
    );
});

SplineBackground.displayName = "SplineBackground";
