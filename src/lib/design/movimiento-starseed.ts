/**
 * BIBLIOTECA DE MOVIMIENTO STARSEED (WAAPI, puro) — Ola 1019D · DSN1019G
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: keyframes y opciones WAAPI para el vocabulario de la marca —
 * siembra, entrada cardinal, fundido con desenfoque, elemento compartido,
 * barrido de horizonte, respiración, cristalización y alquimia — sin tocar el
 * DOM. Solo se animan `transform`, `opacity`, `filter` y `clipPath`; curvas y
 * duraciones son tokens; siempre existe versión de movimiento reducido.
 */

/** Propiedades que la marca permite animar. Nada de anchos, altos ni márgenes. */
export const PROPIEDADES_ANIMABLES = ["transform", "opacity", "filter", "clipPath"] as const;
export type PropiedadAnimable = (typeof PROPIEDADES_ANIMABLES)[number];

/** Un fotograma WAAPI acotado a las propiedades permitidas. */
export interface Fotograma {
    offset?: number; easing?: string; transform?: string; opacity?: number; filter?: string; clipPath?: string;
}

/** Opciones WAAPI que la biblioteca expone. */
export interface OpcionesAnimacion {
    duration: number; easing: string; delay?: number; fill?: "none" | "forwards" | "backwards" | "both"; iterations?: number; direction?: "normal" | "reverse" | "alternate" | "alternate-reverse";
}

/** Una animación completa: nombre legible, fotogramas y opciones. */
export interface AnimacionStarseed { nombre: string; fotogramas: Fotograma[]; opciones: OpcionesAnimacion; }

/** Duraciones reales de interfaz (ms): rápida, orgánica y normal. */
export const DURACION_INTERFAZ = { rapida: 140, organica: 220, normal: 240 } as const;

/** Duraciones de escena (ms): cada entrada cabe entre 600 y 900 ms. */
export const DURACION_ESCENA = { fundido: 600, compartido: 640, barrido: 700, entrada: 720, alquimia: 800, cristalizacion: 900, respiracion: 5000 } as const;

/** Las tres curvas reales del OS: orgánica, deslizamiento y Genesis. */
export const CURVAS = { organica: "cubic-bezier(0.22, 1, 0.36, 1)", deslizamiento: "cubic-bezier(0.16, 1, 0.3, 1)", genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)" } as const;

/** Puntos de la Trinity desde los que entra un panel cardinal. */
export type PuntoTrinity = "zenith" | "horizonte" | "logica" | "ancla";

const DESDE: Record<PuntoTrinity, { desde: string; anticipo: string }> = {
    zenith: { desde: "translateY(-24px) scale(0.98)", anticipo: "translateY(2px)" },
    horizonte: { desde: "translateX(24px) scale(0.98)", anticipo: "translateX(-2px)" },
    logica: { desde: "translateX(-24px) scale(0.98)", anticipo: "translateX(2px)" },
    ancla: { desde: "translateY(24px) scale(0.98)", anticipo: "translateY(-2px)" },
};

function anim(nombre: string, duration: number, easing: string, fotogramas: Fotograma[], extra: Partial<OpcionesAnimacion> = {}): AnimacionStarseed {
    return { nombre, fotogramas, opciones: { duration, easing, fill: "both", ...extra } };
}

/** Siembra del símbolo: punto → vesica piscis → ojo → diamante (2,4 s en total). */
export const SIEMBRA: Record<"punto" | "vesica" | "ojo" | "diamante", AnimacionStarseed> = {
    punto: anim("Siembra · punto", 400, CURVAS.organica, [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.4)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 0 }]),
    vesica: anim("Siembra · vesica", 700, CURVAS.deslizamiento, [{ transform: "scale(0.2)", opacity: 0 }, { transform: "none", opacity: 1 }], { delay: 350 }),
    ojo: anim("Siembra · ojo", 500, CURVAS.organica, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { delay: 1050 }),
    diamante: anim("Siembra · diamante", 800, CURVAS.deslizamiento, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { delay: 1500 }),
};

