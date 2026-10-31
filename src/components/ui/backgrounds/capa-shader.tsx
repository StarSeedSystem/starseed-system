"use client";

import React, { useEffect, useState } from "react";
import type { BackgroundLayer, ShaderPreset } from "@/lib/appearance/background-layers";

type ShaderComponentProps = { preset: ShaderPreset };

function ShaderCanvas({ preset, onLoad }: { preset: ShaderPreset; onLoad: () => void }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!canvasRef.current || !preset?.components?.length) return;
        const run = async () => {
            try {
                const { createShader } = await import("shaders/js");
                const shader = createShader();
                const ctx = shader(canvasRef.current!, {
                    preset,
                    disableTelemetry: true,
                });
                onLoad();
            } catch (e) {
                setError(String(e));
            }
        };
        run();
    }, [preset, onLoad]);

    if (error) return <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400">Error shader: {error}</div>;

    return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

interface CapaShaderProps {
    layer: BackgroundLayer;
}

export function CapaShader({ layer }: CapaShaderProps) {
    const { opacity, blend, transform, visible, preset } = layer;

    if (!visible || !preset?.components?.length) {
        return (
            <div
                className="absolute inset-0 h-full w-full overflow-hidden"
                style={{
                    opacity,
                    mixBlendMode: blend,
                    ...transform && {
                        transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.escala}) rotate(${transform.rotacion}deg)`,
                    },
                }}
            />
        );
    }

    return (
        <div
            className="absolute inset-0 h-full w-full overflow-hidden"
            style={{
                opacity,
                mixBlendMode: blend,
                ...transform && {
                    transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.escala}) rotate(${transform.rotacion}deg)`,
                },
            }}
        >
            <ShaderCanvas preset={preset} onLoad={() => {}} />
        </div>
    );
}