"use client";

/**
 * SÍMBOLO OFICIAL DE STARSEED · componente de marca (Ola 1024D · MARCA)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente puro (sin `node:*`): pinta la geometría de simbolo-geometria.ts en
 * un SVG de 400 × 400. Duraciones y curvas: SOLO las de movimiento.ts.
 *
 * La siembra (punto → círculos → ojo → facetas) dura ~2 400 ms:
 * punto 150 ms en el centro, círculos desde 320 (escena 480), ojo desde 980
 * (escena 480) y facetas desde 1 680 con cascada de 40 ms (tope 240) y escena
 * 480 → la última acaba a 2 400 exactos. Con prefers-reduced-motion se ve el
 * estado final de golpe, sin pasos ni masks: solo `transform` y `opacity`.
 */

import { useEffect, useState, useId, type CSSProperties } from "react";
import {
    CURVA,
    DURACION,
    cssDe,
    escalonar,
    respetarMovimientoReducido,
} from "@/lib/design/movimiento";
import {
    CENTRO,
    DISCOS,
    FACETAS,
    LIENZO,
    OJO,
    rutaDisco,
    rutaFaceta,
    rutaLente,
} from "@/lib/design/simbolo-geometria";

/** Retardo (ms) con el que entra cada paso de la siembra. */
const RETRASO = {
    circulos: 320,
    ojo: 980,
    facetas: 1680,
} as const;

export interface PropsSimboloStarseed {
    /** Tamaño en px (cuadrado: el lienzo del símbolo es 400 × 400). */
    tamano: number;
    /** Anima la siembra (~2 400 ms); por defecto se muestra el estado final. */
    siembra?: boolean;
    /** Texto de accesibilidad del símbolo. */
    "aria-label"?: string;
}

type Paso = 0 | 1 | 2 | 3;
const PASO_FINAL: Paso = 3;

export function SimboloStarseed({
    tamano,
    siembra = false,
    "aria-label": etiqueta = "Símbolo de StarSeed",
}: PropsSimboloStarseed) {
    const [paso, setPaso] = useState<Paso>(siembra ? 0 : PASO_FINAL);
    const [reducido, setReducido] = useState(false);
    const idLente = `lente-${useId().replace(/:/g, "")}`;

    useEffect(() => {
        if (!siembra) {
            setPaso(PASO_FINAL);
            return;
        }
        const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReducido(consulta.matches);
        if (consulta.matches) {
            setPaso(PASO_FINAL);
            return;
        }
        const temporizadores = [
            window.setTimeout(() => setPaso(1), RETRASO.circulos),
            window.setTimeout(() => setPaso(2), RETRASO.ojo),
            window.setTimeout(() => setPaso(3), RETRASO.facetas),
        ];
        return () => temporizadores.forEach((t) => window.clearTimeout(t));
    }, [siembra]);

    /** Estilo de una capa de la siembra: solo `transform` y `opacity`. */
    const capa = (
        visible: boolean,
        duracionMs: number,
        curva: string,
        desde: string,
        retardoMs = 0,
    ): CSSProperties => {
        const tokens = respetarMovimientoReducido({ duracionMs, curva }, reducido);
        const demora = retardoMs ? ` ${retardoMs}ms` : "";
        return {
            opacity: visible || reducido ? 1 : 0,
            transform: visible || reducido ? undefined : desde,
            transformOrigin: `${CENTRO.x}px ${CENTRO.y}px`,
            transition: `opacity ${cssDe(tokens)}${demora}, transform ${cssDe(tokens)}${demora}`,
        };
    };

    return (
        <svg
            role="img"
            aria-label={etiqueta}
            width={tamano}
            height={tamano}
            viewBox={`0 0 ${LIENZO} ${LIENZO}`}
        >
            <g style={capa(paso >= 1, DURACION.escena, CURVA.entrada, "scale(0.86) translate(0px, 8px)")}>
                {DISCOS.map((disco) => (
                    <g key={disco.lado}>
                        <path d={rutaDisco(disco.lado, "izquierda")} fill={disco.colorIzquierda} />
                        <path d={rutaDisco(disco.lado, "derecha")} fill={disco.colorDerecha} />
                    </g>
                ))}
            </g>
            <g>
                {FACETAS.map((f) => (
                    <path
                        key={f.id}
                        d={rutaFaceta(f)}
                        fill={f.color}
                        style={capa(
                            paso >= 3,
                            DURACION.escena,
                            CURVA.entrada,
                            "scale(0.7)",
                            escalonar(FACETAS.indexOf(f), 40, 240),
                        )}
                    />
                ))}
            </g>
            <g style={capa(paso >= 2, DURACION.escena, CURVA.entrada, "scale(0.8)")}>
                <path d={rutaLente()} fill={OJO.baseColor} />
                <clipPath id={idLente}>
                    <path d={rutaLente()} />
                </clipPath>
                <circle
                    cx={OJO.blanco.cx}
                    cy={OJO.blanco.cy}
                    r={OJO.blanco.r}
                    fill={OJO.blanco.color}
                    clipPath={`url(#${idLente})`}
                />
                <circle cx={OJO.pupila.cx} cy={OJO.pupila.cy} r={OJO.pupila.r} fill={OJO.pupila.color} />
                <circle cx={OJO.brillo.cx} cy={OJO.brillo.cy} r={OJO.brillo.r} fill={OJO.brillo.color} />
            </g>
            <g style={capa(paso === 0, DURACION.rapido, CURVA.salida, "scale(0.4)")}>
                <circle cx={CENTRO.x} cy={CENTRO.y} r={7} fill={OJO.brillo.color} />
            </g>
        </svg>
    );
}

export default SimboloStarseed;

