"use client";

/**
 * Ventanas de descarga de StarSeed OS, una por sistema (macOS, Windows, Linux, Android y
 * iPhone/iPad). LIB1107A · 2026-11-07.
 * ═══════════════════════════════════════════════════════════════════════════
 * Alex: «añade el símbolo de StarSeed en las ventanas de descarga de StarSeed OS de la
 * Librería y mejora el diseño… más centrados y profesionales».
 *
 * Solo presentación. Los archivos salen de la MISMA lógica que el botón de un toque
 * (`instaladoresPorSistema`: solo los del OS, sin Nexus ni Café, el recomendado primero) y
 * el sistema de este dispositivo de `useDispositivoActual`. Cada ventana: símbolo, sistema,
 * versión, formato, procesador, tamaño, un botón principal y las alternativas en segundo
 * plano. Estados: buscando (esqueleto con la forma final), sin archivos y sin conexión con
 * GitHub (última versión conocida).
 */

import { useId } from "react";
import { CheckCircle2, Download, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    tamanoLegible,
    type AssetClasificado,
    type DispositivoParaInstalar,
    type ReleaseOficial,
} from "@/lib/apps-oficiales/apps-oficiales";
import { useUltimaVersion, type OrigenVersion } from "@/lib/apps-oficiales/ultima-version";
import { useDispositivoActual } from "@/lib/apps-oficiales/dispositivo-actual";
import {
    instaladoresPorSistema,
    instruccionesAbrir,
    OS_APP_ID,
    OS_RELEASES_ULTIMA_URL,
    PASOS_IOS,
} from "@/lib/install/instalar-os-logica";
import { OS_WEB_URL } from "@/lib/install/device-install";
import { formatearFechaBuild } from "@/lib/version/os-release";

import { SimboloStarSeed } from "./simbolo-starseed";

type Nivel = 2 | 3 | 4;

export interface VentanasDescargaOSProps {
    /** Release a enseñar. Sin pasarlo: el último del OS (la caché es la del botón de instalar). */
    release?: ReleaseOficial | null;
    /** Aún se está buscando la última versión. */
    cargando?: boolean;
    /** De dónde salió el release («respaldo» = sin conexión con GitHub). */
    origen?: OrigenVersion;
    /** Sistema a destacar como recomendado; por defecto, el de este dispositivo. */
    sistemaDetectado?: DispositivoParaInstalar["sistema"];
    titulo?: string;
    /** Nivel del título de la sección (las ventanas usan el siguiente). */
    nivel?: Nivel;
    className?: string;
}

/** «v0.4.3» aunque el tag llegue sin la «v». */
export function tagLegible(tag: string): string {
    return tag.startsWith("v") ? tag : `v${tag}`;
}

/** La extensión, como la nombra la gente: «.dmg», «.exe», «AppImage»… */
export function extensionDe(nombre: string): string {
    const m = /\.(appimage|dmg|exe|msi|deb|rpm|apk|ipa|tar\.gz|zip)$/i.exec(nombre);
    if (!m) return "archivo";
    const ext = m[1].toLowerCase();
    return ext === "appimage" ? "AppImage" : `.${ext}`;
}

function procesadorDe(a: AssetClasificado): string {
    switch (a.arquitectura) {
        case "universal":
            return a.sistema === "macos" ? "Universal (Apple Silicon e Intel)" : "Universal";
        case "x64":
            return "x64 (Intel y AMD)";
        case "arm64":
            return "ARM64";
        default:
            return "";
    }
}

function fechaLegible(publicado: string | undefined): string {
    if (!publicado) return "";
    return formatearFechaBuild(publicado.slice(0, 10));
}

/** Clases del enlace-botón: principal (relleno horizonte) o secundario (cristal). */
function claseBoton(principal: boolean): string {
    return cn(
        "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold",
        "transition-[filter,background-color] duration-150 motion-reduce:transition-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trinity-emerald",
        principal
            ? "bg-trinity-emerald text-slate-950 hover:brightness-110"
            : "border border-white/15 bg-white/[0.06] text-foreground hover:bg-white/[0.12]",
    );
}

/** Marco común de cada ventana: borde fino, sombra simple y el realce del recomendado. */
function claseVentana(recomendada: boolean): string {
    return cn(
        "relative flex h-full flex-col gap-3 rounded-2xl border p-4 shadow-sm",
        recomendada
            ? "border-trinity-emerald/50 bg-trinity-emerald/[0.07] ring-1 ring-inset ring-trinity-emerald/20"
            : "border-white/10 bg-white/[0.03]",
    );
}

function CabeceraVentana({ id, titulo, subtitulo, nivel }: { id: string; titulo: string; subtitulo: string; nivel: Nivel }) {
    const Titulo = `h${Math.min(nivel + 1, 5)}` as "h3" | "h4" | "h5";
    return (
        <header className="flex items-center gap-3">
            <SimboloStarSeed size={40} decorativo />
            <div className="min-w-0 flex-1">
                <Titulo id={id} className="truncate font-headline text-base font-semibold leading-tight text-foreground">
                    {titulo}
                </Titulo>
                <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>
            </div>
        </header>
    );
}

