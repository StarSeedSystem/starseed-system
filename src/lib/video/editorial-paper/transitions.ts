/**
 * Transiciones de la capa editorial-papel y del orbe binario (Protomolécula).
 * Risograph: dos tintas off-register a 0,8 s. Orbe: idle → activo → error en un
 * escenario fijo 16:9 con opacidad y escala; nada de layout. Funciones puras.
 */

import { anchor, horizonte, neutro, zenith, type TokenColor } from "./tokens";

export interface Desplazamiento {
    x: number;
    y: number;
}

export interface TintaAnuncio {
    nombre: string;
    hex: string;
    desplazamiento: Desplazamiento;
}

export interface GranoTinta {
    hex: string;
    intensidad: number;
}

export interface TransicionAnuncio {
    id: string;
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
 * Transición de anuncio: con la bandera, Risograph (dos tintas desalineadas y
 * grano, 0,8 s); sin ella, la transición anterior sin cambios.
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

/* ───────── Orbe binario · Protomolécula · escenario fijo 16:9 ───────── */
export type EstadoOrbe = "idle" | "activo" | "error";
/** Escenario fijo: el orbe vive aquí y se escala al visor sin recolocarse. */
export const ESCENARIO_ORBE = { ancho: 1920, alto: 1080, proporcion: 16 / 9 };
export type FotogramaOrbe = { opacidad: number; escala: number };
export const ESTADOS_ORBE_VISUAL: Record<EstadoOrbe, { fotograma: FotogramaOrbe; token: TokenColor }> = {
    idle: { fotograma: { opacidad: 0.72, escala: 1 }, token: neutro },
    activo: { fotograma: { opacidad: 1, escala: 1.06 }, token: zenith },
    error: { fotograma: { opacidad: 0.88, escala: 0.96 }, token: anchor },
};

export interface TransicionEstadoOrbe {
    desde: EstadoOrbe;
    hasta: EstadoOrbe;
    duracion: number;
    easing: string;
    desdeFotograma: FotogramaOrbe;
    hastaFotograma: FotogramaOrbe;
    /** true con `prefers-reduced-motion`: solo se funde la opacidad. */
    soloFundido: boolean;
    token: TokenColor;
}

/** Transición entre estados; con movimiento reducido solo cambia la opacidad. */
export function transicionEstadoOrbe(
    desde: EstadoOrbe,
    hasta: EstadoOrbe,
    reducirMovimiento = false,
): TransicionEstadoOrbe {
    const origen = ESTADOS_ORBE_VISUAL[desde].fotograma;
    const destino = ESTADOS_ORBE_VISUAL[hasta];
    if (desde === hasta) {
        return {
            desde, hasta, duracion: 0, easing: "linear", desdeFotograma: origen, hastaFotograma: origen,
            soloFundido: reducirMovimiento, token: destino.token,
        };
    }
    if (reducirMovimiento) {
        return {
            desde, hasta, duracion: 0.18, easing: FUNDIDO_PLANO.easing,
            desdeFotograma: { opacidad: origen.opacidad, escala: 1 },
            hastaFotograma: { opacidad: destino.fotograma.opacidad, escala: 1 }, soloFundido: true, token: destino.token,
        };
    }
    return {
        desde, hasta, duracion: 0.24, easing: EASING_RISOGRAPH,
        desdeFotograma: origen, hastaFotograma: destino.fotograma, soloFundido: false, token: destino.token,
    };
}

/** Escala el escenario al visor sin recortarlo; visor inválido → 0 (sin NaN). */
export function escalaEscenarioOrbe(anchoVisor: number, altoVisor: number): number {
    const valido = Number.isFinite(anchoVisor) && Number.isFinite(altoVisor);
    if (!valido || anchoVisor <= 0 || altoVisor <= 0) return 0;
    return Math.min(anchoVisor / ESCENARIO_ORBE.ancho, altoVisor / ESCENARIO_ORBE.alto);
}
