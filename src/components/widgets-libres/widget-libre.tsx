"use client";
/**
 * WidgetLibre (Ola 380 · FL5) — la envoltura SIN caja de los widgets de StarSeed.
 *
 * Nada de rectángulo, fondo ni borde: el widget es una forma (`trazoForma`) llena de un
 * degradado muy translúcido de su acento, con un filo de luz líquida y un halo; flota con
 * profundidad (inclinación 3D al puntero y el contenido en una capa más cerca de quien mira) y
 * entra con un fundido que se enfoca. Todo se ajusta al presupuesto del dispositivo
 * (`useNivelRender`) y a `prefers-reduced-motion`: solo `transform` y `opacity`.
 */
import * as React from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";
import { useElementSize } from "@/components/dashboard/kit/use-element-size";
import { trazoForma, type TipoForma } from "@/lib/widgets/forma/formas";
import { claseDesdePx, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { presupuesto, useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";

export interface ContextoLibre { clase: ClaseTamano; ancho: number; alto: number }

export interface WidgetLibreProps {
    forma?: TipoForma;
    acento?: string;
    /** Segundo tono del degradado (por defecto, turquesa StarSeed). */
    acento2?: string;
    semilla?: string;
    etiqueta?: string;
    /** Recorta el contenido a la silueta (para escenas que deben quedar dentro). */
    recortar?: boolean;
    /** Intensidad del cuerpo de la forma, 0-1 (0 = solo halo y filo). */
    intensidad?: number;
    className?: string;
    children: React.ReactNode | ((ctx: ContextoLibre) => React.ReactNode);
}

export function WidgetLibre({
    forma = "ninguna", acento = "#7c5cff", acento2 = "#23d5ab", semilla, etiqueta,
    recortar = false, intensidad = 0.5, className, children,
}: WidgetLibreProps) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const id = React.useId().replace(/:/g, "");
    const reducido = useReducedMotion();
    const p = presupuesto(useNivelRender());
    const inclinacion = reducido ? 0 : p.inclinacionMax;
    const rx = useSpring(0, { stiffness: 140, damping: 18 });
    const ry = useSpring(0, { stiffness: 140, damping: 18 });

    const w = Math.max(0, Math.round(size.width));
    const h = Math.max(0, Math.round(size.height));
    const clase = claseDesdePx(w, h);
    const d = React.useMemo(() => (forma === "ninguna" ? "" : trazoForma(forma, w, h, semilla ?? etiqueta ?? forma)), [forma, w, h, semilla, etiqueta]);
    const cuerpo = Math.max(0, Math.min(1, intensidad));

    const mover = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!inclinacion || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * inclinacion);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * inclinacion);
    };
    const soltar = () => { rx.set(0); ry.set(0); };

    return (
        <div
            ref={ref}
            role="group"
            aria-label={etiqueta}
            data-forma={forma}
            data-tamano={clase}
            className={`relative h-full w-full ${className ?? ""}`}
            style={{ perspective: 900, background: "transparent", border: 0 }}
            onPointerMove={mover}
            onPointerLeave={soltar}
        >
            <motion.div
                className="relative h-full w-full"
                style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
                initial={p.duracionEntradaMs ? { opacity: 0, scale: 0.94, filter: "blur(6px)" } : false}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: p.duracionEntradaMs / 1000, ease: [0.22, 1, 0.36, 1] }}
            >
                {forma === "ninguna" ? (
                    <div aria-hidden className="pointer-events-none absolute inset-[8%] rounded-full"
                        style={{ background: `radial-gradient(closest-side, ${acento}${p.halo === "vivo" ? "33" : "1f"}, transparent)` }} />
                ) : d ? (
                    <svg aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                        <defs>
                            <radialGradient id={`cuerpo-${id}`} cx="35%" cy="30%" r="80%">
                                <stop offset="0%" stopColor={acento} stopOpacity={0.34 * cuerpo} />
                                <stop offset="70%" stopColor={acento2} stopOpacity={0.12 * cuerpo} />
                                <stop offset="100%" stopColor={acento2} stopOpacity={0.02} />
                            </radialGradient>
                            <linearGradient id={`filo-${id}`} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
                                <stop offset="45%" stopColor={acento} stopOpacity={0.25} />
                                <stop offset="100%" stopColor={acento2} stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        {p.halo === "vivo" && <path d={d} fill={acento} opacity={0.18} style={{ filter: "blur(18px)" }} />}
                        <path d={d} fill={`url(#cuerpo-${id})`} fillRule="evenodd" />
                        <path d={d} fill="none" stroke={`url(#filo-${id})`} strokeWidth={1.2} fillRule="evenodd" />
                    </svg>
                ) : null}
                <div
                    className="relative z-10 h-full w-full"
                    style={{
                        transform: p.parallax && inclinacion ? "translateZ(28px)" : undefined,
                        clipPath: recortar && d ? `path("${d}")` : undefined,
                        textShadow: "0 1px 2px rgba(0,0,0,.45), 0 0 18px rgba(0,0,0,.25)",
                    }}
                >
                    {typeof children === "function" ? children({ clase, ancho: w, alto: h }) : children}
                </div>
            </motion.div>
        </div>
    );
}

export default WidgetLibre;
