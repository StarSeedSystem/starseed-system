"use client";

/** Pestaña «Ramificación»: el grafo de orquestación en SVG puro (Ola 239 · MD7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Columnas fijas (olas → tareas → modelos → revisores → commits), aristas
 * bezier con opacidad baja y color por tipo, tooltip al pasar el ratón, panel
 * lateral al hacer clic y selector de ola. Sin librerías de grafo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDashed, RefreshCw } from "lucide-react";

import type { AristaGrafo, GrafoOrquestacion, NodoGrafo } from "@/lib/mando/tipos";
import {
    ANCHO_COLUMNA,
    colorArista,
    disponerGrafo,
    etiquetaEstado,
    olasDelGrafo,
    rutaBezier,
    tonoNodoTarea,
} from "@/lib/mando/grafo-disposicion";

const TEXTO_TIPO: Record<NodoGrafo["tipo"], string> = {
    ola: "Ola",
    tarea: "Tarea",
    modelo: "Modelo",
    revisor: "Revisor",
    commit: "Commit",
};

const ETIQUETAS_LEYENDA: { tipo: AristaGrafo["tipo"]; texto: string }[] = [
    { tipo: "contiene", texto: "contiene" },
    { tipo: "depende", texto: "depende" },
    { tipo: "escribio", texto: "escribió" },
    { tipo: "reviso", texto: "revisó" },
    { tipo: "produjo", texto: "produjo" },
];

/** Leyenda de colores de aristas y de estados de tarea. */
function Leyenda() {
    return (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
            {ETIQUETAS_LEYENDA.map((e) => (
                <span key={`leyenda-${e.tipo}`} className="inline-flex items-center gap-1">
                    <span
                        className="h-0.5 w-4 rounded"
                        style={{ backgroundColor: colorArista(e.tipo) }}
                        aria-hidden
                    />
                    {e.texto}
                </span>
            ))}
            <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#34d399" }} aria-hidden />
                commit
            </span>
            <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#a1a1aa" }} aria-hidden />
                sin cambios
            </span>
            <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f87171" }} aria-hidden />
                fallo / conflicto
            </span>
            <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#60a5fa" }} aria-hidden />
                en curso
            </span>
        </div>
    );
}

