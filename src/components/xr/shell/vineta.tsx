"use client";
/**
 * StarSeed XR · VIÑETA (XR1010F · contrato §3 j). Malla anular pegada a la cámara, a 0,1 m,
 * `renderOrder` alto y `depthTest` false: tapa el borde del campo de visión sin esconder la
 * interfaz. La abertura se cierra al crecer la opacidad (`radiosVineta`), el material es
 * `MeshBasicMaterial` negro con alfa y JAMÁS pasa de 0,85 (nunca negro total). Cascarón fino.
 */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/** Distancia (m) de la viñeta a la cámara y radio máximo (m) de la malla. */
export const DISTANCIA_VINETA_M = 0.1;
export const RADIO_VINETA_M = 0.14;
/** Tope del contrato: cierra el campo pero nunca oscurece del todo. */
export const TOPE_VINETA = 0.85;

/** Radios (m) del anillo según la opacidad 0–1: a 0 no cubre nada, a 0,85 casi cierra. */
export function radiosVineta(opacidad: number): { interior: number; exterior: number } {
  const cierre = Math.min(1, Math.max(0, (Number.isFinite(opacidad) ? opacidad : 0) / TOPE_VINETA));
  return { interior: Math.max(0.008, RADIO_VINETA_M * (1 - 0.92 * cierre)), exterior: RADIO_VINETA_M };
}

export interface PropsVineta {
  /** Opacidad actual 0–1, la que calcula `opacidadVineta` del núcleo. */
  opacidad: number;
}

export function Vineta({ opacidad }: PropsVineta) {
  const malla = useRef<THREE.Mesh>(null);
  useFrame((estado) => {
    const m = malla.current;
    if (!m) return;
    m.position.copy(estado.camera.position);
    m.quaternion.copy(estado.camera.quaternion);
    m.translateZ(-DISTANCIA_VINETA_M);
  });
  const radios = radiosVineta(opacidad);
  const alfa = Math.min(TOPE_VINETA, Math.max(0, opacidad));
  return (
    <mesh ref={malla} renderOrder={999}>
      <ringGeometry args={[radios.interior, radios.exterior, 48]} />
      <meshBasicMaterial color="#000000" transparent depthTest={false} opacity={alfa} />
    </mesh>
  );
}
