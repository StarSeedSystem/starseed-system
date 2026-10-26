"use client";
/**
 * Ventana de la Protomolécula · rejilla de herramientas adaptativas. Las acciones (6–9) cambian con lo que hay
 * delante (`herramientas.ts`); aquí solo se pintan y se avisa de la que se pulsa.
 */
import { cn } from "@/lib/utils";
import { ICONO_HERRAMIENTA } from "./iconos";
import type { HerramientaVentana } from "./tipos";

export interface RejillaHerramientasProps {
  herramientas: HerramientaVentana[];
  alElegir: (h: HerramientaVentana) => void;
  deshabilitadas?: boolean;
}

const ETIQUETA_ACCION: Record<HerramientaVentana["accion"]["tipo"], string> = {
  rellenar: "Rellena la petición",
  plan: "Lanza un plan",
  lienzo: "Abre el lienzo",
  pestana: "Abre otra pestaña",
};

export function RejillaHerramientas({ herramientas, alElegir, deshabilitadas }: RejillaHerramientasProps) {
  return (
    <section aria-label="Herramientas para lo que tienes delante" data-testid="rejilla-herramientas">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">Herramientas · cambian con lo que tienes delante</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {herramientas.map((h) => {
          const Icono = ICONO_HERRAMIENTA[h.icono];
          return (
            <li key={h.id}>
              <button
                type="button"
                data-herramienta={h.id}
                disabled={deshabilitadas}
                title={`${h.ayuda} (${ETIQUETA_ACCION[h.accion.tipo]})`}
                onClick={() => alElegir(h)}
                className={cn(
                  "flex min-h-[64px] w-full cursor-pointer flex-col items-start justify-between gap-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-medium leading-tight",
                  "transition-colors duration-150 hover:border-[#00F0FF]/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
                )}
              >
                <Icono className="h-4 w-4 text-[#00F0FF]" aria-hidden="true" />
                <span>{h.nombre}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
