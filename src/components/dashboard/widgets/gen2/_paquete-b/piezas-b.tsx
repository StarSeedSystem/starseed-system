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
import type { BaseTamano } from "@/components/dashboard/kit/contexto-marco";
import { claseDesdePx, dispositivoActual, type ClaseDispositivo, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { useNivelRender, type NivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { conAlfa, esHex, normalizarHex } from "@/components/widgets-libres/acentos-categoria";
import { disenoDe, mezclar } from "@/components/widgets-libres/familias/comun";
import estilos from "./paquete-b.module.css";

export { estilos as estilosB };

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
