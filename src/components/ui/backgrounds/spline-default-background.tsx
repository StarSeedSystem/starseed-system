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
    const isSplineActive = config.background.type === 'spline' || config.background.type === 'webgl';

    if (!mounted) return null;

    return (
        <div
            className="fixed inset-0 w-full h-full -z-40 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: isSplineActive ? 1 : 0 }}
        >
            <SplineBackground
                url="https://prod.spline.design/d8ukY8z5Z-mFP7ej/scene.splinecode"
                className="w-full h-full"
            />
        </div>
    );
}
