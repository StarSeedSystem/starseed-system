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

        // Remove "Built with Spline" DOM watermark elements injected by Spline runtime
        const killSplineWatermarks = () => {
            const selectors = ['a[href*="spline.design"]', 'a[href*="spline"]'];
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    (el as HTMLElement).style.display = 'none';
                    el.parentNode?.removeChild(el);
                });
            });
        };
        setTimeout(killSplineWatermarks, 200);
        setTimeout(killSplineWatermarks, 1500);
        setTimeout(killSplineWatermarks, 4000);

        // MutationObserver for late-injected watermarks
        const obs = new MutationObserver(killSplineWatermarks);
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 15000);
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
