"use client";

/**
 * Panel «Aprendizaje» del Centro de Mando (Ola 270 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * El aprendizaje continuo de Astraura 1.58, de un vistazo: corpus vivo por
 * personalidad (turnos, partición train/val, bytes, última actividad), curación,
 * evaluaciones recientes, crónica, fábrica y adaptadores. Además, dos acciones:
 * exportar `train.jsonl` por personalidad y valorar turnos a mano (👍/👎/neutro).
 *
 * Lee `GET /api/mando/aprendizaje` (solo local; 404 en producción) y se refresca
 * cada 20 s como el resto del Mando.
 */

import { useCallback, useEffect, useState } from "react";
import {
    BookOpen,
    Check,
    CircleDashed,
    Download,
    Factory,
    RefreshCw,
    ScrollText,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react";

import type { Aprendizaje158 } from "@/lib/mando/aprendizaje";

/** Formatea bytes a una unidad legible («1.2 MB»). */
function formatoBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Marco común de una tarjeta del panel. */
function Tarjeta({
    titulo,
    icono,
    children,
    testId,
}: {
    titulo: string;
    icono: React.ReactNode;
    children: React.ReactNode;
    testId?: string;
}) {
    return (
        <article data-testid={testId} className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="mb-3 flex items-center gap-2">
                {icono}
                <h3 className="text-sm font-semibold text-white">{titulo}</h3>
            </header>
            {children}
        </article>
    );
}

/** Barra horizontal de partición train/val de una personalidad. */
function BarraTrainVal({ train, val }: { train: number; val: number }) {
    const total = Math.max(1, train + val);
    const pctTrain = (train / total) * 100;
    return (
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full bg-emerald-400" style={{ width: `${pctTrain}%` }} />
            <div className="h-full bg-sky-400" style={{ width: `${100 - pctTrain}%` }} />
        </div>
    );
}

/** Tarjeta «Corpus vivo»: total, por personalidad con barras train/val y bytes. */
function TarjetaCorpus({ aprendizaje, totalTurnos }: { aprendizaje: Aprendizaje158; totalTurnos: number }) {
    return (
        <Tarjeta
            titulo="Corpus vivo"
            testId="tarjeta-corpus"
            icono={<BookOpen className="h-4 w-4 text-white/70" aria-hidden />}
        >
            <div className="mb-3 flex items-baseline justify-between text-xs">
                <span className="text-white/50">Total</span>
                <span className="font-mono text-white/80">
                    {totalTurnos} turnos · {formatoBytes(aprendizaje.totalBytes)}
                </span>
            </div>
            {aprendizaje.corpus.length === 0 ? (
                <p className="text-xs text-white/50">Sin corpus en disco todavía.</p>
            ) : (
                <ul className="space-y-2.5">
                    {aprendizaje.corpus.map((p) => (
                        <li key={p.nombre} className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium text-white/80">{p.nombre}</span>
                                <span className="shrink-0 font-mono text-white/50">{p.turnos} turnos</span>
                            </div>
                            <BarraTrainVal train={p.train} val={p.val} />
                            <div className="mt-0.5 flex items-center justify-between text-[11px] text-white/40">
                                <span>train {p.train} · val {p.val}</span>
                                <span>{p.sinValorar > 0 ? `${p.sinValorar} sin valorar` : ""}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Tarjeta>
    );
}

/** Tarjeta «Curación»: duplicados, sin valorar y listos para entrenar. */
function TarjetaCuracion({ aprendizaje }: { aprendizaje: Aprendizaje158 }) {
    if (!aprendizaje.curacion) {
        return (
            <Tarjeta
                titulo="Curación"
                testId="tarjeta-curacion"
                icono={<Check className="h-4 w-4 text-white/70" aria-hidden />}
            >
                <p className="text-xs text-white/50">Sin métricas de curación en disco.</p>
            </Tarjeta>
        );
    }
    const c = aprendizaje.curacion;
    return (
        <Tarjeta
            titulo="Curación"
            testId="tarjeta-curacion"
            icono={<Check className="h-4 w-4 text-white/70" aria-hidden />}
        >
            <ul className="space-y-1">
                <li className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-white/50">Duplicados</span>
                    <span className="font-mono text-white/80">{c.duplicados}</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-white/50">Sin valorar</span>
                    <span className="font-mono text-white/80">{c.sinValorar}</span>
                </li>
                <li className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-white/50">Listos para entrenar</span>
                    <span className="font-mono text-emerald-300">{c.listos}</span>
                </li>
            </ul>
        </Tarjeta>
    );
}

/** Tarjeta «Evaluaciones»: tabla de las últimas con puntuación y tono. */
function TarjetaEvaluaciones({ aprendizaje }: { aprendizaje: Aprendizaje158 }) {
    return (
        <Tarjeta
            titulo="Evaluaciones"
            testId="tarjeta-evaluaciones"
            icono={<ScrollText className="h-4 w-4 text-white/70" aria-hidden />}
        >
            {aprendizaje.evaluaciones.length === 0 ? (
                <p className="text-xs text-white/50">Aún no hay evaluaciones de la puerta de regresión.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-left text-white/40">
                            <th className="pb-1 font-normal">Cuándo</th>
                            <th className="pb-1 font-normal">Puntuación</th>
                            <th className="pb-1 font-normal">Tono</th>
                        </tr>
                    </thead>
                    <tbody>
                        {aprendizaje.evaluaciones.map((e, i) => (
                            <tr key={`${e.t}-${i}`} className="border-t border-white/5">
                                <td className="py-1 font-mono text-white/60">
                                    {e.t ? new Date(e.t).toLocaleTimeString() : "—"}
                                </td>
                                <td className="py-1 font-mono text-white/80">{e.puntuacion}</td>
                                <td className="py-1 text-white/50">{e.tono || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Tarjeta>
    );
}

/** Tarjeta «Crónica»: bloque plegable con las últimas líneas. */
function TarjetaCronica({ aprendizaje }: { aprendizaje: Aprendizaje158 }) {
    const [abierta, setAbierta] = useState(false);
    if (!aprendizaje.cronica) {
        return (
            <Tarjeta
                titulo="Crónica"
                testId="tarjeta-cronica"
                icono={<ScrollText className="h-4 w-4 text-white/70" aria-hidden />}
            >
                <p className="text-xs text-white/50">Sin crónica en disco todavía.</p>
            </Tarjeta>
        );
    }
    return (
        <Tarjeta
            titulo="Crónica"
            testId="tarjeta-cronica"
            icono={<ScrollText className="h-4 w-4 text-white/70" aria-hidden />}
        >
            <button
                type="button"
                onClick={() => setAbierta((v) => !v)}
                className="mb-2 inline-flex cursor-pointer items-center gap-1 text-xs text-white/70 hover:text-white"
            >
                {abierta ? "Ocultar" : "Leer"} · últimas 30 líneas
            </button>
            {abierta && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white/5 p-2 font-mono text-[11px] leading-relaxed text-white/70">
                    {aprendizaje.cronica}
                </pre>
            )}
        </Tarjeta>
    );
}

/** Tarjeta «Fábrica y adaptadores»: instalada/no y lista, con exportación por personalidad. */
function TarjetaFabrica({
    aprendizaje,
    exportar,
}: {
    aprendizaje: Aprendizaje158;
    exportar: (personalidad: string) => void;
}) {
    const [confirmada, setConfirmada] = useState<string | null>(null);
    return (
        <Tarjeta
            titulo="Fábrica y adaptadores"
            testId="tarjeta-fabrica"
            icono={<Factory className="h-4 w-4 text-white/70" aria-hidden />}
        >
            <div className="mb-2 flex items-center gap-2">
                <span
                    className={`h-2 w-2 shrink-0 rounded-full ${aprendizaje.fabrica?.instalada ? "bg-emerald-400" : "bg-zinc-500"}`}
                    aria-hidden
                />
                <span className="text-xs text-white/70">
                    {aprendizaje.fabrica?.instalada ? "Fábrica instalada" : "Fábrica no instalada"}
                </span>
            </div>
            {aprendizaje.fabrica?.detalle ? (
                <p className="mb-2 text-[11px] text-white/40">{aprendizaje.fabrica.detalle}</p>
            ) : null}

            {aprendizaje.adaptadores.length > 0 ? (
                <ul className="space-y-1">
                    {aprendizaje.adaptadores.map((a, i) => (
                        <li key={`${a.id}-${i}`} className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate font-mono text-white/80">{a.id || a.personalidad || "adaptador"}</span>
                            <span className="shrink-0 text-white/50">{a.personalidad} {a.fecha ? `· ${a.fecha}` : ""}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mb-2 text-xs text-white/50">Sin adaptadores registrados.</p>
            )}

            {aprendizaje.corpus.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-2">
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/40">
                        Exportar train.jsonl
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {aprendizaje.corpus.map((p) => (
                            <button
                                key={p.nombre}
                                type="button"
                                onClick={() => {
                                    if (confirmada === p.nombre) {
                                        setConfirmada(null);
                                        exportar(p.nombre);
                                    } else {
                                        setConfirmada(p.nombre);
                                    }
                                }}
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5 ${
                                    confirmada === p.nombre ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "text-white/70"
                                }`}
                            >
                                <Download className="h-3 w-3" aria-hidden />
                                {p.nombre}
                                {confirmada === p.nombre ? " · ¿seguro?" : ""}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </Tarjeta>
    );
}

/** Mini-formulario «Valorar turno»: id + 👍/👎/neutro + nota. */
function TarjetaValorar({
    valorId,
    setValorId,
    valorNota,
    setValorNota,
    enviando,
    valorar,
}: {
    valorId: string;
    setValorId: (v: string) => void;
    valorNota: string;
    setValorNota: (v: string) => void;
    enviando: boolean;
    valorar: (valoracion: -1 | 0 | 1) => void;
}) {
    return (
        <Tarjeta
            titulo="Valorar turno"
            testId="tarjeta-valorar"
            icono={<Check className="h-4 w-4 text-white/70" aria-hidden />}
        >
            <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs text-white/60">
                    <span className="shrink-0">Id del turno</span>
                    <input
                        value={valorId}
                        onChange={(e) => setValorId(e.target.value)}
                        placeholder="UUID del turno"
                        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs text-white/90 placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                    />
                </label>
                <label className="flex items-center gap-2 text-xs text-white/60">
                    <span className="shrink-0">Nota</span>
                    <input
                        value={valorNota}
                        onChange={(e) => setValorNota(e.target.value)}
                        placeholder="Opcional: por qué esta valoración"
                        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/90 placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                    />
                </label>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={() => valorar(1)}
                        disabled={enviando}
                        title="Buena"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                        Buena
                    </button>
                    <button
                        type="button"
                        onClick={() => valorar(0)}
                        disabled={enviando}
                        title="Neutra"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
                    >
                        Neutra
                    </button>
                    <button
                        type="button"
                        onClick={() => valorar(-1)}
                        disabled={enviando}
                        title="Mala"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                    >
                        <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                        Mala
                    </button>
                </div>
            </div>
        </Tarjeta>
    );
}

export function PanelAprendizaje() {
    const [aprendizaje, setAprendizaje] = useState<Aprendizaje158 | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Acción «Valorar turno»: id del turno, valoración (-1|0|1) y nota.
    const [valorId, setValorId] = useState("");
    const [valorNota, setValorNota] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const [mensajeTono, setMensajeTono] = useState<"ok" | "error">("ok");

    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        const conForzado = async (forzar = false) => {
            if (enCurso) return;
            enCurso = true;
            try {
                if (forzar || document.visibilityState !== "hidden") {
                    if (forzar) setCargando(true);
                    try {
                        const respuesta = await fetch("/api/mando/aprendizaje", { cache: "no-store" });
                        if (!vivo) return;
                        if (!respuesta.ok) {
                            setError(
                                respuesta.status === 404
                                    ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                                    : respuesta.status === 401
                                      ? "Necesitas iniciar sesión para ver el aprendizaje."
                                      : `No se pudo leer el aprendizaje (HTTP ${respuesta.status}).`,
                            );
                            setAprendizaje(null);
                            return;
                        }
                        setAprendizaje((await respuesta.json()) as Aprendizaje158);
                    } catch {
                        if (vivo) setError("No se pudo leer el aprendizaje.");
                    } finally {
                        if (vivo) setCargando(false);
                    }
                }
            } finally {
                enCurso = false;
            }
        };
        void conForzado(true);
        const cada = window.setInterval(() => void conForzado(), 20_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void conForzado(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    /** Envía una valoración manual de un turno al backend. */
    const valorar = useCallback(async (valoracion: -1 | 0 | 1) => {
        const id = valorId.trim();
        if (!id) {
            setMensaje("Escribe el id del turno que quieres valorar.");
            setMensajeTono("error");
            return;
        }
        setEnviando(true);
        setMensaje(null);
        try {
            const respuesta = await fetch("/api/mando/aprendizaje", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "valorar", id, valoracion, nota: valorNota.trim() }),
            });
            if (respuesta.ok) {
                setMensaje(`Turno ${id} valorado.`);
                setMensajeTono("ok");
                setValorId("");
                setValorNota("");
            } else {
                setMensaje("El backend no pudo valorar el turno.");
                setMensajeTono("error");
            }
        } catch {
            setMensaje("No se pudo valorar el turno.");
            setMensajeTono("error");
        } finally {
            setEnviando(false);
        }
    }, [valorId, valorNota]);

    /** Pide exportar el corpus de una personalidad (la confirmación ya la hace el botón). */
    const exportar = useCallback(async (personalidad: string) => {
        setMensaje(null);
        try {
            const respuesta = await fetch("/api/mando/aprendizaje", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "exportar", personalidad }),
            });
            const datos = (await respuesta.json()) as { ok: boolean; turnos: number; ruta: string };
            if (datos.ok) {
                setMensaje(`Exportado: ${datos.turnos} turnos → ${datos.ruta || "train.jsonl"}`);
                setMensajeTono("ok");
            } else {
                setMensaje("La exportación falló (backend apagado o sin corpus).");
                setMensajeTono("error");
            }
        } catch {
            setMensaje("No se pudo exportar el corpus.");
            setMensajeTono("error");
        }
    }, []);

    if (cargando && !aprendizaje) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo el aprendizaje de Astraura 1.58…
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error}
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Reintentar
                </button>
            </div>
        );
    }

    if (!aprendizaje) return null;

    const totalTurnos = aprendizaje.corpus.reduce((acc, p) => acc + p.turnos, 0);

    return (
        <section data-testid="panel-aprendizaje" className="space-y-4">
            <header className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-white/60">
                    <BookOpen className="h-4 w-4" aria-hidden />
                    Se refresca solo cada 20 segundos · leído {new Date(aprendizaje.t).toLocaleTimeString()}.
                </p>
            </header>

            {mensaje && (
                <p
                    role="status"
                    className={`rounded-lg border px-3 py-2 text-xs ${
                        mensajeTono === "ok"
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                            : "border-red-400/30 bg-red-500/10 text-red-200"
                    }`}
                >
                    {mensaje}
                </p>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <TarjetaCorpus aprendizaje={aprendizaje} totalTurnos={totalTurnos} />
                <TarjetaCuracion aprendizaje={aprendizaje} />
                <TarjetaEvaluaciones aprendizaje={aprendizaje} />
                <TarjetaCronica aprendizaje={aprendizaje} />
                <TarjetaFabrica aprendizaje={aprendizaje} exportar={exportar} />
            </div>

            <TarjetaValorar
                valorId={valorId}
                setValorId={setValorId}
                valorNota={valorNota}
                setValorNota={setValorNota}
                enviando={enviando}
                valorar={valorar}
            />
        </section>
    );
}