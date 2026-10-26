"use client";

/**
 * Panel de cristal líquido del mundo (Ola 1025U · U1): panel lateral en pantallas anchas y hoja inferior
 * (bottom sheet) en el móvil. Ahí se abre la ficha de quien se elija. No es modal: la escena sigue a la vista
 * y se puede seguir mirando alrededor; se cierra con su botón, con Escape o al elegir otro.
 *
 * El foco pasa al panel al abrirse y vuelve a donde estaba al cerrarse.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface PanelCristalProps {
  titulo: string;
  /** Línea pequeña bajo el título (p. ej. «Bot de IA»). */
  subtitulo?: string;
  alCerrar: () => void;
  /** Nombre accesible del botón de cerrar. Por defecto el de la ficha; el panel de sueños pone el suyo. */
  etiquetaCerrar?: string;
  children: ReactNode;
}

export function PanelCristal({ titulo, subtitulo, alCerrar, etiquetaCerrar = "Cerrar la ficha", children }: PanelCristalProps) {
  const panel = useRef<HTMLElement>(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    const previo = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (previo && typeof previo.focus === "function" && previo.isConnected) previo.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar.current();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-label={titulo}
      tabIndex={-1}
      data-testid="panel-cristal"
      className={
        "pointer-events-auto absolute z-30 flex min-h-0 flex-col overflow-hidden border border-white/15 outline-none " +
        "bg-[rgba(8,12,24,0.72)] shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl " +
        // móvil: hoja inferior a todo lo ancho
        "inset-x-0 bottom-0 max-h-[78%] rounded-t-3xl " +
        // escritorio y tableta: panel a la derecha
        "sm:inset-y-3 sm:left-auto sm:right-3 sm:bottom-3 sm:max-h-none sm:w-[24rem] sm:max-w-[calc(100%-1.5rem)] sm:rounded-3xl " +
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      }
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" aria-hidden="true" />
      <header className="flex shrink-0 items-start justify-between gap-2 px-4 pb-2 pt-2 sm:pt-4">
        <div className="min-w-0">
          <h2 className="truncate font-headline text-lg font-bold uppercase tracking-wide text-white">{titulo}</h2>
          {subtitulo && <p className="truncate text-xs text-white/60">{subtitulo}</p>}
        </div>
        <button
          type="button"
          onClick={alCerrar}
          aria-label={etiquetaCerrar}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/8 text-white/80 transition duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </aside>
  );
}
