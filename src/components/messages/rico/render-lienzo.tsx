"use client";

/**
 * Lienzo de mensaje (C4): composición libre de texto, fotos, gifs, vídeo, audio, ventanas web, apps
 * del OS y apps en vivo, cada una con su tamaño, posición, giro y orden.
 *
 * La escena se diseña en unidades del lienzo y se escala al ancho de la burbuja conservando la
 * proporción (ResizeObserver con reserva si no existe). El texto, las fotos y las formas escalan con
 * el diseño; las ventanas, el vídeo, el audio y las apps se maquetan a tamaño de pantalla real
 * («ARealPx») para que sus controles no queden diminutos.
 *
 * Seguridad: una ventana web es SIEMPRE un iframe con `sandbox` sin `allow-same-origin`, y no se
 * carga hasta que la persona la activa (nada de terceros viendo tu IP por abrir un chat). Una app del
 * OS es una ruta interna validada que también espera a que la actives.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { AppWindow, ArrowUpRight, ExternalLink, Eye, FileIcon, Globe, Maximize2, Music, Play, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import type { StarseedApp } from "@/components/dashboard/apps/launcher-types";
import { TarjetaVivo } from "@/components/messages/vivo/tarjeta-vivo";
import {
    colorTextoSobre,
    enlaceSeguro,
    esRutaDeServidor,
    esRutaInterna,
    estiloACss,
    fondoCssDe,
    hostDeUrl,
    urlWebSegura,
} from "@/lib/mensajeria/formato";
import type { AnimacionFondo, ElementoLienzo, EstiloMensaje, LienzoMensaje as TipoLienzo } from "@/lib/mensajeria/formato-tipos";
import { TextoRico } from "./render-doc";
import styles from "./rico.module.css";

/** Sandbox de las ventanas web externas: scripts y formularios sí, mismo origen JAMÁS. */
export const SANDBOX_WEB = "allow-scripts allow-forms allow-popups allow-presentation";
/** Rutas internas del propio OS (código de confianza, mismo origen). */
const SANDBOX_APP_OS = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

const CLASE_FONDO: Record<Exclude<AnimacionFondo, "ninguna">, string> = {
    aurora: styles.fAurora,
    estrellas: styles.fEstrellas,
    gradiente: styles.fGradiente,
    pulso: styles.fPulso,
    particulas: styles.fParticulas,
};

/** Capa decorativa animada (solo CSS) detrás del contenido. */
export function CapaFondoAnimado({ tipo }: { tipo?: AnimacionFondo }) {
    if (!tipo || tipo === "ninguna") return null;
    return <div className={cn(styles.capaFondo, CLASE_FONDO[tipo])} aria-hidden="true" data-fondo-animado={tipo} />;
}

