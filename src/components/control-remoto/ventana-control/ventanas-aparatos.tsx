"use client";

import { useMemo } from "react";
import { VentanaControl } from "./ventana-control";
import type { PropsVentanaControl, EntradaControl } from "./tipos";

export interface AparatoConPermiso extends PropsVentanaControl {
    id: string;
    conPermiso: boolean;
}

export interface PropsVentanasAparatos {
    aparatos: AparatoConPermiso[];
    aparatoActivo: string;
    alCambiarAparato: (id: string) => void;
    modoEspejo: boolean;
    alCambiarModoEspejo: (activar: boolean) => void;
    alEnviarEspejo?: (ordenes: { aparatoId: string; entrada: EntradaControl }[]) => void;
    alAparatoSaltado?: (aparatoId: string, motivo: string) => void;
}

export function VentanasAparatos(props: PropsVentanasAparatos) {
    const { aparatos, aparatoActivo, alCambiarAparato, modoEspejo, alCambiarModoEspejo, alEnviarEspejo, alAparatoSaltado } = props;

    const aparatoActivoObj = useMemo(() => aparatos.find((a) => a.id === aparatoActivo) ?? aparatos[0], [aparatos, aparatoActivo]);

    const manejarEnvio = (entrada: EntradaControl) => {
        if (!modoEspejo || !alEnviarEspejo) {
            aparatoActivoObj.alEnviar(entrada);
            return;
        }
        const ordenes = aparatos
            .filter((a) => a.conPermiso)
            .map((a) => ({ aparatoId: a.id, entrada }));
        const saltados = aparatos.filter((a) => !a.conPermiso);
        alEnviarEspejo(ordenes);
        for (const a of saltados) {
            alAparatoSaltado?.(a.id, a.motivo ?? "sin permiso");
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-[#0b0f1a]">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 bg-white/[0.02]">
                <div role="tablist" className="flex flex-1 gap-1" aria-label="Aparatos de la neurona">
                    {aparatos.map((a) => (
                        <button
                            key={a.id}
                            role="tab"
                            aria-selected={a.id === aparatoActivo}
                            onClick={() => alCambiarAparato(a.id)}
                            className={`min-h-8 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                a.id === aparatoActivo
                                    ? "bg-[#DC143C]/25 border border-[#DC143C]/60 text-white"
                                    : "bg-white/[0.04] border border-white/10 text-white/70 hover:bg-white/[0.1]"
                            }`}
                            data-testid={`tab-aparato-${a.nombre}`}
                        >
                            {a.nombre}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => alCambiarModoEspejo(!modoEspejo)}
                    aria-pressed={modoEspejo}
                    className={`min-h-8 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        modoEspejo
                            ? "bg-emerald-500/20 border border-emerald-400/60 text-emerald-300"
                            : "bg-white/[0.04] border border-white/10 text-white/70 hover:bg-white/[0.1]"
                    }`}
                    data-testid="boton-modo-espejo"
                >
                    {modoEspejo ? "Desactivar modo espejo" : "Activar modo espejo"}
                </button>
            </div>
            <div key={aparatoActivoObj.id} className="flex-1 min-h-0 overflow-hidden" data-testid={`ventana-control-${aparatoActivoObj.nombre}`}>
                <VentanaControl
                    {...aparatoActivoObj}
                    alEnviar={manejarEnvio}
                />
            </div>
        </div>
    );
}