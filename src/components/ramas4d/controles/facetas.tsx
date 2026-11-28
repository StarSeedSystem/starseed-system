'use client';

/**
 * Panel de facetas del visor Ramas 4D (MV1125ZA).
 * Recuentos reales del grafo, búsqueda y selección múltiple por faceta.
 * Solo tokens del tema: ningún color suelto.
 */

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import {
  CLAVES_FACETA,
  anadirValor,
  fusionarValores,
  indiceFacetas,
  renombrarValor,
  type ClaveFaceta,
  type ClaveTaxonomia,
  type SeleccionFacetas,
  type Taxonomia,
} from '@/lib/ramas4d/facetas';

const CAMPOS_TAXONOMIA: readonly { clave: ClaveTaxonomia; rotulo: string }[] = [
  { clave: 'temas', rotulo: 'Temas' },
  { clave: 'categorias', rotulo: 'Categorías' },
  { clave: 'etiquetas', rotulo: 'Etiquetas' },
];

const ROTULOS: Record<ClaveFaceta, string> = {
  tema: 'Temas', categoria: 'Categorías', etiqueta: 'Etiquetas', tipo: 'Tipos',
  formato: 'Formatos', alcance: 'Alcance', dueno: 'Dueño', sistema: 'Sistema',
};

export interface ControlesFacetasProps {
  grafo: Grafo4D;
  seleccion: SeleccionFacetas;
  onCambiar: (seleccion: SeleccionFacetas) => void;
  taxonomia: Taxonomia;
  onTaxonomia: (taxonomia: Taxonomia) => void;
}

export function ControlesFacetas({ grafo, seleccion, onCambiar, taxonomia, onTaxonomia }: ControlesFacetasProps) {
  const [busqueda, setBusqueda] = useState('');
  const [campo, setCampo] = useState<ClaveTaxonomia>('temas');
  const [nuevo, setNuevo] = useState('');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const indice = useMemo(() => indiceFacetas(grafo), [grafo]);
  const consulta = busqueda.trim().toLowerCase();

  const crear = () => {
    if (!nuevo.trim()) return;
    onTaxonomia(anadirValor(taxonomia, campo, nuevo));
    setNuevo('');
  };

  const renombrar = () => {
    if (!origen || !destino.trim()) return;
    onTaxonomia(renombrarValor(taxonomia, campo, origen, destino));
    setDestino('');
  };

  const fusionar = () => {
    if (!origen || !destino.trim()) return;
    onTaxonomia(fusionarValores(taxonomia, campo, origen, destino));
    setDestino('');
  };

  const alternar = (faceta: ClaveFaceta, valor: string) => {
    const actuales = seleccion[faceta] ?? [];
    const siguientes = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
    const nueva: SeleccionFacetas = { ...seleccion };
    if (siguientes.length > 0) nueva[faceta] = siguientes;
    else delete nueva[faceta];
    onCambiar(nueva);
  };

  const limpiar = () => { setBusqueda(''); onCambiar({}); };
  const activos = CLAVES_FACETA.reduce((total, faceta) => total + (seleccion[faceta]?.length ?? 0), 0);

  return (
    <section aria-label="Facetas del universo" className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-border bg-card/80 p-3 text-card-foreground backdrop-blur">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Organizar por facetas</h2>
        {activos > 0 && (
          <button type="button" onClick={limpiar} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted">
            <X size={12} aria-hidden="true" /> Limpiar {activos}
          </button>
        )}
      </header>
      <label className="relative flex items-center">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2 text-muted-foreground" />
        <span className="sr-only">Buscar en las facetas</span>
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar tema, categoría, etiqueta…"
          className="w-full rounded-xl border border-border bg-background py-1.5 pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {CLAVES_FACETA.map((faceta) => {
          const valores = indice[faceta].filter((valor) => !consulta || valor.valor.toLowerCase().includes(consulta));
          if (valores.length === 0) return null;
          return (
            <div key={faceta} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ROTULOS[faceta]}</p>
              <div className="flex flex-wrap gap-1.5">
                {valores.map(({ valor, cuenta }) => {
                  const activo = (seleccion[faceta] ?? []).includes(valor);
                  return (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => alternar(faceta, valor)}
                      className={`cursor-pointer rounded-full border px-2 py-1 text-xs transition-colors ${activo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/50 text-foreground hover:bg-muted'}`}
                    >
                      {valor} <span className="opacity-70">· {cuenta}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <details className="shrink-0 border-t border-border pt-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Tu taxonomía</summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="sr-only">Tipo de taxonomía</span>
            <select
              value={campo}
              onChange={(evento) => { setCampo(evento.target.value as ClaveTaxonomia); setOrigen(''); }}
              className="w-full cursor-pointer rounded-xl border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CAMPOS_TAXONOMIA.map(({ clave, rotulo }) => (
                <option key={clave} value={clave}>{rotulo}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              value={nuevo}
              onChange={(evento) => setNuevo(evento.target.value)}
              aria-label="Nuevo valor de la taxonomía"
              placeholder="Nuevo valor…"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="button" onClick={crear} disabled={!nuevo.trim()} className="cursor-pointer rounded-full border border-primary px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
              Crear
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={origen}
              onChange={(evento) => setOrigen(evento.target.value)}
              aria-label="Valor existente"
              className="min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Elige un valor…</option>
              {taxonomia[campo].map((valor) => (
                <option key={valor} value={valor}>{valor}</option>
              ))}
            </select>
            <input
              value={destino}
              onChange={(evento) => setDestino(evento.target.value)}
              aria-label="Valor de destino"
              placeholder="Destino…"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={renombrar} disabled={!origen || !destino.trim()} className="flex-1 cursor-pointer rounded-full border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
              Renombrar
            </button>
            <button type="button" onClick={fusionar} disabled={!origen || !destino.trim()} className="flex-1 cursor-pointer rounded-full border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
              Fusionar
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

export default ControlesFacetas;
