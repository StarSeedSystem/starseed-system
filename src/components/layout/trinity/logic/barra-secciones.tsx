"use client";

/**
 * Barra de secciones del Centro de Control: pestañas de Radix (flechas, Inicio y Fin, foco que se
 * mueve de una en una) en un carril que se desliza con el dedo, con sombra donde hay más y la sección
 * activa siempre a la vista. Al final, fuera del carril, el botón que organiza las secciones.
 * Debe vivir dentro de un `Tabs.Root`.
 *
 * El gesto horizontal sobre este carril desplaza las pestañas y NO cierra el panel: el arrastre de la
 * cortina ignora los elementos con desplazamiento horizontal.
 */
import { useEffect, useRef } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBordesDeslizables } from "./use-bordes-deslizables";

export interface SeccionBarra {
  id: string;
  rotulo: string;
  icono: LucideIcon;
  /** Número sobre el icono (p. ej. alertas sin leer). */
  insignia?: number | null;
}

interface Props {
  secciones: SeccionBarra[];
  activa: string;
  editorAbierto: boolean;
  onAlternarEditor: () => void;
}

function sinMovimiento(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function BarraSecciones({ secciones, activa, editorAbierto, onAlternarEditor }: Props) {
  const carril = useRef<HTMLDivElement | null>(null);
  const { bordes, medir } = useBordesDeslizables(carril, [secciones.length]);

  // La pestaña activa siempre se ve entera (también cuando cambia desde fuera: franja de grabación, evento).
  // Se desplaza solo el carril (no `scrollIntoView`, que también movería los contenedores de arriba).
  useEffect(() => {
    const carrilEl = carril.current;
    const pestana = carrilEl?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!carrilEl || !pestana) return;
    const left = Math.max(0, pestana.offsetLeft - (carrilEl.clientWidth - pestana.offsetWidth) / 2);
    if (typeof carrilEl.scrollTo === "function") carrilEl.scrollTo({ left, behavior: sinMovimiento() ? "auto" : "smooth" });
    else carrilEl.scrollLeft = left;
  }, [activa, secciones.length]);

  return (
    <div className="flex shrink-0 items-center gap-1 px-3 pb-2 pt-3">
      <div className="relative min-w-0 flex-1">
        <TabsPrimitive.List
          ref={carril}
          aria-label="Secciones del Centro de Control"
          onScroll={medir}
          data-testid="barra-secciones"
          className="relative flex snap-x snap-proximity gap-1 overflow-x-auto overscroll-x-contain rounded-2xl border border-white/10 bg-black/35 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {secciones.map((s) => {
            const Icono = s.icono;
            return (
              <TabsPrimitive.Trigger
                key={s.id}
                value={s.id}
                data-seccion={s.id}
                className={cn(
                  "relative flex min-h-[56px] min-w-[68px] shrink-0 snap-center cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-2.5 text-amber-100/60 outline-none",
                  "transition-[background-color,border-color,color] duration-200 hover:bg-white/[0.06] hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/70",
                  "data-[state=active]:border-amber-300/50 data-[state=active]:bg-amber-400/20 data-[state=active]:text-amber-50 data-[state=active]:shadow-[0_0_16px_-6px_rgba(255,191,0,0.7)]",
                )}
              >
                <span className="relative">
                  <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
                  {s.insignia ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
                    >
                      {s.insignia > 9 ? "9+" : s.insignia}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] font-medium leading-none">{s.rotulo}</span>
                {s.insignia ? <span className="sr-only">{`, ${s.insignia} sin leer`}</span> : null}
              </TabsPrimitive.Trigger>
            );
          })}
        </TabsPrimitive.List>
        <div
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-2xl bg-gradient-to-r from-black/85 to-transparent transition-opacity duration-200", bordes.izquierda ? "opacity-100" : "opacity-0")}
        />
        <div
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-2xl bg-gradient-to-l from-black/85 to-transparent transition-opacity duration-200", bordes.derecha ? "opacity-100" : "opacity-0")}
        />
      </div>

      <button
        type="button"
        onClick={onAlternarEditor}
        aria-pressed={editorAbierto}
        aria-label="Organizar las secciones"
        title="Reordenar u ocultar secciones"
        data-testid="boton-organizar"
        className={cn(
          "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-amber-300/70",
          editorAbierto ? "border-amber-300/50 bg-amber-400/20 text-amber-50" : "border-transparent text-amber-100/60 hover:bg-white/10 hover:text-amber-50",
        )}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
