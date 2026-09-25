"use client";

/**
 * BotonCerrar — la X común de todos los menús, cortinas, ventanas y diálogos.
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo botón de cierre para todo el OS, para que cerrar se sienta igual en
 * cualquier sitio y funcione SIEMPRE:
 *   · `data-sin-arrastre`: ningún panel arrastrable empieza un gesto desde aquí,
 *     así que el clic nunca se lo roba una captura de puntero (la causa real de
 *     que la X de las cortinas Trinity no respondiera con ratón).
 *   · Área táctil ≥ 44 px siempre; el disco crece en pantallas táctiles.
 *   · `aria-label` y `title` (con el atajo, si lo hay) en español.
 *   · forwardRef + props nativas: sirve dentro de `<Dialog.Close asChild>`.
 */

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import estilos from "./boton-cerrar.module.css";

export interface BotonCerrarProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    /** Nombre accesible y rótulo: «Cerrar», «Cerrar el Centro de Control»… */
    etiqueta?: string;
    /** Color de acento del panel (tinte del cristal y del brillo). */
    acento?: string;
    /** Tamaño visual del disco (el área táctil nunca baja de 44 px). */
    tamano?: "sm" | "md" | "lg";
    /**
     * «arriba-derecha» / «arriba-izquierda»: esquina de un panel pegado al borde de
     * la pantalla (respeta muesca y barras del sistema). «interior»: esquina de un
     * contenedor flotante (diálogo, ventana). «libre»: en el flujo (cabeceras) o
     * colocado a mano con clases propias.
     */
    posicion?: "arriba-derecha" | "arriba-izquierda" | "interior" | "libre";
    /** Atajo de teclado que también cierra (se muestra en el rótulo): «Esc». */
    atajo?: string;
    variante?: "cristal" | "sutil";
}

export const BotonCerrar = React.forwardRef<HTMLButtonElement, BotonCerrarProps>(function BotonCerrar(
    {
        etiqueta = "Cerrar",
        acento,
        tamano = "md",
        posicion = "libre",
        atajo,
        variante = "cristal",
        className,
        style,
        type,
        ...resto
    },
    ref,
) {
    const titulo = atajo ? `${etiqueta} (${atajo})` : etiqueta;
    // En el flujo necesita `position: relative` para su área táctil; si quien lo usa
    // ya lo posiciona con clases (absolute/fixed…), no se le pisa.
    const posicionadoAMano = /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className ?? "");
    const estilo = acento ? ({ ...style, "--acento": acento } as React.CSSProperties) : style;
    return (
        <button
            ref={ref}
            type={type ?? "button"}
            aria-label={etiqueta}
            title={titulo}
            data-sin-arrastre=""
            data-boton-cerrar=""
            className={cn(
                estilos.boton,
                estilos[tamano],
                variante === "sutil" && estilos.sutil,
                posicion === "arriba-derecha" && estilos.arribaDerecha,
                posicion === "arriba-izquierda" && estilos.arribaIzquierda,
                posicion === "interior" && estilos.interior,
                posicion === "libre" && !posicionadoAMano && estilos.enFlujo,
                className,
            )}
            style={estilo}
            {...resto}
        >
            <X className={estilos.icono} aria-hidden="true" strokeWidth={2.25} />
        </button>
    );
});

export default BotonCerrar;
