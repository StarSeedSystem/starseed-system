/**
 * MOVIMIENTO STARSEED — biblioteca de movimiento de la marca (WAAPI, pura)
 * ─────────────────────────────────────────────────────────────────────────
 * Keyframes y opciones de las transiciones del ADN dinámico StarSeed
 * (adn-y-tokens.md §5 y §7b; comportamiento de transiciones.html y siembra.html).
 * Módulo PURO: devuelve keyframes, nunca toca el DOM; quien llama los reproduce
 * con `element.animate`. Reglas: solo se animan `transform`, `opacity`, `filter`
 * y `clip-path`; curvas reales; duraciones de interfaz (140/220/240 ms) y de
 * escena (600–900 ms; la respiración, ciclo propio de 4–6 s). `opcionesReducidas`
 * da siempre la versión de movimiento reducido (1 ms, sin retardo, una pasada).
 */

/** Los cuatro puntos cardinales de la Trinity. */
export type PuntoTrinity = "zenith" | "horizon" | "logic" | "anchor";

/** Fotograma clave: solo propiedades de marca (más `offset` de WAAPI). */
export interface Keyframe { transform?: string; opacity?: number; filter?: string; clipPath?: string; offset?: number; }

/** Una animación lista para WAAPI: keyframes + opciones de tiempo. */
export interface Animacion {
    keyframes: Keyframe[];
    duracionMs: number;
    curva: string;
    delayMs?: number;
    relleno?: "both";
    direccion?: "alternate";
    iteraciones?: number;
}

/** Curvas reales del OS: orgánica, glide y genesis (ADN §5). */
export const CURVAS = {
    organico: "cubic-bezier(0.22, 1, 0.36, 1)",
    glide: "cubic-bezier(0.16, 1, 0.3, 1)",
    genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)",
} as const;

/** Duraciones de interfaz del ADN (ms). */
export const DURACION_INTERFAZ = { rapido: 140, organico: 220, normal: 240 } as const;

type Opciones = Partial<Pick<Animacion, "delayMs" | "relleno" | "direccion" | "iteraciones">>;

/** Une keyframes y opciones de tiempo en una Animación determinista. */
function crear(keyframes: Keyframe[], duracionMs: number, curva: string, extra?: Opciones): Animacion {
    return { keyframes, duracionMs, curva, ...extra };
}

/** Cómo entra cada punto de la Trinity: eje y sentido (desde su perímetro). */
const CARDINAL: Record<PuntoTrinity, { eje: "X" | "Y"; signo: 1 | -1 }> = {
    zenith: { eje: "Y", signo: -1 }, // Norte: entra desde arriba
    horizon: { eje: "X", signo: -1 }, // Oeste: entra desde la izquierda
    logic: { eje: "X", signo: 1 }, // Este: entra desde la derecha
    anchor: { eje: "Y", signo: 1 }, // Sur: entra desde abajo
};

/** Entrada cardinal: desde el perímetro hacia su punto de la Trinity (24 px, con sobrepaso). */
export function entradaCardinal(punto: PuntoTrinity): Animacion {
    const { eje, signo } = CARDINAL[punto];
    return crear([
        { transform: `translate${eje}(${signo * 24}px) scale(0.98)`, opacity: 0 },
        { transform: `translate${eje}(${signo * -2}px)`, opacity: 1, offset: 0.8 },
        { transform: "none", opacity: 1 },
    ], 720, CURVAS.glide);
}

/** Siembra del símbolo: brote del punto → dos círculos → el ojo → trazado del diamante. */
export function siembra(): { brote: Animacion; apertura: Animacion; mirar: Animacion; trazado: Animacion } {
    return {
        brote: crear([{ transform: "scale(0)" }, { transform: "scale(1.4)", offset: 0.6 }, { transform: "scale(1)", opacity: 0 }], 600, CURVAS.organico),
        apertura: crear([{ transform: "translateX(-40px) scale(0.2)", opacity: 0 }, { transform: "none", opacity: 1 }], 700, CURVAS.glide, { delayMs: 350 }),
        mirar: crear([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], 600, CURVAS.organico, { delayMs: 1050 }),
        trazado: crear([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], 800, CURVAS.glide, { delayMs: 1500 }),
    };
}

/** Fundido con desenfoque: aparece desdibujado («Cristal Líquido») y se enfoca. */
export function fundidoDesenfoque(): Animacion {
    return crear([{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0)", opacity: 1 }], 600, CURVAS.organico);
}

/** Elemento compartido: el elemento crece de su origen hacia su nuevo lugar. */
export function elementoCompartido(): Animacion {
    return crear([{ transform: "scale(1)" }, { transform: "scale(2.6, 3.2)" }], 640, CURVAS.glide, {
        relleno: "both", direccion: "alternate", iteraciones: 2,
    });
}/** Barrido de horizonte: la línea cruza (la «jugada rara») y la escena nueva se descubre. */
export function barridoHorizonte(): { linea: Animacion; escenaB: Animacion } {
    return {
        linea: crear([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], 700, CURVAS.glide),
        escenaB: crear([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], 700, CURVAS.glide, { delayMs: 300, relleno: "both" }),
    };
}

/** Cristalización: la malla de nodos dispersa se ordena en retícula (sílice que se vuelve cristal). */
export function cristalizacion(): Animacion {
    return crear([
        { transform: "translate(10px, -12px) scale(0.4)", opacity: 0.2 },
        { transform: "none", opacity: 1 },
    ], 700, CURVAS.glide);
}

/** Alquimia: el elemento gris se vuelve oro de lógica al cumplir su propósito. */
export function alquimia(): Animacion {
    return crear([
        { filter: "grayscale(1) opacity(0.6)" },
        { filter: "sepia(1) saturate(3) hue-rotate(-8deg)", opacity: 1 },
    ], DURACION_INTERFAZ.normal, CURVAS.genesis);
}

/** Respiración del símbolo: escala 1 → 1,03, ida y vuelta, ciclo de 5 s. */
export function respiracion(): Animacion {
    return crear([{ transform: "scale(1)" }, { transform: "scale(1.03)" }], 5000, CURVAS.organico, {
        relleno: "both", direccion: "alternate", iteraciones: Infinity,
    });
}

/** Movimiento reducido ante `prefers-reduced-motion`: mismos keyframes, 1 ms, una pasada. */
export function opcionesReducidas(a: Animacion): Animacion {
    return { ...a, duracionMs: 1, delayMs: 0, iteraciones: 1 };
}
