/**
 * DEMONIO LOCAL DE VOZ (Ola 228) — cliente al tts-server de OmniVoice.
 * ─────────────────────────────────────────────────────────────────────────────
 * El motor de máxima calidad (niveles «Estudio» y «Alta») es un proceso LOCAL
 * gestionado por el usuario en esta neurona:
 *
 *   ~/.starseed/astraura-voice/omnivoice.cpp/build/tts-server \
 *     --model omnivoice-base-Q8_0.gguf \
 *     --codec omnivoice-tokenizer-Q8_0.gguf \
 *     --host 127.0.0.1 --port 4500 --lang Spanish
 *
 * Responde `GET /health` (200 cuando está listo; 24 kHz; clonación de voz) y
 * `POST /tts` (cuerpo JSON con texto/voz/velocidad → audio). Existe también la
 * variante Q4_K_M, más ligera, para el nivel «Alta».
 *
 * Este módulo NUNCA acepta una URL del exterior: solo habla con
 * `127.0.0.1:4500`. Lo usan las rutas `/api/voz/salud` y `/api/voz/hablar`
 * del servidor del OS; nada de aquí expone rutas absolutas del disco.
 *
 * (2026-09-04) SEGUNDA PUERTA: si en 4500 no hay tts-server, se habla con el demonio
 * Astraura de voz (`native/astraura-voice/daemon.mjs`, `127.0.0.1:4444`, `GET /status`
 * y `POST /tts`), que mantiene su propio tts-server residente en 4501+. Antes había que
 * lanzar DOS copias del mismo modelo (≈900 MB cada una) en una Mac de 8 GB para que la
 * bienvenida hablara; ahora basta con el demonio, que además duerme solo a los 10 min.
 */

/** Puerto fijo del demonio de voz en esta neurona. */
export const PUERTO_VOZ = 4500;

/** Puerto del demonio Astraura de voz (pool de tts-server residentes). */
export const PUERTO_DEMONIO_ASTRAURA = 4444;

/** Origen interno del demonio (solo bucle local, jamás configurable). */
const ORIGEN = `http://127.0.0.1:${PUERTO_VOZ}`;
const ORIGEN_ASTRAURA = `http://127.0.0.1:${PUERTO_DEMONIO_ASTRAURA}`;

/** Estado de salud del demonio, medido en una llamada. */
export interface SaludDaemon {
    /** El demonio respondió 200 al sondeo. */
    vivo: boolean;
    /** Milisegundos que tardó `/health` en responder; `null` si no respondió. */
    latenciaMs: number | null;
    /** Modelo declarado por el demonio, si lo informa; `null` si no consta. */
    modelo: string | null;
}

/** Opciones de síntesis hacia el demonio. */
export interface OpcionesSintesis {
    /** Voz neuronal del modelo (identidad; la fija el timbre StarSeed). */
    voz: string;
    /** Velocidad de habla (1 = natural). */
    speed: number;
    /** Instrucción de estilo para el motor neuronal (carácter, en palabras). */
    instruct?: string;
}

/** Resultado de una síntesis en el demonio. */
export interface SintesisDaemon {
    /** Bytes de audio (WAV, 24 kHz). */
    audio: ArrayBuffer;
    /** Tipo MIME declarado por el demonio. */
    tipo: string;
}

/**
 * Sondea `GET /health` del demonio y mide su latencia.
 * `timeoutMs` (800 ms por defecto) es el límite de espera. Nunca lanza: si el
 * demonio está apagado devuelve `{ vivo: false, ... }`.
 */
