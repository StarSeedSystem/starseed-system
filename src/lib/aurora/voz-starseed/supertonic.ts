/**
 * NIVEL SUPTÓNICO (Supertonic ONNX TTS) — MOTOR ÚNICO «VOZ STARSEED»
 * ─────────────────────────────────────────────────────────────────────────────
 * Síntesis de voz de borde (edge TTS) en ONNX / WebAssembly SIMD.
 * Funciona sin GPU y sin requerir demonio local, cubriendo 31 idiomas.
 */

import type { Capacidades } from "./capacidades";

export interface NivelSuptonico {
    vivo: boolean;
    runtime: "onnx-cpu" | "wasm" | "nativo";
    modelosCargados: string[];
    idiomas: string[];
    latenciaMs?: number;
}

export interface SoporteSupertonic {
    disponible: boolean;
    motivo?: string;
}

export type NivelVozSuptonica = "suptonica" | "158-local" | "nube" | "tronal";

export interface OpcionesNivelVoz {
    supertonic?: boolean;
    mobile?: boolean;
    plataforma?: "web" | "escritorio" | "movil" | "tronal" | string;
    daemonLocal?: boolean;
}

export const IDIOMAS_SUPERTONIC: string[] = [
    "es", "en", "fr", "de", "it", "pt", "ja", "zh", "ko", "ru",
    "ar", "hi", "nl", "pl", "tr", "sv", "da", "fi", "no", "cs",
    "el", "hu", "ro", "uk", "vi", "th", "id", "ms", "he", "fa", "bg",
];

export function soporteSupertonic(
    c?: Partial<Capacidades> & { runtimeNativo?: boolean; wasmSimd?: boolean }
): SoporteSupertonic {
    const hayWasmSimd = c?.wasmSimd ?? false;
    const hayNativo = c?.runtimeNativo ?? false;

    if (hayWasmSimd || hayNativo) {
        return { disponible: true };
    }

    return {
        disponible: false,
        motivo: "Requiere WebAssembly SIMD en el navegador o el runtime nativo voz-supertonic en PATH",
    };
}

export function nivelParaVoz(opciones?: OpcionesNivelVoz): NivelVozSuptonica {
    if (!opciones) return "tronal";

    const supertonicActivo = opciones.supertonic ?? false;
    if (supertonicActivo) {
        return "suptonica";
    }

    const esMovil = opciones.mobile ?? opciones.plataforma === "movil";
    if (esMovil) {
        return "nube";
    }

    const esDaemon = opciones.daemonLocal ?? false;
    if (esDaemon) {
        return "158-local";
    }

    if (opciones.plataforma === "tronal") {
        return "tronal";
    }

    return "nube";
}

export function crearNivelSuptonicoDefecto(
    runtime: "onnx-cpu" | "wasm" | "nativo" = "wasm"
): NivelSuptonico {
    return {
        vivo: true,
        runtime,
        modelosCargados: ["supertonic-es-v1"],
        idiomas: IDIOMAS_SUPERTONIC,
        latenciaMs: 45,
    };
}
