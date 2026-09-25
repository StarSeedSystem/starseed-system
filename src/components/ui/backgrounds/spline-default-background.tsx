"use client";

import React, { useState, useEffect } from "react";
import { SplineBackground } from "@/components/ui/SplineBackground";
import { useAppearance } from "@/context/appearance-context";

export function SplineDefaultBackground() {
    const { config } = useAppearance();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Make it toggleable via config.background.type (e.g. 'spline') or always on?
    // The user said "este sera el fondo predeterminado que debes tambien incorporar" 
    // Let's rely on config.background.type to allow toggling, but default to 'spline'
    // Or just always render it behind everything, but controlled by opacity.
    const isSplineActive = (config.background.type as string) === 'spline' || config.background.type === 'webgl';

    // (2026-09-24) Con otro fondo elegido, la escena seguía montada con opacidad 0 y
    // pintando a pantalla completa 60 veces por segundo sin que nadie la viera. Ahora se
    // desmonta cuando termina el fundido de salida (1 s) y vuelve a montarse al elegirla.
    const [montada, setMontada] = useState(isSplineActive);
    useEffect(() => {
        if (isSplineActive) {
            setMontada(true);
            return undefined;
        }
        const t = window.setTimeout(() => setMontada(false), 1100);
        return () => window.clearTimeout(t);
    }, [isSplineActive]);

    if (!mounted || !montada) return null;

    return (
        <div
            className="fixed inset-0 w-full h-full -z-40 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: isSplineActive ? 1 : 0 }}
        >
            <SplineBackground
                url="https://prod.spline.design/d8ukY8z5Z-mFP7ej/scene.splinecode"
                className="w-full h-full"
                adaptativo
            />
        </div>
    );
}
