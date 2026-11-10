// ════════════════════════════════════════════════════════════════
// StarSeed OS — La Flor de la Vida fundida con el símbolo (ESC1110B)
// ----------------------------------------------------------------
// Lógica PURA (sin three ni React): geometría de la flor y su giro.
//
// Fusión. La marca es una vesica piscis: dos círculos iguales (r = 500 px)
// cuyos centros distan 497 px, casi el radio. En la Flor de la Vida dos
// círculos vecinos guardan esa misma relación. Así que la flor se construye
// con las cifras de la marca: radio de anillo = radio del disco y paso de la
// retícula hexagonal = distancia entre los centros de los discos. El centro
// de la flor es el centro del disco inferior y su vecino de arriba cae, por
// construcción, en el centro del disco superior (error 0). La flor ideal
// tendría paso = radio; la diferencia (3 px de 1000, 0,6 %) es de la propia
// marca y no se ve: a 192 px de alto son 0,4 px.
//
// Giro. Rotación lenta automática alrededor del centro de la flor, con
// pausas en las posiciones de reposo (cada 60°: ahí un anillo vuelve a caer
// sobre el disco superior). Se puede arrastrar con inercia y se asienta en
// la posición de reposo más cercana; con el teclado salta de 60° en 60°.
// ════════════════════════════════════════════════════════════════

import { CIRCULOS, pxAModelo } from "./simbolo-starseed-medidas";

/** Radio de cada anillo (= radio de los discos), en unidades del modelo. */
export const RADIO_FLOR = CIRCULOS.inferior.r / 1000;
/** Centro de la flor = centro del disco inferior (unidades del modelo, origen en el ojo). */
export const CENTRO_FLOR: readonly [number, number] = pxAModelo(CIRCULOS.inferior.cx, CIRCULOS.inferior.cy);
/** Centro del disco superior. */
export const CENTRO_DISCO_SUPERIOR: readonly [number, number] = pxAModelo(CIRCULOS.superior.cx, CIRCULOS.superior.cy);
/** Paso de la retícula = distancia entre los centros de los dos discos. */
export const PASO_FLOR = Math.hypot(CENTRO_DISCO_SUPERIOR[0] - CENTRO_FLOR[0], CENTRO_DISCO_SUPERIOR[1] - CENTRO_FLOR[1]);
/** Radio de los dos anillos que envuelven la flor (clásica de 19 círculos). */
export const RADIO_ENVOLVENTE = 2 * PASO_FLOR + RADIO_FLOR;
/** Entre posiciones de reposo hay 60°. */
export const PASO_REPOSO = Math.PI / 3;

/**
 * Centros de los 19 círculos (semilla + segundo anillo), relativos al centro
 * de la flor, girados `angulo` rad (antihorario). Con ángulo 0 el primer
 * vecino queda justo encima (90°): el disco superior.
 */
export function centrosFlor(angulo = 0): Array<[number, number]> {
    const base: Array<[number, number]> = [[0, 0]];
    const dirs: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + i * PASO_REPOSO;
        dirs.push([Math.cos(a), Math.sin(a)]);
    }
    for (const [dx, dy] of dirs) base.push([dx * PASO_FLOR, dy * PASO_FLOR]);
    for (let i = 0; i < 6; i++) {
        const [ax, ay] = dirs[i];
        const [bx, by] = dirs[(i + 1) % 6];
        base.push([2 * ax * PASO_FLOR, 2 * ay * PASO_FLOR]);
        base.push([(ax + bx) * PASO_FLOR, (ay + by) * PASO_FLOR]);
    }
    const c = Math.cos(angulo);
    const s = Math.sin(angulo);
    return base.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

/**
 * Error de la fusión con la flor girada `angulo`: distancia del centro del
 * disco superior al centro de anillo más cercano y diferencia de radios
 * (unidades del modelo). En cada posición de reposo, ambos son 0.
 */
