"use client";

import { useState } from "react";
import { Brush, CircleDot, Crown, Hash, type LucideIcon } from "lucide-react";
import { JUEGOS_DISPONIBLES } from "@/lib/vivo/juegos/catalogo";
import type { Datos, IdJuego } from "@/lib/vivo/juegos/tipos";
import { Boton, estilos as s } from "./comun";

const ICONOS: Record<string, LucideIcon> = { Hash, CircleDot, Crown, Brush };
const SEGUNDOS = [45, 75, 120];
const VUELTAS = [1, 2, 3];

export interface PropsSelectorJuego {
    /** Texto del botón de confirmar («Crear sala», «Empezar con este juego»…). */
    etiquetaConfirmar: string;
    deshabilitado?: boolean;
    ocupado?: boolean;
    alConfirmar: (juego: IdJuego, opciones: Datos) => void;
}

/** Elige uno de los juegos (y, en el Dibujo-adivina, el tiempo y las vueltas). */
export function SelectorJuego({ etiquetaConfirmar, deshabilitado, ocupado, alConfirmar }: PropsSelectorJuego) {
    const [juego, setJuego] = useState<IdJuego>("tres-en-raya");
    const [segundos, setSegundos] = useState(75);
    const [vueltas, setVueltas] = useState(1);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className={s.tarjetas} role="radiogroup" aria-label="Elige un juego">
                {JUEGOS_DISPONIBLES.map((j) => {
                    const Icono = ICONOS[j.icono] ?? Hash;
                    const activo = j.id === juego;
                    return (
                        <button
                            key={j.id}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            className={`${s.tarjeta} ${activo ? s.tarjetaSel : ""}`}
                            style={{ ["--color-tarjeta" as string]: j.color }}
                            onClick={() => setJuego(j.id)}
                        >
                            <span className={s.icono} style={{ background: `${j.color}26`, boxShadow: `inset 0 0 0 1px ${j.color}66`, color: j.color }}>
                                <Icono size={24} aria-hidden="true" />
                            </span>
                            <h3 className={s.tarjetaNombre}>{j.nombre}</h3>
                            <span className={s.nota}>{j.descripcion}</span>
                            <span className={s.rotulo}>{j.jugadores}</span>
                        </button>
                    );
                })}
            </div>

            {juego === "dibujo" && (
                <div className={s.campo}>
                    <span className={s.rotulo}>Tiempo por dibujo</span>
                    <div className={s.opciones} role="radiogroup" aria-label="Tiempo por dibujo">
                        {SEGUNDOS.map((n) => (
                            <button key={n} type="button" role="radio" aria-checked={segundos === n} className={`${s.opcion} ss-redondo ${segundos === n ? s.opcionSel : ""}`} onClick={() => setSegundos(n)}>
                                {n} segundos
                            </button>
                        ))}
                    </div>
                    <span className={s.rotulo}>Veces que dibuja cada persona</span>
                    <div className={s.opciones} role="radiogroup" aria-label="Vueltas">
                        {VUELTAS.map((n) => (
                            <button key={n} type="button" role="radio" aria-checked={vueltas === n} className={`${s.opcion} ss-redondo ${vueltas === n ? s.opcionSel : ""}`} onClick={() => setVueltas(n)}>
                                {n === 1 ? "Una vez" : `${n} veces`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <Boton
                    variante="primario"
                    disabled={deshabilitado || ocupado}
                    onClick={() => alConfirmar(juego, juego === "dibujo" ? { segundos, vueltas } : {})}
                >
                    {ocupado ? "Un momento…" : etiquetaConfirmar}
                </Boton>
            </div>
        </div>
    );
}
