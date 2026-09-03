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

// ── (Ola 228) MOTOR ÚNICO «VOZ STARSEED» ────────────────────────────────────
// Puerta de entrada de todo el habla del OS: un solo motor con cuatro niveles
// y LA MISMA identidad de voz (el timbre) en todos ellos. Se reexporta aquí
// para que las ventanas antiguas no cambien sus imports.
export {
    VOZ_STARSEED_ID,
    hablarStarSeed,
    precalentar,
    nivelActual,
    nivelPreferido,
    fijarNivel,
    parametrosPorNivel,
    type ContextoVoz,
    type OpcionesHablar,
    type PreferenciaNivel,
} from "@/lib/aurora/voz-starseed/motor";
import { VOZ_STARSEED_ID, nivelPreferido } from "@/lib/aurora/voz-starseed/motor";
import { nivelPara } from "@/lib/aurora/voz-starseed/niveles";
import type { NivelVoz } from "@/lib/aurora/voz-starseed/niveles";
import type { Capacidades } from "@/lib/aurora/voz-starseed/capacidades";

export interface MotorVoz {
    id: "astraura-158" | "kokoro" | "omnivoice" | "sistema" | "ninguno";
    nombre: string;
    /** Frase corta que explica qué implica ese motor para el usuario. */
    nota: string;
    /** ¿Corre entero en este dispositivo, sin red? */
    local: boolean;
    /** (Ola 228) Nivel del motor único al que corresponde, si aplica. */
    nivel?: NivelVoz;
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
/**
 * (Ola 228) Nivel del motor único que el hardware puede sostener AHORA, según
 * el sondeo de `voz-starseed/capacidades.ts`. Sirve para que el panel diga con
 * honestidad en qué nivel está hablando la voz, no solo qué motor interno.
 */
async function nivelDetectado(): Promise<NivelVoz> {
    try {
        const cap = await import("@/lib/aurora/voz-starseed/capacidades");
        let caps: Capacidades;
        const enCache = cap.capacidadesEnCache();
        if (enCache) caps = enCache;
        else caps = await cap.detectarCapacidades();
        const preferida = nivelPreferido();
        return preferida === "auto" ? nivelPara(caps) : preferida;
    } catch {
        return "minima";
    }
}

export async function motorPreferido(): Promise<MotorVoz> {
    if (typeof window === "undefined") return SISTEMA;

    // (Ola 228) Además de informar del motor interno, informamos del NIVEL del
    // motor único en el que está trabajando: estudio/alta/ligera/minima.
    const nivel = await nivelDetectado();

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
                nivel: nivel === "estudio" || nivel === "alta" ? nivel : "alta",
            };
        }
    } catch { /* */ }

    // 1 · El nuestro, si está.
    try { if (await hay158()) return { ...ASTRAURA_158, nivel }; } catch { /* */ }

    // 2 · Kokoro local, si su modelo ya está descargado.
    try {
        const kok = await import("@/lib/aurora/tts-oss/kokoro");
        if (kok.kokoroAvailable() && kok.kokoroModelReady()) return { ...KOKORO, nivel: "ligera" };
    } catch { /* */ }

    // 3 · Lo que el usuario tenga configurado en OmniVoice.
    try {
        const raw = window.localStorage.getItem("starseed.aurora.voice.v1");
        const cfg = raw ? (JSON.parse(raw) as { engine?: string }) : null;
        if (cfg?.engine && cfg.engine !== "browser") return { ...OMNIVOICE, nivel };
    } catch { /* */ }

    // 4 · Suelo: la voz del sistema, si el navegador la tiene.
    try {
        if (window.speechSynthesis && window.speechSynthesis.getVoices().length > 0) return { ...SISTEMA, nivel: "minima" };
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
 * (Ola 228) Ficha honesta de cada NIVEL del motor único «Voz StarSeed»: qué es,
 * dónde vive su código y qué hardware necesita. Los cuatro niveles comparten la
 * MISMA identidad de voz (el timbre); solo cambia la fábrica que lo sintetiza.
 * Alimenta las tarjetas de selección de voz para que el usuario sepa con
 * exactitude qué está sonando.
 */
export const MOTORES_VOZ_INFO: Array<{
    id: NivelVoz;
    nombre: string;
    local: boolean;
    modelo: string;
    latencia: string;
    calidad: string;
    archivo: string;
    comoFunciona: string;
}> = [
    {
        id: "estudio",
        nombre: "Estudio · Astraura local",
        local: true,
        modelo: "OmniVoice GGUF Q8_0 sobre llama.cpp en el demonio local (~1000 MB); Metal en Apple Silicon y CPU en el resto",
        latencia: "Baja (local); las frases anticipadas suenan al instante",
        calidad: "Máxima, grado de estudio; la misma en cualquier dispositivo",
        archivo: "src/lib/aurora/motor-local.ts",
        comoFunciona: `El motor único (${VOZ_STARSEED_ID}) delega en el demonio local, que sintetiza por frases y reproduce por un <audio>; no usa red ni el TTS del sistema.`,
    },
    {
        id: "alta",
        nombre: "Alta · Astraura local",
        local: true,
        modelo: "OmniVoice GGUF Q4_K_M sobre llama.cpp en el demonio local (~600 MB)",
        latencia: "Baja (local)",
        calidad: "Alta, casi estudio; idéntica identidad de voz",
        archivo: "src/lib/aurora/motor-local.ts",
        comoFunciona: "La misma vía que el nivel Estudio con un modelo más ligero: el timbre no cambia, solo el tamaño del modelo que lo expresa.",
    },
    {
        id: "ligera",
        nombre: "Ligera · Kokoro en este navegador",
        local: true,
        modelo: "Kokoro 82M en ONNX/WebAssembly, cuantizado; se descarga una vez (~120 MB) y corre en CPU",
        latencia: "Media (primera descarga del modelo); luego fluida",
        calidad: "Buena y estable; la misma en todos los equipos",
        archivo: "src/lib/aurora/tts-oss/kokoro.ts",
        comoFunciona: "El modelo corre entero dentro del navegador en WASM: sin red, sin cuenta y sin la voz del sistema; el timbre manda igual.",
    },
    {
        id: "minima",
        nombre: "Mínima · voz del sistema",
        local: false,
        modelo: "speechSynthesis del navegador: voces instaladas en el sistema operativo",
        latencia: "Inmediata",
        calidad: "Variable: suena distinta en cada navegador y en cada equipo",
        archivo: "src/lib/aurora/voz-rito.ts",
        comoFunciona: "La red de seguridad que nunca deja la interfaz muda: en cuanto un nivel superior está listo, deja de usarse (mismo timbre).",
    },
];
