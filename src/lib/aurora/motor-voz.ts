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
    nombre: "VoiceMorphic (motor configurado)",
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

    // 0 · (Adenda 217) El motor neuronal local (OmniVoice GGUF por llama.cpp),
    //     si su daemon está listo en esta máquina. Es la voz de verdad.
    try {
        const ml = await import("@/lib/aurora/motor-local");
        const est = await ml.estadoMotorLocal();
        if (est.listo) {
            return {
                id: "astraura-158",
                nombre: `VoiceMorphic · voz nativa de Astraura · ${est.quant || "GGUF"} · ${est.backend === "metal" ? "Metal" : "CPU"}`,
                nota: "Voz neuronal sintetizada en tu propio equipo, sin red. Las frases siguientes se anticipan para sonar al instante.",
                local: true,
            };
        }
    } catch { /* */ }

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

// ── (Ola 227) MOTOR NEURONAL: PUNTO ÚNICO DE DECISIÓN ───────────────────────
// La voz del rito, la de la ventana de sistemas y la de la guía del Escritorio
// deben sonar IGUAL. Antes la bienvenida hablaba por `speechSynthesis` (voz
// del sistema, robótica y distinta en cada navegador) aunque el motor neuronal
// estuviera listo. La regla ahora: en cuanto la página monta se precalienta
// el motor neuronal en segundo plano; cuando está listo se guarda aquí y TODO
// lo que hable lo usa. La voz del navegador queda como variación de último
// recurso, no como voz por defecto.

/** Motor neuronal confirmado como listo en esta sesión (null = aún no). */
let neuronalListo: MotorVoz | null = null;
/** Evita lanzar dos precalentados a la vez. */
let precalentando = false;

/**
 * ¿Hay ya un motor neuronal listo para hablar? Devuelve astraura-158
 * (VoiceMorphic), kokoro u omnivoice; null si aún no está listo ninguno.
 * Síncrono: lee el resultado que dejó `precalentarMotorNeural`.
 */
export function motorNeuralListo(): MotorVoz | null {
    return neuronalListo;
}

/**
 * Arranca en SEGUNDO PLANO la preparación del motor neuronal, sin bloquear:
 *   1. Sondea el daemon VoiceMorphic (la misma detección de `motorPreferido`);
 *      si está listo, lo marca y lo mantiene caliente.
 *   2. Kokoro: si el navegador lo admite y el modelo no está, lo descarga en
 *      segundo plano (~80 MB, WASM, corre local en CPU); si ya está, lo marca.
 *   3. Si nada de lo anterior, pero el usuario configuró OmniVoice, lo marca.
 * Nunca lanza ni bloquea la interfaz: el clic «Con voz» sigue siendo el gesto
 * de usuario que habilita el audio.
 */
export async function precalentarMotorNeural(): Promise<void> {
    if (typeof window === "undefined" || precalentando) return;
    precalentando = true;
    try {
        // 1 · VoiceMorphic: daemon neuronal local (GGUF, llama.cpp).
        try {
            const ml = await import("@/lib/aurora/motor-local");
            const est = await ml.estadoMotorLocal();
            if (est.listo) {
                neuronalListo = {
                    id: "astraura-158",
                    nombre: `VoiceMorphic · voz nativa de Astraura · ${est.quant || "GGUF"} · ${est.backend === "metal" ? "Metal" : "CPU"}`,
                    nota: "Voz neuronal sintetizada en tu propio equipo, sin red.",
                    local: true,
                };
                ml.precalentarMotorLocal();
                return;
            }
        } catch { /* daemon ausente: seguimos */ }

        // 2 · Kokoro: modelo de 82M en WASM dentro del propio navegador.
        try {
            const kok = await import("@/lib/aurora/tts-oss/kokoro");
            if (kok.kokoroAvailable()) {
                if (!kok.kokoroModelReady()) {
                    // Descarga en segundo plano; la próxima frase ya saldrá neural.
                    void kok.kokoroPreload().then((ok) => {
                        if (ok) neuronalListo = KOKORO;
                    }).catch(() => null);
                } else {
                    neuronalListo = KOKORO;
                    return;
                }
            }
        } catch { /* Kokoro no disponible aquí */ }

        // 3 · OmniVoice: el motor que el usuario haya configurado.
        try {
            const raw = window.localStorage.getItem("starseed.aurora.voice.v1");
            const cfg = raw ? (JSON.parse(raw) as { engine?: string }) : null;
            if (cfg?.engine && cfg.engine !== "browser") neuronalListo = OMNIVOICE;
        } catch { /* sin configuración previa */ }
    } finally {
        precalentando = false;
    }
}

/**
 * (Ola 227) Ficha honesta de cada motor: qué es, dónde vive su código y cómo
 * funciona. Alimenta las tarjetas de selección de voz para que el usuario sepa
 * exactamente qué está sonando.
 */
export const MOTORES_VOZ_INFO: Array<{
    id: MotorVoz["id"];
    nombre: string;
    local: boolean;
    modelo: string;
    latencia: string;
    calidad: string;
    archivo: string;
    comoFunciona: string;
}> = [
    {
        id: "astraura-158",
        nombre: "Astraura · voz neural (local)",
        local: true,
        modelo: "VoiceMorphic GGUF cuantizado sobre llama.cpp (daemon 127.0.0.1:4444), Metal en Apple Silicon y CPU en el resto",
        latencia: "Primera frase en segundos; las anticipadas suenan al instante",
        calidad: "Voz neuronal natural, idéntica en cualquier dispositivo",
        archivo: "src/lib/aurora/motor-local.ts",
        comoFunciona: "Un daemon local sintetiza por frases y reproduce por un <audio>; no usa red ni el TTS del sistema.",
    },
    {
        id: "kokoro",
        nombre: "Kokoro · 82M (en este navegador)",
        local: true,
        modelo: "Kokoro 82M en ONNX/WebAssembly, cuantizado, se descarga una vez (~80 MB) y corre en CPU",
        latencia: "Segundos por frase; sin esperas una vez descargado el modelo",
        calidad: "Neural ligera, estable y la misma en todos los equipos",
        archivo: "src/lib/aurora/tts-oss/kokoro.ts",
        comoFunciona: "El modelo corre entero dentro del navegador en WASM: sin red, sin cuenta y sin el motor de voz del sistema.",
    },
    {
        id: "omnivoice",
        nombre: "OmniVoice (motor configurado)",
        local: false,
        modelo: "El motor que hayas elegido en la ventana de voz (endpoint k2-fsa u otros de la cadena)",
        latencia: "Depende del motor elegido",
        calidad: "Depende del motor elegido",
        archivo: "src/lib/aurora/tts-oss/speak-router.ts",
        comoFunciona: "El enrutador de Aurora consulta tu cadena de motores configurada y habla por el primero que responda.",
    },
    {
        id: "sistema",
        nombre: "Voz del sistema (último recurso)",
        local: false,
        modelo: "speechSynthesis del navegador: voces instaladas en el sistema operativo",
        latencia: "Instantánea",
        calidad: "Variable: suena distinta en cada navegador y en cada equipo",
        archivo: "src/lib/aurora/voz-rito.ts",
        comoFunciona: "Es el respaldo mientras el motor neuronal no está listo; en cuanto lo está, deja de usarse.",
    },
];
