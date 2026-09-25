/**
 * Física del arrastre (pura).
 * ─────────────────────────────────────────────────────────────────────────────
 * Tres piezas que dan la sensación «orgánica»:
 *
 *  1. ELASTICIDAD: pasado el límite (estirar un panel ya abierto hacia dentro)
 *     el panel se resiste cada vez más en vez de pararse en seco o seguir
 *     libre. Es la curva de goma de iOS: (1 − 1/(x·c/d + 1))·d.
 *  2. VELOCIDAD: se estima con las últimas muestras de una ventana corta
 *     (≈100 ms), no con la última pareja (demasiado ruidosa) ni con todo el
 *     gesto (un arrastre lento seguido de un latigazo debe contar como latigazo).
 *  3. DESTINO: al soltar, el panel va donde lo lleva la inercia. Un latigazo
 *     (flick) manda por sí solo; si no, se proyecta la posición con la
 *     velocidad y se compara con un umbral de recorrido.
 */

import { limitar } from "./geometria";
import type { Eje, EstadoPanel, Muestra } from "./tipos";

/** Resistencia elástica: devuelve cuánto se mueve de verdad el panel por un `exceso` de puntero. */
export function elastico(exceso: number, dimension: number, coef = 0.55): number {
    if (exceso === 0 || dimension <= 0) return 0;
    const signo = Math.sign(exceso);
    const x = Math.abs(exceso);
    return signo * (1 - 1 / ((x * coef) / dimension + 1)) * dimension;
}

/**
 * Instante de una muestra. Se prefiere `event.timeStamp` (la hora en que el
 * dedo se movió de verdad) a la hora en que el código lo atiende: con el hilo
 * principal ocupado, los eventos se atienden en racimos y la velocidad medida
 * con `performance.now()` sale falsa (un latigazo parece un arrastre lento).
 * Si el sello no es del mismo reloj (algunos entornos usan la época Unix), se
 * usa `ahora`.
 */
export function instanteDeEvento(sello: number | undefined, ahora: number): number {
    if (typeof sello === "number" && Number.isFinite(sello) && sello > 0 && Math.abs(sello - ahora) < 60_000) {
        return sello;
    }
    return ahora;
}

/** Añade una muestra conservando solo las más recientes (inmutable: devuelve un array nuevo). */
export function registrarMuestra(muestras: readonly Muestra[], muestra: Muestra, maximo = 8): Muestra[] {
    const siguiente = [...muestras, muestra];
    return siguiente.length > maximo ? siguiente.slice(siguiente.length - maximo) : siguiente;
}

/**
 * Velocidad (px/ms) en `eje` con las muestras de los últimos `ventanaMs`.
 * Si el puntero se quedó quieto antes de soltar (la última muestra es vieja
 * respecto de `ahora`), la velocidad es 0: soltar un panel parado no es un latigazo.
 */
export function velocidad(muestras: readonly Muestra[], eje: Eje, ventanaMs = 100, ahora?: number): number {
    if (muestras.length < 2) return 0;
    const ultima = muestras[muestras.length - 1];
    if (ahora !== undefined && ahora - ultima.t > ventanaMs) return 0;
    let primera = ultima;
    for (let i = muestras.length - 2; i >= 0; i--) {
        if (ultima.t - muestras[i].t > ventanaMs) break;
        primera = muestras[i];
    }
    // Equipo lento o hilo principal ocupado: los eventos llegan espaciados y en la
    // ventana solo cabe la última muestra. Se usa la anterior (hasta 3 ventanas
    // atrás) para no convertir un latigazo real en «soltar quieto».
    if (primera === ultima) {
        const previa = muestras[muestras.length - 2];
        if (ultima.t - previa.t <= ventanaMs * 3) primera = previa;
    }
    const dt = ultima.t - primera.t;
    if (dt <= 0) return 0;
    const d = eje === "x" ? ultima.x - primera.x : ultima.y - primera.y;
    return d / dt;
}

/**
 * «Cerradez» en px mientras se arrastra (0 = abierto, `tam` = cerrado).
 * `deltaHaciaCierre` es el recorrido del puntero proyectado hacia el borde
 * (positivo = hacia el cierre). Más allá de abierto, goma elástica; más allá
 * de cerrado, tope (no hay nada que mostrar fuera de la pantalla).
 */
export function cerradezArrastre(origen: EstadoPanel, deltaHaciaCierre: number, tam: number): number {
    const base = origen === "abierto" ? 0 : tam;
    const bruto = base + deltaHaciaCierre;
    if (bruto < 0) return elastico(bruto, tam);
    return Math.min(bruto, tam);
}

export interface EntradaDestino {
    /** Estado del que partió el gesto. */
    origen: EstadoPanel;
    /** Recorrido (px) desde el origen hacia el otro estado. Negativo = se estiró al revés. */
    recorrido: number;
    /** Velocidad (px/ms) hacia el otro estado al soltar. */
    velocidad: number;
    /** Tamaño del recorrido completo (px). */
    tam: number;
    /** Fracción del recorrido que hay que superar (proyectada) para cambiar de estado. */
    umbralCambio?: number;
    /** Velocidad (px/ms) a partir de la cual el latigazo decide solo (≈ 450 px/s). */
    umbralFlick?: number;
    /** Cuánto «mira hacia delante» la proyección de la inercia (ms). */
    proyeccionMs?: number;
}

export const UMBRAL_CAMBIO = 0.35;
export const UMBRAL_FLICK_PX_MS = 0.45;
export const PROYECCION_MS = 160;

/** Estado final del panel al soltar. */
export function decidirDestino(e: EntradaDestino): EstadoPanel {
    const otro: EstadoPanel = e.origen === "abierto" ? "cerrado" : "abierto";
    const flick = e.umbralFlick ?? UMBRAL_FLICK_PX_MS;
    if (e.velocidad >= flick) return otro;
    if (e.velocidad <= -flick) return e.origen;
    const tam = Math.max(1, e.tam);
    const proyectado = e.recorrido + e.velocidad * (e.proyeccionMs ?? PROYECCION_MS);
    const umbral = limitar(e.umbralCambio ?? UMBRAL_CAMBIO, 0.05, 0.95);
    return proyectado / tam >= umbral ? otro : e.origen;
}
