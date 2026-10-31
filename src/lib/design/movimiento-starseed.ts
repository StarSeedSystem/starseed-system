/**
 * BIBLIOTECA DE MOVIMIENTO STARSEED — recetas WAAPI puras (DSN1019G · Ola 1019D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ocho variaciones de identidad con las curvas y duraciones reales del ADN
 * (`memory/diseno/estudio-audiovisual/assets/tokens.css`): interfaz 140/220/240 ms
 * y escena 600–900 ms; la siembra dura 2.400 ms y la respiración 4.800 ms por
 * ciclo. Solo se animan `transform`, `opacity`, `filter` y `clipPath`; toda receta
 * tiene su versión reducida (fundido simple, sin desplazamiento). Sin red, disco,
 * reloj ni DOM: los componentes la pasan a `element.animate(keyframes, opciones)`.
 */
export type TipoMovimiento = "siembra" | "entrada-cardinal" | "fundido-desenfoque" | "elemento-compartido" | "barrido-horizonte" | "respiracion" | "cristalizacion" | "alquimia";
/** Punto de la Trinity por el que entra un elemento cardinal. */
export type PuntoTrinity = "zenit" | "izquierda" | "derecha" | "raiz";
/** Las únicas propiedades que la marca permite animar. */
export type PropiedadPermitida = "transform" | "opacity" | "filter" | "clipPath";
export type FotogramaStarseed = { offset?: number } & Partial<Record<PropiedadPermitida, string | number>>;
export interface OpcionesAnimacionStarseed { duration: number; easing: string; delay?: number; fill?: "both" | "none" | "forwards" | "backwards"; direction?: "normal" | "alternate"; iterations?: number }
export interface RecetaMovimiento { keyframes: FotogramaStarseed[]; opciones: OpcionesAnimacionStarseed }
export interface OpcionesReceta { punto?: PuntoTrinity; reducido?: boolean; retardoMs?: number }
export const PROPIEDADES_PERMITIDAS: readonly PropiedadPermitida[] = ["transform", "opacity", "filter", "clipPath"];
/** Curvas reales del ADN: orgánica, desliz y Genesis (`tokens.css`). */
export const CURVAS_STARSEED = { organica: "cubic-bezier(0.22, 1, 0.36, 1)", desliz: "cubic-bezier(0.16, 1, 0.3, 1)", genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)" } as const;
export const DURACIONES_STARSEED = { rapida: 140, organica: 220, normal: 240, fundido: 600, compartido: 640, barrido: 700, cardinal: 720, cristalizacion: 750, alquimia: 800, siembra: 2400, respiracion: 4800 } as const;
/** Entrada cardinal: 24 px desde el borde de su punto de la Trinity. */
const ENTRADAS: Record<PuntoTrinity, { desde: string; asiento: string }> = {
    zenit: { desde: "translateY(-24px) scale(0.98)", asiento: "translateY(2px)" },
    raiz: { desde: "translateY(24px) scale(0.98)", asiento: "translateY(-2px)" },
    izquierda: { desde: "translateX(-24px) scale(0.98)", asiento: "translateX(2px)" },
    derecha: { desde: "translateX(24px) scale(0.98)", asiento: "translateX(-2px)" },
};
function entradaCardinal(punto: PuntoTrinity): RecetaMovimiento {
    return {
        keyframes: [
            { transform: ENTRADAS[punto].desde, opacity: 0 },
            { transform: ENTRADAS[punto].asiento, opacity: 1, offset: 0.8 },
            { transform: "none", opacity: 1 },
        ],
        opciones: { duration: DURACIONES_STARSEED.cardinal, easing: CURVAS_STARSEED.desliz, fill: "both" },
    };
}
const RECETAS: Record<TipoMovimiento, RecetaMovimiento> = {
    "entrada-cardinal": entradaCardinal("raiz"),
    siembra: {
        keyframes: [
            { transform: "scale(0)", opacity: 0, clipPath: "circle(0% at 50% 50%)" },
            { transform: "scale(1.4)", opacity: 1, clipPath: "circle(12% at 50% 50%)", offset: 0.17 },
            { transform: "scale(1)", opacity: 1, clipPath: "circle(45% at 50% 50%)", offset: 0.44 },
            { transform: "scale(1.02)", opacity: 1, clipPath: "circle(72% at 50% 50%)", offset: 0.62 },
            { transform: "scale(1)", opacity: 1, clipPath: "circle(100% at 50% 50%)" },
        ],
        opciones: { duration: DURACIONES_STARSEED.siembra, easing: CURVAS_STARSEED.organica, fill: "both" },
    },
    "fundido-desenfoque": {
        keyframes: [{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0)", opacity: 1 }],
        opciones: { duration: DURACIONES_STARSEED.fundido, easing: CURVAS_STARSEED.organica, fill: "both" },
    },
    "elemento-compartido": {
        keyframes: [{ transform: "scale(1)" }, { transform: "scale(2.6, 3.2)" }],
        opciones: { duration: DURACIONES_STARSEED.compartido, easing: CURVAS_STARSEED.desliz, fill: "both", direction: "alternate", iterations: 2 },
    },
    "barrido-horizonte": {
        keyframes: [
            { clipPath: "inset(0 100% 0 0)", transform: "translateX(-2%)" },
            { clipPath: "inset(0 0 0 0)", transform: "none" },
        ],
        opciones: { duration: DURACIONES_STARSEED.barrido, easing: CURVAS_STARSEED.desliz, delay: 300, fill: "both" },
    },
    respiracion: {
        keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.03)" }],
        opciones: { duration: DURACIONES_STARSEED.respiracion, easing: CURVAS_STARSEED.organica, fill: "both", direction: "alternate", iterations: Infinity },
    },
    cristalizacion: {
        keyframes: [
            { transform: "scale(1.06) rotate(-2deg)", opacity: 0, filter: "blur(6px)" },
            { transform: "scale(1.02) rotate(-0.5deg)", opacity: 1, filter: "blur(0)", offset: 0.7 },
            { transform: "none", opacity: 1, filter: "blur(0)" },
        ],
        opciones: { duration: DURACIONES_STARSEED.cristalizacion, easing: CURVAS_STARSEED.genesis, fill: "both" },
    },
    alquimia: {
        keyframes: [
            { filter: "grayscale(1) saturate(0.4) brightness(0.85)", opacity: 0.7 },
            { filter: "grayscale(0.35) saturate(1.2) brightness(1.05)", opacity: 0.95, offset: 0.65 },
            { filter: "grayscale(0) saturate(1) brightness(1)", opacity: 1 },
        ],
        opciones: { duration: DURACIONES_STARSEED.alquimia, easing: CURVAS_STARSEED.organica, fill: "both" },
    },
};

