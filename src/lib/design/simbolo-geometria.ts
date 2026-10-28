/**
 * GEOMETRÍA OFICIAL DEL SÍMBOLO STARSEED (DAN1024I · Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: sin red, disco, reloj ni DOM. Describe el símbolo de referencia-2
 * en un lienzo de 400 × 400 con centro (200, 200) y radio r = 80: dos círculos
 * que forman la lente del ojo, el rombo de dos triángulos equiláteros y sus 12
 * facetas. Los componentes solo pintan estas rutas; la geometría no se inventa
 * en cada pantalla.
 */

export interface Punto {
    x: number;
    y: number;
}

export interface Faceta {
    id: string;
    lado: "arriba" | "abajo";
    indice: number;
    color: string;
    puntos: [Punto, Punto, Punto];
    d: string;
}

/** Lienzo cuadrado del símbolo. */
export const LIENZO = 400;
export const CENTRO: Punto = { x: 200, y: 200 };
export const RADIO = 80;

export const CENTROS_DISCOS = {
    arriba: { x: 200, y: 160 },
    abajo: { x: 200, y: 240 },
} as const;

export const APICES = {
    arriba: { x: 200, y: 80 },
    abajo: { x: 200, y: 320 },
} as const;

/** Esquinas donde se cruzan los dos círculos: la lente cae siempre en y = 200. */
export const ESQUINAS: readonly [Punto, Punto] = [
    { x: 200 - 69.28, y: 200 },
    { x: 200 + 69.28, y: 200 },
];

/** Los siete puntos de la base: 200 + {−69,28 … 69,28}. */
export const BASE_X = [-69.28, -51.4, -29.6, 0, 29.6, 51.4, 69.28].map((dx) => 200 + dx);

export const COLORES = {
    arriba: ["#A52D2D", "#CC3737", "#38A52D", "#51CC37", "#2C2CA8", "#3636CC"],
    abajo: ["#A52D2D", "#CC3737", "#C1BD3A", "#E2D640", "#2C2CA8", "#3636CC"],
    discos: {
        arribaIzquierda: "#CCCCCC",
        arribaDerecha: "#EAEAEA",
        abajoIzquierda: "#000000",
        abajoDerecha: "#3A3A3A",
    },
    ojo: "#DCDCDC",
    pupila: "#272525",
    brillo: "#FFFFFF",
} as const;

/** El ojo: la lente se recorta con este círculo para dejar el blanco dentro. */
export const OJO = { cx: 200, cy: 280.8, r: 109.4 } as const;
export const PUPILA = { cx: 200, cy: 200, r: 40 } as const;
export const BRILLO = { cx: 213.5, cy: 183.9, r: 10.5 } as const;
/** El punto del que nace la siembra; queda tapado por discos, ojo y facetas. */
export const SEMILLA = { cx: 200, cy: 200, r: 6 } as const;

function rutaTriangulo(apice: Punto, y: number, x1: number, x2: number): string {
    return `M ${apice.x} ${apice.y} L ${x1} ${y} L ${x2} ${y} Z`;
}

function crearFacetas(): Faceta[] {
    const lados = [
        { lado: "arriba" as const, apice: APICES.arriba, colores: COLORES.arriba },
        { lado: "abajo" as const, apice: APICES.abajo, colores: COLORES.abajo },
    ];
    return lados.flatMap(({ lado, apice, colores }) =>
        colores.map((color, indice) => {
            const x1 = BASE_X[indice];
            const x2 = BASE_X[indice + 1];
            return {
                id: `${lado}-${indice}`,
                lado,
                indice,
                color,
                puntos: [apice, { x: x1, y: 200 }, { x: x2, y: 200 }] as [Punto, Punto, Punto],
                d: rutaTriangulo(apice, 200, x1, x2),
            };
        }),
    );
}

/** La lista completa: 6 facetas por triángulo, 12 en total. */
export const FACETAS: readonly Faceta[] = crearFacetas();

function semicirculo(cx: number, cy: number, r: number, sentido: 0 | 1): string {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sentido} ${cx} ${cy + r} Z`;
}

/** Círculo completo como ruta SVG (dos arcos), útil para pupilas y destellos. */
export function rutaCirculo(cx: number, cy: number, r: number): string {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

/** Rutas SVG listas para pintar, en coordenadas del lienzo. */
export const RUTAS = {
    discoArribaIzquierda: semicirculo(200, 160, RADIO, 0),
    discoArribaDerecha: semicirculo(200, 160, RADIO, 1),
    discoAbajoIzquierda: semicirculo(200, 240, RADIO, 0),
    discoAbajoDerecha: semicirculo(200, 240, RADIO, 1),
    lente: `M ${ESQUINAS[0].x} 200 A ${RADIO} ${RADIO} 0 0 1 ${ESQUINAS[1].x} 200 A ${RADIO} ${RADIO} 0 0 1 ${ESQUINAS[0].x} 200 Z`,
    ojo: rutaCirculo(OJO.cx, OJO.cy, OJO.r),
    pupila: rutaCirculo(PUPILA.cx, PUPILA.cy, PUPILA.r),
    brillo: rutaCirculo(BRILLO.cx, BRILLO.cy, BRILLO.r),
    semilla: rutaCirculo(SEMILLA.cx, SEMILLA.cy, SEMILLA.r),
} as const;
