"use client";

import { useState } from "react";
import { Check, Globe, RotateCw } from "lucide-react";
import { estadoDePar } from "@/lib/traductor/modelos-locales";
import type { Idioma } from "@/lib/idiomas/idiomas";

export interface SelectorParProps {
    idiomas: readonly Idioma[];
    par: { origen: string; destino: string };
    onCambiar: (par: { origen: string; destino: string }) => void;
    instalados: readonly string[];
    className?: string;
}

function EtiquetaSinInternet({ estado, dataTestId }: { estado: string; dataTestId: string }) {
    const texto = estado === "sin-internet" ? "Con descarga" : estado === "solo-internet" ? "Solo con internet" : "Sin internet";
    const color = estado === "sin-internet" ? "text-emerald-300" : estado === "solo-internet" ? "text-amber-300" : "text-muted-foreground";
    
    return (
        <span data-testid={dataTestId} className={`text-[10px] ${color}`} translate="no" data-no-traducir="">
            {texto}
        </span>
    );
}

export function SelectorPar({ idiomas, par, onCambiar, instalados, className = "" }: SelectorParProps) {
    const [abiertoOrigen, setAbiertoOrigen] = useState(false);
    const [abiertoDestino, setAbiertoDestino] = useState(false);

    const origenActual = par.origen;
    const destinoActual = par.destino;
    const estadoPar = estadoDePar(origenActual, destinoActual, instalados);

    const origenLenguaje = idiomas.find((i) => i.codigo === origenActual);
    const destinoLenguaje = idiomas.find((i) => i.codigo === destinoActual);

    const itemsOrigen = idiomas.filter((i) => i.codigo === "detectar" || i.codigo === origenActual || i.codigo === destinoActual);
    const itemsDestino = idiomas.filter((i) => i.codigo === origenActual || i.codigo === destinoActual);

    const origenEsDetectar = origenActual === "detectar";

    const onIntercambiar = () => {
        if (origenEsDetectar) return;
        onCambiar({ origen: destinoActual, destino: origenActual });
    };

    const onSeleccionarOrigen = (codigo: string) => {
        onCambiar({ origen: codigo, destino: destinoActual });
        setAbiertoOrigen(false);
    };

    const onSeleccionarDestino = (codigo: string) => {
        onCambiar({ origen: origenActual, destino: codigo });
        setAbiertoDestino(false);
    };

    return (
        <div className={`flex w-full max-w-[360px] flex-col gap-3 ${className}`} data-testid="selector-par">
            <div className="flex items-center gap-2">
                <div className="relative w-1/2">
                    <button
                        type="button"
                        onClick={() => setAbiertoOrigen(!abiertoOrigen)}
                        className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3 py-3 text-left text-sm text-white outline-none transition-colors hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300"
                        data-testid="origen-selector"
                        disabled={origenEsDetectar}
                    >
                        <Globe className="h-5 w-5 shrink-0 text-cyan-200" aria-hidden />
                        <span className="truncate font-medium" translate="no" data-no-traducir="">
                            {origenLenguaje?.nombre || "Detectar idioma"}
                        </span>
                        <span className="ml-auto shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs">
                            {origenLenguaje?.rotulo || "Detectar idioma"}
                        </span>
                    </button>

                    {abiertoOrigen && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-xl border border-white/15 bg-black/40 p-2" data-testid="origen-lista">
                            <ul className="max-h-64 overflow-y-auto" role="listbox">
                                {itemsOrigen.map((idioma) => (
                                    <li
                                        key={idioma.codigo}
                                        role="option"
                                        onClick={() => onSeleccionarOrigen(idioma.codigo)}
                                        className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 outline-none hover:bg-white/10 focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <span translate="no" data-no-traducir="" className="truncate text-sm font-medium">
                                                {idioma.nombre}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground" translate="no" data-no-traducir="">
                                                {idioma.codigo}
                                            </span>
                                        </span>
                                        {idioma.codigo === origenActual && <Check className="h-chlüssel-4 w-4 shrink-0 text-emerald-300" />}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onIntercambiar}
                    disabled={origenEsDetectar}
                    className="flex h-[44px] w-12 cursor-pointer items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 transition-colors hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="intercambiar-btn"
                >
                    <RotateCw className="h-5 w-5 text-cyan-200" />
                </button>

                <div className="relative w-1/2">
                    <button
                        type="button"
