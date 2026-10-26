"use client";

/**
 * Fila de acceso: icono, título, una línea de apoyo y una flecha. Toda la fila es el botón (≥ 56 px).
 * Sirve para ir a otra sección, abrir una ventana o saltar a una página del OS.
 */
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icono: LucideIcon;
  titulo: string;
  sub?: ReactNode;
  onClick: () => void;
  /** Nombre accesible si ha de ser más explícito que el título. */
  etiqueta?: string;
  titleAttr?: string;
  testId?: string;
  className?: string;
}

export function FilaAcceso({ icono: Icono, titulo, sub, onClick, etiqueta, titleAttr, testId, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={titleAttr}
      data-testid={testId}
      className={cn(
        "group flex min-h-[56px] w-full min-w-0 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left outline-none",
        "transition-[border-color,background-color,transform] duration-200 hover:border-amber-300/40 hover:bg-amber-400/[0.08] focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-safe:active:scale-[0.985]",
        className,
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-amber-100/80 transition-colors duration-200 group-hover:text-amber-100">
        <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight text-amber-50">{titulo}</span>
        {sub && <span className="mt-0.5 block truncate text-[11px] leading-tight text-amber-100/60">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-amber-200/50 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </button>
  );
}
