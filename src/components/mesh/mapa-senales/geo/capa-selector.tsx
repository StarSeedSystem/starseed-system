"use client";

import { cn } from "@/lib/utils";
import { CAPAS_MAPA, type CapaId } from "@/lib/senales/geo/capas";
import { FILTROS_GEO, type FiltroGeo } from "@/lib/senales/geo/marcas";

const base = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-200";
const activo = "border-sky-400/40 bg-sky-500/15 text-sky-100";
const reposo = "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white/90";
const apagado = "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/30";

/** Capas + filtro en UNA sola fila que se desplaza en horizontal (también en el teléfono). */
export function BarraCapasFiltro({ capa, onCapa, filtro, onFiltro }: { capa: CapaId; onCapa: (c: CapaId) => void; filtro: FiltroGeo; onFiltro: (f: FiltroGeo) => void }) {
  return (
    <div role="toolbar" aria-label="Capas y filtro del mapa" data-testid="barra-capas" className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {CAPAS_MAPA.map((c) => {
        const libre = c.fase === 1;
        return (
          <button
            key={c.id} type="button" disabled={!libre} aria-pressed={libre && capa === c.id}
            title={libre ? c.descripcion : `${c.descripcion} · próximamente`}
            onClick={() => onCapa(c.id)}
            className={cn(base, libre ? "cursor-pointer" : "", !libre ? apagado : capa === c.id ? activo : reposo)}
          >
            {c.etiqueta}{!libre && <span className="text-[10px] opacity-80">· próximamente</span>}
          </button>
        );
      })}
      <span className="mx-1 h-5 w-px shrink-0 bg-white/15" aria-hidden />
      {FILTROS_GEO.map((f) => {
        const libre = f.fase === 1;
        return (
          <button
            key={f.id} type="button" disabled={!libre} aria-pressed={libre && filtro === f.id}
            onClick={() => onFiltro(f.id)}
            className={cn(base, libre ? "cursor-pointer" : "", !libre ? apagado : filtro === f.id ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : reposo)}
          >
            {f.etiqueta}{!libre && <span className="text-[10px] opacity-80">· próximamente</span>}
          </button>
        );
      })}
    </div>
  );
}
