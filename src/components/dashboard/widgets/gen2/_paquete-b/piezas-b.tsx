"use client";
/**
 * Piezas visuales del paquete B (Ontocracia · gobernanza · economía) — Ola 0929.
 *
 * Un solo lenguaje para los instrumentos cívicos y económicos: el acento de la familia (lo
 * publica el MarcoUnificado), anillos de tiempo dibujados en SVG, cifras tabulares grandes,
 * acciones como pastillas de halo (44 px en táctil, foco grueso en TV) y la etiqueta honesta
 * «Demostración» cuando lo que se ve no es un dato real. Sin cajas dentro de cajas.
 */
import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { useElementSize } from "@/components/dashboard/kit/use-element-size";
import type { BaseTamano } from "@/components/dashboard/kit/contexto-marco";
import { claseDesdePx, dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { useNivelRender, type NivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { conAlfa, esHex, normalizarHex } from "@/components/widgets-libres/acentos-categoria";
import { disenoDe, mezclar } from "@/components/widgets-libres/familias/comun";
import estilos from "./paquete-b.module.css";

export { estilos as estilosB };

// ── Micro: glifo + cifra que caben en una tesela de 108×65 o 178×46 ──────────

/**
 * (Pulido 0930) El dato de una tesela micro del paquete. Antes se apilaban glifo (30-40 px), cifra
 * (20-22 px) y rótulo (9 px): 70 px en una tesela de 65. Ahora, si la tesela es más ancha que
 * alta, glifo a la izquierda y cifra + rótulo a su derecha; el glifo se mide por el alto y el
 * rótulo se retira si no cabe (sigue en el nombre accesible y en el tooltip).
 */
export function MicroB({ glifo, cifra, rotulo, extra, anchoExtra = 40, etiqueta, colorCifra = "#fff", onClick, className }: {
    /** Dibuja el glifo al lado (px) que le toque. */
    glifo?: (lado: number) => React.ReactNode;
    cifra?: string;
    rotulo?: string;
    /** Un distintivo más (p. ej. la variación): solo si cabe. */
    extra?: React.ReactNode;
    /** Ancho aproximado del distintivo (px) para decidir si cabe. */
    anchoExtra?: number;
    /** Lectura completa (aria-label y tooltip). */
    etiqueta: string;
    colorCifra?: string;
    /** Si hay acción, la tesela entera es el botón. */
    onClick?: () => void;
    className?: string;
}) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const ancho = size.width || 108, alto = size.height || 65;
    const fila = ancho >= alto * 1.15 || alto < 60;
    const util = ancho - 14;
    const anchoCifra = (t: number) => (cifra ? cifra.length * t * 0.6 : 0);
    const anchoRotulo = rotulo ? rotulo.length * 9 * 0.74 : 0;
    let lado = 0, tam = 22, conRotulo = !!rotulo, conExtra = !!extra;
    if (fila) {
        lado = glifo ? Math.max(18, Math.min(34, alto - 18)) : 0;
        tam = Math.max(14, Math.min(22, Math.round(alto * 0.34)));
        // Con glifo: [glifo] [cifra / rótulo]. Sin glifo: [cifra] [rótulo / distintivo].
        const lateral = () => Math.max(conRotulo ? anchoRotulo : 0, conExtra ? anchoExtra : 0);
        const total = (t: number) => glifo
            ? lado + 8 + Math.max(anchoCifra(t), conRotulo ? anchoRotulo : 0)
            : anchoCifra(t) + (conRotulo || conExtra ? 8 + lateral() : 0);
        if (glifo) conExtra = false;
        const ajustar = () => { while (tam > 14 && total(tam) > util) tam -= 1; };
        ajustar();
        if (total(tam) > util && conRotulo) { conRotulo = false; tam = Math.max(14, Math.min(22, Math.round(alto * 0.34))); ajustar(); }
        if (total(tam) > util && conExtra) { conExtra = false; ajustar(); }
        const altoTexto = (glifo ? (cifra ? tam : 0) + (conRotulo ? 13 : 0) : Math.max(tam, (conRotulo ? 13 : 0) + (conExtra ? 16 : 0)));
        if (altoTexto > alto - 12) { conExtra = false; if (glifo) conRotulo = conRotulo && (cifra ? tam : 0) + 13 <= alto - 12; }
    } else {
        tam = Math.max(14, Math.min(22, Math.floor(util / Math.max(2, (cifra?.length ?? 1) * 0.6))));
        conRotulo = conRotulo && anchoRotulo <= util;
        conExtra = conExtra && alto >= 96;
        lado = glifo ? Math.max(18, Math.min(40, alto - 14 - (cifra ? tam + 2 : 0) - (conRotulo ? 13 : 0) - (conExtra ? 18 : 0))) : 0;
    }
    const textoCifra = cifra && <span className="whitespace-nowrap font-light tabular-nums leading-none" style={{ fontSize: tam, color: colorCifra }}>{cifra}</span>;
    const textoRotulo = conRotulo && <span className="whitespace-nowrap text-[9px] font-semibold uppercase leading-[11px] tracking-[0.1em] text-white/55">{rotulo}</span>;
    const interior = glifo || !fila ? (
        <>
            {glifo && <span aria-hidden className="grid shrink-0 place-items-center">{glifo(lado)}</span>}
            {(cifra || conRotulo || conExtra) && (
                <span className={cn("flex min-w-0 flex-col gap-0.5", fila ? "items-start" : "items-center")}>
                    {textoCifra}{textoRotulo}{conExtra && extra}
                </span>
            )}
        </>
    ) : (
        <>
            {textoCifra}
            {(conRotulo || conExtra) && <span className="flex min-w-0 flex-col items-start gap-0.5">{textoRotulo}{conExtra && extra}</span>}
        </>
    );
    const clases = cn("flex h-full w-full min-w-0 items-center justify-center overflow-hidden px-[7px] text-center", fila ? "flex-row gap-2" : "flex-col gap-0.5", className);
    return (
        <div ref={ref} className="h-full w-full min-w-0" data-micro-b={fila ? "fila" : "pila"}>
            {onClick ? (
                <button type="button" onClick={onClick} aria-label={etiqueta} title={etiqueta}
                    className={cn(clases, estilos.foco, "cursor-pointer rounded-[14px] transition-transform duration-200 active:scale-95 motion-reduce:transition-none")}>{interior}</button>
            ) : (
                <div role="img" aria-label={etiqueta} title={etiqueta} className={clases}>{interior}</div>
            )}
        </div>
    );
}

/** Un glifo micro (anillo, cristal…) medido por su tesela: nunca más grande que ella. */
export function GlifoMicroB({ maximo = 76, children }: { maximo?: number; children: (lado: number) => React.ReactNode }) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const lado = size.width && size.height ? Math.max(24, Math.min(maximo, Math.min(size.width, size.height) - 10)) : maximo;
    return <div ref={ref} className="grid h-full w-full place-items-center overflow-hidden">{children(lado)}</div>;
}

