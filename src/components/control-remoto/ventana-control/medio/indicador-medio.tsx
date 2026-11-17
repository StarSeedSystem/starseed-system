"use client";

/**
 * CTL1117B · por qué medio viaja el control y cuál elegir. Una línea siempre visible («Órdenes: … · Pantalla: …») y, debajo,
 * un selector con las opciones que este par de aparatos puede usar (las demás, apagadas con su motivo).
 * Presentacional: `IndicadorMedio` no sabe de transporte; `MedioControl` lo conecta con el estado vivo.
 */

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { cambiaLaPantalla, fijarEleccion, usarMedioControl, type EstadoMedio } from "@/lib/control-remoto/medio-estado";
import type { MedioElegido } from "@/lib/control-remoto/medio";
import {
    AVISO_RECONECTA, AYUDA_ELECCION, BOTON_PASAR_A_AUTO, NOMBRE_ELECCION, NOTA_RESPUESTAS, PALABRA_MEDIO_PERDIDO, textoMedioReal, textoPantallaElegida,
} from "@/lib/control-remoto/medio-palabras";

export interface PropsIndicadorMedio {
    nombre: string;
    estado: EstadoMedio;
    alElegir: (m: MedioElegido) => void;
    /** Avisa de que la pantalla se vuelve a conectar (lo dice la propia ventana en palabras). */
    avisoReconexion?: boolean;
}

export function IndicadorMedio({ nombre, estado, alElegir, avisoReconexion }: PropsIndicadorMedio) {
    const [abierto, setAbierto] = useState(false);
    const id = useId();
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    // Lo que se lee es EXACTAMENTE el dato de la línea de registro `control-medio` (entrada=): el camino que usaría un gesto ahora.
    const ayudaOrdenes = estado.entradaPorPantalla ? "Gestos y teclas: por la conexión de la pantalla." : "Por el canal de la malla.";

    const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const sig = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (!sig) return;
        e.preventDefault();
        const n = estado.opciones.length;
        for (let k = 1; k <= n; k++) {
            const j = (i + sig * k + n * k) % n;
            if (estado.opciones[j].disponible || estado.opciones[j].id === estado.elegido) {
                refs.current[j]?.focus();
                return;
            }
        }
    };

    return (
        <div data-testid="medio-control" className="border-b border-white/10 px-3 py-1 text-[11px] text-white/70">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span data-testid="medio-ordenes">
                    <span className="text-white/50">Órdenes:</span> <span className="text-white/90">{textoMedioReal(estado.entrada, estado.comprobandoEntrada)}</span>
                </span>
                <span data-testid="medio-pantalla">
                    <span className="text-white/50">Pantalla:</span> <span className="text-white/90">{textoMedioReal(estado.pantalla, estado.comprobandoPantalla)}</span>
                </span>
                <button
                    type="button"
                    aria-expanded={abierto}
                    aria-controls={id}
                    onClick={() => setAbierto((v) => !v)}
                    className="ml-auto min-h-[28px] cursor-pointer rounded-full border border-white/15 px-2 text-[11px] text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80"
                >
                    Medio: {NOMBRE_ELECCION[estado.elegido]}
                </button>
            </div>
            {estado.perdido ? (
                <p role="alert" data-testid="medio-perdido" className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-2 py-1 leading-snug text-amber-200">
                    <span>{PALABRA_MEDIO_PERDIDO}</span>
                    <button type="button" onClick={() => alElegir("auto")} className="min-h-[28px] cursor-pointer rounded-full bg-amber-300/20 px-2 text-amber-100 hover:bg-amber-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
                        {BOTON_PASAR_A_AUTO}
                    </button>
                </p>
            ) : null}
            {abierto ? (
                <div id={id} data-testid="medio-panel" className="mt-1 space-y-1 pb-1">
                    <p className="text-white/55">Cómo se comunica {nombre} con este aparato. {ayudaOrdenes}</p>
                    <div role="radiogroup" aria-label={`Medio de transmisión del control de ${nombre}`} className="flex flex-col gap-1">
                        {estado.opciones.map((o, i) => {
                            const marcada = o.id === estado.elegido;
                            const apagada = !o.disponible && !marcada;
                            const nota = textoPantallaElegida(o.id, o.pantalla);
                            const descId = `${id}-${o.id}`;
                            return (
                                <button
                                    key={o.id}
                                    ref={(el) => {
                                        refs.current[i] = el;
                                    }}
                                    type="button"
                                    role="radio"
                                    aria-checked={marcada}
                                    aria-disabled={apagada}
                                    aria-describedby={descId}
                                    tabIndex={marcada ? 0 : -1}
                                    data-testid={`medio-opcion-${o.id}`}
                                    onClick={() => {
                                        if (apagada || marcada) return;
                                        alElegir(o.id);
                                    }}
                                    onKeyDown={(e) => alTeclear(e, i)}
                                    className={`min-h-[44px] rounded-lg border px-2 py-1 text-left leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 ${
                                        marcada ? "border-emerald-400/60 bg-emerald-500/15 text-white" : apagada ? "cursor-not-allowed border-white/10 text-white/40" : "cursor-pointer border-white/15 text-white/80 hover:bg-white/10"
                                    }`}
                                >
                                    <span className="block text-[12px] font-medium">{NOMBRE_ELECCION[o.id]}</span>
                                    <span id={descId} className="block text-[11px] text-white/60">
                                        {apagada || (!o.disponible && o.motivoNo) ? o.motivoNo : AYUDA_ELECCION[o.id]}
                                        {nota && !apagada ? ` ${nota}` : ""}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-white/45">{NOTA_RESPUESTAS}</p>
                    {avisoReconexion ? (
                        <p role="status" className="text-emerald-200/90">
                            {AVISO_RECONECTA}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** El indicador conectado al estado vivo; `alReconectar` vuelve a abrir la pantalla cuando su medio cambia. */
export function MedioControl({ neurona, nombre, alReconectar }: { neurona: string; nombre: string; alReconectar?: () => void }) {
    const estado = usarMedioControl(neurona);
    const [aviso, setAviso] = useState(false);
    const elegir = (m: MedioElegido) => {
        const antes = estado.elegido;
        const reconecta = cambiaLaPantalla(neurona, antes, m);
        fijarEleccion(neurona, m);
        setAviso(reconecta && !!alReconectar);
        if (reconecta) alReconectar?.();
    };
    return <IndicadorMedio nombre={nombre} estado={estado} alElegir={elegir} avisoReconexion={aviso} />;
}