function SelloRecomendada() {
    return (
        <p className="flex items-start gap-1.5 text-xs font-semibold leading-4 text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Recomendada para este dispositivo
        </p>
    );
}

interface VentanaSistemaProps {
    etiqueta: string;
    sistema: string;
    archivos: AssetClasificado[];
    tag: string;
    recomendada: boolean;
    nivel: Nivel;
}

function VentanaSistema({ etiqueta, sistema, archivos, tag, recomendada, nivel }: VentanaSistemaProps) {
    const id = useId();
    const [principal, ...otros] = archivos;
    const tamano = tamanoLegible(principal.bytes);
    const procesador = procesadorDe(principal);
    return (
        <article aria-labelledby={id} className={claseVentana(recomendada)} data-testid={`ventana-os-${sistema}`} data-recomendada={recomendada ? "si" : undefined}>
            <CabeceraVentana id={id} titulo={etiqueta} subtitulo={`StarSeed OS ${tag}`} nivel={nivel} />
            {recomendada && <SelloRecomendada />}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Formato</dt>
                <dd className="break-words text-foreground/90" title={principal.nombre}>
                    {principal.formato}
                </dd>
                {procesador && (
                    <>
                        <dt className="text-muted-foreground">Procesador</dt>
                        <dd className="break-words text-foreground/90">{procesador}</dd>
                    </>
                )}
                <dt className="text-muted-foreground">Tamaño</dt>
                <dd className="tabular-nums text-foreground/90">{tamano || "—"}</dd>
            </dl>
            <div className="mt-auto flex flex-col gap-2 pt-1">
                <a href={principal.url} download={principal.nombre} title={principal.nombre} className={claseBoton(recomendada)}>
                    <Download className="h-4 w-4" aria-hidden /> Descargar {extensionDe(principal.nombre)}{" "}
                    <span className="sr-only">para {etiqueta}</span>
                </a>
                {/* La línea de alternativas existe siempre (vacía si no hay): así los botones de una
                    misma fila quedan a la misma altura. */}
                {otros.length === 0 ? (
                    <p aria-hidden className="invisible hidden text-xs @lg:block">
                        —
                    </p>
                ) : (
                    <p className="text-center text-xs text-muted-foreground">
                        También:{" "}
                        {otros.map((a, i) => (
                            <span key={a.nombre}>
                                {i > 0 && <span aria-hidden> · </span>}
                                <a
                                    href={a.url}
                                    download={a.nombre}
                                    title={a.nombre}
                                    className="cursor-pointer rounded font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald"
                                >
                                    {extensionDe(a.nombre)}
                                    {a.bytes ? ` · ${tamanoLegible(a.bytes)}` : ""}
                                </a>
                            </span>
                        ))}
                    </p>
                )}
                <details className="rounded-xl text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none rounded py-1 text-center font-medium text-foreground/80 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald">
                        Cómo abrirlo
                    </summary>
                    <p className="mt-1 leading-relaxed">{instruccionesAbrir(principal.nombre)}</p>
                </details>
            </div>
        </article>
    );
}

function VentanaIOS({ tag, recomendada, nivel }: { tag: string; recomendada: boolean; nivel: Nivel }) {
    const id = useId();
    return (
        <article
            aria-labelledby={id}
            className={cn(claseVentana(recomendada), "@2xl:flex-row @2xl:items-center @2xl:gap-6")}
            data-testid="ventana-os-ios"
            data-recomendada={recomendada ? "si" : undefined}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-3">
                <CabeceraVentana id={id} titulo="iPhone y iPad" subtitulo={`App web instalable${tag ? ` · ${tag}` : ""}`} nivel={nivel} />
                {recomendada && <SelloRecomendada />}
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Aún no hay app nativa para iOS: se instala la versión web desde Safari, que funciona como una app más y siempre
                    está al día.
                </p>
            </div>
            <div className="flex w-full flex-col gap-2 @2xl:w-72 @2xl:shrink-0">
                <a href={OS_WEB_URL} target="_blank" rel="noopener noreferrer" className={claseBoton(recomendada)}>
                    <ExternalLink className="h-4 w-4" aria-hidden /> Abrir la web oficial
                </a>
                <details className="rounded-xl text-xs text-muted-foreground" open={recomendada}>
                    <summary className="cursor-pointer select-none rounded py-1 text-center font-medium text-foreground/80 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald">
                        Cómo instalarla
                    </summary>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                        {PASOS_IOS.map((p) => (
                            <li key={p}>{p}</li>
                        ))}
                    </ol>
                </details>
            </div>
        </article>
    );
}