// ── Lienzo: tamaño, dispositivo y acento ────────────────────────────────────

export interface LienzoB {
    clase: ClaseTamano;
    base: BaseTamano;
    horizontal: boolean;
    acento: string;
    acento2: string;
    dispositivo: ClaseDispositivo;
    tactil: boolean;
    tv: boolean;
    nivel: NivelRender;
}

/** Dispositivo del navegador, recalculado al redimensionar (sin red, sin intervalos). */
export function useDispositivoB(): ClaseDispositivo {
    const [d, setD] = React.useState<ClaseDispositivo>("escritorio");
    React.useEffect(() => {
        const calc = () => setD(dispositivoActual());
        calc();
        window.addEventListener("resize", calc);
        return () => window.removeEventListener("resize", calc);
    }, []);
    return d;
}

/**
 * La clase de tamaño viene del marco (su medida real); fuera de él, de la caja medida por el
 * WidgetShell. Antes de medir (0×0) se asume «m»: nunca un parpadeo de «micro».
 */
export function useLienzoB(medida: { width: number; height: number }, familia: { acento: string; acento2: string }): LienzoB {
    const marco = useMarcoUnificado();
    const dispositivo = useDispositivoB();
    const nivel = useNivelRender();
    const clase: ClaseTamano = marco?.clase ?? (medida.width > 0 && medida.height > 0 ? claseDesdePx(medida.width, medida.height) : "m");
    const { base, horizontal } = marco ? { base: marco.base, horizontal: marco.horizontal } : disenoDe(clase);
    return {
        clase,
        base,
        horizontal,
        acento: marco?.acento ?? familia.acento,
        acento2: marco?.acento2 ?? familia.acento2,
        dispositivo,
        tactil: dispositivo === "movil" || dispositivo === "tablet",
        tv: dispositivo === "tv",
        nivel,
    };
}

