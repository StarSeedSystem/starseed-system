"use client";

/**
 * Componentes de grupos de casillas y atajos de banda (MAP1116B).
 * Puro cliente: sin red, sin `node:*`.
 */

import type { BandaConocida } from "@/lib/senales/espectro/bandas";
import { LISTA_BANDAS, etiquetaFrecuencia } from "@/lib/senales/espectro/bandas";

export function GrupoCasillas<T extends string>({
  titulo,
  opciones,
  etiquetas,
  seleccionadas,
  onToggle,
}: {
  titulo: string;
  opciones: readonly T[];
  etiquetas: Record<T, string>;
  seleccionadas: T[];
  onToggle: (valor: T, checked: boolean) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <label
            key={opcion}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.05]"
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-white/[0.02] text-primary focus:ring-primary"
              checked={seleccionadas.includes(opcion)}
              onChange={(e) => onToggle(opcion, e.target.checked)}
              aria-label={etiquetas[opcion]}
            />
            <span>{etiquetas[opcion]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AtajosBandas({ onSeleccionar }: { onSeleccionar: (banda: BandaConocida) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Atajos de banda</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Atajos de banda de frecuencia">
        {LISTA_BANDAS.map((banda) => (
          <button
            key={banda.id}
            type="button"
            onClick={() => onSeleccionar(banda)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/80 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white/[0.03]"
            aria-label={`${banda.etiqueta}: ${etiquetaFrecuencia(banda.inicioKhz)} – ${etiquetaFrecuencia(banda.finKhz)}`}
          >
            <span className="shrink-0">{banda.etiqueta}</span>
            <span className="text-[10px] text-white/40">{etiquetaFrecuencia(banda.inicioKhz)}–{etiquetaFrecuencia(banda.finKhz)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}