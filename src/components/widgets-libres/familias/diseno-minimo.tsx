"use client";

import * as React from "react";
import { AstrauraForma } from "./astraura-forma";
import { Rotulo } from "./comun";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

const DisenoMinimo = (props: PropsDiseno) => {
    return (
        <div className="w-full">
            <AstrauraForma estado={props.estado} tam={props.tam} onClick={() => props.onAbrirChat()} />

            <Rotulo className="truncate" color="hsl(var(--foreground))">
                {textoDeEstado(props.estado)}
            </Rotulo>

            {props.preguntar}

            <div
                className="cursor-pointer"
                style={{
                    color: PALETAS.astraura.colores[0],
                    marginTop: "4px",
                }}
                onClick={() => props.onAbrirChat()}
            >
                Preguntar
            </div>
        </div>
    );
};

export default DisenoMinimo;