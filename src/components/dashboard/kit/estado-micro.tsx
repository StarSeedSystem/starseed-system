"use client";
/**
 * Estado micro (pulido 0930) — el vacío, el error y el «entra en tu cuenta» de una tesela micro.
 *
 * Una tesela de 108×65 (o 178×46 en el móvil) no tiene sitio para icono + título + ayuda +
 * pastilla: se desbordaban 50-100 px por debajo. Aquí queda UN glifo (que es la acción, si la
 * hay: enlace o botón) y como mucho UNA etiqueta de 10 px en una línea (la acción o un título
 * corto). El texto completo (título + mensaje) va en `title` y en el nombre accesible.
 *
 * La etiqueta solo se pinta si hay ancho para ella (medido); sin medida (jsdom, SSR) se pinta.
 * Todos los paquetes (kit, social, paquete-b, paquete-e, catálogo gen5, familias) usan este.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa, esHex, normalizarHex } from "@/components/widgets-libres/acentos-categoria";
import { useElementSize } from "./use-element-size";
// Sin importar `familias/comun`: el «sin dato» de las familias usa este componente y un ciclo
// comun → estado-micro → comun rompería el orden de evaluación de los módulos.

export interface EstadoMicroProps {
    /** El glifo (lucide). Si hay acción, el glifo ES la acción. */
    icono: LucideIcon;
    /** Una sola etiqueta de 10 px (la acción o un título corto). */
    etiqueta?: string;
    /** Texto completo (título + mensaje): va en `title` y en el nombre accesible. */
    descripcion: string;
    /** Color del glifo (hex o CSS). */
    color: string;
    href?: string;
    onClick?: () => void;
    /** El glifo gira (cargando) — se detiene con movimiento reducido. */
    girar?: boolean;
    className?: string;
    /** `data-kit` para pruebas y auditoría («vacio», «error», «cargando»…). */
    kit?: string;
}

/** Ancho mínimo (px) para que la etiqueta quepa al lado del glifo sin quedarse en «E…». */
const ANCHO_CON_ETIQUETA = 62;

/** El color aclarado un 35 % hacia el blanco (la tinta legible del acento sobre el vidrio). */
function tinta(color: string): string {
    if (!esHex(color)) return color;
    const h = normalizarHex(color).slice(1);
    const canal = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.65 + 255 * 0.35).toString(16).padStart(2, "0");
    return `#${canal(0)}${canal(2)}${canal(4)}`;
}

function fondo(color: string): React.CSSProperties {
    return { background: conAlfa(color, 0.14), boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.42)}` };
}

export function EstadoMicro({ icono: Icono, etiqueta, descripcion, color, href, onClick, girar, className, kit }: EstadoMicroProps) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const conEtiqueta = !!etiqueta && (size.width === 0 || size.width >= ANCHO_CON_ETIQUETA);
    const accion = !!href || !!onClick;
    const interior = (
        <>
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full" style={fondo(color)}>
                <Icono className={cn("size-3.5", girar && "animate-spin motion-reduce:animate-none")} strokeWidth={2} style={{ color: tinta(color) }} />
            </span>
            {conEtiqueta && (
                <span aria-hidden className="min-w-0 truncate text-[10px] font-semibold leading-[14px] text-white/80">{etiqueta}</span>
            )}
        </>
    );
    const clase = cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full ss-redondo",
        accion && "cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    );
    const nombre = accion && etiqueta && !descripcion.startsWith(etiqueta) ? `${etiqueta}: ${descripcion}` : descripcion;
    return (
        <div ref={ref} data-kit={kit} data-estado-micro="" className={cn("flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden px-1.5", className)}>
            {href ? (
                <a href={href} title={descripcion} aria-label={nombre} className={clase} style={{ outlineColor: color }}>{interior}</a>
            ) : onClick ? (
                <button type="button" onClick={onClick} title={descripcion} aria-label={nombre} className={clase} style={{ outlineColor: color }}>{interior}</button>
            ) : (
                <div role="status" title={descripcion} aria-label={descripcion} className={clase}>{interior}</div>
            )}
        </div>
    );
}

/** La acción de un estado: lo que el glifo micro abre o pulsa. */
export interface AccionMicro {
    etiqueta?: string;
    href?: string;
    onClick?: () => void;
}

function textoDe(nodo: React.ReactNode): string | undefined {
    if (typeof nodo === "string" || typeof nodo === "number") return String(nodo).trim() || undefined;
    if (Array.isArray(nodo)) {
        const t = nodo.map(textoDe).filter(Boolean).join(" ").trim();
        return t || undefined;
    }
    return undefined;
}

/**
 * La primera acción (enlace o botón) entre los hijos de un estado vacío, para que en micro el
 * glifo SEA esa acción. Mira las props (`href`, `onClick`, texto, `etiqueta`/`aria-label`/`title`)
 * de los elementos y entra en fragmentos y envoltorios; nunca ejecuta ni monta nada.
 */
export function accionDe(hijos: React.ReactNode, profundidad = 0): AccionMicro | null {
    if (profundidad > 3) return null;
    for (const hijo of React.Children.toArray(hijos)) {
        if (!React.isValidElement(hijo)) continue;
        const p = hijo.props as Record<string, unknown>;
        const href = typeof p.href === "string" ? p.href : undefined;
        const onClick = typeof p.onClick === "function" ? (p.onClick as () => void) : undefined;
        if (href || onClick) {
            const etiqueta = textoDe(p.children as React.ReactNode)
                ?? (typeof p.etiqueta === "string" ? p.etiqueta : undefined)
                ?? (typeof p["aria-label"] === "string" ? (p["aria-label"] as string) : undefined)
                ?? (typeof p.title === "string" ? p.title : undefined);
            return { etiqueta, href, onClick };
        }
        const dentro = accionDe(p.children as React.ReactNode, profundidad + 1);
        if (dentro) return dentro;
    }
    return null;
}

/** Une título y mensaje en una sola frase para `title`/`aria-label`. */
export function frase(...partes: Array<string | null | undefined | false>): string {
    const limpias = partes
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim().replace(/[.:;·\s]+$/u, ""));
    if (!limpias.length) return "";
    const texto = limpias.join(". ");
    return /[…?!]$/u.test(texto) ? texto : `${texto}.`;
}
