/** SÍMBOLO STARSEED — GEOMETRÍA OFICIAL (DAN1024I · referencia-2). Módulo PURO:
 * lienzo 400×400, centro (200, 200) y dos círculos r = 80 en (200,160)/(200,240);
 * lente del ojo con esquinas (200 ± 69,28; 200); rombo de dos triángulos equiláteros
 * (ápices (200, 80) y (200, 320)) con 12 facetas cara izquierda oscura y derecha clara;
 * ojo con blanco dentro del círculo de centro (200, 280,8) r 109,4, pupila r 40 y
 * brillo r 10,5 en (213,5; 183,9). Sin red, sin disco, sin reloj y sin `node:*`. */

export const LIENZO = { ancho: 400, alto: 400 } as const;

/** Centro óptico del símbolo y radio de los dos círculos. */
export const CENTRO = { x: 200, y: 200 } as const;
export const RADIO = 80;

/** Esquinas de la lente y ápices del rombo. */
export const ESQUINAS = { izquierda: { x: 130.72, y: 200 }, derecha: { x: 269.28, y: 200 } } as const;
export const APEXES = { arriba: { x: 200, y: 80 }, abajo: { x: 200, y: 320 } } as const;

/** Una faceta del rombo: triángulo de un ápice a un tramo de la base (y = 200). */
export interface Faceta {
    /** Mitad del rombo a la que pertenece. */
    mitad: "arriba" | "abajo";
    /** Hex oficial con el que se pinta. */
    color: string;
    /** x de los bordes del tramo de base (y = 200) e y del ápice del que nace. */
    xIzquierda: number;
    xDerecha: number;
    yApice: number;
}

/** Colores oficiales de facetas, ojo y discos: cada pareja con su tono oscuro y claro. */
export const COLORES_FACETAS = {
    rojoOscuro: "#A52D2D", rojoClaro: "#CC3737",
    verdeOscuro: "#38A52D", verdeClaro: "#51CC37",
    azulOscuro: "#2C2CA8", azulClaro: "#3636CC",
    amarilloOscuro: "#C1BD3A", amarilloClaro: "#E2D640",
} as const;

export const COLORES_OJO = {
    lente: "#DCDCDC", blanco: "#FFFFFF", pupila: "#272525", brillo: "#FFFFFF",
} as const;

export const COLORES_DISCOS = {
    arribaIzquierda: "#CCCCCC", arribaDerecha: "#EAEAEA",
    abajoIzquierda: "#000000", abajoDerecha: "#3A3A3A",
} as const;

/** x de la base (desde el centro) de los 7 rayos de cada ápice. */
const DESFASES_BASE = [-69.28, -51.4, -29.6, 0, 29.6, 51.4, 69.28] as const;

/** Arriba: rojo, verde y azul; abajo: rojo, amarillo y azul; a la izquierda, la oscura. */
const PALETA_ARRIBA: string[] = [
    COLORES_FACETAS.rojoOscuro, COLORES_FACETAS.verdeOscuro, COLORES_FACETAS.azulOscuro,
    COLORES_FACETAS.azulClaro, COLORES_FACETAS.verdeClaro, COLORES_FACETAS.rojoClaro,
];
const PALETA_ABAJO: string[] = [
    COLORES_FACETAS.rojoOscuro, COLORES_FACETAS.amarilloOscuro, COLORES_FACETAS.azulOscuro,
    COLORES_FACETAS.azulClaro, COLORES_FACETAS.amarilloClaro, COLORES_FACETAS.rojoClaro,
];

function mitadRombo(mitad: "arriba" | "abajo", paleta: string[], yApice: number): Faceta[] {
    return paleta.map((color, i): Faceta => ({
        mitad, color, yApice,
        xIzquierda: CENTRO.x + DESFASES_BASE[i],
        xDerecha: CENTRO.x + DESFASES_BASE[i + 1],
    }));
}

/** Las 12 facetas oficiales: 6 arriba, 6 abajo, en orden izquierda → derecha. */
export const FACETAS: readonly Faceta[] = [
    ...mitadRombo("arriba", PALETA_ARRIBA, APEXES.arriba.y),
    ...mitadRombo("abajo", PALETA_ABAJO, APEXES.abajo.y),
];

/** Ruta SVG de una faceta: del ápice a sus dos puntos de la base. */
export function rutaDeFaceta(f: Faceta): string {
    return `M ${CENTRO.x} ${f.yApice} L ${f.xIzquierda} ${ESQUINAS.izquierda.y} L ${f.xDerecha} ${ESQUINAS.derecha.y} Z`;
}

/** Ruta SVG de la lente del ojo, la intersección de los dos discos. */
export const RUTA_LENS =
    `M ${ESQUINAS.izquierda.x} 200 A ${RADIO} ${RADIO} 0 0 1 ${ESQUINAS.derecha.x} 200 ` +
    `A ${RADIO} ${RADIO} 0 0 1 ${ESQUINAS.izquierda.x} 200 Z`;

/** Los dos discos del símbolo: cada uno pinta su `circle` a la izquierda y recubre la derecha. */
export interface Disco {
    cx: number;
    cy: number;
    r: number;
    colorIzquierda: string;
    colorDerecha: string;
    /** Ruta de la semicircunferencia derecha (el resto la pinta `circle`). */
    rutaDerecha: string;
}

/** Disco superior, centro (200, 160), r = 80: #CCCCCC izquierda / #EAEAEA derecha. */
export const DISCO_ARRIBA: Disco = {
    cx: 200, cy: 160, r: RADIO,
    colorIzquierda: COLORES_DISCOS.arribaIzquierda, colorDerecha: COLORES_DISCOS.arribaDerecha,
    rutaDerecha: `M 200 80 A ${RADIO} ${RADIO} 0 0 1 200 240 Z`,
};

/** Disco inferior, centro (200, 240), r = 80: #000000 izquierda / #3A3A3A derecha. */
export const DISCO_ABAJO: Disco = {
    cx: 200, cy: 240, r: RADIO,
    colorIzquierda: COLORES_DISCOS.abajoIzquierda, colorDerecha: COLORES_DISCOS.abajoDerecha,
    rutaDerecha: `M 200 160 A ${RADIO} ${RADIO} 0 0 1 200 320 Z`,
};

/** El blanco del ojo: la lente recortada por este círculo (clip en el componente). */
export const BLANCO_OJO = { cx: 200, cy: 280.8, r: 109.4 } as const;

/** La pupila y su brillo, centrados sobre el centro óptico del ojo. */
export const PUPILA = { cx: 200, cy: 200, r: 40 } as const;
export const BRILLO = { cx: 213.5, cy: 183.9, r: 10.5 } as const;

