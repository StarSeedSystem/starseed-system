"use client";

/**
 * piezas — pequeños bloques de interfaz compartidos por la app de Contactos: interruptor
 * accesible, selector de color, sección con rótulo y chip de color.
 */

import type { ReactNode } from "react";
import { Check, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ACENTO, CLASE_FOCO, CLASE_ROTULO, CLASE_TARJETA, PALETA, pildora } from "@/components/contactos/app/estilos";

/** Interruptor (role="switch") con el acento teal. */
export function Interruptor({
    activo,
    onCambiar,
    etiqueta,
    deshabilitado,
    color = ACENTO,
    id,
    describedBy,
}: {
    activo: boolean;
    onCambiar: (v: boolean) => void;
    etiqueta: string;
    deshabilitado?: boolean;
    color?: string;
    id?: string;
    describedBy?: string;
}) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={activo}
            aria-label={etiqueta}
            aria-describedby={describedBy}
            disabled={deshabilitado}
            onClick={() => onCambiar(!activo)}
            className={cn(
                "ss-redondo relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40",
                CLASE_FOCO,
            )}
            style={{
                background: activo ? `${color}66` : "rgba(255,255,255,0.1)",
                boxShadow: activo ? `inset 0 0 0 1px ${color}, 0 0 16px -4px ${color}` : "inset 0 0 0 1px rgba(255,255,255,0.14)",
            }}
        >
            <span
                aria-hidden
                className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200"
                style={{ transform: activo ? "translateX(20px)" : "translateX(0)" }}
            />
        </button>
    );
}

/** Muestras de la paleta para elegir color (radiogroup). */
export function SelectorColor({
    valor,
    onCambiar,
    etiqueta = "Color",
}: {
    valor: string;
    onCambiar: (c: string) => void;
    etiqueta?: string;
}) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
            {PALETA.map((c) => {
                const activo = c.toLowerCase() === valor.toLowerCase();
                return (
                    <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        aria-label={`Color ${c}`}
                        onClick={() => onCambiar(c)}
                        className={cn(
                            "ss-redondo flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 hover:scale-110",
                            CLASE_FOCO,
                        )}
                        style={{ background: c, boxShadow: activo ? `0 0 0 2px rgba(8,10,26,0.95), 0 0 0 4px ${c}` : undefined }}
                    >
                        {activo ? <Check className="h-3.5 w-3.5 text-black/70" aria-hidden /> : null}
                    </button>
                );
            })}
        </div>
    );
}

/** Sección de la ficha: rótulo con icono y contenido en tarjeta de cristal. */
export function Seccion({
    titulo,
    icono: Icono,
    accion,
    children,
    className,
    sinTarjeta,
}: {
    titulo: string;
    icono?: LucideIcon;
    accion?: ReactNode;
    children: ReactNode;
    className?: string;
    sinTarjeta?: boolean;
}) {
    return (
        <section className={cn("flex flex-col gap-2.5", className)} aria-label={titulo}>
            <div className="flex items-center justify-between gap-2 px-1">
                <h3 className={cn(CLASE_ROTULO, "inline-flex items-center gap-1.5")}>
                    {Icono ? <Icono className="h-3.5 w-3.5" style={{ color: ACENTO }} aria-hidden /> : null}
                    {titulo}
                </h3>
                {accion}
            </div>
            {sinTarjeta ? children : <div className={cn(CLASE_TARJETA, "p-3.5")}>{children}</div>}
        </section>
    );
}

/** Chip de color (categoría/lista), con botón de quitar opcional. */
export function ChipColor({
    nombre,
    color,
    onQuitar,
    pequeno,
}: {
    nombre: string;
    color: string;
    onQuitar?: () => void;
    pequeno?: boolean;
}) {
    return (
        <span
            className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full font-medium text-white/90",
                pequeno ? "px-2 py-0.5 text-[11px]" : "py-1 pl-2.5 text-[12px]",
                !pequeno && (onQuitar ? "pr-1" : "pr-2.5"),
            )}
            style={pildora(color)}
        >
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <span className="break-words">{nombre}</span>
            {onQuitar ? (
                <button
                    type="button"
                    onClick={onQuitar}
                    aria-label={`Quitar ${nombre}`}
                    className={cn("ss-redondo cursor-pointer rounded-full p-0.5 text-white/60 transition-colors hover:bg-white/15 hover:text-white", CLASE_FOCO)}
                >
                    <X className="h-3 w-3" aria-hidden />
                </button>
            ) : null}
        </span>
    );
}
