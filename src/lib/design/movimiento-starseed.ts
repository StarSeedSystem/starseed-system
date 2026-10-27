/**
 * BIBLIOTECA DE MOVIMIENTO STARSEED (DSN1019G) — WAAPI puro, módulo sin lado.
 * Vocabulario de la marca para `element.animate(anim.cuadros, anim.opciones)`;
 * copia el comportamiento aprobado de `examples/transiciones.html`,
 * `siembra.html` y `cristal-3d.html` del estudio audiovisual, bajo las reglas
 * del ADN (`adn-y-tokens.md` §5): solo se animan transform, opacity, filter y
 * clip-path; curvas y duraciones reales; sin hexadecimales (el color lo pone
 * el CSS del elemento); siempre versión de movimiento reducido
 * (`opcionesReducidas`: duración 0, el estado final se queda, como
 * `respetarMovimientoReducido` de `movimiento.ts`).
 */

/** Curvas reales del OS (tokens.css: --ss-ease-organic, -glide y -genesis). */
export const CURVAS = {
    organico: "cubic-bezier(0.22, 1, 0.36, 1)", // entradas y respiración
    glide: "cubic-bezier(0.16, 1, 0.3, 1)", // deslices y cambios de escena
    genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)", // lo técnico
} as const;

/** Duraciones reales: interfaz (140/220/240 ms) y escena (600–900 ms). */
export const DURACIONES = {
    interfazRapida: 140,
    interfazOrganica: 220,
    interfazNormal: 240,
    escenaEntrada: 720, // entrada cardinal
    escenaCambio: 600, // fundido con desenfoque
    escenaObjetivo: 640, // elemento compartido
    escenaHorizonte: 700, // barrido de horizonte
    escenaCelebracion: 900, // alquimia
    respiracionCiclo: 5000, // respiración (4–6 s por ciclo)
} as const;

/** Las únicas cuatro propiedades que la marca anima. */
export type PropiedadAnimable = "transform" | "opacity" | "filter" | "clipPath";

/** Cuadro WAAPI: solo propiedades de la marca, con offset opcional (0–1). */
export interface Cuadro {
    transform?: string;
    opacity?: number;
    filter?: string;
    clipPath?: string;
    offset?: number;
}

/** Opciones WAAPI: duración, curva y extras (retardo, fill, iteraciones, dirección). */
export interface Opciones {
    duracionMs: number;
    curva: string;
    retardoMs?: number;
    relleno?: "none" | "forwards" | "backwards" | "both";
    iteraciones?: number;
    direccion?: "normal" | "reverse" | "alternate" | "alternate-reverse";
}

/** Una animación completa, lista para `element.animate`. */
export interface Animacion {
    cuadros: Cuadro[];
    opciones: Opciones;
}

/** Punto de la Trinity: zenith (norte), horizonte (oeste), logica (este), anchor (sur). */
export type PuntoTrinity = "zenith" | "horizonte" | "logica" | "anchor";

/** Ayuda interna: monta una `Animacion` con `fill: both` de serie. */
const anima = (
    cuadros: Cuadro[],
    duracionMs: number,
    curva: string,
    extra: Partial<Opciones> = {},
): Animacion => ({ cuadros, opciones: { duracionMs, curva, relleno: "both", ...extra } });

/** Desde dónde entra y hasta dónde se asienta un panel, por su punto de la Trinity. */
const DESCUADRE: Record<PuntoTrinity, { ida: string; asiento: string }> = {
    zenith: { ida: "translateY(-24px)", asiento: "translateY(-22px)" },
    anchor: { ida: "translateY(24px)", asiento: "translateY(22px)" },
    horizonte: { ida: "translateX(-24px)", asiento: "translateX(-22px)" },
    logica: { ida: "translateX(24px)", asiento: "translateX(22px)" },
};

/** ENTRADA CARDINAL — entra desde el borde de su punto de la Trinity (24 px de
 * recorrido) hacia el centro y se asienta 2 px antes de fijarse. */
export function entradaCardinal(punto: PuntoTrinity): Animacion {
    const { ida, asiento } = DESCUADRE[punto];
    return anima(
        [{ transform: `${ida} scale(0.98)`, opacity: 0 }, { transform: asiento, opacity: 1, offset: 0.8 }, { transform: "none", opacity: 1 }],
        DURACIONES.escenaEntrada,
        CURVAS.glide,
    );
}