/** true mientras el widget está en pantalla y la pestaña visible (para pausar relojes y animaciones). */
export function useVisibleB(ref: React.RefObject<HTMLElement | null>): boolean {
    const [visible, setVisible] = React.useState(true);
    React.useEffect(() => {
        const el = ref.current;
        let enPantalla = true;
        const actualizar = () => setVisible(enPantalla && document.visibilityState !== "hidden");
        let io: IntersectionObserver | null = null;
        if (el && typeof IntersectionObserver !== "undefined") {
            io = new IntersectionObserver((entradas) => {
                enPantalla = entradas.some((e) => e.isIntersecting);
                actualizar();
            });
            io.observe(el);
        }
        document.addEventListener("visibilitychange", actualizar);
        return () => {
            io?.disconnect();
            document.removeEventListener("visibilitychange", actualizar);
        };
    }, [ref]);
    return visible;
}

/** La hora, refrescada cada `cadaMs` SOLO mientras `activo` (null hasta montar: sin desajuste SSR). */
export function useAhoraB(cadaMs: number, activo: boolean): number | null {
    const [ahora, setAhora] = React.useState<number | null>(null);
    React.useEffect(() => {
        setAhora(Date.now());
        if (!activo) return;
        const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
        return () => window.clearInterval(id);
    }, [cadaMs, activo]);
    return ahora;
}

/** Raíz del cuerpo: publica el acento, el nivel de render, el dispositivo y la pausa fuera de pantalla. */
export const RaizB = React.forwardRef<HTMLDivElement, {
    lienzo: LienzoB;
    visible: boolean;
    className?: string;
    etiqueta?: string;
    children: React.ReactNode;
}>(function RaizB({ lienzo, visible, className, etiqueta, children }, ref) {
    return (
        <div
            ref={ref}
            className={cn(estilos.raiz, "text-white", className)}
            data-pausa={visible ? "no" : "si"}
            data-nivel-render={lienzo.nivel}
            data-dispositivo={lienzo.dispositivo}
            data-clase={lienzo.clase}
            aria-label={etiqueta}
            style={{ ["--b-acento" as string]: lienzo.acento, ["--b-acento-2" as string]: lienzo.acento2 } as React.CSSProperties}
        >
            {children}
        </div>
    );
});

// ── Color ───────────────────────────────────────────────────────────────────

/** El acento aclarado para texto sobre el vidrio. */
export function tintaB(color: string, t = 0.35): string {
    return esHex(color) ? mezclar(normalizarHex(color), "#ffffff", t) : color;
}

/** El acento oscurecido hacia la noche del vidrio (para fondos de degradado). */
export function sombraB(color: string, t = 0.4): string {
    return esHex(color) ? mezclar(normalizarHex(color), "#0b1020", t) : color;
}

