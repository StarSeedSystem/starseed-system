"use client";

/**
 * StarSeed XR · VIÑETA DE CONFORT (XR1010AF · contrato `architecture/starseed-xr.md` §3 j).
 * Cascarón fino de R3F: una malla anular negra delante de la cámara cierra el campo de visión
 * periférico cuando la persona se mueve. El tope es 0,85: NUNCA se queda a oscuras.
 * La cuenta de cuánto cerrar la manda `opacidadVineta` del núcleo; aquí solo se acota y se pinta.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";

export const OPACIDAD_MAXIMA_VINETA = 0.85;
export const DISTANCIA_VINETA_M = 0.1;
export const RADIO_EXTERIOR_VINETA = 1;

/** Acota la opacidad a 0–0,85; un valor roto no oscurece nada. */
export function acotarOpacidadVineta(opacidad: number): number {
    if (!Number.isFinite(opacidad)) return 0;
    return Math.min(OPACIDAD_MAXIMA_VINETA, Math.max(0, opacidad));
}

/** Radio interior (m) del anillo: cuanto más cierra la viñeta, más pequeño es el hueco central. */
export function radioInteriorVineta(opacidad: number): number {
    const alfa = acotarOpacidadVineta(opacidad);
    const grados = 55 - (55 - 15) * (alfa / OPACIDAD_MAXIMA_VINETA);
    return DISTANCIA_VINETA_M * Math.tan((grados * Math.PI) / 180);
}

export interface PropsVineta {
    /** 0 = sin viñeta; se acota a 0,85. */
    opacidad: number;
}

export function Vineta({ opacidad }: PropsVineta) {
    const camara = useThree((s) => s.camera);
    const grupo = useRef<Group>(null);
    const alfa = acotarOpacidadVineta(opacidad);
    const radioInterior = useMemo(() => radioInteriorVineta(alfa), [alfa]);
    useFrame(() => {
        const g = grupo.current;
        if (!g) return;
        camara.getWorldPosition(g.position);
        camara.getWorldQuaternion(g.quaternion);
    });
    return (
        <group ref={grupo} renderOrder={999} frustumCulled={false}>
            <mesh
                position={[0, 0, -DISTANCIA_VINETA_M]}
                renderOrder={999}
                frustumCulled={false}
                visible={alfa > 0}
                raycast={() => undefined}
            >
                <ringGeometry args={[radioInterior, RADIO_EXTERIOR_VINETA, 48]} />
                <meshBasicMaterial
                    color="#000000"
                    transparent
                    opacity={alfa}
                    depthTest={false}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}
