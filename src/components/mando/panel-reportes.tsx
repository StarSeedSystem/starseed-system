"use client";

/**
 * Panel de Reportes del Puente de Mando (Ola p323C)
 * ─────────────────────────────────────────────────────────────────────────────
 * Bandeja CURADA: cada entrada explica qué pasó, por qué importa y cómo
 * comprobarlo (enlaces al diff / localhost y pruebas con código o capturas).
 * No es otro chat de eventos crudos: eso ya vive en `chat-orquestacion.tsx`.
 *
 * Toda la lógica de filtrado vive en `filtrar` de `@/lib/mando/reportes`
 * (p323A): aquí solo hay estado de interfaz (umbrales y búsqueda) y pintado.
 * Sondeo cada 30 s con `cache: "no-store"`, como el resto del Mando. La ruta
 * `/api/mando/reportes` es SOLO local (404 en producción).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDashed, ClipboardList, RefreshCw, Search } from "lucide-react";

import { filtrar } from "@/lib/mando/reportes";
import type { ClaseReporte, Importancia, Reporte } from "@/lib/mando/reportes";

/** Intervalo de sondeo de la bandeja (ms). */
const SONDA_MS = 30_000;

/** Opciones del filtro de importancia: etiqueta y mínimo que fija cada una. */
const NIVELES: { minimo: Importancia | undefined; etiqueta: string }[] = [
    { minimo: "critica", etiqueta: "Críticas" },
    { minimo: "alta", etiqueta: "Altas" },
    { minimo: "normal", etiqueta: "Normales" },
    { minimo: undefined, etiqueta: "Todas" },
];

/** Clases de reporte con su etiqueta corta para los chips. */
const CLASES: { clase: ClaseReporte; etiqueta: string }[] = [
    { clase: "espera", etiqueta: "Esperas" },
    { clase: "aviso", etiqueta: "Avisos" },
    { clase: "ola-cerrada", etiqueta: "Olas cerradas" },
    { clase: "ola-nueva", etiqueta: "Olas nuevas" },
    { clase: "cambio", etiqueta: "Cambios" },
    { clase: "sugerencia", etiqueta: "Sugerencias" },
    { clase: "nota", etiqueta: "Notas" },
];

/** Insignia de importancia: color semántico acordado (crítica rose · alta amber · normal sky · baja zinc). */
const INSIGNIA: Record<Importancia, string> = {
    critica: "border-rose-400/50 bg-rose-500/15 text-rose-300",
    alta: "border-amber-400/50 bg-amber-500/15 text-amber-300",
    normal: "border-sky-400/50 bg-sky-500/15 text-sky-300",
    baja: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
};

