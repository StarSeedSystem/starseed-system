"use client";

/**
 * Piezas visuales comunes de «Mi Puente de Mando».
 * ─────────────────────────────────────────────────────────────────────────────
 * Vidrio translúcido, bordes white/10 y texto blanco con opacidades, igual que
 * Ajustes y la Biblioteca. Centralizarlas aquí mantiene las siete páginas con
 * el mismo aspecto sin copiar clases de un archivo a otro.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Clases de un botón/enlace pequeño con foco visible (para acciones dentro de tarjetas). */
export const CLASE_ACCION =
    "inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-white/85 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[2.25rem]";

/** Variante para acciones que quitan o borran algo. */
export const CLASE_ACCION_PELIGRO =
    "inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-full border border-red-400/25 bg-red-500/10 px-3.5 text-xs font-semibold text-red-200 outline-none transition-colors hover:bg-red-500/20 focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[2.25rem]";

export function Tarjeta({
    titulo,
    icono: Icono,
    descripcion,
    accion,
    children,
    className,
    as: Etiqueta = "section",
}: {
    titulo?: string;
    icono?: LucideIcon;
    descripcion?: ReactNode;
    accion?: ReactNode;
    children?: ReactNode;
    className?: string;
    as?: "section" | "article" | "div" | "li";
}) {
    return (
        <Etiqueta
            className={cn(
                "rounded-2xl border border-white/10 bg-black/25 p-4 text-white shadow-lg backdrop-blur-md",
                className,
            )}
        >
            {(titulo || accion) && (
                <div className="mb-3 flex flex-wrap items-start gap-2">
                    {Icono && (
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                            <Icono className="h-4 w-4 text-cyan-200" aria-hidden />
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        {titulo && <h3 className="text-sm font-semibold leading-tight text-white">{titulo}</h3>}
                        {descripcion && <p className="mt-0.5 text-xs leading-snug text-white/55">{descripcion}</p>}
                    </div>
                    {accion && <div className="shrink-0">{accion}</div>}
                </div>
            )}
            {children}
        </Etiqueta>
    );
}

export function EstadoVacio({
    icono: Icono,
    titulo,
    texto,
    accion,
}: {
    icono: LucideIcon;
    titulo: string;
    texto: ReactNode;
    accion?: ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/15 p-6 text-center">
            <Icono className="mx-auto mb-2 h-8 w-8 text-white/30" aria-hidden />
            <p className="text-sm font-semibold text-white/80">{titulo}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-white/55">{texto}</p>
            {accion && <div className="mt-4 flex justify-center">{accion}</div>}
        </div>
    );
}

export function Cargando({ texto }: { texto: string }) {
    return (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {texto}
        </div>
    );
}

export function Chip({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "bien" | "atencion" | "info" }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                tono === "bien" && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
                tono === "atencion" && "border-amber-400/30 bg-amber-500/10 text-amber-200",
                tono === "info" && "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
                tono === "neutro" && "border-white/10 bg-white/5 text-white/70",
            )}
        >
            {children}
        </span>
    );
}

/** Cabecera de página: título + una línea de qué se hace aquí. */
export function CabeceraPagina({ titulo, texto, accion }: { titulo: string; texto: ReactNode; accion?: ReactNode }) {
    return (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white">{titulo}</h2>
                <p className="mt-0.5 max-w-2xl text-sm text-white/60">{texto}</p>
            </div>
            {accion}
        </div>
    );
}
