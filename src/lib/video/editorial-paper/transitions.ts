/**
 * Transiciones de la capa editorial-papel.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1) Anuncio Risograph: dos tintas con registro desalineado (off-register) y
 *    grano de dos tintas, a 0,8 s. La bandera `useRisographTransition` permite
 *    volver al estilo anterior (fundido plano) sin cambios.
 * 2) Orbe binario en escenario fijo 16:9: transiciones de estado (idle →
 *    activo → error) con opacidad y escala, más el factor de escalado del
 *    lienzo al visor. Con `prefers-reduced-motion` queda solo el fundido.
 * Datos y funciones puros: aquí no se compone vídeo ni se toca el compositor.
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

/* ═══════════════ Orbe binario · escenario fijo 16:9 (Frontend Slides) ═══════════════
   El orbe vive en un lienzo fijo de 1920×1080 que se escala ENTERO al visor con
   `transform: scale(escalaEscenario(...))`: las bandas son del visor, no del layout,
   así que cambiar de estado nunca provoca reflujo. Solo se animan opacidad y escala
   (`transform`); con `prefers-reduced-motion` la transición cae a un fundido de
   opacidad y la escala queda fija en 1. Duraciones y curvas son los tokens de
   `globals.css` (--dur-*, --ease-*), nunca valores paralelos. */

export type EstadoOrbe = "idle" | "activo" | "error";

export interface EscenarioFijo {
    ancho: number;
    alto: number;
    aspecto: "16:9";
}

export const ESCENARIO_ORBE: EscenarioFijo = { ancho: 1920, alto: 1080, aspecto: "16:9" };

export interface ObjetivoOrbe {
    opacidad: number;
    escala: number;
    duracionSeg: number;
    tokenDuracion: "--dur-fast" | "--dur-base" | "--dur-slow";
    tokenEasing: "--ease-organic" | "--ease-glide" | "--ease-soft";
}

export const ESTADOS_ORBE: Record<EstadoOrbe, ObjetivoOrbe> = {
    idle: { opacidad: 0.72, escala: 1, duracionSeg: 0.3, tokenDuracion: "--dur-slow", tokenEasing: "--ease-glide" },
    activo: { opacidad: 1, escala: 1.06, duracionSeg: 0.22, tokenDuracion: "--dur-base", tokenEasing: "--ease-organic" },
    error: { opacidad: 0.9, escala: 0.94, duracionSeg: 0.15, tokenDuracion: "--dur-fast", tokenEasing: "--ease-soft" },
};

export interface PlanOrbe {
    id: string;
    desde: EstadoOrbe;
    hacia: EstadoOrbe;
    opacidad: number;
    escala: number;
    duracionSeg: number;
    tokenDuracion: string;
    tokenEasing: string;
    soloFundido: boolean;
    propiedades: readonly ("opacity" | "transform")[];
}

const PROPIEDADES_COMPLETAS = ["opacity", "transform"] as const;
const PROPIEDADES_FUNDIDO = ["opacity"] as const;
const DURACION_FUNDIDO = 0.15;

/** Factor que cabe el lienzo entero en el visor sin recortarlo ni reflotar nada. */
export function escalaEscenario(
    visor: { ancho: number; alto: number },
    escenario: EscenarioFijo = ESCENARIO_ORBE,
): number {
    const factor = Math.min(visor.ancho / escenario.ancho, visor.alto / escenario.alto);
    return Number.isFinite(factor) && factor > 0 ? factor : 0;
}

/** Plan de transición entre dos estados; con `reducirMovimiento` solo funde opacidad. */
export function transicionOrbe(
    desde: EstadoOrbe,
    hacia: EstadoOrbe,
    opciones: { reducirMovimiento?: boolean } = {},
): PlanOrbe {
    const destino = ESTADOS_ORBE[hacia];
    const fundido = opciones.reducirMovimiento === true;
    const mismo = desde === hacia;
    return {
        id: `orbe-${desde}-a-${hacia}`,
        desde,
        hacia,
        opacidad: destino.opacidad,
        escala: fundido ? 1 : destino.escala,
        duracionSeg: fundido ? DURACION_FUNDIDO : mismo ? 0 : destino.duracionSeg,
        tokenDuracion: fundido ? "--dur-fast" : destino.tokenDuracion,
        tokenEasing: fundido ? "--ease-soft" : destino.tokenEasing,
        soloFundido: fundido,
        propiedades: fundido ? PROPIEDADES_FUNDIDO : PROPIEDADES_COMPLETAS,
    };
}