/** Formatea una fecha ISO a hora local corta. */
function horaCorta(fecha: string): string {
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return fecha;
    return d.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Cuenta por clase e importancia sobre la bandeja COMPLETA, no la filtrada:
 *  las cuentas de los botones deben ser estables mientras se filtra, si no
 *  desaparecen opciones al pulsarlas. */
function contarClases(reportes: Reporte[]): Map<ClaseReporte, number> {
    const cuentas = new Map<ClaseReporte, number>();
    for (const r of reportes) cuentas.set(r.clase, (cuentas.get(r.clase) ?? 0) + 1);
    return cuentas;
}

/** Tarjeta de un reporte: el qué, el porqué y cómo comprobarlo. */
function TarjetaReporte({ reporte }: { reporte: Reporte }) {
    return (
        <article
            className="rounded-xl border border-white/10 bg-black/30 p-3"
            data-testid={`reporte-${reporte.id}`}
        >
            <header className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                <time>{horaCorta(reporte.t)}</time>
                <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                    {reporte.clase}
                </span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${INSIGNIA[reporte.importancia]}`}>
                    {reporte.importancia}
                </span>
                {reporte.ola && <span>ola {reporte.ola}</span>}
                {reporte.tarea && <span>tarea {reporte.tarea}</span>}
                <span className="ml-auto text-white/40">relevancia {reporte.relevancia}</span>
            </header>
            <h4 className="mt-1.5 text-sm font-medium text-white">{reporte.titulo}</h4>
            {/* El contexto va íntegro: el detalle es justo lo que se pidió. */}
            <p className="mt-1 whitespace-pre-wrap text-sm text-white/75">{reporte.contexto}</p>
            {reporte.enlaces.length > 0 && (
                <nav className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {reporte.enlaces.map((e) => (
                        <a
                            key={`${e.clase}-${e.url}`}
                            href={e.url}
                            target="_blank"
                            rel="noreferrer"
                            className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-sky-300/90 hover:bg-white/5"
                        >
                            {e.texto}
                        </a>
                    ))}
                </nav>
            )}
            {reporte.pruebas.length > 0 && (
                <div className="mt-2 space-y-2">
                    {reporte.pruebas.map((p, i) =>
                        p.clase === "codigo" ? (
                            <figure key={i} className="overflow-hidden rounded-lg border border-white/10">
                                <div className="flex items-center justify-between border-b border-white/10 px-2 py-1 text-[10px] text-white/50">
                                    <figcaption>{p.pie}</figcaption>
                                    <BotonCopiar texto={p.texto ?? ""} />
                                </div>
                                <pre className="overflow-x-auto p-2 text-[11px] leading-relaxed text-white/80">
                                    <code>{p.texto}</code>
                                </pre>
                            </figure>
                        ) : (
                            <figure key={i} className="overflow-hidden rounded-lg border border-white/10">
                                {/* Captura de la prueba en localhost, con su pie explicativo. */}
                                <img src={p.ruta} alt={p.pie} className="w-full object-cover" />
                                <figcaption className="px-2 py-1 text-[10px] text-white/50">{p.pie}</figcaption>
                            </figure>
                        ),
                    )}
                </div>
            )}
        </article>
    );
}

/** Botón que copia al portapapeles el código de una prueba. Si el navegador
 *  no expone `navigator.clipboard` (contexto no seguro), no rompemos la tarjeta. */
function BotonCopiar({ texto }: { texto: string }) {
    const [copiado, setCopiado] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard?.writeText(texto).then(() => {
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 1500);
                });
            }}
            className="cursor-pointer rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/5"
        >
            {copiado ? "Copiado" : "Copiar"}
        </button>
    );
}

export function PanelReportes() {
    const [reportes, setReportes] = useState<Reporte[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [minimo, setMinimo] = useState<Importancia | undefined>(undefined);
    const [relevanciaMin, setRelevanciaMin] = useState(0);
    const [clasesElegidas, setClasesElegidas] = useState<Set<ClaseReporte>>(new Set());
    const [busqueda, setBusqueda] = useState("");
    const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

    const recargar = useCallback(async () => {
        try {
            // Sin caché: la bandeja debe reflejar la ola en curso, no la de hace un rato.
            const res = await fetch("/api/mando/reportes", { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const datos: unknown = await res.json();
            const lista = Array.isArray(datos)
                ? datos
                : (datos as { reportes?: Reporte[] }).reportes ?? [];
            setReportes(lista);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "fallo al cargar reportes");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar();
        sondeo.current = setInterval(() => void recargar(), SONDA_MS);
        return () => {
            if (sondeo.current) clearInterval(sondeo.current);
        };
    }, [recargar]);

    // Las cuentas de botones/chips salen de la bandeja COMPLETA, no de la filtrada,
    // para que las opciones no desaparezcan al activarlas.
    const porClase = contarClases(reportes);
    const visibles = filtrar(reportes, {
        clases: clasesElegidas.size > 0 ? [...clasesElegidas] : undefined,
        importanciaMinima: minimo,
        relevanciaMinima: relevanciaMin > 0 ? relevanciaMin : undefined,
        texto: busqueda.trim() || undefined,
    });
    const escondidos = reportes.length - visibles.length;

    const conmutaClase = (clase: ClaseReporte) => {
        setClasesElegidas((prev) => {
            const siguiente = new Set(prev);
            if (siguiente.has(clase)) siguiente.delete(clase);
            else siguiente.add(clase);
            return siguiente;
        });
    };

    return (
        <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ClipboardList className="h-4 w-4 text-white/60" aria-hidden />
                    Reportes
                    <span className="text-xs font-normal text-white/40">
                        (bandeja curada · qué pasó, por qué importa y cómo probarlo)
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

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
                <div className="flex items-center gap-1" role="group" aria-label="Importancia mínima">
                    {NIVELES.map((n) => {
                        // «Todas» suma la bandeja entera; el resto solo su nivel (es un mínimo).
                        const cuenta = n.minimo
                            ? reportes.filter((r) => filtrar([r], { importanciaMinima: n.minimo }).length > 0).length
                            : reportes.length;
                        return (
                            <button
                                key={n.etiqueta}
                                type="button"
                                aria-pressed={minimo === n.minimo}
                                onClick={() => setMinimo(n.minimo)}
                                className={`cursor-pointer rounded-md border px-2 py-1 ${minimo === n.minimo ? "border-violet-400/60 bg-violet-500/15 text-white" : "border-white/10 text-white/60 hover:bg-white/5"}`}
                            >
                                {n.etiqueta} <span className="text-white/40">{cuenta}</span>
                            </button>
                        );
                    })}
                </div>
                <label className="flex items-center gap-2 text-white/60">
                    relevancia ≥ {relevanciaMin}
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={10}
                        value={relevanciaMin}
                        aria-label="Relevancia mínima"
                        onChange={(e) => setRelevanciaMin(Number(e.target.value))}
                        className="cursor-pointer accent-violet-500"
                    />
                </label>
                <label className="flex items-center gap-1.5 text-white/60">
                    <Search className="h-3 w-3" aria-hidden />
                    <input
                        type="search"
                        value={busqueda}
                        placeholder="Buscar en reportes…"
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-40 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white placeholder:text-white/30"
                    />
                </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                {CLASES.map(({ clase, etiqueta }) => {
                    const cuenta = porClase.get(clase) ?? 0;
                    if (cuenta === 0 && !clasesElegidas.has(clase)) return null;
                    const activa = clasesElegidas.has(clase);
                    return (
                        <button
                            key={clase}
                            type="button"
                            aria-pressed={activa}
                            onClick={() => conmutaClase(clase)}
                            className={`cursor-pointer rounded-full border px-2 py-0.5 ${activa ? "border-violet-400/60 bg-violet-500/15 text-white" : "border-white/10 text-white/50 hover:bg-white/5"}`}
                        >
                            {etiqueta} <span className="text-white/40">{cuenta}</span>
                        </button>
                    );
                })}
            </div>

            {cargando && reportes.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-white/60">
                    <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                    Cargando la bandeja…
                </p>
            ) : error ? (
                <p className="mt-3 text-sm text-rose-300/80">No se pudieron cargar los reportes: {error}</p>
            ) : visibles.length === 0 ? (
                // Estado vacío honesto: no es que no haya nada, los filtros lo esconden.
                <p className="mt-3 text-sm text-white/50">
                    {reportes.length === 0
                        ? "Todavía no hay reportes en la bandeja."
                        : `Ningún reporte pasa los filtros actuales; ${escondidos} quedan por debajo del umbral o fuera de la búsqueda.`}
                </p>
            ) : (
                <ol className="mt-4 space-y-2.5">
                    {visibles.map((r) => (
                        <li key={r.id}>
                            <TarjetaReporte reporte={r} />
                        </li>
                    ))}
                </ol>
            )}
            {!cargando && !error && visibles.length > 0 && escondidos > 0 && (
                <p className="mt-3 text-[11px] text-white/40">
                    {escondidos} reportes quedan por debajo de los filtros.
                </p>
            )}
        </section>
    );
}
