"use client";

/** SÍMBOLO STARSEED — LA MARCA OFICIAL (DAN1024I). Componente CLIENTE que pinta la
 * geometría pura de `simbolo-geometria.ts`. Solo transform y opacity, con los tokens
 * de `movimiento.ts` (la ÚNICA fuente de duraciones y curvas): siembra punto →
 * círculos → ojo → facetas en ~2.400 ms; con `prefers-reduced-motion` o sin siembra,
 * el estado final se pinta de golpe y nada se mueve. Sin `node:*`, red, disco ni reloj. */

import { useEffect, useId, useState, type CSSProperties } from "react";
import { CURVA, DURACION, cssDe, escalonar } from "@/lib/design/movimiento";
import {
    BLANCO_OJO, BRILLO, CENTRO, COLORES_OJO, DISCO_ABAJO, DISCO_ARRIBA, FACETAS, LIENZO,
    PUPILA, RUTA_LENS, rutaDeFaceta,
} from "@/lib/design/simbolo-geometria";

/** Retrasos de la siembra (ms) y cascada de las facetas. */
const ATRASO_DISCOS = 500;
const ATRASO_OJO = 1200;
const ATRASO_FACETAS = 1600;
const PASO_FACETAS = 75;
const TOPE_CASCADA = 400;

/** Propiedades del símbolo: tamaño en px, siembra animada y etiqueta accesible. */
export interface PropsSimbolo {
    /** Lado del lienzo cuadrado en px (escala proporcional). */
    tamano: number;
    /** Siembra animada (punto → círculos → ojo → facetas). Sin ella, estado final. */
    siembra?: boolean;
    /** Etiqueta accesible del gráfico. */
    ariaLabel?: string;
}

/** Estilo de una capa de la siembra: solo transform y opacity, con tokens del OS. */
function capa(activa: boolean, reducido: boolean, retrasoMs = 0): CSSProperties {
    return {
        opacity: activa ? 1 : 0,
        transform: activa ? "scale(1)" : "scale(0.82)",
        transformBox: "fill-box",
        transformOrigin: "center",
        transition: reducido
            ? undefined
            : `${cssDe({ duracionMs: DURACION.pausado, curva: CURVA.entrada })} ${retrasoMs}ms`,
    };
}

export default function SimboloStarSeed({
    tamano,
    siembra = true,
    ariaLabel = "Símbolo de StarSeed",
}: PropsSimbolo) {
    const [fase, setFase] = useState(0);
    const [reducido, setReducido] = useState(false);
    const idBlanco = useId();

    useEffect(() => {
        const rebaja = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (rebaja.matches) setReducido(true);
        if (rebaja.matches || !siembra) {
            // Movimiento reducido o siembra desactivada: estado final de golpe.
            setFase(3);
            return;
        }
        const temporales = [ATRASO_DISCOS, ATRASO_OJO, ATRASO_FACETAS].map((ms, i) =>
            window.setTimeout(() => setFase(i + 1), ms),
        );
        return () => temporales.forEach(clearTimeout);
    }, [siembra]);

    const activa = (k: number) => fase >= k;

    return (
        <svg
            data-testid="simbolo-starseed"
            width={tamano}
            height={tamano}
            viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
            role="img"
            aria-label={ariaLabel}
        >
            <defs>
                <clipPath id={idBlanco}>
                    <circle cx={BLANCO_OJO.cx} cy={BLANCO_OJO.cy} r={BLANCO_OJO.r} />
                </clipPath>
            </defs>
            {/* 1 · las 12 facetas: al fondo del símbolo y a la última en aparecer */}
            {FACETAS.map((f, i) => (
                <path
                    key={`${f.mitad}-${i}`}
                    d={rutaDeFaceta(f)}
                    fill={f.color}
                    style={capa(activa(3), reducido, escalonar(i, PASO_FACETAS, TOPE_CASCADA))}
                />
            ))}
            {/* 2 · los dos discos, la mitad izquierda la oscura */}
            {[DISCO_ARRIBA, DISCO_ABAJO].map((d) => (
                <g key={d.cy} style={capa(activa(1), reducido)}>
                    <circle cx={d.cx} cy={d.cy} r={d.r} fill={d.colorIzquierda} />
                    <path d={d.rutaDerecha} fill={d.colorDerecha} />
                </g>
            ))}
            {/* 3 · el ojo: lente gris, blanco recortado, pupila y su brillo */}
            <g style={capa(activa(2), reducido)}>
                <path d={RUTA_LENS} fill={COLORES_OJO.lente} />
                <path d={RUTA_LENS} fill={COLORES_OJO.blanco} clipPath={`url(#${idBlanco})`} />
                <circle cx={PUPILA.cx} cy={PUPILA.cy} r={PUPILA.r} fill={COLORES_OJO.pupila} />
                <circle cx={BRILLO.cx} cy={BRILLO.cy} r={BRILLO.r} fill={COLORES_OJO.brillo} />
            </g>
            {/* 0 · el punto de siembra: primero, y se retira cuando nace el ojo */}
            <circle
                cx={CENTRO.x}
                cy={CENTRO.y}
                r={7}
                fill={COLORES_OJO.blanco}
                style={capa(!reducido && fase === 0, reducido)}
            />
        </svg>
    );
}


