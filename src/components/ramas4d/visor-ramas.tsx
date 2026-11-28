'use client';

/**
 * Visor Ramas 4D (MV1125ZA): escena 3D perezosa (ssr: false) y panel de facetas.
 * Filtrar no reordena: las posiciones se recortan en el orden del grafo filtrado,
 * que conserva el orden de inserción original.
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import {
  anclasDeFaceta,
  agruparPorFacetaClave,
  crearTaxonomia,
  filtrarPorFacetas,
  type ClaveFaceta,
  type DisposicionFaceta,
  type SeleccionFacetas,
  type Taxonomia,
} from '@/lib/ramas4d/facetas';
import { ControlesFacetas } from './controles/facetas';

type FacetaAncla = 'tema' | 'categoria' | 'formato';

const ANCLAS: readonly { faceta: FacetaAncla; disposicion: DisposicionFaceta; rotulo: string }[] = [
  { faceta: 'tema', disposicion: 'region', rotulo: 'Tema' },
  { faceta: 'categoria', disposicion: 'anillo', rotulo: 'Categoría' },
  { faceta: 'formato', disposicion: 'forma', rotulo: 'Formato' },
];

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

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
  /** Persona o grupo dueño de la taxonomía propia (nunca la de otro). */
  dueno?: string;
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

function posicionesPorAnclas(
  grafo: Grafo4D,
  faceta: ClaveFaceta,
  disposicion: DisposicionFaceta
): Float32Array {
  const grupos = agruparPorFacetaClave(grafo, faceta);
  const anclas = new Map(
    anclasDeFaceta(grafo, faceta, disposicion).map((ancla) => [ancla.valor, ancla.posicion])
  );
  const orden = new Map([...grafo.nodos.keys()].map((id, i) => [id, i]));
  const posiciones = new Float32Array(grafo.nodos.size * 3);
  for (const [valor, ids] of grupos) {
    const centro = anclas.get(valor);
    if (!centro) continue;
    for (const id of ids) {
      const i = orden.get(id);
      if (i === undefined) continue;
      const angulo = i * ANGULO_AUREO;
      const radio = 0.35 + (i % 5) * 0.08;
      posiciones[i * 3] = centro[0] + Math.cos(angulo) * radio;
      posiciones[i * 3 + 1] = centro[1] + Math.sin(angulo) * radio;
      posiciones[i * 3 + 2] = centro[2] + Math.cos(angulo * 0.5) * radio;
    }
  }
  return posiciones;
}

export default function VisorRamas({ grafo, posiciones, capasVisibles = [], dueno = 'yo' }: VisorRamasProps) {
  const [seleccion, setSeleccion] = useState<SeleccionFacetas>({});
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [ancla, setAncla] = useState<FacetaAncla | null>(null);
  const [taxonomia, setTaxonomia] = useState<Taxonomia>(() => crearTaxonomia(dueno));

  const filtrado = useMemo(() => filtrarPorFacetas(grafo, seleccion), [grafo, seleccion]);
  const posicionesFiltradas = useMemo(
    () => recortarPosiciones(grafo, filtrado, posiciones),
    [grafo, filtrado, posiciones]
  );
  const posicionesFinales = useMemo(() => {
    if (!ancla) return posicionesFiltradas;
    const disposicion = ANCLAS.find((a) => a.faceta === ancla)?.disposicion ?? 'region';
    return posicionesPorAnclas(filtrado, ancla, disposicion);
  }, [ancla, filtrado, posicionesFiltradas]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <aside className="max-h-56 w-full shrink-0 md:max-h-none md:w-72">
        <ControlesFacetas
          grafo={grafo}
          seleccion={seleccion}
          onCambiar={setSeleccion}
          taxonomia={taxonomia}
          onTaxonomia={setTaxonomia}
        />
      </aside>
      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Anclas de disposición">
          <button
            type="button"
            onClick={() => setAncla(null)}
            aria-pressed={ancla === null}
            className="cursor-pointer rounded-full border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            Automática
          </button>
          {ANCLAS.map(({ faceta, rotulo }) => (
            <button
              key={faceta}
              type="button"
              onClick={() => setAncla(faceta)}
              aria-pressed={ancla === faceta}
              className={`cursor-pointer rounded-full border px-2 py-1 text-xs transition-colors ${ancla === faceta ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="relative min-h-0 flex-1">
          <EscenaRamas
            grafo={filtrado}
            posiciones={posicionesFinales}
            seleccionado={seleccionado}
            onSeleccionar={setSeleccionado}
            capasVisibles={capasVisibles}
          />
        </div>
      </div>
    </div>
  );
}
