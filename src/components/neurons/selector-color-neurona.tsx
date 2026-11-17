"use client";

/**
 * CTL1117I · «Color público» de ESTA neurona, en sus ajustes: doce colores sugeridos (legibles sobre fondo claro y oscuro) y un
 * color propio en `#rrggbb`. Se guarda en los ajustes de la neurona (`NeuronSettings.colorPublico`, sin migración) y se publica
 * con el resto de sus datos públicos (presencia). Es lo que ven las demás neuronas en el control: el punto de quien controla, sus
 * toques y lo que escribe.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { PALETA_COLOR_PUBLICO, colorPorDefecto, normalizarColor } from "@/lib/neurons/color-publico";
import { colorPublicoDeNeurona, ponerColorPublico } from "@/lib/neurons/color-publico-ajuste";
import { PALABRAS_INDICADOR as P } from "@/lib/control-remoto/palabras-indicador";
import { NEURON_EVENT } from "@/lib/neurons/neurons";
import { PuntoColor } from "@/components/control-remoto/punto-control";

export function SelectorColorNeurona({ id }: { id: string }) {
    const uid = useId();
    const [actual, setActual] = useState(() => colorPorDefecto(id));
    const [texto, setTexto] = useState("");
    const [mal, setMal] = useState(false);

    useEffect(() => {
        if (!id) return;
        const leer = () => setActual(colorPublicoDeNeurona(id));
        leer();
        window.addEventListener(NEURON_EVENT, leer);
        return () => window.removeEventListener(NEURON_EVENT, leer);
    }, [id]);

    const elegir = useCallback(
        (c: string | null) => {
            const r = ponerColorPublico(id, c);
            if (r === null) {
                setMal(true);
                return;
            }
            setMal(false);
            setActual(r);
            setTexto("");
        },
        [id],
    );

    return (
        <section aria-labelledby={`${uid}-t`} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5" data-testid="selector-color-neurona">
            <h4 id={`${uid}-t`} className="flex items-center gap-2 text-[11px] font-medium text-white/90">
                <PuntoColor color={actual} />
                {P.color.titulo}: <span data-testid="color-actual">{actual}</span>
            </h4>
            <p className="text-[9px] leading-snug text-white/45">{P.color.ayuda}</p>
            <div role="radiogroup" aria-label={P.color.paleta} className="flex flex-wrap gap-1.5">
                {PALETA_COLOR_PUBLICO.map((c) => {
                    const marcado = c.color === actual;
                    return (
                        <button
                            key={c.color}
                            type="button"
                            role="radio"
                            aria-checked={marcado}
                            aria-label={`${P.color.elegido(c.nombre)} ${c.color}`}
                            title={c.nombre}
                            onClick={() => elegir(c.color)}
                            className={`h-8 w-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${marcado ? "border-white" : "border-white/30"}`}
                            style={{ backgroundColor: c.color }}
                        >
                            {marcado ? <span aria-hidden className="text-[13px] font-bold text-white drop-shadow">✓</span> : null}
                        </button>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${uid}-hex`} className="text-[10px] text-white/70">
                    {P.color.propio}
                </label>
                <input
                    id={`${uid}-hex`}
                    value={texto}
                    onChange={(e) => {
                        setTexto(e.target.value);
                        setMal(false);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && texto && elegir(texto)}
                    placeholder="#3c9fdd"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={mal}
                    aria-describedby={mal ? `${uid}-err` : undefined}
                    className="h-8 w-28 rounded-md border border-white/20 bg-black/40 px-2 font-mono text-[11px] text-white"
                />
                <button
                    type="button"
                    disabled={!normalizarColor(texto)}
                    onClick={() => elegir(texto)}
                    className="min-h-8 cursor-pointer rounded-md bg-white/10 px-2 text-[11px] text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {P.color.usar}
                </button>
                <button type="button" onClick={() => elegir(null)} className="min-h-8 cursor-pointer rounded-md px-2 text-[11px] text-white/60 underline hover:text-white">
                    {P.color.porDefecto}
                </button>
            </div>
            {mal && (
                <p id={`${uid}-err`} role="alert" className="text-[10px] text-[#ff6b81]" data-testid="color-invalido">
                    {P.color.invalido}
                </p>
            )}
        </section>
    );
}
