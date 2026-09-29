/**
 * Variantes de cada plantilla temática (2026-09-29) — PURO.
 *
 * Una misma pestaña se puede querer completa, esencial o centrada en una sola cosa. En vez de
 * mantener tres plantillas a mano por tema, se derivan de los PAPELES de la plantilla completa:
 *  · Completo — la composición curada tal cual.
 *  · Esencial — el héroe y las tres piezas de apoyo más importantes (y el dock de apps).
 *  · Enfoque  — el héroe a todo lo ancho y, debajo, una fila de datos de un vistazo.
 */
import type { DefaultDashboardTemplate, RolPlantilla, WidgetPlantilla } from "../dashboard-defaults";
import { getSizeConstraints } from "../widget-manifest";
import { sizeFromWH } from "../dashboard-size";

export type VarianteDiseno = "completo" | "esencial" | "enfoque";

export const VARIANTES: readonly { id: VarianteDiseno; etiqueta: string; ayuda: string }[] = [
    { id: "completo", etiqueta: "Completo", ayuda: "La composición entera del tema." },
    { id: "esencial", etiqueta: "Esencial", ayuda: "El protagonista y tres piezas clave." },
    { id: "enfoque", etiqueta: "Enfoque", ayuda: "El protagonista a lo ancho y sus datos debajo." },
];

const COLS = 12;

export function rolDePieza(w: Pick<WidgetPlantilla, "w" | "h" | "rol">): RolPlantilla {
    if (w.rol) return w.rol;
    if (w.w >= 10 && w.h <= 3) return "franja";
    if (w.w >= 6 && w.h >= 5) return "heroe";
    if (w.w <= 3 && w.h <= 3) return "dato";
    return "apoyo";
}

const lectura = (a: WidgetPlantilla, b: WidgetPlantilla) => a.y - b.y || a.x - b.x;

/** Empaqueta en filas de izquierda a derecha, sin huecos entre filas (primer hueco libre). */
function empaquetar(piezas: WidgetPlantilla[]): WidgetPlantilla[] {
    const alturas = new Array<number>(COLS).fill(0);
    return piezas.map((pz) => {
        const w = Math.min(COLS, pz.w);
        let mejorX = 0, mejorY = Infinity;
        for (let x = 0; x + w <= COLS; x++) {
            const y = Math.max(...alturas.slice(x, x + w));
            if (y < mejorY) { mejorY = y; mejorX = x; }
        }
        for (let x = mejorX; x < mejorX + w; x++) alturas[x] = mejorY + pz.h;
        return { ...pz, x: mejorX, y: mejorY, w };
    });
}

export function variantePlantilla(t: DefaultDashboardTemplate, v: VarianteDiseno): DefaultDashboardTemplate {
    if (v === "completo") return t;
    const orden = [...t.widgets].sort(lectura);
    const dock = orden.filter((w) => w.type === "APP_LAUNCHER");
    const resto = orden.filter((w) => w.type !== "APP_LAUNCHER");
    const heroe = resto.find((w) => rolDePieza(w) === "heroe") ?? resto[0];
    if (!heroe) return t;
    const otros = resto.filter((w) => w !== heroe);

    if (v === "esencial") {
        const clave = otros.filter((w) => rolDePieza(w) !== "dato").slice(0, 3);
        const piezas = empaquetar([heroe, ...clave]);
        const fondo = piezas.reduce((m, w) => Math.max(m, w.y + w.h), 0);
        return { ...t, widgets: [...piezas, ...dock.map((d) => ({ ...d, y: fondo }))] };
    }

    // Enfoque: héroe a lo ancho + hasta cuatro datos (los datos del tema o las piezas más pequeñas).
    const alto = Math.max(heroe.h + 1, 7);
    const grande: WidgetPlantilla = { ...heroe, x: 0, y: 0, w: COLS, h: alto, size: sizeFromWH(COLS, alto), rol: "heroe" };
    const candidatos = [...otros].sort((a, b) => (rolDePieza(a) === "dato" ? 0 : 1) - (rolDePieza(b) === "dato" ? 0 : 1) || a.w * a.h - b.w * b.h);
    const datos = candidatos.slice(0, 4).map((w, i) => {
        const c = getSizeConstraints(w.type);
        const h = Math.max(3, c.minH);
        return { ...w, x: i * 3, y: alto, w: 3, h, size: sizeFromWH(3, h), rol: "dato" as const };
    });
    const fondo = datos.reduce((m, w) => Math.max(m, w.y + w.h), alto);
    return { ...t, widgets: [grande, ...datos, ...dock.map((d) => ({ ...d, y: fondo }))] };
}
