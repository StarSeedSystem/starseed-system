import type { CSSProperties } from "react";

/**
 * MARCOS DE FOTO (Adenda 219 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un marco es una FORMA (recorte) más un ENCUADRE (cómo se coloca la imagen
 * dentro). Sirve igual para la foto de perfil, para las fotos y vídeos de una
 * publicación y para cualquier medio del lienzo de creación.
 *
 * Las formas se hacen con `clip-path`, que recorta sin tocar la imagen: cambiar
 * de estrella a hexágono no re-procesa nada, es un estilo. Los polígonos se
 * generan matemáticamente, así que añadir «heptágono» es una línea.
 */

export type FormaMarco =
    | "circulo" | "cuadrado" | "redondeado" | "estrella" | "pentagono" | "hexagono"
    | "heptagono" | "octagono" | "rombo" | "corazon" | "gota";

export interface Marco {
    forma: FormaMarco;
    /** Desplazamiento de la imagen dentro del marco, en % del lado (−50…50). */
    x: number;
    y: number;
    /** Escala de la imagen (1 = ajustada; 2 = al doble). */
    escala: number;
    /** Grosor del borde en px (0 = sin borde). */
    borde: number;
    /** Color del borde (CSS). Vacío = degradado StarSeed. */
    colorBorde?: string;
    /** Rotación de la imagen en grados. */
    rotacion?: number;
}

export const MARCO_POR_DEFECTO: Marco = { forma: "circulo", x: 0, y: 0, escala: 1, borde: 2, rotacion: 0 };

export const FORMAS: Array<{ id: FormaMarco; nombre: string }> = [
    { id: "circulo", nombre: "Círculo" },
    { id: "redondeado", nombre: "Redondeado" },
    { id: "cuadrado", nombre: "Cuadrado" },
    { id: "rombo", nombre: "Rombo" },
    { id: "pentagono", nombre: "Pentágono" },
    { id: "hexagono", nombre: "Hexágono" },
    { id: "heptagono", nombre: "Heptágono" },
    { id: "octagono", nombre: "Octágono" },
    { id: "estrella", nombre: "Estrella" },
    { id: "corazon", nombre: "Corazón" },
    { id: "gota", nombre: "Gota" },
];

function poligono(n: number, giro = -90): string {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
        const a = ((360 / n) * i + giro) * (Math.PI / 180);
        pts.push(`${(50 + 50 * Math.cos(a)).toFixed(2)}% ${(50 + 50 * Math.sin(a)).toFixed(2)}%`);
    }
    return `polygon(${pts.join(", ")})`;
}

function estrella(p = 5, r = 0.45): string {
    const pts: string[] = [];
    for (let i = 0; i < p * 2; i++) {
        const rad = i % 2 === 0 ? 50 : 50 * r;
        const a = ((180 / p) * i - 90) * (Math.PI / 180);
        pts.push(`${(50 + rad * Math.cos(a)).toFixed(2)}% ${(50 + rad * Math.sin(a)).toFixed(2)}%`);
    }
    return `polygon(${pts.join(", ")})`;
}

/** `clip-path` CSS de cada forma. */
export function clipPathDe(forma: FormaMarco): string {
    switch (forma) {
        case "circulo": return "circle(50% at 50% 50%)";
        case "cuadrado": return "inset(0)";
        case "redondeado": return "inset(0 round 22%)";
        case "rombo": return poligono(4, -90);
        case "pentagono": return poligono(5);
        case "hexagono": return poligono(6, 0);
        case "heptagono": return poligono(7);
        case "octagono": return poligono(8, 22.5);
        case "estrella": return estrella(5, 0.48);
        case "gota": return "path('M50 2 C72 30 96 48 96 66 A46 46 0 0 1 4 66 C4 48 28 30 50 2 Z')";
        case "corazon": return "path('M50 92 C20 70 2 52 2 32 A22 22 0 0 1 50 22 A22 22 0 0 1 98 32 C98 52 80 70 50 92 Z')";
        default: return "circle(50% at 50% 50%)";
    }
}

/** Estilos para la IMAGEN dentro del marco (encuadre). */
export function estiloImagen(m: Marco): CSSProperties {
    return {
        objectFit: "cover",
        width: "100%",
        height: "100%",
        transform: `translate(${m.x}%, ${m.y}%) scale(${m.escala}) rotate(${m.rotacion ?? 0}deg)`,
        transformOrigin: "center",
    };
}

/** Estilos para el CONTENEDOR recortado. */
export function estiloMarco(m: Marco): CSSProperties {
    return { clipPath: clipPathDe(m.forma), overflow: "hidden" };
}

export function normalizarMarco(v: unknown): Marco {
    const o = (v && typeof v === "object" ? v : {}) as Partial<Marco>;
    const forma = FORMAS.some((f) => f.id === o.forma) ? (o.forma as FormaMarco) : "circulo";
    const num = (n: unknown, d: number, min: number, max: number) =>
        typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
    return {
        forma,
        x: num(o.x, 0, -50, 50),
        y: num(o.y, 0, -50, 50),
        escala: num(o.escala, 1, 0.5, 3),
        borde: num(o.borde, 2, 0, 12),
        colorBorde: typeof o.colorBorde === "string" ? o.colorBorde : undefined,
        rotacion: num(o.rotacion, 0, -180, 180),
    };
}
