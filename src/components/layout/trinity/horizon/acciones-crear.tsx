"use client";

/**
 * «Crear»: el Lienzo Universal como entrada principal y una rejilla de acciones rápidas (icono + texto corto).
 * Cada entrada abre su destino real (ver `datos.ts`): una ruta del OS o el evento global del Editor y la Fragua.
 */
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCIONES_CREAR, LIENZO_UNIVERSAL, type AccionCrear } from "./datos";

interface Props {
  ir: (href: string) => void;
  abrirEditor: () => void;
  abrirFragua: () => void;
}

export function AccionesCrear({ ir, abrirEditor, abrirFragua }: Props) {
  const lanzar = (a: AccionCrear) => {
    if (a.destino.tipo === "editor") abrirEditor();
    else if (a.destino.tipo === "fragua") abrirFragua();
    else ir(a.destino.href);
  };
  const Lienzo = LIENZO_UNIVERSAL.icono;

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => lanzar(LIENZO_UNIVERSAL)}
        className="group relative flex min-h-[72px] w-full cursor-pointer items-center gap-3 overflow-hidden rounded-3xl border border-emerald-300/35 bg-gradient-to-br from-emerald-500/25 via-emerald-600/10 to-teal-700/20 p-3.5 text-left outline-none transition-[border-color,background-color,transform] duration-200 hover:border-lime-300/60 hover:from-emerald-500/35 focus-visible:ring-2 focus-visible:ring-lime-300/70 motion-safe:active:scale-[0.99]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-400/20 text-lime-200 shadow-[0_0_18px_rgba(16,185,129,0.4)] transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none">
          <Lienzo className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-headline text-base font-semibold uppercase tracking-wider text-emerald-50">{LIENZO_UNIVERSAL.rotulo}</span>
          <span className="mt-0.5 block text-xs leading-snug text-emerald-100/65">{LIENZO_UNIVERSAL.sub}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-200/60 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
      </button>

      <ul className="grid grid-cols-2 gap-2" aria-label="Acciones rápidas de creación">
        {ACCIONES_CREAR.map((a) => {
          const Icono = a.icono;
          const violeta = a.destino.tipo === "editor" || a.destino.tipo === "fragua";
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => lanzar(a)}
                className={cn(
                  "group flex min-h-[92px] w-full cursor-pointer flex-col items-start gap-2 rounded-2xl border p-2.5 text-left outline-none transition-[border-color,background-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-lime-300/70 motion-safe:active:scale-[0.98]",
                  violeta
                    ? "border-violet-400/30 bg-violet-500/[0.08] hover:border-violet-300/60 hover:bg-violet-500/[0.16]"
                    : "border-emerald-400/20 bg-emerald-500/[0.05] hover:border-emerald-300/50 hover:bg-emerald-500/[0.12]",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none",
                    violeta ? "bg-violet-400/15 text-violet-200" : "bg-emerald-400/15 text-emerald-300",
                  )}
                >
                  <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-tight text-emerald-50">{a.rotulo}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-emerald-100/55">{a.sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
