"use client";

import { AstrauraForma } from "./astraura-forma";
import { Rotulo } from "./comun";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";

export function DisenoMinimo(props: PropsDiseno) {
    const anchoMaximo = 160;
    const estiloTexto = {
        color: "hsl(var(--foreground))",
        "--foreground": "var(--foreground)",
    };
    const estiloFondo = {
        background: "hsl(var(--background))",
        "--background": "var(--background)",
    };

    const isWide = props.tam >= anchoMaximo;

    return (
        <div
            className={isWide
                ? "flex flex-row items-center gap-2"
                : "flex flex-col items-center gap-2"}
            style={{ maxWidth: `${anchoMaximo}px` }}
        >
            <AstrauraForma
                estado={props.estado}
                tam={props.tam}
                onClick={props.onAbrirChat}
            />
            <Rotulo className="truncate" style={{ ...estiloTexto, ...estiloFondo }}>
                {textoDeEstado(props.estado)}
            </Rotulo>
            {props.preguntar}
        </div>
    );
}