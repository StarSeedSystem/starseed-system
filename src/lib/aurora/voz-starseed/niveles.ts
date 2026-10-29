/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de voz con cuatro niveles que se adaptan al hardware SIN
 * cambiar la identidad de la voz: el timbre es el mismo, lo que varía es la
 * precisión del motor que lo sintetiza.
 *
 *  · estudio — OmniVoice GGUF Q8_0 por el demonio local (~1000 MB)
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
 * Nivel por defecto (decisión automática). A los cuatro niveles por hardware
 * se une el «nube» (2026-09-07, Ola 279 · V6): si no hay demonio local PERO hay
 * conexión, la síntesis por el servidor del OS suena bien sin descargar nada,
 * y queda ANTES que «ligera»/«mínima». Es el nivel que Alex pidió para que la
 * voz «funcione y suene bien» aunque el demonio esté apagado.
 */
export function nivelPorDefecto(c: Capacidades): NivelVoz {
    if (c.daemonLocal && (c.memoriaGB ?? 0) >= 8) return "estudio";
    if (c.daemonLocal) return "alta";
    // `navigator.onLine` solo existe en el navegador; el servidor cae a ligera/mínima.
    if (typeof navigator !== "undefined" && navigator.onLine) return "nube";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligera";
    return "minima";
}

/**
 * Elige el nivel más alto que el equipo puede sostener:
 *  · demonio local + 8 GB de RAM o más        → estudio
 *  · demonio local                             → alta
 *  · en línea y sin demonio                    → nube (Gemini/Pollinations)
 *  · escritorio con WebGPU o WASM SIMD         → ligera
 *  · cualquier otro caso                       → minima
 */
export function nivelPara(c: Capacidades): NivelVoz {
    return nivelPorDefecto(c);
}

/** RAM libre mínima (GB) para ofrecer «estudio» en esta neurona. */
export const RAM_MIN_ESTUDIO_GB = 8;

/**
 * Señales que no vienen del hardware local y las inyecta quien llama (así la
 * decisión sigue siendo pura): el descubrimiento de VoiceStudio y la malla.
 */
export interface SenalesEstudio {
    /** `descubrir()` de `voicestudio.ts` dijo que el motor está vivo. */
    voicestudioVivo: boolean;
    /** Otra neurona de la malla sirve el nivel «estudio» a esta. */
    servidoPorOtraNeurona?: boolean;
    /** GB libres reales; si falta se usa `capacidades.memoriaGB`. */
    memoriaLibreGB?: number | null;
}

/**
 * ¿Puede esta neurona ofrecer «estudio»? (contrato `voz-voicestudio.md` §4).
 * Solo con VoiceStudio vivo Y (≥ 8 GB libres O servido por otra neurona). Pura.
 */
export function estudioDisponible(c: Capacidades, s: SenalesEstudio): boolean {
    if (!s.voicestudioVivo) return false;
    if (s.servidoPorOtraNeurona === true) return true;
    const libre = s.memoriaLibreGB ?? c.memoriaGB;
    return typeof libre === "number" && Number.isFinite(libre) && libre >= RAM_MIN_ESTUDIO_GB;
}

/**
 * Nivel por hardware CON la compuerta de «estudio»: si el hardware pediría
 * estudio pero VoiceStudio no está vivo (o no cabe y nadie lo sirve), baja a
 * «alta», el siguiente escalón del mismo timbre. Pura.
 */
export function nivelConEstudio(c: Capacidades, s: SenalesEstudio): NivelVoz {
    if (estudioDisponible(c, s)) return "estudio";
    const base = nivelPorDefecto(c);
    return base === "estudio" ? "alta" : base;
}

/** Niveles ofrecidos con la compuerta de «estudio» aplicada, del mejor al peor. Pura. */
export function nivelesDisponiblesConEstudio(c: Capacidades, s: SenalesEstudio): NivelVoz[] {
    const mejor = nivelConEstudio(c, s);
    return ORDEN.slice(ORDEN.indexOf(mejor));
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