export function errorFusion(angulo = 0): { centroSuperior: number; centroInferior: number; radio: number } {
    const rel: [number, number] = [CENTRO_DISCO_SUPERIOR[0] - CENTRO_FLOR[0], CENTRO_DISCO_SUPERIOR[1] - CENTRO_FLOR[1]];
    let minimo = Infinity;
    for (const [x, y] of centrosFlor(angulo)) minimo = Math.min(minimo, Math.hypot(x - rel[0], y - rel[1]));
    return {
        centroSuperior: minimo,
        centroInferior: 0, // el centro de la flor ES el centro del disco inferior
        radio: Math.abs(RADIO_FLOR - CIRCULOS.superior.r / 1000) + Math.abs(RADIO_FLOR - CIRCULOS.inferior.r / 1000),
    };
}

// ── Giro ─────────────────────────────────────────────────────────

export type ModoFlor = "pausa" | "deslizando" | "arrastre" | "inercia" | "asentando" | "quieta";

export interface EstadoFlor {
    /** Ángulo actual (rad, sin acotar: puede dar vueltas). */
    angulo: number;
    /** Velocidad angular (rad/s). */
    velocidad: number;
    modo: ModoFlor;
    /** Tiempo acumulado en el modo actual (s). */
    tiempo: number;
    /** Ángulo de salida del deslizamiento automático o del asentamiento. */
    desde: number;
    /** Posición de reposo a la que va. */
    destino: number;
}

export interface OpcionesFlor {
    /** Rotación automática (apagada con movimiento reducido o si el archivo la desactiva). */
    auto: boolean;
    /** Segundos de pausa en cada posición de reposo. */
    pausa: number;
    /** Segundos que tarda en deslizarse 60° en automático. */
    deslizar: number;
    /** Sentido del giro automático (1 antihorario, −1 horario). */
    sentido: 1 | -1;
    /** Fricción de la inercia (1/s). */
    friccion: number;
    /** Por debajo de esta velocidad (rad/s) la inercia se entrega al asentamiento. */
    umbral: number;
    /** Rigidez del resorte que asienta en la posición de reposo (1/s²). */
    rigidez: number;
}

export const OPCIONES_FLOR: OpcionesFlor = {
    auto: true,
    pausa: 7,
    deslizar: 4.5,
    sentido: -1,
    friccion: 2.2,
    umbral: 0.9,
    rigidez: 40,
};

export function estadoFlorInicial(angulo = 0): EstadoFlor {
    const a = reposoMasCercano(angulo);
    return { angulo: a, velocidad: 0, modo: "pausa", tiempo: 0, desde: a, destino: a };
}

/** Posición de reposo (múltiplo de 60°) más cercana. */
export function reposoMasCercano(angulo: number): number {
    return Math.round(angulo / PASO_REPOSO) * PASO_REPOSO;
}

/** ¿Está la flor exactamente en una posición de reposo? */
export function enReposo(angulo: number, tolerancia = 1e-6): boolean {
    return Math.abs(angulo - reposoMasCercano(angulo)) <= tolerancia;
}

