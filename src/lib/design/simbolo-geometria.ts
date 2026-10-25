/**
 * SÍMBOLO STARSEED · GEOMETRÍA OFICIAL (referencia-2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: vesica piscis, rombo de dos triángulos equiláteros, 12 facetas y
 * el ojo. Solo matemática y rutas SVG; sin red, disco, reloj ni `node:*`.
 * Lienzo de 400 × 400 con centro (200, 200) y radios de disco r = 80.
 */

export interface Punto { x: number; y: number }

/** Una de las 12 facetas del rombo: sector triangular entre dos rayos del ápice. */
export interface Faceta {
    id: string;
    /** Mitad del símbolo desde la que nace (qué ápice). */
    lado: "arriba" | "abajo";
    color: "rojo" | "verde" | "azul" | "amarillo";
    /** Cara izquierda las oscuras, cara derecha las claras. */
    variante: "oscura" | "clara";
    hex: string;
    /** Ruta SVG del triángulo: ápice + dos puntos consecutivos de la base. */
    camino: string;
}

/** Lienzo y radios oficiales. */
export const LIENZO = { ancho: 400, alto: 400, centroX: 200, centroY: 200 } as const;

/** Los dos discos de la vesica: r = 80, centros (200, 160) y (200, 240). */
export const DISCOS = {
    radio: 80,
    centros: { arriba: { x: 200, y: 160 }, abajo: { x: 200, y: 240 } } as Record<"arriba" | "abajo", Punto>,
    hexes: { arribaIzq: "#CCCCCC", arribaDer: "#EAEAEA", abajoIzq: "#000000", abajoDer: "#3A3A3A" },
} as const;

/** Esquinas de la lente del ojo (intersección de ambos círculos): y = 200. */
export const ESQUINAS_LENS: [Punto, Punto] = [
    { x: 200 - 69.28, y: 200 },
    { x: 200 + 69.28, y: 200 },
];

/** Ápices del rombo de dos triángulos equiláteros, con la base en la línea de esquinas. */
export const APEXES = { arriba: { x: 200, y: 80 }, abajo: { x: 200, y: 320 } };

/** Ángulos (grados, desde la vertical de cada ápice) de los rayos: 7 por ápice. */
export const ANGULOS_RAYOS = [-30, -23.2, -13.86, 0, 13.86, 23.2, 30] as const;

/** Cruce de cada rayo con la línea de base: x = 200 + {−69,28 … 69,28}. */
export const PUNTOS_BASE_X: number[] = [130.72, 148.6, 170.4, 200, 229.6, 251.4, 269.28];

/** Colores del ojo: párpado, blanco, pupila y brillo (con sus geometrías). */
export const OJO = {
    parpado: "#DCDCDC",
    blanco: { centro: { x: 200, y: 280.8 } as Punto, radio: 109.4 },
    pupila: { hex: "#272525", centro: { x: 200, y: 200 } as Punto, radio: 40 },
    brillo: { hex: "#FFFFFF", centro: { x: 213.5, y: 183.9 } as Punto, radio: 10.5 },
} as const;

/** Colores oficiales arriba (rojo, verde, azul) y abajo (rojo, amarillo, azul): izquierda oscura, derecha clara. */
const COLORES_ARRIBA = [
    { color: "rojo", hex: "#A52D2D" }, { color: "verde", hex: "#38A52D" },
    { color: "azul", hex: "#2C2CA8" }, { color: "azul", hex: "#3636CC" },
    { color: "verde", hex: "#51CC37" }, { color: "rojo", hex: "#CC3737" },
] as Array<Pick<Faceta, "color" | "hex">>;

const COLORES_ABAJO = [
    { color: "rojo", hex: "#A52D2D" }, { color: "amarillo", hex: "#C1BD3A" },
    { color: "azul", hex: "#2C2CA8" }, { color: "azul", hex: "#3636CC" },
    { color: "amarillo", hex: "#E2D640" }, { color: "rojo", hex: "#CC3737" },
] as Array<Pick<Faceta, "color" | "hex">>;

/** Ruta de la lente del ojo: dos arcos de r = 80 entre las esquinas, por vesica piscis. */
export function rutaLente(): string {
    const [izq, der] = ESQUINAS_LENS;
    return `M ${izq.x} ${izq.y} A 80 80 0 0 1 ${der.x} ${der.y} A 80 80 0 0 1 ${izq.x} ${izq.y} Z`;
}

/** Las 4 mitades de disco (arriba/abajo, izquierda oscura / derecha clara). */
export function caminosDiscos(): Array<{ id: string; hex: string; camino: string }> {
    const a = DISCOS.centros.arriba;
    const b = DISCOS.centros.abajo;
    const r = DISCOS.radio;
    // Barrido 0 = semicírculo izquierdo (antihorario en pantalla), 1 = derecho.
    const mitad = (c: Punto, barrido: 0 | 1): string =>
        `M ${c.x} ${c.y - r} A ${r} ${r} 0 0 ${barrido} ${c.x} ${c.y + r} Z`;
    return [
        { id: "disco-arriba-izquierda", hex: DISCOS.hexes.arribaIzq, camino: mitad(a, 0) },
        { id: "disco-arriba-derecha", hex: DISCOS.hexes.arribaDer, camino: mitad(a, 1) },
        { id: "disco-abajo-izquierda", hex: DISCOS.hexes.abajoIzq, camino: mitad(b, 0) },
        { id: "disco-abajo-derecha", hex: DISCOS.hexes.abajoDer, camino: mitad(b, 1) },
    ];
}

/** Contorno del rombo completo (los cuatro vértices). */
export function rutaRombo(): string {
    const e = ESQUINAS_LENS;
    return `M ${APEXES.arriba.x} ${APEXES.arriba.y} L ${e[1].x} ${e[0].y} L ${APEXES.abajo.x} ${APEXES.abajo.y} L ${e[0].x} ${e[0].y} Z`;
}

/** Las 12 facetas del rombo (6 por lado), bandas de base de fuera a dentro. */
export function facetas(): Faceta[] {
    const salidas: Faceta[] = [];
    const orden: Array<"arriba" | "abajo"> = ["arriba", "abajo"];
    for (const lado of orden) {
        const apex = lado === "arriba" ? APEXES.arriba : APEXES.abajo;
        const colores = lado === "arriba" ? COLORES_ARRIBA : COLORES_ABAJO;
        for (let banda = 0; banda < 6; banda++) {
            const x1 = PUNTOS_BASE_X[banda];
            const x2 = PUNTOS_BASE_X[banda + 1];
            const { color, hex } = colores[banda];
            salidas.push({
                id: `${lado}-${color}-${banda < 3 ? "oscura" : "clara"}`,
                lado,
                color,
                variante: banda < 3 ? "oscura" : "clara",
                hex,
                camino: `M ${apex.x} ${apex.y} L ${x1} 200 L ${x2} 200 Z`,
            });
        }
    }
    return salidas;
}
