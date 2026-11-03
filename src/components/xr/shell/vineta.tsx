"use client";

/**
 * StarSeed XR · VIÑETA DE CONFORT (XR1010F · contrato §3 j). Cascarón fino de R3F: malla anular
 * pegada a la cámara (0,1 m delante, renderOrder alto, sin depthTest, negro con alfa) que cierra
 * el campo de visión. La CUANTÍA la calcula el núcleo (`opacidadVineta`, tope 0,85, nunca negro
 * total); aquí solo se crea, se coloca y se pinta. La creación y colocación viven en `mallaVineta`,
 * función probada sin WebGL.
 */
import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export interface MallaVineta {
    malla: THREE.Mesh;
    /** Coloca la malla delante de la cámara a `distancia` m, mirando por donde ella. */
    colocar(pos: { x: number; y: number; z: number }, quat: THREE.Quaternion): void;
    /** Fija la opacidad (acotada al tope; ≤ 0 no se pinta). */
    opacidad(v: number): void;
}

/** Comodidad dura: la viñeta JAMÁS oscurece del todo. */
export const TOPE_VINETA = 0.85;

export function mallaVineta(opacidad: number, distancia = 0.1): MallaVineta {
    const geometria = new THREE.RingGeometry(0.28, 0.6, 48);
    const material = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: opacidad,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const malla = new THREE.Mesh(geometria, material);
    malla.renderOrder = 999;
    const alFrente = new THREE.Vector3(0, 0, -1);
    return {
        malla,
        colocar(pos, quat) {
            malla.quaternion.copy(quat);
            malla.position.set(pos.x, pos.y, pos.z).add(alFrente.clone().applyQuaternion(quat).multiplyScalar(distancia));
        },
        opacidad(v) {
            material.opacity = Math.min(TOPE_VINETA, Math.max(0, v));
            malla.visible = material.opacity > 0.001;
        },
    };
}

export interface PropsVineta {
    /** Opacidad 0–1 que ya calculó `opacidadVineta` (nunca pasa de 0,85). */
    opacidad: number;
    /** Distancia de la malla a la cámara (m). */
    distancia?: number;
    /** Costura para el trazado (XR1010AS) y las pruebas: entrega la malla al crearla. */
    alCrear?: (m: MallaVineta) => void;
}

export function Vineta({ opacidad, distancia = 0.1, alCrear }: PropsVineta) {
    const creada = useMemo(() => {
        const malla = mallaVineta(opacidad, distancia);
        if (alCrear) alCrear(malla);
        return malla;
    }, [distancia, alCrear]);
    const camara = useThree((s) => s.camera);
    useFrame(() => {
        creada.colocar(camara.position, camara.quaternion);
        creada.opacidad(opacidad);
    });
    return <primitive object={creada.malla} />;
}
