'use client';
import * as THREE from 'three';
import { useMemo } from 'react';
export interface VinetaProps { opacidad?: number; }
export function Vineta({ opacidad = 0 }: VinetaProps) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: Math.max(0, Math.min(0.85, opacidad)), depthTest: false }), [opacidad]);
  const geometry = useMemo(() => new THREE.RingGeometry(0.8, 1.2, 64), []);
  return <mesh geometry={geometry} material={material} renderOrder={1000} position={[0,0,-0.1]} />;
}