/** Copia profunda de una receta: nadie muta la tabla compartida. */
function clonar(r: RecetaMovimiento): RecetaMovimiento {
    return { keyframes: r.keyframes.map((k) => ({ ...k })), opciones: { ...r.opciones } };
}

/** Opciones de movimiento reducido: 1 ms, sin retardo, una sola pasada. */
export function opcionesReducidas(o: OpcionesAnimacionStarseed): OpcionesAnimacionStarseed {
    return { ...o, duration: 1, delay: 0, iterations: 1, direction: "normal" };
}

/** Versión reducida: fundido simple, sin desplazamiento ni bucle. */
export function recetaReducida(r: RecetaMovimiento): RecetaMovimiento {
    return { keyframes: [{ opacity: 0 }, { opacity: 1 }], opciones: opcionesReducidas(r.opciones) };
}

/** Receta de una variación; `punto` solo afecta a la entrada cardinal. */
export function recetaMovimiento(tipo: TipoMovimiento, opciones: OpcionesReceta = {}): RecetaMovimiento {
    const base = tipo === "entrada-cardinal" ? entradaCardinal(opciones.punto ?? "raiz") : clonar(RECETAS[tipo]);
    if (opciones.retardoMs) base.opciones.delay = (base.opciones.delay ?? 0) + opciones.retardoMs;
    return opciones.reducido ? recetaReducida(base) : base;
}

/** Atajo: solo los fotogramas de la variación. */
export function keyframesDe(tipo: TipoMovimiento, punto: PuntoTrinity = "raiz"): FotogramaStarseed[] {
    return recetaMovimiento(tipo, { punto }).keyframes;
}

/** Atajo: solo las opciones de tiempo y curva. */
export function opcionesDe(tipo: TipoMovimiento): OpcionesAnimacionStarseed {
    return recetaMovimiento(tipo).opciones;
}
