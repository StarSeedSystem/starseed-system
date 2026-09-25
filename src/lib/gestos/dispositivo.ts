/**
 * Autodetección del dispositivo de entrada y del formato de pantalla (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * No se pregunta «¿es un móvil?» (un iPad con teclado, un portátil táctil o un
 * móvil con ratón lo desmienten): se pregunta qué PUNTEROS hay y qué forma
 * tiene la pantalla. Las consultas reales (`matchMedia`) viven en el hook
 * `usePerfilDispositivo`; aquí solo la decisión, para poder probarla.
 */

export interface CapacidadesEntrada {
    /** `(any-pointer: coarse)` — hay algún puntero grueso (dedo). */
    punteroGrueso: boolean;
    /** `(any-pointer: fine)` — hay algún puntero fino (ratón, trackpad, lápiz). */
    punteroFino: boolean;
    /** `(any-hover: hover)` — algún puntero puede «pasar por encima». */
    algunHover: boolean;
}

/**
 * tactil  → solo dedo: arrastres y objetivos grandes; nada depende del hover.
 * raton   → solo puntero fino: hover, clic y rueda/trackpad.
 * hibrido → los dos a la vez (portátil táctil, tableta con teclado): todo activo.
 */
export type PerfilEntrada = "tactil" | "raton" | "hibrido";

export function perfilDeEntrada(c: CapacidadesEntrada): PerfilEntrada {
    if (c.punteroGrueso && (c.punteroFino || c.algunHover)) return "hibrido";
    if (c.punteroGrueso) return "tactil";
    return "raton";
}

export type FormatoPantalla = "estrecho" | "medio" | "amplio";
export type Orientacion = "vertical" | "horizontal";

export interface Formato {
    formato: FormatoPantalla;
    orientacion: Orientacion;
    /** ancho / alto */
    proporcion: number;
}

/**
 * Formato por ancho útil, corregido por la altura: un móvil apaisado (932×430)
 * es ancho pero bajo, y un panel lateral de 30rem de alto no le cabe. Se trata
 * como «medio» para que los paneles se adapten a su altura real.
 */
export function formatoPantalla(ancho: number, alto: number): Formato {
    const a = Math.max(1, ancho);
    const h = Math.max(1, alto);
    const proporcion = a / h;
    const orientacion: Orientacion = proporcion >= 1 ? "horizontal" : "vertical";
    let formato: FormatoPantalla = a < 640 ? "estrecho" : a < 1024 ? "medio" : "amplio";
    if (formato === "amplio" && h < 560) formato = "medio";
    return { formato, orientacion, proporcion };
}

/** Lado mínimo recomendado (px) de un objetivo táctil según el perfil (WCAG 2.5.5 / HIG). */
export function tamanoObjetivo(perfil: PerfilEntrada): number {
    return perfil === "raton" ? 40 : perfil === "hibrido" ? 44 : 48;
}
