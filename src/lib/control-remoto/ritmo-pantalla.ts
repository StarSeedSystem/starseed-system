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

// ── CTL1124E · el empuje por el enlace directo ───────────────────────────────────────────────────
// Sin WebRTC (Linux) la pantalla no va de una orden por cuadro: el aparato manda cuadros JPEG seguidos
// por el enlace directo. El ritmo se adapta al retardo medido, con suelo y tope, y se descarta el cuadro
// viejo si uno nuevo ya está listo. Nada de esto baja los frenos de seguridad (el permiso sigue apagado).

/** Suelo del intervalo entre cuadros del empuje (ms): nunca por debajo de 25 cuadros/s. */
export const EMPUJE_MIN_MS = 40;
/** Tope del intervalo (ms): si el enlace no da más, no se apila; 4 cuadros/s como mínimo. */
export const EMPUJE_TOPE_MS = 250;
/** Objetivo de cuadros/s por la malla en red local (el empuje no baja de aquí si el enlace da). */
export const FPS_OBJETIVO_MALLA = 5;

/**
 * Intervalo entre cuadros del empuje (ms): el periodo base, o el retardo medido si es mayor (no se manda
 * más rápido de lo que el enlace tarda en llevar un cuadro), acotado al [suelo, tope]. Con el enlace
 * directo a 44 ms y base de 5 fps (200 ms) salen 5 cuadros/s; con base de 15 fps (66 ms), 15.
 */
export function intervaloEmpujeMs(retardoMs: number, baseMs: number, topeMs = EMPUJE_TOPE_MS): number {
    const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : COSTE_ALTO_MS;
    const retardo = Number.isFinite(retardoMs) && retardoMs > 0 ? Math.min(retardoMs, 5_000) : 0;
    const tope = Number.isFinite(topeMs) && topeMs >= EMPUJE_MIN_MS ? topeMs : EMPUJE_TOPE_MS;
    return Math.max(EMPUJE_MIN_MS, Math.min(tope, Math.max(base, retardo)));
}

/** Cuadros/s que caben con ese intervalo (para el registro; nunca se enseña como medido). */
export function fpsDesdeIntervalo(intervaloMs: number): number {
    return Number.isFinite(intervaloMs) && intervaloMs > 0 ? Math.min(60, Math.round((1000 / intervaloMs) * 10) / 10) : 0;
}

/** ¿Se descarta el cuadro viejo? Sí cuando el anterior aún no salió y ya hay uno nuevo listo. */
export function descartarCuadroViejo(pendiente: boolean, nuevoListo: boolean): boolean {
    return pendiente && nuevoListo;
}

// ── CTL1126B-d1 · contar y medir FPS real de cuadros recibidos por la malla

export interface CuadroConTimestamp {
    t: number;
    bytes: number;
}

export const VENTANA_FPS_CUADROS_MS = 3_000;

export function contarCuadrosEnVentana(
    cuadros: readonly CuadroConTimestamp[],
    ventanaMs: number,
    ahora: number,
): number {
    const limite = ahora - ventanaMs;
    return cuadros.filter((c) => c.t >= limite).length;
}

export function fpsCuadrosEnVentana(cuadros: readonly CuadroConTimestamp[], ahora: number): number {
    if (cuadros.length < 2) return 0;
    const filtrados = cuadros.filter((c) => c.t < ahora);
    if (filtrados.length < 2) return 0;
    filtrados.sort((a, b) => a.t - b.t);
    const primeroT = filtrados[0].t;
    const ultimoT = filtrados[filtrados.length - 1].t;
    const dt = ultimoT - primeroT;
    if (dt <= 0) return 0;
    return Math.min(60, Math.round((filtrados.length * 1000) / dt * 10) / 10);
}

export function adaptarIntervaloParaFps(
    fpsObjetivo: number,
    caudalMedidoFps: number | null,
    retardoMedidoMs: number,
): number {
    const baseMs = 1000 / Math.max(1, fpsObjetivo);
    const retardo = Math.max(0, Math.min(5_000, Number.isFinite(retardoMedidoMs) ? retardoMedidoMs : 0));
    if (caudalMedidoFps !== null && caudalMedidoFps > 0 && caudalMedidoFps < fpsObjetivo) {
        const intervaloNecesario = 1000 / caudalMedidoFps;
        return Math.max(EMPUJE_MIN_MS, Math.min(EMPUJE_TOPE_MS, Math.max(baseMs, retardo, intervaloNecesario)));
    }
    return Math.max(EMPUJE_MIN_MS, Math.min(EMPUJE_TOPE_MS, Math.max(baseMs, retardo)));
}
