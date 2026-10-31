"use client";

import React from "react";

interface DifusionLayerProps {
    layer: import("@/lib/appearance/background-layers").BackgroundLayer;
}

function DifusionLayer({ layer }: DifusionLayerProps) {
    const { difusion, opacity, blend, transform, visible } = layer;

    if (!visible) return null;

    const { modo, desenfoquePx, opacidad, textura } = difusion;

    const baseStyle: React.CSSProperties = {
        opacity,
        mixBlendMode: blend,
        ...transform && {
            transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.escala}) rotate(${transform.rotacion}deg) scale(${transform.ancho}, ${transform.alto})`,
        },
    };

    const textureStyles: Record<string, React.CSSProperties> = {
        grano: { filter: "blur(8px)" },
        papel: { brightness: "110%" },
        escarcha: { filter: "invert" },
    };

    return (
        <div
            className="absolute inset-0 h-full w-full overflow-hidden"
            style={baseStyle}
        >
            <div
                className="absolute inset-0 transition-opacity duration-700"
                style={textura
                    ? { ...textureStyles[textura], opacity: opacidad }
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
                        style={{ background: difusion.tono, opacity: opacidad }}
                    />
                )}
            </div>
        </div>
    );
}

export function CapaDifusion({
    layer,
}: {
    layer: import("@/lib/appearance/background-layers").BackgroundLayer;
}) {
    return <DifusionLayer layer={layer} />;
}