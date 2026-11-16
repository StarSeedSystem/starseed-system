// DisenoAcciones component
"use client";
import * as React from "react";
import { Accion } from "./inicio-piezas";
import type { PropsDiseno, EstadoAsistente } from "@/lib/widgets/astraura/disenos";

export interface DisenoAccionesProps extends PropsDiseno {}

export function DisenoAcciones({
    estado,
    tam,
    ultima,
    hilo,
    ahora,
    tactil,
    voz,
    preguntar,
    botonVoz,
    sugerencias,
    onAbrirChat,
    onSugerencia,
}: DisenoAccionesProps) {
    const sugerenciasLimitadas = sugerencias.slice(0, 4);
    const items = [...sugerenciasLimitadas, "Abrir el chat"];
    return (
        <div data-testid="diseno-acciones" style={{ width: tam }} className="flex flex-wrap gap-1">
            {items.map((text, i) => (
                <Accion
                    key={i}
                    color="#7c5cff"
                    grande
                    onClick={text === "Abrir el chat" ? onAbrirChat : () => onSugerencia(text)}
                    aria-label={text}
                >
                    {text}
                </Accion>
            ))}
        </div>
    );
}
