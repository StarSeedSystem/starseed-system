/**
 * CUANTIZACIÓN POR MEDIO — LABORATORIO (Ola 230 · L7)
 * ─────────────────────────────────────────────────────────────────────────────
 * El laboratorio decide, para CADA medio, con qué precisión corre el modelo y
 * cómo se adapta al equipo. Reutiliza la detección de `capacidades.ts`
 * (voz-starseed) y el patrón de niveles de `niveles.ts`; no duplica sondeos.
 *
 * Reglas:
 *  · Equipo potente (demonio local + 8 GB de RAM o más): la ternaria 1,58-bit
 *    del sistema corre local en texto y voz; el resto al nivel más alto
 *    razonable.
 *  · Equipo modesto (demonio local o escritorio con WebGPU/SIMD): q4-k-m y
 *    niveles ligeros para todo.
 *  · Móvil: lo mínimo imprescindible en local y el grueso en la nube.
 */

import type { Capacidades } from "../aurora/voz-starseed/capacidades";
import { nivelPara, NIVELES } from "../aurora/voz-starseed/niveles";
import type { NivelVoz } from "../aurora/voz-starseed/niveles";

export type Precision = "ternaria-158" | "q4-k-m" | "q8-0" | "fp16";

export interface InfoPrecision {
    /** Nombre legible para la interfaz. */
    etiqueta: string;
    /** Bits por peso del modelo. */
    bitsPorPeso: number;
    /** Memoria que ocupa en relación con fp16 (fp16 = 16). */
    memoriaRelativa: number;
    /** Calidad percibida en relación con fp16 (fp16 = 1). */
    calidadRelativa: number;
    /** Explicación corta del formato. */
    nota: string;
}

export const PRECISIONES: Record<Precision, InfoPrecision> = {
    "ternaria-158": {
        etiqueta: "Ternaria 1,58-bit",
        bitsPorPeso: 1.58,
        memoriaRelativa: 1.58,
        calidadRelativa: 0.92,
        nota: "Precisión propia del sistema: pesos {-1, 0, 1}; la más ligera, nativa de Astraura 1.58-bit",
    },
    "q4-k-m": {
        etiqueta: "Q4_K_M",
        bitsPorPeso: 4.5,
        memoriaRelativa: 4.5,
        calidadRelativa: 0.85,
        nota: "Cuantización GGUF de 4,5 bits; buen equilibrio memoria/calidad",
    },
    "q8-0": {
        etiqueta: "Q8_0",
        bitsPorPeso: 8,
        memoriaRelativa: 8,
        calidadRelativa: 0.97,
        nota: "Cuantización de 8 bits; casi indistinguible de fp16",
    },
    fp16: {
        etiqueta: "FP16",
        bitsPorPeso: 16,
        memoriaRelativa: 16,
        calidadRelativa: 1,
        nota: "Punto flotante de 16 bits: la referencia; máxima calidad y máxima memoria",
    },
};

export type Medio =
    | "texto"
    | "voz"
    | "imagen"
    | "video"
    | "sonido"
    | "programa"
    | "avatar"
    | "interaccion"
    | "red"
    | "permisos";

export const MEDIOS: Medio[] = [
    "texto",
    "voz",
    "imagen",
    "video",
    "sonido",
    "programa",
    "avatar",
    "interaccion",
    "red",
    "permisos",
];

export interface PlanMedio {
    precision: Precision;
    /** Nivel de la cadena de niveles; para la voz coincide con el motor único. */
    nivel: string;
    /** Por qué se eligió así, en texto. */
    motivo: string;
}

/** Orden de niveles del más alto al más bajo (patrón de `niveles.ts`). */
const NIVELES_LAB = ["estudio", "alta", "ligera", "minima"] as const;
export type NivelLab = (typeof NIVELES_LAB)[number];

/** Clasificación del equipo en tres franjas. */
type Franja = "potente" | "modesta" | "movil";

/**
 * Clasifica el equipo sin repetir cálculos propios: la voz ya mide lo
 * esencial (`nivelPara`), y aquí solo se añade el caso móvil.
 */
export function franjaDelEquipo(c: Capacidades): Franja {
    if (c.movil) return "movil";
    return c.daemonLocal && (c.memoriaGB ?? 0) >= 8 ? "potente" : "modesta";
}

