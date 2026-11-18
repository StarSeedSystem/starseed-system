/**
 * CTL1118F · el ritmo de la pantalla fluida. Regla pura (sin red, sin disco, sin reloj): decide si el enlace y el WebView de quien manda
 * dan abasto con el tamaño y la calidad de los cuadros, o si hay que mandar menos bytes por cuadro. El objetivo es 15-30 cuadros/s por red
 * local; solo se baja calidad y tamaño cuando el CUADRO cuesta más de lo que cabe en 15 por segundo.
 *
 * Qué mide: el coste de un cuadro = lo que tarda `control_pantalla_cuadro` en traerlo + lo que tarda en pintarse. No se mide «cuadros por
 * segundo» a secas: con la pantalla quieta Android no entrega cuadros nuevos y eso no es un enlace lento.
 */

export interface NivelCuadro {
    lado: number;
    calidad: number;
}

/** De mejor a peor: el primero es el de siempre (1280 px, calidad 60). */
export const NIVELES_CUADRO: readonly NivelCuadro[] = [
    { lado: 1280, calidad: 60 },
    { lado: 1280, calidad: 45 },
    { lado: 960, calidad: 45 },
    { lado: 720, calidad: 40 },
];

/** Más de esto por cuadro (≈ 15 cuadros/s) y se baja un nivel. */
export const COSTE_ALTO_MS = 66;
/** Menos de esto por cuadro (≈ 33 cuadros/s) durante varias medidas y se sube un nivel. */
export const COSTE_BAJO_MS = 30;
/** Cuadros que se promedian antes de decidir. */
export const CUADROS_POR_MEDIDA = 30;
/** Medidas altas seguidas para bajar, y bajas seguidas para subir (subir es más lento que bajar: no se oscila). */
export const MEDIDAS_PARA_BAJAR = 2;
export const MEDIDAS_PARA_SUBIR = 4;

export interface EstadoRitmo {
    nivel: number;
    altas: number;
    bajas: number;
}

export const RITMO_INICIAL: EstadoRitmo = { nivel: 0, altas: 0, bajas: 0 };

/** Media móvil exponencial del coste de un cuadro (ms); el primero fija la media. */
export function mediaCoste(media: number | null, ms: number): number {
    const v = Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 5_000) : 0;
    return media === null ? v : (media * 7 + v) / 8;
}

/** Una medida (la media de los últimos `CUADROS_POR_MEDIDA` cuadros) → el estado siguiente. `cambio` = el nivel nuevo si hay que mandarlo. */
export function siguienteRitmo(e: EstadoRitmo, costeMs: number, umbrales: { alto: number; bajo: number } = { alto: COSTE_ALTO_MS, bajo: COSTE_BAJO_MS }): { estado: EstadoRitmo; cambio: NivelCuadro | null } {
    const ultimo = NIVELES_CUADRO.length - 1;
    if (costeMs > umbrales.alto) {
        const altas = e.altas + 1;
        if (altas >= MEDIDAS_PARA_BAJAR && e.nivel < ultimo) {
            const nivel = e.nivel + 1;
            return { estado: { nivel, altas: 0, bajas: 0 }, cambio: NIVELES_CUADRO[nivel] };
        }
        return { estado: { nivel: e.nivel, altas, bajas: 0 }, cambio: null };
    }
    if (costeMs < umbrales.bajo) {
        const bajas = e.bajas + 1;
        if (bajas >= MEDIDAS_PARA_SUBIR && e.nivel > 0) {
            const nivel = e.nivel - 1;
            return { estado: { nivel, altas: 0, bajas: 0 }, cambio: NIVELES_CUADRO[nivel] };
        }
        return { estado: { nivel: e.nivel, altas: 0, bajas }, cambio: null };
    }
    return { estado: { nivel: e.nivel, altas: 0, bajas: 0 }, cambio: null };
}

/** Los cuadros por segundo que cabrían con ese coste (solo para el registro; nunca se enseña como medido). */
export function capacidadFps(costeMs: number): number {
    return costeMs > 0 ? Math.min(60, Math.round((1000 / costeMs) * 10) / 10) : 60;
}
