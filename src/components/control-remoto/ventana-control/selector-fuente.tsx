"use client";

import { useRef, type KeyboardEvent } from "react";

import { rotuloFuente, type FuentePedida, type FuenteReal } from "@/lib/control-remoto/fuente-pantalla";

export interface PropsSelectorFuente {
    pedida: FuentePedida;
    real: FuenteReal | null;
    aviso: string | null;
    onCambiar: (f: FuentePedida) => void;
}

export function SelectorFuente({ pedida, real, aviso, onCambiar }: PropsSelectorFuente) {
    const automatico = useRef<HTMLButtonElement>(null);
    const proyeccion = useRef<HTMLButtonElement>(null);

    const cambiarConFlechas = (e: KeyboardEvent<HTMLButtonElement>, actual: FuentePedida) => {
        const siguiente: FuentePedida | null =
            e.key === "ArrowRight" || e.key === "ArrowDown"
                ? actual === "auto" ? "proyeccion" : "auto"
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? actual === "proyeccion" ? "auto" : "proyeccion"
                  : null;
        if (!siguiente) return;
        e.preventDefault();
        onCambiar(siguiente);
        (siguiente === "auto" ? automatico : proyeccion).current?.focus();
    };

    const claseOpcion = (marcada: boolean) =>
        `inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 ${
            marcada ? "bg-emerald-500 text-[#0b0f1a]" : "text-white/70 hover:bg-white/10 hover:text-white"
        }`;

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div role="radiogroup" aria-label="Fuente de la pantalla" className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                <button
                    ref={automatico}
                    type="button"
                    role="radio"
                    aria-checked={pedida === "auto"}
                    tabIndex={pedida === "auto" ? 0 : -1}
                    onClick={() => onCambiar("auto")}
                    onKeyDown={(e) => cambiarConFlechas(e, "auto")}
                    className={claseOpcion(pedida === "auto")}
                >
                    Automática
                </button>
                <button
                    ref={proyeccion}
                    type="button"
                    role="radio"
                    aria-checked={pedida === "proyeccion"}
                    aria-describedby="ayuda-fuente-fluida"
                    tabIndex={pedida === "proyeccion" ? 0 : -1}
                    onClick={() => onCambiar("proyeccion")}
                    onKeyDown={(e) => cambiarConFlechas(e, "proyeccion")}
                    className={claseOpcion(pedida === "proyeccion")}
                >
                    Fluida (proyección)
                </button>
            </div>
            <p id="ayuda-fuente-fluida" className="px-1 text-[11px] leading-snug text-white/60">
                Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca
            </p>
            <p data-testid="selector-fuente-real" className="px-1 text-[11px] leading-snug text-white/70">
                <span className="text-white/50">Fuente real:</span> <span>{rotuloFuente(real)}</span>
            </p>
            {aviso ? (
                <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200">
                    {aviso}
                </p>
            ) : null}
        </div>
    );
}