export function haloB(color: string, fondo = 0.12, filo = 0.4): React.CSSProperties {
    return { background: conAlfa(color, fondo), boxShadow: `inset 0 0 0 1px ${conAlfa(color, filo)}` };
}

// ── Acciones ────────────────────────────────────────────────────────────────

export interface AccionBProps {
    children: React.ReactNode;
    href?: string;
    onClick?: () => void;
    icono?: LucideIcon;
    color: string;
    /** «llena» = acción principal (más luz); «fantasma» = secundaria. */
    tono?: "llena" | "fantasma";
    tactil?: boolean;
    externo?: boolean;
    disabled?: boolean;
    titulo?: string;
    className?: string;
    /** Botón de envío de un formulario. */
    enviar?: boolean;
    "aria-label"?: string;
    "aria-pressed"?: boolean;
}

/** Pastilla de acción: enlace interno, externo (pestaña nueva) o botón. Nunca se corta el texto. */
export function AccionB({ children, href, onClick, icono: Icono, color, tono = "fantasma", tactil, externo, disabled, titulo, className, enviar, ...aria }: AccionBProps) {
    const clase = cn(
        estilos.foco,
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full ss-redondo px-3 font-semibold text-white",
        "transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tactil ? "min-h-11 text-[13px]" : "min-h-7 py-1 text-[12px]",
        className,
    );
    const estilo = tono === "llena" ? haloB(color, 0.3, 0.7) : haloB(color, 0.12, 0.42);
    const contenido = (
        <>
            {Icono && <Icono className="size-3.5 shrink-0" style={{ color: tintaB(color, 0.45) }} aria-hidden />}
            <span>{children}</span>
        </>
    );
    if (href && !disabled) {
        if (externo || /^https?:\/\//.test(href)) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className={clase} style={estilo} title={titulo} aria-label={aria["aria-label"]}>{contenido}</a>;
        }
        return <Link href={href} className={clase} style={estilo} title={titulo} aria-label={aria["aria-label"]}>{contenido}</Link>;
    }
    return (
        <button type={enviar ? "submit" : "button"} onClick={onClick} disabled={disabled} className={clase} style={estilo} title={titulo} aria-label={aria["aria-label"]} aria-pressed={aria["aria-pressed"]}>
            {contenido}
        </button>
    );
}

/** Pestañas de filtro (radiogroup): pocas, con su recuento, sin desplazamiento horizontal. */
export function PestanasB<T extends string>({ opciones, valor, onCambio, color, tactil, etiqueta }: {
    opciones: { id: T; etiqueta: string; n?: number }[];
    valor: T;
    onCambio: (v: T) => void;
    color: string;
    tactil?: boolean;
    etiqueta: string;
}) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap items-center gap-1">
            {opciones.map((o) => {
                const activo = o.id === valor;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        onClick={() => onCambio(o.id)}
                        className={cn(
                            estilos.foco,
                            "cursor-pointer whitespace-nowrap rounded-full ss-redondo px-2.5 font-semibold transition-colors duration-200",
                            tactil ? "min-h-11 text-[13px]" : "min-h-7 text-[11px]",
                            activo ? "text-white" : "text-white/60 hover:text-white/90",
                        )}
                        style={activo ? haloB(color, 0.22, 0.6) : undefined}
                    >
                        {o.etiqueta}
                        {typeof o.n === "number" && <span className="ml-1 tabular-nums opacity-70">{o.n}</span>}
                    </button>
                );
            })}
        </div>
    );
}

// ── Señales honestas ────────────────────────────────────────────────────────

/** «Demostración»: lo que se ve no es un dato real todavía. */
export function DemostracionB({ motivo = "Datos simulados: aún no hay una fuente real conectada." }: { motivo?: string }) {
    return (
        <span
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full ss-redondo px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200"
            style={haloB("#f59e0b", 0.14, 0.45)}
            title={motivo}
            aria-label={`Demostración. ${motivo}`}
        >
            <FlaskConical className="size-3" aria-hidden /> Demostración
        </span>
    );
}

