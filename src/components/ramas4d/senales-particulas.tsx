'use client';

/**
 * Partículas de señal: un solo buffer de puntos que viajan por las aristas (MV1125G).
 * Cada partícula toma el color de su arista (medio). Con "reducir movimiento" quedan quietas.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Segmentos } from './aristas-ramas';

interface Props {
  segmentos: Segmentos;
  max: number;
  reducido: boolean;
}

export function SenalesParticulas({ segmentos, max, reducido }: Props) {
  const total = Math.min(max, segmentos.n * 2);
  const { geometria, arista, fase } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arista = new Uint32Array(total);
    const fase = new Float32Array(total);
    const colores = new Float32Array(total * 3);
    for (let i = 0; i < total; i++) {
      arista[i] = segmentos.n > 0 ? (i * 2654435761) % segmentos.n : 0;
      fase[i] = (i * 0.618) % 1;
      colores.set(segmentos.colores.subarray(arista[i] * 6, arista[i] * 6 + 3), i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    return { geometria: g, arista, fase };
  }, [segmentos, total]);
  useEffect(() => () => geometria.dispose(), [geometria]);

  const mover = (avance: number) => {
    const pos = geometria.getAttribute('position') as THREE.BufferAttribute;
    const p = segmentos.posiciones;
    for (let i = 0; i < total; i++) {
      fase[i] = (fase[i] + avance) % 1;
      const o = arista[i] * 6;
      const t = fase[i];
      pos.setXYZ(i, p[o] + (p[o + 3] - p[o]) * t, p[o + 1] + (p[o + 4] - p[o + 1]) * t, p[o + 2] + (p[o + 5] - p[o + 2]) * t);
    }
    pos.needsUpdate = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { mover(0); }, [geometria]); // posición inicial (y la de «reducir movimiento»)
  useFrame((_, delta) => {
    if (reducido || total === 0) return;
    mover(Math.min(delta, 0.1) * 0.25);
  });

  if (total === 0) return null;
  return (
    <points geometry={geometria} frustumCulled={false}>
      <pointsMaterial vertexColors size={0.22} sizeAttenuation transparent opacity={0.95} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}
