"use client";

import { motion } from "framer-motion";
import type { TableroTresEnRaya } from "@/lib/vivo/juegos/tres-en-raya";
import { etiquetaAsiento } from "@/lib/vivo/juegos/asientos";
import { estilos as s, useSinAnimacion } from "./comun";

const NOMBRES_FILA = ["arriba", "en medio", "abajo"];
const NOMBRES_COL = ["a la izquierda", "en el centro", "a la derecha"];

function Marca({ asiento, animar }: { asiento: 0 | 1; animar: boolean }) {
    const color = etiquetaAsiento("tres-en-raya", asiento).color;
    const trazo = { stroke: color, strokeWidth: 11, strokeLinecap: "round" as const, fill: "none" };
    const anim = (retraso = 0) =>
        animar
            ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.24, delay: retraso, ease: "easeOut" as const } }
            : {};
    return (
        <svg viewBox="0 0 100 100" className={s.marcaSvg} aria-hidden="true" focusable="false" style={{ filter: `drop-shadow(0 0 8px ${color}99)` }}>
            {asiento === 0 ? (
                <>
                    <motion.path d="M24 24 L76 76" {...trazo} {...anim(0)} />
                    <motion.path d="M76 24 L24 76" {...trazo} {...anim(0.12)} />
                </>
            ) : (
                <motion.circle cx="50" cy="50" r="28" {...trazo} {...anim(0)} />
            )}
        </svg>
    );
}

export interface PropsTableroTres {
    tablero: TableroTresEnRaya;
    /** ¿Puedo jugar ahora (mi turno, partida en curso, con permiso)? */
    activo: boolean;
    alJugar: (casilla: number) => void;
}

export function TableroTres({ tablero, activo, alJugar }: PropsTableroTres) {
    const sinAnimacion = useSinAnimacion();
    const hayLinea = tablero.linea.length > 0;
    return (
        <div className={s.tres} role="grid" aria-label="Tablero de tres en raya">
            {tablero.c.map((v, i) => {
                const fila = Math.floor(i / 3);
                const col = i % 3;
                const nombre = `Casilla ${NOMBRES_FILA[fila]} ${NOMBRES_COL[col]}`;
                const estado = v === null ? "vacía" : `marca ${etiquetaAsiento("tres-en-raya", v).nombre}`;
                const gana = tablero.linea.includes(i);
                return (
                    <button
                        key={i}
                        type="button"
                        role="gridcell"
                        className={`${s.celdaTres} ${gana ? s.celdaGana : ""} ${hayLinea && !gana ? s.celdaApagada : ""}`}
                        disabled={!activo || v !== null}
                        onClick={() => alJugar(i)}
                        aria-label={`${nombre}, ${estado}`}
                    >
                        {v !== null && <Marca asiento={v} animar={!sinAnimacion} />}
                    </button>
                );
            })}
        </div>
    );
}
