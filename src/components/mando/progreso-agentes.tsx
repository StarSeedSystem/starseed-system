"use client";

/**
 * Barra de progreso por agente, con la fase en que va y qué significa (2026-09-15).
 *
 * Alex lo pidió dos veces: «una barra de progreso de cada agente con descripción de
 * cada fase de su desarrollo hasta su completación». Hasta ahora el Mando decía
 * «3 tareas en curso» y ya: ni en qué punto va cada una, ni cuánto le queda, ni si
 * lleva media hora atascada en la misma fase.
 *
 * La lógica de etapas NO se reinventa aquí: sale de `@/lib/mando/etapas`, que ya
 * sabe traducir la fase cruda del latido, calcular el porcentaje y decidir si una
 * etapa lleva demasiado tiempo. Esto solo lo dibuja.
 */

import { useMemo } from "react";

import { ETAPAS, pasoDeTarea, type Desenlace, type Etapa, type PasoTarea } from "@/lib/mando/etapas";
import type { LatidoTarea } from "@/lib/mando/tipos";

/** Qué pasa de verdad en cada etapa, dicho para una persona. */
const QUE_PASA: Record<Etapa, string> = {
    escribiendo: "el agente está creando y editando los archivos de la tarea",
    verificando: "se comprueban los tipos con tsc; un error aquí devuelve la tarea al agente",
    probando: "se ejecutan las pruebas del área tocada",
    revisando: "otro proveedor lee el diff y busca defectos reales",
    "visto bueno": "espera a que una persona apruebe o rechace",
    integrada: "el commit ya está en main",
};

const COLOR_DESENLACE: Record<Desenlace, string> = {
    "en marcha": "bg-cyan-400",
    atascada: "bg-amber-400",
    parada: "bg-rose-400",
    integrada: "bg-emerald-400",
};

const TEXTO_DESENLACE: Record<Desenlace, string> = {
    "en marcha": "text-cyan-200",
    atascada: "text-amber-200",
    parada: "text-rose-200",
    integrada: "text-emerald-200",
};

function FilaAgente({ paso }: { paso: PasoTarea }) {
    return (
        <li className="rounded-lg border border-white/10 bg-black/25 p-2.5">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-[11px] text-cyan-200/90">{paso.id}</span>
                <span className={`text-[11px] font-medium ${TEXTO_DESENLACE[paso.desenlace]}`}>{paso.etapa}</span>
                <span className="text-[10px] text-white/40">{paso.porcentaje} %</span>
                {paso.modelo ? (
                    <span className="ml-auto truncate text-[10px] text-white/35">
                        {paso.modelo.split("/").slice(-1)[0]}
                    </span>
                ) : null}
            </p>

            {/* Las seis etapas como seis tramos: se ve de un vistazo dónde va y cuánto
                queda. El tramo actual late; los pasados quedan apagados pero llenos. */}
            <ol className="mt-1.5 flex gap-1" aria-label={`Etapas de ${paso.id}`}>
                {ETAPAS.map((etapa, i) => {
                    const pasada = i < paso.indice;
                    const actual = i === paso.indice;
                    return (
                        <li
                            key={etapa}
                            title={`${etapa}: ${QUE_PASA[etapa]}`}
                            className={`h-1.5 flex-1 rounded-full ${
                                actual
                                    ? `${COLOR_DESENLACE[paso.desenlace]} ${paso.desenlace === "en marcha" ? "mc-latido" : ""}`
                                    : pasada
                                      ? "bg-white/35"
                                      : "bg-white/8"
                            }`}
                        />
                    );
                })}
            </ol>

            {/* El porqué: qué está pasando en esta etapa y cuánto lleva. Sin esto la
                barra es decoración; con esto se sabe si hay que intervenir. */}
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/50">
                {QUE_PASA[paso.etapa]} · <span className="text-white/70">{paso.detalle}</span>
            </p>
        </li>
    );
}

export function ProgresoAgentes({
    latidos,
    progreso = {},
}: {
    latidos: LatidoTarea[];
    /** Estado de cada tarea, para distinguir «esperando visto bueno» de «escribiendo». */
    progreso?: Record<string, string | undefined>;
}) {
    const pasos = useMemo(() => {
        const ahora = Date.now();
        return latidos
            .map((l) =>
                pasoDeTarea(
                    {
                        id: l.tarea,
                        fase: l.fase,
                        estado: progreso[l.tarea],
                        // El latido trae los minutos que lleva la tarea; la etapa empezó
                        // como mucho hace esos minutos.
                        minutosDesde: ahora - Math.max(0, l.minutos) * 60_000,
                        modelo: l.modelo,
                    },
                    ahora,
                ),
            )
            .filter((p): p is PasoTarea => p !== null)
            // Lo que más necesita atención, arriba: parada, atascada, en marcha, integrada.
            .sort((a, b) => {
                const peso: Record<Desenlace, number> = {
                    parada: 0,
                    atascada: 1,
                    "en marcha": 2,
                    integrada: 3,
                };
                return peso[a.desenlace] - peso[b.desenlace] || a.id.localeCompare(b.id);
            });
    }, [latidos, progreso]);

    if (pasos.length === 0) {
        return (
            <p className="text-[11px] text-white/45">
                Ningún agente está escribiendo ahora mismo. Cuando arranque uno, aquí se verá en qué fase va y
                cuánto lleva en ella.
            </p>
        );
    }

    return (
        <ul className="space-y-1.5">
            {pasos.map((p) => (
                <FilaAgente key={p.id} paso={p} />
            ))}
        </ul>
    );
}
