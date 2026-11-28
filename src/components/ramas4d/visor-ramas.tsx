'use client';

/**
 * Visor Ramas 4D (MV1125ZA): escena 3D perezosa (ssr: false) y panel de facetas.
 * Filtrar no reordena: las posiciones se recortan en el orden del grafo filtrado,
 * que conserva el orden de inserción original.
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import { filtrarPorFacetas, type SeleccionFacetas } from '@/lib/ramas4d/facetas';
import { ControlesFacetas } from './controles/facetas';

const EscenaRamas = dynamic(() => import('./escena-ramas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">
      Preparando el universo…
    </div>
  ),
});

export interface VisorRamasProps {
  grafo: Grafo4D;
  posiciones: Float32Array | null;
  capasVisibles?: string[];
}

function recortarPosiciones(
  original: Grafo4D,
  filtrado: Grafo4D,
  posiciones: Float32Array | null
): Float32Array | null {
  if (!posiciones) return null;
  const recortadas: number[] = [];
  let i = 0;
  for (const id of original.nodos.keys()) {
    if (filtrado.nodos.has(id) && i * 3 + 2 < posiciones.length) {
      recortadas.push(posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]);
    }
    i++;
  }
  return new Float32Array(recortadas);
}

export default function VisorRamas({ grafo, posiciones, capasVisibles = [] }: VisorRamasProps) {
  const [seleccion, setSeleccion] = useState<SeleccionFacetas>({});
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const filtrado = useMemo(() => filtrarPorFacetas(grafo, seleccion), [grafo, seleccion]);
  const posicionesFiltradas = useMemo(
    () => recortarPosiciones(grafo, filtrado, posiciones),
    [grafo, filtrado, posiciones]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <aside className="max-h-56 w-full shrink-0 md:max-h-none md:w-72">
        <ControlesFacetas grafo={grafo} seleccion={seleccion} onCambiar={setSeleccion} />
      </aside>
      <div className="relative min-h-0 flex-1">
        <EscenaRamas
          grafo={filtrado}
          posiciones={posicionesFiltradas}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
          capasVisibles={capasVisibles}
        />
      </div>
    </div>
  );
}
