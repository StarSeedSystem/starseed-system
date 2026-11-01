"use client";

/**
 * StarSeed XR · VIÑETA (XR1010AF · contrato §3 j). Malla anular delante de la cámara
 * que cierra el campo de visión según la velocidad; nunca negro total.
 */
import { useMemo } from "react";
import { DoubleSide, MeshBasicMaterial } from "three";
import { opacidadVineta } from "../../../lib/xr/confort";
import type { PreferenciasConfort } from "../../../lib/xr/confort";

export interface PropsVineta {
  opacidad?: number;
  confort?: PreferenciasConfort;
  movimiento?: { lineal: number; angularGradosS: number };
}

export function Vineta({ opacidad, confort, movimiento }: PropsVineta) {
  const op = useMemo(() => {
    if (typeof opacidad === "number") return Math.min(0.85, Math.max(0, opacidad));
    if (confort && movimiento) return Math.min(0.85, Math.max(0, opacidadVineta(confort, movimiento)));
    if (typeof opacidad === "number") return Math.min(0.85, opacidad);
    return 0;
  }, [opacidad, confort, movimiento]);

  const material = useMemo(() => {
    const m = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: op, depthTest: false, side: DoubleSide });
    m.depthWrite = false;
    return m;
  }, [op]);

  if (op <= 0) return null;

  return (
    <mesh position={[0, 0, -0.1]} renderOrder={1000} material={material}>
      <ringGeometry args={[0.08, 0.5, 32, 1]} />
    </mesh>
  );
}

export default Vineta;
