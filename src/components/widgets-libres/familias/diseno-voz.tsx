"use client";

import { AstrauraForma } from "./astraura-forma";
import { frasePantallaLectora, textoDeEstado, type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PropsDiseno {
    estado: EstadoAsistente;
    tam: number;
    ultima: { texto: string; ts: number } | null;
    hilo: { rol: "user" | "aurora"; texto: string; ts: number }[];
    ahora: number;
    tactil: boolean;
    voz: boolean;
    preguntar: ReactNode;
    botonVoz: ReactNode;
    sugerencias: string[];
    onAbrirChat: () => void;
    onSugerencia: (t: string) => void;
}

export function DisenoVoz({
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
}: PropsDiseno) {
    const formaTam = Math.min(tam * 0.42, 140);

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-4" data-diseno="voz">
            <AstrauraForma
                estado={estado}
                tam={formaTam}
                onClick={onAbrirChat}
            />
            <div className="flex flex-col items-center gap-2 text-center">
                <p role="status" className={cn(
                    "font-semibold text-background",
                    voz ? "text-2xl" : "text-xl",
                )}>
                    {voz ? textoDeEstado(estado) : "La voz no está disponible en este aparato"}
                </p>
                {ultima && voz && (
                    <p className="max-w-md text-pretty text-sm text-foreground/80">
                        {ultima.texto}
                    </p>
                )}
            </div>
            <div className="flex flex-col items-center gap-2">
                {botonVoz && (
                    <div className="w-full max-w-xs">
                        {botonVoz}
                    </div>
                )}
                {!voz && (
                    <>
                        {preguntar}
                    </>
                )}
            </div>
        </div>
    );
}

DisenoVoz.defaultProps = {
    estado: "calma",
    tam: 180,
    ultima: null,
    hilo: [],
    ahora: 0,
    tactil: false,
    voz: false,
    botonVoz: null,
    sugerencias: [],
    preguntar: null,
} as Partial<PropsDiseno>;