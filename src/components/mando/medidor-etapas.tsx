"use client";

/**
 * Medidor por etapas: una fila por tarea con su camino completo
 * escribiendo → verificando → probando → revisando → visto bueno → integrada.
 *
 * No es un adorno, es un detector de atascos. El 2026-09-13 el enjambre estuvo
 * 2 h 30 min parado con tres tareas a 147 minutos en «visto bueno» y desde la
 * cabecera era indistinguible de trabajo normal. Por eso el atasco se escribe
 * con la palabra «atascada», no solo con color, y las filas que necesitan
 * atención van arriba.
 *
 * Comprobación a mano: http://localhost:9002/mando → bajo las pastillas de la
 * cabecera, una fila por tarea viva con sus seis etapas.
 */

import { ETAPAS, resumenEtapas, type Desenlace, type PasoTarea } from "@/lib/mando/etapas";

const TONO: Record<Desenlace, { texto: string; barra: string; etiqueta: string }> = {
    "en marcha": { texto: "text-sky-300", barra: "bg-sky-400", etiqueta: "" },
    atascada: { texto: "text-rose-300", barra: "bg-rose-500", etiqueta: "atascada" },
    parada: { texto: "text-amber-300", barra: "bg-amber-500", etiqueta: "parada" },
    integrada: { texto: "text-emerald-300", barra: "bg-emerald-500", etiqueta: "integrada" },
};

const ORDEN: Record<Desenlace, number> = { atascada: 0, "en marcha": 1, parada: 2, integrada: 3 };

function Fila({ paso }: { paso: PasoTarea }) {
    const tono = TONO[paso.desenlace];
    return (
        <li className="flex flex-col gap-1 rounded-lg border border-border/20 bg-black/10 px-3 py-2" data-testid={`etapa-${paso.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="font-bold text-foreground/90">
                    {paso.id}
                    {paso.modelo ? <span className="ml-1 font-normal text-[10px] text-muted-foreground/70">{paso.modelo}</span> : null}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider ${tono.texto}`}>
                    {paso.etapa}
                    {tono.etiqueta ? ` · ${tono.etiqueta}` : ""} · {paso.porcentaje}% · {paso.minutosEnEtapa} min
                </span>
            </div>
            <div
                className="flex gap-0.5"
                role="progressbar"
                aria-valuenow={paso.porcentaje}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${paso.id}: ${paso.etapa}, ${paso.desenlace}`}
            >
                {ETAPAS.map((etapa, i) => {
                    const pasada = i <= paso.indice;
                    const actual = i === paso.indice;
                    return (
                        <span
                            key={etapa}
                            aria-label={`${etapa}${actual ? " (actual)" : ""}`}
                            className={`h-1.5 flex-1 rounded-full ${pasada ? tono.barra : "bg-white/10"} ${actual ? "animate-pulse" : ""}`}
                        />
                    );
                })}
            </div>
            {paso.detalle ? <p className="text-[10px] text-muted-foreground/70">{paso.detalle}</p> : null}
        </li>
    );
}

export function MedidorEtapas({ pasos }: { pasos: PasoTarea[] }) {
    if (pasos.length === 0) {
        return (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/60" data-testid="medidor-etapas-vacio">
                Ninguna tarea en marcha.
            </p>
        );
    }
    const resumen = resumenEtapas(pasos);
    // Lo que necesita atención arriba; dentro de cada grupo, lo que lleva más tiempo quieto.
    const ordenados = [...pasos].sort(
        (a, b) => ORDEN[a.desenlace] - ORDEN[b.desenlace] || b.minutosEnEtapa - a.minutosEnEtapa,
    );
    return (
        <div className="flex flex-col gap-1.5" data-testid="medidor-etapas">
            <p className="px-1 text-xs font-semibold text-foreground/80">
                {resumen.enMarcha} en marcha · {resumen.atascadas} atascadas
            </p>
            <ul className="flex flex-col gap-1.5">
                {ordenados.map((paso) => <Fila key={paso.id} paso={paso} />)}
            </ul>
        </div>
    );
}
