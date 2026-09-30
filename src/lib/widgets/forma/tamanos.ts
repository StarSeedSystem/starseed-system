/**
 * Tamaños y dispositivo de los widgets libres (Ola 380 · FL2) — PURO.
 *
 * Cada tamaño es un DISEÑO, no una escala: en «micro» cabe un dato, en «xl» una escena. La clase
 * sale del tamaño medido del propio widget (no solo de la etiqueta S/M/L/XL del grid), y la clase
 * de dispositivo decide la composición de pantallas enteras (inicio, bloqueo, XR).
 */

export type ClaseTamano = "micro" | "s" | "m" | "l" | "xl" | "panoramico" | "torre";
export type ClaseDispositivo = "movil" | "tablet" | "escritorio" | "tv" | "xr";

/** Ancho aproximado de una columna del dashboard (grid de 12, ~1200 px) y alto de fila. */
export const PX_COLUMNA = 95;
export const PX_FILA = 65;

/** Por debajo de este lado (px) la tesela es «micro» aunque sea muy alargada. */
export const LADO_MICRO_SIEMPRE = 80;

export function claseDesdePx(w: number, h: number): ClaseTamano {
    if (!(w > 0) || !(h > 0)) return "micro";
    const lado = Math.min(w, h);
    // (Pulido 0930) Una tesela de una sola fila (móvil 46 px, escritorio 65, TV 77) no tiene alto
    // para nada más que un dato, por ancha que sea: es «micro» (glifo + cifra), no panorámico.
    if (lado < LADO_MICRO_SIEMPRE) return "micro";
    const relacion = w / h;
    if (relacion > 2.2) return "panoramico";
    if (relacion < 0.55) return "torre";
    if (lado < 110) return "micro";
    if (lado < 180) return "s";
    if (lado < 280) return "m";
    if (lado < 420) return "l";
    return "xl";
}

export function claseDesdeGrid(w: number, h: number): ClaseTamano {
    return claseDesdePx(w * PX_COLUMNA, h * PX_FILA);
}

export function claseDispositivo(s: { ancho: number; alto: number; punteroGrueso: boolean; enXR: boolean }): ClaseDispositivo {
    if (s.enXR) return "xr";
    if (s.ancho < 640) return "movil";
    if (s.ancho < 1024 || (s.punteroGrueso && s.ancho < 1366)) return "tablet";
    if (s.ancho >= 1920 && s.punteroGrueso) return "tv";
    return "escritorio";
}

const ORDEN: Record<ClaseTamano, number> = { micro: 0, s: 1, m: 2, l: 3, xl: 4, panoramico: 2, torre: 2 };

export function orden(clase: ClaseTamano): number {
    return ORDEN[clase];
}

/** «¿Me cabe esto?»: un widget pregunta si su clase llega al menos a `minima`. */
export function alMenos(clase: ClaseTamano, minima: ClaseTamano): boolean {
    return ORDEN[clase] >= ORDEN[minima];
}

/** Lee el dispositivo del navegador (con guardas; sin window → escritorio). */
export function dispositivoActual(): ClaseDispositivo {
    if (typeof window === "undefined") return "escritorio";
    let grueso = false;
    try { grueso = window.matchMedia("(pointer: coarse)").matches; } catch { /* sin matchMedia */ }
    return claseDispositivo({ ancho: window.innerWidth, alto: window.innerHeight, punteroGrueso: grueso, enXR: false });
}
