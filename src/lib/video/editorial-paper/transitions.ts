/**
 * Transición de anuncio de la capa editorial-papel.
 * ─────────────────────────────────────────────────────────────────────────────
 * Estilo Risograph: dos tintas con registro desalineado (off-register) y grano
 * de dos tintas, a 0,8 s. La bandera `useRisographTransition` permite volver al
 * estilo anterior (fundido plano) sin cambios. Datos y funciones puros: aquí no
 * se compone vídeo ni se toca el compositor (src/components/creation).
 */

import { horizonte, neutro, zenith } from "./tokens";

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

/* ─────────────────── Orbe binario: transiciones de estado ─────────────────── */
/** Estados del orbe binario en escenario fijo 16:9. */
export type EstadoOrbe = "idle" | "activo" | "error";

/** Transición de estado del orbe: opacidad y escala, sin layout shift. */
export interface TransicionOrbe {
    /** Estado destino. */
    estado: EstadoOrbe;
    /** Duración en segundos. */
    duracion: number;
    /** Curva de easing CSS. */
    easing: string;
    /** Opacidad final (0-1). */
    opacidad: number;
    /** Escala final (1 = tamaño base). */
    escala: number;
}

/** Easing suave para el orbe (igual que fundido plano). */
const EASING_ORBE = "cubic-bezier(0.2, 0.9, 0.25, 1)";

/** Duración del fade en reduced-motion. */
const DURACION_REDUCIDA = 0.2;

/**
 * Transición de estado del orbe binario.
 *
 * Escenario fijo 16:9 escalado al visor: las transiciones son de opacidad y
 * escala, nunca de posición, para evitar layout shift.
 *
 * @param estado Estado destino (idle | activo | error)
 * @param reducirMovimiento Si true, usa solo fade (prefers-reduced-motion)
 */
export function transicionOrbe(estado: EstadoOrbe, reducirMovimiento: boolean): TransicionOrbe {
    if (reducirMovimiento) return transicionOrbeReducida(estado);

    switch (estado) {
        case "idle":
            return {
                estado: "idle",
                duracion: 0.6,
                easing: EASING_ORBE,
                opacidad: 1,
                escala: 1,
            };
        case "activo":
            return {
                estado: "activo",
                duracion: 0.5,
                easing: EASING_ORBE,
                opacidad: 1,
                escala: 1.08,
            };
        case "error":
            return {
                estado: "error",
                duracion: 0.4,
                easing: EASING_ORBE,
                opacidad: 0.6,
                escala: 0.92,
            };
    }
}

/**
 * Transición reducida (prefers-reduced-motion): solo fade, sin escala.
 * Misma identidad de gesto, precisión mínima.
 */
export function transicionOrbeReducida(estado: EstadoOrbe): TransicionOrbe {
    const opacidadBase = estado === "error" ? 0.6 : 1;
    return {
        estado,
        duracion: DURACION_REDUCIDA,
        easing: EASING_ORBE,
        opacidad: opacidadBase,
        escala: 1,
    };
}
