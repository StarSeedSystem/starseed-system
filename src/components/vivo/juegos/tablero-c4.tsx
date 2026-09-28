"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { COLUMNAS_C4, FILAS_C4, filaLibre, type TableroConecta4 } from "@/lib/vivo/juegos/conecta4";
import { etiquetaAsiento } from "@/lib/vivo/juegos/asientos";
import { estilos as s, useSinAnimacion } from "./comun";

export interface PropsTableroC4 {
    tablero: TableroConecta4;
    activo: boolean;
    alJugar: (columna: number) => void;
}

export function TableroC4({ tablero, activo, alJugar }: PropsTableroC4) {
    const sinAnimacion = useSinAnimacion();
    const [encima, setEncima] = useState<number | null>(null);
    const previa = useRef<TableroConecta4["c"]>(tablero.c);

    // La ficha que acaba de caer (si solo hay una casilla nueva respecto al último dibujo).
    const nuevas: number[] = [];
    tablero.c.forEach((v, i) => {
        if (v !== null && previa.current[i] === null) nuevas.push(i);
    });
    const caida = nuevas.length === 1 ? nuevas[0] : -1;
    useEffect(() => {
        previa.current = tablero.c;
    }, [tablero.c]);

    const columnas = Array.from({ length: COLUMNAS_C4 }, (_, col) => col);
    return (
        <div className={s.c4} role="group" aria-label="Tablero de Conecta 4">
            {columnas.map((col) => {
                const libre = filaLibre(tablero.c, col);
                const llena = libre < 0;
                const fantasma = activo && encima === col && !llena;
                return (
                    <button
                        key={col}
                        type="button"
                        className={s.columna}
                        disabled={!activo || llena}
                        onClick={() => alJugar(col)}
                        onMouseEnter={() => setEncima(col)}
                        onMouseLeave={() => setEncima((c) => (c === col ? null : c))}
                        onFocus={() => setEncima(col)}
                        onBlur={() => setEncima((c) => (c === col ? null : c))}
                        aria-label={llena ? `Columna ${col + 1}, llena` : `Soltar ficha en la columna ${col + 1}, quedan ${FILAS_C4 - libre} huecos`}
                    >
                        {Array.from({ length: FILAS_C4 }, (_, fila) => {
                            const i = fila * COLUMNAS_C4 + col;
                            const v = tablero.c[i];
                            const gana = tablero.linea.includes(i);
                            const color = v === null ? null : etiquetaAsiento("conecta-4", v).color;
                            const esFantasma = fantasma && fila === libre;
                            return (
                                <span key={fila} className={s.hueco}>
                                    <span className={s.agujero}>
                                        {v !== null && (
                                            <motion.span
                                                className={`${s.discoFicha} ${gana ? s.discoGana : ""}`}
                                                style={{ background: color ?? undefined }}
                                                initial={i === caida && !sinAnimacion ? { y: `${-(FILAS_C4 - fila + 1) * 105}%` } : false}
                                                animate={{ y: 0 }}
                                                transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.9 }}
                                            />
                                        )}
                                        {esFantasma && (
                                            <span
                                                className={s.discoFicha}
                                                style={{ background: etiquetaAsiento("conecta-4", tablero.turno).color, opacity: 0.35 }}
                                                aria-hidden="true"
                                            />
                                        )}
                                    </span>
                                </span>
                            );
                        })}
                    </button>
                );
            })}
        </div>
    );
}
