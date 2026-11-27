'use client';

/**
 * Aristas de Ramas 4D en UN solo LineSegments (MV1125G).
 * El color sale del medio de la arista (tokens del tema); la intensidad la hace más viva.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Arista } from '@/lib/ramas4d/modelo';
import { colorToken, type Cuerpo } from './nodos-instanciados';

export interface Segmentos {
  /** 6 números por arista (extremo A y B). */
  posiciones: Float32Array;
  /** 6 números por arista (RGB de cada extremo). */
  colores: Float32Array;
  n: number;
}

const COLOR_MEDIO: Record<string, [string, [number, number, number]]> = {
  senal: ['--trinity-azure-hsl', [210 / 360, 1, 0.5]],
  sincroniza: ['--trinity-lime-hsl', [111 / 360, 1, 0.54]],
  transmuta: ['--trinity-amber-hsl', [45 / 360, 1, 0.5]],
};
const COLOR_BASE: [string, [number, number, number]] = ['--trinity-emerald-hsl', [160 / 360, 0.84, 0.39]];

/** Color de un medio de arista (lo usan también las partículas de señal). */
export function colorMedio(tipo: string): THREE.Color {
  const [variable, respaldo] = COLOR_MEDIO[tipo] ?? COLOR_BASE;
  return colorToken(variable, respaldo);
}

/** Solo entran las aristas cuyos dos extremos son visibles; las más intensas primero. */
export function construirSegmentos(aristas: readonly Arista[], porId: ReadonlyMap<string, Cuerpo>, max: number): Segmentos {
  const validas = aristas
    .filter((a) => porId.has(a.de) && porId.has(a.a))
    .sort((a, b) => b.intensidad - a.intensidad)
    .slice(0, Math.max(0, max));
  const posiciones = new Float32Array(validas.length * 6);
  const colores = new Float32Array(validas.length * 6);
  const cache = new Map<string, THREE.Color>();
  validas.forEach((a, i) => {
    const p = porId.get(a.de)!.pos;
    const q = porId.get(a.a)!.pos;
    posiciones.set([p[0], p[1], p[2], q[0], q[1], q[2]], i * 6);
    let c = cache.get(a.tipo);
    if (!c) cache.set(a.tipo, (c = colorMedio(a.tipo)));
    const k = 0.35 + Math.min(1, Math.max(0, a.intensidad)) * 0.65;
    colores.set([c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k], i * 6);
  });
  return { posiciones, colores, n: validas.length };
}

export function AristasRamas({ segmentos }: { segmentos: Segmentos }) {
  const geometria = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(segmentos.posiciones, 3));
    g.setAttribute('color', new THREE.BufferAttribute(segmentos.colores, 3));
    return g;
  }, [segmentos]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  if (segmentos.n === 0) return null;
  return (
    <lineSegments geometry={geometria} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={0.55} toneMapped={false} />
    </lineSegments>
  );
}
