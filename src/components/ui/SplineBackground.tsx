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
