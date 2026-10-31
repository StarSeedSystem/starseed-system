"use client";

import React from "react";
import type { BackgroundLayer, DifusionConfig } from "@/lib/appearance/background-layers";

interface CapaDifusionProps {
    layer: BackgroundLayer;
}

const TEXTURE_STYLES: Record<string, React.CSSProperties> = {
    grano: { filter: "blur(8px)" },
    papel: { brightness: "110%" },
    escarcha: { filter: "invert" },
};

export function CapaDifusion({ layer }: CapaDifusionProps) {
    const { opacity, blend, transform, visible, difusion } = layer;

    if (!visible || !difusion) {
        return null;
    }

    const config: DifusionConfig = difusion;
    const { modo, desenfoquePx, opacidad, tono, textura } = config;

    const baseStyle: React.CSSProperties = {
        opacity,
        mixBlendMode: blend,
        ...transform && {
            transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.escala}) rotate(${transform.rotacion}deg)`,
        },
    };

    return (
        <div
            className="absolute inset-0 h-full w-full overflow-hidden"
            style={baseStyle}
        >
            <div
                className="absolute inset-0 transition-opacity duration-700"
                style={textura && textura !== "ninguna"
                    ? { ...TEXTURE_STYLES[textura], opacity: opacidad }
                    : { opacity: opacidad }}
            >
                {modo === "desenfoque" && (
                    <div
                        className="absolute inset-0"
                        style={{
                            WebkitFilter: `blur(${desenfoquePx}px)`,
                            filter: `blur(${desenfoquePx}px)`,
                            background: "rgba(255, 255, 255, 0.2)",
                        }}
                    />
                )}
                {modo === "blanco" && (
                    <div
                        className="absolute inset-0"
                        style={{ background: "white", opacity: opacidad }}
                    />
                )}
                {modo === "negro" && (
                    <div
                        className="absolute inset-0"
                        style={{ background: "black", opacity: opacidad }}
                    />
                )}
                {modo === "tono" && (
                    <div
                        className="absolute inset-0"
                        style={{ background: tono ?? "#ffffff", opacity: opacidad }}
                    />
                )}
                {modo === "transparente" && (
                    <div className="absolute inset-0" style={{ opacity: opacidad }} />
                )}
            </div>
        </div>
    );
}