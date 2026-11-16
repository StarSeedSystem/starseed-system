"use client";

import * as React from "react";
import { AstrauraForma } from "./astraura-forma";
import { textoDeEstado, type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { escalaTipo, type ClaseDispositivo } from "./inicio-piezas";
import { useDispositivo } from "./inicio-piezas";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

const DisenoVoz = (props: PropsDiseno) => {
    const dispositivo = useDispositivo();
    const k = escalaTipo(dispositivo);
    const tamForma = Math.round(props.tam * k);

    if (!props.voz) {
        return (
            <div
                className="flex flex-col items-center justify-center gap-4 w-full min-h-[200px]"
                role="status"
                aria-live="polite"
                style={{ color: "hsl(var(--foreground))" }}
            >
                <AstrauraForma estado={props.estado} tam={tamForma} onClick={() => props.onAbrirChat()} />
                <p className="text-center text-[16px] leading-snug" style={{ fontSize: `calc(16px * ${k})` }}>
                    La voz no está disponible en este aparato
                </p>
                <div className="w-full max-w-[400px]">{props.preguntar}</div>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col items-center justify-center gap-4 w-full min-h-[240px]"
            style={{ color: "hsl(var(--foreground))" }}
        >
            <AstrauraForma estado={props.estado} tam={tamForma} onClick={() => props.onAbrirChat()} />

            <p
                className="text-center text-[20px] font-medium leading-snug truncate max-w-[90%]"
                style={{ fontSize: `calc(20px * ${k})` }}
                role="status"
                aria-live="polite"
            >
                {textoDeEstado(props.estado)}
            </p>

            {props.ultima && (
                <p
                    className="text-center text-[18px] leading-snug truncate max-w-[90%] text-muted-foreground"
                    style={{ fontSize: `calc(18px * ${k})` }}
                    title={props.ultima.texto}
                >
                    {props.ultima.texto}
                </p>
            )}

            <div
                className="w-full max-w-[480px] ss-redondo cursor-pointer"
                style={{
                    minHeight: `calc(64px * ${k})`,
                    background: `linear-gradient(135deg, ${PALETAS.astraura.colores[0]}33, ${PALETAS.astraura.colores[1]}33)`,
                    boxShadow: `inset 0 0 0 1px ${PALETAS.astraura.colores[0]}66`,
                    borderRadius: "9999px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
                onClick={() => props.onAbrirChat()}
                role="button"
                tabIndex={0}
                aria-label={`Hablar con Astraura (${textoDeEstado(props.estado).toLowerCase()})`}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        props.onAbrirChat();
                    }
                }}
            >
                {props.botonVoz}
            </div>
        </div>
    );
};

export default DisenoVoz;