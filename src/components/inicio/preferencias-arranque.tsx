"use client";
/**
 * Preferencias de arranque (Ola 381 · INI6): las dos preguntas que se hacen al terminar el perfil
 * y al configurar una neurona nueva — qué ver al abrir StarSeed y si proteger este dispositivo.
 * Las dos son opcionales («Ahora no»). El bloqueo siempre es de la NEURONA.
 */
import * as React from "react";
import { SelectorPantallaInicial } from "./selector-pantalla-inicial";
import { ConfigurarBloqueo } from "@/components/bloqueo/configurar-bloqueo";

export interface PreferenciasArranqueProps {
    ambito: "perfil" | "neurona";
    id: string;
    neuronaId: string;
    nombreNeurona: string;
    /** Si llega, se muestra el botón «Listo» (y «Ahora no» hace lo mismo sin tocar nada). */
    onListo?: () => void;
}

export function PreferenciasArranque({ ambito, id, neuronaId, nombreNeurona, onListo }: PreferenciasArranqueProps) {
    const [conBloqueo, setConBloqueo] = React.useState(false);
    return (
        <section className="flex flex-col gap-6 text-white" aria-label="Preferencias de arranque">
            <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">¿Qué quieres ver al abrir StarSeed?</h3>
                <SelectorPantallaInicial ambito={ambito} id={id} />
            </div>
            <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">¿Proteger este dispositivo?</h3>
                <p className="text-xs text-white/65">Un PIN, una contraseña o tu huella o rostro al abrir el OS aquí. Se guarda solo en este dispositivo.</p>
                {conBloqueo
                    ? <ConfigurarBloqueo neuronaId={neuronaId} nombreNeurona={nombreNeurona} />
                    : <button type="button" onClick={() => setConBloqueo(true)} className="cursor-pointer self-start rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold hover:bg-white/20">Elegir un bloqueo</button>}
            </div>
            {onListo && (
                <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={onListo} className="cursor-pointer text-xs text-white/60 underline-offset-4 hover:underline">Ahora no</button>
                    <button type="button" onClick={onListo} className="cursor-pointer rounded-full bg-violet-600/70 px-5 py-2 text-sm font-semibold hover:bg-violet-600">Listo</button>
                </div>
            )}
        </section>
    );
}

export default PreferenciasArranque;
