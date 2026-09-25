"use client";

/**
 * Panel «Memorias» del Centro de Mando (Ola de Memorias)
 * ─────────────────────────────────────────────────────────────────────────────
 * Todas las memorias del proyecto StarSeed OS en un solo lugar, en las ocho
 * capas de `@/lib/mando/memorias`: núcleo, proyecto, relevo e informes,
 * aprendizajes, recuerdos por tarea, preferencias y configuración, agentes
 * externos, y programas/enlaces/medios/versiones.
 *
 * Arriba, una tira de «Últimas actualizaciones»; a la izquierda, las capas
 * como grupos plegables con sus archivos (título, ruta, hace cuánto, tamaño,
 * etiquetas); a la derecha, el detalle de la memoria elegida — markdown
 * renderizado cuando la ruta es `.md` (mismo estilo que `informe-ola.tsx`),
 * preformateado si no— con sus «Vínculos» (navegables cuando resuelven a otra
 * memoria conocida) y «Mencionado por» (backlinks).
 *
 * La búsqueda filtra EN EL CLIENTE con las mismas funciones puras que usa el
 * servidor (`filtrarCapasPorBusqueda`), sin ida y vuelta de red por cada letra;
 * `?q=` en la API existe para quien consuma la ruta directamente.
 *
 * Lee `GET /api/mando/memorias` (solo local; 404 en producción; sin claves ni
 * rutas absolutas del disco — ver `memorias-servidor.ts`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { ChevronDown, ChevronRight, Clock3, ExternalLink, Layers, RefreshCw, Search } from "lucide-react";

import {
    DEFINICION_CAPAS,
    contarPorCapa,
    filtrarCapasPorBusqueda,
    formatoTamano,
    type ArchivoMemoria,
    type CapaMemoria,
    type GrafoMemoria,
    type IdCapa,
    type VinculoResuelto,
} from "@/lib/mando/memorias";
import { haceCuanto } from "@/lib/mando/contextos-panel";

interface RespuestaMemoriasApi {
    capas: CapaMemoria[];
    ultimasActualizaciones: ArchivoMemoria[];
    grafo: GrafoMemoria;
    totalArchivos: number;
    generadoEn: string;
}

interface DetalleMemoriaApi {
    ruta: string;
    titulo: string;
    capa: IdCapa;
    actualizado: string;
    tamano: number;
    texto: string;
    vinculosResueltos: VinculoResuelto[];
    mencionadoPor: string[];
}

/** Estilo markdown compacto, en la misma línea que `informe-ola.tsx`. */
const MD_COMPONENTES: Components = {
    h1: ({ children }) => <h1 className="mb-2 mt-1 text-base font-semibold text-white">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold text-white">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold text-white/90">{children}</h3>,
    p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-white/80">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-white/80">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-white/80">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
    code: ({ children }) => (
        <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-emerald-200">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="mb-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs">{children}</pre>
    ),
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
        >
            {children}
        </a>
    ),
    hr: () => <hr className="my-3 border-white/10" />,
    blockquote: ({ children }) => (
        <blockquote className="mb-2 border-l-2 border-white/20 pl-3 text-sm italic text-white/60">{children}</blockquote>
    ),
};

