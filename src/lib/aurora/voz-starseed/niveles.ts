/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de voz con cuatro niveles que se adaptan al hardware SIN
 * cambiar la identidad de la voz: el timbre es el mismo, lo que varía es la
 * precisión del motor que lo sintetiza.
 *
 *  · estudio — VoiceStudio (127.0.0.1:3900) u OmniVoice GGUF Q8_0 por el
 *              demonio local (~1000 MB)
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

/**
 * (VST1018F) Disponibilidad del nivel «estudio», medida EN VIVO: la dice el
 * descubrimiento de VoiceStudio (`descubrir()` de `voicestudio.ts`, con su
 * timeout corto) y la malla de neuronas (el relé `capacidad.*` marca si otra
 * neurona sirve «estudio» a esta). Todo opcional: lo que no se midió, no veto.
 */
export interface DisponibilidadEstudio {
    /** `descubrir()` de `voicestudio.ts` dijo vivo en esta neurona. */
    voicestudioVivo: boolean;
    /** Otra neurona de la malla sirve «estudio» a esta (relé `capacidad.*`). */
    servidaPorOtraNeurona: boolean;
}

/**
 * (VST1018F) ¿Hay nivel «estudio» disponible en esta neurona? Pura.
 *
 * Regla del contrato `architecture/voz-voicestudio.md` §3-§4: solo si
 * VoiceStudio dijo vivo y la neurona tiene 8 GB de RAM o más — o si otra
 * neurona lo sirve (entonces el hardware local no se exige). Si nunca se
 * consultó a VoiceStudio (llamadas antiguas de un solo argumento) mantiene la
 * regla de la Ola 228, para que nadie pierda «estudio» por no haber medido.
 */
export function estudioDisponible(
    c: Capacidades,
    d?: Partial<DisponibilidadEstudio>,
): boolean {
    if (d?.servidaPorOtraNeurona === true) return true;
    const ramSuficiente = (c.memoriaGB ?? 0) >= 8;
    if (typeof d?.voicestudioVivo === "boolean") {
        return d.voicestudioVivo === true && ramSuficiente;
    }
    return c.daemonLocal && ramSuficiente;
}

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
        motorInterno: "VoiceStudio (3900) u OmniVoice GGUF Q8_0 (demonio local)",
        requisitos: "VoiceStudio vivo en esta neurona u otra de la malla, y 8 GB de RAM o más",
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
 * Nivel por defecto (decisión automática). A los niveles por hardware se une
 * el «nube» (2026-09-07, Ola 279 · V6): si no hay demonio local PERO hay
 * conexión, la síntesis por el servidor del OS suena bien sin descargar nada,
 * y queda ANTES que «ligera»/«mínima». Es el nivel que Alex pidió para que la
 * voz «funcione y suene bien» aunque el demonio esté apagado.
 *
 * (VST1018F) El nivel «estudio» solo entra con la disponibilidad medida de
 * VoiceStudio/malla (`estudioDisponible`); sin ese dato, el demonio local con
 * 8 GB de RAM lo sostiene como siempre.
 */
export function nivelPorDefecto(c: Capacidades, estudio?: Partial<DisponibilidadEstudio>): NivelVoz {
    if (estudioDisponible(c, estudio)) return "estudio";
    if (c.daemonLocal) return "alta";
    // `navigator.onLine` solo existe en el navegador; el servidor cae a ligera/mínima.
    if (typeof navigator !== "undefined" && navigator.onLine) return "nube";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligera";
    return "minima";
}

/**
 * Elige el nivel más alto que el equipo puede sostener:
 *  · VoiceStudio vivo (u otra neurona que lo sirva) y 8 GB de RAM o más → estudio
 *  · demonio local                             → alta
 *  · en línea y sin demonio                    → nube (Gemini/Pollinations)
 *  · escritorio con WebGPU o WASM SIMD         → ligera
 *  · cualquier otro caso                       → minima
 *
 * El parámetro opcional `estudio` es la disponibilidad medida (VST1018F).
 */
export function nivelPara(c: Capacidades, estudio?: Partial<DisponibilidadEstudio>): NivelVoz {
    return nivelPorDefecto(c, estudio);
}

/**
 * Niveles que puede ofrecer este equipo, del mejor al peor.
 * Siempre incluye «minima», la red de seguridad que nunca falla.
 * (VST1018F) Acepta la disponibilidad medida de «estudio» igual que `nivelPara`.
 */
export function nivelesDisponibles(c: Capacidades, estudio?: Partial<DisponibilidadEstudio>): NivelVoz[] {
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
