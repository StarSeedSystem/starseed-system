"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Handshake, RotateCw } from "lucide-react";
import type { TableroAjedrez as EstadoTableroAjedrez } from "@/lib/vivo/juegos/ajedrez-juego";
import { Boton, estilos as s } from "./comun";
import { Pieza } from "./piezas-ajedrez";
import type { TipoPieza } from "./piezas-formas";
import { TableroAjedrez } from "./tablero-ajedrez";

const INICIAL: Record<TipoPieza, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const VALOR: Record<TipoPieza, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDEN_CAPTURAS: TipoPieza[] = ["q", "r", "b", "n", "p"];
const TIPOS: TipoPieza[] = ["p", "n", "b", "r", "q", "k"];

/** Piezas que quedan de cada bando y material (sin rey). */
export function materialDe(t: readonly number[]): { cuenta: [Record<TipoPieza, number>, Record<TipoPieza, number>]; valor: [number, number] } {
    const nuevo = () => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }) as Record<TipoPieza, number>;
    const cuenta: [Record<TipoPieza, number>, Record<TipoPieza, number>] = [nuevo(), nuevo()];
    const valor: [number, number] = [0, 0];
    for (const v of t) {
        if (!v) continue;
        const bando = v > 0 ? 0 : 1;
        const tipo = TIPOS[Math.abs(v) - 1];
        cuenta[bando][tipo] += 1;
        valor[bando] += VALOR[tipo];
    }
    return { cuenta, valor };
}

function Capturadas({ por, material }: { por: 0 | 1; material: ReturnType<typeof materialDe> }) {
    // Las piezas que `por` se ha llevado son las del otro bando que faltan.
    const rival = por === 0 ? 1 : 0;
    const piezas: TipoPieza[] = [];
    for (const tipo of ORDEN_CAPTURAS) {
        const faltan = Math.max(0, INICIAL[tipo] - material.cuenta[rival][tipo]);
        for (let i = 0; i < faltan; i++) piezas.push(tipo);
    }
    const ventaja = material.valor[por] - material.valor[rival];
    return (
        <div className={s.capturas} aria-label={`Piezas capturadas por ${por === 0 ? "las blancas" : "las negras"}`}>
            {piezas.map((t, i) => (
                <Pieza key={i} tipo={t} bando={rival} className={s.capturaMini} />
            ))}
            {ventaja > 0 && <span className={s.ventaja}>+{ventaja}</span>}
        </div>
    );
}

export interface PropsEscenarioAjedrez {
    tablero: EstadoTableroAjedrez;
    activo: boolean;
    /** Asientos que ocupo (0 blancas, 1 negras). */
    misAsientos: number[];
    alJugar: (uci: string) => void;
}

