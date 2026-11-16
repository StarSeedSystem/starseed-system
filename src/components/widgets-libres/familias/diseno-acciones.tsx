"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Accion } from "./inicio-piezas";
import { AstrauraForma } from "./astraura-forma";
import { Rotulo, recortarPalabras } from "./comun";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

export function DisenoAcciones(props: PropsDiseno) {
    const mostrarHilo = props.tam >= 120;
    const mostrarSugerencias = props.tam >= 120;

    const handleSugerencia = (texto: string) => {
        if (props.onSugerencia) props.onSugerencia(texto);
    };

    const handleAbrirChat = () => {
        props.onAbrirChat();
    };

    const sugerenciasMostrables = [...props.sugerencias.slice(0, 4), "Abrir el chat"];

    return (
        <div className="w-full">
            <Rotulo className="truncate text-foreground" color="hsl(var(--foreground))">
                {textoDeEstado(props.estado)}
            </Rotulo>

            {props.preguntar}

            {mostrarHilo && (
                <div className="mt-2 flex flex-col gap-2">
                    {props.hilo.slice(-2).map((turno, i) => (
                        <div
                            key={`${turno.ts}-${i}`}
                            className={`text-sm ${turno.rol === "user" ? "text-muted-foreground" : "text-foreground"}`}
                        >
                            <span className="font-medium">
                                {turno.rol === "user" ? "Tú:" : "Astraura:"}
                            </span>{" "}
                            {recortarPalabras(turno.texto, 80)}
                        </div>
                    ))}
                </div>
            )}

            {mostrarSugerencias && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {sugerenciasMostrables.map((texto) => {
                        const esAbrirChat = texto === "Abrir el chat";
                        return esAbrirChat ? (
                            <button
                                key={texto}
                                type="button"
                                onClick={handleAbrirChat}
                                className="rounded-full px-3 py-1 text-xs font-semibold text-white transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer"
                                style={{
                                    background: `${PALETAS.astraura.colores[0]}1f`,
                                    boxShadow: `inset 0 0 0 1px ${PALETAS.astraura.colores[0]}66`,
                                    outlineColor: PALETAS.astraura.colores[0],
                                }}
                                aria-label="Abrir el chat"
                            >
                                Abrir el chat
                            </button>
                        ) : (
                            <Accion
                                key={texto}
                                icono={Sparkles}
                                color={PALETAS.astraura.colores[0]}
                                grande={props.tactil}
                                onClick={() => handleSugerencia(texto)}
                                className="max-w-full whitespace-normal text-left leading-tight"
                            >
                                {texto}
                            </Accion>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default DisenoAcciones;