function nivelVozComoLab(c: Capacidades): NivelLab {
    return nivelPara(c) as NivelLab;
}

/** Precisión acorde a la franja: nunca fp16 fuera de… ningún caso (no se usa local). */
function precisionParaFranja(franja: Franja, medioPesado: boolean): Precision {
    if (franja === "potente") return "ternaria-158";
    if (franja === "modesta") return medioPesado ? "q4-k-m" : "q4-k-m";
    return "q4-k-m";
}

/**
 * Reparte precisión y nivel para los diez medios según el equipo:
 *  · potente — ternaria local en texto y voz (estudio), el resto también alto.
 *  · modesta — q4 en todo y niveles ligeros.
 *  · móvil   — mínimo en local; texto y voz se derivan a la nube.
 */
export function planPorHardware(c: Capacidades): Record<Medio, PlanMedio> {
    const franja = franjaDelEquipo(c);
    const plan = {} as Record<Medio, PlanMedio>;

    if (franja === "movil") {
        for (const m of MEDIOS) {
            const esencial = m === "interaccion" || m === "permisos";
            plan[m] = {
                precision: esencial ? "q4-k-m" : "q4-k-m",
                nivel: esencial ? "minima" : "nube",
                motivo: esencial
                    ? "Equipo móvil: solo lo imprescindible en local"
                    : "Equipo móvil: en la nube para no saturar la memoria",
            };
        }
        return plan;
    }

    if (franja === "potente") {
        const nivelVoz = nivelVozComoLab(c);
        for (const m of MEDIOS) {
            if (m === "texto") {
                plan[m] = {
                    precision: "ternaria-158",
                    nivel: "estudio",
                    motivo: "Equipo potente: la ternaria propia corre local al máximo nivel",
                };
            } else if (m === "voz") {
                plan[m] = {
                    precision: "ternaria-158",
                    nivel: nivelVoz,
                    motivo: `Equipo potente: voz de estudio local (${NIVELES[nivelVoz as NivelVoz].etiqueta})`,
                };
            } else {
                plan[m] = {
                    precision: precisionParaFranja(franja, false),
                    nivel: "alta",
                    motivo: "Equipo potente: nivel alto en local",
                };
            }
        }
        return plan;
    }

    // Franja modesta: q4 en todo, niveles ligeros; jamás fp16.
    const nivelVoz = nivelVozComoLab(c);
    for (const m of MEDIOS) {
        plan[m] = {
            precision: "q4-k-m",
            nivel: m === "voz" ? nivelVoz : "ligera",
            motivo:
                m === "voz"
                    ? `Equipo modesto: voz en el nivel que sostiene el equipo (${NIVELES[nivelVoz as NivelVoz].etiqueta})`
                    : "Equipo modesto: q4 y nivel ligero para no ahogar la memoria",
        };
    }
    return plan;
}

export interface EstimacionMemoria {
    /** MB estimados por medio. */
    porMedio: Record<Medio, number>;
    /** Suma de todos los medios, en MB. */
    totalMB: number;
}

/**
 * Estima la memoria del plan: `parametrosPorMedio` son miles de millones de
 * parámetros por medio, y la memoria es parámetros × bitsPorPeso ÷ 8 bytes,
 * con el resultado en MB (1 B parámetro ≈ 1000 M parámetros).
 * Sirve para avisar antes de que el equipo se ahogue.
 */
export function estimarMemoria(
    plan: Record<Medio, PlanMedio>,
    parametrosPorMedio: Partial<Record<Medio, number>>,
): EstimacionMemoria {
    const porMedio = {} as Record<Medio, number>;
    let totalMB = 0;
    for (const m of MEDIOS) {
        const bParametros = parametrosPorMedio[m] ?? 0;
        // 1 B parámetros × (bits/8) bytes = 1000 × bits/8 MB
        const mb = (bParametros * PRECISIONES[plan[m].precision].bitsPorPeso * 1000) / 8;
        porMedio[m] = Math.round(mb * 10) / 10;
        totalMB += porMedio[m];
    }
    return { porMedio, totalMB: Math.round(totalMB * 10) / 10 };
}
