"use client";
/**
 * Piezas comunes de «Clima y cosmos»: el marco adaptativo (lee la clase de tamaño del marco
 * unificado o, fuera de él, se pone uno), estados honestos (leyendo, sin ubicación, error con
 * reintento), el sello de la fuente con su hora, botones fantasma accesibles y el menú de
 * acciones en lista vertical (ubicación, unidades, abrir la app, actualizar).
 */
import * as React from "react";
import Link from "next/link";
import {
    Check, ChevronLeft, ExternalLink, LocateFixed, MapPin, MoreHorizontal, RefreshCw, Search, Thermometer, Wind,
    type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMarcoUnificado, type BaseTamano, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { useElementSize } from "@/components/dashboard/kit/use-element-size";
import { WidgetErrorState } from "@/components/dashboard/kit/primitives";
import { MarcoUnificado } from "@/components/widgets-libres/marco-unificado";
import { dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import type { LocationData } from "@/modules/weather/context/weather-location-context";
import { ETIQUETA_VIENTO, useEnPantalla, useUbicacionClima, useUnidades, type UnidadViento } from "@/modules/weather/datos/hooks";
import s from "./clima.module.css";

export { s as estilosClima };

// ── Marco adaptativo ──────────────────────────────────────────────────

export interface InfoMarco {
    clase: ClaseTamano;
    base: BaseTamano;
    horizontal: boolean;
    acento: string;
    acento2: string;
    /** Caja real del cuerpo en px (0 hasta medir). */
    ancho: number;
    alto: number;
    /** En pantalla y con la pestaña visible: se puede pedir datos y animar. */
    visible: boolean;
    /** Se puede animar (nivel del dispositivo, eco y movimiento reducido). */
    animar: boolean;
    dispositivo: ClaseDispositivo;
    /** Puntero grueso: objetivos de 44 px. */
    tactil: boolean;
}

function useDispositivo(): { dispositivo: ClaseDispositivo; tactil: boolean } {
    const [d, setD] = React.useState<{ dispositivo: ClaseDispositivo; tactil: boolean }>({ dispositivo: "escritorio", tactil: false });
    React.useEffect(() => {
        const leer = () => {
            let tactil = false;
            try { tactil = window.matchMedia("(pointer: coarse)").matches; } catch { /* sin matchMedia */ }
            setD({ dispositivo: dispositivoActual(), tactil });
        };
        leer();
        window.addEventListener("resize", leer);
        return () => window.removeEventListener("resize", leer);
    }, []);
    return d;
}

function Interior({ etiqueta, ctx, children }: { etiqueta: string; ctx: ContextoMarcoUnificado; children: (i: InfoMarco) => React.ReactNode }) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const visible = useEnPantalla(ref);
    const nivel = useNivelRender();
    const { dispositivo, tactil } = useDispositivo();
    const animar = nivel !== "ligero";
    const info: InfoMarco = {
        clase: ctx.clase, base: ctx.base, horizontal: ctx.horizontal, acento: ctx.acento, acento2: ctx.acento2,
        ancho: size.width, alto: size.height, visible, animar, dispositivo, tactil,
    };
    return (
        <div
            ref={ref}
            className={s.raiz}
            aria-label={etiqueta}
            data-clase={ctx.clase}
            data-animar={animar ? "si" : "no"}
            data-pausa={visible ? "no" : "si"}
            data-dispositivo={dispositivo}
            style={{ ["--clima-acento" as string]: ctx.acento }}
        >
            {children(info)}
        </div>
    );
}

/**
 * El cuerpo del widget con su información de tamaño. Dentro del marco unificado usa su clase;
 * fuera (vista /atmosphere, /clima, «marco clásico») se pone el mismo material.
 */
export function MarcoClima({ etiqueta, acento = "#38bdf8", acento2 = "#7c5cff", children }: {
    etiqueta: string; acento?: string; acento2?: string; children: (i: InfoMarco) => React.ReactNode;
}) {
    const ctx = useMarcoUnificado();
    if (ctx) return <Interior etiqueta={etiqueta} ctx={ctx}>{children}</Interior>;
    return (
        <MarcoUnificado acento={acento} acento2={acento2} etiqueta={etiqueta}>
            {(c) => <Interior etiqueta={etiqueta} ctx={c}>{children}</Interior>}
        </MarcoUnificado>
    );
}

// ── Tipografía y piezas ───────────────────────────────────────────────

/** Rótulo en versalitas; `title` lleva el texto completo por si se recorta. */
export function RotuloClima({ children, color, className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
    return (
        <span className={`block truncate text-[11px] font-semibold uppercase tracking-[0.14em] ${className}`} style={{ color: color ?? "rgba(255,255,255,.62)" }}
            title={typeof children === "string" ? children : undefined}>
            {children}
        </span>
    );
}

/** Botón fantasma del acento: pastilla redonda, foco visible y 44 px en pantallas táctiles. */
export const BotonClima = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { acento?: string; tactil?: boolean; icono?: LucideIcon; soloIcono?: boolean }>(
    function BotonClima({ acento = "#38bdf8", tactil, icono: Icono, soloIcono, children, className = "", style, ...resto }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                {...resto}
                className={`${s.foco} ss-redondo inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[12px] font-semibold text-white transition-[transform,background-color] duration-200 hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${soloIcono ? (tactil ? "size-11" : "size-8") : tactil ? "min-h-11 px-4" : "min-h-8 px-3"} ${className}`}
                style={{ background: `${acento}22`, boxShadow: `inset 0 0 0 1px ${acento}55`, ...style }}
            >
                {Icono && <Icono aria-hidden className="size-3.5" />}
                {children}
            </button>
        );
    },
);

/** Fuente y hora de la lectura: la procedencia siempre a la vista. */
export function SelloFuente({ fuente, en, antiguaMs = 2 * 3_600_000, className = "" }: { fuente: string; en: number | null; antiguaMs?: number; className?: string }) {
    const [ahora, setAhora] = React.useState<number | null>(null);
    React.useEffect(() => { setAhora(Date.now()); }, [en]);
    const hora = en ? new Date(en).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null;
    const antigua = !!(en && ahora && ahora - en > antiguaMs);
    const texto = hora ? `${fuente} · ${hora}${antigua ? " · antigua" : ""}` : fuente;
    return (
        <span className={`block truncate text-[10px] font-medium tracking-wide ${antigua ? "text-amber-300/85" : "text-white/45"} ${className}`} title={hora ? `Dato de ${fuente}, consultado a las ${hora}` : `Fuente: ${fuente}`}>
            {texto}
        </span>
    );
}

// ── Estados honestos ──────────────────────────────────────────────────

export function CargandoClima({ texto = "Leyendo el cielo…", base }: { texto?: string; base: BaseTamano }) {
    return (
        <div role="status" aria-live="polite" className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <span aria-hidden className={`${s.respira} block rounded-full`} style={{ width: base === "micro" ? 18 : 34, height: base === "micro" ? 18 : 34, background: "radial-gradient(circle, rgba(255,255,255,.55), rgba(255,255,255,0) 70%)" }} />
            {base !== "micro" && <span className="text-[12px] font-medium text-white/70">{texto}</span>}
            {base === "micro" && <span className="sr-only">{texto}</span>}
        </div>
    );
}

export function ErrorClima({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
    return <WidgetErrorState message={mensaje} onRetry={onReintentar} />;
}

/** Sin ubicación no hay tiempo que contar: se pide, no se inventa. */
export function SinUbicacion({ info }: { info: InfoMarco }) {
    const { usarMia } = useUbicacionClima();
    const [error, setError] = React.useState<string | null>(null);
    return (
        <div role="status" className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <MapPin aria-hidden className="size-5 text-white/70" />
            {info.base !== "micro" && <p className="text-[12px] font-medium text-white/80">Elige dónde mirar el cielo</p>}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
                <BotonClima acento={info.acento} tactil={info.tactil} icono={LocateFixed} onClick={() => usarMia().catch((e: Error) => setError(e.message))}
                    aria-label="Usar mi ubicación">{info.base === "micro" ? null : "Usar mi ubicación"}</BotonClima>
                {info.base !== "micro" && <MenuClima info={info} vistaInicial="buscar" etiquetaBoton="Buscar ciudad" />}
            </div>
            {error && <p className="text-[11px] text-amber-200/90">{error}</p>}
        </div>
    );
}

// ── Menú de acciones (lista vertical) ─────────────────────────────────

export interface AccionExtra { id: string; etiqueta: string; icono: LucideIcon; alPulsar: () => void }

const VIENTOS: UnidadViento[] = ["kmh", "ms", "mph", "kn"];

/**
 * «⋯» abre una lista vertical con TODAS las acciones con su nombre completo: cambiar ubicación
 * (buscar o la tuya), °C/°F, unidad del viento, actualizar y abrir la app completa.
 */
export function MenuClima({ info, ruta, rutaEtiqueta = "Abrir el tiempo", alActualizar, extra = [], vistaInicial = "acciones", etiquetaBoton, conUnidades = true }: {
    info: InfoMarco; ruta?: string; rutaEtiqueta?: string; alActualizar?: () => void; extra?: AccionExtra[];
    vistaInicial?: "acciones" | "buscar"; etiquetaBoton?: string; conUnidades?: boolean;
}) {
    const [abierto, setAbierto] = React.useState(false);
    const [vista, setVista] = React.useState<"acciones" | "buscar">(vistaInicial);
    const [unidades, fijarUnidades] = useUnidades();
    const { ubicacion, fijar, usarMia, buscar } = useUbicacionClima();
    const [q, setQ] = React.useState("");
    const [resultados, setResultados] = React.useState<LocationData[]>([]);
    const [buscando, setBuscando] = React.useState(false);
    const [aviso, setAviso] = React.useState<string | null>(null);

    React.useEffect(() => { if (!abierto) { setVista(vistaInicial); setAviso(null); } }, [abierto, vistaInicial]);
    React.useEffect(() => {
        if (vista !== "buscar" || q.trim().length < 2) { setResultados([]); return; }
        let vivo = true;
        const t = window.setTimeout(() => {
            setBuscando(true);
            buscar(q).then((r) => vivo && setResultados(r)).catch(() => vivo && setResultados([])).finally(() => vivo && setBuscando(false));
        }, 350);
        return () => { vivo = false; window.clearTimeout(t); };
    }, [q, vista, buscar]);

    const fila = `${s.foco} flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[13px] text-white/90 transition-colors duration-150 hover:bg-white/10 ${info.tactil ? "min-h-11" : "min-h-9"}`;
    const cerrarY = (f: () => void) => () => { f(); setAbierto(false); };

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                {etiquetaBoton ? (
                    <BotonClima acento={info.acento} tactil={info.tactil} icono={Search}>{etiquetaBoton}</BotonClima>
                ) : (
                    <BotonClima acento={info.acento} tactil={info.tactil} soloIcono aria-label="Acciones del clima" title="Acciones">
                        <MoreHorizontal aria-hidden className="size-4" />
                    </BotonClima>
                )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 rounded-2xl border-white/10 bg-[#0c0f24]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
                {vista === "acciones" ? (
                    <ul role="menu" aria-label="Acciones del clima" className="flex flex-col gap-0.5">
                        {ubicacion && (
                            <li className="px-3 pb-1.5 pt-1 text-[11px] text-white/55" role="none">
                                <span className="block truncate" title={ubicacion.nombre}>{ubicacion.nombre}{ubicacion.elegida ? "" : " · por defecto"}</span>
                            </li>
                        )}
                        <li role="none"><button role="menuitem" type="button" className={fila} onClick={() => setVista("buscar")}><Search aria-hidden className="size-4 text-white/60" />Cambiar ubicación</button></li>
                        <li role="none"><button role="menuitem" type="button" className={fila} onClick={() => usarMia().then(() => setAbierto(false)).catch((e: Error) => setAviso(e.message))}><LocateFixed aria-hidden className="size-4 text-white/60" />Usar mi ubicación</button></li>
                        {conUnidades && (
                            <>
                                <li role="none"><button role="menuitem" type="button" className={fila} onClick={() => fijarUnidades({ temp: unidades.temp === "c" ? "f" : "c" })}>
                                    <Thermometer aria-hidden className="size-4 text-white/60" />
                                    <span className="flex-1">Temperatura en {unidades.temp === "c" ? "°F" : "°C"}</span>
                                    <span className="text-[11px] text-white/45">ahora {unidades.temp === "c" ? "°C" : "°F"}</span>
                                </button></li>
                                <li role="none"><button role="menuitem" type="button" className={fila} onClick={() => fijarUnidades({ viento: VIENTOS[(VIENTOS.indexOf(unidades.viento) + 1) % VIENTOS.length] })}>
                                    <Wind aria-hidden className="size-4 text-white/60" />
                                    <span className="flex-1">Viento en {ETIQUETA_VIENTO[VIENTOS[(VIENTOS.indexOf(unidades.viento) + 1) % VIENTOS.length]]}</span>
                                    <span className="text-[11px] text-white/45">ahora {ETIQUETA_VIENTO[unidades.viento]}</span>
                                </button></li>
                            </>
                        )}
                        {extra.map((a) => (
                            <li key={a.id} role="none"><button role="menuitem" type="button" className={fila} onClick={cerrarY(a.alPulsar)}><a.icono aria-hidden className="size-4 text-white/60" />{a.etiqueta}</button></li>
                        ))}
                        {alActualizar && (
                            <li role="none"><button role="menuitem" type="button" className={fila} onClick={cerrarY(alActualizar)}><RefreshCw aria-hidden className="size-4 text-white/60" />Actualizar ahora</button></li>
                        )}
                        {ruta && (
                            <li role="none"><Link role="menuitem" href={ruta} className={fila} onClick={() => setAbierto(false)}><ExternalLink aria-hidden className="size-4 text-white/60" />{rutaEtiqueta}</Link></li>
                        )}
                        {aviso && <li role="none" className="px-3 py-1 text-[11px] text-amber-200/90">{aviso}</li>}
                    </ul>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1">
                            {vistaInicial === "acciones" && (
                                <button type="button" aria-label="Volver a las acciones" className={`${s.foco} ss-redondo grid size-8 cursor-pointer place-items-center rounded-full hover:bg-white/10`} onClick={() => setVista("acciones")}>
                                    <ChevronLeft aria-hidden className="size-4" />
                                </button>
                            )}
                            <label className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.07] px-3 ring-1 ring-white/10 focus-within:ring-white/30">
                                <Search aria-hidden className="size-4 text-white/50" />
                                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ciudad o pueblo" aria-label="Buscar ciudad"
                                    className="h-10 w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/40" />
                            </label>
                        </div>
                        <ul role="listbox" aria-label="Resultados" className={`${s.barraFina} flex max-h-60 flex-col gap-0.5 overflow-y-auto`}>
                            <li role="none"><button type="button" className={fila} onClick={() => usarMia().then(() => setAbierto(false)).catch((e: Error) => setAviso(e.message))}>
                                <LocateFixed aria-hidden className="size-4 text-sky-300" />Usar mi ubicación
                            </button></li>
                            {buscando && <li role="status" className="px-3 py-2 text-[12px] text-white/55">Buscando…</li>}
                            {!buscando && q.trim().length >= 2 && resultados.length === 0 && <li role="status" className="px-3 py-2 text-[12px] text-white/55">Sin resultados para «{q}»</li>}
                            {resultados.map((r) => {
                                const actual = ubicacion && Math.abs(ubicacion.lat - r.lat) < 0.01 && Math.abs(ubicacion.lon - r.lon) < 0.01;
                                return (
                                    <li key={`${r.lat},${r.lon}`} role="none">
                                        <button type="button" role="option" aria-selected={!!actual} className={fila} onClick={cerrarY(() => fijar(r))}>
                                            <MapPin aria-hidden className="size-4 shrink-0 text-white/50" />
                                            <span className="min-w-0 flex-1"><span className="block truncate" title={r.name}>{r.name}</span>{r.country && <span className="block truncate text-[11px] text-white/45">{r.country}</span>}</span>
                                            {actual && <Check aria-hidden className="size-4 text-emerald-300" />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {aviso && <p className="px-3 text-[11px] text-amber-200/90">{aviso}</p>}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

/** Lugar + aviso honesto si es la ubicación por defecto. */
export function LugarClima({ nombre, elegida, className = "" }: { nombre: string; elegida: boolean; className?: string }) {
    return (
        <span className={`flex min-w-0 items-center gap-1 text-[12px] text-white/75 ${className}`} title={elegida ? nombre : `${nombre} (ubicación por defecto: cámbiala en el menú)`}>
            <MapPin aria-hidden className="size-3 shrink-0 opacity-70" />
            <span className="truncate">{nombre}</span>
            {!elegida && <span className="shrink-0 text-[10px] uppercase tracking-wider text-amber-200/80">· por defecto</span>}
        </span>
    );
}

/** Enlace de acción compacto (a la app completa). */
export function EnlaceClima({ href, children, acento, tactil }: { href: string; children: React.ReactNode; acento: string; tactil?: boolean }) {
    return (
        <Link href={href} className={`${s.foco} ss-redondo inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white transition-transform duration-200 hover:scale-[1.04] ${tactil ? "min-h-11" : "min-h-8"}`}
            style={{ background: `${acento}22`, boxShadow: `inset 0 0 0 1px ${acento}55` }}>
            {children}
            <ExternalLink aria-hidden className="size-3 opacity-70" />
        </Link>
    );
}
