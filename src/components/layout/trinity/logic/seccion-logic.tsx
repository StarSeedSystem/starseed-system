"use client";

/**
 * Sección plegable del Centro de Control (cortina Logic · ámbar). Hermana de la `Seccion` de Horizon
 * con el acento ámbar y oro: cabecera de 44 px con icono, título y dato corto; el título es el botón
 * que pliega (aria-expanded vía Radix) y las acciones propias van FUERA de él para no anidar controles.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  titulo: string;
  icono: LucideIcon;
  /** Dato corto junto al título (p. ej. «5 de 6»). */
  insignia?: string;
  acciones?: ReactNode;
  abiertaPorDefecto?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}

export function SeccionLogic({ titulo, icono: Icono, insignia, acciones, abiertaPorDefecto = true, children, className, testId }: Props) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  return (
    <Collapsible open={abierta} onOpenChange={setAbierta} className={className} data-testid={testId}>
      <div className="flex items-center gap-1 border-b border-amber-300/15">
        <h3 className="m-0 flex min-w-0 flex-1">
          <CollapsibleTrigger className="group flex min-h-[44px] w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80 outline-none transition-colors duration-150 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-300/70">
            <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{titulo}</span>
            {insignia && (
              <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-amber-100/85">{insignia}</span>
            )}
            <ChevronDown
              className={cn("ml-auto h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none", abierta ? "rotate-0" : "-rotate-90")}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
        </h3>
        {acciones}
      </div>
      <CollapsibleContent className="pt-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">{children}</CollapsibleContent>
    </Collapsible>
  );
}
