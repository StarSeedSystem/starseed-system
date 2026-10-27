/**
 * MOVIMIENTO STARSEED — Biblioteca de movimiento del OS (DSN1019G · Ola 1019D)
 * Módulo PURO: solo funciones y objetos, sin red, sin disco, sin procesos lanzados.
 * Copia el comportamiento de memory/diseno/estudio-audiovisual/examples/transiciones.html
 * y siembra.html: solo se animan transform, opacity, filter y clip-path.
 * Comentarios y textos en español con acentos.
 */

export type PuntoTrinity = "zenith" | "horizonte" | "logica" | "anchor";

/** Opciones de una transición o animación; solo propiedades permitidas. */
export interface OpcionesMovimiento {
    duracionMs: number;
    curva: string;
    transform?: string;
    opacity?: number;
    filter?: string;
    clipPath?: string;
    delayMs?: number;
}

/** Curvas reales del OS (ADN 2026-10-19, referencias/adn-y-tokens.md §5). */
const CURVA_ORGANICA = "cubic-bezier(0.22, 1, 0.36, 1)";
const CURVA_GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";
const CURVA_GENESIS = "cubic-bezier(0.22, 0.9, 0.3, 1)";

const DURACION_INTERFAZ = 220;
const DURACION_ESCENA_MIN = 600;
const DURACION_ESCENA_MAX = 900;

export function opcionesSiembra(): OpcionesMovimiento[] {
    return [
        { duracionMs: 400, curva: CURVA_ORGANICA, transform: "scale(0)", opacity: 0, delayMs: 0 },
        { duracionMs: 700, curva: CURVA_GLIDE, transform: "translateX(40px) scale(.2)", opacity: 0, delayMs: 350 },
        { duracionMs: 500, curva: CURVA_ORGANICA, transform: "scaleY(0)", opacity: 1, delayMs: 1050 },
        { duracionMs: 800, curva: CURVA_GLIDE, clipPath: "inset(0 100% 0 0)", delayMs: 1500 },
    ];
}

export function opcionesEntradaCardinal(punto: PuntoTrinity): OpcionesMovimiento {
    const recorrido = punto === "zenith" || punto === "anchor" ? 24 : -24;
    return {
        duracionMs: 720,
        curva: CURVA_GLIDE,
        transform: `translateY(${recorrido}px) scale(.98)`,
        opacity: 0,
    };
}

export function opcionesFundidoDesenfoque(): OpcionesMovimiento {
    return {
        duracionMs: 600,
        curva: CURVA_ORGANICA,
        filter: "blur(8px)",
        opacity: 0,
    };
}

export function opcionesElementoCompartido(): OpcionesMovimiento {
    return {
        duracionMs: 640,
        curva: CURVA_GLIDE,
        transform: "scale(2.6, 3.2)",
        opacity: 1,
    };
}

export function opcionesBarridoHorizonte(): OpcionesMovimiento {
    return {
        duracionMs: 700,
        curva: CURVA_GLIDE,
        clipPath: "inset(0 100% 0 0)",
        delayMs: 300,
    };
}

export function opcionesRespiracion(): OpcionesMovimiento {
    return {
        duracionMs: 5000,
        curva: CURVA_ORGANICA,
        transform: "scale(1.03)",
        opacity: 1,
    };
}

export function opcionesCristalizacion(): OpcionesMovimiento {
    return {
        duracionMs: 800,
        curva: CURVA_GLIDE,
        filter: "blur(0px)",
        opacity: 1,
        transform: "scale(1)",
    };
}

export function opcionesReducidas(): OpcionesMovimiento {
    return {
        duracionMs: 0,
        curva: CURVA_GENESIS,
        opacity: 1,
    };
}

export function opcionesAlquimia(): OpcionesMovimiento {
    return {
        duracionMs: 900,
        curva: CURVA_GENESIS,
        transform: "scale(1)",
        opacity: 1,
        filter: "brightness(1.2)",
    };
}
