/**
 * GEOMETRÍA DEL SÍMBOLO OFICIAL DE STARSEED (referencia-2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: números y rutas SVG del símbolo. Sin red, sin disco, sin reloj
 * y sin `node:*`: el componente de marca (cliente) los consume tal cual.
 *
 * Lienzo de 400 × 400 con centro (200, 200) y r = 80. Dos círculos de radio 80
 * con centros (200, 160) y (200, 240) forman el ojo en la lente de la vesica,
 * con esquinas en (200 ± 69,28; 200). Un rombo de dos triángulos equiláteros
 * lleva 12 facetas: rayos desde cada ápice a 0°, ±13,86°, ±23,2° y ±30°.
 *
 * La ÚNICA fuente de duraciones y curvas de la siembra es movimiento.ts.
 */

export type Lado = "arriba" | "abajo";

export interface Punto {
    x: number;
    y: number;
}

/** Un círculo por su centro y radio. */
export interface Circulo {
    cx: number;
    cy: number;
    r: number;
}

/** Disco (mitad izquierda / derecha con su hex) de los dos círculos. */
export interface Disco {
    lado: Lado;
    colorIzquierda: string;
    colorDerecha: string;
}

/** Faceta del rombo: triángulo de ápice a dos puntos de la base. */
export interface Faceta {
    id: string;
    lado: Lado;
    indice: number;
    apex: Punto;
    baseA: Punto;
    baseB: Punto;
    colorOscuro: string;
    colorClaro: string;
    color: string;
}

/** Lienzo oficial del símbolo: 400 × 400, centro (200, 200), r = 80. */
export const LIENZO = 400;
export const CENTRO: Punto = { x: 200, y: 200 };
export const RADIO = 80;

/** Los dos círculos del símbolo, con sus discos y sus horizontales. */
export const CIRCULO_ARRIBA: Circulo = { cx: 200, cy: 160, r: RADIO };
export const CIRCULO_ABAJO: Circulo = { cx: 200, cy: 240, r: RADIO };
export const ESQUINA_IZQUIERDA: Punto = { x: 130.72, y: 200 };
export const ESQUINA_DERECHA: Punto = { x: 269.28, y: 200 };
export const DISCOS: Disco[] = [
    { lado: "arriba", colorIzquierda: "#CCCCCC", colorDerecha: "#EAEAEA" },
    { lado: "abajo", colorIzquierda: "#000000", colorDerecha: "#3A3A3A" },
];

/** El ojo: base #DCDCDC en la lente, blanco, pupila y brillo. */
export const OJO = {
    /** La lente de la vesica, dibujada en el hex base del ojo. */
    baseColor: "#DCDCDC",
    /** Esclerótica: círculo grande recortado POR la lente (énfasis en el componente). */
    blanco: { cx: 200, cy: 280.8, r: 109.4, color: "#FFFFFF" },
    /** Pupila en el centro óptico del símbolo. */
    pupila: { cx: 200, cy: 200, r: 40, color: "#272525" },
    /** Brillo arriba a la derecha de la pupila. */
    brillo: { cx: 213.5, cy: 183.9, r: 10.5, color: "#FFFFFF" },
} as const;

/** Ápices de los triángulos equiláteros del rombo. */
export const APICE_ARRIBA: Punto = { x: 200, y: 80 };
export const APICE_ABAJO: Punto = { x: 200, y: 320 };
export const VERTICES_ROMBO: Punto[] = [
    APICE_ARRIBA,
    ESQUINA_DERECHA,
    APICE_ABAJO,
    ESQUINA_IZQUIERDA,
];

/** x = 200 + desplazamiento: los siete bordes de la base a 0/±13,86/±23,2/±30 grados. */
export const DESPLAZAMIENTOS_BASE = [-69.28, -51.4, -29.6, 0, 29.6, 51.4, 69.28] as const;

/** Ruta del rombo completo (los cuatro vértices). */
export function rutaRombo(): string {
    const [a, b, c, d] = VERTICES_ROMBO;
    return `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} L ${d.x} ${d.y} Z`;
}

