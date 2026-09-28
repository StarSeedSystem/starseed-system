"use client";

/**
 * Una diapositiva pintada a la escala del hueco que tenga (miniatura, visor, pantalla completa),
 * con los MISMOS elementos del lienzo de los mensajes (`ElementoVista`): textos con formato, fotos,
 * vídeos, formas, ventanas web con sandbox que se activan con un clic, apps del OS.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CapaFondoAnimado, ElementoVista, estiloCajaElemento } from "@/components/messages/rico/render-lienzo";
import ricoStyles from "@/components/messages/rico/rico.module.css";
import { colorTextoSobre, fondoCssDe } from "@/lib/mensajeria/formato";
import type { EstiloMensaje, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";

export interface VistaDiapositivaProps {
    /** Lienzo efectivo (con el fondo y las medidas del mazo ya aplicados). */
    lienzo: LienzoMensaje;
    estiloBase?: EstiloMensaje;
    /** Miniatura: sin animación de fondo, sin controles, sin interacción. */
    miniatura?: boolean;
    /** «ancho»: ocupa el ancho y deduce el alto · «contener»: cabe entera en el hueco. */
    ajuste?: "ancho" | "contener";
    etiqueta?: string;
    className?: string;
    radio?: number;
    /** Capa encima de la diapositiva (puntero láser…), en coordenadas 0–1. */
    children?: ReactNode;
}

export function VistaDiapositiva({ lienzo, estiloBase, miniatura, ajuste = "ancho", etiqueta, className, radio = 12, children }: VistaDiapositivaProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [caja, setCaja] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const nodo = ref.current;
        if (!nodo) return;
        const medir = () => {
            const r = nodo.getBoundingClientRect();
            setCaja((prev) => (Math.abs(prev.w - r.width) > 0.5 || Math.abs(prev.h - r.height) > 0.5 ? { w: r.width, h: r.height } : prev));
        };
        medir();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", medir);
            return () => window.removeEventListener("resize", medir);
        }
        const obs = new ResizeObserver(medir);
        obs.observe(nodo);
        return () => obs.disconnect();
    }, []);

    const escala = caja.w > 0 ? (ajuste === "ancho" ? caja.w / lienzo.ancho : Math.min(caja.w / lienzo.ancho, caja.h / lienzo.alto)) : 0;
    const ancho = lienzo.ancho * escala;
    const alto = lienzo.alto * escala;
    const ordenados = useMemo(() => [...lienzo.elementos].sort((a, b) => a.z - b.z), [lienzo.elementos]);

    return (
        <div
            ref={ref}
            className={cn("relative w-full", ajuste === "contener" && "h-full", className)}
            style={ajuste === "ancho" ? { aspectRatio: `${lienzo.ancho} / ${lienzo.alto}` } : undefined}
            role={miniatura ? undefined : "img"}
            aria-label={miniatura ? undefined : etiqueta}
            data-diapositiva=""
        >
            {escala > 0 && (
                <div
                    className="absolute overflow-hidden"
                    style={{
                        left: (caja.w - ancho) / 2,
                        top: ajuste === "ancho" ? 0 : (caja.h - alto) / 2,
                        width: ancho,
                        height: alto,
                        borderRadius: radio,
                        background: fondoCssDe(lienzo.fondo) ?? "#0b0d1a",
                        color: colorTextoSobre(lienzo.fondo) ?? "#fff",
                        boxShadow: "0 0 0 1px rgba(255,255,255,.08)",
                        isolation: "isolate",
                    }}
                    inert={miniatura || undefined}
                >
                    {!miniatura && <CapaFondoAnimado tipo={lienzo.animacionFondo} />}
                    <div className={ricoStyles.escena} style={{ width: lienzo.ancho, height: lienzo.alto, transform: `scale(${escala})` }}>
                        {ordenados.map((el) => (
                            <div key={el.id} className={ricoStyles.elemento} style={estiloCajaElemento(el)} data-tipo={el.tipo}>
                                <ElementoVista el={el} estiloBase={estiloBase} modo={miniatura ? "edicion" : "vista"} escala={escala} mio={false} />
                            </div>
                        ))}
                    </div>
                    {children}
                </div>
            )}
        </div>
    );
}
