"use client";

/**
 * Selector de una opción entre pocas (radiogroup): cada opción es una diana de 44 px con icono y
 * rótulo. Flechas ← → y ↑ ↓ cambian de opción (patrón de radio de WAI-ARIA).
 */
import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpcionSegmentada<T extends string> {
  id: T;
  rotulo: string;
  icono?: LucideIcon;
  /** Línea pequeña bajo el rótulo. */
  sub?: ReactNode;
  titulo?: string;
  /** Solo el icono a la vista (el rótulo queda para lectores de pantalla). */
  soloIcono?: boolean;
}

interface Props<T extends string> {
  etiqueta: string;
  valor: T;
  opciones: OpcionSegmentada<T>[];
  onCambio: (id: T) => void;
  className?: string;
  testId?: string;
}

export function Segmentado<T extends string>({ etiqueta, valor, opciones, onCambio, className, testId }: Props<T>) {
  const idGrupo = useId();
  const mover = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const siguiente = opciones[(indice + paso + opciones.length) % opciones.length];
    onCambio(siguiente.id);
    const grupo = e.currentTarget.parentElement;
    requestAnimationFrame(() => grupo?.querySelector<HTMLButtonElement>(`[data-opcion="${siguiente.id}"]`)?.focus());
  };
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      data-testid={testId}
      className={cn("grid gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((o, i) => {
        const Icono = o.icono;
        const elegida = o.id === valor;
        return (
          <button
            key={o.id}
            id={`${idGrupo}-${o.id}`}
            type="button"
            role="radio"
            aria-checked={elegida}
            tabIndex={elegida ? 0 : -1}
            data-opcion={o.id}
            title={o.titulo}
            onClick={() => onCambio(o.id)}
            onKeyDown={(e) => mover(e, i)}
            className={cn(
              "flex min-h-[48px] min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 outline-none",
              "transition-[background-color,border-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-safe:active:scale-[0.97]",
              elegida
                ? "border-amber-300/60 bg-amber-400/20 text-amber-50 shadow-[0_0_14px_-5px_rgba(255,191,0,0.6)]"
                : "border-transparent text-amber-100/70 hover:bg-white/[0.06] hover:text-amber-50",
            )}
          >
            {Icono && <Icono className="h-4 w-4" aria-hidden="true" />}
            <span className={cn("max-w-full truncate text-[12px] font-medium leading-tight", o.soloIcono && "sr-only")}>{o.rotulo}</span>
            {o.sub && <span className="max-w-full truncate text-[10px] leading-tight opacity-70">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
