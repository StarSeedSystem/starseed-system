'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { podarGrafo, type Observador } from '@/lib/ramas4d/alcance';
import type { Grafo4D, Nodo } from '@/lib/ramas4d/modelo';
import type { PeticionDisposicion } from '@/lib/ramas4d/disposicion.worker';
import { useDisposicion } from '@/lib/ramas4d/use-disposicion';
import {
  anclasPorFaceta, aplicarAnclas, crearFaceta, filtrarPorFacetas, fusionarFacetas,
  indiceFacetas, renombrarFaceta, renombrarFacetasEnGrafo,
  type FiltroFacetas, type OrdenPorFaceta, type Taxonomia, type TipoTaxonomia,
} from '@/lib/ramas4d/facetas';
import { ControlesFacetas, type AccionTaxonomia } from './controles/facetas';

const EscenaRamas = dynamic(() => import('./escena-ramas'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full cursor-wait items-center justify-center text-sm text-muted-foreground">Preparando el universo…</div>,
});

export interface VisorRamasProps {
  grafo: Grafo4D;
  observador: Observador;
  onGrafo?: (grafo: Grafo4D) => void;
  onAbrir?: (nodo: Nodo) => void;
}

export default function VisorRamas({ grafo, observador, onGrafo, onAbrir }: VisorRamasProps) {
  const visible = useMemo(() => podarGrafo(grafo, observador), [grafo, observador]);
  const [filtro, setFiltro] = useState<FiltroFacetas>({});
  const [orden, setOrden] = useState<OrdenPorFaceta>('tema');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [taxonomia, setTaxonomia] = useState<Taxonomia>(() => {
    const indice = indiceFacetas(podarGrafo(grafo, observador), observador);
    return { temas: indice.tema.map((e) => e.valor), categorias: indice.categoria.map((e) => e.valor), etiquetas: indice.etiquetas.map((e) => e.valor) };
  });
  const filtrado = useMemo(() => filtrarPorFacetas(visible, filtro, observador), [visible, filtro, observador]);
  const indice = useMemo(() => indiceFacetas(visible, observador), [visible, observador]);
  const ids = useMemo(() => [...filtrado.nodos.keys()], [filtrado]);
  const { posiciones, calcular, calculando, error } = useDisposicion();

  useEffect(() => {
    const indicePorId = new Map(ids.map((id, i) => [id, i]));
    const peticion: PeticionDisposicion = {
      modo: 'fuerza',
      n: ids.length,
      aristas: filtrado.aristas
        .filter((a) => indicePorId.has(a.de) && indicePorId.has(a.a))
        .map((a) => ({ de: indicePorId.get(a.de)!, a: indicePorId.get(a.a)!, intensidad: a.intensidad })),
    };
    void calcular(peticion);
  }, [filtrado, ids, calcular]);

  const anclas = useMemo(() => anclasPorFaceta(filtrado, orden, observador), [filtrado, orden, observador]);
  const posicionesFinales = useMemo(() => posiciones ? aplicarAnclas(posiciones, ids, anclas) : null, [posiciones, ids, anclas]);
  const nodoSeleccionado = seleccionado ? filtrado.nodos.get(seleccionado) ?? null : null;

  function cambiarTaxonomia(tipo: TipoTaxonomia, anterior: string, nuevo: string, accion: AccionTaxonomia) {
    setTaxonomia((prev) => accion === 'crear' ? crearFaceta(prev, tipo, nuevo) : accion === 'renombrar' ? renombrarFaceta(prev, tipo, anterior, nuevo) : fusionarFacetas(prev, tipo, anterior, nuevo));
    if (accion !== 'crear') onGrafo?.(renombrarFacetasEnGrafo(grafo, tipo, anterior, nuevo));
  }

  return (
    <section aria-label="Visor de Ramas 4D" className="grid gap-4 p-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <ControlesFacetas indice={indice} filtro={filtro} onFiltro={setFiltro} taxonomia={taxonomia} onTaxonomia={cambiarTaxonomia} orden={orden} onOrden={setOrden} />
        <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
          {calculando ? 'Disponiendo el espacio…' : error ?? `${ids.length} nodos visibles · ${filtrado.aristas.length} conexiones`}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="h-[55vh] min-h-[24rem] overflow-hidden rounded-2xl border border-border/60 bg-background/60">
          <EscenaRamas grafo={filtrado} posiciones={posicionesFinales} seleccionado={seleccionado} onSeleccionar={setSeleccionado} onAbrir={onAbrir} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ul aria-label="Nodos visibles" className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-border/60 bg-card/50 p-3">
            {ids.length === 0 && <li className="text-sm text-muted-foreground">No hay nodos para estas facetas.</li>}
            {ids.map((id) => {
              const n = filtrado.nodos.get(id)!;
              return (
                <li key={id}>
                  <button type="button" aria-pressed={id === seleccionado} onClick={() => setSeleccionado(id)} className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-200 ${id === seleccionado ? 'border-primary bg-primary/10 text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}>
                    <span className="truncate">{n.titulo}</span><span className="shrink-0 text-xs text-muted-foreground">{n.formato}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-sm">
            {nodoSeleccionado ? (
              <>
                <h2 className="text-base font-semibold text-foreground">{nodoSeleccionado.titulo}</h2>
                <p className="mt-1 text-muted-foreground">{nodoSeleccionado.tema ?? 'Sin tema'} · {nodoSeleccionado.categoria ?? 'Sin categoría'} · {nodoSeleccionado.formato}</p>
                <p className="mt-2 break-all text-muted-foreground">{nodoSeleccionado.ref}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {nodoSeleccionado.etiquetas.map((etiqueta) => <span key={etiqueta} className="rounded-full border border-border/70 px-2 py-1 text-xs text-muted-foreground">{etiqueta}</span>)}
                </div>
                {onAbrir && <button type="button" onClick={() => onAbrir(nodoSeleccionado)} className="mt-3 cursor-pointer rounded-full border border-primary/60 px-3 py-1 text-xs text-foreground">Abrir nodo</button>}
              </>
            ) : <p className="text-muted-foreground">Selecciona un nodo para ver sus facetas.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