export async function saludDaemon(timeoutMs = 800): Promise<SaludDaemon> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);
    const inicio = Date.now();
    try {
        const resp = await fetch(`${ORIGEN}/health`, {
            signal: control.signal,
            cache: "no-store",
        });
        const latenciaMs = Date.now() - inicio;
        if (!resp.ok) return { vivo: false, latenciaMs: null, modelo: null };
        // El demonio PUEDE devolver un JSON con datos (p. ej. el modelo cargado).
        let modelo: string | null = null;
        try {
            const cuerpo = (await resp.json()) as { model?: unknown; modelo?: unknown };
            const m = cuerpo.model ?? cuerpo.modelo;
            if (typeof m === "string" && m.trim()) modelo = m.trim();
        } catch {
            // Sin cuerpo JSON: el 200 ya basta para saber que está vivo.
        }
        return { vivo: true, latenciaMs, modelo };
    } catch {
        return saludDemonioAstraura(timeoutMs);
    } finally {
        clearTimeout(temporizador);
    }
}

/**
 * Segunda puerta: `GET /status` del demonio Astraura (4444). Cuenta como vivo si el
 * demonio responde `ok` y está `ready` (tiene motor); el pool se lanza solo al hablar.
 */
async function saludDemonioAstraura(timeoutMs: number): Promise<SaludDaemon> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), Math.max(timeoutMs, 1500));
    const inicio = Date.now();
    try {
        const resp = await fetch(`${ORIGEN_ASTRAURA}/status`, { signal: control.signal, cache: "no-store" });
        const latenciaMs = Date.now() - inicio;
        if (!resp.ok) return { vivo: false, latenciaMs: null, modelo: null };
        const cuerpo = (await resp.json()) as { ok?: unknown; ready?: unknown; model?: unknown };
        if (cuerpo.ok !== true || cuerpo.ready !== true) return { vivo: false, latenciaMs: null, modelo: null };
        const modelo = typeof cuerpo.model === "string" && cuerpo.model.trim() ? `${cuerpo.model.trim()} · demonio 4444` : "demonio 4444";
        return { vivo: true, latenciaMs, modelo };
    } catch {
        return { vivo: false, latenciaMs: null, modelo: null };
    } finally {
        clearTimeout(temporizador);
    }
}

/**
 * Sintetiza `texto` en el demonio local (`POST /tts`) y devuelve el audio, o
 * `null` si el demonio no respondió, falló o tardó demasiado. NUNCA lanza:
 * quien llama (la ruta `/api/voz/hablar`) decide cómo responder al cliente.
 */
export async function sintetizarEnDaemon(
    texto: string,
    opciones: OpcionesSintesis,
): Promise<SintesisDaemon | null> {
    const limpio = (texto || "").trim();
    if (!limpio) return null;
    // Primera puerta: tts-server crudo en 4500 (si alguien lo lanzó a mano).
    const directo = await pedirAudio(`${ORIGEN}/tts`, {
        text: limpio,
        voice: opciones.voz,
        speed: opciones.speed,
        ...(opciones.instruct ? { instruct: opciones.instruct } : {}),
    });
    if (directo) return directo;
    // Segunda puerta: el demonio Astraura (4444). No conoce `voice`: la identidad va como
    // `personality` (aurora, hermione…) y el carácter como `instruct`; idioma primario Spanish.
    const personalidad = opciones.voz.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
    return pedirAudio(`${ORIGEN_ASTRAURA}/tts`, {
        text: limpio,
        lang: "Spanish",
        speed: opciones.speed,
        ...(personalidad && personalidad !== "default" ? { personality: personalidad } : {}),
        ...(opciones.instruct ? { instruct: opciones.instruct } : {}),
    });
}

/** POST JSON → audio; `null` si no respondió, falló o vino vacío. Nunca lanza. */
async function pedirAudio(url: string, cuerpo: Record<string, unknown>): Promise<SintesisDaemon | null> {
    const control = new AbortController();
    // La síntesis puede tardar en la primera llamada (modelo frío): 120 s.
    const temporizador = setTimeout(() => control.abort(), 120_000);
    try {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
            signal: control.signal,
        });
        if (!resp.ok) return null;
        const audio = await resp.arrayBuffer();
        if (!audio.byteLength) return null;
        return {
            audio,
            tipo: resp.headers.get("content-type") || "audio/wav",
        };
    } catch {
        return null;
    } finally {
        clearTimeout(temporizador);
    }
}
