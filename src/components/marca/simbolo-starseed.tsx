"use client";

/**
 * SIMBOLO STARSEED — componente SVG del símbolo oficial (DAN1024I)
 * ───────────────────────────────────────────────────────────────
 * Pinta la geometría de `src/lib/design/simbolo-geometria.ts`. Con
 * `siembra` dibuja punto → discos → ojo → facetas en ~2400 ms con los
 * tokens de `movimiento.ts` (única fuente de duraciones y curvas);
 * solo se animan `transform` y `opacity`. Con `prefers-reduced-motion`
 * no hay animación: queda el estado final sin moverse.
 */

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { CURVA, DURACION, escalonar } from "@/lib/design/movimiento";
import {
    DISCOS,
    FACETAS,
    LIENZO,
    OJO,
    rutaLente,
    rutaMitadDisco,
    rutaMitadFaceta,
} from "@/lib/design/simbolo-geometria";

interface SimboloStarseedProps {
    /** Tamaño en píxeles (el lienzo es cuadrado). */
    tamano?: number;
    /** Siembra animada: la marca se desea Verdad. Añadir a todo el destino. */
    siembra?: boolean;
    /** Descripción accesible del símbolo. */
    ariaLabel?: string;
    className?: string;
}

/** Retardos de la siembra, derivados de los tokens de movimiento (3·escena+660+300 ≈ 2400 ms). */
const ESCENA = DURACION.escena;
const PAUSA = DURACION.pausado;
const RETARDOS = {
    punto: 0,
    discos: ESCENA,
    ojo: 2 * ESCENA,
    facetas: 3 * ESCENA,
} as const;
/** Escalonado de las facetas: paso = 90 ms y tope 660 ms, con la pausa final exacta. */
const PASO_FACETA = DURACION.instantaneo;
const TOPE_FACETA = 2 * ESCENA - PAUSA;

/** @keyframes compartido una vez por instancia: solo entrada por opacity + scale. */
const CSS_SIEMBRA =
    "@keyframes simbolo-surgir{from{opacity:0;transform:scale(0.6)}}";

export const SimboloStarseed = ({
    tamano = 48,
    siembra = false,
    ariaLabel = "Símbolo StarSeed",
    className,
}: SimboloStarseedProps): ReactNode => {
    const [reducido, setReducido] = useState(false);
    const idLente = useId();

    useEffect(() => {
        if (!siembra) return;
        const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
        const aplicar = () => setReducido(consulta.matches);
        aplicar();
        consulta.addEventListener("change", aplicar);
        return () => consulta.removeEventListener("change", aplicar);
    }, [siembra]);

    /** Estilo de animación de un grupo; none si no hay siembra o hay movimiento reducido. */
    const estiloAnim = (retardoMs: number): CSSProperties | undefined => {
        if (!siembra || reducido) return undefined;
        return {
            animation: `simbolo-surgir ${PAUSA}ms ${CURVA.entrada} both`,
            animationDelay: `${retardoMs}ms`,
            transformBox: "fill-box",
            transformOrigin: "center",
        };
    };

    return (
        <svg
            width={tamano}
            height={tamano}
            viewBox={`0 0 ${LIENZO} ${LIENZO}`}
            className={className}
            role="img"
            aria-label={ariaLabel}
        >
            <defs>
                <style>{siembra ? CSS_SIEMBRA : undefined}</style>
                <clipPath id={idLente}>
                    <path d={rutaLente()} />
                </clipPath>
            </defs>
            {/* Discos de la vesica: mitad oscura a la izquierda, clara a la derecha */}
            <g style={estiloAnim(RETARDOS.discos)}>
                {DISCOS.map((d) => (
                    <g key={d.id}>
                        <path d={rutaMitadDisco(d, "izquierda")} fill={d.izquierda} />
                        <path d={rutaMitadDisco(d, "derecha")} fill={d.derecha} />
                    </g>
                ))}
            </g>
            {/* El ojo: lente con su blanco dentro de la lente; la pupila es el punto */}
            <g style={estiloAnim(RETARDOS.ojo)}>
                <path d={rutaLente()} fill={OJO.color} />
                <g clipPath={`url(#${idLente})`}>
                    <circle
                        cx={OJO.blanco.centro.x}
                        cy={OJO.blanco.centro.y}
                        r={OJO.blanco.r}
                        fill={OJO.blanco.color}
                    />
                </g>
            </g>
            {/* Facetas del rombo, dos triángulos equiláteros: cascada de la siembra */}
            <g data-facetas>
                {FACETAS.map((f) => (
                    <g
                        key={f.id}
                        data-faceta={f.lado}
                        style={estiloAnim(
                            RETARDOS.facetas + escalonar(f.indice, PASO_FACETA, TOPE_FACETA),
                        )}
                    >
                        <path d={rutaMitadFaceta(f, "izquierda")} fill={f.colorIzquierda} />
                        <path d={rutaMitadFaceta(f, "derecha")} fill={f.colorDerecha} />
                    </g>
                ))}
            </g>
            {/* El punto: pupila #272525 con su brillo blanco, primera pieza en nacer */}
            <g data-punto style={estiloAnim(RETARDOS.punto)}>
                <circle
                    cx={OJO.pupila.centro.x}
                    cy={OJO.pupila.centro.y}
                    r={OJO.pupila.r}
                    fill={OJO.pupila.color}
                />
                <circle
                    cx={OJO.brillo.centro.x}
                    cy={OJO.brillo.centro.y}
                    r={OJO.brillo.r}
                    fill={OJO.brillo.color}
                />
            </g>
        </svg>
    );
};
