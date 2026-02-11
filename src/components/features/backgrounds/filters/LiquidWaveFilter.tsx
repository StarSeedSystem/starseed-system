"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAppearance } from "@/context/appearance-context";
import { Liquid1Background as LiquidBackground } from "threejs-components";
import { TextureLoader } from "three";

export function LiquidWaveFilter() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appRef = useRef<any>(null);
    const { config } = useAppearance();
    const [webGlError, setWebGlError] = useState(false);

    const metalness = config.background.filter?.settings?.waveMetalness ?? 0.75;
    const roughness = config.background.filter?.settings?.waveRoughness ?? 0.25;

    useEffect(() => {
        if (!canvasRef.current || appRef.current) return;

        // Initialize Liquid Metal Effect with safety
        let app: any = null;
        try {
            // Check if canvas exists
            if (!canvasRef.current) return;

            app = LiquidBackground(canvasRef.current);
            appRef.current = app;
        } catch (e) {
            console.error("LiquidWaveFilter: Failed to initialize LiquidBackground (WebGL Context Error?)", e);
            setWebGlError(true);
            return;
        }

        // Determine background source for the liquid reflection
        const bgType = config.background.type;
        const bgValue = config.background.value;

        // Use a safe fallback that definitely exists
        let textureUrl = '/assets/backgrounds/liquid-metal.webp';
        if (bgType === 'image' && bgValue) {
            textureUrl = bgValue;
        }

        const loadTexture = async (url: string) => {
            try {
                const loader = new TextureLoader();
                loader.setCrossOrigin('anonymous');
                loader.load(
                    url,
                    (texture) => {
                        if (!appRef.current) return; // Mounted check
                        if (app.liquidPlane && typeof app.liquidPlane.setImage === 'function') {
                            app.liquidPlane.setImage(texture);
                        } else if (app.liquidPlane && app.liquidPlane.material) {
                            app.liquidPlane.material.map = texture;
                            app.liquidPlane.material.needsUpdate = true;
                        }
                    },
                    undefined,
                    () => {
                        console.warn("LiquidWaveFilter: Texture load skipped or failed - using default shader noise");
                    }
                );
            } catch (e) {
                console.warn("LiquidWaveFilter: Texture loader caught error", e);
            }
        };

        if (!webGlError) {
            loadTexture(textureUrl);
        }

        // Apply settings
        if (app.liquidPlane && app.liquidPlane.material) {
            app.liquidPlane.material.metalness = metalness;
            app.liquidPlane.material.roughness = roughness;
            app.liquidPlane.uniforms.displacementScale.value = 5;
        }

        if (app.setRain) app.setRain(false); // Disable rain for interactive only

        return () => {
            if (appRef.current) {
                try {
                    if (typeof appRef.current.destroy === 'function') {
                        appRef.current.destroy();
                    }
                } catch (err) {
                    console.warn("LiquidWaveFilter: Error during destroy", err);
                }
                appRef.current = null;
            }
        };
    }, []); // Run once on mount

    // React to dynamic setting changes
    useEffect(() => {
        if (!appRef.current || !appRef.current.liquidPlane) return;

        try {
            if (appRef.current.liquidPlane.material) {
                appRef.current.liquidPlane.material.metalness = metalness;
                appRef.current.liquidPlane.material.roughness = roughness;
            }
        } catch (e) {
            // Ignored
        }
    }, [metalness, roughness]);

    if (webGlError) return null; // Fallback to nothing (let CSS background show)

    return (
        <canvas
            ref={canvasRef}
            className="fixed top-0 left-0 w-full h-full pointer-events-none mix-blend-overlay z-0 transition-opacity duration-1000"
            style={{
                opacity: webGlError ? 0 : 0.6,
            }}
        />
    );
}