/** Esqueleto con la forma final (sin saltos de diseño cuando llegan los datos). */
function VentanaEsqueleto() {
    return (
        <div className={cn(claseVentana(false), "motion-safe:animate-pulse")} aria-hidden>
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded bg-white/10" />
                    <div className="h-3 w-32 rounded bg-white/[0.07]" />
                </div>
            </div>
            <div className="space-y-2">
                <div className="h-4 w-full rounded bg-white/[0.07]" />
                <div className="h-4 w-2/3 rounded bg-white/[0.07]" />
            </div>
            <div className="mt-auto h-11 w-full rounded-full bg-white/10" />
        </div>
    );
}

const CLASE_ENLACE =
    "inline-flex cursor-pointer items-center gap-1 rounded text-sm font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald";

export function VentanasDescargaOS({
    release,
    cargando,
    origen,
    sistemaDetectado,
    titulo = "Descargas por sistema",
    nivel = 3,
    className,
}: VentanasDescargaOSProps) {
    // Sin release por props: el último del OS (misma caché que el botón de un toque).
    const propio = useUltimaVersion(release === undefined ? OS_APP_ID : "");
    const dispositivo = useDispositivoActual();
    const tituloId = useId();

    const r = release === undefined ? propio.release : release;
    const buscando = cargando ?? (release === undefined ? propio.cargando : false);
    const deDonde = origen ?? (release === undefined ? propio.origen : "github");
    const detectado = sistemaDetectado ?? dispositivo.sistema;
    // El sistema de este dispositivo va primero; los demás conservan su orden (sort estable).
    const grupos = instaladoresPorSistema(r).sort((a, b) => Number(b.sistema === detectado) - Number(a.sistema === detectado));
    const iosPrimero = detectado === "ios";
    const tag = r ? tagLegible(r.tag) : "";
    const fecha = fechaLegible(r?.publicado);
    const Titulo = `h${nivel}` as "h2" | "h3" | "h4";

    return (
        <section aria-labelledby={tituloId} aria-busy={buscando || undefined} className={cn("@container flex flex-col gap-4", className)} data-testid="ventanas-descarga-os">
            {/* Centrada en columnas estrechas (móvil); título a la izquierda y enlace a la derecha en anchas. */}
            <div className="flex flex-col items-center gap-x-4 gap-y-1 text-center @lg:flex-row @lg:flex-wrap @lg:items-end @lg:justify-between @lg:text-left">
                <div className="min-w-0">
                    <Titulo id={tituloId} className="font-headline text-lg font-semibold leading-tight text-foreground">
                        {titulo}
                    </Titulo>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {r
                            ? `StarSeed OS ${tag}${fecha ? ` · publicada el ${fecha}` : ""}`
                            : buscando
                              ? "Buscando la última versión publicada…"
                              : "Sin datos de la última versión"}
                    </p>
                </div>
                <a href={OS_RELEASES_ULTIMA_URL} target="_blank" rel="noopener noreferrer" className={CLASE_ENLACE}>
                    Todas las versiones en GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
            </div>

            {deDonde === "respaldo" && r && !buscando && (
                <p role="note" className="rounded-xl border border-trinity-amber/25 bg-trinity-amber/[0.06] px-3 py-2 text-xs text-amber-100/90">
                    No se pudo consultar GitHub ahora mismo: se muestra la última versión conocida.
                </p>
            )}

            {grupos.length === 0 ? (
                buscando ? (
                    <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @5xl:grid-cols-4">
                        {[0, 1, 2, 3].map((i) => (
                            <li key={i}>
                                <VentanaEsqueleto />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center" data-testid="ventanas-descarga-vacias">
                        <SimboloStarSeed size={48} decorativo className="opacity-80" />
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Aún no hay archivos publicados para esta versión. Mientras tanto, usa la web oficial o elige otra versión en GitHub.
                        </p>
                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                            <a href={OS_WEB_URL} target="_blank" rel="noopener noreferrer" className={CLASE_ENLACE}>
                                Abrir la web oficial <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </a>
                            <a href={OS_RELEASES_ULTIMA_URL} target="_blank" rel="noopener noreferrer" className={CLASE_ENLACE}>
                                Ver versiones en GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </a>
                        </div>
                    </div>
                )
            ) : (
                <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @5xl:grid-cols-4">
                    {iosPrimero && (
                        <li className="min-w-0 @lg:col-span-2 @5xl:col-span-4">
                            <VentanaIOS tag={tag} recomendada nivel={nivel} />
                        </li>
                    )}
                    {grupos.map((g) => (
                        <li key={g.sistema} className="min-w-0">
                            <VentanaSistema
                                etiqueta={g.etiqueta}
                                sistema={g.sistema}
                                archivos={g.archivos}
                                tag={tag}
                                recomendada={g.sistema === detectado}
                                nivel={nivel}
                            />
                        </li>
                    ))}
                    {!iosPrimero && (
                        <li className="min-w-0 @lg:col-span-2 @5xl:col-span-4">
                            <VentanaIOS tag={tag} recomendada={false} nivel={nivel} />
                        </li>
                    )}
                </ul>
            )}
        </section>
    );
}

export default VentanasDescargaOS;
