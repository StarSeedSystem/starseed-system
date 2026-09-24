"use client";

/**
 * Panel de olas, tareas e informes (Ola 231 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Izquierda: las olas conocidas (de las colas y del progreso) con su avance
 * (hechas / total, barra), estado y fecha. Al pulsar una, la derecha muestra
 * su detalle: lista de tareas con estado, commit y veredicto de revisión, y
 * debajo su informe de cierre (el mismo markdown que reciben Claude y Hermes).
 *
 * Arriba del todo: el informe MÁS RECIENTE destacado — es el mensaje que Alex
 * está leyendo también en Cowork y en Hermes.
 *
 * Lee `GET /api/mando/estado` (solo local; 404 en producción; sin claves ni
 * rutas absolutas del disco).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    CircleDashed,
    Layers,
    RefreshCw,
    RotateCcw,
} from "lucide-react";

import type { EstadoMando, InformeOla, OlaResumen, RevisionRef } from "@/lib/mando/tipos";
import { InformeOla as VistaInforme } from "@/components/mando/informe-ola";
import {
    detalleDeOla,
    estadoDeOla,
    hechasDeOla,
    recuentoDeOlas,
    type EstadoOla,
} from "@/lib/mando/estado-ola";

// (2026-09-24) «En curso» solo con agentes latiendo: ver `@/lib/mando/estado-ola`.
const TEXTO_ESTADO: Record<EstadoOla, string> = {
    completa: "Completa",
    "en-curso": "En curso",
    "en-espera": "En espera",
    bloqueada: "Bloqueada",
    terminada: "Terminada",
    "sin-datos": "Sin datos",
};

const CLASE_ESTADO: Record<EstadoOla, string> = {
    completa: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    "en-curso": "border-sky-400/30 bg-sky-500/10 text-sky-200",
    "en-espera": "border-amber-400/30 bg-amber-500/10 text-amber-200",
    bloqueada: "border-red-400/30 bg-red-500/10 text-red-200",
    terminada: "border-white/15 bg-white/5 text-white/60",
    "sin-datos": "border-white/10 bg-white/5 text-white/50",
};

/** Orden de la cabecera: primero lo que se mueve, luego lo que pide algo. */
const ORDEN_ESTADOS: EstadoOla[] = ["en-curso", "bloqueada", "en-espera", "completa", "terminada"];

/** ¿Menciona este texto a la ola? (el id de ola aparece en nombres y títulos). */
function mencionaOla(texto: string, olaId: string): boolean {
    const limpio = olaId.trim();
    if (!limpio) return false;
    return texto.toLowerCase().includes(limpio.toLowerCase());
}

/** Fecha asociada a una ola: la del informe cuyo nombre la menciona, si hay. */
function fechaDeOla(ola: OlaResumen, informes: InformeOla[]): string {
    const informe = informes.find((i) => mencionaOla(i.nombre, ola.id));
    return informe?.fecha ?? "";
}

/** Commits del log reciente que mencionan la ola. */
function commitsDeOla(ola: OlaResumen, log: string[]): string[] {
    return log.filter((línea) => mencionaOla(línea, ola.id));
}

/** Revisiones cuya cabecera menciona la ola. */
function revisionesDeOla(ola: OlaResumen, revisiones: RevisionRef[]): RevisionRef[] {
    return revisiones.filter((r) => mencionaOla(r.titulo, ola.id));
}

/** Tarjeta de la izquierda: una ola con su avance y estado. */
function TarjetaOla({
    ola,
    fecha,
    seleccionada,
    alElegir,
}: {
    ola: OlaResumen;
    fecha: string;
    seleccionada: boolean;
    alElegir: () => void;
}) {
    const estado = estadoDeOla(ola);
    const hechas = hechasDeOla(ola);
    const porcentaje = ola.total > 0 ? Math.round((hechas / ola.total) * 100) : 0;
    const queda = detalleDeOla(ola);

    return (
        <button
            type="button"
            onClick={alElegir}
            className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                seleccionada
                    ? "border-sky-400/40 bg-sky-500/10"
                    : "border-white/10 bg-black/30 hover:bg-white/5"
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-white">Ola {ola.id}</h3>
                <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${CLASE_ESTADO[estado]}`}
                >
                    {TEXTO_ESTADO[estado]}
                </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-white/60">{ola.titulo}</p>

            <div className="mt-2 flex items-center justify-between text-[11px] text-white/60">
                <span>
                    {hechas} / {ola.total} hechas
                </span>
                {fecha && <span>{fecha}</span>}
            </div>
            {queda && <p className="mt-0.5 truncate text-[10px] text-white/45">{queda}</p>}
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                    className={`h-full rounded-full ${
                        estado === "bloqueada" ? "bg-red-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${porcentaje}%` }}
                />
            </div>
        </button>
    );
}

/** Reintento inteligente de una o varias tareas (descarta duplicadas/inútiles y relanza las útiles con el motivo del fallo añadido al prompt). */
async function enviarReintento({
    nombre,
    tareas,
    existentes,
}: {
    nombre: string;
    tareas: Array<{ id: string; titulo: string }>;
    existentes: string[];
}): Promise<{ ok: boolean; relanzadas: string[]; descartadas: string[]; detalle: string }> {
    try {
        const r = await fetch("/api/mando/colas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accion: "reintentar", nombre, tareas: tareas.map((t) => t.id), existentes }),
        });
        const cuerpo = (await r.json()) as { ok?: boolean; relanzadas?: string[]; descartadas?: string[]; detalle?: string; error?: string };
        return {
            ok: Boolean(cuerpo.ok),
            relanzadas: cuerpo.relanzadas ?? [],
            descartadas: cuerpo.descartadas ?? [],
            detalle: cuerpo.detalle ?? cuerpo.error ?? `HTTP ${r.status}`,
        };
    } catch {
        return { ok: false, relanzadas: [], descartadas: [], detalle: "No se pudo hablar con el Mando." };
    }
}

