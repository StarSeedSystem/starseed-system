'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { PeticionDisposicion } from '@/lib/ramas4d/disposicion.worker';
import { podarGrafo, type Observador } from '@/lib/ramas4d/alcance';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import { useDisposicion } from '@/lib/ramas4d/use-disposicion';
import { anclasPorFaceta, crearFaceta, filtrarPorFacetas, fusionarFacetas, indiceDeFacetas, renombrarFaceta,
  taxonomiasDe, type FacetaAncla, type SeleccionFacetas, type Taxonomias, type Ancla } from '@/lib/ramas4d/facetas';
import { ControlesFacetas, type AccionTaxonomia } from './controles/facetas';

const EscenaRamas = dynamic(() => import('./escena-ramas'), { ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preparando el universo…</div> });

export interface VisorRamasProps {
  grafo: Grafo4D;
  observador: Observador;
}

function posicionesDesdeAnclas(grafo: Grafo4D, tipo: FacetaAncla): Float32Array {
  const anclas = anclasPorFaceta(grafo, tipo);
  const posiciones = new Float32Array(grafo.nodos.size * 3);
  let i = 0;
  for (const nodo of grafo.nodos.values()) {
    const clave = tipo === 'tema' ? nodo.tema ?? '' : tipo === 'categoria' ? nodo.categoria ?? '' : nodo.formato;
    const centro: Ancla | undefined = anclas.get(clave);
    const angulo = i * 2.39996;
    const radio = centro ? 0.35 + (i % 5) * 0.08 : 0;
    posiciones[i * 3] = (centro?.[0] ?? 0) + Math.cos(angulo) * radio;
    posiciones[i * 3 + 1] = (centro?.[1] ?? 0) + Math.sin(angulo) * radio;
    posiciones[i * 3 + 2] = (centro?.[2] ?? 0) + Math.cos(angulo * 0.5) * radio;
    i++;
  }
  return posiciones;
}

export function VisorRamas({ grafo, observador }: VisorRamasProps) {
  const visible = useMemo(() => podarGrafo(grafo, observador), [grafo, observador]);
  const indice = useMemo(() => indiceDeFacetas(visible), [visible]);
  const base = useMemo(() => taxonomiasDe(visible), [visible]);
  const [taxonomia, setTaxonomia] = useState<Taxonomias>(base);
  const [seleccion, setSeleccion] = useState<SeleccionFacetas>({});
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [ancla, setAncla] = useState<FacetaAncla | null>(null);
  const [posicionesAncla, setPosicionesAncla] = useState<Float32Array | null>(null);
  const filtrado = useMemo(() => filtrarPorFacetas(visible, seleccion), [visible, seleccion]);
  const { posiciones, calcular } = useDisposicion();

  useEffect(() => setTaxonomia(base), [base]);
  useEffect(() => {
    if (ancla) {
      setPosicionesAncla(posicionesDesdeAnclas(filtrado, ancla));
      return;
    }
    const ids = Array.from(filtrado.nodos.keys());
    const indices = new Map(ids.map((id, i) => [id, i]));
    const peticion: PeticionDisposicion = { modo: 'fuerza', n: ids.length, aristas: filtrado.aristas.map((a) => ({
      de: indices.get(a.de) ?? 0, a: indices.get(a.a) ?? 0, intensidad: a.intensidad })) };
    void calcular(peticion);
  }, [filtrado, ancla, calcular]);

  function aplicarTaxonomia(accion: AccionTaxonomia) {
    const dueno = observador.id;
    setTaxonomia((t) => {
      if (accion.accion === 'crear') return crearFaceta(t, dueno, accion.campo, accion.valor);
      if (accion.accion === 'renombrar') return renombrarFaceta(t, dueno, accion.campo, accion.valor, accion.destino ?? accion.valor);
      return fusionarFacetas(t, dueno, accion.campo, [accion.valor], accion.destino ?? accion.valor);
    });
  }

  const elegido = seleccionado ? filtrado.nodos.get(seleccionado) : undefined;
  const posicionesVisibles = ancla ? posicionesAncla : posiciones;
  return (
    <section className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(18rem,1fr)_minmax(0,1.618fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <ControlesFacetas indice={indice} seleccion={seleccion} onSeleccion={setSeleccion}
          taxonomia={taxonomia[observador.id]} onTaxonomia={aplicarTaxonomia} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Anclas de disposición">
          <button type="button" onClick={() => setAncla(null)} aria-pressed={ancla === null}
            className="min-h-11 cursor-pointer rounded-full border border-border/60 px-4 text-sm text-foreground">Automática</button>
          {(['tema', 'categoria', 'formato'] as const).map((tipo) => (
            <button key={tipo} type="button" onClick={() => setAncla(tipo)} aria-pressed={ancla === tipo}
              className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm ${ancla === tipo ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'}`}>
              {tipo === 'tema' ? 'Tema' : tipo === 'categoria' ? 'Categoría' : 'Formato'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="min-h-[55vh] flex-1 overflow-hidden rounded-[var(--radius)] border border-border/60 bg-background/30">
          <EscenaRamas grafo={filtrado} posiciones={posicionesVisibles} seleccionado={seleccionado}
            onSeleccionar={setSeleccionado} capasVisibles={seleccion.capa ?? []} />
        </div>
        <section className="rounded-[var(--radius)] border border-border/60 bg-card/60 p-4" aria-label="Nodos visibles">
          <p className="text-xs text-muted-foreground">{filtrado.nodos.size} de {indice.total} nodos visibles</p>
          <ul className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {Array.from(filtrado.nodos.values()).map((nodo) => (
              <li key={nodo.id}>
                <button type="button" onClick={() => setSeleccionado(nodo.id)} aria-pressed={seleccionado === nodo.id}
                  className="min-h-11 cursor-pointer rounded-full border border-border/50 px-3 text-sm text-foreground hover:bg-muted/50">
                  {nodo.titulo}
                </button>
              </li>
            ))}
          </ul>
          {elegido && (
            <p className="mt-3 text-sm text-foreground">
              {elegido.titulo} · {elegido.formato} · {elegido.alcance}
              <span className="text-muted-foreground"> · {elegido.tema ?? elegido.categoria ?? 'sin tema'}</span>
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

export default VisorRamas;