/** Fila compacta de un archivo dentro de una capa. */
function FilaArchivo({
    archivo,
    seleccionado,
    onAbrir,
}: {
    archivo: ArchivoMemoria;
    seleccionado: boolean;
    onAbrir: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onAbrir}
            aria-current={seleccionado}
            className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 ${
                seleccionado ? "bg-trinity-azure/10 ring-1 ring-inset ring-trinity-azure/30" : ""
            }`}
        >
            <span className="truncate text-xs font-medium text-white/90">{archivo.titulo || archivo.ruta}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-white/40">
                <span className="truncate font-mono">{archivo.ruta}</span>
                <span>· {haceCuanto(archivo.actualizado)}</span>
                <span>· {formatoTamano(archivo.tamano)}</span>
            </span>
            {archivo.etiquetas.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                    {archivo.etiquetas.map((et) => (
                        <span key={et} className="rounded-full border border-white/10 px-1.5 py-0 text-[9px] text-white/40">
                            {et}
                        </span>
                    ))}
                </span>
            ) : null}
        </button>
    );
}

export function PanelMemorias() {
    const [datos, setDatos] = useState<RespuestaMemoriasApi | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [expandidas, setExpandidas] = useState<Set<IdCapa>>(() => new Set(DEFINICION_CAPAS.map((c) => c.id)));
    const [seleccion, setSeleccion] = useState<string | null>(null);
    const [detalle, setDetalle] = useState<DetalleMemoriaApi | null>(null);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);

    const recargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const r = await fetch("/api/mando/memorias", { cache: "no-store" });
            if (!r.ok) {
                setError(
                    r.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : r.status === 401
                          ? "Necesitas iniciar sesión para ver las memorias."
                          : `No se pudieron leer las memorias (HTTP ${r.status}).`,
                );
                setDatos(null);
                return;
            }
            setDatos((await r.json()) as RespuestaMemoriasApi);
        } catch {
            setError("No se pudieron leer las memorias.");
            setDatos(null);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar();
    }, [recargar]);

    const abrirArchivo = useCallback(async (ruta: string) => {
        setSeleccion(ruta);
        setCargandoDetalle(true);
        try {
            const r = await fetch(`/api/mando/memorias?archivo=${encodeURIComponent(ruta)}`, { cache: "no-store" });
            const d = (await r.json().catch(() => null)) as (DetalleMemoriaApi & { error?: string }) | null;
            setDetalle(d && !d.error ? d : null);
        } catch {
            setDetalle(null);
        } finally {
            setCargandoDetalle(false);
        }
    }, []);

    const capasFiltradas = useMemo<CapaMemoria[]>(
        () => (datos ? filtrarCapasPorBusqueda(datos.capas, busqueda) : []),
        [datos, busqueda],
    );
    const cuentas = useMemo<Record<string, number>>(
        () => (datos ? contarPorCapa(datos.capas) : {}),
        [datos],
    );
    const buscando = busqueda.trim().length > 0;
    const totalVisible = capasFiltradas.reduce((acc, c) => acc + c.archivos.length, 0);

    const alternarCapa = (id: IdCapa) => {
        setExpandidas((prev) => {
            const siguiente = new Set(prev);
            if (siguiente.has(id)) siguiente.delete(id);
            else siguiente.add(id);
            return siguiente;
        });
    };

    if (cargando && !datos) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo las memorias…
            </div>
        );
    }

    if (error || !datos) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error ?? "Sin datos de memorias."}
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
        <div data-testid="panel-memorias" className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Layers className="h-4 w-4 text-white/60" aria-hidden />
                        Memorias
                        <span className="text-xs font-normal text-white/40">
                            {datos.totalArchivos} entrada(s) · {DEFINICION_CAPAS.length} capas
                        </span>
                    </h3>
                    <p className="mt-1 text-xs text-white/50">
                        Núcleo, proyecto, relevo e informes, aprendizajes, recuerdos por tarea, preferencias,
                        agentes externos y versiones — todo redactado antes de llegar aquí.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void recargar()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                    Actualizar
                </button>
            </header>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por título, ruta o resumen…"
                    className="w-full cursor-text bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
                {buscando ? <span className="shrink-0 text-[11px] text-white/40">{totalVisible} resultado(s)</span> : null}
            </div>

            {datos.ultimasActualizaciones.length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden />
                        Últimas actualizaciones
                    </h4>
                    <ul className="flex flex-wrap gap-1.5">
                        {datos.ultimasActualizaciones.slice(0, 12).map((a) => (
                            <li key={a.ruta}>
                                <button
                                    type="button"
                                    onClick={() => void abrirArchivo(a.ruta)}
                                    title={a.ruta}
                                    className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                                >
                                    {a.titulo} <span className="text-white/40">· {haceCuanto(a.actualizado)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[320px_1fr]">
                <nav aria-label="Capas de memoria" className="space-y-2">
                    {capasFiltradas.map((capa) => {
                        const abierta = expandidas.has(capa.id) || buscando;
                        const total = cuentas[capa.id] ?? 0;
                        return (
                            <section key={capa.id} className="rounded-xl border border-white/10 bg-black/30">
                                <button
                                    type="button"
                                    onClick={() => alternarCapa(capa.id)}
                                    aria-expanded={abierta}
                                    title={capa.descripcion}
                                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left"
                                >
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                                        {abierta ? (
                                            <ChevronDown className="h-3.5 w-3.5 text-white/40" aria-hidden />
                                        ) : (
                                            <ChevronRight className="h-3.5 w-3.5 text-white/40" aria-hidden />
                                        )}
                                        {capa.titulo}
                                    </span>
                                    <span className="text-[11px] text-white/40">
                                        {capa.archivos.length}
                                        {buscando ? ` / ${total}` : ""}
                                    </span>
                                </button>
                                {abierta ? (
                                    <ul className="space-y-0.5 border-t border-white/5 px-2 pb-2 pt-1">
                                        {capa.archivos.length === 0 ? (
                                            <li className="px-2 py-1 text-[11px] text-white/35">
                                                {buscando ? "Ninguna coincidencia." : "no encontrado"}
                                            </li>
                                        ) : (
                                            capa.archivos.map((archivo) => (
                                                <li key={archivo.ruta}>
                                                    <FilaArchivo
                                                        archivo={archivo}
                                                        seleccionado={seleccion === archivo.ruta}
                                                        onAbrir={() => void abrirArchivo(archivo.ruta)}
                                                    />
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                ) : null}
                            </section>
                        );
                    })}
                </nav>

                <article className="min-h-40 rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    {!seleccion ? (
                        <p className="text-sm text-white/40">Elige una memoria de la izquierda para ver su contenido.</p>
                    ) : cargandoDetalle ? (
                        <p className="flex items-center gap-2 text-sm text-white/60">
                            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Leyendo…
                        </p>
                    ) : !detalle ? (
                        <p className="text-sm text-white/40">no encontrado</p>
                    ) : (
                        <div>
                            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-2">
                                <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold text-white">{detalle.titulo}</h4>
                                    <p className="truncate font-mono text-[11px] text-white/40">{detalle.ruta}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 text-[11px] text-white/45">
                                    <span>{haceCuanto(detalle.actualizado)}</span>
                                    <span>· {formatoTamano(detalle.tamano)}</span>
                                </div>
                            </header>

                            {detalle.ruta.toLowerCase().endsWith(".md") ? (
                                <ReactMarkdown components={MD_COMPONENTES}>{detalle.texto || "*(vacío)*"}</ReactMarkdown>
                            ) : (
                                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white/75">
                                    {detalle.texto || "(vacío)"}
                                </pre>
                            )}

                            {detalle.vinculosResueltos.length > 0 ? (
                                <div className="mt-3 border-t border-white/5 pt-2">
                                    <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                                        Vínculos
                                    </h5>
                                    <ul className="flex flex-wrap gap-1.5">
                                        {detalle.vinculosResueltos.map((v, i) => (
                                            <li key={`${v.texto}-${i}`}>
                                                {v.ruta ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void abrirArchivo(v.ruta as string)}
                                                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-trinity-azure/30 bg-trinity-azure/10 px-2 py-0.5 text-[11px] text-trinity-azure hover:bg-trinity-azure/20"
                                                    >
                                                        <ExternalLink className="h-3 w-3" aria-hidden /> {v.texto}
                                                    </button>
                                                ) : (
                                                    <span
                                                        className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40"
                                                        title="No se encontró una memoria con este nombre"
                                                    >
                                                        {v.texto}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {detalle.mencionadoPor.length > 0 ? (
                                <div className="mt-3 border-t border-white/5 pt-2">
                                    <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                                        Mencionado por
                                    </h5>
                                    <ul className="flex flex-wrap gap-1.5">
                                        {detalle.mencionadoPor.map((r) => (
                                            <li key={r}>
                                                <button
                                                    type="button"
                                                    onClick={() => void abrirArchivo(r)}
                                                    className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/10"
                                                >
                                                    {r}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    )}
                </article>
            </div>
        </div>
    );
}
