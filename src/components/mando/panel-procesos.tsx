"use client";

/** Panel de procesos del Centro de Mando (Ola 231)
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
    X,
} from "lucide-react";

import type { EstadoMando, LatidoTarea } from "@/lib/mando/tipos";
import { RamificacionAgentes } from "@/components/mando/ramificacion-agentes";
import { Ramificacion158 } from "@/components/mando/ramificacion-158";
import { PanelGrafo } from "@/components/mando/panel-grafo";
import { pedirVerTarea } from "@/lib/mando/asistente-cliente";
import { ETAPAS } from "@/lib/mando/etapas";
import { filaDeLatido } from "@/lib/mando/fila-agente";

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

/** Miles con punto, para tokens. */
function miles(n: number | undefined | null): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    return n.toLocaleString("es-ES");
}

/** Color por fase: lo que hace el agente, de un vistazo. */
function tonoFase(fase: string): string {
    if (fase === "escribiendo") return "text-emerald-300";
    if (fase === "tsc" || fase === "tests") return "text-sky-300";
    if (fase === "revision" || fase === "integrando") return "text-amber-300";
    if (fase.startsWith("esperando")) return "text-white/50";
    if (fase === "bloqueado" || fase === "colgado") return "text-red-400";
    return "text-white/70";
}

/** Detecta si un agente lleva demasiado tiempo quieto (API colgada). */
function esAgenteColgado(latido: any): boolean {
    return Number(latido?.quietoSegundos ?? 0) > 300 && Number(latido?.bytesLog ?? 0) < 100;
}

/** Etiqueta de advertencia para agentes colgados. */
function avisoColgado(latido: any): string | null {
    if (esAgenteColgado(latido)) {
        const min = Math.round(latido.quietoSegundos / 60);
        return `⚠️ API colgada ${min} min · reasignar`;
    }
    return null;
}

/** Ficha desplegable con el detalle completo del latido del agente. */
function FichaAgente({ latido, onClose }: { latido: LatidoTarea; onClose: () => void }) {
    const datos = filaDeLatido(latido, Date.now());
    return (
        <article className="mt-3 rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 text-xs backdrop-blur">
            <header className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <div>
                    <h4 className="font-semibold text-white">Ficha del agente · {datos.tarea}</h4>
                    <p className="text-[11px] text-white/50">{datos.titulo}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                    title="Cerrar ficha"
                >
                    <X className="h-4 w-4" aria-hidden />
                </button>
            </header>
            <div className="mt-3 grid grid-cols-2 gap-2 text-white/80">
                <div>
                    <span className="text-[10px] uppercase text-white/40">Fase / Etapa</span>
                    <p className="font-medium text-cyan-200">
                        {datos.fase} · {datos.etapa.nombre} ({datos.etapa.porcentaje}%)
                        {datos.etapa.atascada ? <span className="ml-1 text-amber-300">⚠️ Atascada</span> : null}
                    </p>
                </div>
                <div>
                    <span className="text-[10px] uppercase text-white/40">Modelo / Proveedor</span>
                    <p className="font-mono text-white/90">
                        {datos.modelo} {datos.proveedor ? `(${datos.proveedor})` : ""}
                    </p>
                </div>
                <div>
                    <span className="text-[10px] uppercase text-white/40">Medio / IDE</span>
                    <p className="text-violet-200">
                        {datos.medio} {datos.ide ? `· IDE: ${datos.ide}` : ""}
                    </p>
                </div>
                <div>
                    <span className="text-[10px] uppercase text-white/40">Tiempo / Intento</span>
                    <p className="text-white/80">
                        {datos.minutos} min {datos.intento && datos.intento > 1 ? `· Intento ${datos.intento}` : ""}
                    </p>
                </div>
                {datos.tokens && (
                    <div className="col-span-2">
                        <span className="text-[10px] uppercase text-white/40">Tokens gastados</span>
                        <p className="font-mono text-white/80">
                            {miles(datos.tokens.entrada)} entrada / {miles(datos.tokens.salida)} salida
                        </p>
                    </div>
                )}
            </div>
            <footer className="mt-3 flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-[10px] text-white/40">Acción secundaria</span>
                <button
                    type="button"
                    onClick={() => pedirVerTarea(datos.tarea)}
                    className="cursor-pointer rounded-md border border-violet-400/40 bg-violet-500/20 px-2.5 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/30"
                    title="Pregunta a la orbe sobre esta tarea"
                >
                    Preguntar a la orbe
                </button>
            </footer>
        </article>
    );
}

