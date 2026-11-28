'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  CLAVES_FACETA,
  buscarFacetas,
  type ClaveFaceta,
  type FiltroFacetas,
  type IndiceFacetas,
  type OrdenPorFaceta,
  type Taxonomia,
  type TipoTaxonomia,
} from '@/lib/ramas4d/facetas';

export type AccionTaxonomia = 'crear' | 'renombrar' | 'fusionar';

export interface ControlesFacetasProps {
  indice: IndiceFacetas;
  filtro: FiltroFacetas;
  onFiltro: (filtro: FiltroFacetas) => void;
  taxonomia: Taxonomia;
  onTaxonomia: (tipo: TipoTaxonomia, anterior: string, nuevo: string, accion: AccionTaxonomia) => void;
  orden: OrdenPorFaceta;
  onOrden: (orden: OrdenPorFaceta) => void;
}

const ETIQUETAS: Record<ClaveFaceta, string> = {
  tema: 'Tema', categoria: 'Categoría', etiquetas: 'Etiquetas', tipo: 'Tipo', formato: 'Formato',
  alcance: 'Alcance', dueno: 'Dueño', sistema: 'Sistema', capa: 'Capa', fecha: 'Fecha', estado: 'Estado',
};

export function ControlesFacetas({ indice, filtro, onFiltro, taxonomia, onTaxonomia, orden, onOrden }: ControlesFacetasProps) {
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<TipoTaxonomia>('tema');
  const [nombre, setNombre] = useState('');
  const [seleccionado, setSeleccionado] = useState('');
  const [destino, setDestino] = useState('');
  const visibles = useMemo(() => buscarFacetas(indice, busqueda), [indice, busqueda]);
  const lista = tipo === 'tema' ? taxonomia.temas : tipo === 'categoria' ? taxonomia.categorias : taxonomia.etiquetas;

  function alternar(clave: ClaveFaceta, valor: string) {
    const actuales = filtro.valores?.[clave] ?? [];
    const valores = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
    onFiltro({ ...filtro, valores: { ...filtro.valores, [clave]: valores } });
  }

  function aplicar(accion: AccionTaxonomia) {
    const anterior = accion === 'crear' ? '' : seleccionado;
    const nuevo = accion === 'fusionar' ? destino : nombre;
    if (accion !== 'crear' && !anterior) return;
    onTaxonomia(tipo, anterior, nuevo, accion);
    setNombre(''); setSeleccionado(''); setDestino('');
  }

  return (
    <aside aria-label="Organización por facetas" className="flex max-h-full w-full flex-col gap-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Organización por facetas</h2>
      <label className="relative block">
        <span className="sr-only">Buscar facetas</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); onFiltro({ ...filtro, busqueda: e.target.value }); }} placeholder="Buscar temas, etiquetas o formatos" className="w-full cursor-pointer rounded-xl border border-border/70 bg-background/80 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Ordenar el espacio
        <select value={orden} onChange={(e) => onOrden(e.target.value as OrdenPorFaceta)} className="cursor-pointer rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="tema">Un tema por región</option>
          <option value="categoria">Una categoría por anillo</option>
          <option value="formato">Un formato por forma</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CLAVES_FACETA.map((clave) => (
          <details key={clave} className="rounded-xl border border-border/50 bg-background/40 p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              {ETIQUETAS[clave]} <span className="text-muted-foreground">({visibles[clave].length})</span>
            </summary>
            <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {visibles[clave].map((entrada) => {
                const activo = (filtro.valores?.[clave] ?? []).includes(entrada.valor);
                return (
                  <button key={`${clave}-${entrada.valor}`} type="button" aria-pressed={activo} onClick={() => alternar(clave, entrada.valor)} className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-200 ${activo ? 'border-primary bg-primary/15 text-foreground' : 'border-border/70 text-muted-foreground hover:border-primary/60 hover:text-foreground'}`}>
                    {entrada.valor} <span className="text-muted-foreground">{entrada.recuento}</span>
                  </button>
                );
              })}
              {visibles[clave].length === 0 && <p className="text-xs text-muted-foreground">Sin resultados</p>}
            </div>
          </details>
        ))}
      </div>
      <details className="rounded-xl border border-border/50 bg-background/40 p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Mis temas, categorías y etiquetas</summary>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Tipo de taxonomía" value={tipo} onChange={(e) => { setTipo(e.target.value as TipoTaxonomia); setSeleccionado(''); }} className="cursor-pointer rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground">
            <option value="tema">Tema</option><option value="categoria">Categoría</option><option value="etiqueta">Etiqueta</option>
          </select>
          <label className="min-w-40 flex-1">
            <span className="sr-only">Nombre de la faceta</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la faceta" className="w-full cursor-pointer rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          </label>
          <button type="button" disabled={!nombre.trim()} onClick={() => aplicar('crear')} className="cursor-pointer rounded-full border border-primary/60 px-3 py-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50">Crear</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Faceta existente" value={seleccionado} onChange={(e) => setSeleccionado(e.target.value)} className="cursor-pointer rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground">
            <option value="">Selecciona una faceta</option>
            {lista.map((valor) => <option key={valor} value={valor}>{valor}</option>)}
          </select>
          <button type="button" disabled={!seleccionado || !nombre.trim()} onClick={() => aplicar('renombrar')} className="cursor-pointer rounded-full border border-border/70 px-3 py-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50">Renombrar</button>
          <select aria-label="Fusionar en" value={destino} onChange={(e) => setDestino(e.target.value)} className="cursor-pointer rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground">
            <option value="">Fusionar en…</option>
            {lista.filter((valor) => valor !== seleccionado).map((valor) => <option key={valor} value={valor}>{valor}</option>)}
          </select>
          <button type="button" disabled={!seleccionado || !destino} onClick={() => aplicar('fusionar')} className="cursor-pointer rounded-full border border-border/70 px-3 py-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50">Fusionar</button>
        </div>
      </details>
    </aside>
  );
}