export function PanelGrafo() {
    const [grafo, setGrafo] = useState<GrafoOrquestacion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [filtroOla, setFiltroOla] = useState<string | null>(null);
    const [nodoActivo, setNodoActivo] = useState<NodoGrafo | null>(null);
    const [nodoDetalle, setNodoDetalle] = useState<NodoGrafo | null>(null);
    const [raton, setRaton] = useState<{ x: number; y: number } | null>(null);

    const recargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/grafo", { cache: "no-store" });
            if (!respuesta.ok) {
                setError(
                    respuesta.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : respuesta.status === 401
                          ? "Necesitas iniciar sesión para ver el grafo del mando."
                          : `No se pudo leer el grafo del mando (HTTP ${respuesta.status}).`,
                );
                setGrafo(null);
                return;
            }
            setGrafo((await respuesta.json()) as GrafoOrquestacion);
        } catch {
            setError("No se pudo leer el grafo del mando.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar();
    }, [recargar]);

    const olas = useMemo(
        () => (grafo ? olasDelGrafo(grafo.nodos) : []),
        [grafo],
    );
    const disposicion = useMemo(
        () => (grafo ? disponerGrafo(grafo, filtroOla) : null),
        [grafo, filtroOla],
    );

    const nodoPorId = useMemo(
        () => new Map((grafo?.nodos ?? []).map((n) => [n.id, n])),
        [grafo],
    );

    /** Aristas que tocan el nodo activo (hover): se resaltan, el resto se atenúa. */
    const aristasDelNodo = useMemo(() => {
        const conjunto = new Set<string>();
        if (!nodoActivo) return conjunto;
        for (const a of disposicion?.aristas ?? []) {
            if (a.de === nodoActivo.id || a.a === nodoActivo.id) {
                conjunto.add(`${a.de}→${a.a}`);
            }
        }
        return conjunto;
    }, [nodoActivo, disposicion]);

    if (cargando && !grafo) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Dibujando el grafo de orquestación…
            </div>
        );
    }

    if (error || !grafo || !disposicion) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error ?? "Sin datos del grafo."}
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
        <section className="space-y-3">
            <header className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Ramificación</h3>
                <label className="flex items-center gap-1 text-xs text-white/60">
                    Ola
                    <select
                        value={filtroOla ?? ""}
                        onChange={(e) => setFiltroOla(e.target.value || null)}
                        className="cursor-pointer rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                    >
                        <option value="">Todas</option>
                        {olas.map((o) => (
                            <option key={`ola-${o}`} value={o}>
                                {o}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Actualizar
                </button>
            </header>

            <Leyenda />

            {grafo.nodos.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/50">
                    No hay olas ni tareas que dibujar todavía.
                </p>
            ) : (
                <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                    <div className="relative overflow-auto rounded-xl border border-white/10 bg-black/30 motion-safe:backdrop-blur">
                        <svg
                            role="img"
                            aria-label="Grafo de orquestación: olas, tareas, modelos, revisores y commits"
                            width={disposicion.ancho}
                            height={disposicion.alto}
                            className="block"
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setRaton({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                            }}
                            onMouseLeave={() => {
                                setNodoActivo(null);
                                setRaton(null);
                            }}
                        >
                            {dibujarAristas()}
                            {dibujarNodos()}
                        </svg>
                        {nodoActivo && raton ? <TooltipNodo nodo={nodoActivo} x={raton.x} y={raton.y} /> : null}
                    </div>
                    <PanelDetalle
                        nodo={nodoDetalle}
                        aristas={disposicion.aristas}
                        nodoPorId={nodoPorId}
                    />
                </div>
            )}
        </section>
    );

    /** Aristas bezier: opacidad baja; las del nodo en hover, resaltadas. */
    function dibujarAristas() {
        return disposicion?.aristas.map((arista, i) => {
            const de = disposicion.posiciones[arista.de];
            const a = disposicion.posiciones[arista.a];
            if (!de || !a) return null;
            const resaltada = aristasDelNodo.has(`${arista.de}→${arista.a}`);
            return (
                <path
                    key={`arista-${i}-${arista.de}-${arista.a}`}
                    d={rutaBezier(de, a)}
                    fill="none"
                    stroke={colorArista(arista.tipo)}
                    strokeWidth={resaltada ? 2 : 1}
                    opacity={resaltada ? 0.95 : 0.18}
                    className="motion-safe:transition-opacity"
                />
            );
        });
    }

    /** Nodos: círculo coloreado (tareas por estado) + etiqueta truncada. */
    function dibujarNodos() {
        return disposicion?.nodos.map((nodo, i) => {
            const pos = disposicion.posiciones[nodo.id];
            if (!pos) return null;
            const activo = nodoActivo?.id === nodo.id;
            const relleno = nodo.tipo === "tarea" ? tonoNodoTarea(nodo.estado) : "#71717a";
            const etiqueta = nodo.etiqueta.length > 22 ? `${nodo.etiqueta.slice(0, 21)}…` : nodo.etiqueta;
            return (
                <g
                    key={`nodo-${nodo.id}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setNodoActivo(nodo)}
                    onClick={() => setNodoDetalle(nodo)}
                >
                    <title>{`${TEXTO_TIPO[nodo.tipo]} · ${nodo.etiqueta}`}</title>
                    <circle
                        r={activo ? 9 : 7}
                        fill={relleno}
                        stroke={activo ? "#ffffff" : "transparent"}
                        strokeWidth={1.5}
                        className="motion-safe:transition-all"
                    />
                    <text
                        x={12}
                        y={4}
                        fontSize={11}
                        fill="#e4e4e7"
                        className="pointer-events-none select-none"
                    >
                        {etiqueta}
                        {nodo.tipo === "tarea" && nodo.estado ? ` (${etiquetaEstado(nodo.estado)})` : ""}
                    </text>
                </g>
            );
        });
    }
}

/** Tooltip flotante junto al cursor con etiqueta y estado. */
function TooltipNodo({ nodo, x, y }: { nodo: NodoGrafo; x: number; y: number }) {
    return (
        <div
            className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-white/15 bg-black/85 px-2.5 py-1.5 text-[11px] text-white/90"
            style={{ left: x + 12, top: y - 8 }}
        >
            <p className="font-semibold">
                {TEXTO_TIPO[nodo.tipo]} · {nodo.etiqueta}
            </p>
            {nodo.tipo === "tarea" ? (
                <p className="text-white/60">
                    Estado: {nodo.estado ? etiquetaEstado(nodo.estado) : "sin estado"}
                    {nodo.ola ? ` · ola ${nodo.ola}` : ""}
                </p>
            ) : null}
        </div>
    );
}

/** Panel lateral con el detalle del nodo elegido al hacer clic. */
function PanelDetalle({
    nodo,
    aristas,
    nodoPorId,
}: {
    nodo: NodoGrafo | null;
    aristas: AristaGrafo[];
    nodoPorId: Map<string, NodoGrafo>;
}) {
    if (!nodo) {
        return (
            <aside className="rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white/50">
                Haz clic en un nodo del grafo para ver su detalle.
            </aside>
        );
    }
    const entrantes = aristas.filter((a) => a.a === nodo.id);
    const salientes = aristas.filter((a) => a.de === nodo.id);
    const textoArista = (a: AristaGrafo, saliente: boolean): string => {
        const otro = nodoPorId.get(saliente ? a.a : a.de);
        const verbo =
            a.tipo === "contiene"
                ? "contiene"
                : a.tipo === "depende"
                  ? "depende de"
                  : a.tipo === "escribio"
                    ? "escribió"
                    : a.tipo === "reviso"
                      ? "revisó"
                      : "produjo";
        const nombre = otro?.etiqueta ?? a.de;
        return `${verbo} ${nombre}`;
    };
    return (
        <aside className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-4 text-xs">
            <header>
                <p className="text-[10px] uppercase tracking-wide text-white/40">
                    {TEXTO_TIPO[nodo.tipo]}
                </p>
                <h4 className="text-sm font-semibold text-white">{nodo.etiqueta}</h4>
                {nodo.tipo === "tarea" && nodo.estado ? (
                    <p className="text-white/60">Estado: {etiquetaEstado(nodo.estado)}</p>
                ) : null}
                {nodo.ola ? <p className="text-white/60">Ola: {nodo.ola}</p> : null}
            </header>
            {entrantes.length > 0 ? (
                <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/40">Recibe</p>
                    <ul className="mt-1 space-y-1 text-white/70">
                        {entrantes.map((a, i) => (
                            <li key={`ent-${nodo.id}-${i}`} className="truncate">
                                {textoArista(a, false)}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {salientes.length > 0 ? (
                <div>
                    <p className="text-[10px] uppercase tracking-wide text-white/40">Apunta a</p>
                    <ul className="mt-1 space-y-1 text-white/70">
                        {salientes.map((a, i) => (
                            <li key={`sal-${nodo.id}-${i}`} className="truncate">
                                {textoArista(a, true)}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </aside>
    );
}
