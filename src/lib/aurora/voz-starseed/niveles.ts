/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de voz con cinco niveles que se adaptan al hardware SIN
 * cambiar la identidad de la voz: el timbre es el mismo, lo que varía es la
 * precisión del motor que lo sintetiza.
 *
 *  · estudio — OmniVoice GGUF Q8_0 o VoiceStudio por el demonio local (~1000 MB)
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
        motorInterno: "OmniVoice GGUF Q8_0 o VoiceStudio (demonio local)",
        requisitos: "VoiceStudio vivo y 8 GB de RAM libres (o servido por otra neurona)",
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

/** RAM libre mínima (GB) para ofrecer «estudio» en esta neurona. */
export const RAM_MIN_ESTUDIO_GB = 8;

/**
 * Estado MEDIDO de VoiceStudio en esta neurona: lo aporta `descubrir()` de
 * `voicestudio.ts` (y la malla). Se inyecta para que la decisión siga siendo
 * pura: aquí no hay red, ni disco, ni reloj.
 */
export interface EstadoEstudio {
    /** El descubrimiento dijo que el motor de VoiceStudio está vivo. */
    voicestudioVivo: boolean;
    /** GB de memoria LIBRES en esta neurona; `null` si se desconoce (se toma 0). */
    memoriaLibreGB: number | null;
    /** Otra neurona de la malla sirve VoiceStudio a esta (la memoria la lleva quien sirve). */
    servidaPorOtraNeurona: boolean;
}

/**
 * El nivel «estudio» SOLO está disponible si VoiceStudio está vivo y la neurona
 * tiene 8 GB de memoria libres o más, o si otra neurona de la malla se lo sirve
 * (contrato `architecture/voz-voicestudio.md` §3-§4). Pura.
 */
export function estudioDisponible(e?: EstadoEstudio): boolean {
    if (!e || !e.voicestudioVivo) return false;
    return (e.memoriaLibreGB ?? 0) >= RAM_MIN_ESTUDIO_GB || e.servidaPorOtraNeurona;
}

/** Uso del turno: dónde va a sonar lo que se pide. */
export type UsoVoz = "conversacion" | "aviso" | "lectura" | "doblaje" | "audiolibro";

/** «estudio» solo para lectura larga, doblaje y audiolibros (contrato §4). */
export function estudioSegunUso(uso: UsoVoz): boolean {
    return uso === "lectura" || uso === "doblaje" || uso === "audiolibro";
}

/** Nivel más alto que este uso puede pedir; `null` = sin tope (llega a «estudio»). */
export function nivelTopeSegunUso(uso: UsoVoz): NivelVoz | null {
    return estudioSegunUso(uso) ? null : "alta";
}

/** Baja `n` al `tope` solo si lo supera: nunca SUBE un nivel que ya cayó. Pura. */
export function acotarNivel(n: NivelVoz, tope: NivelVoz): NivelVoz {
    return ORDEN.indexOf(n) < ORDEN.indexOf(tope) ? tope : n;
}

/**
 * Nivel por defecto (decisión automática). A los cuatro niveles por hardware
 * se une el «nube» (2026-09-07, Ola 279 · V6): si no hay demonio local PERO hay
 * conexión, la síntesis por el servidor del OS suena bien sin descargar nada,
 * y queda ANTES que «ligera»/«mínima». Es el nivel que Alex pidió para que la
 * voz «funcione y suene bien» aunque el demonio esté apagado.
 *
 * (Ola 1018F) Con el estado de VoiceStudio MEDIDO (`estudio`), «estudio» solo
 * sale de `estudioDisponible`: vivo con 8 GB libres o servido por otra neurona
 * (el demonio local no hace falta). Sin esas condiciones el demonio queda como
 * «alta». Sin datos de VoiceStudio (llamadores antiguos) manda la regla
 * histórica del demonio con 8 GB de RAM.
 */
export function nivelPorDefecto(c: Capacidades, estudio?: EstadoEstudio): NivelVoz {
    if (estudio !== undefined) {
        if (estudioDisponible(estudio)) return "estudio";
        if (c.daemonLocal) return "alta";
    } else if (c.daemonLocal && (c.memoriaGB ?? 0) >= 8) {
        return "estudio";
    }
    if (c.daemonLocal) return "alta";
    // `navigator.onLine` solo existe en el navegador; el servidor cae a ligera/mínima.
    if (typeof navigator !== "undefined" && navigator.onLine) return "nube";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligera";
    return "minima";
}

/**
 * Elige el nivel más alto que el equipo puede sostener, con el estado de
 * VoiceStudio medido si lo hay:
 *  · VoiceStudio vivo + 8 GB libres (o servido por otra neurona) → estudio
 *  · demonio local + 8 GB de RAM o más (regla histórica sin datos) → estudio
 *  · demonio local                                                → alta
 *  · en línea y sin demonio                                       → nube (Gemini/Pollinations)
 *  · escritorio con WebGPU o WASM SIMD                            → ligera
 *  · cualquier otro caso                                          → minima
 */
export function nivelPara(c: Capacidades, estudio?: EstadoEstudio): NivelVoz {
    return nivelPorDefecto(c, estudio);
}

/**
 * Niveles que puede ofrecer este equipo, del mejor al peor.
 * Siempre incluye «minima», la red de seguridad que nunca falla.
 */
export function nivelesDisponibles(c: Capacidades, estudio?: EstadoEstudio): NivelVoz[] {
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