/** Entrada desde el borde del punto de la Trinity que le toca al panel. */
export function entradaCardinal(punto: PuntoTrinity): AnimacionStarseed {
    const { desde, anticipo } = DESDE[punto];
    return anim(`Entrada cardinal · ${punto}`, DURACION_ESCENA.entrada, CURVAS.deslizamiento, [
        { transform: desde, opacity: 0 },
        { transform: anticipo, opacity: 1, offset: 0.8 },
        { transform: "none", opacity: 1 },
    ]);
}

/** Fundido con desenfoque: cambia de escena sin corte. */
export const fundidoDesenfoque = anim("Fundido con desenfoque", DURACION_ESCENA.fundido, CURVAS.organica, [
    { filter: "blur(8px)", opacity: 0 },
    { filter: "blur(0px)", opacity: 1 },
]);

/** Elemento compartido: la tarjeta crece hasta ser la ventana (solo `transform`). */
export const elementoCompartido = anim("Elemento compartido", DURACION_ESCENA.compartido, CURVAS.deslizamiento, [
    { transform: "scale(1)" },
    { transform: "scale(2.6, 3.2)" },
], { direction: "alternate", iterations: 2 });

/** Barrido de horizonte: la línea cruza y revela la escena siguiente (jugada rara). */
export const barridoHorizonte = {
    linea: anim("Barrido · línea", DURACION_ESCENA.barrido, CURVAS.deslizamiento, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }]),
    escena: anim("Barrido · escena", DURACION_ESCENA.barrido, CURVAS.deslizamiento, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { delay: 300 }),
};

/** Respiración: escala 1 → 1.03 con curva orgánica, en bucle alterno. */
export const respiracion = anim("Respiración", DURACION_ESCENA.respiracion, CURVAS.organica, [
    { transform: "scale(1)" },
    { transform: "scale(1.03)" },
], { direction: "alternate", iterations: Infinity });

/** Cristalización: la malla de nodos se ordena en retícula. */
export const cristalizacion = anim("Cristalización", DURACION_ESCENA.cristalizacion, CURVAS.deslizamiento, [
    { transform: "scale(0.92)", opacity: 0, filter: "blur(3px)" },
    { transform: "scale(1)", opacity: 1, filter: "blur(0px)" },
]);

/** Alquimia: lo gris se vuelve oro de lógica al cumplir su propósito. */
export const alquimia = anim("Alquimia", DURACION_ESCENA.alquimia, CURVAS.organica, [
    { transform: "scale(0.98)", opacity: 0.6, filter: "saturate(0) brightness(0.8)" },
    { transform: "scale(1)", opacity: 1, filter: "saturate(1.35) brightness(1.1)" },
]);

/** Opciones con movimiento reducido: un fundido corto, sin cascada ni bucles. */
export function opcionesReducidas(o: OpcionesAnimacion): OpcionesAnimacion {
    return { ...o, duration: DURACION_INTERFAZ.rapida, easing: CURVAS.organica, delay: 0, iterations: 1, direction: "normal" };
}

/** Deja solo opacidad y recorte: el estado final, sin desplazamientos ni desenfoque. */
export function fotogramasReducidos(fotogramas: Fotograma[]): Fotograma[] {
    const conOpacidad = fotogramas.some((f) => f.opacity !== undefined);
    if (!conOpacidad) return [{ opacity: 1 }];
    return fotogramas.map((f) => ({ offset: f.offset, opacity: f.opacity, clipPath: f.clipPath }));
}

/** Versión completa con movimiento reducido, lista para `element.animate`. */
export function animacionReducida(animacion: AnimacionStarseed): AnimacionStarseed {
    return { ...animacion, fotogramas: fotogramasReducidos(animacion.fotogramas), opciones: opcionesReducidas(animacion.opciones) };
}
