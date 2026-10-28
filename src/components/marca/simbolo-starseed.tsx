"use client";

/**
 * SÍMBOLO STARSEED · SVG oficial con siembra animada (DAN1024I · Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinta la geometría de `simbolo-geometria.ts` sin duplicarla. La siembra va del
 * punto a los círculos, luego el ojo y por último las facetas, en ~2400 ms, con
 * las duraciones y curvas de `movimiento.ts`. Solo se animan `transform` y
 * `opacity`; con `prefers-reduced-motion` se pinta directo el estado final.
 */

import type { CSSProperties } from "react";
import { useId } from "react";
import { CURVA, DURACION, escalonar } from "@/lib/design/movimiento";
import { BRILLO, COLORES, FACETAS, OJO, PUPILA, RUTAS, SEMILLA } from "@/lib/design/simbolo-geometria";
import { cn } from "@/lib/utils";

export interface SimboloStarSeedProps {
    /** Lado del SVG en píxeles; el símbolo es cuadrado. */
    tamano?: number;
    /** Enciende la siembra; si se omite, el símbolo se pinta terminado. */
    siembra?: boolean;
    /** Nombre accesible del símbolo. */
    "aria-label"?: string;
    className?: string;
}

/** Cronología de la siembra, con la voz de movimiento del OS. */
const FASES = {
    semilla: { retardo: 0, duracion: DURACION.pausado, curva: CURVA.elastico },
    discos: { retardo: 240, duracion: DURACION.escena, curva: CURVA.suave },
    ojo: { retardo: 720, duracion: DURACION.escena, curva: CURVA.suave },
    facetas: { retardo: 1200, duracion: DURACION.escena, curva: CURVA.entrada },
    brillo: { retardo: 1920, duracion: DURACION.escena, curva: CURVA.entrada },
} as const;

/** Final de la siembra: el último destello cierra a los 2400 ms. */
export const TOTAL_SIEMBRA_MS = 2400;

function animacion(nombre: string, retardo: number, duracion: number, curva: string): CSSProperties {
    return { animation: `${nombre} ${duracion}ms ${curva} ${retardo}ms both` };
}

const CSS = `
.ss-sim-disco,.ss-sim-ojo,.ss-sim-faceta,.ss-sim-semilla,.ss-sim-brillo{transform-box:fill-box;transform-origin:center}
@keyframes ss-sim-semilla{0%{opacity:0;transform:scale(.3)}60%,100%{opacity:1;transform:scale(1)}}
@keyframes ss-sim-disco{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:none}}
@keyframes ss-sim-ojo{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes ss-sim-faceta{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes ss-sim-brillo{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ss-sim-disco,.ss-sim-ojo,.ss-sim-faceta,.ss-sim-semilla,.ss-sim-brillo{animation:none!important}}
`;

export function SimboloStarSeed({
    tamano = 160,
    siembra = false,
    "aria-label": ariaLabel = "Símbolo de StarSeed",
    className,
}: SimboloStarSeedProps) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const animar = (fase: keyof typeof FASES, nombre: string, indice = 0): CSSProperties | undefined => {
        if (!siembra) return undefined;
        const { retardo, duracion, curva } = FASES[fase];
        const espera = fase === "facetas" ? retardo + escalonar(indice, 60, 240) : retardo;
        return animacion(nombre, espera, duracion, curva);
    };

    return (
        <svg
            role="img"
            aria-label={ariaLabel}
            viewBox="0 0 400 400"
            width={tamano}
            height={tamano}
            className={cn("block", className)}
            data-simbolo="starseed"
            data-siembra={siembra}
        >
            <style>{CSS}</style>
            <defs>
                <clipPath id={`lente-${id}`}><path d={RUTAS.lente} /></clipPath>
            </defs>

            {/* 1 · la semilla: un punto que los discos terminan tapando. */}
            <circle cx={SEMILLA.cx} cy={SEMILLA.cy} r={SEMILLA.r} fill={COLORES.brillo} className="ss-sim-semilla" style={animar("semilla", "ss-sim-semilla")} />

            {/* 2 · los dos discos, cada uno partido por la vertical del centro. */}
            <g className="ss-sim-disco" style={animar("discos", "ss-sim-disco")}>
                <path d={RUTAS.discoArribaIzquierda} fill={COLORES.discos.arribaIzquierda} />
                <path d={RUTAS.discoArribaDerecha} fill={COLORES.discos.arribaDerecha} />
                <path d={RUTAS.discoAbajoIzquierda} fill={COLORES.discos.abajoIzquierda} />
                <path d={RUTAS.discoAbajoDerecha} fill={COLORES.discos.abajoDerecha} />
            </g>

            {/* 3 · las 12 facetas del rombo, en cascada. */}
            {FACETAS.map((faceta, i) => (
                <path
                    key={faceta.id}
                    d={faceta.d}
                    fill={faceta.color}
                    className="ss-sim-faceta"
                    style={animar("facetas", "ss-sim-faceta", i)}
                />
            ))}

            {/* 4 · el ojo: la lente en gris, el blanco dentro de su círculo y la pupila. */}
            <g className="ss-sim-ojo" style={animar("ojo", "ss-sim-ojo")}>
                <path d={RUTAS.lente} fill={COLORES.ojo} />
                <g clipPath={`url(#lente-${id})`}>
                    <circle cx={OJO.cx} cy={OJO.cy} r={OJO.r} fill="#FFFFFF" />
                </g>
                <circle cx={PUPILA.cx} cy={PUPILA.cy} r={PUPILA.r} fill={COLORES.pupila} />
                <circle cx={BRILLO.cx} cy={BRILLO.cy} r={BRILLO.r} fill={COLORES.brillo} className="ss-sim-brillo" style={animar("brillo", "ss-sim-brillo")} />
            </g>
        </svg>
    );
}

export default SimboloStarSeed;
