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

// ── Orbe binario: escenario fijo 16:9, estados idle → activo → error ────────

export type EstadoOrbe = "idle" | "activo" | "error";

/** Lienzo fijo 720p: el orbe vive aquí y el visor solo lo escala. */
export const ESCENARIO_ORBE = { aspecto: "16:9", ancho: 1280, alto: 720 } as const;

/** Escala uniforme («contener»): encaja el 16:9 sin deformar ni mover el layout. */
export function escalarEscenario(anchoVisor: number, altoVisor: number): { escala: number; ancho: number; alto: number } {
    if (anchoVisor <= 0 || altoVisor <= 0) return { escala: 0, ancho: 0, alto: 0 };
    const escala = Math.min(anchoVisor / ESCENARIO_ORBE.ancho, altoVisor / ESCENARIO_ORBE.alto);
    return { escala, ancho: ESCENARIO_ORBE.ancho * escala, alto: ESCENARIO_ORBE.alto * escala };
}

/** Tinta del estado: hex del token y variable CSS de Trinity que lo pinta. */
export interface TintaOrbe { nombre: string; hex: string; variable: `--trinity-${string}`; }

/** `opacidad` y `escala` nunca tocan el layout; con movimiento reducido solo sobrevive el fundido. */
export interface TransicionOrbe {
    estado: EstadoOrbe; tinta: TintaOrbe; opacidad: number; escala: number;
    duracionMs: number; easing: string; soloFundido: boolean;
}
const TINTAS: Record<EstadoOrbe, TintaOrbe> = {
    idle: { nombre: horizonte.nombre, hex: horizonte.valor, variable: "--trinity-emerald" },
    activo: { nombre: zenith.nombre, hex: zenith.valor, variable: "--trinity-azure" },
    error: { nombre: anchor.nombre, hex: anchor.valor, variable: "--trinity-crimson" },
};
const VISUAL: Record<EstadoOrbe, { opacidad: number; escala: number }> = {
    idle: { opacidad: 0.7, escala: 0.96 },
    activo: { opacidad: 1, escala: 1.04 },
    error: { opacidad: 0.85, escala: 1 },
};

/**
 * Transición de estado en el escenario fijo: opacidad y escala con la duración
 * y la curva del fundido existente; con movimiento reducido, solo fundido.
 */
export function transicionOrbe(estado: EstadoOrbe, reducirMovimiento: boolean): TransicionOrbe {
    const v = VISUAL[estado];
    return {
        estado, tinta: TINTAS[estado], opacidad: v.opacidad,
        escala: reducirMovimiento ? 1 : v.escala,
        duracionMs: reducirMovimiento ? 200 : FUNDIDO_PLANO.duracion * 1000,
        easing: reducirMovimiento ? "linear" : FUNDIDO_PLANO.easing,
        soloFundido: reducirMovimiento,
    };
}
