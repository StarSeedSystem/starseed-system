/**
 * MOVIMIENTO STARSEED — biblioteca WAAPI (DSN1019G · Ola 1019D)
 * Módulo PURO: sin DOM, red, disco ni reloj. Entrega keyframes y opciones
 * para `Element.animate()` con las firmas de la marca; solo transform,
 * opacity, filter y clipPath, y siempre su versión de movimiento reducido.
 */
/** Curvas reales del OS (adn-y-tokens §5). */
export const CURVAS = {
    organica: "cubic-bezier(0.22, 1, 0.36, 1)",
    desliz: "cubic-bezier(0.16, 1, 0.3, 1)",
    genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)",
} as const;
/** Duraciones de interfaz (140/220/240 ms) y de escena (600–900 ms). */
export const DURACION_UI = { rapida: 140, organica: 220, normal: 240 } as const;
export const DURACION_ESCENA = { fundido: 600, elemento: 640, barrido: 700, entrada: 720, cristalizacion: 900, alquimia: 900 } as const;
/** Firmas largas de la marca: siembra (2,4 s) y respiración (5 s por ciclo). */
export const DURACION_FIRMA = { siembra: 2400, respiracion: 5000 } as const;
/** Únicas propiedades que toca la biblioteca. */
export const PROPIEDADES_PERMITIDAS = ["transform", "opacity", "filter", "clipPath"] as const;
export interface Fotograma { offset?: number; transform?: string; opacity?: number; filter?: string; clipPath?: string; }
export interface OpcionesAnimacion { duration: number; easing: string; delay?: number; fill?: "none" | "forwards" | "backwards" | "both" | "auto"; iterations?: number; direction?: "normal" | "reverse" | "alternate" | "alternate-reverse"; }
export interface Animacion { keyframes: Fotograma[]; opciones: OpcionesAnimacion; }
/** Los cuatro puntos de la Trinity: guía, creación, control y raíz. */
export type PuntoTrinity = "arriba" | "izquierda" | "derecha" | "abajo";
/** Opciones con movimiento reducido: el estado final se pinta de golpe. */
export function opcionesReducidas(): OpcionesAnimacion {
    return { duration: 1, easing: CURVAS.organica, delay: 0, fill: "both", iterations: 1, direction: "normal" };
}
/** Reduce al último fotograma (sin transform) y con las opciones reducidas. */
export function conReduccion(anim: Animacion, reducido: boolean): Animacion {
    if (!reducido) return anim;
    const final = anim.keyframes[anim.keyframes.length - 1] ?? {};
    const keyframes: Fotograma[] = [{ opacity: final.opacity ?? 1 }];
    if (final.filter) keyframes[0].filter = final.filter;
    return { keyframes, opciones: opcionesReducidas() };
}

/** Siembra: punto → dos círculos (vesica) → ojo → diamante; una sola vez. */
export function siembra(reducido = false): Animacion {
    return conReduccion({
        keyframes: [
            { offset: 0, transform: "scale(0)", opacity: 0, clipPath: "circle(0% at 50% 50%)" },
            { offset: 0.17, transform: "scale(1.4)", opacity: 1, clipPath: "circle(12% at 50% 50%)" },
            { offset: 0.44, transform: "scale(1)", opacity: 1, clipPath: "circle(42% at 50% 50%)" },
            { offset: 1, transform: "none", opacity: 1, clipPath: "none" },
        ],
        opciones: { duration: DURACION_FIRMA.siembra, easing: CURVAS.organica, fill: "both" },
    }, reducido);
}

/** Desde dónde entra cada punto de la Trinity (24 px de recorrido). */
const DESDE: Record<PuntoTrinity, string> = {
    arriba: "translateY(-24px) scale(0.98)", izquierda: "translateX(-24px) scale(0.98)",
    derecha: "translateX(24px) scale(0.98)", abajo: "translateY(24px) scale(0.98)",
};
/** Entrada cardinal: del perímetro hacia su punto de la Trinity. */
export function entradaCardinal(punto: PuntoTrinity, reducido = false): Animacion {
    return conReduccion({
        keyframes: [
            { offset: 0, transform: DESDE[punto], opacity: 0 },
            { offset: 0.8, transform: "none", opacity: 1 },
            { offset: 1, transform: "none", opacity: 1 },
        ],
        opciones: { duration: DURACION_ESCENA.entrada, easing: CURVAS.desliz, fill: "both" },
    }, reducido);
}

/** Fundido con desenfoque: 8 px → 0 para cambiar de escena sin corte. */
export function fundidoDesenfoque(reducido = false): Animacion {
    return conReduccion({
        keyframes: [{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0)", opacity: 1 }],
        opciones: { duration: DURACION_ESCENA.fundido, easing: CURVAS.organica, fill: "both" },
    }, reducido);
}

/** Elemento compartido: crece con transform, nunca con ancho y alto. */
export function elementoCompartido(reducido = false): Animacion {
    return conReduccion({
        keyframes: [{ transform: "scale(1)" }, { transform: "scale(2.6, 3.2)" }],
        opciones: { duration: DURACION_ESCENA.elemento, easing: CURVAS.desliz, fill: "both", iterations: 2, direction: "alternate" },
    }, reducido);
}

/** Barrido de horizonte: la línea cruza y revela la escena siguiente (una vez). */
export function barridoHorizonte(reducido = false): { linea: Animacion; escena: Animacion } {
    return {
        linea: conReduccion({ keyframes: [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], opciones: { duration: DURACION_ESCENA.barrido, easing: CURVAS.desliz, fill: "both" } }, reducido),
        escena: conReduccion({ keyframes: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], opciones: { duration: DURACION_ESCENA.barrido, delay: 300, easing: CURVAS.desliz, fill: "both" } }, reducido),
    };
}

/** Respiración del símbolo: escala 1 → 1,03 en ciclo alterno de 5 s. */
export function respiracion(reducido = false): Animacion {
    return conReduccion({
        keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.03)" }],
        opciones: { duration: DURACION_FIRMA.respiracion, easing: CURVAS.organica, fill: "both", iterations: Infinity, direction: "alternate" },
    }, reducido);
}

/** Cristalización: cada nodo se ordena desde la dispersión con su escalonado. */
export function cristalizacion(indice = 0, reducido = false): Animacion {
    return conReduccion({
        keyframes: [
            { offset: 0, transform: "scale(2.5)", opacity: 0, filter: "blur(6px)" },
            { offset: 1, transform: "none", opacity: 1, filter: "blur(0)" },
        ],
        opciones: { duration: DURACION_ESCENA.cristalizacion, delay: Math.min(Math.max(indice, 0) * 40, 240), easing: CURVAS.desliz, fill: "both" },
    }, reducido);
}

/** Alquimia: el gris se vuelve oro de lógica al cumplir su propósito. */
export function alquimia(reducido = false): Animacion {
    return conReduccion({
        keyframes: [
            { offset: 0, transform: "scale(0.98)", opacity: 0.6, filter: "grayscale(1) brightness(0.85)" },
            { offset: 1, transform: "none", opacity: 1, filter: "grayscale(0) saturate(1.2) brightness(1.1)" },
        ],
        opciones: { duration: DURACION_ESCENA.alquimia, easing: CURVAS.genesis, fill: "both" },
    }, reducido);
}
