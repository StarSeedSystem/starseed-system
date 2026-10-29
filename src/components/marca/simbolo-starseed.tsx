"use client";

/**
 * SÍMBOLO STARSEED · SVG oficial con siembra animada (DAN1024I · Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinta la geometría de `simbolo-geometria.ts` sin duplicarla. La siembra es la
 * de la biblioteca de movimiento StarSeed (`siembra()` y `respiracion()`, DSN1019G):
 * del punto a los discos, luego el ojo y por último el trazado de las facetas,
 * con las curvas y duraciones de la escena (600–900 ms) del ADN; al cerrar,
 * el símbolo entero respira (ciclo de 5 s), como en siembra.html. Solo se
 * animan `transform`, `opacity` y `clip-path`; con movimiento reducido cada
 * fase va en `opcionesReducidas` (1 ms, una pasada): el estado final se pinta
 * directo, sin moverse.
 */

import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import {
    opcionesReducidas,
    respiracion,
    siembra,
    type Animacion,
} from "@/lib/design/movimiento-starseed";
import { leerNivelMovimiento } from "@/lib/movimiento/nivel";
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

/** Final de la siembra del ADN (el trazado cierra a los 2300 ms); la respiración arranca a los 2400 ms. */
export const TOTAL_SIEMBRA_MS = 2400;

/** En SVG el origen del `transform` es por defecto la esquina (0, 0): los grupos animables lo centran en sí mismos. */
const CAJA_ANIMABLE: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };

/** `useLayoutEffect` solo en el cliente: la siembra arranca antes del primer cuadro visible. */
const useEfectoDeMaquetacion = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Traduce una Animación de la biblioteca a las opciones de `element.animate`. */
function reproducir(el: SVGElement | null, a: Animacion): Animation | null {
    if (!el || typeof el.animate !== "function") return null;
    const reducido = leerNivelMovimiento() === "minimo";
    const b = reducido ? opcionesReducidas(a) : a;
    return el.animate(b.keyframes as unknown as Keyframe[], {
        duration: b.duracionMs,
        easing: b.curva,
        delay: b.delayMs ?? 0,
        fill: b.relleno,
        direction: b.direccion,
        iterations: b.iteraciones,
    });
}

export function SimboloStarSeed({
    tamano = 160,
    siembra: siembraPedida = false,
    "aria-label": ariaLabel = "Símbolo de StarSeed",
    className,
}: SimboloStarSeedProps) {
    const semillaRef = useRef<SVGCircleElement | null>(null);
    const discosRef = useRef<SVGGElement | null>(null);
    const ojoRef = useRef<SVGGElement | null>(null);
    const facetasRef = useRef<SVGGElement | null>(null);
    const raizRef = useRef<SVGSVGElement | null>(null);
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");

    useEfectoDeMaquetacion(() => {
        if (!siembraPedida) return;
        const s = siembra();
        const lanzadas = [
            reproducir(semillaRef.current, s.brote),
            reproducir(discosRef.current, s.apertura),
            reproducir(ojoRef.current, s.mirar),
            reproducir(facetasRef.current, s.trazado),
        ];
        if (lanzadas.every((a) => a === null)) return; // sin WAAPI: el símbolo se pinta terminado
        // Al terminar la siembra, el símbolo completo respira (siembra.html), solo
        // cuando puede moverse: con movimiento reducido ya no queda retardo.
        if (leerNivelMovimiento() === "minimo") return;
        const r = respiracion();
        const respirar = raizRef.current && typeof raizRef.current.animate === "function"
            ? raizRef.current.animate(r.keyframes as unknown as Keyframe[], {
                  duration: r.duracionMs, easing: r.curva, direction: r.direccion,
                  iterations: r.iteraciones, delay: TOTAL_SIEMBRA_MS, fill: "both",
              })
            : null;
        return () => {
            respirar?.cancel();
        };
    }, [siembraPedida]);

    return (
        <svg
            ref={raizRef}
            role="img"
            aria-label={ariaLabel}
            viewBox="0 0 400 400"
            width={tamano}
            height={tamano}
            className={cn("block", className)}
            style={siembraPedida ? CAJA_ANIMABLE : undefined}
            data-simbolo="starseed"
            data-siembra={siembraPedida}
        >
            <defs>
                <clipPath id={`lente-${id}`}><path d={RUTAS.lente} /></clipPath>
            </defs>

            {/* 1 · la semilla: un punto que brota y queda oculta por los discos. */}
            <circle ref={semillaRef} cx={SEMILLA.cx} cy={SEMILLA.cy} r={SEMILLA.r} fill={COLORES.brillo} style={CAJA_ANIMABLE} />

            {/* 2 · los dos discos, cada uno partido por la vertical del centro. */}
            <g ref={discosRef} style={CAJA_ANIMABLE}>
                <path d={RUTAS.discoArribaIzquierda} fill={COLORES.discos.arribaIzquierda} />
                <path d={RUTAS.discoArribaDerecha} fill={COLORES.discos.arribaDerecha} />
                <path d={RUTAS.discoAbajoIzquierda} fill={COLORES.discos.abajoIzquierda} />
                <path d={RUTAS.discoAbajoDerecha} fill={COLORES.discos.abajoDerecha} />
            </g>

            {/* 3 · las 12 facetas del rombo, trazadas de izquierda a derecha. */}
            <g ref={facetasRef} style={CAJA_ANIMABLE}>
                {FACETAS.map((faceta) => (
                    <path key={faceta.id} d={faceta.d} fill={faceta.color} />
                ))}
            </g>

            {/* 4 · el ojo: la lente en gris, el blanco dentro de su círculo y la pupila. */}
            <g ref={ojoRef} style={CAJA_ANIMABLE}>
                <path d={RUTAS.lente} fill={COLORES.ojo} />
                <g clipPath={`url(#lente-${id})`}>
                    <circle cx={OJO.cx} cy={OJO.cy} r={OJO.r} fill="#FFFFFF" />
                </g>
                <circle cx={PUPILA.cx} cy={PUPILA.cy} r={PUPILA.r} fill={COLORES.pupila} />
                <circle cx={BRILLO.cx} cy={BRILLO.cy} r={BRILLO.r} fill={COLORES.brillo} />
            </g>
        </svg>
    );
}

export default SimboloStarSeed;
