"use client";

/**
 * MarcoDosPaneles — el esqueleto de Mensajes y de Correos (2026-09-28).
 *
 *  - Escritorio: lista (cristal, ancho fijo) + detalle (cristal, el resto). En modo enfoque la
 *    lista se recoge animando ancho y opacidad (~250 ms) y el detalle ocupa todo el ancho; la
 *    lista recogida queda `inert` (ni foco ni lector de pantalla la alcanzan).
 *  - Móvil: dos pantallas apiladas. La lista sigue montada debajo (conserva búsqueda, filtro y
 *    scroll) y el detalle entra deslizándose desde la derecha con su botón de volver.
 *
 * Respeta el nivel de movimiento del OS: con «mínimo» no hay desplazamientos, solo cambios
 * inmediatos; con «suave» los mismos gestos, más cortos.
 */

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useNivelMovimiento } from "@/hooks/use-nivel-movimiento";
import { CLASE_PANEL, DURACION_ENFOQUE, MUELLE } from "./estilos";

export interface MarcoDosPanelesProps {
    lista: ReactNode;
    detalle: ReactNode;
    /** Móvil: true = se ve el detalle; false = se ve la lista. */
    verDetalle: boolean;
    /** Escritorio: lista recogida y detalle a todo el ancho. */
    enfocado: boolean;
    esMovil: boolean;
    /** Ancho de la lista en escritorio (px). */
    anchoLista?: number;
    etiquetaLista?: string;
    etiquetaDetalle?: string;
    className?: string;
    /** Identidad del detalle (para animar al cambiar de chat en móvil). */
    claveDetalle?: string;
}

const HUECO = 12;

export function MarcoDosPaneles({
    lista,
    detalle,
    verDetalle,
    enfocado,
    esMovil,
    anchoLista = 372,
    etiquetaLista = "Lista",
    etiquetaDetalle = "Detalle",
    className,
    claveDetalle = "detalle",
}: MarcoDosPanelesProps) {
    const nivel = useNivelMovimiento();
    const sinMovimiento = nivel === "minimo";
    const factor = nivel === "suave" ? 0.7 : 1;

    if (esMovil) {
        const transicion = sinMovimiento ? { duration: 0 } : MUELLE;
        return (
            <div className={cn("relative h-full min-h-0 overflow-hidden", className)} data-testid="marco-movil">
                <motion.section
                    aria-label={etiquetaLista}
                    initial={false}
                    animate={verDetalle ? { x: sinMovimiento ? 0 : "-24%", opacity: 0 } : { x: 0, opacity: 1 }}
                    transition={sinMovimiento ? { duration: 0 } : { duration: 0.24 * factor, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 flex flex-col overflow-hidden border-t border-white/[0.06] bg-[rgba(10,12,28,0.55)] backdrop-blur-[20px]"
                    aria-hidden={verDetalle}
                    inert={verDetalle}
                >
                    {lista}
                </motion.section>
                <AnimatePresence initial={false}>
                    {verDetalle && (
                        <motion.section
                            key={claveDetalle}
                            aria-label={etiquetaDetalle}
                            initial={sinMovimiento ? { opacity: 0 } : { x: "100%" }}
                            animate={sinMovimiento ? { opacity: 1 } : { x: 0 }}
                            exit={sinMovimiento ? { opacity: 0 } : { x: "100%" }}
                            transition={transicion}
                            className="absolute inset-0 flex flex-col overflow-hidden bg-[#070814]"
                        >
                            {detalle}
                        </motion.section>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    const duracion = sinMovimiento ? 0 : DURACION_ENFOQUE * factor;
    return (
        <div className={cn("flex h-full min-h-0 px-3 pb-3", className)} data-testid="marco-escritorio">
            <motion.aside
                aria-label={etiquetaLista}
                initial={false}
                animate={{ width: enfocado ? 0 : anchoLista + HUECO, opacity: enfocado ? 0 : 1 }}
                transition={{ duration: duracion, ease: [0.22, 1, 0.36, 1] }}
                className="h-full shrink-0 overflow-hidden"
                aria-hidden={enfocado}
                inert={enfocado}
                data-enfocado={enfocado ? "si" : "no"}
            >
                <div style={{ width: anchoLista }} className={cn(CLASE_PANEL, "flex h-full flex-col overflow-hidden")}>
                    {lista}
                </div>
            </motion.aside>
            <section aria-label={etiquetaDetalle} className={cn(CLASE_PANEL, "flex h-full min-w-0 flex-1 flex-col overflow-hidden")}>
                {detalle}
            </section>
        </div>
    );
}

export default MarcoDosPaneles;
