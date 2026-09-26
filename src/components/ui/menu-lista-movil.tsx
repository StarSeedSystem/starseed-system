"use client";

/**
 * MenuListaMovil — en pantallas chicas, una fila de muchas pestañas que hay que arrastrar se
 * sustituye por UN botón con la opción actual que abre la lista completa (2026-09-26).
 *
 * Alex: «los botones del menú superior son demasiados como para que sean arrastrables,
 * entonces mejor que sea un menú con los botones completos en lista con un diseño
 * proporcional agradable». La lista es una hoja inferior (se alcanza con el pulgar), con el
 * nombre COMPLETO de cada opción, su icono y una línea de ayuda; se cierra al elegir, al tocar
 * fuera, con Escape o con su botón. Va por encima del OmniDock (z-[95]).
 *
 * Solo pinta el botón: quien lo usa decide cuándo se ve (p. ej. `lg:hidden`) y deja su fila de
 * pestañas de siempre para pantallas grandes.
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface OpcionMenuLista {
    id: string;
    label: string;
    icon?: LucideIcon;
    /** Línea corta de ayuda bajo el nombre. */
    hint?: string;
    /** Clase de color del icono (p. ej. "text-emerald-300"). */
    accent?: string;
    /** Número o texto pequeño a la derecha (avisos). */
    badge?: string | number;
}

export interface MenuListaMovilProps {
    opciones: readonly OpcionMenuLista[];
    valor: string;
    onCambiar: (id: string) => void;
    /** Título de la hoja (p. ej. «Secciones de Astraura»). */
    titulo: string;
    className?: string;
    /** Texto accesible del botón; por defecto «<titulo>: <opción actual>». */
    ariaLabel?: string;
}

export function MenuListaMovil({ opciones, valor, onCambiar, titulo, className, ariaLabel }: MenuListaMovilProps) {
    const [abierto, setAbierto] = useState(false);
    const idTitulo = useId();
    const listaRef = useRef<HTMLUListElement>(null);
    const actual = opciones.find((o) => o.id === valor) ?? opciones[0];
    const Icono = actual?.icon;

    useEffect(() => {
        if (!abierto) return;
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAbierto(false);
        };
        window.addEventListener("keydown", alTeclado);
        // La opción activa queda a la vista al abrir, aunque la lista sea larga.
        const activa = listaRef.current?.querySelector<HTMLElement>("[aria-current='true']");
        activa?.scrollIntoView?.({ block: "center" });
        activa?.focus?.({ preventScroll: true });
        return () => window.removeEventListener("keydown", alTeclado);
    }, [abierto]);

    if (!actual) return null;

    const hoja =
        abierto && typeof document !== "undefined"
            ? createPortal(
                  <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
                      <button
                          type="button"
                          aria-label="Cerrar"
                          className="absolute inset-0 cursor-default bg-black/60"
                          onClick={() => setAbierto(false)}
                      />
                      <div className="relative z-10 flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/12 bg-[#0a0e1a]/97 shadow-2xl sm:rounded-2xl pb-[env(safe-area-inset-bottom)]">
                          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                              <span id={idTitulo} className="text-sm font-semibold text-white">
                                  {titulo}
                              </span>
                              <button
                                  type="button"
                                  onClick={() => setAbierto(false)}
                                  aria-label="Cerrar la lista"
                                  className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/10 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                              >
                                  <X className="size-4" />
                              </button>
                          </div>
                          <ul ref={listaRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                              {opciones.map((o) => {
                                  const Ic = o.icon;
                                  const activa = o.id === actual.id;
                                  return (
                                      <li key={o.id}>
                                          <button
                                              type="button"
                                              aria-current={activa ? "true" : undefined}
                                              onClick={() => {
                                                  setAbierto(false);
                                                  if (!activa) onCambiar(o.id);
                                              }}
                                              className={cn(
                                                  "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
                                                  activa ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white",
                                              )}
                                          >
                                              {Ic && (
                                                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03]">
                                                      <Ic className={cn("size-4", o.accent ?? "text-white/70")} />
                                                  </span>
                                              )}
                                              <span className="min-w-0 flex-1">
                                                  <span className="block text-[14px] font-medium leading-snug">{o.label}</span>
                                                  {o.hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-white/45">{o.hint}</span>}
                                              </span>
                                              {o.badge != null && o.badge !== "" && (
                                                  <span className="shrink-0 rounded-full bg-rose-500/90 px-1.5 text-[10px] font-semibold text-white">{o.badge}</span>
                                              )}
                                              {activa && <Check className="size-4 shrink-0 text-cyan-300" aria-hidden />}
                                          </button>
                                      </li>
                                  );
                              })}
                          </ul>
                      </div>
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                type="button"
                onClick={() => setAbierto(true)}
                aria-haspopup="dialog"
                aria-expanded={abierto}
                aria-label={ariaLabel ?? `${titulo}: ${actual.label}`}
                className={cn(
                    "flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-left text-white transition-colors duration-200 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
                    className,
                )}
            >
                {Icono && <Icono className={cn("size-4 shrink-0", actual.accent ?? "text-white/70")} />}
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{actual.label}</span>
                <span className="shrink-0 text-[11px] text-white/40">{opciones.length}</span>
                <ChevronDown className="size-4 shrink-0 text-white/55" aria-hidden />
            </button>
            {hoja}
        </>
    );
}
