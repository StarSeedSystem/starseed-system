/**
 * Tallas del editor superior — PURO.
 *
 * Traduce el «tamaño al añadir» elegido en el catálogo a una huella de rejilla (12 columnas)
 * respetando los mínimos del manifiesto, y dice qué versión de diseño elegirá el widget al
 * medirse (`claseDesdeGrid`), para que el catálogo no prometa una forma que no se va a ver.
 */
import type { WidgetType } from "../dashboard-types";
import { getSizeConstraints } from "../widget-manifest";
import { dimsForSize, sizeFromWH, type WidgetSize } from "../dashboard-size";
import { claseDesdeGrid, PX_COLUMNA, PX_FILA, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import type { TallaEditor } from "./tipos";

export interface DefTalla {
    id: TallaEditor;
    etiqueta: string;
    ayuda: string;
}

export const TALLAS_EDITOR: readonly DefTalla[] = [
    { id: "micro", etiqueta: "Micro", ayuda: "Lo mínimo que admite el widget: un dato de un vistazo." },
    { id: "S", etiqueta: "Pequeño", ayuda: "Una pieza breve: tres columnas." },
    { id: "M", etiqueta: "Mediano", ayuda: "El equilibrio de siempre: cuatro columnas." },
    { id: "L", etiqueta: "Grande", ayuda: "Media fila, con espacio para detalle." },
    { id: "XL", etiqueta: "Extra grande", ayuda: "Toda la fila: una escena completa." },
    { id: "panoramico", etiqueta: "Panorámico", ayuda: "Ancho y bajo: una franja." },
    { id: "torre", etiqueta: "Torre", ayuda: "Estrecho y alto: una columna." },
];

export const NOMBRE_CLASE: Record<ClaseTamano, string> = {
    micro: "micro",
    s: "pequeño",
    m: "mediano",
    l: "grande",
    xl: "extra grande",
    panoramico: "panorámico",
    torre: "torre",
};

export interface DimsTalla {
    w: number;
    h: number;
    /** Talla S/M/L/XL que se guarda en `DashboardWidget.size`. */
    size: WidgetSize;
    /** Versión de diseño que el widget elegirá al medirse con esa huella. */
    clase: ClaseTamano;
}

const COLUMNAS = 12;

function recortar(type: WidgetType, w: number, h: number): { w: number; h: number } {
    const c = getSizeConstraints(type);
    let ww = Math.min(COLUMNAS, Math.max(c.minW, Math.round(w)));
    let hh = Math.max(c.minH, Math.round(h));
    if (c.maxW) ww = Math.min(ww, c.maxW);
    if (c.maxH) hh = Math.min(hh, c.maxH);
    return { w: Math.max(1, ww), h: Math.max(1, hh) };
}

/** Huella de rejilla para una talla del editor, recortada a los límites del widget. */
export function dimsTalla(type: WidgetType, talla: TallaEditor): DimsTalla {
    const c = getSizeConstraints(type);
    let base: { w: number; h: number };
    switch (talla) {
        case "micro":
            base = { w: c.minW, h: c.minH };
            break;
        case "panoramico": {
            // Relación ancho/alto en píxeles > 2,2 (umbral de `claseDesdePx`), con margen.
            const h = Math.max(3, c.minH);
            base = { w: Math.max(6, Math.ceil((2.4 * h * PX_FILA) / PX_COLUMNA)), h };
            break;
        }
        case "torre": {
            // Relación < 0,55: el doble de alto que de ancho, en píxeles.
            const w = Math.max(2, c.minW);
            base = { w, h: Math.ceil((w * PX_COLUMNA * 2) / PX_FILA) };
            break;
        }
        default:
            base = dimsForSize(type, talla);
    }
    const { w, h } = recortar(type, base.w, base.h);
    const size: WidgetSize = talla === "S" || talla === "M" || talla === "L" || talla === "XL" ? talla : sizeFromWH(w, h);
    return { w, h, size, clase: claseDesdeGrid(w, h) };
}

/** true si la talla es una de las cuatro de la rejilla (las que cicla el botón de tamaño). */
export function esTallaDeRejilla(t: TallaEditor): t is WidgetSize {
    return t === "S" || t === "M" || t === "L" || t === "XL";
}