/** Detalle de la ola seleccionada: tareas, commits, veredictos e informe. */
function DetalleOla({ ola, estado, onCambio }: { ola: OlaResumen; estado: EstadoMando; onCambio: () => void }) {
    const tareas = estado.tareas.filter((t) => t.ola === ola.id || t.ola === "");
    const commits = commitsDeOla(ola, estado.repo?.log ?? []);
    const revisiones = revisionesDeOla(ola, estado.revisiones);
    const informes = estado.informes.filter((i) => mencionaOla(i.nombre, ola.id));
    // Volver a cargar tras un reintento (el Mando se refresca en cada acción).
    const [recarga, setRecarga] = useState(0);
    useEffect(() => {
        if (recarga > 0) { const t = window.setTimeout(() => setRecarga(0), 300); return () => window.clearTimeout(t); }
        return undefined;
    }, [recarga]);

    // Tareas SIN commit propio ni revisión = nunca se terminaron: candidatas a reintento.
    const tareaIntegrada = (id: string) => (estado.repo?.log ?? []).some((l) => mencionaOla(l, id));
    const reintentables = tareas.filter((t) => !tareaIntegrada(t.id));
    const colaReintento = tareas.find((t) => t.cola)?.cola ?? "";

    const [reintentando, setReintentando] = useState<string | null>(null);
    const [resumen, setResumen] = useState<{ ok: boolean; text: string } | null>(null);

    const reintentar = async (ids: string[]) => {
        setReintentando(ids.join(","));
        setResumen(null);
        const lista = reintentables.filter((t) => ids.includes(t.id));
        const r = await enviarReintento({
            nombre: colaReintento,
            tareas: lista,
            existentes: tareas.map((t) => t.titulo),
        });
        setResumen({
            ok: r.ok,
            text: r.ok
                ? `Reintentadas: ${r.relanzadas.join(", ") || "—"}. Descartadas: ${r.descartadas.join(", ") || "—"}.`
                : r.detalle,
        });
        setReintentando(null);
        if (r.ok) onCambio();
    };

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">
                        Tareas de la ola {ola.id}
                    </h3>
                    {reintentables.length > 0 && colaReintento && (
                        <button
                            type="button"
                            onClick={() => { void reintentar(reintentables.map((t) => t.id).slice(0, 40)); }}
                            disabled={reintentando !== null}
                            aria-label="Reintentar las tareas útiles y descartar las duplicadas o que no apliquen"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RotateCcw className={`h-3 w-3 ${reintentando !== null ? "animate-spin" : ""}`} aria-hidden />
                            {reintentando !== null ? "Reintentando…" : `Reintentar útiles (${reintentables.length})`}
                        </button>
                    )}
                </div>
                {resumen && (
                    <p className={`mb-2 text-[11px] ${resumen.ok ? "text-emerald-300/90" : "text-rose-300/90"}`}>
                        {resumen.text}
                    </p>
                )}
                {tareas.length === 0 ? (
                    <p className="text-xs text-white/50">
                        No hay tareas registradas para esta ola en las colas.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {tareas.map((tarea) => {
                            const revisión = estado.revisiones.find((r) =>
                                mencionaOla(r.titulo, tarea.id),
                            );
                            const commit = (estado.repo?.log ?? []).find((l) =>
                                mencionaOla(l, tarea.id),
                            );
                            const integrado = Boolean(commit);
                            return (
                                <li
                                    key={tarea.id}
                                    className="rounded-lg border border-white/5 bg-white/5 p-2.5"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex min-w-0 items-center gap-2 text-xs text-white">
                                            {revisión ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                                            ) : (
                                                <CircleDashed className="h-3.5 w-3.5 shrink-0 text-white/40" />
                                            )}
                                            <span className="font-mono text-[11px] text-white/50">
                                                {tarea.id}
                                            </span>
                                            <span className="truncate">{tarea.titulo}</span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            <span
                                                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                                    revisión
                                                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                                        : "border-white/10 bg-white/5 text-white/50"
                                                }`}
                                            >
                                                {revisión ? "Revisada" : "Sin revisión"}
                                            </span>
                                            {!integrado && colaReintento && (
                                                <button
                                                    type="button"
                                                    onClick={() => { void reintentar([tarea.id]); }}
                                                    disabled={reintentando !== null}
                                                    aria-label={`Reintentar la tarea ${tarea.id}`}
                                                    title="Reintentar (descartar si es duplicada o no aplica)"
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <RotateCcw className="h-2.5 w-2.5" aria-hidden />
                                                    Reintentar
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                    {commit && (
                                        <p className="mt-1 truncate font-mono text-[11px] text-white/50">
                                            commit: {commit}
                                        </p>
                                    )}
                                    {revisión?.seguimiento && (
                                        <p className="mt-1 text-[11px] text-white/60">
                                            Veredicto: {revisión.seguimiento}
                                        </p>
                                    )}
                                    {tarea.dependencias.length > 0 && (
                                        <p className="mt-1 text-[11px] text-white/40">
                                            Depende de: {tarea.dependencias.join(", ")}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {commits.length > 0 && (
                <section className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-white">Commits de la ola</h3>
                    <ul className="space-y-1">
                        {commits.map((línea, índice) => (
                            <li
                                key={`c-${índice}-${línea.slice(0, 12)}`}
                                className="truncate font-mono text-[11px] text-white/60"
                            >
                                {línea}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {revisiones.length > 0 && (
                <section className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-white">
                        Veredictos de revisión
                    </h3>
                    <ul className="space-y-2">
                        {revisiones.map((revisión) => (
                            <li
                                key={`${revisión.titulo}-${revisión.fecha}`}
                                className="text-xs text-white/70"
                            >
                                <p className="font-medium text-white/90">{revisión.titulo}</p>
                                {revisión.seguimiento && (
                                    <p className="mt-0.5 text-white/60">
                                        Seguimiento: {revisión.seguimiento}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {informes.length === 0 ? (
                <p className="text-xs text-white/50">
                    Esta ola aún no tiene informe de cierre.
                </p>
            ) : (
                informes.map((informe) => (
                    <VistaInforme key={informe.nombre} informe={informe} />
                ))
            )}
        </div>
    );
}

/** Panel principal de olas, tareas e informes. */
export function PanelOlas() {
    const [estado, setEstado] = useState<EstadoMando | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [olaElegida, setOlaElegida] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const respuesta = await fetch("/api/mando/estado", { cache: "no-store" });
            if (!respuesta.ok) {
                setError("El mando no está disponible (solo funciona en local).");
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
        void cargar();
    }, [cargar]);

    const olas = useMemo(() => estado?.olas ?? [], [estado]);
    const informeReciente = estado?.informes[0] ?? null;

    const recuento = useMemo(() => recuentoDeOlas(olas), [olas]);

    const olaActiva = useMemo(() => {
        if (olas.length === 0) return null;
        const elegida = olas.find((o) => o.id === olaElegida);
        // Sin elección, la que se está escribiendo ahora; si no hay, la más reciente.
        const viva = [...olas].reverse().find((o) => estadoDeOla(o) === "en-curso");
        return elegida ?? viva ?? olas[olas.length - 1];
    }, [olas, olaElegida]);

    if (error) {
        return (
            <section className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                <p className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </p>
            </section>
        );
    }

    return (
        <section className="space-y-4">
            <header className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Layers className="h-4 w-4" />
                    Olas, tareas e informes
                </h2>
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10"
                    disabled={cargando}
                >
                    <RefreshCw
                        className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`}
                    />
                    Actualizar
                </button>
            </header>

            {olas.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60" aria-live="polite">
                    {recuento["en-curso"] === 0 && (
                        <span className="mr-1 text-white/70">Ahora mismo ninguna ola tiene agentes escribiendo.</span>
                    )}
                    {ORDEN_ESTADOS.filter((e) => recuento[e] > 0).map((e) => (
                        <span key={e} className={`rounded-full border px-2 py-0.5 ${CLASE_ESTADO[e]}`}>
                            {recuento[e]} {TEXTO_ESTADO[e].toLowerCase()}
                            {recuento[e] !== 1 && (e === "bloqueada" || e === "completa" || e === "terminada") ? "s" : ""}
                        </span>
                    ))}
                </p>
            )}

            {informeReciente && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-1">
                    <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-amber-200/80">
                        Informe más reciente — el mismo mensaje que reciben Claude y Hermes
                    </p>
                    <div className="p-2">
                        <VistaInforme informe={informeReciente} />
                    </div>
                </div>
            )}

            {olas.length === 0 ? (
                <p className="text-xs text-white/50">
                    Todavía no hay olas registradas en las colas del desarrollo.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
                    <div className="space-y-2">
                        {olas.map((ola) => (
                            <TarjetaOla
                                key={ola.id}
                                ola={ola}
                                fecha={fechaDeOla(ola, estado?.informes ?? [])}
                                seleccionada={olaActiva?.id === ola.id}
                                alElegir={() => setOlaElegida(ola.id)}
                            />
                        ))}
                    </div>
                    <div>
                        {olaActiva && estado ? (
                            <DetalleOla ola={olaActiva} estado={estado} onCambio={() => void cargar()} />
                        ) : (
                            <p className="flex items-center gap-2 text-xs text-white/50">
                                <ChevronRight className="h-3.5 w-3.5" />
                                Elige una ola para ver su detalle.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
