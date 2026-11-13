"use client";

/**
 * Chats de Genesis · la hoja común (GEN1113D, ampliada en GEN1114F): abajo en móvil, centrada en
 * pantallas grandes, o a pantalla completa por debajo de `sm` cuando se pide (`completa`).
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useReservaFlotantes } from "./reserva-flotantes";

/**
 * Hoja de opciones: abajo en móvil, centrada en pantallas grandes (mismo aire que MenuListaMovil).
 * GEN1114F: `completa` la abre a pantalla completa por debajo de `sm` (Información del chat), y su
 * lista y su pie dejan libre el carril de los botones flotantes (`useReservaFlotantes`).
 */
export function Hoja({ titulo, abierta, onCerrar, children, pie, completa = false }: { titulo: string; abierta: boolean; onCerrar: () => void; children: ReactNode; pie?: ReactNode; completa?: boolean }) {
    const idTitulo = useId();
    if (!abierta || typeof document === "undefined") return null;
    return createPortal(
        <HojaAbierta idTitulo={idTitulo} titulo={titulo} onCerrar={onCerrar} pie={pie} completa={completa}>{children}</HojaAbierta>,
        document.body,
    );
}

function HojaAbierta({ idTitulo, titulo, onCerrar, children, pie, completa }: { idTitulo: string; titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode; completa: boolean }) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const reserva = useReservaFlotantes(panelRef);
    useEffect(() => {
        const alTeclado = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        window.addEventListener("keydown", alTeclado);
        return () => window.removeEventListener("keydown", alTeclado);
    }, [onCerrar]);
    const libre = reserva > 0 ? { paddingRight: reserva } : undefined;
    return (
        <div className={cn("fixed inset-0 z-[95] flex justify-center sm:items-center", completa ? "items-stretch" : "items-end")} role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
            <button type="button" aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/60" onClick={onCerrar} />
            <div
                ref={panelRef}
                data-testid="hoja"
                data-completa={completa ? "si" : undefined}
                className={cn(
                    "relative z-10 flex w-full max-w-md flex-col overflow-hidden border border-white/12 bg-[#0a0e1a] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[82dvh] sm:rounded-2xl",
                    completa ? "max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)]" : "max-h-[82dvh] rounded-t-2xl",
                )}
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <span id={idTitulo} className="min-w-0 break-words text-sm font-semibold text-white">{titulo}</span>
                    <button type="button" onClick={onCerrar} aria-label="Cerrar la lista" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/10 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white">
                        <X className="size-4" />
                    </button>
                </div>
                <div data-testid="hoja-cuerpo" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" style={libre}>{children}</div>
                {pie ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 px-4 py-3" style={libre}>{pie}</div> : null}
            </div>
        </div>
    );
}
