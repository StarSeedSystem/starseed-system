"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import {
    aUci,
    movimientosLegales,
    nombreCasilla,
    DAMA,
    TORRE,
    ALFIL,
    CABALLO,
    type MovAjedrez,
} from "@/lib/vivo/juegos/ajedrez";
import type { TableroAjedrez as EstadoTableroAjedrez } from "@/lib/vivo/juegos/ajedrez-juego";
import { estilos as s, useSinAnimacion } from "./comun";
import { NOMBRE_PIEZA, Pieza, describirPieza, tipoDeValor } from "./piezas-ajedrez";
import type { TipoPieza } from "./piezas-formas";

const ARCHIVOS = "abcdefgh";
const OPCIONES_CORONACION: { valor: number; tipo: TipoPieza }[] = [
    { valor: DAMA, tipo: "q" },
    { valor: TORRE, tipo: "r" },
    { valor: ALFIL, tipo: "b" },
    { valor: CABALLO, tipo: "n" },
];

export interface PropsTableroAjedrez {
    tablero: EstadoTableroAjedrez;
    /** ¿Puedo mover ahora? (partida en curso, con permiso y me toca — o juego los dos lados). */
    activo: boolean;
    /** Si solo controlo un bando, cuál; null = controlo el que mueve. */
    bandoPropio: 0 | 1 | null;
    /** Tablero girado: las negras abajo. */
    girado: boolean;
    alJugar: (uci: string) => void;
}