/** Agentes trabajando: una fila por agente, venga de esta Mac o del contenedor de la nube.
 * Todo sale del latido que cada orquestador publica en el bus cada 2 min: tarea, fase,
 * modelo y proveedor, ventana de contexto, tokens REALES gastados (de la base de opencode),
 * tiempo, y si lleva rato mudo.
 */
function AgentesEnVivo({ estado }: { estado: EstadoMando }) {
    const latidos = estado.latidos ?? [];
    const enjambres = estado.enjambres ?? [];
    const [tareaSeleccionada, setTareaSeleccionada] = useState<string | null>(null);

    const latidoSeleccionado = latidos.find((l) => l.tarea === tareaSeleccionada);

    if (latidos.length === 0 && enjambres.length === 0) {
        return (
            <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <h3 className="text-sm font-semibold text-white">Agentes trabajando</h3>
                <p className="mt-2 text-sm text-white/50">
                    Ningún orquestador ha latido en los últimos minutos, ni aquí ni en la nube.
                </p>
            </section>
        );
    }
    return (
        <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">
                    Agentes trabajando · {latidos.length}
                </h3>
                <div className="flex flex-wrap gap-2 text-[11px] text-white/60">
                    {enjambres.map((e) => (
                        <span
                            key={`${e.donde}-${e.cola}`}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1"
                            title={Object.entries(e.proveedores ?? {})
                                .map(([p, v]) => `${p}: ${v.estado} · ${v.llamadasMin}/${v.rpm} por min`)
                                .join("\n")}
                        >
                            <span className={e.donde === "nube" ? "text-sky-300" : "text-amber-300"}>
                                {e.donde === "nube" ? "nube" : "mac"}
                            </span>
                            {" · "}
                            {e.cola.replace(/^cola-/, "").replace(/\.json$/, "").replace(/_/g, " ")} · {e.agentesActivos} escribiendo
                            {typeof e.memoriaMb === "number" ? ` · ${miles(e.memoriaMb)} MB libres` : ""}
                            {" · "}
                            {Object.values(e.proveedores ?? {}).filter((v) => v.estado === "caido").length} prov. caídos
                        </span>
                    ))}
                </div>
            </header>
            <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wide text-white/40">
                        <tr>
                            <th className="py-1 pr-3">Dónde</th>
                            <th className="py-1 pr-3">Medio</th>
                            <th className="py-1 pr-3">Tarea</th>
                            <th className="py-1 pr-3">Fase</th>
                            <th className="py-1 pr-3">Etapa</th>
                            <th className="py-1 pr-3">Modelo · proveedor</th>
                            <th className="py-1 pr-3">Ventana</th>
                            <th className="py-1 pr-3">Tokens (in / out)</th>
                            <th className="py-1 pr-3">Llamadas</th>
                            <th className="py-1 pr-3">Tiempo</th>
                            <th className="py-1 pr-3">Registro</th>
                            <th className="py-1 pr-3" title="Cambiar servidor, API o modelo de este agente">
                                Reasignar
                            </th>
                        </tr>
                    </thead>
                    <tbody className="text-white/80">
                        {latidos.map((l, i) => {
                            const datosFila = filaDeLatido(l, Date.now());
                            const esSeleccionado = tareaSeleccionada === l.tarea;
                            return (
                                <tr
                                    key={`${l.donde}-${l.cola}-${l.tarea}-${i}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setTareaSeleccionada(esSeleccionado ? null : l.tarea)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setTareaSeleccionada(esSeleccionado ? null : l.tarea);
                                        }
                                    }}
                                    className={`border-t border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${
                                        esSeleccionado ? "bg-violet-500/15 border-violet-500/30" : ""
                                    }`}
                                >
                                    <td className={`py-1.5 pr-3 font-medium ${l.donde === "nube" ? "text-sky-300" : "text-amber-300"}`}>
                                        {l.donde}
                                    </td>
                                    <td className="py-1.5 pr-3 text-violet-200"
                                        title="Desde dónde se usan las APIs: quién lanzó el orquestador">
                                        {l.medio ?? "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 font-mono">{l.tarea}</td>
                                    <td className={`py-1.5 pr-3 ${tonoFase(l.fase)}`}>
                                        {l.fase}
                                        {l.quietoSegundos > 180 ? ` · mudo ${Math.round(l.quietoSegundos / 60)} min` : ""}
                                        {avisoColgado(l)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        <div
                                            className="flex w-20 items-center gap-0.5"
                                            title={`${datosFila.etapa.nombre} (${datosFila.etapa.porcentaje}%)`}
                                        >
                                            {ETAPAS.map((etapaNombre, idx) => {
                                                const pasada = idx < datosFila.etapa.indice;
                                                const actual = idx === datosFila.etapa.indice;
                                                return (
                                                    <span
                                                        key={etapaNombre}
                                                        className={`h-1.5 flex-1 rounded-full ${
                                                            actual
                                                                ? datosFila.etapa.atascada
                                                                    ? "bg-amber-400 mc-latido"
                                                                    : l.fase === "escribiendo"
                                                                      ? "bg-emerald-400 mc-latido"
                                                                      : l.fase === "tsc" || l.fase === "tests"
                                                                        ? "bg-sky-400 mc-latido"
                                                                        : l.fase === "revision" || l.fase === "integrando"
                                                                          ? "bg-amber-400 mc-latido"
                                                                          : "bg-cyan-400 mc-latido"
                                                                : pasada
                                                                  ? "bg-white/30"
                                                                  : "bg-white/10"
                                                        }`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {(l.modelo || "—").split("/").slice(-1)[0]}
                                        {l.proveedor ? <span className="text-white/40"> · {l.proveedor}</span> : null}
                                    </td>
                                    <td className="py-1.5 pr-3 text-white/60">
                                        {l.ventana ? `${Math.round(l.ventana / 1024)}k` : "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 font-mono">
                                        {l.tokens ? `${miles(l.tokens?.entrada)} / ${miles(l.tokens?.salida)}` : "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 text-white/60">
                                        {l.tokens ? l.tokens.llamadas : "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 text-white/60">
                                        {l.minutos} min{l.intento && l.intento > 1 ? ` · intento ${l.intento}` : ""}
                                    </td>
                                    <td className="py-1.5 pr-3 text-white/60">
                                        {l.bytesLog ? `${Math.round(l.bytesLog / 1024)} KB` : "—"}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                pedirVerTarea(l.tarea);
                                            }}
                                            className="cursor-pointer rounded-md border border-violet-400/30 px-2 py-0.5 text-[11px] text-violet-200 hover:bg-violet-400/10"
                                            title="Abre la ficha de la tarea en la ramificación, donde se cambia servidor, API o modelo"
                                        >
                                            servidor · API · modelo
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {latidoSeleccionado && (
                <FichaAgente latido={latidoSeleccionado} onClose={() => setTareaSeleccionada(null)} />
            )}
            <p className="mt-2 text-[11px] text-white/40">
                Tokens = suma real de entrada/salida de cada llamada del agente (base de opencode), no una estimación.
                La ventana es la del modelo; el consumo de contexto crece con cada archivo que lee.
                "Medio" = desde dónde se usan las APIs: quién lanzó ese orquestador (hermes, claude, terminal, mando, cron…).
            </p>
        </section>
    );
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
        // En vivo: el estado se relee cada 20 s (los latidos del enjambre llegan cada 20 s / 2 min).
        const id = window.setInterval(() => void recargar(), 20_000);
        return () => window.clearInterval(id);
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
            {/* (2026-09-15) Alex: «traslada y fusiona eso con la ventana de ramificación y
                también la de Ramificación 1.58». Había TRES ventanas seguidas hablando de lo
                mismo —quién trabaja ahora— cada una con su propio marco y su propio título:
                la ramificación de olas, la del backend 1.58 y «Agentes en vivo». Tres bloques
                para una sola pregunta. Ahora es UNA ventana; lo local y los latidos entran
                plegados, porque se consultan de vez en cuando y no todo el rato. */}
            <section className="mc-cristal space-y-3 p-4">
                <RamificacionAgentes />

                <details className="group rounded-lg border border-white/10 bg-black/20">
                    <summary className="mc-alzar cursor-pointer list-none px-3 py-2 text-[11px] text-white/65">
                        <span className="font-medium text-white/80">Grafo de dependencias</span>
                        <span className="ml-2 text-white/40">
                            el mismo trabajo dibujado: qué desbloquea qué, en SVG puro
                        </span>
                    </summary>
                    <div className="border-t border-white/10 p-3">
                        <PanelGrafo />
                    </div>
                </details>

                <details className="group rounded-lg border border-white/10 bg-black/20">
                    <summary className="mc-alzar cursor-pointer list-none px-3 py-2 text-[11px] text-white/65">
                        <span className="font-medium text-white/80">Personalidades y agentes locales (1.58)</span>
                        <span className="ml-2 text-white/40">
                            trabajan con el BitNet local y respetan el turno de memoria
                        </span>
                    </summary>
                    <div className="border-t border-white/10 p-3">
                        <Ramificacion158 />
                    </div>
                </details>

                <details className="group rounded-lg border border-white/10 bg-black/20">
                    <summary className="mc-alzar cursor-pointer list-none px-3 py-2 text-[11px] text-white/65">
                        <span className="font-medium text-white/80">Latidos en vivo</span>
                        <span className="ml-2 text-white/40">el pulso crudo de cada agente, tal cual llega al bus</span>
                    </summary>
                    <div className="border-t border-white/10 p-3">
                        <AgentesEnVivo estado={estado} />
                    </div>
                </details>
            </section>
            {/* (2026-09-15) Aquí había cuatro indicadores —Enjambre libre, Rama, Commits sin
                publicar y Cambios sin commit— que repetían, palabra por palabra, medidores que
                ya están en la cabecera y que ahora además se abren con su detalle. Dos sitios
                distintos diciendo el mismo número es la forma más fácil de que un día digan
                números distintos. Se quedan solo en la cabecera. Lo único que no estaba arriba
                —la rama y su HEAD— entra en una línea, sin marco propio. */}
            <p className="text-[11px] text-white/45">
                Rama <span className="font-mono text-white/70">{repo?.rama ?? "—"}</span>
                {repo?.head ? <> · HEAD <span className="font-mono text-white/70">{repo.head}</span></> : null}
                {repo?.sinCommit ? <> · {repo.sinCommit} archivos sin commitear</> : null}
            </p>

            {repo?.log && repo.log.length > 0 && (
                <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <GitBranch className="h-4 w-4 text-white/60" aria-hidden />
                        Últimos commits
                    </h3>
                    <ul className="mt-2 space-y-1 font-mono text-xs text-white/70">
                        {repo.log.slice(0, 8).map((linea, índice) => (
                            <li
                                key={`log-${índice}-${linea.slice(0, 12)}`}
                                className="truncate"
                            >
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
                        {eventos.map((evento, índice) => (
                            <li
                                key={evento.id || `ev-${índice}`}
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
            
            <section className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-sm font-semibold text-white">Dirección de orquestación</h3>
                <p className="mt-2 text-sm text-white/60">
                    Los agentes y sus fases se muestran arriba desde los latidos observados.
                    Las cuotas, conexiones y verificaciones de los directores aún requieren
                    una fuente comprobable; no se presentan como datos medidos.
                </p>
                <button type="button" onClick={() => void recargar()}
                    className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-white/70">
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Actualizar procesos observados
                </button>
            </section>
        </div>
    );
}
