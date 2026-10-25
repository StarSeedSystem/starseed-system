"use client";

/**
 * SÍMBOLO STARSEED · componente de marca
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinta el símbolo oficial desde `simbolo-geometria.ts`. Con `siembra` lo
 * construye en ≈2400 ms (punto → círculos → ojo → facetas) con los tokens de
 * `movimiento.ts`, animando solo `transform` y `opacity`; con
 * `prefers-reduced-motion` salta directo al estado final sin moverse.
 */

import { useEffect, useRef, useState } from "react";
import { CURVA, DURACION, escalonar } from "@/lib/design/movimiento";
import { LIENZO, OJO, caminosDiscos, facetas, rutaLente, rutaRombo } from "@/lib/design/simbolo-geometria";

interface SimboloStarSeedProps {
    /** Tamaño en píxeles (el lienzo interno es 400 × 400). */
    tamano: number;
    /** Siembra: el símbolo se construye por fases; false = completo de una vez. */
    siembra?: boolean;
    /** Etiqueta accesible del símbolo. */
    "aria-label"?: string;
}

/** Última fase de la siembra: todo visible (sin mutaciones tras el final). */
const FASE_FINAL = 3;

/** Momento en el que arranca cada fase, según los tokens (ms acumulados). */
const ARRANQUES = [
    0,
    DURACION.pausado + DURACION.normal,
    DURACION.escena * 2 + DURACION.normal,
    DURACION.escena * 3 + DURACION.normal,
] as const;

export function SimboloStarSeed({
    tamano,
    siembra = false,
    "aria-label": etiqueta = "Símbolo StarSeed",
}: SimboloStarSeedProps) {
    const [fase, setFase] = useState(() => (siembra ? 0 : FASE_FINAL));
    const plazos = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
        if (!siembra) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) {
            setFase(FASE_FINAL);
            return;
        }
        plazos.current = ARRANQUES.slice(1).map((ms, i) =>
            setTimeout(() => setFase(i + 1), ms),
        );
        return () => {
            plazos.current.forEach(clearTimeout);
            plazos.current = [];
        };
    }, [siembra]);

    const encendido = (umbral: number) => (fase >= umbral ? 1 : 0);
    const transicion = `opacity ${DURACION.escena}ms ${CURVA.suave}`;
    const discos = caminosDiscos();
    const piezas = facetas();

    return (
        <svg
            role="img"
            aria-label={etiqueta}
            width={tamano}
            height={tamano}
            viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
            data-fase={fase}
        >
            {/* Punto semilla solo durante la siembra (la pupila lo cubre al final). */}
            <circle
                cx={LIENZO.centroX}
                cy={LIENZO.centroY}
                r={9}
                fill={OJO.pupila.hex}
                opacity={siembra ? encendido(0) : 0}
                style={{ transform: `scale(${0.2 + 0.8 * encendido(0)})`, transition: `${DURACION.pausado}ms ${CURVA.elastico}` }}
            />
            <g data-fase="discos" style={{ opacity: encendido(1), transition: transicion }}>
                {discos.map((d) => (
                    <path key={d.id} d={d.camino} fill={d.hex} />
                ))}
            </g>
            <g data-fase="facetas" style={{ opacity: encendido(3), transition: transicion }}>
                {piezas.map((f, i) => (
                    <path
                        key={f.id}
                        d={f.camino}
                        fill={f.hex}
                        style={{ transitionDelay: `${escalonar(i, 40, 240)}ms` }}
                    />
                ))}
            </g>
            <g data-fase="ojo" style={{ opacity: encendido(2), transition: transicion }}>
                <path d={rutaLente()} fill={OJO.parpado} />
                <clipPath id="simbolo-ojo-recorte">
                    <path d={rutaLente()} />
                </clipPath>
                <g clipPath="url(#simbolo-ojo-recorte)">
                    <circle cx={OJO.blanco.centro.x} cy={OJO.blanco.centro.y} r={OJO.blanco.radio} fill="#FFFFFF" />
                    <circle cx={OJO.pupila.centro.x} cy={OJO.pupila.centro.y} r={OJO.pupila.radio} fill={OJO.pupila.hex} />
                    <circle cx={OJO.brillo.centro.x} cy={OJO.brillo.centro.y} r={OJO.brillo.radio} fill={OJO.brillo.hex} />
                </g>
                <path d={rutaRombo()} fill="none" stroke={OJO.pupila.hex} strokeWidth={1.618} strokeOpacity={0.35} />
            </g>
        </svg>
    );
}

export default SimboloStarSeed;
