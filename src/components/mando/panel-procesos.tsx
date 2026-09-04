"use client";

/**
 * Panel de procesos del Centro de Mando (Ola 231)
 * ─────────────────────────────────────────────────────────────────────────────
 * Qué está corriendo AHORA MISMO en la máquina y en el repositorio: si el
 * enjambre libre está activo, el estado del repositorio (rama, HEAD, commits
 * sin publicar, cambios sin commit y último registro) y los últimos eventos
 * de la bitácora del relevo (quién hizo qué).
 *
 * Lee `GET /api/mando/estado` (solo local; 404 en producción; sin claves ni
 * rutas absolutas del disco) y complementa con `/api/mando/estado` → `relevo`.
 */

import { useCallback, useEffect, useState } from "react";
import {
    BotMessageSquare,
    CircleDashed,
    GitBranch,
    RefreshCw,
} from "lucide-react";

import type { EstadoMando } from "@/lib/mando/tipos";

/** Formatea una fecha ISO a hora local corta. */
function horaCorta(fecha: string): string {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return fecha;
    return d.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Tarjeta pequeña de indicador. */
function Indicador({
    titulo,
    valor,
    detalle,
    activo,
}: {
    titulo: string;
    valor: string;
    detalle?: string;
    activo?: boolean;
}) {
    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">
                    {titulo}
                </h3>
                <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                        activo === undefined
                            ? "bg-white/20"
                            : activo
                              ? "bg-emerald-400"
                              : "bg-zinc-600"
                    }`}
                    aria-hidden
                />
            </div>
            <p className="mt-1 text-lg font-semibold text-white">{valor}</p>
            {detalle && <p className="mt-0.5 text-xs text-white/50">{detalle}</p>}
        </article>
    );
}

export function PanelProcesos() {
    const [estado, setEstado] = useState<EstadoMando | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);

    const recargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/estado", { cache: "no-store" });
            if (!respuesta.ok) {
                // Un mensaje que no distingue el motivo hace perder el tiempo: 404 es que la
                // consola está apagada en esta instancia; 401 es que falta la sesión.
                setError(
                    respuesta.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : respuesta.status === 401
                          ? "Necesitas iniciar sesión para ver el estado del mando."
                          : `No se pudo leer el estado del mando (HTTP ${respuesta.status}).`,
                );
                setEstado(null);
                return;
            }
            setEstado((await respuesta.json()) as EstadoMando);
        } catch {
            setError("No se pudo leer el estado del mando.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar();
    }, [recargar]);

    if (cargando && !estado) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo los procesos…
            </div>
        );
    }

    if (error || !estado) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error ?? "Sin datos del mando."}
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

    const relevo = estado.relevo;
    const repo = estado.repo;
    const eventos = (relevo?.eventos ?? []).slice(0, 12);

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Indicador
                    titulo="Enjambre libre"
                    valor={relevo?.enjambreActivo ? "Activo" : "Detenido"}
                    detalle={
                        relevo?.enjambreActivo
                            ? "Hay olas ejecutándose en segundo plano."
                            : "Ninguna ola automática en marcha."
                    }
                    activo={relevo?.enjambreActivo ?? false}
                />
                <Indicador
                    titulo="Rama"
                    valor={repo?.rama ?? "—"}
                    detalle={repo?.head ? `HEAD ${repo.head}` : "Repositorio no localizado"}
                />
                <Indicador
                    titulo="Commits sin publicar"
                    valor={
                        repo?.sinPush === undefined || repo?.sinPush === null
                            ? "—"
                            : String(repo.sinPush)
                    }
                    detalle="Respeto al remoto (`@{upstream}..HEAD`)."
                    activo={repo?.sinPush ? repo.sinPush > 0 : false}
                />
                <Indicador
                    titulo="Cambios sin commit"
                    valor={
                        repo?.sinCommit === undefined || repo?.sinCommit === null
                            ? "—"
                            : String(repo.sinCommit)
                    }
                    detalle="Árbol de trabajo pendiente de comitear."
                    activo={repo?.sinCommit ? repo.sinCommit > 0 : false}
                />
            </div>

            {repo?.log && repo.log.length > 0 && (
                <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <GitBranch className="h-4 w-4 text-white/60" aria-hidden />
                        Últimos commits
                    </h3>
                    <ul className="mt-2 space-y-1 font-mono text-xs text-white/70">
                        {repo.log.slice(0, 8).map((linea) => (
                            <li key={linea} className="truncate">
                                {linea}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <header className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <BotMessageSquare className="h-4 w-4 text-white/60" aria-hidden />
                        Últimos eventos del relevo
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
                {eventos.length === 0 ? (
                    <p className="mt-2 text-sm text-white/50">
                        No hay eventos recientes en la bitácora.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {eventos.map((evento) => (
                            <li
                                key={evento.id}
                                className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                            >
                                <div className="flex items-center justify-between gap-2 text-[11px] text-white/50">
                                    <span className="font-medium text-white/70">
                                        {evento.quien || "¿?"}
                                        {evento.tarea ? ` · ${evento.tarea}` : ""}
                                    </span>
                                    <span>{horaCorta(evento.t)}</span>
                                </div>
                                <p className="mt-0.5 text-sm text-white/80">{evento.texto}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
