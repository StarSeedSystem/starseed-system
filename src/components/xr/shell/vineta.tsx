"use client";

/**
 * StarSeed XR · VIÑETA (XR1010AF · contrato §3 j).
 * Malla anular delante de la cámara (a 0,1 m, renderOrder alto, depthTest false)
 * con material MeshBasicMaterial negro con alfa. Cierra el campo de visión según
 * opacidadVineta(confort, {lineal, angularGradosS}), tope 0,85 (nunca negro total).
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { opacidadVineta, type PreferenciasConfort } from "@/lib/xr/confort";

export interface PropsVineta {
    confort: PreferenciasConfort;
    velocidad: { lineal: number; angular: number };
}

export function Vineta({ confort, velocidad }: PropsVineta) {
    const { camera } = useThree();
    const mallaRef = useRef<THREE.Mesh | null>(null);

    const opacidad = useMemo(() => opacidadVineta(confort, velocidad), [confort, velocidad.lineal, velocidad.angular]);

    useFrame(() => {
        if (mallaRef.current) {
            mallaRef.current.position.set(0, 0, -0.1);
            const material = mallaRef.current.material as THREE.MeshBasicMaterial;
            material.opacity = opacidad;
        }
    });

    if (opacidad <= 0) return null;
    return (
        <mesh ref={mallaRef} position={[0, 0, -0.1]} renderOrder={9999} frustumCulled={false}>
            <ringGeometry args={[0.05, 0.12, 64]} />
            <meshBasicMaterial color="black" transparent opacity={opacidad} depthTest={false} />
        </mesh>
    );
}