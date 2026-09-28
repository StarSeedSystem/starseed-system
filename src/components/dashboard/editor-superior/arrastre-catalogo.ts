/**
 * Arrastrar un widget del catálogo a la rejilla.
 *
 * Mientras se arrastra, el navegador no deja leer los datos del `dataTransfer` (solo sus tipos),
 * y la rejilla necesita saber el tamaño para dibujar el hueco. Por eso la carga vive también en
 * memoria del módulo mientras dura el gesto; al soltar se lee del `dataTransfer` (fuente fiable).
 */
import type { WidgetType } from "../dashboard-types";
import type { TallaEditor } from "./tipos";

export const MIME_CATALOGO = "application/x-starseed-widget";

export interface CargaCatalogo {
    type: WidgetType;
    talla: TallaEditor;
    w: number;
    h: number;
}

let actual: CargaCatalogo | null = null;

export function iniciarArrastreCatalogo(dt: DataTransfer | null, carga: CargaCatalogo): void {
    actual = carga;
    if (!dt) return;
    try {
        dt.setData(MIME_CATALOGO, JSON.stringify(carga));
        dt.effectAllowed = "copy";
    } catch { /* navegadores sin dataTransfer escribible */ }
}

export function terminarArrastreCatalogo(): void {
    actual = null;
}

export function arrastreCatalogoActual(): CargaCatalogo | null {
    return actual;
}

export function esArrastreCatalogo(dt: DataTransfer | null | undefined): boolean {
    if (!dt) return actual !== null;
    try {
        return Array.from(dt.types ?? []).includes(MIME_CATALOGO);
    } catch {
        return actual !== null;
    }
}

/** Lee la carga al soltar (con respaldo en memoria). Nunca lanza. */
export function leerCargaCatalogo(dt: DataTransfer | null | undefined): CargaCatalogo | null {
    try {
        const crudo = dt?.getData(MIME_CATALOGO);
        if (crudo) {
            const c = JSON.parse(crudo) as Partial<CargaCatalogo>;
            if (typeof c.type === "string" && typeof c.talla === "string") {
                return { type: c.type as WidgetType, talla: c.talla as TallaEditor, w: Number(c.w) || 4, h: Number(c.h) || 4 };
            }
        }
    } catch { /* datos ajenos */ }
    return actual;
}
