"use client";

/**
 * Sección plegable de la cortina Horizon: cabecera con icono, título y (opcional) acciones propias a la derecha,
 * y cuerpo que se pliega para ahorrar altura en el móvil. El título es el botón que pliega (aria-expanded vía
 * Radix); las acciones van FUERA de ese botón para no anidar controles.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  titulo: string;
  icono: LucideIcon;
  /** Dato corto junto al título (p. ej. el número de pizarras). */
  insignia?: string;
  /** Botones propios de la sección (a la derecha, siempre visibles). */
  acciones?: ReactNode;
  abiertaPorDefecto?: boolean;
  children: ReactNode;
  className?: string;
}

export function Seccion({ titulo, icono: Icono, insignia, acciones, abiertaPorDefecto = true, children, className }: Props) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  return (
    <Collapsible open={abierta} onOpenChange={setAbierta} className={className}>
      <div className="flex items-center gap-1 border-b border-emerald-400/15">
        <h3 className="m-0 flex min-w-0 flex-1">
          <CollapsibleTrigger
            className="group flex min-h-[44px] w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80 outline-none transition-colors duration-150 hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-lime-300/60"
          >
            <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{titulo}</span>
            {insignia && (
              <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-emerald-200/80">
                {insignia}
              </span>
            )}
            <ChevronDown
              className={cn("ml-auto h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none", abierta ? "rotate-0" : "-rotate-90")}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
        </h3>
        {acciones}
      </div>
      <CollapsibleContent className="pt-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
