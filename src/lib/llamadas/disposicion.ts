/**
 * Disposición de la ventana de llamada — matemática PURA.
 *
 * · `rejillaOptima`: cuántas columnas y filas dan los mosaicos MÁS GRANDES posibles para N
 *   personas en un hueco de ancho×alto, respetando la proporción del vídeo.
 * · `disposicionLlamada`: qué modo usar (solo, dúo tipo FaceTime, rejilla o foco con una
 *   pantalla compartida/fijada y el resto en una tira).
 * · `esquinaMasCercana`/`posicionEsquina`: la ventanita flotante (PiP) se suelta y se imanta
 *   a la esquina más cercana.
 */

export interface Rejilla {
    columnas: number;
    filas: number;
    /** Tamaño de cada mosaico en px (ya con la proporción aplicada). */
    ancho: number;
    alto: number;
}

export function rejillaOptima(
    n: number,
    ancho: number,
    alto: number,
    opciones: { aspecto?: number; hueco?: number } = {},
): Rejilla {
    const aspecto = opciones.aspecto && opciones.aspecto > 0 ? opciones.aspecto : 16 / 9;
    const hueco = Math.max(0, opciones.hueco ?? 8);
    if (n <= 0 || ancho <= 0 || alto <= 0) return { columnas: 0, filas: 0, ancho: 0, alto: 0 };
    let mejor: Rejilla = { columnas: 1, filas: n, ancho: 0, alto: 0 };
    let mejorArea = -1;
    for (let columnas = 1; columnas <= n; columnas++) {
        const filas = Math.ceil(n / columnas);
        const celdaAncho = (ancho - hueco * (columnas - 1)) / columnas;
        const celdaAlto = (alto - hueco * (filas - 1)) / filas;
        if (celdaAncho <= 0 || celdaAlto <= 0) continue;
        const w = Math.min(celdaAncho, celdaAlto * aspecto);
        const h = w / aspecto;
        const area = w * h;
        // A igual área, menos filas vacías (reparto más compacto).
        if (area > mejorArea + 0.5) {
            mejorArea = area;
            mejor = { columnas, filas, ancho: Math.floor(w), alto: Math.floor(h) };
        }
    }
    return mejor;
}

export type ModoDisposicion = "solo" | "duo" | "rejilla" | "foco";

export interface Disposicion {
    modo: ModoDisposicion;
    /** Quien ocupa el espacio grande (solo, dúo, foco). */
    principal: string | null;
    /** Los pequeños: en dúo, mi propio vídeo; en foco, la tira. */
    miniaturas: string[];
    /** Rejilla de mosaicos (solo en modo rejilla). */
    rejilla: Rejilla | null;
    /** Dónde va la tira en modo foco. */
    tira: "lateral" | "inferior" | null;
}

export function disposicionLlamada(
    ids: string[],
    opciones: {
        yo: string;
        ancho: number;
        alto: number;
        /** Quién comparte pantalla (tiene prioridad sobre la rejilla). */
        pantallaDe?: string | null;
        /** Fijado a mano por la persona. */
        fijado?: string | null;
        /** El hablante activo sube al principio de la tira. */
        hablante?: string | null;
        hueco?: number;
    },
): Disposicion {
    const lista = ids.filter((id, i) => id && ids.indexOf(id) === i);
    const n = lista.length;
    const destacado =
        (opciones.fijado && lista.includes(opciones.fijado) ? opciones.fijado : null) ??
        (opciones.pantallaDe && lista.includes(opciones.pantallaDe) ? opciones.pantallaDe : null);

    if (n === 0) return { modo: "solo", principal: null, miniaturas: [], rejilla: null, tira: null };

    if (destacado && n > 1) {
        const resto = lista.filter((id) => id !== destacado);
        const h = opciones.hablante;
        if (h && resto.includes(h)) {
            resto.splice(resto.indexOf(h), 1);
            resto.unshift(h);
        }
        const tira = opciones.ancho >= 900 && opciones.ancho > opciones.alto ? "lateral" : "inferior";
        return { modo: "foco", principal: destacado, miniaturas: resto, rejilla: null, tira };
    }

    if (n === 1) return { modo: "solo", principal: lista[0], miniaturas: [], rejilla: null, tira: null };

    if (n === 2) {
        const otro = lista.find((id) => id !== opciones.yo) ?? lista[1];
        const yo = lista.find((id) => id !== otro) ?? lista[0];
        return { modo: "duo", principal: otro, miniaturas: [yo], rejilla: null, tira: null };
    }

    return {
        modo: "rejilla",
        principal: null,
        miniaturas: [],
        rejilla: rejillaOptima(n, opciones.ancho, opciones.alto, { hueco: opciones.hueco }),
        tira: null,
    };
}

/* ─────────────────────────── Ventanita flotante (PiP) ─────────────────────────── */

export type Esquina = "arriba-izquierda" | "arriba-derecha" | "abajo-izquierda" | "abajo-derecha";

/** Esquina más cercana al centro (`x`,`y`) de la ventanita. */
export function esquinaMasCercana(x: number, y: number, anchoVentana: number, altoVentana: number): Esquina {
    const derecha = x >= anchoVentana / 2;
    const abajo = y >= altoVentana / 2;
    return `${abajo ? "abajo" : "arriba"}-${derecha ? "derecha" : "izquierda"}` as Esquina;
}

/** Posición (esquina superior izquierda de la PiP) para una esquina, respetando márgenes. */
export function posicionEsquina(
    esquina: Esquina,
    m: { anchoVentana: number; altoVentana: number; anchoPip: number; altoPip: number; margen?: number; margenInferior?: number; margenSuperior?: number },
): { x: number; y: number } {
    const margen = m.margen ?? 16;
    const abajo = esquina.startsWith("abajo");
    const derecha = esquina.endsWith("derecha");
    const x = derecha ? m.anchoVentana - m.anchoPip - margen : margen;
    const y = abajo ? m.altoVentana - m.altoPip - (m.margenInferior ?? margen) : m.margenSuperior ?? margen;
    return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
}
