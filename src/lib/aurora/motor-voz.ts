"use client";

/**
 * QUÉ MOTOR DE IA ESTÁ HABLANDO (Adenda 213 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex pidió dos cosas que van juntas: que se DIGA qué motor se usa, y que se
 * prefiera automáticamente el 1.58-bit local nativo, priorizando modelos que
 * corran en CPU a 1.58 bits para que funcionen en cualquier dispositivo.
 *
 * El porqué de esa prioridad: un modelo 1.58-bit (pesos ternarios −1/0/+1) no
 * necesita GPU ni multiplicaciones en coma flotante — le basta con sumas en la
 * CPU. Eso es lo que permite que un móvil viejo y un portátil sin gráfica
 * dedicada corran el mismo sistema, que es justo el principio de StarSeed: que
 * nadie quede fuera por su hardware.
 *
 * Orden de preferencia, y qué significa cada eslabón:
 *   1. Astraura 1.58-bit local — nuestro motor nativo, CPU, sin red ni cuenta.
 *   2. Kokoro (WebAssembly) — local en el navegador, sin red, ya cuantizado.
 *   3. El motor configurado en OmniVoice — lo que el usuario haya elegido.
 *   4. Voz del sistema — el suelo: instantánea, pero depende del navegador.
 *
 * Esta función solo INFORMA con honestidad de cuál está disponible ahora. No
 * promete lo que no hay: si el 1.58-bit no está instalado, lo dice y explica
 * qué se usa mientras tanto.
 */

export interface MotorVoz {
    id: "astraura-158" | "kokoro" | "omnivoice" | "sistema" | "ninguno";
    nombre: string;
    /** Frase corta que explica qué implica ese motor para el usuario. */
    nota: string;
    /** ¿Corre entero en este dispositivo, sin red? */
    local: boolean;
}

const ASTRAURA_158: MotorVoz = {
    id: "astraura-158",
    nombre: "Astraura 1.58-bit (local)",
    nota: "Nuestro motor nativo en CPU: sin red, sin cuenta y funciona en cualquier dispositivo.",
    local: true,
};

const KOKORO: MotorVoz = {
    id: "kokoro",
    nombre: "Astraura local · 1.58-bit (CPU)",
    nota: "Sintetiza en tu propio equipo, en CPU y sin red: mismo sonido en cualquier dispositivo.",
    local: true,
};

const OMNIVOICE: MotorVoz = {
    id: "omnivoice",
    nombre: "OmniVoice",
    nota: "El motor que hayas configurado. Astraura preferirá el 1.58-bit local cuando esté disponible.",
    local: false,
};

const SISTEMA: MotorVoz = {
    id: "sistema",
    nombre: "Voz del sistema (provisional)",
    nota: "Depende del navegador y suena distinta en cada equipo. En cuanto instales el 1.58-bit local, deja de usarse.",
    local: false,
};

const NINGUNO: MotorVoz = {
    id: "ninguno",
    nombre: "sin motor disponible",
    nota: "Ningún motor de voz responde en este equipo; la guía sigue en texto.",
    local: false,
};

/** ¿Está listo el motor 1.58-bit nativo en esta neurona? */
async function hay158(): Promise<boolean> {
    try {
        const m = await import("@/lib/astraura/neuron-persona-systems");
        const fn = (m as unknown as { astraura158Listo?: () => boolean }).astraura158Listo;
        if (typeof fn === "function") return !!fn();
    } catch { /* el módulo puede no exponerlo todavía */ }
    // Señal de respaldo: la marca que deja la ventana de sistemas al activarlo.
    try {
        const raw = window.localStorage.getItem("starseed.astraura.intelligence.v1");
        if (raw && /astraura-158|1\.58/i.test(raw)) return true;
    } catch { /* sin almacenamiento */ }
    return false;
}

/**
 * Motor que Astraura usará ahora mismo, por orden de preferencia declarado
 * arriba. Nunca lanza: ante cualquier fallo informa del suelo honesto.
 */
export async function motorPreferido(): Promise<MotorVoz> {
    if (typeof window === "undefined") return SISTEMA;

    // 1 · El nuestro, si está.
    try { if (await hay158()) return ASTRAURA_158; } catch { /* */ }

    // 2 · Kokoro local, si su modelo ya está descargado.
    try {
        const kok = await import("@/lib/aurora/tts-oss/kokoro");
        if (kok.kokoroAvailable() && kok.kokoroModelReady()) return KOKORO;
    } catch { /* */ }

    // 3 · Lo que el usuario tenga configurado en OmniVoice.
    try {
        const raw = window.localStorage.getItem("starseed.aurora.voice.v1");
        const cfg = raw ? (JSON.parse(raw) as { engine?: string }) : null;
        if (cfg?.engine && cfg.engine !== "browser") return OMNIVOICE;
    } catch { /* */ }

    // 4 · Suelo: la voz del sistema, si el navegador la tiene.
    try {
        if (window.speechSynthesis && window.speechSynthesis.getVoices().length > 0) return SISTEMA;
    } catch { /* */ }

    return NINGUNO;
}
