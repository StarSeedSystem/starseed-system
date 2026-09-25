"use client";

/**
 * Pestañas de «Mi Puente de Mando» (role=tablist/tab/tabpanel).
 * ─────────────────────────────────────────────────────────────────────────────
 * Mismo aspecto que `SectionTabs` (el patrón único de pestañas del OS: filas
 * que se reparten en vez de un carril oculto), pero con lo que a ese le falta
 * para lectores de pantalla: cada pestaña apunta a su panel (`aria-controls`)
 * y el panel a su pestaña (`aria-labelledby`). Teclado: ← → cambian de página,
 * Inicio/Fin van a la primera/última.
 */

import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { IdPagina } from "@/lib/mi-mando/paginas";

export interface PestanaItem {
    id: IdPagina;
    etiqueta: string;
    icono: LucideIcon;
    /** Número real (p. ej. avisos) o nada. */
    insignia?: number;
}

export const idPestana = (id: IdPagina) => `mi-mando-tab-${id}`;
export const idPanel = (id: IdPagina) => `mi-mando-panel-${id}`;

export function Pestanas({
    items,
    activa,
    alCambiar,
}: {
    items: PestanaItem[];
    activa: IdPagina;
    alCambiar: (id: IdPagina) => void;
}) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);

    const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
        const i = items.findIndex((x) => x.id === activa);
        let j = i;
        if (e.key === "ArrowRight") j = (i + 1) % items.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + items.length) % items.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = items.length - 1;
        else return;
        e.preventDefault();
        const destino = items[j];
        if (!destino) return;
        alCambiar(destino.id);
        refs.current[j]?.focus();
    };

    return (
        <div
            role="tablist"
            aria-label="Páginas de Mi Puente de Mando"
            onKeyDown={alTeclear}
            className="flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-black/25 p-1.5 shadow-lg backdrop-blur-md"
        >
            {items.map((it, i) => {
                const sel = it.id === activa;
                const Icono = it.icono;
                return (
                    <button
                        key={it.id}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        id={idPestana(it.id)}
                        type="button"
                        role="tab"
                        aria-selected={sel}
                        aria-controls={idPanel(it.id)}
                        tabIndex={sel ? 0 : -1}
                        onClick={() => alCambiar(it.id)}
                        className={cn(
                            "inline-flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:min-h-[2.25rem]",
                            sel
                                ? "border-cyan-400/45 bg-cyan-500/15 text-cyan-100"
                                : "border-transparent text-white/60 hover:bg-white/5 hover:text-white",
                        )}
                    >
                        <Icono className={cn("h-4 w-4 shrink-0", sel ? "text-cyan-300" : "text-white/50")} aria-hidden />
                        <span>{it.etiqueta}</span>
                        {typeof it.insignia === "number" && it.insignia > 0 && (
                            <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/25 px-1.5 text-[10px] font-bold text-amber-100">
                                {it.insignia}
                                <span className="sr-only"> {it.insignia === 1 ? "aviso" : "avisos"}</span>
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
