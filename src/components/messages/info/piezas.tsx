"use client";

/**
 * Piezas comunes del panel de información del chat: tarjetas de cristal, filas de ajuste con
 * su pista de «hereda», interruptores redondos, selectores segmentados y botones rápidos.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const VIDRIO: CSSProperties = {
    background: "rgba(12,14,34,.55)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.06)",
};

export const VIDRIO_ITEM: CSSProperties = {
    background: "rgba(255,255,255,.045)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)",
};

/** Rótulo de sección: 11 px, versalitas, tracking .14em. */
export function RotuloSeccion({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <h3 className={cn("px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55", className)}>{children}</h3>
    );
}

export function Tarjeta({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
    return (
        <section id={id} className={cn("rounded-[20px] p-3.5", className)} style={VIDRIO_ITEM}>
            {children}
        </section>
    );
}

export function PistaHereda({ visible }: { visible: boolean }) {
    if (!visible) return null;
    return <span className="ml-1.5 whitespace-nowrap text-[11px] font-normal text-white/40">· hereda de los ajustes generales</span>;
}

/** Fila con título, descripción opcional y un control a la derecha (o debajo en pantallas chicas). */
export function FilaAjuste({
    icono, titulo, descripcion, hereda = false, children, htmlFor, abajo = false,
}: {
    icono?: ReactNode;
    titulo: string;
    descripcion?: ReactNode;
    hereda?: boolean;
    children?: ReactNode;
    htmlFor?: string;
    /** Control en su propia línea (selectores anchos). */
    abajo?: boolean;
}) {
    return (
        <div className={cn("flex gap-3 py-2.5", abajo ? "flex-col" : "items-center")}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
                {icono && <span className="mt-0.5 shrink-0 text-white/60">{icono}</span>}
                <div className="min-w-0">
                    <label htmlFor={htmlFor} className="block text-[14px] font-medium leading-snug text-white/90">
                        {titulo}
                        <PistaHereda visible={hereda} />
                    </label>
                    {descripcion && <p className="mt-0.5 text-[12.5px] leading-snug text-white/55">{descripcion}</p>}
                </div>
            </div>
            {children && <div className={cn(abajo ? "w-full" : "shrink-0")}>{children}</div>}
        </div>
    );
}

export function Interruptor({
    id, activo, onCambiar, etiqueta,
}: { id?: string; activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string }) {
    return (
        <Switch
            id={id}
            checked={activo}
            onCheckedChange={onCambiar}
            aria-label={etiqueta}
            className="ss-redondo data-[state=checked]:bg-[#7C5CFF]"
        />
    );
}

/** Grupo de opciones como píldoras (se reparten en varias líneas si no caben). */
export function Segmentado<T extends string>({
    opciones, valor, onCambiar, etiqueta, color = "#7C5CFF",
}: {
    opciones: { id: T; etiqueta: string; titulo?: string }[];
    valor: T;
    onCambiar: (v: T) => void;
    etiqueta: string;
    color?: string;
}) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
            {opciones.map((o) => {
                const activo = o.id === valor;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        title={o.titulo}
                        onClick={() => onCambiar(o.id)}
                        className={cn(
                            "ss-redondo cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200",
                            activo ? "text-white" : "text-white/65 hover:text-white",
                        )}
                        style={
                            activo
                                ? { background: `${color}2e`, boxShadow: `inset 0 0 0 1px ${color}99` }
                                : { background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }
                        }
                    >
                        {o.etiqueta}
                    </button>
                );
            })}
        </div>
    );
}

/** Botón redondo de acción rápida con su etiqueta completa debajo. */
export function BotonRapido({
    icono, etiqueta, onClick, href, color = "#7C5CFF",
}: { icono: ReactNode; etiqueta: string; onClick?: () => void; href?: string; color?: string }) {
    const circulo = (
        <span
            className="grid h-12 w-12 place-items-center rounded-full text-white transition-transform duration-200 group-hover/rapido:scale-105"
            style={{ background: `${color}24`, boxShadow: `inset 0 0 0 1px ${color}66` }}
        >
            {icono}
        </span>
    );
    const clase = "group/rapido flex w-[68px] cursor-pointer flex-col items-center gap-1.5 text-[11.5px] font-medium text-white/80 hover:text-white";
    if (href) {
        return (
            <Link href={href} className={clase} aria-label={etiqueta}>
                {circulo}
                <span className="text-center leading-tight">{etiqueta}</span>
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} className={clase} aria-label={etiqueta}>
            {circulo}
            <span className="text-center leading-tight">{etiqueta}</span>
        </button>
    );
}

/** Fila que navega a una sub-vista del panel. */
export function FilaNavegable({
    icono, titulo, detalle, onClick, color = "#7C5CFF", derecha,
}: { icono: ReactNode; titulo: string; detalle?: ReactNode; onClick: () => void; color?: string; derecha?: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.05]"
        >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55`, color }}>
                {icono}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-white/90">{titulo}</span>
                {detalle && <span className="block text-[12.5px] text-white/55">{detalle}</span>}
            </span>
            {derecha}
        </button>
    );
}