/** FUNDIDO CON DESENFOQUE — cambiar de escena sin corte: blur 8px → 0 y opacidad 0 → 1. */
export function fundidoConDesenfoque(): Animacion {
    return anima(
        [{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0px)", opacity: 1 }],
        DURACIONES.escenaCambio,
        CURVAS.organico,
    );
}

/** ELEMENTO COMPARTIDO — crece con transform (nunca con anchos y altos) hasta
 * ocupar la ventana; `conVuelta` devuelve a la ida, como en la demo. */
export function elementoCompartido(conVuelta = false): Animacion {
    return anima(
        [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(2.6, 3.2)", opacity: 1 }],
        DURACIONES.escenaObjetivo,
        CURVAS.glide,
        conVuelta ? { direccion: "alternate", iteraciones: 2 } : {},
    );
}

/** Resultado del barrido: la línea que cruza y la escena que queda revelada. */
export interface BarridoDeHorizonte {
    linea: Animacion;
    escena: Animacion;
}

/** BARRIDO DE HORIZONTE — jugada rara, una vez por pieza: la línea cruza (el
 * `transform-origin: left` lo pone el CSS del elemento) y revela la escena
 * con clip-path, con 300 ms de diferencia. */
export function barridoDeHorizonte(): BarridoDeHorizonte {
    return {
        linea: anima(
            [{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(1)", opacity: 1 }],
            DURACIONES.escenaHorizonte,
            CURVAS.glide,
        ),
        escena: anima(
            [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
            DURACIONES.escenaHorizonte,
            CURVAS.glide,
            { retardoMs: 300 },
        ),
    };
}

/** RESPIRACIÓN — escala 1 → 1.03 en bucle alterno, calma que no roba foco
 * (§5 del ADN); ciclo topado a 4–6 s y 5000 ms por defecto. */
export function respiracion(cicloMs = DURACIONES.respiracionCiclo): Animacion {
    return anima(
        [{ transform: "scale(1)" }, { transform: "scale(1.03)" }],
        Math.min(6000, Math.max(4000, cicloMs)),
        CURVAS.organico,
        { iteraciones: Infinity, direccion: "alternate" },
    );
}

/** CRISTALIZACIÓN — un nodo disperso se ordena hacia su sitio de la retícula
 * (cristal-3d.html): el desorden sale del índice, no de la suerte, y el
 * conjunto se escala 60 ms por nodo con tope de 360 ms. */
export function cristalizacion(indice: number, total = 6): Animacion {
    const angulo = ((indice % total) / total) * Math.PI * 2;
    const lejos = 18 + (indice % 3) * 8;
    const disperso = `translate(${(Math.cos(angulo) * lejos).toFixed(1)}px, ${(Math.sin(angulo) * lejos).toFixed(1)}px) scale(0.6)`;
    return anima(
        [{ transform: disperso, opacity: 0 }, { transform: "none", opacity: 1 }],
        DURACIONES.escenaCambio,
        CURVAS.organico,
        { retardoMs: Math.min(indice * 60, 360) },
    );
}

/** ALQUIMIA — un elemento gris despierta su oro al cumplir su propósito: el
 * dorado lo pone el CSS del elemento (token de `logica`); aquí solo se anima
 * la saturación del filtro y el asiento de la escala. */
export function alquimia(): Animacion {
    return anima(
        [
            { filter: "grayscale(100%)", opacity: 0.75, transform: "scale(0.995)" },
            { filter: "grayscale(0%)", opacity: 1, transform: "none" },
        ],
        DURACIONES.escenaCelebracion,
        CURVAS.organico,
    );
}
/** MOVIMIENTO REDUCIDO — versión de cualquier animación para
 * `prefers-reduced-motion: reduce`: queda el estado final (duración 0, sin
 * retardo, una repetición); el elemento es usable, no se mueve. */
export function opcionesReducidas(opciones: Opciones): Opciones {
    return { ...opciones, duracionMs: 0, retardoMs: 0, iteraciones: 1 };
}

/** Resultado de la siembra: los seis pasos, en su orden del ejemplo. */
export interface Siembra {
    punto: Animacion;
    vesicaIzq: Animacion;
    vesicaDer: Animacion;
    ojo: Animacion;
    pupila: Animacion;
    diamante: Animacion;
}

/** SIEMBRA — el símbolo germina (`siembra.html`, 2,4 s en total): el punto
 * escala y se apaga, los dos círculos abren la vesica piscis desde el centro,
 * el ojo despierta en scaleY (y su pupila) y el diamante se asienta; después
 * el conjunto respira con `respiracion`. El trazado del contorno del diamante
 * (stroke-dashoffset) lo dibuja el SVG de la pieza: aquí solo se anima lo que
 * la marca permite. */
export function siembra(): Siembra {
    return {
        punto: anima(
            [{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1.4)", opacity: 1, offset: 0.6 }, { transform: "scale(1)", opacity: 0 }],
            400,
            CURVAS.organico,
        ),
        vesicaIzq: anima(
            [{ transform: "translateX(40px) scale(0.2)", opacity: 0 }, { transform: "none", opacity: 1 }],
            700,
            CURVAS.glide,
            { retardoMs: 350 },
        ),
        vesicaDer: anima(
            [{ transform: "translateX(-40px) scale(0.2)", opacity: 0 }, { transform: "none", opacity: 1 }],
            700,
            CURVAS.glide,
            { retardoMs: 350 },
        ),
        ojo: anima([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], 500, CURVAS.organico, { retardoMs: 1050 }),
        pupila: anima([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], 400, CURVAS.organico, { retardoMs: 1250 }),
        diamante: anima(
            [{ transform: "scale(0.9)", opacity: 0 }, { transform: "none", opacity: 1 }],
            800,
            CURVAS.glide,
            { retardoMs: 1500 },
        ),
    };
}
