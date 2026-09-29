/**
 * Acomodo automático por pantalla (2026-09-28, ampliado 2026-09-29) — PURO.
 *
 * El dashboard guarda UN acomodo (el de escritorio, 12 columnas). Cada pantalla recibe el suyo,
 * derivado de ése con reglas de DISEÑO (no escalando):
 *   · cada widget tiene un PAPEL que se deduce de su huella de escritorio — héroe (el grande de la
 *     pestaña), apoyo, dato (cifra de un vistazo) o franja (banda a lo ancho);
 *   · el ancho sale de su fracción de fila y de su papel: en tablet y móvil lo ancho llena la fila,
 *     lo mediano va de dos en dos y los DATOS se vuelven teselas pequeñas (tres por fila en
 *     tablet, dos en el teléfono);
 *   · el alto conserva la proporción de escritorio en PÍXELES, con límites por papel (un héroe
 *     nunca queda aplastado ni un dato se estira), y se convierte a filas de ESA pantalla (en el
 *     teléfono las filas son más bajas);
 *   · se empaqueta en orden de lectura en el primer hueco.
 * Cada widget elige después su versión de diseño (micro · s · m · l · xl · panorámico · torre)
 * por el tamaño REAL que le toca (`claseDesdePx`): así el acomodo decide la versión de cada uno.
 * En pantallas muy anchas (TV, monitores 4K) las filas crecen con el ancho para que los widgets
 * conserven su proporción y pasen a su versión grande.
 */

export type PuntoCorte = "lg" | "md" | "sm" | "xs" | "xxs";
export const COLUMNAS: Record<PuntoCorte, number> = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
/** Anchos mínimos de cada punto de corte (los mismos que usa la rejilla). */
export const CORTES: Record<PuntoCorte, number> = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
/** Ancho típico en px de cada punto de corte (solo para conservar la proporción de los widgets). */
const ANCHO_TIPICO: Record<PuntoCorte, number> = { lg: 1440, md: 1100, sm: 820, xs: 600, xxs: 390 };
/** Alto de una fila en cada pantalla: en el teléfono las filas son más bajas. */
export const FILA_PX: Record<PuntoCorte, number> = { lg: 65, md: 65, sm: 60, xs: 54, xxs: 46 };

export interface ItemRejilla {
    i: string; x: number; y: number; w: number; h: number;
    minW?: number; minH?: number; maxW?: number; maxH?: number;
}

export type RolWidget = "heroe" | "apoyo" | "dato" | "franja";

/** Papel de un widget según su huella de escritorio (12 columnas). */
export function rolDe(it: Pick<ItemRejilla, "w" | "h">): RolWidget {
    if (it.w >= 10 && it.h <= 3) return "franja";
    if (it.w >= 6 && it.h >= 5) return "heroe";
    if (it.w <= 3 && it.h <= 3) return "dato";
    return "apoyo";
}

/** Punto de corte para un ancho de contenedor (mismos cortes que la rejilla). */
export function puntoParaAncho(ancho: number): PuntoCorte {
    if (ancho >= CORTES.lg) return "lg";
    if (ancho >= CORTES.md) return "md";
    if (ancho >= CORTES.sm) return "sm";
    if (ancho >= CORTES.xs) return "xs";
    return "xxs";
}

/**
 * Alto de fila en px para un ancho. En escritorio, 65 px hasta 1600 px de ancho; por encima (TV,
 * monitores grandes) crece en proporción para que los widgets no se aplanen.
 */
export function altoFila(ancho: number, punto: PuntoCorte = puntoParaAncho(ancho)): number {
    if (punto !== "lg") return FILA_PX[punto];
    if (!(ancho > 1600)) return FILA_PX.lg;
    return Math.min(150, Math.round((FILA_PX.lg * ancho) / 1600));
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

/** Ancho según el papel: los datos se vuelven teselas (tres por fila en tablet, dos en el móvil). */
export function anchoParaRol(punto: PuntoCorte, it: Pick<ItemRejilla, "w" | "h">, rol: RolWidget = rolDe(it)): number {
    const c = COLUMNAS[punto];
    if (punto === "lg") return anchoEn(punto, it.w);
    if (rol === "franja") return punto === "md" ? Math.min(10, Math.max(2, Math.round((it.w / 12) * 10))) : c;
    if (rol === "dato") {
        if (punto === "md") return Math.min(10, Math.max(2, Math.round((it.w / 12) * 10)));
        if (punto === "sm") return 2;
        if (punto === "xs") return 2;
        return 1;
    }
    return anchoEn(punto, it.w);
}

/** Límites de alto (px) por papel: [mínimo, máximo] en pantallas estrechas y en la intermedia. */
const LIMITES_PX: Record<RolWidget, { estrecha: [number, number]; media: [number, number] }> = {
    heroe: { estrecha: [260, 560], media: [300, 700] },
    apoyo: { estrecha: [170, 380], media: [200, 480] },
    dato: { estrecha: [104, 190], media: [120, 240] },
    franja: { estrecha: [96, 220], media: [110, 320] },
};

/** Alto mínimo razonable de un widget en px (su mínimo del manifiesto, algo relajado). */
const PX_MINIMO_POR_FILA = 52;

export interface OpcionesAcomodo {
    /** Ancho real del contenedor (px); si falta, el típico del punto. */
    anchoPx?: number;
}

export function acomodoPara(punto: PuntoCorte, base: ItemRejilla[], opciones: OpcionesAcomodo = {}): ItemRejilla[] {
    const c = COLUMNAS[punto];
    const ancho = opciones.anchoPx && opciones.anchoPx > 0 ? opciones.anchoPx : ANCHO_TIPICO[punto];
    const colPx = ancho / c;
    const filaPx = FILA_PX[punto];
    const colLg = ANCHO_TIPICO.lg / 12;
    const orden = [...base].sort((a, b) => a.y - b.y || a.x - b.x);
    const alturas = new Array<number>(c).fill(0);
    return orden.map((it) => {
        const rol = rolDe(it);
        const w = Math.min(c, Math.max(1, anchoParaRol(punto, it, rol)));
        // Proporción de escritorio en píxeles, llevada al ancho que le toca aquí.
        const proporcion = (it.h * FILA_PX.lg) / Math.max(1, it.w * colLg);
        const [minPx, maxPx] = LIMITES_PX[rol][punto === "md" ? "media" : "estrecha"];
        const altoPx = Math.min(maxPx, Math.max(minPx, w * colPx * proporcion));
        const minH = it.minH ?? 1;
        const minFilas = Math.max(1, Math.ceil((minH * PX_MINIMO_POR_FILA) / filaPx));
        let h = Math.max(minFilas, Math.round(altoPx / filaPx));
        if (it.maxH !== undefined) h = Math.min(h, Math.max(it.maxH, minFilas));
        // Primer hueco: la x (de izquierda a derecha) donde el widget queda más arriba.
        let mejorX = 0, mejorY = Infinity;
        for (let x = 0; x + w <= c; x++) {
            const y = Math.max(...alturas.slice(x, x + w));
            if (y < mejorY) { mejorY = y; mejorX = x; }
        }
        for (let x = mejorX; x < mejorX + w; x++) alturas[x] = mejorY + h;
        const minW = it.minW === undefined ? undefined : Math.min(w, Math.max(1, Math.round((it.minW * c) / 12)));
        const salida: ItemRejilla = { i: it.i, x: mejorX, y: mejorY, w, h, minH: Math.min(minFilas, h) };
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