/** Suavizado senoidal de entrada y salida (0 → 1). */
export function suavizar(t: number): number {
    const x = Math.min(1, Math.max(0, t));
    return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** Lo que hace la flor cuando nadie la toca: pausa o queda quieta. */
function descanso(angulo: number, o: OpcionesFlor): EstadoFlor {
    return { angulo, velocidad: 0, modo: o.auto ? "pausa" : "quieta", tiempo: 0, desde: angulo, destino: angulo };
}

/** Avanza el estado `dt` segundos. Pura: devuelve un estado nuevo. */
export function pasoFlor(e: EstadoFlor, dt: number, o: OpcionesFlor = OPCIONES_FLOR): EstadoFlor {
    const d = Math.min(Math.max(0, dt), 0.1); // una pestaña dormida no hace saltar la flor
    switch (e.modo) {
        case "quieta":
            return o.auto ? { ...e, modo: "pausa", tiempo: 0 } : e;
        case "pausa": {
            if (!o.auto) return { ...e, modo: "quieta", tiempo: 0 };
            const t = e.tiempo + d;
            if (t < o.pausa) return { ...e, tiempo: t };
            const destino = reposoMasCercano(e.angulo) + o.sentido * PASO_REPOSO;
            return { ...e, modo: "deslizando", tiempo: 0, desde: e.angulo, destino, velocidad: 0 };
        }
        case "deslizando": {
            if (!o.auto) return descanso(reposoMasCercano(e.angulo), o);
            const t = e.tiempo + d;
            const k = t / o.deslizar;
            if (k >= 1) return descanso(e.destino, o);
            const angulo = e.desde + (e.destino - e.desde) * suavizar(k);
            return { ...e, angulo, tiempo: t, velocidad: d > 0 ? (angulo - e.angulo) / d : e.velocidad };
        }
        case "arrastre":
            return { ...e, tiempo: e.tiempo + d };
        case "inercia": {
            const v = e.velocidad * Math.exp(-o.friccion * d);
            const angulo = e.angulo + v * d;
            if (Math.abs(v) > o.umbral) return { ...e, angulo, velocidad: v, tiempo: e.tiempo + d };
            // Se entrega al resorte hacia la posición de reposo adonde la llevaría el impulso que le queda.
            const destino = reposoMasCercano(angulo + v / Math.sqrt(o.rigidez));
            return { ...e, angulo, velocidad: v, modo: "asentando", tiempo: 0, desde: angulo, destino };
        }
        case "asentando": {
            // Resorte críticamente amortiguado: llega sin rebotar.
            const w = Math.sqrt(o.rigidez);
            const acel = o.rigidez * (e.destino - e.angulo) - 2 * w * e.velocidad;
            const velocidad = e.velocidad + acel * d;
            const angulo = e.angulo + velocidad * d;
            if (Math.abs(e.destino - angulo) < 1e-4 && Math.abs(velocidad) < 2e-3) return descanso(e.destino, o);
            return { ...e, angulo, velocidad, tiempo: e.tiempo + d };
        }
    }
}

/** Empieza (o continúa) un arrastre: suma `delta` rad y estima la velocidad. */
export function arrastrarFlor(e: EstadoFlor, delta: number, dt: number): EstadoFlor {
    const v = dt > 0 ? delta / dt : 0;
    const velocidad = e.modo === "arrastre" ? e.velocidad * 0.6 + v * 0.4 : v;
    return { ...e, modo: "arrastre", angulo: e.angulo + delta, velocidad, tiempo: 0 };
}

/** Suelta el arrastre: sigue con inercia (o se asienta directamente sin inercia). */
export function soltarFlor(e: EstadoFlor, conInercia = true): EstadoFlor {
    if (!conInercia) return asentarEn(e, reposoMasCercano(e.angulo), true);
    return { ...e, modo: "inercia", tiempo: 0 };
}

/** Lleva la flor a una posición de reposo. `inmediato` = sin animación (movimiento reducido). */
export function asentarEn(e: EstadoFlor, destino: number, inmediato = false): EstadoFlor {
    if (inmediato) return { angulo: destino, velocidad: 0, modo: "quieta", tiempo: 0, desde: destino, destino };
    return { ...e, modo: "asentando", tiempo: 0, desde: e.angulo, destino, velocidad: e.modo === "asentando" ? e.velocidad : 0 };
}

/** Teclado: ±60° desde la posición de reposo actual (o la que ya iba buscando). */
export function girarConTeclado(e: EstadoFlor, sentido: 1 | -1, inmediato = false): EstadoFlor {
    const base = e.modo === "asentando" || e.modo === "deslizando" ? e.destino : reposoMasCercano(e.angulo);
    return asentarEn(e, base + sentido * PASO_REPOSO, inmediato);
}

/** ¿Hace falta seguir pintando por la flor? */
export function florEnMovimiento(e: EstadoFlor): boolean {
    return e.modo === "deslizando" || e.modo === "inercia" || e.modo === "asentando" || e.modo === "arrastre";
}

/** Índice (0–5) de la posición de reposo, para lectores de pantalla. */
export function indiceReposo(angulo: number): number {
    const n = Math.round(angulo / PASO_REPOSO) % 6;
    return (n + 6) % 6;
}
