"use client";
/**
 * StarSeed XR · VIÑETA DE CONFORT (XR1010AF · contrato §3 j). Cascarón fino de R3F: una malla
 * anular negra delante de la mirada (a 0,1 m, `renderOrder` alto, sin `depthTest`) que cierra el
 * campo de visión cuando la cabeza o el rig se mueven. La opacidad la decide `opacidadVineta` del
 * núcleo y NUNCA llega a 1: el tope es 0,85, así que jamás deja la pantalla en negro total.
 * La geometría y el tope son funciones puras (`geometriaVineta`, `opacidadMalla`), probadas sin WebGL.
 */
import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { opacidadVineta, type PreferenciasConfort } from "../../../lib/xr/confort";

export const TOPE_VINETA = 0.85;
export const DISTANCIA_VINETA = 0.1;
export const FOV_VINETA = 100;

export interface GeometriaVineta {
    /** Radio interior: se encoge al subir la opacidad; nunca es 0 con el tope. */
    interno: number;
    externo: number;
    opacidad: number;
}

export interface PropsVineta {
    /** 0–1; se acota al tope de 0,85. */
    opacidad: number;
    distancia?: number;
    fovGrados?: number;
}

/** Radios del anillo para una opacidad dada. A 0,85 queda un hueco y nunca se pinta negro total. */
export function geometriaVineta(opacidad: number, distancia = DISTANCIA_VINETA, fovGrados = FOV_VINETA): GeometriaVineta {
    const o = Number.isFinite(opacidad) ? Math.min(TOPE_VINETA, Math.max(0, opacidad)) : 0;
    const fov = Math.min(179, Math.max(1, Number.isFinite(fovGrados) ? fovGrados : FOV_VINETA));
    const externo = Math.max(0.001, 2 * (Number.isFinite(distancia) && distancia > 0 ? distancia : DISTANCIA_VINETA) * Math.tan((fov * Math.PI) / 360) * Math.SQRT2);
    return { interno: externo * (1 - o), externo, opacidad: o };
}

/** Lo que se pinta: el resultado de `opacidadVineta` acotado a [0, 0,85]. Sin números raros. */
export function opacidadMalla(c: PreferenciasConfort, mov: { lineal: number; angularGradosS: number }): number {
    const o = opacidadVineta(c, mov);
    return Number.isFinite(o) ? Math.min(TOPE_VINETA, Math.max(0, o)) : 0;
}

/** Grupo que copia cada fotograma la pose de la cámara: textos que no se despegan de la mirada. */
export function FijadoALaMirada({ posicion, children }: { posicion: [number, number, number]; children?: ReactNode }) {
    const grupo = useRef<THREE.Group>(null);
    useFrame(({ camera }) => {
        if (!grupo.current) return;
        grupo.current.position.copy(camera.position);
        grupo.current.quaternion.copy(camera.quaternion);
    });
    return <group ref={grupo}><group position={posicion}>{children}</group></group>;
}

export function Vineta({ opacidad, distancia = DISTANCIA_VINETA, fovGrados = FOV_VINETA }: PropsVineta) {
    const malla = useRef<THREE.Mesh>(null);
    const g = useMemo(() => geometriaVineta(opacidad, distancia, fovGrados), [opacidad, distancia, fovGrados]);
    useFrame(({ camera }) => {
        const m = malla.current;
        if (!m) return;
        m.position.copy(camera.position);
        m.quaternion.copy(camera.quaternion);
        m.translateZ(-distancia);
    });
    if (g.opacidad <= 0 || g.interno >= g.externo) return null;
    return (
        <mesh ref={malla} renderOrder={999} frustumCulled={false}>
            <ringGeometry args={[g.interno, g.externo, 48]} />
            <meshBasicMaterial
                color="#000000"
                transparent
                opacity={g.opacidad}
                depthTest={false}
                depthWrite={false}
                side={THREE.DoubleSide}
                toneMapped={false}
            />
        </mesh>
    );
}
