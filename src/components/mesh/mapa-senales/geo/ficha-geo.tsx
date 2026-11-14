"use client";

/**
 * Ficha de una marca: hoja inferior en el teléfono, panel lateral en pantalla ancha (MAP1114C).
 * Solo valores medidos, cada uno con su hora; lo que no se sabe dice «desconocido» y por qué.
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fichaDeMarca, DESCONOCIDO } from "@/lib/senales/geo/ficha-geo";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";

const ESTILO_ESTADO: Record<string, string> = {
  medido: "text-emerald-300",
  declarado: "text-sky-300",
  estimado: "text-amber-300",
  "no-medido": "text-white/50",
};
const ETIQUETA_ESTADO: Record<string, string> = { medido: "medido", declarado: "declarado", estimado: "estimado", "no-medido": "sin medir" };

export function FichaGeo({ marca, ahora, compacto, onCerrar }: { marca: MarcaGeo; ahora: number; compacto: boolean; onCerrar: () => void }) {
  const ficha = fichaDeMarca(marca, ahora);
  return (
    <aside
      role="dialog" aria-label={`Ficha de ${marca.nombre}`} data-testid="ficha-geo"
      className={cn(
        "absolute flex flex-col overflow-hidden border border-white/15 bg-[#0b1220]/95 text-white shadow-2xl backdrop-blur-xl",
        compacto ? "inset-x-0 bottom-0 z-[15] max-h-[78%] rounded-t-2xl" : "bottom-3 right-16 top-3 z-[9] w-[22rem] rounded-2xl",
      )}
    >
      {compacto && <div className="mx-auto mt-1.5 h-1 w-10 shrink-0 rounded-full bg-white/25" aria-hidden />}
      <header className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{ficha.titulo}</h3>
          <p className="truncate text-[11px] text-white/60">{ficha.subtitulo}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" className="cursor-pointer rounded-lg p-2 text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
        <p className="text-[11px] leading-snug text-white/65">{ficha.resumen}</p>
        {ficha.secciones.map((s) => (
          <section key={s.id}>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">{s.titulo}</h4>
            <dl className="space-y-1.5">
              {s.datos.map((d) => (
                <div key={d.etiqueta} className="rounded-lg bg-white/[0.04] px-2 py-1.5">
                  <dt className="flex items-center justify-between gap-2 text-[11px] text-white/60">
                    <span className="min-w-0 break-words">{d.etiqueta}</span>
                    <span className={cn("shrink-0 text-[10px]", ESTILO_ESTADO[d.estado])}>{ETIQUETA_ESTADO[d.estado]}</span>
                  </dt>
                  <dd className={cn("break-words text-[12px]", d.valor === DESCONOCIDO ? "italic text-white/50" : "text-white/90")}>{d.valor}</dd>
                  <dd className="break-words text-[10px] leading-snug text-white/45">{d.fuente}{d.nota ? ` — ${d.nota}` : ""}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  );
}