/** Ruta de la lente (ojo): dos arcos de radio r entre las esquinas. */
export function rutaLente(): string {
    const izq = ESQUINA_IZQUIERDA;
    const der = ESQUINA_DERECHA;
    return `M ${izq.x} ${izq.y} A ${RADIO} ${RADIO} 0 0 1 ${der.x} ${der.y} A ${RADIO} ${RADIO} 0 0 1 ${izq.x} ${izq.y} Z`;
}

/** Ruta de un triángulo equilátero del rombo. */
export function rutaTriangulo(lado: Lado): string {
    const apex = lado === "arriba" ? APICE_ARRIBA : APICE_ABAJO;
    const izq = ESQUINA_IZQUIERDA;
    const der = ESQUINA_DERECHA;
    return `M ${apex.x} ${apex.y} L ${der.x} ${der.y} L ${izq.x} ${izq.y} Z`;
}

/** Semicírculo de un disco (mitad izquierda o derecha). */
export const BORDES_DISCO: Record<Lado, { puntoA: Punto; puntoB: Punto }> = {
    arriba: { puntoA: { x: 200, y: 80 }, puntoB: { x: 200, y: 240 } },
    abajo: { puntoA: { x: 200, y: 160 }, puntoB: { x: 200, y: 320 } },
};

export function rutaDisco(lado: Lado, mitad: "izquierda" | "derecha"): string {
    const bordes = BORDES_DISCO[lado];
    const barrido = mitad === "derecha" ? 1 : 0;
    return `M ${bordes.puntoA.x} ${bordes.puntoA.y} A ${RADIO} ${RADIO} 0 0 ${barrido} ${bordes.puntoB.x} ${bordes.puntoB.y} Z`;
}

/** Par oficial de un color del símbolo: cara oscura (izquierda) y clara (derecha). */
export interface ParColores {
    oscuro: string;
    claro: string;
}

export const COLORES: Record<Lado, Record<string, ParColores>> = {
    arriba: {
        rojo: { oscuro: "#A52D2D", claro: "#CC3737" },
        verde: { oscuro: "#38A52D", claro: "#51CC37" },
        azul: { oscuro: "#2C2CA8", claro: "#3636CC" },
    },
    abajo: {
        rojo: { oscuro: "#A52D2D", claro: "#CC3737" },
        amarillo: { oscuro: "#C1BD3A", claro: "#E2D640" },
        azul: { oscuro: "#2C2CA8", claro: "#3636CC" },
    },
};

/** Orden de color de las 6 facetas de cada lado, de izquierda a derecha. */
const ORDEN_COLORES: Record<Lado, string[]> = {
    arriba: ["rojo", "verde", "azul", "azul", "verde", "rojo"],
    abajo: ["rojo", "amarillo", "azul", "azul", "amarillo", "rojo"],
};

/** Ruta triangular de una faceta (del ápice a su par de la base). */
export function rutaFaceta(f: Faceta): string {
    return `M ${f.apex.x} ${f.apex.y} L ${f.baseA.x} ${f.baseA.y} L ${f.baseB.x} ${f.baseB.y} Z`;
}

/** Las 12 facetas oficiales: 6 por ápice, cara izquierda oscura, derecha clara. */
export const FACETAS: Faceta[] = (["arriba", "abajo"] as Lado[]).flatMap((lado) => {
    const apex = lado === "arriba" ? APICE_ARRIBA : APICE_ABAJO;
    return ORDEN_COLORES[lado].map((nombre, indice) => {
        const par = COLORES[lado][nombre];
        const oscura = indice < 3;
        const baseA = { x: 200 + DESPLAZAMIENTOS_BASE[indice], y: 200 };
        const baseB = { x: 200 + DESPLAZAMIENTOS_BASE[indice + 1], y: 200 };
        return {
            id: `${lado}-${indice}`,
            lado,
            indice,
            apex,
            baseA,
            baseB,
            colorOscuro: par.oscuro,
            colorClaro: par.claro,
            color: oscura ? par.oscuro : par.claro,
        };
    });
});
