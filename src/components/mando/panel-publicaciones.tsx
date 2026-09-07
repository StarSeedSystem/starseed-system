"use client";

/**
 * Panel «Commits pendientes» del Centro de Mando (Ola 274 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista los commits sin publicar del OS y de Astraura (agrupados por ola, con
 * diffstat y base remota) y lanza publicaciones —producción, vista previa o
 * paquete— siempre detrás de la confirmación escrita del diálogo. Se sondea
 * cada 30 s con el patrón de visibilidad de los demás paneles del Mando.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Check,
    ChevronDown,
    CircleDashed,
    ExternalLink,
    Eye,
    GitBranch,
    GitCommitHorizontal,
    Package,
    Rocket,
    Send,
} from "lucide-react";

import type {
    EstadoRepoPublicable,
    LineaBitacora,
    ModoPublicacion,
    TrabajoPublicacion,
} from "@/lib/mando/publicaciones";
import { ConfirmarPublicacion } from "@/components/mando/confirmar-publicacion";

/** Respuesta del `GET /api/mando/publicaciones`. */
type Resumen = {
    t: string;
    repos: EstadoRepoPublicable[];
    bitacora: LineaBitacora[];
};

/** Modos con su icono y etiqueta para las acciones por repo. */
const ACCIONES: Array<{ modo: ModoPublicacion; icono: typeof Send; etiqueta: string }> = [
    { modo: "produccion", icono: Rocket, etiqueta: "Publicar todo" },
    { modo: "vista-previa", icono: Eye, etiqueta: "Vista previa" },
    { modo: "paquete", icono: Package, etiqueta: "Paquete" },
];

/** Texto corto del estado de un trabajo de publicación. */
const TEXTO_ESTADO_TRABAJO: Record<TrabajoPublicacion["estado"], string> = {
    en_curso: "En curso",
    publicado: "Publicado",
    fallo: "Falló",
};

/** Formatea un sha/iso a «hace …». */
function hace(iso: string | null | undefined): string {
    if (!iso) return "—";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "—";
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return `hace ${s} s`;
    const min = Math.floor(s / 60);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
}

