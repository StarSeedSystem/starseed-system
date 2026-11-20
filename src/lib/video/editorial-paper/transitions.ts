/**
 * Transición de anuncio de la capa editorial-papel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Estilo Risograph: dos tintas con registro desalineado (off-register) y grano
 * de dos tintas, a 0,8 s. La bandera `useRisographTransition` permite volver al
 * estilo anterior (fundido plano) sin cambios. Datos y funciones puros: aquí no
 * se compone vídeo ni se toca el compositor (src/components/creation).
 */

import { anchor, horizonte, neutro, zenith } from "./tokens";

export interface Desplazamiento {
    /** Desplazamiento horizontal en px; 0 = registrado en el centro. */
    x: number;
    /** Desplazamiento vertical en px; 0 = registrado en el centro. */
    y: number;
}

export interface TintaAnuncio {
    nombre: string;
    hex: string;
    /** Desplazamiento off-register de esta tinta respecto al centro. */
    desplazamiento: Desplazamiento;
}

export interface GranoTinta {
    hex: string;
    /** Intensidad del grano de esta tinta (0-1). */
    intensidad: number;
}

export interface TransicionAnuncio {
    id: string;
    /** Duración en segundos. */
    duracion: number;
    easing: string;
    tintas: TintaAnuncio[];
    grano: GranoTinta[];
}

/** Transición anterior: una sola tinta registrada en el centro, sin grano. */
export const FUNDIDO_PLANO: TransicionAnuncio = {
    id: "anuncio-fundido-plano",
    duracion: 0.4,
    easing: "cubic-bezier(0.2, 0.9, 0.25, 1)",
    tintas: [{ nombre: neutro.nombre, hex: neutro.valor, desplazamiento: { x: 0, y: 0 } }],
    grano: [],
};

const EASING_RISOGRAPH = "cubic-bezier(0.33, 0, 0.2, 1)";

/**
 * Transición de anuncio. Con la bandera activa devuelve el estilo Risograph
 * (dos tintas desalineadas, grano de dos tintas, 0,8 s); con la bandera
 * inactiva devuelve la transición anterior sin cambios.
 */
export function transicionAnuncio(useRisographTransition: boolean): TransicionAnuncio {
    if (!useRisographTransition) return FUNDIDO_PLANO;
    return {
        id: "anuncio-risograph",
        duracion: 0.8,
        easing: EASING_RISOGRAPH,
        tintas: [
            { nombre: "azul eléctrico", hex: zenith.valor, desplazamiento: { x: -6, y: -4 } },
            { nombre: "verde esmeralda", hex: horizonte.valor, desplazamiento: { x: 5, y: 7 } },
        ],
        grano: [
            { hex: zenith.valor, intensidad: 0.18 },
            { hex: horizonte.valor, intensidad: 0.14 },
        ],
    };
}

/* ─────────── Orbe binario · escenario fijo 16:9 ───────────
   Marco que reserva su proporción (sin layout shift) y transiciones que solo
   tocan opacidad y escala; con reduced-motion queda solo el fundido. */

export type EstadoOrbe = "inactivo" | "activo" | "error";

export interface EscenarioFijo {
    proporcion: "16:9";
    ancho: number;
    alto: number;
}

/** Lienzo fijo 16:9 que se escala al visor sin deformarse. */
export const ESCENARIO_ORBE: EscenarioFijo = { proporcion: "16:9", ancho: 16, alto: 9 };

export interface TransicionEstadoOrbe {
    id: string;
    /** Duración en segundos. */
    duracion: number;
    easing: string;
    opacidad: number;
    escala: number;
    tinte: string;
    soloFundido: boolean;
}

const ESTADOS_ORBE: Record<EstadoOrbe, { opacidad: number; escala: number; tinte: string }> = {
    inactivo: { opacidad: 0.72, escala: 0.92, tinte: neutro.valor },
    activo: { opacidad: 1, escala: 1, tinte: zenith.valor },
    error: { opacidad: 0.9, escala: 0.96, tinte: anchor.valor },
};

/** Transición del orbe entre estados; con reduced-motion, solo fundido. */
export function transicionOrbe(estado: EstadoOrbe, reducirMovimiento: boolean): TransicionEstadoOrbe {
    const base = ESTADOS_ORBE[estado];
    if (reducirMovimiento) {
        return { id: `orbe-${estado}-fundido`, duracion: 0.2, easing: "linear", ...base, escala: 1, soloFundido: true };
    }
    return { id: `orbe-${estado}`, duracion: 0.4, easing: EASING_RISOGRAPH, ...base, soloFundido: false };
}

/** Escala del escenario 16:9 para caber entero en el visor (nunca deforma). */
export function escalaEscenario(anchoVisor: number, altoVisor: number): number {
    if (anchoVisor <= 0 || altoVisor <= 0) return 0;
    return Math.min(anchoVisor / ESCENARIO_ORBE.ancho, altoVisor / ESCENARIO_ORBE.alto);
}
