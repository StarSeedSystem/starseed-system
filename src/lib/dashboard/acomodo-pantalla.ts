/**
 * Acomodo automático por pantalla (2026-09-28) — PURO.
 *
 * El dashboard guarda UN acomodo (el de escritorio, 12 columnas). Antes se pasaba ese mismo
 * acomodo a todos los puntos de corte y react-grid-layout lo recortaba: en tablet un widget
 * mediano ocupaba toda la fila y la página se volvía una columna de cápsulas enormes. Aquí cada
 * pantalla recibe su propio acomodo, derivado del de escritorio:
 *   · el tamaño elegido se traduce a su fracción de ancho en esa pantalla (XL/L anchos llenan la
 *     fila en las estrechas; M y S van de dos en dos), y la altura se ajusta a la proporción;
 *   · se empaqueta en orden de lectura (arriba→abajo, izquierda→derecha) en el primer hueco.
 * Cada widget elige después su diseño por el tamaño REAL que le toca (useElementSize /
 * claseDesdePx), así que el acomodo y la versión del widget se ajustan solos a cada pantalla.
 */

export type PuntoCorte = "lg" | "md" | "sm" | "xs" | "xxs";
export const COLUMNAS: Record<PuntoCorte, number> = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
/** Ancho típico en px de cada punto de corte (solo para conservar la proporción de los widgets). */
const ANCHO_TIPICO: Record<PuntoCorte, number> = { lg: 1440, md: 1100, sm: 820, xs: 600, xxs: 390 };

export interface ItemRejilla {
    i: string; x: number; y: number; w: number; h: number;
    minW?: number; minH?: number; maxW?: number; maxH?: number;
}

/** Ancho (en columnas del punto) que le toca a un widget que en escritorio ocupa `w` de 12. */
export function anchoEn(punto: PuntoCorte, w: number): number {
    const c = COLUMNAS[punto], f = w / 12;
    if (punto === "lg") return Math.min(12, Math.max(1, w));
    if (punto === "md") return Math.min(10, Math.max(2, Math.round(f * 10)));
    // Estrechas: lo ancho (≥ 3/4) llena la fila; lo demás va de dos en dos.
    if (f >= 0.75) return c;
    if (punto === "sm" || punto === "xs") return c / 2;
    return f >= 0.5 ? c : c / 2; // xxs (móvil): L y XL llenan, M y S de dos en dos
}

export function acomodoPara(punto: PuntoCorte, base: ItemRejilla[]): ItemRejilla[] {
    const c = COLUMNAS[punto];
    const orden = [...base].sort((a, b) => a.y - b.y || a.x - b.x);
    const alturas = new Array<number>(c).fill(0);
    return orden.map((it) => {
        const w = Math.min(c, anchoEn(punto, it.w));
        const r = ((w / c) * ANCHO_TIPICO[punto]) / ((it.w / 12) * ANCHO_TIPICO.lg);
        const minH = it.minH ?? 1;
        const h = Math.max(minH, Math.round(it.h * Math.min(1.4, Math.max(0.75, r))));
        // Primer hueco: la x (de izquierda a derecha) donde el widget queda más arriba.
        let mejorX = 0, mejorY = Infinity;
        for (let x = 0; x + w <= c; x++) {
            const y = Math.max(...alturas.slice(x, x + w));
            if (y < mejorY) { mejorY = y; mejorX = x; }
        }
        for (let x = mejorX; x < mejorX + w; x++) alturas[x] = mejorY + h;
        const minW = it.minW === undefined ? undefined : Math.min(w, Math.max(1, Math.round((it.minW * c) / 12)));
        const salida: ItemRejilla = { i: it.i, x: mejorX, y: mejorY, w, h, minH };
        if (minW !== undefined) salida.minW = minW;
        if (it.maxH !== undefined) salida.maxH = Math.max(h, it.maxH);
        return salida;
    });
}

/** Los acomodos de todas las pantallas a partir del de escritorio (que se respeta tal cual). */
export function acomodosPorPantalla(base: ItemRejilla[]): Record<PuntoCorte, ItemRejilla[]> {
    return {
        lg: base,
        md: acomodoPara("md", base),
        sm: acomodoPara("sm", base),
        xs: acomodoPara("xs", base),
        xxs: acomodoPara("xxs", base),
    };
}
