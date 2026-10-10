/**
 * StarSeed XR · TOKENS 3D. Los tokens del design system (`src/styles/starseed-materials.css`: colores
 * cardinales de la Trinity y «cristal líquido») traducidos a parámetros de material de three y a ayudas
 * de contraste. Es DATO + aritmética: quien pinta (uikit, R3F) lee de aquí y no escribe ni un color a mano.
 * El cristal tiene un equivalente BARATO por nivel de calidad (`MaterialCristal`) porque la transmisión
 * de three cuesta una pasada extra de render, impagable en un visor autónomo. Módulo PURO.
 */
import type { NodoTrinity } from "./tipos";
import type { MaterialCristal } from "./calidad-perfiles";

export type NodoCardinal = Exclude<NodoTrinity, "menuMano">;
export interface ColorNodo { base: string; vivo: string }

/** Espejo de `--ss-zenith`, `--ss-horizon(-vivid)`, `--ss-logic(-deep)` y `--ss-anchor` (CLAUDE.md §7). */
export const COLORES_NODO: Record<NodoCardinal, ColorNodo> = {
    zenith: { base: "#007FFF", vivo: "#007FFF" },
    horizon: { base: "#10B981", vivo: "#39FF14" },
    logic: { base: "#D4AF37", vivo: "#FFBF00" },
    anchor: { base: "#DC143C", vivo: "#DC143C" },
};

/** Cristal oscuro del OS (`--ss-crystal-bg-a/b`, `--ss-crystal-edge`) y el texto que se pinta encima. */
export const CRISTAL = {
    fondoA: { color: "#0E101E", alfa: 0.62 },
    fondoB: { color: "#060814", alfa: 0.42 },
    borde: { color: "#FFFFFF", alfa: 0.14 },
    texto: "#F5F7FF",
    textoSecundario: "#B9C0D8",
} as const;

export const CONTRASTE_MIN_TEXTO = 4.5;

export interface ParamsMaterial {
    clase: "MeshBasicMaterial" | "MeshStandardMaterial" | "MeshPhysicalMaterial";
    color: string;
    opacidad: number;
    transparente: boolean;
    rugosidad?: number;
    metalico?: number;
    transmision?: number;
    grosor?: number;
    ior?: number;
    dispersion?: number;
    /** Escala de la pasada de transmisión (se aplica al renderer si lo admite). */
    resolucionTransmision?: number;
    intensidadEntorno?: number;
    borde: { color: string; opacidad: number; ancho: number };
    /** 0 = gratis … 4 = cuesta una pasada extra de render. */
    coste: 0 | 1 | 2 | 3 | 4;
}

export interface OpcionesMaterial {
    /** Preferencia del sistema o de la persona: sin transparencias. */
    reducirTransparencia?: boolean;
    contrasteAlto?: boolean;
    /** Opacidad mínima que exige el modo (AR: 0,82, ver `disponerTrinity().opacidadMinima`). */
    opacidadMinima?: number;
}

const EQUIVALENTE_PLANO: MaterialCristal = "plano";

/** Material de un panel de la Trinity para un nivel de cristal. Nunca devuelve más caro de lo pedido. */
export function paramsMaterial(material: MaterialCristal, nodo: NodoCardinal, o: OpcionesMaterial = {}): ParamsMaterial {
    const efectivo: MaterialCristal = o.reducirTransparencia ? EQUIVALENTE_PLANO : material;
    const acento = COLORES_NODO[nodo].vivo;
    const piso = Math.max(o.opacidadMinima ?? 0, o.contrasteAlto ? 0.92 : 0);
    const borde = { color: acento, opacidad: o.contrasteAlto ? 0.95 : 0.6, ancho: o.contrasteAlto ? 0.004 : 0.002 };
    const base = { color: CRISTAL.fondoA.color, borde };
    const opaco = (op: number) => Math.min(1, Math.max(op, piso));
    switch (efectivo) {
        case "plano":
            return { ...base, clase: "MeshBasicMaterial", opacidad: opaco(0.94), transparente: opaco(0.94) < 1, coste: 0 };
        case "translucido":
            return { ...base, clase: "MeshBasicMaterial", opacidad: opaco(CRISTAL.fondoA.alfa + 0.1), transparente: true, coste: 1 };
        case "vidrio-entorno":
            return { ...base, clase: "MeshStandardMaterial", opacidad: opaco(CRISTAL.fondoA.alfa), transparente: true, rugosidad: 0.18, metalico: 0, intensidadEntorno: 1, coste: 2 };
        case "transmision-media":
            return { ...base, clase: "MeshPhysicalMaterial", opacidad: opaco(1), transparente: piso >= 1 ? false : true, transmision: 0.9, grosor: 0.12, ior: 1.35, rugosidad: 0.14, resolucionTransmision: 0.5, coste: 3 };
        case "transmision-completa":
            return { ...base, clase: "MeshPhysicalMaterial", opacidad: opaco(1), transparente: piso >= 1 ? false : true, transmision: 1, grosor: 0.3, ior: 1.45, dispersion: 0.2, rugosidad: 0.08, resolucionTransmision: 1, coste: 4 };
    }
}

const canal = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Luminancia relativa WCAG de un #rrggbb. */
export const luminancia = (hex: string): number => {
    const [r, g, b] = rgb(hex);
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

/** Razón de contraste WCAG entre dos #rrggbb (1 … 21). */
export function contraste(a: string, b: string): number {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

/** Color resultante de poner `delante` con `alfa` sobre `detras`. */
export function mezclar(delante: string, alfa: number, detras: string): string {
    const [d, t] = [rgb(delante), rgb(detras)];
    const h = (i: number) => Math.round(d[i] * alfa + t[i] * (1 - alfa)).toString(16).padStart(2, "0");
    return `#${h(0)}${h(1)}${h(2)}`;
}

/**
 * Opacidad mínima del cristal para que `texto` se lea (≥ 4,5:1) incluso sobre el PEOR fondo de la habitación
 * (en AR el cuarto asoma por detrás: blanco puro para un cristal oscuro, negro para uno claro).
 */
export function opacidadMinimaParaTexto(texto: string = CRISTAL.texto, fondo: string = CRISTAL.fondoA.color): number {
    const peor = luminancia(fondo) < 0.5 ? "#FFFFFF" : "#000000";
    for (let a = 0.3; a <= 1.0001; a += 0.01) if (contraste(texto, mezclar(fondo, a, peor)) >= CONTRASTE_MIN_TEXTO) return Math.round(a * 100) / 100;
    return 1;
}
