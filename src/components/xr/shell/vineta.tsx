'use client';
/**
 * StarSeed XR · VIÑETA (XR1010AF, contrato §3 j y l). Malla anular delante de la cámara (a 0,1 m,
 * `renderOrder` alto, `depthTest` off, `MeshBasicMaterial` negro con alfa) que cierra el campo de visión
 * con la velocidad de la cabeza. JAMÁS oscurece del todo: tope 0,85 (CONTRATO y `opacidadVineta`).
 */

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Mesh } from "three";

/** Tope duro: la vista nunca queda negra total. */
export const OPACIDAD_TOPE = 0.85;
/** Distancia (m) de la malla delante de la cámara. */
export const AVANCE_VINETA = 0.1;

/** Todo lo que la viñeta necesita de la cámara: números, sin tocar `three`. */
export interface CamaraVineta {
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
}

/** Alfa acotado a [0, 0,85]; un valor roto (NaN, infinito) no tapa nada. */
export function opacidadAcotada(o: number): number {
    if (!Number.isFinite(o)) return 0;
    return Math.min(OPACIDAD_TOPE, Math.max(0, o));
}

/** Geometría del anillo: el interior se cierra hacia el centro al subir la opacidad (0 = anillo invisible). */
export function geometriaVineta(opacidad: number): { interior: number; exterior: number } {
    const exterior = 0.1;
    const cierre = Math.cos((opacidadAcotada(opacidad) * Math.PI) / 2);
    return { interior: Math.round(exterior * cierre * 1e4) / 1e4, exterior };
}

const cruz = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** Dónde va la malla: a `AVANCE_VINETA` m DELANTE de la mirada, girada con ella (solo cálculo puro). */
export function poseVineta(c: CamaraVineta): [number, number, number] {
    const u: [number, number, number] = [c.quaternion.x, c.quaternion.y, c.quaternion.z];
    const v: [number, number, number] = [0, 0, -1];
    const j = cruz(u, v);
    const w = c.quaternion.w;
    const k = cruz(u, [j[0] + w * v[0], j[1] + w * v[1], j[2] + w * v[2]]);
    const f: [number, number, number] = [v[0] + 2 * k[0], v[1] + 2 * k[1], v[2] + 2 * k[2]];
    return [c.position.x + AVANCE_VINETA * f[0], c.position.y + AVANCE_VINETA * f[1], c.position.z + AVANCE_VINETA * f[2]];
}

/** <Vineta opacidad>: se fija a la cámara en cada fotograma; con opacidad 0 no se dibuja nada. */
export function Vineta({ opacidad }: { opacidad: number }) {
    const malla = useRef<Mesh>(undefined);
    const camara = useThree((estado) => estado.camera);
    const alfa = opacidadAcotada(opacidad);
    const rango = geometriaVineta(opacidad);
    useFrame(() => {
        const m = malla.current;
        if (!m) return;
        const donde = poseVineta({ position: camara.position, quaternion: camara.quaternion });
        m.position.set(donde[0], donde[1], donde[2]);
        m.quaternion.copy(camara.quaternion);
    });
    return (
        <mesh ref={malla} renderOrder={900} frustumCulled={false} visible={alfa > 0} data-testid="vineta">
            <ringGeometry attach="geometry" args={[rango.interior, rango.exterior, 48]} />
            <meshBasicMaterial
                attach="material"
                color="#000000"
                transparent
                opacity={alfa}
                depthTest={false}
                depthWrite={false}
            />
        </mesh>
    );
}

export default Vineta;

