"use client";

/**
 * Panel de entornos del Centro de Mando (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * Salud en vivo de los entornos del proyecto, agrupados por tipo: desarrollo,
 * producción, backend, bases de datos, agentes y nube. Cada tarjeta muestra su
 * punto de salud (verde vivo · rojo caído · gris sin comprobar), la latencia,
 * enlaces a la URL y al panel/consola, los NOMBRES de las variables de entorno
 * implicadas (jamás su valor) y una nota.
 *
 * Lee `GET /api/mando/entornos` (solo local; 404 en producción) y se refresca
 * solo cada 30 s; también hay botón «Actualizar».
 */

import { useCallback, useEffect, useState } from "react";
import {
    CircleDashed,
    ExternalLink,
    LayoutDashboard,
    RefreshCw,
} from "lucide-react";

import type { Entorno, EstadoEntorno, TipoEntorno } from "@/lib/mando/entornos";

/** Respuesta de `GET /api/mando/entornos`. */
interface RespuestaEntornos {
    entornos: Entorno[];
    generadoEn: string;
}

/** Orden y título de los grupos por tipo de entorno. */
const GRUPOS: { tipo: TipoEntorno; titulo: string }[] = [
    { tipo: "desarrollo", titulo: "Desarrollo" },
    { tipo: "produccion", titulo: "Producción" },
    { tipo: "backend", titulo: "Backend" },
    { tipo: "base-de-datos", titulo: "Bases de datos" },
    { tipo: "agente", titulo: "Agentes" },
    { tipo: "nube", titulo: "Nube" },
];

/** Etiqueta corta del estado de salud. */
function textoEstado(estado: EstadoEntorno): string {
    if (estado === "vivo") return "Vivo";
    if (estado === "caido") return "Caído";
    return "Sin comprobar";
}

/** Color del punto de salud según el estado. */
function colorEstado(estado: EstadoEntorno): string {
    if (estado === "vivo") return "bg-emerald-400";
    if (estado === "caido") return "bg-red-500";
    return "bg-zinc-500";
}

/** Formatea la latencia en milisegundos o segundos. */
function latenciaTexto(ms?: number): string {
    if (ms === undefined) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${ms} ms`;
}

/** Tarjeta de un entorno con su salud, enlaces, variables y nota. */
function TarjetaEntorno({ entorno }: { entorno: Entorno }) {
    return (
        <article className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-white">{entorno.nombre}</h4>
                <span className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <span
                        className={`h-2 w-2 shrink-0 rounded-full ${colorEstado(entorno.estado)}`}
                        aria-hidden
                    />
                    {textoEstado(entorno.estado)}
                    {entorno.latenciaMs !== undefined && (
                        <span className="text-white/40">· {latenciaTexto(entorno.latenciaMs)}</span>
                    )}
                </span>
            </header>

            {(entorno.url || entorno.enlacePanel) && (
                <div className="flex flex-wrap gap-2">
                    {entorno.url && (
                        <a
                            href={entorno.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                        >
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            Abrir
                        </a>
                    )}
                    {entorno.enlacePanel && (
                        <a
                            href={entorno.enlacePanel}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                        >
                            <LayoutDashboard className="h-3 w-3" aria-hidden />
                            Panel
                        </a>
                    )}
                </div>
            )}

            {entorno.variables.length > 0 && (
                <ul
                    className="flex flex-wrap gap-1"
                    aria-label={`Variables de entorno de ${entorno.nombre}`}
                >
                    {entorno.variables.map((variable, índice) => (
                        <li
                            key={variable || `var-${índice}`}
                            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/60"
                        >
                            {variable}
                        </li>
                    ))}
                </ul>
            )}

            <p className="text-xs text-white/50">{entorno.nota}</p>
        </article>
    );
}

export function PanelEntornos() {
    const [entornos, setEntornos] = useState<Entorno[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);

    const recargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/entornos", { cache: "no-store" });
            if (!respuesta.ok) {
                // 404 = consola apagada en esta instancia; 401 = falta la sesión;
                // cualquier otro código se muestra tal cual.
                setError(
                    respuesta.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : respuesta.status === 401
                          ? "Necesitas iniciar sesión para ver los entornos."
                          : `No se pudieron leer los entornos (HTTP ${respuesta.status}).`,
                );
                setEntornos(null);
                return;
            }
            const datos = (await respuesta.json()) as RespuestaEntornos;
            setEntornos(datos.entornos);
        } catch {
            setError("No se pudieron leer los entornos.");
            setEntornos(null);
        } finally {
            setCargando(false);
        }
    }, []);

    // Carga inicial y refresco automático cada 30 s, limpiado al desmontar.
    useEffect(() => {
        void recargar();
        const intervalo = window.setInterval(() => {
            void recargar();
        }, 30_000);
        return () => window.clearInterval(intervalo);
    }, [recargar]);

    if (cargando && !entornos) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Midiendo la salud de los entornos…
            </div>
        );
    }

    if (error || !entornos) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error ?? "Sin datos de entornos."}
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <header className="flex items-center justify-between gap-2">
                <p className="text-xs text-white/50">
                    Se refresca solo cada 30 segundos. Los chips muestran solo el
                    NOMBRE de cada variable, nunca su valor.
                </p>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw
                        className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`}
                        aria-hidden
                    />
                    Actualizar
                </button>
            </header>

            {GRUPOS.map((grupo) => {
                const delGrupo = entornos.filter((e) => e.tipo === grupo.tipo);
                if (delGrupo.length === 0) return null;
                return (
                    <section key={grupo.tipo} className="space-y-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">
                            {grupo.titulo}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {delGrupo.map((entorno, índice) => (
                                <TarjetaEntorno
                                    key={entorno.id || `entorno-${índice}`}
                                    entorno={entorno}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
