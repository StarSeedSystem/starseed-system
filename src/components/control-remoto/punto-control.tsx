"use client";

/**
 * CTL1117I · piezas del indicador de control entre neuronas:
 *  · `PuntoColor`: el puntito de color público que va junto al nombre de una neurona («quién es quién»).
 *  · `PuntoControl`: el punto de la esquina cuando alguien controla ESTE aparato; al pulsarlo (o con Intro/Espacio) se abre un
 *    panelito con quién controla, nivel, desde cuándo y su color, y «Terminar». Se pliega solo a los 5 s si no estás dentro.
 * El aviso en las notificaciones y el «Terminar» de la app no dependen de esto: con el indicador oculto sigue existiendo el
 * panel de ajustes (`ajustes-indicador.tsx`) con quién controla y «Terminar».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuienControla } from "@/lib/control-remoto/quien-controla";
import { PALABRAS_INDICADOR as P } from "@/lib/control-remoto/palabras-indicador";

function hhmm(t: number): string {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** El color de la neurona junto a su nombre. Decorativo (el nombre ya está al lado); con `leer` también lo dice a un lector de pantalla. */
export function PuntoColor({ color, leer, className = "" }: { color: string; leer?: boolean; className?: string }) {
    return (
        <span
            data-testid="punto-color"
            data-color={color}
            {...(leer ? { role: "img", "aria-label": `Color ${color}` } : { "aria-hidden": true })}
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 align-middle shadow-[0_0_0_1px_rgba(0,0,0,0.45)] ${className}`}
            style={{ backgroundColor: color }}
        />
    );
}

export const PLIEGA_PANEL_MS = 5000;

export function PuntoControl({ quien, onTerminar, plegarMs = PLIEGA_PANEL_MS }: { quien: QuienControla; onTerminar: () => void; plegarMs?: number }) {
    const [abierto, setAbierto] = useState(false);
    const [dentro, setDentro] = useState(false);
    const caja = useRef<HTMLDivElement | null>(null);
    const boton = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!abierto || dentro) return;
        const t = setTimeout(() => setAbierto(false), plegarMs);
        return () => clearTimeout(t);
    }, [abierto, dentro, plegarMs]);

    const cerrar = useCallback(() => {
        setAbierto(false);
        boton.current?.focus();
    }, []);

    return (
        <div
            ref={caja}
            className="pointer-events-none fixed right-1 top-1 z-[2147483000] flex flex-col items-end gap-1"
            data-testid="punto-control"
            onKeyDown={(e) => {
                if (e.key === "Escape" && abierto) {
                    e.stopPropagation();
                    cerrar();
                }
            }}
            onFocusCapture={() => setDentro(true)}
            onBlurCapture={(e) => {
                if (!caja.current?.contains(e.relatedTarget as Node | null)) setDentro(false);
            }}
        >
            <button
                ref={boton}
                type="button"
                aria-label={P.punto.etiqueta(quien.nombre)}
                aria-expanded={abierto}
                aria-haspopup="dialog"
                onClick={() => setAbierto((a) => !a)}
                className="pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full"
            >
                <span
                    data-testid="punto-control-punto"
                    data-color={quien.color}
                    className="block h-3 w-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                    style={{ backgroundColor: quien.color }}
                />
            </button>
            {abierto && (
                <div
                    role="dialog"
                    aria-label={P.punto.panelTitulo}
                    data-testid="punto-control-panel"
                    className="pointer-events-auto w-64 max-w-[calc(100vw-16px)] space-y-2 rounded-xl border border-white/20 bg-[#10131a]/95 p-3 text-[12px] text-white shadow-lg"
                >
                    <p className="font-medium text-white/90">{P.punto.panelTitulo}</p>
                    <dl className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-white/55">{P.punto.quien}</dt>
                            <dd className="flex items-center gap-1.5 font-medium">
                                <PuntoColor color={quien.color} />
                                {quien.nombre}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-white/55">{P.punto.nivel}</dt>
                            <dd>{quien.nivel}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-white/55">{P.punto.desde}</dt>
                            <dd>{hhmm(quien.desde)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                            <dt className="text-white/55">{P.punto.color}</dt>
                            <dd data-testid="punto-control-color">{quien.color}</dd>
                        </div>
                    </dl>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onTerminar} className="min-h-9 flex-1 cursor-pointer rounded-lg bg-[#DC143C] px-3 py-1 font-medium transition-colors hover:bg-[#b01030]">
                            {P.punto.terminar}
                        </button>
                        <button type="button" onClick={cerrar} className="min-h-9 cursor-pointer rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20">
                            {P.punto.cerrar}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
