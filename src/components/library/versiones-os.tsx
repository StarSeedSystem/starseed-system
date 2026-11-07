// StarSeed OS · Biblioteca — VersionesOs (Ola 1105H, tarea VER1105H; diseño LIB1107A).
// Centro de versiones dentro de la ficha del OS: la versión instalada, la última publicada
// con «Actualizar», los archivos de cada sistema (ventanas con el símbolo de StarSeed) y el
// historial. Lee /api/os/versiones. Compatible móvil y escritorio.
//
// (2026-11-07, LIB1107A) La API responde { versiones: [...], aviso } con los archivos
// agrupados por sistema; el componente leía una versión suelta con los archivos en lista y
// se rompía al abrirse. `normalizarRespuestaVersiones` acepta las dos formas (solo lectura:
// no cambia los datos). La versión instalada sale de os-release.ts (fuente única), no de una
// fecha escrita a mano.

"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";

import type { AssetRelease, ReleaseOficial } from "@/lib/apps-oficiales/apps-oficiales";
import { OS_RELEASES_ULTIMA_URL } from "@/lib/install/instalar-os-logica";
import { NATIVE_TAG, OS_CANAL, OS_FECHA, OS_VERSION, formatearFechaBuild } from "@/lib/version/os-release";

import { SimboloStarSeed } from "./simbolo-starseed";
import { VentanasDescargaOS, tagLegible } from "./ventanas-descarga-os";

const API_VERSIONES = "/api/os/versiones";

const CANAL_LEGIBLE: Record<typeof OS_CANAL, string> = { alpha: "Alpha", beta: "Beta", estable: "Estable" };

export interface VersionNormalizada {
    version: string;
    fecha: string;
    notas: string;
    url: string;
    archivos: AssetRelease[];
}

type Crudo = Record<string, unknown>;

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

function archivoDe(x: unknown): AssetRelease | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Crudo;
    const nombre = texto(o.nombre) || texto(o.name);
    const url = texto(o.href) || texto(o.browser_download_url) || texto(o.url);
    const bytes = typeof o.bytes === "number" ? o.bytes : typeof o.size === "number" ? o.size : 0;
    if (!nombre || !url) return null;
    return { nombre, url, bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0 };
}

/** Los archivos del OS, vengan en lista o agrupados por sistema ({ macos: [...], ... }). */
function archivosDe(os: unknown): AssetRelease[] {
    const lista = Array.isArray(os)
        ? os
        : os && typeof os === "object"
          ? Object.values(os as Crudo).flatMap((v) => (Array.isArray(v) ? v : []))
          : [];
    return lista.map(archivoDe).filter((a): a is AssetRelease => a !== null);
}

function versionDe(x: unknown): VersionNormalizada | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Crudo;
    const version = texto(o.version);
    if (!version) return null;
    const archivos = o.archivos && typeof o.archivos === "object" ? archivosDe((o.archivos as Crudo).os) : [];
    return { version, fecha: texto(o.fecha), notas: texto(o.notas), url: texto(o.url), archivos };
}

/**
 * Lee la respuesta de /api/os/versiones ({ versiones: [...], aviso? }, la más reciente
 * primero) y también la forma antigua (una sola versión). Nunca lanza.
 */
export function normalizarRespuestaVersiones(data: unknown): { versiones: VersionNormalizada[]; aviso?: string } {
    if (!data || typeof data !== "object") return { versiones: [] };
    const o = data as Crudo;
    const crudas: unknown[] = Array.isArray(o.versiones) ? o.versiones : [o];
    const versiones = crudas.map(versionDe).filter((v): v is VersionNormalizada => v !== null);
    const aviso = texto(o.aviso);
    return aviso ? { versiones, aviso } : { versiones };
}

/** ¿Se publicó después de esta compilación del OS? (fechas AAAA-MM-DD; nunca lanza). */
export function esPosteriorAEstaVersion(fecha: string, base: string = OS_FECHA): boolean {
    const f = fecha.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(f) && f > base.slice(0, 10);
}

function releaseDe(v: VersionNormalizada): ReleaseOficial {
    return { tag: v.version, publicado: v.fecha, url: v.url, assets: v.archivos };
}

function fechaLegible(fecha: string): string {
    return fecha ? formatearFechaBuild(fecha.slice(0, 10)) : "—";
}

type Estado =
    | { fase: "cargando" }
    | { fase: "error"; mensaje: string }
    | { fase: "listo"; versiones: VersionNormalizada[]; aviso?: string };

const CLASE_ENLACE =
    "inline-flex cursor-pointer items-center gap-1 rounded text-sm font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald";

/** La línea de estado: al día, o «Actualización disponible» con su botón. */
function EstadoActualizacion({ ultima }: { ultima: VersionNormalizada }) {
    if (!esPosteriorAEstaVersion(ultima.fecha)) {
        return (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-trinity-emerald/25 bg-trinity-emerald/[0.06] px-3 py-2.5 text-sm text-emerald-100 sm:justify-start">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                Al día: no hay una versión publicada después de esta.
            </p>
        );
    }
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-trinity-amber/30 bg-trinity-amber/[0.07] p-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-100">
                    <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                    Actualización disponible
                </p>
                <p className="text-xs text-amber-100/80">
                    {tagLegible(ultima.version)} · publicada el {fechaLegible(ultima.fecha)}
                </p>
            </div>
            <button
                type="button"
                onClick={() => {
                    // Lo recoge el actualizador de cada medio (web, PWA o app nativa).
                    window.dispatchEvent(new CustomEvent("starseed:actualizar-version", { detail: { version: ultima.version } }));
                }}
                className="inline-flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-trinity-amber px-5 text-sm font-semibold text-slate-950 transition-[filter] duration-150 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trinity-amber motion-reduce:transition-none sm:w-auto"
            >
                <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
            </button>
        </div>
    );
}

