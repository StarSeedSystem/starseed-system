"use client";

import React, { useEffect, useRef } from 'react';
import { useAppearance } from "@/context/appearance-context";
import { TextureLoader } from 'three';
// @ts-ignore
import LiquidBackground from 'threejs-components/build/backgrounds/liquid1.min.js';

export function LiquidMetal() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const appRef = useRef<any>(null);
    const { config } = useAppearance();

    const metalness = config.background.liquidMetalness ?? 0.75;
    const roughness = config.background.liquidRoughness ?? 0.25;

    useEffect(() => {
        if (!canvasRef.current || appRef.current) return;

        try {
            const app = LiquidBackground(canvasRef.current);
            appRef.current = app;

            // Manual texture loading via fetch for maximum debuggability
            const loadTexture = async () => {
                try {
                    const response = await fetch('/assets/backgrounds/liquid-metal.webp');
                    if (!response.ok) {
                        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
                    }
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);

                    const loader = new TextureLoader();
                    loader.load(
                        objectUrl,
                        (texture) => {
                            if (app.liquidPlane && typeof app.liquidPlane.setImage === 'function') {
                                app.liquidPlane.setImage(texture);
                            } else if (app.liquidPlane && app.liquidPlane.material) {
                                app.liquidPlane.material.map = texture;
                                app.liquidPlane.material.needsUpdate = true;
                            }
                            URL.revokeObjectURL(objectUrl); // clean up
                        },
                        undefined,
                        (err) => console.error("LiquidMetal: TextureLoader failed with objectURL", err)
                    );
                } catch (e) {
                    console.error("LiquidMetal: Fetch/Load failed", e);
                }
            };
            loadTexture();

            app.liquidPlane.material.metalness = metalness;
            app.liquidPlane.material.roughness = roughness;
            app.liquidPlane.uniforms.displacementScale.value = 5;
            if (app.setRain) app.setRain(false);

            return () => {
                if (app && typeof app.destroy === 'function') {
                    app.destroy();
                }
                appRef.current = null;
            };
        } catch (e) {
            console.error("Failed to initialize Liquid Metal background", e);
        }
    }, []);

    // React to config changes
    useEffect(() => {
        if (appRef.current && appRef.current.liquidPlane) {
            appRef.current.liquidPlane.material.metalness = metalness;
            appRef.current.liquidPlane.material.roughness = roughness;
        }
    }, [metalness, roughness]);

    return (
        <div className="fixed inset-0 -z-50 pointer-events-none">
            <canvas ref={canvasRef} className="w-full h-full" />
        </div>
    );
}
