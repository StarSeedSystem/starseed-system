/**
 * Audiomorphic — MOTOR MATEMÁTICO (Tratado de Unificación Armónica)
 * ============================================================================
 * Portado literalmente de `App.tsx` de la repo del usuario
 * (StarSeedSystem/Audiomorphic-AR-app). Es matemática pura, sin React ni DOM:
 * por eso puede usarla tanto la APP como la CAPA DE FONDO.
 *
 * Idea: una topología (V vértices, E aristas) se traduce en los dos parámetros
 * de la espiral —factor de cierre `k` y ángulo de giro `psi`— pasando por el
 * "triángulo armónico" y los factores de respiración (sigma/gamma).
 */

import type { GeometryRegime } from "./types";

/** Etapas del Génesis: de la singularidad al Cubo de Metatrón. */
export const GENESIS_STAGES: { name: string; V: number; E: number }[] = [
    { name: "I. El Vacío (Singularidad)", V: 1, E: 0 },
    { name: "II. Vesica Piscis (Luz)", V: 2, E: 1 },
    { name: "III. Semilla de la Vida", V: 7, E: 12 },
    { name: "IV. Huevo de la Vida (Cubo)", V: 8, E: 12 },
    { name: "V. Flor de la Vida", V: 19, E: 36 },
    { name: "VI. Fruto de la Vida", V: 13, E: 24 },
    { name: "VII. Cubo de Metatrón", V: 13, E: 78 },
];

/** Interpolación lineal. */
export const lerp = (start: number, end: number, amt: number): number => (1 - amt) * start + amt * end;

/** Interpolación de ángulos en RADIANES por el camino más corto. */
export const lerpAngle = (start: number, end: number, amt: number): number => {
    const d = end - start;
    const delta = ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    return start + delta * amt;
};

/** Interpolación de ángulos en GRADOS (la usa el color del renderer). */
export const lerpAngleDeg = (start: number, end: number, amt: number): number => {
    const d = end - start;
    const delta = ((((d + 180) % 360) + 360) % 360) - 180;
    return (start + delta * amt + 360) % 360;
};

export interface HarmonicGeometry {
    alpha: number;
    beta: number;
    sigma: number;
    gamma: number;
    k: number;
    psi: number;
    regime: GeometryRegime;
}

/**
 * Traduce una topología (V, E) a los parámetros de la espiral.
 *
 * NOTA del autor original (conservada): los valores crudos de `k` (p. ej. 0.7)
 * colapsan la espiral a cero en el bucle fractal. Por eso la "tensión
 * geométrica" (desviación respecto a 1) se mapea a una desviación visual muy
 * sutil (≈0.995–1.000) con el factor 0.004: la geometría influye en la forma
 * sin destruir la visibilidad.
 */
export function calculateHarmonicGeometry(V: number, E: number): HarmonicGeometry {
    // 1 · Entradas topológicas
    const alpha = V / 2;        // estructura (dual)
    const beta = Math.sqrt(E);  // potencial (tensión)

    // El Vacío: caso especial
    if (V === 1 && E === 0) {
        return { alpha: 0.5, beta: 0, sigma: 1, gamma: 0, k: 1, psi: 0.05, regime: "void" };
    }

    // 2 · Régimen — primario (estabilidad) si α ≥ β; recíproco (tensión) si no
    const regime: GeometryRegime = alpha >= beta ? "primary" : "reciprocal";

    // 3 · Triángulo armónico
    const c = Math.max(alpha, beta);          // hipotenusa
    const a = Math.min(alpha, beta);          // cateto estructural
    const b = Math.sqrt(c * c - a * a);       // cateto base/oculto

    // 4 · Factores de respiración
    const sigma = c + b; // expansión (Yang)
    const gamma = c - b; // contracción (Yin)

    // 5 · Ecuación de la espiral
    let kRaw = sigma === 0 ? 1 : gamma / sigma;
    if (b < 0.001) kRaw = 1.0; // equilibrio perfecto (Vesica, cuadrado)

    const k = 1.0 - (1.0 - kRaw) * 0.004; // corrección visual (ver nota)
    const psi = c === 0 ? 0 : Math.acos(b / c);

    return { alpha, beta, sigma, gamma, k, psi, regime };
}

/** Intervalo musical → polígono (Cap. III del tratado). */
export function harmonicShapeForInterval(interval: number): { V: number; E: number; name: string } {
    switch (interval) {
        case 6: return { V: 2, E: 1, name: "Tritono" };
        case 4: return { V: 3, E: 3, name: "Aumentada" };
        case 3: return { V: 4, E: 4, name: "Disminuida" };
        case 2: return { V: 6, E: 6, name: "Tonos Enteros" };
        case 7: return { V: 7, E: 7, name: "Escala Mayor" };
        default: return { V: 12, E: 12, name: "Cromática" };
    }
}

/** Energía (volumen + frecuencia) → etapa del Génesis (0-6). */
export function genesisStageForEnergy(volume: number, frequency: number): number {
    const energy = volume + frequency * 0.4;
    if (energy < 0.05) return 0; // Vacío
    if (energy < 0.15) return 1; // Vesica
    if (energy < 0.30) return 2; // Semilla
    if (energy < 0.45) return 3; // Huevo
    if (energy < 0.60) return 4; // Flor
    if (energy < 0.75) return 5; // Fruto
    return 6;                    // Metatrón
}
