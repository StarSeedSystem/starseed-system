"use client";

/**
 * Zona de publicación: los cuatro pilares de la red con su acento (política, educación, cultura, biblioteca),
 * los mismos que usa `/crear`. Cada uno abre el publicador en ese destino.
 */
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESTINOS_PUBLICACION } from "./datos";
import { Seccion } from "./seccion";

export function ZonaPublicacion({ ir }: { ir: (href: string) => void }) {
  return (
    <Seccion titulo="Zona de publicación" icono={Send}>
      <p className="mb-2.5 text-xs leading-snug text-emerald-100/55">Elige a qué sección de la red va tu publicación.</p>
      <ul className="grid grid-cols-2 gap-2" aria-label="Destinos de publicación">
        {DESTINOS_PUBLICACION.map((d) => {
          const Icono = d.icono;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => ir(d.href)}
                data-destino={d.id}
                className={cn(
                  "group flex min-h-[88px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 text-center outline-none transition-[border-color,background-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-lime-300/70 motion-safe:active:scale-[0.98]",
                  d.caja,
                )}
              >
                <span className={cn("grid h-10 w-10 place-items-center rounded-full transition-[transform,background-color] duration-200 group-hover:scale-105 motion-reduce:transition-none", d.disco)}>
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className={cn("text-sm font-medium leading-tight", d.texto)}>{d.rotulo}</span>
                <span className="text-[11px] leading-tight text-white/50">{d.sub}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}
