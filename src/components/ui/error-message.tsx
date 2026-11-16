"use client";

/**
 * ErrorMessage — aviso de error, aviso, éxito o información con contraste
 * garantizado y contexto. El color nunca va solo: cada tono lleva icono, rol
 * accesible y un texto que dice qué pasó y qué hacer. Fondo propio y opaco
 * para que se lea igual sobre cualquier tema o lienzo del OS.
 */

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type TonoAviso = "error" | "aviso" | "exito" | "info";

export interface EstiloTono {
  caja: string;
  titulo: string;
  detalle: string;
  icono: string;
}

/** Clases de alto contraste por tono (literales para que el JIT las vea). */
export function clasesTonoAviso(tono: TonoAviso): EstiloTono {
  return ESTILO_TONO[tono];
}

/** Rol accesible: los errores interrumpen; el resto se anuncia sin cortar. */
export function rolDeTonoAviso(tono: TonoAviso): "alert" | "status" {
  return tono === "error" ? "alert" : "status";
}

const ESTILO_TONO: Record<TonoAviso, EstiloTono> = {
  error: {
    caja: "border-red-400/60 bg-red-950/85 text-red-50",
    titulo: "text-red-50",
    detalle: "text-red-100/90",
    icono: "text-red-300",
  },
  aviso: {
    caja: "border-amber-400/60 bg-amber-950/85 text-amber-50",
    titulo: "text-amber-50",
    detalle: "text-amber-100/90",
    icono: "text-amber-300",
  },
  exito: {
    caja: "border-emerald-400/60 bg-emerald-950/85 text-emerald-50",
    titulo: "text-emerald-50",
    detalle: "text-emerald-100/90",
    icono: "text-emerald-300",
  },
  info: {
    caja: "border-cyan-400/50 bg-cyan-950/85 text-cyan-50",
    titulo: "text-cyan-50",
    detalle: "text-cyan-100/90",
    icono: "text-cyan-300",
  },
};

const ICONO: Record<TonoAviso, typeof AlertCircle> = {
  error: AlertCircle,
  aviso: AlertTriangle,
  exito: CheckCircle2,
  info: Info,
};

export interface ErrorMessageProps {
  tono?: TonoAviso;
  titulo: string;
  detalle?: string;
  arreglo?: ReactNode;
  className?: string;
  id?: string;
}

export function ErrorMessage(props: ErrorMessageProps) {
  const { tono = "error", titulo, detalle, arreglo, className, id } = props;
  const estilo = clasesTonoAviso(tono);
  const Icono = ICONO[tono];

  return (
    <div
      id={id}
      role={rolDeTonoAviso(tono)}
      aria-live={tono === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 shadow-[0_6px_24px_-12px_rgba(0,0,0,0.9)]",
        estilo.caja,
        className,
      )}
    >
      <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", estilo.icono)} aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className={cn("text-sm font-semibold leading-snug", estilo.titulo)}>{titulo}</p>
        {detalle && (
          <p className={cn("text-xs leading-relaxed", estilo.detalle)}>{detalle}</p>
        )}
        {arreglo && (
          <p className={cn("text-xs font-medium leading-relaxed", estilo.titulo)}>
            {arreglo}
          </p>
        )}
      </div>
    </div>
  );
}
