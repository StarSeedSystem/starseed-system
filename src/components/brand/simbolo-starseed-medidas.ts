// ════════════════════════════════════════════════════════════════
// StarSeed OS — Medidas del símbolo oficial (ESC1110A)
// ----------------------------------------------------------------
// Muestreadas a mano sobre `public/starseed-symbol.png` (1000 × 1497 px).
// La marca nunca se deforma ni se recolorea: el modelo 3D se construye
// SOLO con estas cifras, en unidades donde 1 = 1000 px del original y el
// origen está en el centro del ojo (500, 748,5). Y crece hacia arriba.
// ════════════════════════════════════════════════════════════════

/** Tamaño del arte de referencia en píxeles. */
export const REFERENCIA = { ancho: 1000, alto: 1497 } as const;

/** Centro del ojo en píxeles de la referencia (origen del modelo). */
export const CENTRO_PX = { x: 500, y: 748.5 } as const;

/** Convierte un punto en píxeles de la referencia a unidades del modelo. */
export function pxAModelo(x: number, y: number): [number, number] {
    return [(x - CENTRO_PX.x) / 1000, (CENTRO_PX.y - y) / 1000];
}

/** Las dos circunferencias de la vesica piscis. */
export const CIRCULOS = {
    superior: { cx: 500, cy: 500, r: 500, claro: "#EAEAEA", sombra: "#CCCCCC" },
    inferior: { cx: 500, cy: 997, r: 500, claro: "#3A3A3A", sombra: "#000000" },
} as const;

/**
 * Diamante: bipirámide de vértices arriba (500, 0) y abajo (500, 1497) con la
 * cintura en y = 748,5. Las aristas de las facetas cortan la cintura en estos
 * x (px); medidos prolongando cada arista desde su vértice. Seis facetas por mitad.
 */
export const DIAMANTE = {
    arriba: { x: 500, y: 0 },
    abajo: { x: 500, y: 1497 },
    cinturaPx: [67, 180, 316, 500, 684, 820, 933],
} as const;

/**
 * Colores de las facetas, de izquierda a derecha (pares de cada color):
 * el tono «sombra» y el «luz» del arte plano dibujan una luz de arriba a la
 * derecha; en 3D esa diferencia la hace la luz real sobre el color base.
 */
export const FACETAS = [
    { nombre: "rojo exterior", arriba: "#A52D2D", abajo: "#A52D2D" },
    { nombre: "rojo interior", arriba: "#CC3737", abajo: "#CC3737" },
    { nombre: "verde / amarillo izquierda", arriba: "#38A52D", abajo: "#C1BD3A" },
    { nombre: "verde / amarillo derecha", arriba: "#51CC37", abajo: "#E2D640" },
    { nombre: "azul interior", arriba: "#2C2CA8", abajo: "#2C2CA8" },
    { nombre: "azul exterior", arriba: "#3636CC", abajo: "#3636CC" },
] as const;

/** Ojo: almendra = intersección de los dos círculos; párpado gris; iris; brillo. */
export const OJO = {
    blanco: "#FFFFFF",
    parpado: { color: "#DCDCDC", cx: 500, cy: 1175.5, r: 615.2 },
    iris: { cx: 500, cy: 748.5, r: 252, color: "#272525" },
    brillo: {
        cx: 585, cy: 647, r: 63,
        color: "#FFFFFF",
        // Media luna gris abajo a la izquierda: el disco blanco es el brillo
        // intersecado con un círculo igual desplazado (+2, −30) px.
        lunaColor: "#DCDCDC", desplazamiento: { x: 2, y: -30 },
    },
} as const;

/** Proporción del arte (alto / ancho) que el modelo debe conservar. */
export const PROPORCION = REFERENCIA.alto / REFERENCIA.ancho;
