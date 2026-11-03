"use client";

/**
 * StarSeed XR · VIÑETA (XR1010AF · contrato §3 j). Cascarón fino de R3F: una malla anular negra
 * (MeshBasicMaterial con alfa) flotando SIEMPRE a 0,1 m delante de la cámara, con `renderOrder`
 * alto y `depthTest` a falso, que cierra el campo de visión según la opacidad que pide el
 * núcleo (`opacidadVineta`), con tope 0,85: jamás oscurece del todo. La lógica de cuánto cierra
 * vive en `src/lib/xr/confort.ts` (núcleo puro, probado); aquí solo se reproduce el valor.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export interface PropsVineta {
    /** Opacidad 0–1 de la viñeta; 0 la deja simplemente sin pintar. */
    opacidad: number;
}

export function Vineta({ opacidad }: PropsVineta) {
    const malla = useRef<THREE.Mesh>(null);
    const camara = useThree((s) => s.camera);
    useFrame(() => {
        const m = malla.current;
        if (!m) return;
        // Siempre pegada al ojo: 0,1 m por delante y con su misma orientación, pase lo que pase.
        const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camara.quaternion);
        m.position.copy(camara.position).addScaledVector(frente, 0.1);
        m.quaternion.copy(camara.quaternion);
    });
    // Tope durísimo en el cascarón: `opacidadVineta` ya acota, y aquí se defiende de nuevo —
    // una viñeta a opacidad 1 sería negro total, lo único que el contrato prohíbe.
    const alfa = Math.min(0.85, Math.max(0, opacidad));
    return (
        <mesh ref={malla} renderOrder={9_999} visible={alfa > 0.001}>
            <ringGeometry args={[0.035, 0.1, 48]} />
            <meshBasicMaterial
                color="#000000"
                transparent
                opacity={alfa}
                depthTest={false}
                depthWrite={false}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