function Historial({ versiones }: { versiones: VersionNormalizada[] }) {
    const id = useId();
    const vistas = versiones.slice(0, 5);
    return (
        <section aria-labelledby={id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <h4 id={id} className="font-headline text-lg font-semibold leading-tight text-foreground">
                    Historial de versiones
                </h4>
                <a href={OS_RELEASES_ULTIMA_URL.replace(/\/latest$/, "")} target="_blank" rel="noopener noreferrer" className={CLASE_ENLACE}>
                    Ver en GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
            </div>
            {vistas.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-sm text-muted-foreground">
                    Aún no hay versiones publicadas en GitHub: la descarga usa la última versión conocida.
                </p>
            ) : (
                <ol className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                    {vistas.map((v, i) => (
                        <li key={`${v.version}-${i}`} className="grid gap-1 px-3 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                            <div className="flex items-center gap-2">
                                <span className="font-code text-sm font-semibold text-foreground">{tagLegible(v.version)}</span>
                                {i === 0 && (
                                    <span className="rounded-full bg-trinity-emerald/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">Última</span>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">{fechaLegible(v.fecha)}</p>
                                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/85">{v.notas || "Sin notas publicadas."}</p>
                            </div>
                            {v.url && (
                                <a href={v.url} target="_blank" rel="noopener noreferrer" className={CLASE_ENLACE}>
                                    Notas{" "}
                                    <span className="sr-only">de {tagLegible(v.version)}</span>
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                </a>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

export function VersionesOs() {
    const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
    const [intento, setIntento] = useState(0);
    const tituloId = useId();

    useEffect(() => {
        let vivo = true;
        setEstado({ fase: "cargando" });
        fetch(API_VERSIONES, { cache: "no-store" })
            .then((res) => {
                if (!res.ok) throw new Error("Versiones no disponibles");
                return res.json() as Promise<unknown>;
            })
            .then((data) => {
                if (vivo) setEstado({ fase: "listo", ...normalizarRespuestaVersiones(data) });
            })
            .catch((e: unknown) => {
                if (vivo) setEstado({ fase: "error", mensaje: e instanceof Error ? e.message : "Error al cargar versiones" });
            });
        return () => {
            vivo = false;
        };
    }, [intento]);

    const ultima = estado.fase === "listo" ? estado.versiones[0] : undefined;

    return (
        <section
            aria-labelledby={tituloId}
            aria-busy={estado.fase === "cargando" || undefined}
            className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-sm sm:p-6"
            data-testid="versiones-os"
        >
            {/* Cabecera: el símbolo y lo que hay instalado frente a lo último publicado */}
            <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
                <SimboloStarSeed size={64} halo />
                <div className="min-w-0 flex-1">
                    <h3 id={tituloId} className="font-headline text-xl font-semibold leading-tight text-foreground">
                        Centro de versiones
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">StarSeed OS para cada sistema, con su historial completo.</p>
                </div>
            </header>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Versión instalada</dt>
                    <dd className="mt-0.5 flex items-baseline gap-2">
                        <span className="font-headline text-xl font-semibold tabular-nums text-foreground">{OS_VERSION}</span>
                        <span className="text-xs text-muted-foreground">
                            {CANAL_LEGIBLE[OS_CANAL]} · apps nativas {NATIVE_TAG}
                        </span>
                    </dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Última publicada</dt>
                    <dd className="mt-0.5 flex items-baseline gap-2">
                        {estado.fase === "cargando" ? (
                            <span className="my-1 inline-block h-6 w-28 rounded bg-white/10 motion-safe:animate-pulse" aria-hidden />
                        ) : ultima ? (
                            <>
                                <span className="font-headline text-xl font-semibold tabular-nums text-foreground">{tagLegible(ultima.version)}</span>
                                <span className="text-xs text-muted-foreground">{fechaLegible(ultima.fecha)}</span>
                            </>
                        ) : (
                            <span className="font-headline text-xl font-semibold text-muted-foreground">—</span>
                        )}
                    </dd>
                </div>
            </dl>

            {estado.fase === "cargando" && (
                <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start">
                    <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                    Cargando información de versiones…
                </p>
            )}

            {estado.fase === "error" && (
                <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center sm:flex-row sm:justify-between sm:text-left">
                    <p className="text-sm text-foreground/85">
                        No se pudo cargar el historial de versiones ({estado.mensaje}). Las descargas de abajo usan la última versión conocida.
                    </p>
                    <button
                        type="button"
                        onClick={() => setIntento((n) => n + 1)}
                        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-foreground hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trinity-emerald"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
                    </button>
                </div>
            )}

            {ultima && <EstadoActualizacion ultima={ultima} />}

            {/* Archivos por sistema: con datos de la API; si falló o vino vacía, los del botón de instalar. */}
            {estado.fase !== "cargando" && (
                <VentanasDescargaOS
                    titulo="Archivos por sistema"
                    nivel={4}
                    release={ultima && ultima.archivos.length > 0 ? releaseDe(ultima) : undefined}
                    origen={estado.fase === "listo" && estado.aviso ? "respaldo" : undefined}
                />
            )}

            {estado.fase === "listo" && <Historial versiones={estado.versiones} />}
        </section>
    );
}
