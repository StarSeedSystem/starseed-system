'use client';

/**
 * Panel de facetas del visor Ramas 4D (MV1125ZA).
 * Recuentos reales del grafo, búsqueda y selección múltiple por faceta.
 * Solo tokens del tema: ningún color suelto.
 */

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Grafo4D } from '@/lib/ramas4d/modelo';
import { CLAVES_FACETA, indiceFacetas, type ClaveFaceta, type SeleccionFacetas } from '@/lib/ramas4d/facetas';

const ROTULOS: Record<ClaveFaceta, string> = {
  tema: 'Temas', categoria: 'Categorías', etiqueta: 'Etiquetas', tipo: 'Tipos',
  formato: 'Formatos', alcance: 'Alcance', dueno: 'Dueño', sistema: 'Sistema',
};

export interface ControlesFacetasProps {
  grafo: Grafo4D;
  seleccion: SeleccionFacetas;
  onCambiar: (seleccion: SeleccionFacetas) => void;
}

export function ControlesFacetas({ grafo, seleccion, onCambiar }: ControlesFacetasProps) {
  const [busqueda, setBusqueda] = useState('');
  const indice = useMemo(() => indiceFacetas(grafo), [grafo]);
  const consulta = busqueda.trim().toLowerCase();

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
    </section>
  );
}

export default ControlesFacetas;
