/**
 * SIMBOLO-GEOMETRIA — GEOMETRÍA OFICIAL DEL SÍMBOLO STARSEED (DAN1024I)
 * ─────────────────────────────────────────────────────────────────────
 * Módulo PURO: números, puntos y rutas SVG del símbolo oficial
 * (referencia-2), en un lienzo de 400 × 400 con centro (200, 200) y r = 80.
 * Dos discos con centros (200, 160) y (200, 240); lente del ojo entre las
 * esquinas (200 ± 69,28; 200); rombo de dos triángulos equiláteros con
 * ápices (200, 80) y (200, 320) y base en la línea de las esquinas;
 * 12 facetas con rayos a 0°, ±13,86°, ±23,2° y ±30°, cada una con su cara
 * izquierda (oscura) y derecha (clara). Sin red, disco ni reloj.
 */

export interface Punto {
    x: number;
    y: number;
}

export interface Circulo {
    cx: number;
    cy: number;
    r: number;
}

/** Lienzo cuadrado del símbolo (400 × 400) y su centro, vértice de la lente. */
export const LIENZO = 400;
export const CENTRO: Punto = { x: 200, y: 200 };
/** Radio de los dos discos y de los arcos de la lente del ojo. */
export const RADIO = 80;

/** Ápices del rombo y esquinas de la lente (intersección de los discos). */
export const APICE_ARRIBA: Punto = { x: 200, y: 80 };
export const APICE_ABAJO: Punto = { x: 200, y: 320 };
export const ESQUINA_IZQUIERDA: Punto = { x: 130.72, y: 200 };
export const ESQUINA_DERECHA: Punto = { x: 269.28, y: 200 };

/** Los dos discos (vesica piscis), cada uno con su mitad clara y oscura. */
export const DISCOS: (Circulo & { id: string; izquierda: string; derecha: string })[] = [
    { id: "disco-arriba", cx: 200, cy: 160, r: RADIO, izquierda: "#CCCCCC", derecha: "#EAEAEA" },
    { id: "disco-abajo", cx: 200, cy: 240, r: RADIO, izquierda: "#000000", derecha: "#3A3A3A" },
];

/** Ángulos de los rayos desde cada ápice (grados) y su x de base: 120 tan θ. */
export const ANGULOS_RAYOS = [-30, -23.2, -13.86, 0, 13.86, 23.2, 30] as const;
export const BASE_RAYOS: readonly number[] = [-69.28, -51.4, -29.6, 0, 29.6, 51.4, 69.28];

/** El ojo: lente #DCDCDC, blanco dentro del círculo grande, pupila y brillo. */
export const OJO = {
    color: "#DCDCDC",
    blanco: { centro: { x: 200, y: 280.8 }, r: 109.4, color: "#FFFFFF" },
    pupila: { centro: { x: 200, y: 200 }, r: 40, color: "#272525" },
    brillo: { centro: { x: 213.5, y: 183.9 }, r: 10.5, color: "#FFFFFF" },
} as const;

/** Paleta oficial del símbolo: cada color con su cara oscura y su clara. */
export const COLORES = {
    rojo: { oscuro: "#A52D2D", claro: "#CC3737" },
    verde: { oscuro: "#38A52D", claro: "#51CC37" },
    azul: { oscuro: "#2C2CA8", claro: "#3636CC" },
    amarillo: { oscuro: "#C1BD3A", claro: "#E2D640" },
} as const;

export type ColorFaceta = keyof typeof COLORES;

/** Una de las 12 facetas del rombo: porción de triángulo entre dos rayos. */
export interface Faceta {
    id: string;
    lado: "arriba" | "abajo";
    indice: number;
    color: ColorFaceta;
    apice: Punto;
    baseIzquierda: Punto;
    baseDerecha: Punto;
    anguloIzquierdo: number;
    anguloDerecho: number;
    colorIzquierda: string;
    colorDerecha: string;
}

