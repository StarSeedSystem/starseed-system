"use client";

import { Eye, Handshake, RotateCcw, Trophy } from "lucide-react";
import { etiquetaAsiento } from "@/lib/vivo/juegos/asientos";
import type { EstadoMesa } from "@/lib/vivo/juegos/mesa";
import { Boton, estilos as s } from "./comun";

/** «Te toca», «Turno de Ana (Blancas)», «Esperando…»: quién mueve ahora. */
export function IndicadorTurno({ estado, misAsientos }: { estado: EstadoMesa; misAsientos: number[] }) {
    if (estado.fin) return null;
    if (!estado.iniciada) {
        const faltan = estado.asientos.filter((a) => a === null).length;
        return (
            <div className={s.turno} style={{ background: "rgba(255,255,255,.07)" }} role="status">
                {faltan === 0 ? "Preparando la partida…" : faltan === 1 && estado.asientos.length === 2 ? "Falta una persona para empezar" : "Esperando a que se siente la gente"}
            </div>
        );
    }
    if (estado.turno === null) return null;
    const turno = estado.turno;
    const et = etiquetaAsiento(estado.juego, turno);
    const mio = misAsientos.includes(turno);
    const nombre = estado.asientos[turno]?.nombre ?? et.nombre;
    const soloMirando = misAsientos.length === 0;
    return (
        <div
            className={`${s.turno} ${mio && misAsientos.length === 1 ? s.turnoMio : ""}`}
            style={{
                background: `${et.color === "#1A1740" ? "rgba(255,255,255,.12)" : et.color + "26"}`,
                boxShadow: `inset 0 0 0 1px ${et.color === "#1A1740" ? "rgba(255,255,255,.5)" : et.color + "99"}`,
                ["--halo" as string]: `${et.color}80`,
            }}
            role="status"
            aria-live="polite"
        >
            {soloMirando && <Eye size={16} aria-hidden="true" />}
            <span className={s.ficha} style={{ background: et.color, boxShadow: et.color === "#1A1740" ? "inset 0 0 0 1px rgba(255,255,255,.55)" : undefined }} aria-hidden="true" />
            {mio && misAsientos.length === 1 ? `Te toca a ti (${et.nombre})` : `Turno de ${nombre} (${et.nombre})`}
        </div>
    );
}

export interface PropsBannerResultado {
    estado: EstadoMesa;
    misAsientos: number[];
    puedeActuar: boolean;
    alRevancha: () => void;
}

/** Resultado de la partida y botón de revancha. */
export function BannerResultado({ estado, misAsientos, puedeActuar, alRevancha }: PropsBannerResultado) {
    const fin = estado.fin;
    if (!fin) return null;
    const ganador = fin.ganador;
    const gano = ganador !== null && misAsientos.includes(ganador);
    const perdi = ganador !== null && misAsientos.length > 0 && !misAsientos.includes(ganador) && misAsientos.length < 2;
    const tablas = ganador === null;
    let titulo: string;
    if (estado.juego === "dibujo") {
        titulo = tablas ? "Empate en la clasificación" : `Gana ${estado.asientos[ganador]?.nombre ?? "el grupo"} la clasificación`;
    } else if (tablas) {
        titulo = "Tablas";
    } else if (gano && misAsientos.length === 1) {
        titulo = "¡Has ganado!";
    } else if (perdi) {
        titulo = "Has perdido esta vez";
    } else {
        const nombreBando = etiquetaAsiento(estado.juego, ganador).nombre;
        titulo = estado.juego === "tres-en-raya" ? `Gana la ${nombreBando}` : `Ganan las ${nombreBando.toLowerCase()}`;
    }
    const Icono = tablas ? Handshake : Trophy;
    return (
        <div
            className={`${s.resultado} ${gano && !tablas ? s.resultadoGana : ""} ${perdi ? s.resultadoPierde : ""}`}
            role="status"
            aria-live="polite"
        >
            <Icono size={26} aria-hidden="true" />
            <h2 className={s.resultadoTitulo}>{titulo}</h2>
            <span className={s.nota}>{fin.motivo}</span>
            <Boton variante="primario" onClick={alRevancha} disabled={!puedeActuar} icono={<RotateCcw size={16} aria-hidden="true" />}>
                {estado.asientos.length === 2 ? "Revancha (cambiando de bando)" : "Otra partida con la misma gente"}
            </Boton>
        </div>
    );
}
