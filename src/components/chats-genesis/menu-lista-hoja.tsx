"use client";

/**
 * Chats de Genesis · un botón con la opción actual que abre la lista COMPLETA (GEN1114F · 2026-11-13).
 * ─────────────────────────────────────────────────────────────────────────────
 * Mismo aspecto y mismas props que `MenuListaMovil` (ui), pero la lista va en la `Hoja` de Genesis,
 * que deja libre el carril de los botones flotantes: en la revisión del 13-11 una orbe tapaba la
 * primera fila de «Chats de Genesis». `MenuListaMovil` no se toca (es de todos); cuando gane esa
 * reserva, este archivo puede volver a usarlo sin cambiar a quien lo llama.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import type { MenuListaMovilProps } from "@/components/ui/menu-lista-movil";
import { cn } from "@/lib/utils";

import { Hoja } from "./hoja";

export function MenuListaHoja({ opciones, valor, onCambiar, titulo, className, ariaLabel }: MenuListaMovilProps) {
    const [abierto, setAbierto] = useState(false);
    const listaRef = useRef<HTMLUListElement | null>(null);
    const actual = opciones.find((o) => o.id === valor) ?? opciones[0];

    useEffect(() => {
        if (!abierto) return;
        // La opción activa queda a la vista al abrir, aunque la lista sea larga.
        const id = window.setTimeout(() => {
            const activa = listaRef.current?.querySelector<HTMLElement>("[aria-current='true']");
            activa?.scrollIntoView?.({ block: "center" });
            activa?.focus?.({ preventScroll: true });
        }, 0);
        return () => window.clearTimeout(id);
    }, [abierto]);

    if (!actual) return null;
    const Icono = actual.icon;

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
                {Icono ? <Icono className={cn("size-4 shrink-0", actual.accent ?? "text-white/70")} /> : null}
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{actual.label}</span>
                <span className="shrink-0 text-[11px] text-white/40">{opciones.length}</span>
                <ChevronDown className="size-4 shrink-0 text-white/55" aria-hidden />
            </button>
            <Hoja titulo={titulo} abierta={abierto} onCerrar={() => setAbierto(false)}>
                <ul ref={listaRef} className="flex flex-col">
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
                                    {Ic ? (
                                        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03]">
                                            <Ic className={cn("size-4", o.accent ?? "text-white/70")} />
                                        </span>
                                    ) : null}
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-[14px] font-medium leading-snug [overflow-wrap:anywhere]">{o.label}</span>
                                        {o.hint ? <span className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-white/45">{o.hint}</span> : null}
                                    </span>
                                    {o.badge != null && o.badge !== "" ? (
                                        <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-white/80">{o.badge}</span>
                                    ) : null}
                                    {activa ? <Check className="size-4 shrink-0 text-cyan-300" aria-hidden /> : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </Hoja>
        </>
    );
}