/** Reparto simétrico: arriba (rojo, verde, azul), abajo (rojo, amarillo, azul). */
const NOMBRES_ARRIBA: ColorFaceta[] = ["rojo", "verde", "azul", "azul", "verde", "rojo"];
const NOMBRES_ABAJO: ColorFaceta[] = ["rojo", "amarillo", "azul", "azul", "amarillo", "rojo"];

/** Construye las 6 facetas de un ápice, entre pares de rayos consecutivos. */
function facetasDeLado(
    lado: "arriba" | "abajo",
    apice: Punto,
    nombres: ColorFaceta[],
): Faceta[] {
    return nombres.map((color, indice) => ({
        id: `faceta-${lado}-${indice}`,
        lado,
        indice,
        color,
        apice,
        baseIzquierda: { x: CENTRO.x + BASE_RAYOS[indice], y: CENTRO.y },
        baseDerecha: { x: CENTRO.x + BASE_RAYOS[indice + 1], y: CENTRO.y },
        anguloIzquierdo: ANGULOS_RAYOS[indice],
        anguloDerecho: ANGULOS_RAYOS[indice + 1],
        colorIzquierda: COLORES[color].oscuro,
        colorDerecha: COLORES[color].claro,
    }));
}

/** Las 12 facetas del símbolo: 6 del ápice de arriba y 6 del de abajo. */
export const FACETAS: Faceta[] = [
    ...facetasDeLado("arriba", APICE_ARRIBA, NOMBRES_ARRIBA),
    ...facetasDeLado("abajo", APICE_ABAJO, NOMBRES_ABAJO),
];

/** Rayos oficiales desde un ápice hasta la línea de las esquinas (y = 200). */
export function rayosDe(apice: Punto): { desde: Punto; hasta: Punto; anguloGrados: number }[] {
    return ANGULOS_RAYOS.map((anguloGrados, i) => ({
        desde: apice,
        hasta: { x: CENTRO.x + BASE_RAYOS[i], y: CENTRO.y },
        anguloGrados,
    }));
}

/** Convierte una lista de puntos en una ruta SVG cerrada. */
export function puntosARuta(pts: readonly Punto[]): string {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
}

/** Ruta del rombo completo: los dos triángulos equiláteros con base común. */
export function rutaRombo(): string {
    return puntosARuta([APICE_ARRIBA, ESQUINA_DERECHA, APICE_ABAJO, ESQUINA_IZQUIERDA]);
}

/** La lente del ojo: vesica entre los arcos de los dos discos, esquinas en y = 200. */
export function rutaLente(): string {
    const { x: xi, y } = ESQUINA_IZQUIERDA;
    const xd = ESQUINA_DERECHA.x;
    return `M ${xi} ${y} A ${RADIO} ${RADIO} 0 0 1 ${xd} ${y} A ${RADIO} ${RADIO} 0 0 1 ${xi} ${y} Z`;
}

/** Mitad de un disco: arco de polo a polo por el lado pedido. */
export function rutaMitadDisco(d: Circulo, mitad: "izquierda" | "derecha"): string {
    const r = d.r;
    const barrido = mitad === "izquierda" ? 0 : 1;
    return `M ${d.cx} ${d.cy - r} A ${r} ${r} 0 0 ${barrido} ${d.cx} ${d.cy + r} Z`;
}

/** Divide una faceta en sus dos caras: la izquierda oscura y la derecha clara. */
export function mitadesDeFaceta(f: Faceta): { izquierda: Punto[]; derecha: Punto[] } {
    const medio = { x: (f.baseIzquierda.x + f.baseDerecha.x) / 2, y: CENTRO.y };
    return {
        izquierda: [f.apice, f.baseIzquierda, medio],
        derecha: [medio, f.baseDerecha, f.apice],
    };
}

/** Ruta SVG de una de las dos caras de una faceta. */
export function rutaMitadFaceta(f: Faceta, mitad: "izquierda" | "derecha"): string {
    return puntosARuta(mitadesDeFaceta(f)[mitad]);
}
