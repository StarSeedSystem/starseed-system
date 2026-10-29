/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de voz con cuatro niveles que se adaptan al hardware SIN
 * cambiar la identidad de la voz: el timbre es el mismo, lo que varía es la
 * precisión del motor que lo sintetiza.
 *
 *  · estudio — OmniVoice GGUF Q8_0 por el demonio local (~1000 MB) o VoiceStudio
 *    vivo en su puerta local (Ola 1018V); también puede servirlo otra neurona
 *  · alta    — OmniVoice GGUF Q4_K_M por el demonio local (~600 MB)
 *  · nube    — Gemini TTS o Pollinations por el servidor del OS (0 MB, red)
 *  · ligera  — Kokoro ONNX/WASM en el navegador (~120 MB)
 *  · minima  — voz del sistema operativo (0 MB)
 */

import type { Capacidades } from "./capacidades";
import { soporteSupertonic } from "./supertonic";

export {
    soporteSupertonic,
    nivelParaVoz,
    crearNivelSuptonicoDefecto,
    IDIOMAS_SUPERTONIC,
    type NivelSuptonico,
    type SoporteSupertonic,
    type NivelVozSuptonica,
    type OpcionesNivelVoz,
} from "./supertonic";

export type NivelVoz = "estudio" | "alta" | "nube" | "ligera" | "minima";

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
        requisitos: "Demonio local o VoiceStudio vivo, y 8 GB de RAM libres (o servido desde otra neurona)",
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
    nube: {
        etiqueta: "Nube",
        motorInterno: "Gemini TTS o Pollinations (servidor del OS)",
        requisitos: "Conexión a internet",
        ramMB: 0,
        latencia: "Media (1-4 s)",
        calidad: "Alta y estable",
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
const ORDEN: NivelVoz[] = ["estudio", "alta", "nube", "ligera", "minima"];

/**
 * Señales que el hardware no mide por sí mismo y que habilitan «estudio»
 * (Ola 1018V · VST1018F): resultan de `descubrir()` de `voicestudio.ts`
 * (red, se pasa ya resuelta) y del relevo de capacidades de la malla
 * (`apps-en-la-malla.md`). El módulo sigue puro: recibe todo por parámetro.
 */
export interface SenalEstudio {
    /** VoiceStudio dijo vivo en su puerta local. */
    voicestudio?: boolean;
    /** Otra neurona de la cuenta sirve la voz de estudio (relevo `capacidad.*`). */
    sirveOtraNeurona?: boolean;
}

/**
 * estudioDisponible — puede «estudio» sostenerse (Ola 1018V · VST1018F).
 *
 * Solo si:
 *   · se dijo vivo un motor de estudio local (demonio de voz o VoiceStudio)
 *     Y la neurona tiene 8 GB o más de memoria; o
 *   · la voz de estudio la sirve otra neurona de la malla (no ocupa RAM local).
 *
 * Pura: nada de red, disco ni reloj.
 */
export function estudioDisponible(c: Capacidades, senal: SenalEstudio = {}): boolean {
    if (senal.sirveOtraNeurona === true) return true;
    if ((c.memoriaGB ?? 0) < 8) return false;
    return c.daemonLocal === true || senal.voicestudio === true;
}

/**
 * Nivel por defecto (decisión automática). A los cuatro niveles por hardware
 * se une el «nube» (2026-09-07, Ola 279 · V6): si no hay demonio local PERO hay
 * conexión, la síntesis por el servidor del OS suena bien sin descargar nada,
 * y queda ANTES que «ligera»/«mínima». Es el nivel que Alex pidió para que la
 * voz «funcione y suene bien» aunque el demonio esté apagado.
 *
 * (Ola 1018V · VST1018F) El nivel «estudio» exige señales externas además del
 * demonio: VoiceStudio vivo por `descubrir()` o servido desde otra neurona.
 */
export function nivelPorDefecto(c: Capacidades, senal: SenalEstudio = {}): NivelVoz {
    if (estudioDisponible(c, senal)) return "estudio";
    if (c.daemonLocal) return "alta";
    // `navigator.onLine` solo existe en el navegador; el servidor cae a ligera/mínima.
    if (typeof navigator !== "undefined" && navigator.onLine) return "nube";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligera";
    return "minima";
}

/**
 * Elige el nivel más alto que el equipo puede sostener:
 *  · demo­nio local o VoiceStudio vivo + 8 GB de RAM o más   → estudio
 *  · servido por otra neurona de la malla                    → estudio
 *  · demonio local                                            → alta
 *  · en línea y sin demonio                                   → nube (Gemini/Pollinations)
 *  · escritorio con WebGPU o WASM SIMD                        → ligera
 *  · cualquier otro caso                                      → minima
 */
export function nivelPara(c: Capacidades, senal: SenalEstudio = {}): NivelVoz {
    return nivelPorDefecto(c, senal);
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
 * se está en el mínimo. Cadena: estudio → alta → nube → ligera → minima → null.
 */
export function siguienteNivel(n: NivelVoz): NivelVoz | null {
    const i = ORDEN.indexOf(n);
    return i >= 0 && i < ORDEN.length - 1 ? ORDEN[i + 1] : null;
}
