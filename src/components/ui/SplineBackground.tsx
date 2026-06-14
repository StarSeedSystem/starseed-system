"use client";

import React, { Suspense, forwardRef, useRef, useImperativeHandle } from "react";
import Spline from "@splinetool/react-spline";
import { Application } from "@splinetool/runtime";

export interface SplineBackgroundProps {
    url: string;
    className?: string;
    onLoad?: (splineApp: Application) => void;
    fallbackColor?: string;
}

export const SplineBackground = forwardRef<Application | null, SplineBackgroundProps>(({
    url,
    className = "",
    onLoad,
    fallbackColor = "rgba(16,185,129,0.1)"
}, ref) => {
    const splineAppRef = useRef<Application | null>(null);

    useImperativeHandle(ref, () => splineAppRef.current as Application);

    const handleLoad = (splineApp: Application) => {
        splineAppRef.current = splineApp;
        if (onLoad) {
            onLoad(splineApp);
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
        const obs = new MutationObserver(killSplineWatermarks);
        obs.observe(document.body, { childList: true, subtree: true });
        const iv = window.setInterval(killSplineWatermarks, 2000); // respaldo permanente
        // limpieza al desmontar
        (window as any).__splineKill = () => { obs.disconnect(); clearInterval(iv); };
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
