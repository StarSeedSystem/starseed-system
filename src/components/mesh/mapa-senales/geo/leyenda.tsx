"use client";

import { leyendaDe, CAPAS_MAPA, type CapaId } from "@/lib/senales/geo/capas";

export function Leyenda({ capa, className }: { capa: CapaId; className?: string }) {
  const items = leyendaDe(capa);
  const nombre = CAPAS_MAPA.find((c) => c.id === capa)?.etiqueta ?? "";
  return (
    <div className={className} data-testid="leyenda" aria-label={`Leyenda de la capa ${nombre}`}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">{nombre}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={i.etiqueta} className="flex items-center gap-1.5 text-[11px] text-white/80">
            <span className="size-2.5 shrink-0 rounded-full" style={i.hueco ? { border: `2px solid ${i.color}` } : { background: i.color }} aria-hidden />
            {i.etiqueta}
          </li>
        ))}
      </ul>
    </div>
  );
}
