"use client";
/**
 * Piezas comunes de los widgets libres (Ola 383). Nada de cajas: tipografía con halo, relojes
 * que no rompen la hidratación y un «sin dato» honesto con la misma voz en todos.
 */
import * as React from "react";
import { CircleDashed, type LucideIcon } from "lucide-react";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { EstadoMicro } from "@/components/dashboard/kit/estado-micro";

/** La hora viva, `null` hasta montar (el servidor no sabe qué hora es en tu neurona). */
export function useAhora(intervaloMs = 1000): Date | null {
    const [ahora, setAhora] = React.useState<Date | null>(null);
    React.useEffect(() => {
        setAhora(new Date());
        const id = window.setInterval(() => setAhora(new Date()), intervaloMs);
        return () => window.clearInterval(id);
    }, [intervaloMs]);
    return ahora;
}

/** Diseño base de cada clase: panorámico y torre reutilizan el de «m» con otra orientación. */
export function disenoDe(clase: ClaseTamano): { base: "micro" | "s" | "m" | "l" | "xl"; horizontal: boolean } {
    if (clase === "panoramico") return { base: "m", horizontal: true };
    if (clase === "torre") return { base: "m", horizontal: false };
    return { base: clase, horizontal: false };
}

/** Rótulo pequeño en versalitas, legible sobre cualquier fondo. */
export function Rotulo({ children, color, className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
    return (
        <span className={`whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] ${className}`} style={{ color: color ?? "rgba(255,255,255,.6)" }}>
            {children}
        </span>
    );
}

/**
 * Acorta un texto largo a `max` caracteres SIN cortar palabras («…» al final). Para mensajes que
 * además llevan line-clamp: así no queda texto oculto maquetado bajo los controles. El texto
 * entero va siempre en el `title` (o aria-label) del elemento.
 */
export function recortarPalabras(texto: string, max: number): string {
    const t = (texto ?? "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const corte = t.slice(0, max + 1);
    const espacio = corte.lastIndexOf(" ");
    const base = (espacio > max * 0.6 ? corte.slice(0, espacio) : t.slice(0, max)).replace(/[\s,.;:·(—–-]+$/u, "");
    return `${base}…`;
}

/** Cómo se dice el «sin dato» en una tesela micro: un glifo (la acción, si la hay) y una palabra. */
export interface SinDatoMicro {
    icono?: LucideIcon;
    /** Una palabra de 10 px junto al glifo (si cabe). */
    etiqueta?: string;
    href?: string;
    onClick?: () => void;
    color?: string;
}

/**
 * El dato que falta se dice, no se inventa. (Pulido 0930) Con `micro`, en una tesela micro se
 * dice con un glifo y como mucho una palabra; la frase entera va en title/aria-label (antes el
 * texto partía en dos líneas y se salía de una tesela de 46-65 px).
 */
export function SinDato({ texto = "sin dato", accion, micro }: { texto?: string; accion?: React.ReactNode; micro?: SinDatoMicro | false }) {
    if (micro) {
        return (
            <EstadoMicro kit="sin-dato" icono={micro.icono ?? CircleDashed} color={micro.color ?? "#94a3b8"} etiqueta={micro.etiqueta}
                descripcion={texto} href={micro.href} onClick={micro.href ? undefined : micro.onClick} />
        );
    }
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center" role="status">
            <span className="text-xs font-medium text-white/70">{texto}</span>
            {accion}
        </div>
    );
}

/** Pastilla de acción sin caja: un halo de color, nunca un rectángulo con borde. */
export function Pildora({ children, color = "#7c5cff", ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { color?: string }) {
    return (
        <button
            type="button"
            {...resto}
            className={`cursor-pointer rounded-full ss-redondo px-3 py-1 text-[11px] font-semibold text-white transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${resto.className ?? ""}`}
            style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, outlineColor: color, ...resto.style }}
        >
            {children}
        </button>
    );
}

/** Mezcla dos colores hex (0 → a, 1 → b). */
export function mezclar(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
    return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

/** Color de salud Trinity: verde Horizon, ámbar Logic, carmesí Anchor. */
export function colorSalud(nivel: "bien" | "atencion" | "mal"): string {
    return nivel === "bien" ? "#10B981" : nivel === "atencion" ? "#FFBF00" : "#DC143C";
}