export function TableroAjedrez({ tablero, activo, bandoPropio, girado, alJugar }: PropsTableroAjedrez) {
    const sinAnimacion = useSinAnimacion();
    const { pos, ultimo, jaque } = tablero;
    const [sel, setSel] = useState<number | null>(null);
    const [foco, setFoco] = useState<number | null>(null);
    const [coronando, setCoronando] = useState<{ movs: MovAjedrez[] } | null>(null);
    const refs = useRef<Map<number, HTMLButtonElement>>(new Map());
    const largoPrevio = useRef(tablero.san.length);

    const legales = useMemo(() => movimientosLegales(pos), [pos]);
    const destinos = useMemo(() => {
        const out = new Map<number, MovAjedrez[]>();
        if (sel === null) return out;
        for (const m of legales) {
            if (m.de !== sel) continue;
            const lista = out.get(m.a);
            if (lista) lista.push(m);
            else out.set(m.a, [m]);
        }
        return out;
    }, [legales, sel]);

    // Cada jugada nueva limpia la selección.
    useEffect(() => {
        setSel(null);
        setCoronando(null);
    }, [tablero.san.length]);
    useEffect(() => {
        largoPrevio.current = tablero.san.length;
    }, [tablero.san.length]);

    const animarUltima = !sinAnimacion && ultimo !== null && tablero.san.length === largoPrevio.current + 1;

    const orden = useMemo(() => {
        const out: number[] = [];
        for (let f = 0; f < 8; f++) {
            for (let c = 0; c < 8; c++) {
                const rango = girado ? f : 7 - f;
                const archivo = girado ? 7 - c : c;
                out.push(rango * 8 + archivo);
            }
        }
        return out;
    }, [girado]);

    const posVisual = (sq: number) => {
        const rango = sq >> 3;
        const archivo = sq & 7;
        return { fila: girado ? rango : 7 - rango, col: girado ? 7 - archivo : archivo };
    };

    const puedeElegir = (sq: number) => {
        const v = pos.t[sq];
        if (!activo || !v) return false;
        const bando = v > 0 ? 0 : 1;
        return bando === pos.turno && (bandoPropio === null || bandoPropio === bando);
    };

    const alClic = (sq: number) => {
        setFoco(sq);
        const movs = destinos.get(sq);
        if (sel !== null && movs && movs.length > 0) {
            if (movs.some((m) => m.promo)) {
                setCoronando({ movs });
                return;
            }
            alJugar(aUci(movs[0]));
            setSel(null);
            return;
        }
        if (sq === sel) {
            setSel(null);
            return;
        }
        setSel(puedeElegir(sq) ? sq : null);
    };

    const alTeclas = (e: KeyboardEvent<HTMLDivElement>) => {
        const objetivo = (e.target as HTMLElement).closest<HTMLElement>("[data-sq]");
        if (!objetivo) return;
        const sq = Number(objetivo.dataset.sq);
        const i = orden.indexOf(sq);
        let nuevo = i;
        if (e.key === "ArrowRight" && i % 8 < 7) nuevo = i + 1;
        else if (e.key === "ArrowLeft" && i % 8 > 0) nuevo = i - 1;
        else if (e.key === "ArrowDown" && i < 56) nuevo = i + 8;
        else if (e.key === "ArrowUp" && i >= 8) nuevo = i - 8;
        else if (e.key === "Escape") {
            setSel(null);
            setCoronando(null);
            return;
        } else return;
        e.preventDefault();
        const destino = orden[nuevo];
        setFoco(destino);
        refs.current.get(destino)?.focus();
    };

    const focoEfectivo = foco ?? sel ?? orden[girado ? 11 : 52];
    const bandoCoronacion: 0 | 1 = pos.turno;

    return (
        <div className={s.marcoAjedrez}>
            <div className={s.ajedrez} role="group" aria-label="Tablero de ajedrez" onKeyDown={alTeclas}>
                {orden.map((sq) => {
                    const v = pos.t[sq];
                    const pieza = tipoDeValor(v);
                    const { fila, col } = posVisual(sq);
                    const clara = ((sq >> 3) + (sq & 7)) % 2 === 1;
                    const movs = destinos.get(sq);
                    const esDestino = !!movs && movs.length > 0;
                    const captura = esDestino && movs.some((m) => m.captura);
                    const esRey = pieza?.tipo === "k" && pieza.bando === pos.turno;
                    const enJaque = jaque && esRey;
                    const esUltimo = ultimo !== null && (ultimo.de === sq || ultimo.a === sq);
                    const animar = animarUltima && ultimo !== null && ultimo.a === sq;
                    let inicio: { x: string; y: string } | undefined;
                    if (animar && ultimo) {
                        const d = posVisual(ultimo.de);
                        inicio = { x: `${(d.col - col) * 100}%`, y: `${(d.fila - fila) * 100}%` };
                    }
                    const etiqueta = [
                        nombreCasilla(sq),
                        pieza ? describirPieza(pieza.tipo, pieza.bando) : "vacía",
                        sq === sel ? "seleccionada" : "",
                        esDestino ? (captura ? "captura posible" : "movimiento posible") : "",
                        enJaque ? "rey en jaque" : "",
                    ]
                        .filter(Boolean)
                        .join(", ");
                    return (
                        <button
                            key={sq}
                            type="button"
                            ref={(el) => {
                                if (el) refs.current.set(sq, el);
                                else refs.current.delete(sq);
                            }}
                            data-sq={sq}
                            tabIndex={sq === focoEfectivo ? 0 : -1}
                            className={[
                                s.casilla,
                                clara ? s.casillaClara : s.casillaOscura,
                                esUltimo ? s.casillaUltima : "",
                                sq === sel ? s.casillaSel : "",
                                enJaque ? s.casillaJaque : "",
                                esDestino ? (captura ? `${s.destino} ${s.destinoCaptura}` : s.destino) : "",
                            ].join(" ")}
                            style={animar ? { zIndex: 3 } : undefined}
                            aria-label={etiqueta}
                            aria-pressed={sq === sel}
                            onClick={() => alClic(sq)}
                        >
                            {col === 0 && (
                                <span className={`${s.coordenada} ${s.coordenadaFila}`} aria-hidden="true">
                                    {(sq >> 3) + 1}
                                </span>
                            )}
                            {fila === 7 && (
                                <span className={`${s.coordenada} ${s.coordenadaColumna}`} aria-hidden="true">
                                    {ARCHIVOS[sq & 7]}
                                </span>
                            )}
                            {pieza &&
                                (animar ? (
                                    <motion.span
                                        key={tablero.san.length}
                                        style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
                                        initial={inicio}
                                        animate={{ x: 0, y: 0 }}
                                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                    >
                                        <Pieza tipo={pieza.tipo} bando={pieza.bando} className={s.pieza} />
                                    </motion.span>
                                ) : (
                                    <Pieza tipo={pieza.tipo} bando={pieza.bando} className={s.pieza} />
                                ))}
                        </button>
                    );
                })}
            </div>

            {coronando && (
                <div className={s.coronacion} role="dialog" aria-modal="true" aria-label="Elige la pieza a la que corona el peón">
                    <div className={`${s.vidrio} ${s.coronacionCaja}`}>
                        <strong>Coronar el peón</strong>
                        <div className={s.coronacionOpciones}>
                            {OPCIONES_CORONACION.map((o) => {
                                const m = coronando.movs.find((x) => x.promo === o.valor);
                                if (!m) return null;
                                return (
                                    <button
                                        key={o.tipo}
                                        type="button"
                                        className={s.coronacionOpcion}
                                        aria-label={`Coronar a ${NOMBRE_PIEZA[o.tipo]}`}
                                        onClick={() => {
                                            alJugar(aUci(m));
                                            setCoronando(null);
                                            setSel(null);
                                        }}
                                    >
                                        <Pieza tipo={o.tipo} bando={bandoCoronacion} className={s.pieza} />
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" className={s.boton} onClick={() => setCoronando(null)}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
