"use client";
/**
 * Piezas del catálogo ampliado (Ola 0929-C): acciones, estados honestos y la etiqueta de
 * «demostración». Todas hablan la voz del marco (Rotulo/Pildora): pastillas fantasma del
 * acento, nunca cajas con borde; 44 px de alto en táctil y TV; `ss-redondo` en todo botón
 * redondo (la regla global cuadra cualquier <button>).
 */
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, FlaskConical, RotateCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa, esHex, normalizarHex } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import { mensajeError } from "@/components/dashboard/calidad-widget";
import { useMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { accionDe, EstadoMicro, frase } from "@/components/dashboard/kit/estado-micro";

/** El acento aclarado para texto sobre el vidrio. */
export function tinta(color: string, t = 0.35): string {
    return esHex(color) ? mezclar(normalizarHex(color), "#ffffff", t) : color;
}

// ── Acción: enlace o botón en pastilla ────────────────────────────────────

export interface AccionProps {
    children: React.ReactNode;
    color: string;
    href?: string;
    onClick?: () => void;
    icono?: LucideIcon;
    /** Alto mínimo (px): 44 en táctil/TV. */
    alto?: number;
    /** Relleno sólido (acción principal) en vez de fantasma. */
    solida?: boolean;
    /** Solo icono: círculo (el texto va a aria-label). */
    soloIcono?: boolean;
    etiqueta?: string;
    title?: string;
    disabled?: boolean;
    type?: "button" | "submit";
    className?: string;
    pulsado?: boolean;
}

export function Accion({ children, color, href, onClick, icono: Icono, alto = 30, solida, soloIcono, etiqueta, title, disabled, type = "button", className, pulsado }: AccionProps) {
    const estilo: React.CSSProperties = solida
        ? { background: conAlfa(color, 0.32), boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.7)}, 0 6px 18px -8px ${conAlfa(color, 0.7)}`, minHeight: alto, minWidth: soloIcono ? alto : undefined, outlineColor: color }
        : { background: conAlfa(color, pulsado ? 0.26 : 0.12), boxShadow: `inset 0 0 0 1px ${conAlfa(color, pulsado ? 0.7 : 0.4)}`, minHeight: alto, minWidth: soloIcono ? alto : undefined, outlineColor: color };
    const clases = cn(
        "ss-redondo inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-full font-semibold text-white/90 no-underline",
        "transition-[transform,background-color] duration-200 hover:-translate-y-px hover:text-white motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        soloIcono ? "p-0" : "px-3",
        "text-[12px] leading-none whitespace-nowrap",
        className,
    );
    // Solo icono: el nombre va en aria-label y en el tooltip, sin texto oculto en el DOM (un
    // «sr-only» sin ajuste de línea asomaba fuera de la tarjeta en la esquina y los detectores
    // de desbordes lo contaban como texto que se sale).
    const nombre = etiqueta ?? (typeof children === "string" ? children : undefined);
    const contenido = (
        <>
            {Icono && <Icono aria-hidden className="size-3.5 shrink-0" strokeWidth={2.2} />}
            {soloIcono ? null : children}
        </>
    );
    const tooltip = title ?? (soloIcono ? nombre : undefined);
    if (href) {
        return (
            <Link href={href} className={clases} style={estilo} aria-label={soloIcono ? nombre : etiqueta} title={tooltip}>
                {contenido}
            </Link>
        );
    }
    return (
        <button type={type} onClick={onClick} disabled={disabled} className={clases} style={estilo} aria-label={soloIcono ? nombre : etiqueta} title={tooltip} aria-pressed={pulsado}>
            {contenido}
        </button>
    );
}

// ── Etiqueta «demostración» ───────────────────────────────────────────────

/** Se dice en pantalla cuando lo que se ve es una simulación, nunca se disfraza de dato. */
export function EtiquetaDemo({ color = "#fbbf24", corta = false, texto = "demostración" }: { color?: string; corta?: boolean; texto?: string }) {
    return (
        <span
            role="note"
            title="Datos simulados: aún no hay una fuente real conectada para esto."
            aria-label="Datos de demostración: simulados, no reales"
            className="ss-redondo inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: tinta(color, 0.2), background: conAlfa(color, 0.12), boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.45)}` }}
        >
            <FlaskConical aria-hidden className="size-3" />
            {corta ? "demo" : texto}
        </span>
    );
}

// ── Estados honestos ──────────────────────────────────────────────────────

export interface VacioProps {
    icono: LucideIcon;
    titulo: string;
    ayuda?: string;
    color: string;
    accion?: React.ReactNode;
    compacto?: boolean;
    /** Dibujo propio en lugar del icono en su halo. */
    ilustracion?: React.ReactNode;
    /** Ocupa todo el alto disponible (por defecto sí). */
    llenar?: boolean;
}

