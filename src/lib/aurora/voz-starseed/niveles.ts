/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de voz con cuatro niveles que se adaptan al hardware SIN
 * cambiar la identidad de la voz: el timbre es el mismo, lo que varía es la
 * precisión del motor que lo sintetiza.
 *
 *  · estudio — OmniVoice GGUF Q8_0 por el demonio local (~1000 MB) o
 *             VoiceStudio local (Ola 1018V), si `descubrir()` lo vio vivo y
 *             esta neurona aguanta el motor (≥ RAM_LIBRE_ESTUDIO_GB libres)
 *             o lo sirve otra neurona de la malla (contrato §3.1 y §4)
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
        requisitos: "VoiceStudio vivo y ≥ 8 GB libres (o lo sirve otra neurona), o demonio local de voz con 8 GB de RAM o más",
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

/* ── (Ola 1018V) CUÁNDO HAY ESTUDIO, AHORA DECIDE VOICESTUDIO ─────────────── */

/**
 * Lo que hace falta saber de VoiceStudio para ofrecer «estudio», de la
 * medición que ya hizo otro módulo con `descubrir()` (voicestudio.ts) y la
 * memoria libre real de la neurona: nada se sondea aquí (módulo puro).
 */
export interface OpcionesEstudio {
    /** `descubrir()` de VoiceStudio dijo VIVO: instalado y respondiendo. */
    vozStudioVivo?: boolean;
    /** Memoria LIBRE de esta neurona, en GB (`null` si se desconoce). */
    memoriaLibreGB?: number | null;
    /** Otra neurona de la malla sirve voz de estudio a esta por el relé `capacidad.*`. */
    sirveOtraNeurona?: boolean;
}

/**
 * Memoria LIBRE que pide el motor de estudio (contrato: 8 GB, y 16 con folgo).
 * Un estudio servido por OTRA neurona no ocupa aquí nada: esa vía no la mira.
 */
export const RAM_LIBRE_ESTUDIO_GB = 8;

/**
 * ¿Puede sonar el nivel «estudio» ahora mismo? Solo si `descubrir()` de
 * VoiceStudio dijo vivo Y esta neurona tiene ≥ RAM_LIBRE_ESTUDIO_GB libres o
 * lo sirve otra neurona de la malla. Sin datos de VoiceStudio, no hay
 * estudio por esta vía (el del demonio OmniVoice, el de la Ola 228, no cambia).
 * Pura.
 */
export function estudioDisponible(o?: OpcionesEstudio): boolean {
    if (!o || o.vozStudioVivo !== true) return false;
    const libre = typeof o.memoriaLibreGB === "number" && Number.isFinite(o.memoriaLibreGB) ? o.memoriaLibreGB : 0;
    return libre >= RAM_LIBRE_ESTUDIO_GB || o.sirveOtraNeurona === true;
}

/**
 * Nivel por defecto (decisión automática). A los cuatro niveles por hardware
 * se une el «nube» (2026-09-07, Ola 279 · V6): si no hay demonio local PERO hay
 * conexión, la síntesis por el servidor del OS suena bien sin descargar nada,
 * y queda ANTES que «ligera»/«mínima». Es el nivel que Alex pidió para que la
 * voz «funcione y suene bien» aunque el demonio esté apagado.
 *
 * (Ola 1018V) Y el segundo parámetro abre el «estudio» POR VOICESTUDIO: si
 * `estudioDisponible()` lo dice, el nivel más fino entra aunque no haya
 * demonio OmniVoice (o dos veces igual: da igual, hay estudio).
 */
export function nivelPorDefecto(c: Capacidades, estudio?: OpcionesEstudio): NivelVoz {
    if (estudioDisponible(estudio)) return "estudio";
    if (c.daemonLocal && (c.memoriaGB ?? 0) >= 8) return "estudio";
    if (c.daemonLocal) return "alta";
    // `navigator.onLine` solo existe en el navegador; el servidor cae a ligera/mínima.
    if (typeof navigator !== "undefined" && navigator.onLine) return "nube";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligera";
    return "minima";
}

/**
 * Elige el nivel más alto que el equipo puede sostener:
 *  · VoiceStudio vivo y (≥ 8 GB libres o lo sirve otra neurona) → estudio
 *  · demonio local + 8 GB de RAM o más          → estudio
 *  · demonio local                              → alta
 *  · en línea y sin demonio                     → nube (Gemini/Pollinations)
 *  · escritorio con WebGPU o WASM SIMD          → ligera
 *  · cualquier otro caso                        → minima
 */
export function nivelPara(c: Capacidades, estudio?: OpcionesEstudio): NivelVoz {
    return nivelPorDefecto(c, estudio);
}

/**
 * Niveles que puede ofrecer este equipo, del mejor al peor.
 * Siempre incluye «minima», la red de seguridad que nunca falla.
 */
export function nivelesDisponibles(c: Capacidades, estudio?: OpcionesEstudio): NivelVoz[] {
    const mejor = nivelPara(c, estudio);
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
