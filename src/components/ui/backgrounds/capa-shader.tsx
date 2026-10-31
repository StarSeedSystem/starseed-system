"use client";

import React from "react";
import dynamic from "next/dynamic";

const createShader = dynamic(
    () => import("shaders/js").then((m) => m.createShader),
    { ssr: false, loading: () => null },
);

interface ShaderLayerProps {
    layer: import("@/lib/appearance/background-layers").BackgroundLayer;
}

function ShaderLayer({ layer }: ShaderLayerProps) {
    const { preset, opacity, blend, transform, visible } = layer;

    if (!visible) return null;

    const ShaderComponent = createShader();

    return (
        <div
            className="absolute inset-0 h-full w-full overflow-hidden"
            style={{
                opacity,
                mixBlendMode: blend,
                ...transform && {
                    transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.escala}) rotate(${transform.rotacion}deg) scale(${transform.ancho}, ${transform.alto})`,
                },
            }}
        >
            {visible && <ShaderComponent preset={preset} />}
        </div>
    );
}

export function CapaShader({
    layer,
}: {
    layer: import("@/lib/appearance/background-layers").BackgroundLayer;
}) {
    return <ShaderLayer layer={layer} />;
}