/** Estado vacío: qué falta y qué hacer, con la acción a un toque. */
export function VacioHonesto({ icono: Icono, titulo, ayuda, color, accion, compacto, ilustracion, llenar = true }: VacioProps) {
    // (Pulido 0930) En una tesela micro: un glifo (la acción, si la hay) y una etiqueta corta.
    const marco = useMarcoUnificado();
    if (marco?.base === "micro") {
        const a = accionDe(accion);
        return (
            <EstadoMicro kit="vacio" icono={Icono} color={color} etiqueta={a?.etiqueta ?? titulo} descripcion={frase(titulo, ayuda)}
                href={a?.href} onClick={a?.href ? undefined : a?.onClick} className={llenar ? undefined : "h-auto"} />
        );
    }
    return (
        <div role="status" className={cn("flex min-h-0 w-full flex-col items-center justify-center gap-2 px-1 text-center", llenar && "h-full")}>
            {ilustracion ?? <span aria-hidden className="ss-redondo grid shrink-0 place-items-center rounded-full"
                style={{ width: compacto ? 34 : 46, height: compacto ? 34 : 46, background: `radial-gradient(circle at 35% 30%, ${conAlfa(color, 0.35)}, ${conAlfa(color, 0.06)} 70%)`, boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.45)}, 0 0 22px -6px ${conAlfa(color, 0.6)}` }}>
                <Icono className={compacto ? "size-4" : "size-5"} style={{ color: tinta(color) }} strokeWidth={1.8} />
            </span>}
            <p className={cn("font-semibold leading-snug text-white/90", compacto ? "text-[12px]" : "text-[13px]")}>{titulo}</p>
            {ayuda && !compacto && <p className="max-w-[26ch] text-[12px] leading-snug text-white/60">{ayuda}</p>}
            {accion}
        </div>
    );
}

/** Cargando: la silueta de lo que viene, sin girar nada (respeta movimiento reducido). */
export function CargandoSilueta({ color, filas = 3, etiqueta = "Cargando…" }: { color: string; filas?: number; etiqueta?: string }) {
    return (
        // El nombre accesible es la etiqueta (un sr-only se maquetaba fuera de las teselas micro).
        <div role="status" aria-live="polite" aria-label={etiqueta} title={etiqueta} className="flex h-full w-full flex-col justify-center gap-2.5 overflow-hidden">
            {Array.from({ length: filas }, (_, i) => (
                <span key={i} aria-hidden className="block h-2.5 shrink-0 rounded-full motion-safe:animate-pulse"
                    style={{ width: `${88 - i * 18}%`, background: conAlfa(color, 0.14 - i * 0.03) }} />
            ))}
        </div>
    );
}

/** Error: mensaje humano (calidad-widget) y reintento si tiene sentido. */
export function ErrorHonesto({ error, color, onReintentar, compacto }: { error: unknown; color: string; onReintentar?: () => void; compacto?: boolean }) {
    const m = mensajeError(error);
    const marco = useMarcoUnificado();
    if (marco?.base === "micro") {
        const reintentar = m.reintentable ? onReintentar : undefined;
        return (
            <EstadoMicro kit="error" icono={reintentar ? RotateCw : AlertTriangle} color={reintentar ? color : "#fbbf24"} etiqueta={reintentar ? "Reintentar" : m.titulo}
                descripcion={frase(m.titulo, m.detalle)} onClick={reintentar} />
        );
    }
    return (
        <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
            <AlertTriangle aria-hidden className="size-5 text-amber-300" />
            <p className="text-[13px] font-semibold text-white/90">{m.titulo}</p>
            {!compacto && <p className="max-w-[28ch] text-[12px] leading-snug text-white/60">{m.detalle}</p>}
            {m.reintentable && onReintentar && <Accion color={color} icono={RotateCw} onClick={onReintentar}>Reintentar</Accion>}
        </div>
    );
}

// ── Tipografía de cifras ──────────────────────────────────────────────────

/** Cifra protagonista: fina, tabular, con su unidad pequeña al lado. */
export function Cifra({ valor, unidad, tam, color = "#fff", className }: { valor: React.ReactNode; unidad?: string; tam: number; color?: string; className?: string }) {
    return (
        <span className={cn("inline-flex items-baseline gap-1 tabular-nums", className)} style={{ color }}>
            <span style={{ fontSize: tam, lineHeight: 1, fontWeight: 250, letterSpacing: "-0.02em" }}>{valor}</span>
            {unidad && <span className="font-medium text-white/60" style={{ fontSize: Math.max(11, tam * 0.3) }}>{unidad}</span>}
        </span>
    );
}

/** Rótulo en versalitas del marco (misma escala que Rotulo, con color opcional). */
export function Rot({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
    return (
        <span className={cn("whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em]", className)} style={{ color: color ?? "rgba(255,255,255,.6)" }}>
            {children}
        </span>
    );
}

/** Menú vertical de acciones (nunca una tira horizontal con scroll). */
export function MenuVertical({ children, etiqueta }: { children: React.ReactNode; etiqueta: string }) {
    return (
        <nav aria-label={etiqueta} className="flex flex-col items-stretch gap-1.5">
            {children}
        </nav>
    );
}
