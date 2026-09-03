/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de voz con cuatro niveles que se adaptan al hardware SIN
 * cambiar la identidad de la voz: el timbre es el mismo, lo que varía es la
 * precisión del motor que lo sintetiza.
 *
 *  · estudio — OmniVoice GGUF Q8_0 por el demonio local (~1000 MB)
 *  · alta    — OmniVoice GGUF Q4_K_M por el demonio local (~600 MB)
 *  · ligera  — Kokoro ONNX/WASM en el navegador (~120 MB)
 *  · minima  — voz del sistema operativo (0 MB)
 */

import type { Capacidades } from "./capacidades";

export type NivelVoz = "estudio" | "alta" | "ligera" | "minima";

export interface InfoNivel {
    /** Nombre legible para la interfaz. */
    etiqueta: string;
    /** Motor interno que sintetiza en este nivel. */
    motorInterno: string;
    /** Requisitos de hardware, en texto. */
    requisitos: string;
    /** Memoria que ocupa el modelo, en MB. */
    ramMB: number;
    /** Latencia percibida, en texto. */
    latencia: string;
    /** Calidad percibida, en texto. */
    calidad: string;
}

export const NIVELES: Record<NivelVoz, InfoNivel> = {
    estudio: {
        etiqueta: "Estudio",
        motorInterno: "OmniVoice GGUF Q8_0 (demonio local)",
        requisitos: "Demonio local de voz y 8 GB de RAM o más",
        ramMB: 1000,
        latencia: "Baja (local)",
        calidad: "Máxima, grado de estudio",
    },
    alta: {
        etiqueta: "Alta",
        motorInterno: "OmniVoice GGUF Q4_K_M (demonio local)",
        requisitos: "Demonio local de voz",
        ramMB: 600,
        latencia: "Baja (local)",
        calidad: "Alta, casi estudio",
    },
    ligera: {
        etiqueta: "Ligera",
        motorInterno: "Kokoro ONNX/WASM (navegador)",
        requisitos: "Equipo de escritorio con WebGPU o WASM SIMD",
        ramMB: 120,
        latencia: "Media (primera carga del modelo)",
        calidad: "Buena y estable",
    },
    minima: {
        etiqueta: "Mínima",
        motorInterno: "Voz del sistema operativo",
        requisitos: "Ninguno: funciona en cualquier equipo",
        ramMB: 0,
        latencia: "Inmediata",
        calidad: "Variable según el sistema",
    },
};

/** Cadena de descenso: cada nivel puede pasar al siguiente. */
const ORDEN: NivelVoz[] = ["estudio", "alta", "ligera", "minima"];

/**
 * Elige el nivel más alto que el equipo puede sostener:
 *  · demonio local + 8 GB de RAM o más        → estudio
 *  · demonio local                             → alta
 *  · escritorio con WebGPU o WASM SIMD         → ligera
 *  · cualquier otro caso                       → minima
 */
export function nivelPara(c: Capacidades): NivelVoz {
    if (c.daemonLocal && (c.memoriaGB ?? 0) >= 8) return "estudio";
    if (c.daemonLocal) return "alta";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligera";
    return "minima";
}

/**
 * Niveles que puede ofrecer este equipo, del mejor al peor.
 * Siempre incluye «minima», la red de seguridad que nunca falla.
 */
export function nivelesDisponibles(c: Capacidades): NivelVoz[] {
    const mejor = nivelPara(c);
    return ORDEN.slice(ORDEN.indexOf(mejor));
}

/**
 * El nivel inmediatamente inferior (degradación grácil), o `null` cuando ya
 * se está en el mínimo. Cadena: estudio → alta → ligera → minima → null.
 */
export function siguienteNivel(n: NivelVoz): NivelVoz | null {
    const i = ORDEN.indexOf(n);
    return i >= 0 && i < ORDEN.length - 1 ? ORDEN[i + 1] : null;
}
