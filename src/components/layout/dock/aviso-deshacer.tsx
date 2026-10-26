"use client";

/**
 * AvisoDeshacer — «Perfil quitado del dock · Deshacer» (Ola 1025U · V1a).
 * Vive justo encima del dock (dentro de su columna), 8 s, y se anuncia a los lectores
 * de pantalla. Quitar un icono nunca es definitivo: aquí se devuelve a su sitio con un toque.
 */

import { useEffect } from "react";
import { Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const MS_AVISO_DESHACER = 8000;

export function AvisoDeshacer({
  clave, texto, alDeshacer, alCerrar, className,
}: {
  /** Cambia con cada aviso nuevo y reinicia la cuenta atrás. */
  clave: string;
  texto: string;
  alDeshacer: () => void;
  alCerrar: () => void;
  className?: string;
}) {
  useEffect(() => {
    const id = setTimeout(alCerrar, MS_AVISO_DESHACER);
    return () => clearTimeout(id);
    // `alCerrar` cambia en cada render del dock; la cuenta atrás solo se reinicia con un aviso nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-dock-deshacer=""
      className={cn(
        "pointer-events-auto mb-3 flex max-w-[calc(100vw-16px)] items-center gap-1 rounded-full border border-foreground/15 py-1 pl-4 pr-1",
        "glass-depth glass-edge bg-card/60 text-sm text-foreground backdrop-blur-3xl dark:bg-black/55 shadow-[0_10px_40px_rgba(0,0,0,0.35)]",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
        className,
      )}
    >
      <span className="min-w-0 truncate pr-2">{texto}</span>
      <button
        type="button"
        onClick={alDeshacer}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-cyan-300 outline-none transition-colors duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transition-none"
      >
        <Undo2 className="size-4" aria-hidden /> Deshacer
      </button>
      <button
        type="button"
        onClick={alCerrar}
        aria-label="Cerrar el aviso"
        className="grid size-11 cursor-pointer place-items-center rounded-full text-foreground/60 outline-none transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transition-none"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