export function EscenarioAjedrez({ tablero, activo, misAsientos, alJugar }: PropsEscenarioAjedrez) {
    const soloNegras = misAsientos.length === 1 && misAsientos[0] === 1;
    const [giroManual, setGiroManual] = useState<boolean | null>(null);
    const girado = giroManual ?? soloNegras;
    const bandoPropio: 0 | 1 | null = misAsientos.length === 1 ? (misAsientos[0] as 0 | 1) : null;
    const material = useMemo(() => materialDe(tablero.pos.t), [tablero.pos.t]);
    const arriba: 0 | 1 = girado ? 0 : 1;
    const abajo: 0 | 1 = girado ? 1 : 0;

    return (
        <>
            <div style={{ width: "min(100%, 780px)" }}>
                <Capturadas por={arriba} material={material} />
            </div>
            <TableroAjedrez tablero={tablero} activo={activo} bandoPropio={bandoPropio} girado={girado} alJugar={alJugar} />
            <div style={{ width: "min(100%, 780px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Capturadas por={abajo} material={material} />
                <Boton onClick={() => setGiroManual(!girado)} icono={<RotateCw size={16} aria-hidden="true" />} aria-label="Girar el tablero">
                    Girar tablero
                </Boton>
            </div>
        </>
    );
}

export interface PropsLateralAjedrez {
    tablero: EstadoTableroAjedrez;
    misAsientos: number[];
    enCurso: boolean;
    puedeActuar: boolean;
    enviar: (k: string, d?: Record<string, string>) => void;
    rendirse: () => void;
}

/** Lista de jugadas y acciones de la partida (rendirse, tablas). */
export function LateralAjedrez({ tablero, misAsientos, enCurso, puedeActuar, enviar, rendirse }: PropsLateralAjedrez) {
    const [confirmando, setConfirmando] = useState(false);
    const lista = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = lista.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [tablero.san.length]);
    useEffect(() => {
        if (!enCurso) setConfirmando(false);
    }, [enCurso]);

    const juego = misAsientos.length > 0;
    const controloAmbos = misAsientos.length === 2;
    const pares: [string, string | undefined][] = [];
    for (let i = 0; i < tablero.san.length; i += 2) pares.push([tablero.san[i], tablero.san[i + 1]]);
    const oferta = tablero.oferta;
    const meOfrecieron = oferta !== null && misAsientos.includes(oferta === 0 ? 1 : 0);
    const oferteYo = oferta !== null && misAsientos.includes(oferta);

    return (
        <section className={`${s.vidrio} ${s.panel}`} aria-label="Jugadas y acciones">
            <div className={s.panelTitulo}>
                <span className={s.rotulo}>Jugadas</span>
                <span className={s.nota}>{tablero.san.length === 0 ? "Aún sin jugadas" : `${tablero.san.length} jugadas`}</span>
            </div>
            <div ref={lista} className={s.jugadas} style={{ overflowY: "auto", maxHeight: 250 }} role="list" aria-label="Lista de jugadas">
                {pares.map(([b, n], i) => {
                    const ultima = i === pares.length - 1;
                    return (
                        <div key={i} role="listitem" style={{ display: "contents" }}>
                            <span className={s.jugadaNum}>{i + 1}.</span>
                            <span className={`${s.jugada} ${ultima && n === undefined ? s.jugadaUltima : ""}`}>{b}</span>
                            <span className={`${s.jugada} ${ultima && n !== undefined ? s.jugadaUltima : ""}`}>{n ?? ""}</span>
                        </div>
                    );
                })}
            </div>

            {enCurso && juego && puedeActuar && (
                <div className={s.menuVertical}>
                    {!controloAmbos && oferta === null && (
                        <Boton onClick={() => enviar("tablas", { a: "ofrecer" })} icono={<Handshake size={16} aria-hidden="true" />}>
                            Ofrecer tablas
                        </Boton>
                    )}
                    {meOfrecieron && (
                        <div className={s.confirmar} role="group" aria-label="Oferta de tablas">
                            <strong>Tu rival te ofrece tablas</strong>
                            <div className={s.filaBotones}>
                                <Boton variante="primario" onClick={() => enviar("tablas", { a: "aceptar" })}>
                                    Aceptar tablas
                                </Boton>
                                <Boton onClick={() => enviar("tablas", { a: "rechazar" })}>Rechazar</Boton>
                            </div>
                        </div>
                    )}
                    {oferteYo && !meOfrecieron && <p className={s.nota}>Has ofrecido tablas. Esperando la respuesta de tu rival.</p>}
                    {!confirmando ? (
                        <Boton variante="peligro" onClick={() => setConfirmando(true)} icono={<Flag size={16} aria-hidden="true" />}>
                            Rendirme
                        </Boton>
                    ) : (
                        <div className={s.confirmar} role="group" aria-label="Confirmar rendición">
                            <strong>¿Seguro que quieres rendirte?</strong>
                            <div className={s.filaBotones}>
                                <Boton
                                    variante="peligro"
                                    onClick={() => {
                                        setConfirmando(false);
                                        rendirse();
                                    }}
                                >
                                    Sí, rendirme
                                </Boton>
                                <Boton onClick={() => setConfirmando(false)}>Seguir jugando</Boton>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