/** App del catálogo que abre esa ruta (la coincidencia más larga). */
export function buscarAppPorRuta(ruta?: string | null): StarseedApp | undefined {
    if (!ruta) return undefined;
    const limpia = ruta.split(/[?#]/)[0];
    let mejor: StarseedApp | undefined;
    for (const app of APP_CATALOG) {
        const r = app.open.route;
        if (!r) continue;
        if (limpia === r || limpia.startsWith(`${r.replace(/\/$/, "")}/`)) {
            if (!mejor || (mejor.open.route?.length ?? 0) < r.length) mejor = app;
        }
    }
    return mejor;
}

/** Posición, tamaño, giro y orden de un elemento en unidades del lienzo. */
export function estiloCajaElemento(el: ElementoLienzo): CSSProperties {
    return {
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
        zIndex: el.z,
        opacity: el.opacidad,
        borderRadius: el.radio,
        overflow: el.tipo === "texto" || el.tipo === "forma" ? "visible" : "hidden",
    };
}

/** Maqueta a píxeles de pantalla reales dentro de una escena escalada. */
function ARealPx({ escala, w, h, children }: { escala: number; w: number; h: number; children: ReactNode }) {
    const s = escala > 0 ? escala : 1;
    return (
        <div style={{ width: w * s, height: h * s, transform: `scale(${1 / s})`, transformOrigin: "0 0" }} className="relative">
            {children}
        </div>
    );
}

const PILDORA =
    "ss-redondo inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

function VentanaWeb({ el, modo, escala }: { el: ElementoLienzo; modo: "vista" | "edicion"; escala: number }) {
    const [activa, setActiva] = useState(false);
    const url = urlWebSegura(el.url);
    const host = hostDeUrl(url);
    const titulo = el.nombre || host || "Sitio web";
    // En burbujas pequeñas (móvil) la ventana se queda con lo esencial y etiquetas cortas.
    const anchoPx = el.w * escala;
    const altoPx = el.h * escala;
    const compacto = anchoPx < 230 || altoPx < 200;
    const muyEstrecho = anchoPx < 120 || altoPx < 110;
    return (
        <ARealPx escala={escala} w={el.w} h={el.h}>
            <div className={styles.ventana} style={{ borderRadius: el.radio ? el.radio * escala : 12, width: "100%", height: "100%" }} data-ventana="web">
                <div className={cn(styles.barraVentana, "h-8 text-xs")}>
                    <Globe className="h-3.5 w-3.5 flex-none text-[#7fb8ff]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium text-white/85" title={titulo}>
                        {titulo}
                    </span>
                    {activa && modo === "vista" && (
                        <button
                            type="button"
                            onClick={() => setActiva(false)}
                            className="ss-redondo flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                            aria-label="Desactivar ventana"
                            title="Desactivar ventana"
                        >
                            <Power className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {url && modo === "vista" && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ss-redondo flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                            aria-label="Abrir en pestaña nueva"
                            title="Abrir en pestaña nueva"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    )}
                </div>
                <div className={styles.cuerpoVentana}>
                    {activa && modo === "vista" && url ? (
                        <iframe
                            src={url}
                            title={`Ventana web: ${host}`}
                            sandbox={SANDBOX_WEB}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className={styles.iframe}
                        />
                    ) : (
                        <div className={cn("absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-center", compacto ? "gap-1.5 p-2" : "gap-2 p-3")}>
                            {!muyEstrecho && (
                                <span className={cn("flex items-center justify-center rounded-2xl bg-[#007FFF]/15 shadow-[inset_0_0_0_1px_rgba(0,127,255,.4)]", compacto ? "h-8 w-8" : "h-10 w-10")}>
                                    <Globe className={cn("text-[#7fb8ff]", compacto ? "h-4 w-4" : "h-5 w-5")} aria-hidden="true" />
                                </span>
                            )}
                            {!compacto && <p className="max-w-full truncate text-sm font-semibold text-white">{host || "Sitio web"}</p>}
                            {modo === "vista" && url && muyEstrecho && (
                                <button
                                    type="button"
                                    onClick={() => setActiva(true)}
                                    className="ss-redondo grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white"
                                    style={{ background: "#007FFF33", boxShadow: "inset 0 0 0 1px #007FFF88" }}
                                    aria-label={`Activar la ventana de ${host}`}
                                    title="Activar ventana"
                                >
                                    <Play className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                            {modo === "vista" && url && compacto && !muyEstrecho && (
                                <button
                                    type="button"
                                    onClick={() => setActiva(true)}
                                    className={PILDORA}
                                    style={{ background: "#007FFF33", boxShadow: "inset 0 0 0 1px #007FFF88" }}
                                    aria-label={`Activar la ventana de ${host}`}
                                >
                                    Activar
                                </button>
                            )}
                            {modo === "vista" && url && !compacto && (
                                <div className="flex flex-col items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setActiva(true)}
                                        className={PILDORA}
                                        style={{ background: "#007FFF33", boxShadow: "inset 0 0 0 1px #007FFF88" }}
                                    >
                                        Activar ventana
                                    </button>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={PILDORA}
                                        style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)" }}
                                    >
                                        Abrir en pestaña nueva
                                    </a>
                                </div>
                            )}
                            {modo === "vista" && !compacto && altoPx > 250 && (
                                <p className="max-w-[26ch] text-[11px] leading-snug text-white/55">
                                    Algunos sitios no se dejan mostrar dentro. Si queda en blanco, ábrelo en una pestaña nueva.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </ARealPx>
    );
}

function IconoApp({ app, clase }: { app?: StarseedApp; clase: string }) {
    if (app?.iconUrl) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={app.iconUrl} alt="" className={cn(clase, "rounded-xl object-cover")} draggable={false} />;
    }
    const Icono = app?.icon ?? AppWindow;
    return <Icono className={clase} aria-hidden="true" />;
}

function VentanaApp({ el, modo, escala }: { el: ElementoLienzo; modo: "vista" | "edicion"; escala: number }) {
    const [activa, setActiva] = useState(false);
    const ruta = el.ruta && esRutaInterna(el.ruta) && !esRutaDeServidor(el.ruta) ? el.ruta : null;
    const app = buscarAppPorRuta(ruta);
    const nombre = el.nombre || app?.name || ruta || "App del OS";
    const acento = app?.accent?.startsWith("#") ? app.accent : "#7C5CFF";
    const anchoPx = el.w * escala;
    const altoPx = el.h * escala;
    const compacto = anchoPx < 230 || altoPx < 200;
    const muyEstrecho = anchoPx < 120 || altoPx < 110;
    return (
        <ARealPx escala={escala} w={el.w} h={el.h}>
            <div className={styles.ventana} style={{ borderRadius: el.radio ? el.radio * escala : 14, width: "100%", height: "100%" }} data-ventana="app">
                <div className={cn(styles.barraVentana, "h-8 text-xs")}>
                    <IconoApp app={app} clase="h-4 w-4 flex-none" />
                    <span className="min-w-0 flex-1 truncate font-semibold text-white/90" title={nombre}>
                        {nombre}
                    </span>
                    {activa && modo === "vista" && (
                        <button
                            type="button"
                            onClick={() => setActiva(false)}
                            className="ss-redondo flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                            aria-label="Cerrar la vista de la app"
                            title="Cerrar la vista de la app"
                        >
                            <Power className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {ruta && modo === "vista" && (
                        <Link
                            href={ruta}
                            aria-label={`Abrir ${nombre}`}
                            title={`Abrir ${nombre}`}
                            className={cn(
                                "ss-redondo flex flex-none cursor-pointer items-center justify-center rounded-full font-semibold text-white transition-colors duration-200 hover:bg-white/10",
                                compacto ? "h-6 w-6" : "px-2.5 py-1 text-[11px]",
                            )}
                            style={{ boxShadow: `inset 0 0 0 1px ${acento}66`, background: `${acento}1f` }}
                        >
                            {compacto ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : "Abrir"}
                        </Link>
                    )}
                </div>
                <div className={styles.cuerpoVentana}>
                    {activa && modo === "vista" && ruta ? (
                        <iframe src={ruta} title={`App del OS: ${nombre}`} sandbox={SANDBOX_APP_OS} loading="lazy" className={styles.iframe} />
                    ) : (
                        <div
                            className={cn("absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-center", compacto ? "gap-1.5 p-2" : "gap-2 p-3")}
                            style={{ background: `radial-gradient(120% 90% at 50% 0%, ${acento}26, transparent 70%)` }}
                        >
                            {!muyEstrecho && (
                                <span
                                    className={cn("flex items-center justify-center rounded-2xl", compacto ? "h-9 w-9" : "h-12 w-12")}
                                    style={{ background: `${acento}1f`, boxShadow: `inset 0 0 0 1px ${acento}66` }}
                                >
                                    <IconoApp app={app} clase={cn("text-white", compacto ? "h-5 w-5" : "h-7 w-7")} />
                                </span>
                            )}
                            {!compacto && <p className="max-w-full truncate text-sm font-semibold text-white">{nombre}</p>}
                            {app?.description && !compacto && altoPx > 230 && (
                                <p className="line-clamp-2 max-w-[30ch] text-[11px] leading-snug text-white/60">{app.description}</p>
                            )}
                            {modo === "vista" && ruta && (
                                <button
                                    type="button"
                                    onClick={() => setActiva(true)}
                                    className={muyEstrecho ? "ss-redondo grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white" : PILDORA}
                                    style={{ background: `${acento}33`, boxShadow: `inset 0 0 0 1px ${acento}88` }}
                                    aria-label={`Ver ${nombre} aquí`}
                                    title="Ver aquí"
                                >
                                    {muyEstrecho ? <Eye className="h-4 w-4" aria-hidden="true" /> : "Ver aquí"}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </ARealPx>
    );
}

function ContenidoTexto({ el, estiloBase }: { el: ElementoLienzo; estiloBase?: EstiloMensaje }) {
    const propio = el.estilo ?? {};
    const estilo: EstiloMensaje = {
        fuente: propio.fuente ?? estiloBase?.fuente,
        color: propio.color ?? estiloBase?.color,
        tamano: propio.tamano ?? 28,
        colorMarco: propio.colorMarco,
        grosorMarco: propio.grosorMarco,
        fondo: propio.fondo,
        alineacion: propio.alineacion,
        negrita: propio.negrita,
        cursiva: propio.cursiva,
    };
    const css = estiloACss(estilo);
    const conCaja = !!(propio.fondo || propio.colorMarco || propio.grosorMarco);
    const animacion = propio.animacionTexto ?? estiloBase?.animacionTexto;
    return (
        <div
            className="relative h-full w-full"
            data-texto-caja=""
            style={{
                ...css,
                color: css.color ?? colorTextoSobre(propio.fondo),
                padding: conCaja ? 12 : 0,
                borderRadius: el.radio ?? (conCaja ? 16 : undefined),
                overflow: conCaja ? "hidden" : undefined,
            }}
        >
            <CapaFondoAnimado tipo={propio.animacionFondo} />
            <TextoRico
                doc={el.texto ?? { bloques: [] }}
                animacion={animacion}
                colorNeon={estilo.color ?? estilo.colorMarco ?? "#7c5cff"}
                className="relative z-[1]"
            />
        </div>
    );
}

function Forma({ el }: { el: ElementoLienzo }) {
    const f = el.forma ?? { tipo: "rect" as const, color: "#7c5cff" };
    const relleno = f.relleno ? f.color : "none";
    const comun = { stroke: f.color, strokeWidth: 3, vectorEffect: "non-scaling-stroke" as const, fill: relleno };
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-full w-full overflow-visible" aria-hidden="true">
            {f.tipo === "rect" && <rect x="1.5" y="1.5" width="97" height="97" rx={el.radio ? Math.min(48, (el.radio / Math.max(1, el.w)) * 100) : 0} {...comun} />}
            {f.tipo === "circulo" && <ellipse cx="50" cy="50" rx="48.5" ry="48.5" {...comun} />}
            {f.tipo === "estrella" && (
                <polygon points="50,3 61.8,35.5 96.6,36.2 69,57.3 79,90.5 50,71 21,90.5 31,57.3 3.4,36.2 38.2,35.5" strokeLinejoin="round" {...comun} />
            )}
            {f.tipo === "linea" && <line x1="0" y1="50" x2="100" y2="50" {...comun} strokeLinecap="round" />}
        </svg>
    );
}

export interface ElementoVistaProps {
    el: ElementoLienzo;
    estiloBase?: EstiloMensaje;
    modo: "vista" | "edicion";
    /** Escala actual de la escena (px por unidad). */
    escala: number;
    mio: boolean;
    onAbrir?: () => void;
}

/** Contenido de un elemento (sin su caja posicionada). */
export function ElementoVista({ el, estiloBase, modo, escala, mio, onAbrir }: ElementoVistaProps) {
    switch (el.tipo) {
        case "texto":
            return <ContenidoTexto el={el} estiloBase={estiloBase} />;
        case "imagen":
        case "gif": {
            if (!el.url) return null;
            const img = (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={el.url}
                    alt={el.nombre || (el.tipo === "gif" ? "GIF" : "Imagen")}
                    className={styles.medio}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{ borderRadius: el.radio }}
                />
            );
            if (modo === "vista" && onAbrir) {
                return (
                    <button type="button" onClick={onAbrir} className="block h-full w-full cursor-zoom-in" aria-label={`Ampliar ${el.nombre || "imagen"}`}>
                        {img}
                    </button>
                );
            }
            return img;
        }
        case "video":
            if (!el.url) return null;
            return (
                <ARealPx escala={escala} w={el.w} h={el.h}>
                    <video
                        src={el.url}
                        className="h-full w-full bg-black/40 object-contain"
                        style={{ borderRadius: el.radio ? el.radio * escala : undefined }}
                        controls={modo === "vista"}
                        playsInline
                        preload="metadata"
                        muted={!!el.silenciado}
                        loop={!!el.bucle}
                        // Reproducción automática solo en silencio (y nunca mientras se edita).
                        autoPlay={modo === "vista" && !!el.autoplay && !!el.silenciado}
                        aria-label={el.nombre || "Vídeo"}
                    />
                </ARealPx>
            );
        case "audio":
            if (!el.url) return null;
            return (
                <ARealPx escala={escala} w={el.w} h={el.h}>
                    <div
                        className="flex h-full w-full flex-col justify-center gap-2 bg-[rgba(12,14,34,.72)] p-3 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]"
                        style={{ borderRadius: el.radio ? el.radio * escala : 16 }}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-[#7C5CFF]/20 shadow-[inset_0_0_0_1px_rgba(124,92,255,.45)]">
                                <Music className="h-4 w-4 text-[#b9a8ff]" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 truncate text-sm font-semibold">{el.nombre || "Audio"}</span>
                        </div>
                        {modo === "vista" ? (
                            <audio controls src={el.url} preload="none" loop={!!el.bucle} muted={!!el.silenciado} className="h-9 w-full" />
                        ) : (
                            <div className="h-9 w-full rounded-full bg-white/10" aria-hidden="true" />
                        )}
                    </div>
                </ARealPx>
            );
        case "web":
            return <VentanaWeb el={el} modo={modo} escala={escala} />;
        case "app":
            return <VentanaApp el={el} modo={modo} escala={escala} />;
        case "vivo":
            if (!el.vivo) return null;
            return (
                <ARealPx escala={escala} w={el.w} h={el.h}>
                    <div className="h-full w-full overflow-auto">
                        <TarjetaVivo adjunto={el.vivo} mio={mio} />
                    </div>
                </ARealPx>
            );
        case "archivo": {
            const url = el.url ? enlaceSeguro(el.url) : null;
            const chip = (
                <div className="flex h-full w-full items-center gap-2.5 rounded-2xl bg-[rgba(12,14,34,.72)] px-3 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#14B8A6]/15 shadow-[inset_0_0_0_1px_rgba(20,184,166,.45)]">
                        <FileIcon className="h-4 w-4 text-[#5eead4]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{el.nombre || "Archivo"}</span>
                        {el.mime && <span className="block truncate text-[11px] text-white/55">{el.mime}</span>}
                    </span>
                    {url && modo === "vista" && <ExternalLink className="h-4 w-4 flex-none text-white/60" aria-hidden="true" />}
                </div>
            );
            return (
                <ARealPx escala={escala} w={el.w} h={el.h}>
                    {url && modo === "vista" ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block h-full w-full cursor-pointer" aria-label={`Abrir ${el.nombre || "archivo"}`}>
                            {chip}
                        </a>
                    ) : (
                        chip
                    )}
                </ARealPx>
            );
        }
        case "forma":
            return <Forma el={el} />;
    }
}

export interface LienzoMensajeProps {
    lienzo: TipoLienzo;
    estiloBase?: EstiloMensaje;
    mio: boolean;
    onAbrir?: () => void;
    /** Ancho máximo en px (y alto máximo) de la vista; en la burbuja ~440×520. */
    anchoMax?: number;
    altoMax?: number;
    /** Tope relativo a la pantalla (vw). */
    anchoVw?: number;
    className?: string;
}

/** Lienzo escalado al ancho disponible conservando la proporción. */
export function LienzoMensaje({ lienzo, estiloBase, mio, onAbrir, anchoMax = 440, altoMax = 520, anchoVw = 72, className }: LienzoMensajeProps) {
    const ref = useRef<HTMLDivElement>(null);
    const anchoIdeal = Math.round(Math.min(anchoMax, (altoMax * lienzo.ancho) / lienzo.alto));
    const [ancho, setAncho] = useState(anchoIdeal);

    useEffect(() => {
        const nodo = ref.current;
        if (!nodo) return;
        const medir = () => {
            const w = nodo.getBoundingClientRect().width;
            if (w > 0) setAncho((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        };
        medir();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", medir);
            return () => window.removeEventListener("resize", medir);
        }
        const observador = new ResizeObserver(medir);
        observador.observe(nodo);
        return () => observador.disconnect();
    }, []);

    const escala = ancho / lienzo.ancho;
    const elementos = useMemo(() => [...lienzo.elementos].sort((a, b) => a.z - b.z), [lienzo.elementos]);

    return (
        <div
            ref={ref}
            className={cn(styles.lienzo, className)}
            role="group"
            aria-label="Mensaje compuesto"
            data-lienzo=""
            style={{
                width: `min(${anchoIdeal}px, ${anchoVw}vw)`,
                aspectRatio: `${lienzo.ancho} / ${lienzo.alto}`,
                background: fondoCssDe(lienzo.fondo),
                color: colorTextoSobre(lienzo.fondo),
            }}
        >
            <CapaFondoAnimado tipo={lienzo.animacionFondo} />
            <div className={styles.escena} style={{ width: lienzo.ancho, height: lienzo.alto, transform: `scale(${escala})` }}>
                {elementos.map((el) => (
                    <div key={el.id} className={styles.elemento} style={estiloCajaElemento(el)} data-tipo={el.tipo}>
                        <ElementoVista el={el} estiloBase={estiloBase} modo="vista" escala={escala} mio={mio} onAbrir={onAbrir} />
                    </div>
                ))}
            </div>
            {onAbrir && (
                <button
                    type="button"
                    onClick={onAbrir}
                    className="ss-redondo absolute right-2 top-2 z-[2] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white/85 backdrop-blur-md transition-colors duration-200 hover:bg-black/65 hover:text-white"
                    aria-label="Ampliar mensaje"
                    title="Ampliar mensaje"
                >
                    <Maximize2 className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
