"use client";

/**
 * Píldora de acceso rápido con estado: icono, rótulo y, debajo, el estado en palabras («Oscuro»,
 * «Grabando»…). Si `activa` está definido es un interruptor (aria-pressed) y el estado se ve por
 * color Y por texto; sin `activa` es un acceso (abre algo). Mínimo 56 px de alto: dianas de 44 px de sobra. El texto pasa a una segunda línea antes que cortarse (el panel mide 331 px en un móvil de 360).
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TonoPildora = "ambar" | "rojo";

interface Props {
  icono: LucideIcon;
  etiqueta: string;
  estado: string;
  /** Definido = interruptor (encendido/apagado): se anuncia como pulsado o no pulsado. */
  activa?: boolean;
  /** Solo el aspecto «encendido» (p. ej. hay una grabación en curso) en un acceso que NO es un interruptor. */
  resaltada?: boolean;
  ocupada?: boolean;
  deshabilitada?: boolean;
  tono?: TonoPildora;
  onClick?: () => void;
  titulo?: string;
  testId?: string;
  /** Detalle a la derecha del estado (p. ej. un cronómetro). */
  extra?: ReactNode;
}

const ENCENDIDA: Record<TonoPildora, string> = {
  ambar: "border-amber-300/60 bg-gradient-to-br from-amber-400/25 via-amber-500/10 to-yellow-700/15 shadow-[0_0_18px_-6px_rgba(255,191,0,0.55)]",
  rojo: "border-red-400/70 bg-gradient-to-br from-red-500/30 via-red-600/10 to-red-900/20 shadow-[0_0_18px_-6px_rgba(220,20,60,0.6)]",
};
const ICONO_ENCENDIDO: Record<TonoPildora, string> = {
  ambar: "bg-amber-300/25 text-amber-100",
  rojo: "bg-red-400/25 text-red-100",
};
const PUNTO: Record<TonoPildora, string> = {
  ambar: "bg-amber-300 shadow-[0_0_8px_#FFBF00]",
  rojo: "bg-red-400 shadow-[0_0_8px_#DC143C] motion-safe:animate-pulse",
};

export function PildoraEstado({ icono: Icono, etiqueta, estado, activa, resaltada, ocupada, deshabilitada, tono = "ambar", onClick, titulo, testId, extra }: Props) {
  const esInterruptor = activa !== undefined;
  const encendida = activa === true || resaltada === true;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      aria-pressed={esInterruptor ? encendida : undefined}
      aria-busy={ocupada || undefined}
      title={titulo}
      data-testid={testId}
      className={cn(
        "group relative flex min-h-[56px] w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left outline-none",
        "transition-[border-color,background-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-safe:active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        encendida ? ENCENDIDA[tono] : "border-white/10 bg-white/[0.04] hover:border-amber-300/40 hover:bg-amber-400/[0.08]",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-200",
          encendida ? ICONO_ENCENDIDO[tono] : "bg-white/[0.07] text-amber-100/75 group-hover:text-amber-100",
        )}
      >
        <Icono className={cn("h-[18px] w-[18px]", ocupada && "motion-safe:animate-pulse")} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[13px] font-medium leading-tight text-amber-50">{etiqueta}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-tight text-amber-100/65">
          <span className="min-w-0 break-words">{estado}</span>
          {extra}
        </span>
      </span>
      {encendida && <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", PUNTO[tono])} />}
    </button>
  );
}
