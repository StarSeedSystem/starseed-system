'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { FACETAS_TEXTO, type FacetaTexto, type IndiceFacetas, type SeleccionFacetas,
  type Taxonomia, type CampoTaxonomia } from '@/lib/ramas4d/facetas';

const NOMBRES: Record<FacetaTexto, string> = {
  tema: 'Tema', categoria: 'Categoría', etiquetas: 'Etiquetas', tipo: 'Tipo', formato: 'Formato',
  alcance: 'Alcance', dueno: 'Dueño', sistema: 'Sistema', capa: 'Capa', estado: 'Estado',
};

export interface AccionTaxonomia {
  campo: CampoTaxonomia;
  accion: 'crear' | 'renombrar' | 'fusionar';
  valor: string;
  destino?: string;
}

export interface ControlesFacetasProps {
  indice: IndiceFacetas;
  seleccion: SeleccionFacetas;
  onSeleccion: (seleccion: SeleccionFacetas) => void;
  taxonomia?: Taxonomia;
  onTaxonomia?: (accion: AccionTaxonomia) => void;
}

export function ControlesFacetas({ indice, seleccion, onSeleccion, taxonomia, onTaxonomia }: ControlesFacetasProps) {
  const [faceta, setFaceta] = useState<FacetaTexto>('tema');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const editable = faceta === 'tema' || faceta === 'categoria' || faceta === 'etiquetas';
  const valores = useMemo(() => Array.from(indice.porFaceta.get(faceta)?.entries() ?? [])
    .filter(([valor]) => valor.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase()))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [indice, faceta, busqueda]);

  function alternar(valor: string) {
    const actuales = seleccion[faceta] ?? [];
    const siguientes = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
    onSeleccion({ ...seleccion, [faceta]: siguientes });
  }

  function ejecutar(accion: AccionTaxonomia['accion']) {
    if (!onTaxonomia || !editable) return;
    const campo = faceta as CampoTaxonomia;
    if (accion === 'crear' && nuevo.trim()) onTaxonomia({ campo, accion, valor: nuevo.trim() });
    if (accion === 'renombrar' && origen && destino.trim()) onTaxonomia({ campo, accion, valor: origen, destino: destino.trim() });
    if (accion === 'fusionar' && origen && destino.trim()) onTaxonomia({ campo, accion, valor: origen, destino: destino.trim() });
  }

  return (
    <aside className="flex h-full w-full flex-col gap-5 overflow-y-auto rounded-[var(--radius)] border border-border/60 bg-card/70 p-5 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-foreground">Organización por facetas</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Faceta a organizar">
        {FACETAS_TEXTO.map((clave) => (
          <button key={clave} type="button" onClick={() => setFaceta(clave)} aria-pressed={faceta === clave}
            className={`min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-colors duration-200 ${faceta === clave ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'}`}>
            {NOMBRES[clave]}
          </button>
        ))}
      </div>
      <label className="relative block">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar valores de la faceta" placeholder="Buscar valores de la faceta"
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border/60 bg-background/70 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50" />
      </label>
      <p className="text-xs text-muted-foreground">
        {seleccion[faceta]?.length
          ? `${seleccion[faceta].length} ${NOMBRES[faceta].toLocaleLowerCase()} seleccionadas`
          : 'Selecciona una o varias opciones para filtrar el universo.'}
      </p>
      <ul className="flex flex-col gap-2">
        {valores.length === 0 && <li className="rounded-[var(--radius-sm)] border border-border/50 p-3 text-sm text-muted-foreground">No hay valores con esa búsqueda.</li>}
        {valores.map(([valor, cuenta]) => {
          const activo = (seleccion[faceta] ?? []).includes(valor);
          return (
            <li key={valor}>
              <button type="button" onClick={() => alternar(valor)} aria-pressed={activo}
                className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-3 text-left text-sm transition-colors duration-200 ${activo ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border/50 bg-background/40 text-foreground hover:bg-muted/50'}`}>
                <span className="truncate">{valor}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{cuenta}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {editable && onTaxonomia && (
        <section className="flex flex-col gap-2 border-t border-border/50 pt-4" aria-label="Taxonomía propia">
          <h3 className="text-sm font-medium text-foreground">Tu taxonomía de {NOMBRES[faceta].toLocaleLowerCase()}</h3>
          <div className="flex flex-wrap gap-2">
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label={`Nuevo ${NOMBRES[faceta]}`}
              placeholder={`Nuevo ${NOMBRES[faceta].toLocaleLowerCase()}`}
              className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border/60 bg-background/70 px-3 text-sm text-foreground" />
            <button type="button" onClick={() => ejecutar('crear')} disabled={!nuevo.trim()}
              className="min-h-11 cursor-pointer rounded-full border border-primary/40 px-4 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">Crear</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label={`${NOMBRES[faceta]} existente`}
              className="h-11 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-sm)] border border-border/60 bg-background/70 px-2 text-sm text-foreground">
              <option value="">Elige una opción</option>
              {(taxonomia?.[faceta as CampoTaxonomia] ?? []).map((valor) => <option key={valor} value={valor}>{valor}</option>)}
            </select>
            <input value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Nombre de destino" placeholder="Nombre de destino"
              className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border/60 bg-background/70 px-3 text-sm text-foreground" />
            <button type="button" onClick={() => ejecutar('renombrar')} disabled={!origen || !destino.trim()}
              className="min-h-11 cursor-pointer rounded-full border border-border/60 px-4 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">Renombrar</button>
            <button type="button" onClick={() => ejecutar('fusionar')} disabled={!origen || !destino.trim()}
              className="min-h-11 cursor-pointer rounded-full border border-border/60 px-4 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50">Fusionar</button>
          </div>
        </section>
      )}
    </aside>
  );
}

export default ControlesFacetas;