/** Botón de copiar un sha corto: copia al portapapeles y marca «copiado» un instante. */
function CopiarSha({ corto }: { corto: string }) {
    const [copiado, setCopiado] = useState(false);
    return (
        <button
            type="button"
            title="Copiar sha"
            onClick={() => {
                void navigator.clipboard
                    .writeText(corto)
                    .then(() => {
                        setCopiado(true);
                        window.setTimeout(() => setCopiado(false), 1200);
                    })
                    .catch(() => undefined);
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded font-mono text-[11px] text-white/50 hover:text-white"
        >
            {copiado ? <Check className="h-3 w-3 text-emerald-400" aria-hidden /> : null}
            {corto}
        </button>
    );
}

/** Chip de tono con el aviso/danger/ok del repo. */
const TONO_CHIP: Record<"aviso" | "peligro" | "ok", string> = {
    aviso: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    peligro: "border-red-400/30 bg-red-500/10 text-red-200",
    ok: "border-white/10 bg-white/5 text-white/60",
};

/**
 * Lista de commits de una ola, del más antiguo al más nuevo (para que «publicar
 * hasta aquí» tenga sentido) con su sha copiable, hora relativa, chip de tarea,
 * título y diffstat por archivo.
 */
function CommitsDeOla({
    commits,
    alPublicarHasta,
}: {
    commits: EstadoRepoPublicable["commits"];
    /** Se llama con el sha completo del corte elegido. */
    alPublicarHasta: (sha: string) => void;
}) {
    // El orden de llegada es de nuevo a viejo; dentro del grupo se invierte para
    // ofrecer «publicar hasta aquí» de abajo (viejo) hacia arriba (nuevo).
    const ascendentes = [...commits].reverse();
    return (
        <ul className="mt-2 space-y-1 border-t border-white/5 pt-2">
            {ascendentes.map((c) => (
                <li key={c.sha} className="flex flex-col gap-1 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
                    <div className="flex items-center gap-2 text-xs">
                        <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                        <CopiarSha corto={c.corto} />
                        <span className="text-white/40">{hace(c.fecha)}</span>
                        {c.tarea ? (
                            <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/60">{c.tarea}</span>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => alPublicarHasta(c.sha)}
                            className="ml-auto cursor-pointer text-[11px] text-white/50 hover:text-trinity-azure"
                        >
                            Publicar hasta aquí
                        </button>
                    </div>
                    <p className="truncate text-xs text-white/80">{c.titulo}</p>
                    <p className="font-mono text-[10px] text-white/40">
                        +{c.mas} −{c.menos} · {c.archivos} archivos
                    </p>
                </li>
            ))}
        </ul>
    );
}

/** Estado de un trabajo en curso: barra indeterminada, salida y enlaces. */
function TrabajoEnCurso({ trabajo }: { trabajo: TrabajoPublicacion }) {
    const tonoBorde =
        trabajo.estado === "publicado"
            ? "border-emerald-400/30 bg-emerald-500/10"
            : trabajo.estado === "fallo"
              ? "border-red-400/30 bg-red-500/10"
              : "border-white/10 bg-white/5";
    return (
        <div className={`rounded-lg border p-3 ${tonoBorde}`}>
            <div className="flex items-center gap-2 text-xs text-white/80">
                {trabajo.estado === "en_curso" ? <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                <span>
                    {trabajo.repo} · {trabajo.modo} · {TEXTO_ESTADO_TRABAJO[trabajo.estado]}
                </span>
                <span className="text-white/40">hasta {trabajo.hastaCorto || trabajo.hasta.slice(0, 7)}</span>
                <span className="text-white/40">{trabajo.commits} commits</span>
            </div>
            {trabajo.estado === "en_curso" ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-trinity-azure" />
                </div>
            ) : null}
            {trabajo.salida ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[10px] text-white/60">
                    {trabajo.salida}
                </pre>
            ) : null}
            {trabajo.estado !== "en_curso" ? (
                <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                    {trabajo.enlaces.github ? (
                        <a href={trabajo.enlaces.github} target="_blank" rel="noreferrer noopener" className="cursor-pointer text-white/60 hover:text-white">
                            GitHub
                        </a>
                    ) : null}
                    {trabajo.enlaces.comparar ? (
                        <a href={trabajo.enlaces.comparar} target="_blank" rel="noreferrer noopener" className="cursor-pointer text-white/60 hover:text-white">
                            Comparar
                        </a>
                    ) : null}
                    {trabajo.enlaces.vercel ? (
                        <a href={trabajo.enlaces.vercel} target="_blank" rel="noreferrer noopener" className="cursor-pointer text-white/60 hover:text-white">
                            Vercel
                        </a>
                    ) : null}
                    {trabajo.enlaces.paquete ? (
                        <CopiarRuta ruta={trabajo.enlaces.paquete} />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** Ruta del paquete `.bundle` copiable: se muestra en mono y se copia al portapapeles. */
function CopiarRuta({ ruta }: { ruta: string }) {
    const [copiado, setCopiado] = useState(false);
    return (
        <button
            type="button"
            title="Copiar ruta del paquete"
            onClick={() => {
                void navigator.clipboard
                    .writeText(ruta)
                    .then(() => {
                        setCopiado(true);
                        window.setTimeout(() => setCopiado(false), 1200);
                    })
                    .catch(() => undefined);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-white/60 hover:text-white"
        >
            {copiado ? <Check className="h-3 w-3 text-emerald-400" aria-hidden /> : <Package className="h-3 w-3" aria-hidden />}
            {ruta}
            <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/60">{copiado ? "Copiada" : "Copiar ruta"}</span>
        </button>
    );
}

/** Panel principal: sondeo 30 s, tarjetas por repo, trabajo en curso y bitácora. */
export function PanelPublicaciones() {
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Petición pendiente del diálogo (repo + modo + hasta) y su sha de corte.
    const [peticion, setPeticion] = useState<{ repo: EstadoRepoPublicable; modo: ModoPublicacion; hasta?: string; verificacionNeurona: number | null } | null>(null);
    // Trabajo activo (se sondea junto al resumen mientras esté en curso).
    const [trabajo, setTrabajo] = useState<TrabajoPublicacion | null>(null);
    // Última puntuación de la verificación de la Neurona, leída UNA vez al montar
    // (para el punto «última verificación ≥ 70» del diálogo). Se pide aparte y un
    // fallo silencioso la deja en null: el punto no bloquea sin verificación.
    const [verificacionNeurona, setVerificacionNeurona] = useState<number | null>(null);

    useEffect(() => {
        let vivo = true;
        void fetch("/api/mando/neurona", { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<{ verificacion: { puntuacion: number } | null }>) : null))
            .then((s) => {
                if (vivo && s?.verificacion) setVerificacionNeurona(s.verificacion.puntuacion);
            })
            .catch(() => undefined);
        return () => {
            vivo = false;
        };
    }, []);

    const cargar = useCallback(async () => {
        try {
            const respuesta = await fetch("/api/mando/publicaciones", { cache: "no-store" });
            if (!respuesta.ok) {
                setError(`No se pudo leer el estado de publicaciones (HTTP ${respuesta.status}).`);
                return;
            }
            setResumen((await respuesta.json()) as Resumen);
            setError(null);
        } catch {
            setError("No se pudo leer el estado de publicaciones.");
        } finally {
            setCargando(false);
        }
    }, []);

    const cargarTrabajo = useCallback(async (id: string) => {
        try {
            const respuesta = await fetch(`/api/mando/publicaciones?trabajo=${id}`, { cache: "no-store" });
            if (!respuesta.ok) return;
            const t = (await respuesta.json()) as TrabajoPublicacion;
            setTrabajo(t);
            if (t.estado === "en_curso") window.setTimeout(() => void cargarTrabajo(id), 5000);
            else void cargar();
        } catch {
            // Sin red durante el trabajo: se vuelve a intentar en el siguiente sondeo.
        }
    }, [cargar]);

    useEffect(() => {
        let enCurso = false;
        const medir = async () => {
            if (enCurso) return;
            enCurso = true;
            await cargar();
            enCurso = false;
        };
        void medir();
        const cada = window.setInterval(() => void medir(), 30_000);
        return () => window.clearInterval(cada);
    }, [cargar]);

    const alAccion = useCallback(
        (repo: EstadoRepoPublicable, modo: ModoPublicacion, hasta?: string) => {
            setPeticion({ repo, modo, hasta, verificacionNeurona });
        },
        [verificacionNeurona],
    );

    const alConfirmar = useCallback(
        async (resultado: { repo: string; modo: ModoPublicacion; hasta?: string; confirmacion: string }) => {
            setPeticion(null);
            try {
                const respuesta = await fetch("/api/mando/publicaciones", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        accion: "publicar",
                        repo: resultado.repo,
                        modo: resultado.modo,
                        hasta: resultado.hasta,
                        confirmacion: resultado.confirmacion,
                        quien: "alex",
                    }),
                });
                const cuerpo = (await respuesta.json()) as { ok: boolean; id?: string };
                if (cuerpo.ok && cuerpo.id) {
                    setTrabajo(null);
                    void cargarTrabajo(cuerpo.id);
                } else {
                    setError("La publicación no se pudo lanzar.");
                }
            } catch {
                setError("No se pudo lanzar la publicación.");
            }
        },
        [cargarTrabajo],
    );

    const alPublicarHasta = useCallback(
        (repo: EstadoRepoPublicable) => (sha: string) => alAccion(repo, "produccion", sha),
        [alAccion],
    );

    return (
        <section data-testid="panel-publicaciones" className="space-y-4">
            {cargando && !resumen ? (
                <p className="flex items-center gap-2 text-sm text-white/60">
                    <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                    Midiendo los commits pendientes…
                </p>
            ) : error ? (
                <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {error}
                </p>
            ) : null}

            {trabajo ? <TrabajoEnCurso trabajo={trabajo} /> : null}

            {resumen && resumen.repos.length === 0 ? (
                <p className="text-sm text-white/60">No hay repositorios publicables en esta máquina.</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {resumen?.repos.map((repo) => (
                        <TarjetaRepo
                            key={repo.repo}
                            repo={repo}
                            alAccion={(modo) => alAccion(repo, modo)}
                            alPublicarHasta={alPublicarHasta(repo)}
                        />
                    ))}
                </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h3 className="text-sm font-semibold text-white">Bitácora</h3>
                {resumen?.bitacora.length ? (
                    <ul className="mt-2 space-y-1">
                        {resumen.bitacora.map((l) => (
                            <li key={l.id} className="flex items-center gap-2 font-mono text-[11px] text-white/50">
                                <span className={l.estado === "publicado" ? "text-emerald-400" : "text-red-400"}>
                                    {l.estado === "publicado" ? "✓" : "✗"}
                                </span>
                                <span>{l.t.slice(0, 19).replace("T", " ")}</span>
                                <span className="text-white/70">{l.repo}</span>
                                <span>{l.modo}</span>
                                <span className="text-white/40">{l.commits} commits · {l.quien}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-xs text-white/40">Sin publicaciones registradas.</p>
                )}
            </div>

            <ConfirmarPublicacion
                peticion={peticion}
                alConfirmar={alConfirmar}
                alCerrar={() => setPeticion(null)}
            />
        </section>
    );
}

/** Chip de una ola (cabecera plegable): «Ola N · K commits · último hace X». */
function CabeceraOla({
    etiqueta,
    commits,
    ultimo,
    abierta,
    alAlternar,
}: {
    etiqueta: string;
    commits: number;
    ultimo: string;
    abierta: boolean;
    alAlternar: () => void;
}) {
    return (
        <button
            type="button"
            onClick={alAlternar}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-white/70 hover:bg-white/[0.03]"
        >
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform ${abierta ? "" : "-rotate-90"}`} aria-hidden />
            <span className="font-semibold text-white/90">{etiqueta}</span>
            <span className="text-white/50">· {commits} commits</span>
            <span className="ml-auto text-white/40">último {ultimo}</span>
        </button>
    );
}

/**
 * Tarjeta de un repositorio publicable: cabecera con base remota y chips de
 * estado, acciones (Publicar todo / Vista previa / Paquete) y la lista de
 * commits agrupados por ola con «Publicar hasta aquí». Si el repo no existe en
 * esta máquina (ruta vacía sin commits ni rama) se dibuja gris con la ruta.
 */
function TarjetaRepo({
    repo,
    alAccion,
    alPublicarHasta,
}: {
    repo: EstadoRepoPublicable;
    alAccion: (modo: ModoPublicacion) => void;
    alPublicarHasta: (sha: string) => void;
}) {
    const [abierta, setAbierta] = useState<Record<string, boolean>>({});

    const ausente = repo.remoto === null && repo.commits.length === 0 && !repo.rama;
    if (ausente) {
        return (
            <article className="rounded-xl border border-white/10 bg-black/20 p-4 opacity-70">
                <header className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-white/50" aria-hidden />
                    <span className="font-semibold text-white/60">{repo.nombre}</span>
                </header>
                <p className="mt-2 font-mono text-[11px] text-white/40">{repo.ruta}</p>
                <p className="mt-1 text-xs text-white/50">{repo.aviso ?? "Este repositorio no está en esta máquina."}</p>
            </article>
        );
    }

    const deshabilitado = repo.remoto === null || repo.remotoMovido || repo.commits.length === 0;
    const motivo = repo.remoto === null
        ? "Sin rama remota configurada"
        : repo.remotoMovido
          ? "El remoto se movió: integra a mano primero"
          : repo.commits.length === 0
            ? "No hay commits pendientes"
            : "";

    return (
        <article data-testid="tarjeta-repo" className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center gap-2">
                <GitBranch className="h-4 w-4 text-white/70" aria-hidden />
                <h3 className="text-sm font-semibold text-white">{repo.nombre}</h3>
                <span className="font-mono text-xs text-white/50">{repo.rama}</span>
                <span className="text-[11px] text-white/40">
                    base {repo.base ? repo.base.corto : "—"} · {repo.base ? hace(repo.base.fecha) : "—"}
                </span>
            </header>

            <div className="mt-2 flex flex-wrap gap-1.5">
                {repo.delante > 0 ? (
                    <span className={TONO_CHIP.aviso + " rounded-full px-2 py-0.5 text-[11px]"}>{repo.delante} delante</span>
                ) : (
                    <span className={TONO_CHIP.ok + " rounded-full px-2 py-0.5 text-[11px]"}>0 delante</span>
                )}
                {repo.detras !== null ? (
                    <span className={TONO_CHIP[repo.detras > 0 ? "aviso" : "ok"] + " rounded-full px-2 py-0.5 text-[11px]"}>
                        {repo.detras} detrás
                    </span>
                ) : null}
                <span className={TONO_CHIP[repo.arbolLimpio ? "ok" : "aviso"] + " rounded-full px-2 py-0.5 text-[11px]"}>
                    {repo.arbolLimpio ? "árbol limpio" : "cambios sin commit"}
                </span>
                {repo.enjambreEscribiendo ? (
                    <span className={TONO_CHIP.aviso + " rounded-full px-2 py-0.5 text-[11px]"}>enjambre escribiendo</span>
                ) : null}
                {repo.remotoMovido ? (
                    <span className={TONO_CHIP.peligro + " rounded-full px-2 py-0.5 text-[11px]"}>remoto movido</span>
                ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {ACCIONES.map((accion) => {
                    const Icono = accion.icono;
                    return (
                        <button
                            key={accion.modo}
                            type="button"
                            disabled={deshabilitado}
                            title={deshabilitado ? motivo : undefined}
                            onClick={() => alAccion(accion.modo)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Icono className="h-3.5 w-3.5" aria-hidden />
                            {accion.etiqueta}
                        </button>
                    );
                })}
                {repo.enlaces.github ? (
                    <a
                        href={repo.enlaces.github}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex cursor-pointer items-center gap-1 text-xs text-white/50 hover:text-white"
                    >
                        <ExternalLink className="h-3 w-3" aria-hidden /> GitHub
                    </a>
                ) : null}
            </div>

            {repo.commits.length === 0 ? (
                <p className="mt-3 text-xs text-white/50">Todo publicado.</p>
            ) : (
                <div className="mt-3 space-y-1">
                    {repo.porOla.map((grupo) => {
                        const commits = repo.commits.filter((c) => (c.ola ?? null) === grupo.ola);
                        // «último hace X»: el commit más antiguo del grupo (base de la ola).
                        const masAntiguo = commits[commits.length - 1];
                        const estaAbierta = abierta[grupo.etiqueta] ?? true;
                        return (
                            <div key={grupo.etiqueta} className="rounded-lg border border-white/5 bg-white/[0.02]">
                                <CabeceraOla
                                    etiqueta={grupo.etiqueta}
                                    commits={grupo.commits}
                                    ultimo={masAntiguo ? hace(masAntiguo.fecha) : grupo.ultimo}
                                    abierta={estaAbierta}
                                    alAlternar={() => setAbierta((prev) => ({ ...prev, [grupo.etiqueta]: !estaAbierta }))}
                                />
                                {estaAbierta ? <CommitsDeOla commits={commits} alPublicarHasta={alPublicarHasta} /> : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </article>
    );
}