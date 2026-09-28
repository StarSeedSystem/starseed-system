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
import { relacionForma, trazoForma, type TipoForma } from "@/lib/widgets/forma/formas";
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
    const nivel = useNivelRender();
    const p = presupuesto(nivel);
    const inclinacion = reducido ? 0 : p.inclinacionMax;
    const rx = useSpring(0, { stiffness: 140, damping: 18 });
    const ry = useSpring(0, { stiffness: 140, damping: 18 });

    const w = Math.max(0, Math.round(size.width));
    const h = Math.max(0, Math.round(size.height));
    const clase = claseDesdePx(w, h);
    // Las formas «cuadradas» (orbe, hexágono, órbita, estrella) se dibujan en un cuadrado
    // centrado: un reloj es un círculo, no una elipse estirada por la celda.
    const cuadrada = relacionForma(forma) === "cuadrada";
    const lado = Math.min(w, h);
    const [fw, fh, ox, oy] = cuadrada ? [lado, lado, (w - lado) / 2, (h - lado) / 2] : [w, h, 0, 0];
    const d = React.useMemo(() => (forma === "ninguna" ? "" : trazoForma(forma, fw, fh, semilla ?? etiqueta ?? forma)), [forma, fw, fh, semilla, etiqueta]);
    const recorte = React.useMemo(() => (recortar && forma !== "ninguna" ? trazoForma(forma, w, h, semilla ?? etiqueta ?? forma) : ""), [recortar, forma, w, h, semilla, etiqueta]);
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
            data-nivel-render={nivel}
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
                            <radialGradient id={`cuerpo-${id}`} cx="32%" cy="24%" r="85%">
                                <stop offset="0%" stopColor={acento} stopOpacity={0.42 * cuerpo + 0.06} />
                                <stop offset="55%" stopColor={acento2} stopOpacity={0.16 * cuerpo + 0.04} />
                                <stop offset="100%" stopColor={acento2} stopOpacity={0.05} />
                            </radialGradient>
                            {/* brillo de cristal: la luz entra por arriba y se apaga a media altura */}
                            <linearGradient id={`brillo-${id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
                                <stop offset="42%" stopColor="#ffffff" stopOpacity={0.04} />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <g transform={ox || oy ? `translate(${ox} ${oy})` : undefined}>
                            {p.halo === "vivo" && <path d={d} fill={acento} opacity={0.2} style={{ filter: "blur(22px)" }} />}
                            <path d={d} fill={`url(#cuerpo-${id})`} fillRule="evenodd" />
                            <path d={d} fill={`url(#brillo-${id})`} fillRule="evenodd" />
                            <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.16} strokeWidth={1} fillRule="evenodd" />
                        </g>
                    </svg>
                ) : null}
                <div
                    className="relative z-10 h-full w-full"
                    style={{
                        transform: p.parallax && inclinacion ? "translateZ(28px)" : undefined,
                        clipPath: recorte ? `path("${recorte}")` : undefined,
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
