"use client";

import { Fragment, useEffect, useLayoutEffect, useState } from "react";
import { motion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";
export type VarianteKineticTitle = "sobria" | "expresiva" | "experimental";
export interface KineticTitleProps {
    titulo: string;
    variante?: VarianteKineticTitle;
    ritmo?: number;
    className?: string;
    stiffness?: number;
    damping?: number;
    mass?: number;
}

const COLORES_EXPRESIVA = [
    "text-trinity-azure",
    "text-trinity-emerald",
    "text-trinity-amber",
    "text-trinity-crimson",
] as const;
const RESORTES: Record<VarianteKineticTitle, { stiffness: number; damping: number; mass: number }> = {
    sobria: { stiffness: 120, damping: 24, mass: 1 },
    expresiva: { stiffness: 220, damping: 12, mass: 0.9 },
    experimental: { stiffness: 180, damping: 14, mass: 1 },
};
function dividirEnTramos(titulo: string): string[] {
    return titulo.trim().split(/\s+/).filter(Boolean);
}
function colorDeTramo(variante: VarianteKineticTitle, indice: number): string {
    if (variante !== "expresiva") return "text-trinity-azure";
    return COLORES_EXPRESIVA[indice % COLORES_EXPRESIVA.length];
}
function useMovimientoReducido(): boolean {
    const [reducido, setReducido] = useState(false);
    const efecto = typeof window !== "undefined" ? useLayoutEffect : useEffect;
    efecto(() => {
        if (typeof window.matchMedia !== "function") return;
        const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
        const actualizar = () => setReducido(consulta.matches);
        actualizar();
        consulta.addEventListener?.("change", actualizar);
        return () => consulta.removeEventListener?.("change", actualizar);
    }, []);
    return reducido;
}
export function KineticTitle({
    titulo,
    variante = "sobria",
    ritmo = 90,
    className,
    stiffness,
    damping,
    mass,
}: KineticTitleProps) {
    const reducido = useMovimientoReducido();
    const tramos = dividirEnTramos(titulo);
    if (tramos.length === 0) return null;
    const base = RESORTES[variante];
    const resorte = { stiffness: stiffness ?? base.stiffness, damping: damping ?? base.damping, mass: mass ?? base.mass };
    const paso = Math.max(0, ritmo) * (variante === "expresiva" ? 0.6 : 1);
    const transicion = (indice: number): Transition => ({
        type: "spring", stiffness: resorte.stiffness, damping: resorte.damping,
        mass: resorte.mass, delay: (indice * paso) / 1000,
    });
    const inicial = { opacity: 0, y: variante === "sobria" ? 8 : variante === "experimental" ? 12 : 18, x: variante === "expresiva" ? -12 : 0 };

    return (
        <h2
            className={cn(
                "relative isolate overflow-hidden rounded-[24px] bg-zinc-950 px-fib-6 py-fib-5",
                "font-sans text-[28px] font-bold leading-[1.15] tracking-tight md:text-[35px]",
                className,
            )}
            data-movimiento={reducido ? "reducido" : "animado"}
        >
            <span
                aria-hidden="true"
                data-horizonte
                className="pointer-events-none absolute inset-x-0 top-1/3 z-0 h-px bg-trinity-azure/60"
            />
            <span className="relative z-10 flex flex-wrap items-baseline gap-x-fib-5 gap-y-fib-2">
                {tramos.map((tramo, indice) => {
                    const color = colorDeTramo(variante, indice);
                    const separador = indice < tramos.length - 1 ? " " : null;
                    if (reducido) {
                        return (
                            <Fragment key={`${tramo}-${indice}`}>
                                <span data-tramo={indice} className={cn("inline-block", color)}>
                                    {tramo}
                                </span>
                                {separador}
                            </Fragment>
                        );
                    }
                    return (
                        <Fragment key={`${tramo}-${indice}`}>
                            <motion.span
                                data-tramo={indice}
                                className={cn("inline-block will-change-transform", color)}
                                initial={inicial}
                                animate={{ opacity: 1, y: 0, x: 0 }}
                                transition={transicion(indice)}
                                whileHover={
                                    variante === "experimental"
                                        ? { scale: 1.08, transition: { type: "spring", ...resorte } }
                                        : undefined
                                }
                            >
                                {tramo}
                            </motion.span>
                            {separador}
                        </Fragment>
                    );
                })}
            </span>
        </h2>
    );
}
