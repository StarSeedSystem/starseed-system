/**
 * Siluetas vectoriales de las piezas de ajedrez (viewBox 0 0 100 100). Propias y sencillas: los
 * símbolos Unicode (♟ ♞…) se pintan como emoji en algunas plataformas y no se pueden colorear
 * igual en todas. Datos puros; las pinta `piezas-ajedrez.tsx`.
 */

export interface FormaPieza {
    /** Trazados rellenos (con el color del bando y su contorno). */
    rellenos: string[];
    /** Círculos rellenos [cx, cy, r]. */
    circulos: [number, number, number][];
    /** Líneas de detalle que se pintan con el color de contorno (hendiduras). */
    detalles: string[];
    /** Puntos de detalle [cx, cy, r] pintados como el contorno (ojo del caballo). */
    puntos: [number, number, number][];
}

const PEANA = "M24 90 H76 Q81 90 81 85 V80 H19 V85 Q19 90 24 90 Z";

export const FORMAS_PIEZA: Record<"p" | "n" | "b" | "r" | "q" | "k", FormaPieza> = {
    p: {
        rellenos: [
            PEANA,
            "M50 42 C58 42 61 49 56 55 C65 61 69 70 69 80 H31 C31 70 35 61 44 55 C39 49 42 42 50 42 Z",
        ],
        circulos: [[50, 30, 12]],
        detalles: [],
        puntos: [],
    },
    r: {
        rellenos: [
            PEANA,
            "M27 80 V72 L33 66 V45 L27 39 V18 H39 V27 H44.5 V18 H55.5 V27 H61 V18 H73 V39 L67 45 V66 L73 72 V80 Z",
        ],
        circulos: [],
        detalles: ["M33 45 H67"],
        puntos: [],
    },
    n: {
        rellenos: [
            PEANA,
            "M27 80 C26 62 32 52 43 44 C36 44 30 46 24 53 C21 51 19 46 22 41 C26 31 34 22 47 18 L51 9 L57 18 C73 23 79 41 77 61 C76 69 77 74 77 80 Z",
        ],
        circulos: [],
        detalles: ["M28 47 C33 45 38 43 43 44"],
        puntos: [[56, 33, 3]],
    },
    b: {
        rellenos: [
            PEANA,
            "M50 22 C63 30 68 43 61 55 C65 59 68 65 66 72 C65 76 66 78 68 80 H32 C34 78 35 76 34 72 C32 65 35 59 39 55 C32 43 37 30 50 22 Z",
        ],
        circulos: [[50, 15, 6.5]],
        detalles: ["M44 42 L56 34"],
        puntos: [],
    },
    q: {
        rellenos: [
            PEANA,
            "M18 32 L27 51 L34 26 L42 50 L50 22 L58 50 L66 26 L73 51 L82 32 L74 72 C76 76 74 78 72 80 H28 C26 78 24 76 26 72 Z",
        ],
        circulos: [[18, 28, 4.5], [34, 21, 4.5], [50, 17, 4.5], [66, 21, 4.5], [82, 28, 4.5]],
        detalles: ["M29 66 H71"],
        puntos: [],
    },
    k: {
        rellenos: [
            PEANA,
            "M45.5 5 H54.5 V13 H62 V21 H54.5 V29 H45.5 V21 H38 V13 H45.5 Z",
            "M50 31 C69 31 79 46 73 60 C71 66 69 70 69 75 V80 H31 V75 C31 70 29 66 27 60 C21 46 31 31 50 31 Z",
        ],
        circulos: [],
        detalles: ["M33 64 H67"],
        puntos: [],
    },
};

export type TipoPieza = keyof typeof FORMAS_PIEZA;
