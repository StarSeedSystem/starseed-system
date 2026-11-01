"use client";
/**
 * StarSeed XR · VIÑETA (XR1010AF · contrato `architecture/starseed-xr.md` §3 j). Un anillo negro
 * un pelín delante de la cámara cierra el campo de visión cuando la cabeza se mueve rápido y
 * JAMÁS oscurece del todo (tope 0,85; el núcleo `opacidadVineta` ya lo acota). Fabricación y
 * ajuste por fotograma en funciones puras probables; el cascarón R3F sólo las usa.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Anillo a 0,1 m delante de la cámara: interior 0,06 m, exterior 0,14 m. */
export const VINETA = { distancia: 0.1, interior: 0.06, exterior: 0.14 } as const;
/** Nunca negro total. */
export const OPACIDAD_TOPE = 0.85;

export interface CamaraMira {
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
}

/** Anillo negro, transparente y por ENCIMA de todo: se ve pero no tapa la escena. */
export function crearVineta(): THREE.Mesh {
  const geometria = new THREE.RingGeometry(VINETA.interior, VINETA.exterior, 48);
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false });
  const malla = new THREE.Mesh(geometria, material);
  malla.renderOrder = 9999;
  return malla;
}

const acotaAlfa = (opacidad: number): number =>
  Math.max(0, Math.min(OPACIDAD_TOPE, Number.isFinite(opacidad) ? opacidad : 0));

/** Pone la malla pegada a la mirada, a `VINETA.distancia`, con el alfa pedido acotado a 0,85. */
export function ajustarVineta(malla: THREE.Mesh, camara: CamaraMira, opacidad: number): void {
  const alfa = acotaAlfa(opacidad);
  const material = malla.material as THREE.MeshBasicMaterial;
  material.opacity = alfa;
  malla.visible = alfa > 0;
  malla.quaternion.set(camara.quaternion.x, camara.quaternion.y, camara.quaternion.z, camara.quaternion.w);
  malla.position.set(0, 0, -VINETA.distancia).applyQuaternion(malla.quaternion)
    .add(new THREE.Vector3(camara.position.x, camara.position.y, camara.position.z));
}

export function Vineta({ opacidad }: { opacidad: number }) {
  const malla = useMemo(crearVineta, []);
  useEffect(() => () => { malla.geometry.dispose(); (malla.material as THREE.Material).dispose(); }, [malla]);
  useFrame((estado) => ajustarVineta(malla, estado.camera, opacidad));
  return <primitive object={malla} />;
}