/** Rótulo de sección en versalitas (misma escala que el marco). */
export function RotuloB({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
    return (
        <span className={cn("whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em]", className)} style={{ color: color ?? "rgba(255,255,255,.6)" }}>
            {children}
        </span>
    );
}

// ── Anillo de tiempo ────────────────────────────────────────────────────────

/**
 * Anillo SVG: `fraccion` (0-1) de arco lleno desde las 12 en sentido horario. `urgente` añade un
 * latido suave. El centro lo ocupa `children` (texto SVG o nada).
 */
export function AnilloB({ fraccion, lado, grosor, color, pista = "rgba(255,255,255,.1)", urgente, children, etiqueta, gradienteId }: {
    fraccion: number;
    lado: number;
    grosor?: number;
    color: string;
    pista?: string;
    urgente?: boolean;
    children?: React.ReactNode;
    etiqueta?: string;
    gradienteId?: string;
}) {
    const g = grosor ?? Math.max(2.5, lado * 0.08);
    const r = (lado - g) / 2;
    const c = 2 * Math.PI * r;
    const f = Math.max(0, Math.min(1, fraccion));
    return (
        <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} role={etiqueta ? "img" : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true} className="shrink-0 overflow-visible">
            {gradienteId && (
                <defs>
                    <linearGradient id={gradienteId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={tintaB(color, 0.3)} />
                        <stop offset="100%" stopColor={color} />
                    </linearGradient>
                </defs>
            )}
            <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke={pista} strokeWidth={g} />
            <circle
                cx={lado / 2} cy={lado / 2} r={r} fill="none"
                stroke={gradienteId ? `url(#${gradienteId})` : color}
                strokeWidth={g} strokeLinecap="round"
                strokeDasharray={`${(c * f).toFixed(2)} ${c.toFixed(2)}`}
                transform={`rotate(-90 ${lado / 2} ${lado / 2})`}
                style={{ transition: "stroke-dasharray 400ms cubic-bezier(.22,1,.36,1)" }}
            />
            {urgente && f > 0 && (() => {
                const a = -Math.PI / 2 + f * 2 * Math.PI;
                return <circle cx={lado / 2 + Math.cos(a) * r} cy={lado / 2 + Math.sin(a) * r} r={g * 0.75} fill={tintaB(color, 0.5)} className={estilos.latido} />;
            })()}
            {children}
        </svg>
    );
}

/** Barra fina de reparto (Sí / No / Abstención u opciones), con segmentos del color de cada opción. */
export function RepartoB({ partes, alto = 6, etiqueta }: { partes: { id: string; pct: number; color: string; etiqueta: string }[]; alto?: number; etiqueta: string }) {
    const total = partes.reduce((s, p) => s + p.pct, 0);
    return (
        <div role="img" aria-label={etiqueta} className="flex w-full overflow-hidden rounded-full" style={{ height: alto, background: "rgba(255,255,255,.08)" }}>
            {total > 0 && partes.filter((p) => p.pct > 0).map((p, i) => (
                <span key={p.id} className={estilos.crecer} title={`${p.etiqueta}: ${Math.round(p.pct * 100)} %`}
                    style={{ width: `${(p.pct / total) * 100}%`, background: p.color, animationDelay: `${i * 60}ms`, marginLeft: i ? 1 : 0 }} />
            ))}
        </div>
    );
}

/** Colores de las opciones de voto: Sí esmeralda, No carmesí, Abstención gris; variantes con la paleta. */
export function colorOpcion(id: string, indice: number): string {
    if (id === "yes") return "#10b981";
    if (id === "no") return "#f43f5e";
    if (id === "abstain") return "#94a3b8";
    return ["#38bdf8", "#a78bfa", "#f59e0b", "#22d3ee", "#ec4899", "#84cc16"][indice % 6];
}
