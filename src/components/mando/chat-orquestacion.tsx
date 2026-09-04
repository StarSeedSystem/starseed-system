"use client";

/**
 * Chat de orquestación del Centro de Mando (Ola 231)
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista conversacional del bus del enjambre (`relevo_eventos`): cada evento
 * aparece como un mensaje, con su autor (Claude, Hermes, el enjambre…), su
 * tarea y su texto. Sondeo cada 15 segundos para que la conversación siga a
 * lo que la flota está haciendo sin recargar la página.
 *
 * Es SOLO LECTURA: hablar con los agentes se hace a través de sus propios
 * canales (Cowork, Hermes CLI, crons); aquí se observa. Jamás toca claves ni
 * rutas del disco: la tabla solo guarda texto y metadatos.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDashed, MessagesSquare, RefreshCw } from "lucide-react";

import { cargarEventos, clasificar } from "@/lib/mando/eventos";
import type { EventoRelevo } from "@/lib/mando/tipos";

/** Intervalo de sondeo del bus (ms). */
const SONDA_MS = 15_000;

/** Formatea una fecha ISO a hora local corta. */
function horaCorta(fecha: string): string {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return fecha;
    return d.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Un mensaje del chat de orquestación. */
function Mensaje({ evento }: { evento: EventoRelevo }) {
    const estilo = clasificar(evento);
    return (
        <article
            className="rounded-xl border bg-black/30 p-3"
            style={{ borderColor: `${estilo.color}33` }}
        >
            <header className="flex items-center justify-between gap-2 text-[11px]">
                <span
                    className="inline-flex items-center gap-1.5 font-medium"
                    style={{ color: estilo.color }}
                >
                    <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: estilo.color }}
                        aria-hidden
                    />
                    {evento.quien || "¿?"}
                    {evento.tarea && (
                        <span className="text-white/50">· {evento.tarea}</span>
                    )}
                    {evento.tipo && (
                        <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                            {evento.tipo}
                        </span>
                    )}
                </span>
                <time className="text-white/40">{horaCorta(evento.t)}</time>
            </header>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-white/85">{evento.texto}</p>
        </article>
    );
}

export function ChatOrquestacion() {
    const [eventos, setEventos] = useState<EventoRelevo[]>([]);
    const [cargando, setCargando] = useState(true);
    const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

    const recargar = useCallback(async () => {
        const lista = await cargarEventos(0, 100);
        // `cargarEventos` devuelve los más recientes primero: invertimos para
        // que la conversación se lea de arriba a abajo.
        setEventos([...lista].reverse());
        setCargando(false);
    }, []);

    useEffect(() => {
        void recargar();
        sondeo.current = setInterval(() => {
            void recargar();
        }, SONDA_MS);
        return () => {
            if (sondeo.current) clearInterval(sondeo.current);
        };
    }, [recargar]);

    return (
        <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <MessagesSquare className="h-4 w-4 text-white/60" aria-hidden />
                    Chat de orquestación
                    <span className="text-xs font-normal text-white/40">
                        (solo lectura · bus `relevo_eventos`)
                    </span>
                </h3>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Actualizar
                </button>
            </header>

            {cargando && eventos.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-white/60">
                    <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                    Cargando la conversación…
                </p>
            ) : eventos.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">
                    Todavía no hay mensajes en el bus del relevo.
                </p>
            ) : (
                <ol className="mt-4 space-y-2.5">
                    {eventos.map((evento, índice) => (
                        <li key={evento.id || `ev-${índice}`}>
                            <Mensaje evento={evento} />
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
