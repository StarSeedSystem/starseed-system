"use client";

import * as React from "react";
import { AstrauraForma, type EstadoAsistente } from "./astraura-forma";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import { haceCuanto, recortarPalabras } from "./inicio-piezas";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

const TEXTO_ESTADO: Record<EstadoAsistente, string> = {
    calma: "En calma",
    escuchando: "Escuchando…",
    pensando: "Pensando…",
    hablando: "Hablando",
    error: "Algo falló",
};

const COLOR_ACENTO = PALETAS.astraura.colores[0];
const COLOR_HALO = PALETAS.astraura.halo;

export function DisenoConversacion({
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
    const tamForma = Math.max(44, tam * 0.6);

    const turnosVisibles = React.useMemo(() => {
        const maxTurnos = 3;
        const desde = Math.max(0, hilo.length - maxTurnos);
        return hilo.slice(desde);
    }, [hilo]);

    return (
        <div
            className="flex h-full w-full flex-col items-center gap-3 px-3 py-3"
            data-diseno="conversacion"
            style={{
                background: "hsl(var(--background))",
                color: "hsl(var(--foreground))",
            }}
        >
            <div className="flex flex-col items-center gap-1.5">
                <AstrauraForma
                    estado={estado}
                    tam={tamForma}
                    onClick={onAbrirChat}
                    className="cursor-pointer"
                />
                <span
                    className="text-[11px] font-medium uppercase tracking-[0.14em]"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                >
                    {TEXTO_ESTADO[estado]}
                </span>
                {voz && botonVoz}
            </div>

            <PilaAjustable niveles={turnosVisibles.length} className="min-w-0 w-full flex-1 overflow-hidden">
                {turnosVisibles.length === 0 ? (
                    <Prescindible nivel={1}>
                        <p
                            className="text-center text-[13px] leading-snug"
                            style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                            Aún no habéis hablado. Pregúntale lo que quieras.
                        </p>
                    </Prescindible>
                ) : (
                    <ol
                        className="flex min-w-0 flex-col gap-1.5 w-full"
                        aria-label="Última conversación"
                        role="list"
                    >
                        {turnosVisibles.map((turno, idx) => {
                            const esUltimo = idx === turnosVisibles.length - 1;
                            const esAstraura = turno.rol === "aurora";
                            const prefijo = esAstraura ? "" : "Tú: ";
                            const textoCompleto = `${prefijo}${turno.texto}`;
                            const textoCorto = recortarPalabras(textoCompleto, 110);

                            const item = (
                                <li
                                    key={`${turno.ts}-${idx}`}
                                    className="min-w-0 text-[12.5px] leading-snug break-words"
                                    style={{
                                        color: esAstraura
                                            ? "hsl(var(--foreground))"
                                            : "hsl(var(--muted-foreground))",
                                    }}
                                >
                                    <p className="line-clamp-2" title={textoCompleto}>
                                        {textoCorto}
                                    </p>
                                    {esAstraura && esUltimo && (
                                        <span
                                            className="block mt-0.5 text-[10.5px]"
                                            style={{ color: COLOR_HALO }}
                                        >
                                            {haceCuanto(turno.ts, ahora)}
                                        </span>
                                    )}
                                </li>
                            );

                            return esUltimo ? item : (
                                <Prescindible key={`${turno.ts}-${idx}`} nivel={idx + 1}>
                                    {item}
                                </Prescindible>
                            );
                        })}
                    </ol>
                )}
            </PilaAjustable>

            <div className="w-full" data-testid="preguntar">
                {preguntar}
            </div>

            {sugerencias.length > 0 && (
                <Prescindible nivel={turnosVisibles.length + 1}>
                    <div className="flex flex-wrap gap-1.5 w-full justify-center">
                        {sugerencias.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => onSugerencia(s)}
                                className="cursor-pointer ss-redondo px-3 py-1.5 text-[11px] font-medium text-white transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{
                                    background: `${COLOR_ACENTO}1f`,
                                    boxShadow: `inset 0 0 0 1px ${COLOR_ACENTO}66`,
                                    outlineColor: COLOR_ACENTO,
                                }}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </Prescindible>
            )}
        </div>
    );
}