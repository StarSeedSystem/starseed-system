"use client";
/**
 * Selector de modo de bots (Ola 1025U · U3): un grupo de opciones excluyentes («radiogroup») con objetivos de 44 px.
 * Lo usan el ajuste «Bots de IA», el filtro por publicación y el de cada entidad.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModoBots } from "@/lib/agentes-red/bloqueo-bots";

export interface OpcionModoBots {
  /** `null` = «seguir la regla de más arriba» (quita la regla propia). */
  valor: ModoBots | null;
  etiqueta: string;
  detalle?: string;
}

export function SelectorModoBots({
  etiquetaGrupo, valor, opciones, alCambiar,
}: {
  etiquetaGrupo: string;
  valor: ModoBots | null;
  opciones: readonly OpcionModoBots[];
  alCambiar: (v: ModoBots | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiquetaGrupo} className="flex flex-col gap-2">
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor ?? "heredar"}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => alCambiar(o.valor)}
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70",
              activa ? "border-[#007FFF]/60 bg-[#007FFF]/15 text-white" : "border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.08]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", activa ? "border-[#007FFF] bg-[#007FFF]" : "border-white/30")}
            >
              {activa && <Check className="size-3 text-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.etiqueta}</span>
              {o.detalle && <span className="block text-xs text-white/55">{o.detalle}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
