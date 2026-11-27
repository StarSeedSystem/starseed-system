'use client';

/**
 * Etiquetas de Ramas 4D: solo las del cuerpo seleccionado, el apuntado y los más cercanos
 * a la cámara (MV1125G). Se recalcula cada 250 ms, no en cada cuadro.
 */

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Cuerpo } from './nodos-instanciados';

interface Props {
  cuerpos: Cuerpo[];
  seleccionado: string | null;
  hover: string | null;
  max: number;
  /** Distancia de cámara a partir de la cual no se rotula. */
  radio: number;
}

const INTERVALO_S = 0.25;

export function EtiquetasCercanas({ cuerpos, seleccionado, hover, max, radio }: Props) {
  const [cercanos, setCercanos] = useState<string[]>([]);
  const acumulado = useRef(0);
  useFrame(({ camera }, delta) => {
    acumulado.current += delta;
    if (acumulado.current < INTERVALO_S) return;
    acumulado.current = 0;
    const tope = radio * radio;
    const candidatos: Array<[number, string]> = [];
    for (const c of cuerpos) {
      const dx = c.pos[0] - camera.position.x;
      const dy = c.pos[1] - camera.position.y;
      const dz = c.pos[2] - camera.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= tope) candidatos.push([d2, c.id]);
    }
    candidatos.sort((a, b) => a[0] - b[0]);
    const ids = candidatos.slice(0, Math.max(0, max)).map(([, id]) => id);
    setCercanos((previo) => (previo.length === ids.length && previo.every((v, i) => v === ids[i]) ? previo : ids));
  });

  const visibles = new Set(cercanos);
  if (seleccionado) visibles.add(seleccionado);
  if (hover) visibles.add(hover);
  return (
    <>
      {cuerpos.filter((c) => visibles.has(c.id)).map((c) => {
        const activo = c.id === seleccionado || c.id === hover;
        return (
          <Html key={c.id} position={c.pos} center distanceFactor={14} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <span
              className={`select-none whitespace-nowrap rounded-md border border-border/50 bg-background/70 px-1.5 py-0.5 text-[10px] backdrop-blur-sm transition-opacity duration-200 ${activo ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              style={{ transform: 'translateY(-1.6em)' }}
            >
              {c.titulo}
            </span>
          </Html>
        );
      })}
    </>
  );
}
