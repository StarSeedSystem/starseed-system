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
 *
 * (2026-09-06, Ola 251) TERCER ESTADO «despertando»: con la Mac al límite de memoria el
 * modelo de 900 MB tarda más de 30 s en cargar y el demonio responde `ok/ready` con
 * `warm:false` y el pool `launching` lleno mientras tanto. Antes el OS lo pintaba como
 * «apagado», cuando en realidad estaba DESPERTANDO; ahora `interpretarStatus` distingue
 * los tres estados y la interfaz puede esperar en vez de rendirse.
 */

/** Puerto fijo del demonio de voz en esta neurona. */
export const PUERTO_VOZ = 4500;

/** Puerto del demonio Astraura de voz (pool de tts-server residentes). */
export const PUERTO_DEMONIO_ASTRAURA = 4444;

/** Origen interno del demonio (solo bucle local, jamás configurable). */
const ORIGEN = `http://127.0.0.1:${PUERTO_VOZ}`;
const ORIGEN_ASTRAURA = `http://127.0.0.1:${PUERTO_DEMONIO_ASTRAURA}`;

/** Estado de ánimo del demonio: vivo (sintetiza ya), despertando (cargando el modelo) o apagado. */
export type EstadoDaemon = "vivo" | "despertando" | "apagado";

/** Estado de salud del demonio, medido en una llamada. */
export interface SaludDaemon {
    /** El demonio respondió y puede atender (vivo o despertando). */
    vivo: boolean;
    /** Milisegundos que tardó el sondeo en responder; `null` si no respondió. */
    latenciaMs: number | null;
    /** Modelo declarado por el demonio, si lo informa; `null` si no consta. */
    modelo: string | null;
    /** Estado fino del demonio (activo, cargando el modelo o sin respuesta). */
    estado: EstadoDaemon;
    /** Marca de tiempo (ms) desde la que el demonio lleva despertando, si la informa. */
    despertandoDesdeMs: number | null;
    /** Memoria libre del equipo en MB, si el demonio la informa; `null` si no consta. */
    memoriaLibreMb: number | null;
}

/** Opciones de síntesis hacia el demonio. */
export interface OpcionesSintesis {
    /** Voz neuronal del modelo (identidad; la fija el timbre StarSeed). */
    voz: string;
    /** Velocidad de habla (1 = natural). */
    speed: number;
    /** Instrucción de estilo para el motor neuronal (carácter, en palabras). */
    instruct?: string;
    /** (Ola 263) Semilla del muestreo neuronal: fija el timbre resultante; si falta, el demonio deriva una determinista. */
    seed?: number;
    /** (Ola 263) Desplazamiento de tono del post-proceso local (1 = natural; el demonio lo acota a [0.7, 1.4]). */
    pitch?: number;
}

/** Resultado de una síntesis en el demonio. */
export interface SintesisDaemon {
    /** Bytes de audio (WAV, 24 kHz). */
    audio: ArrayBuffer;
    /** Tipo MIME declarado por el demonio. */
    tipo: string;
}

/** Salida pura de interpretar el cuerpo de `GET /status` del demonio Astraura. */
export interface LecturaStatus {
    vivo: boolean;
    estado: EstadoDaemon;
    despertandoDesdeMs: number | null;
    memoriaLibreMb: number | null;
    /** (Ola 263) Si el demonio puede aplicar tono post-proceso (tiene ffmpeg); `null` si no lo declara. */
    pitchDisponible: boolean | null;
}

/**
 * Interpreta (función pura, sin red) el cuerpo JSON de `GET /status` del demonio
 * Astraura (4444) y decide el estado:
 *   - `ok !== true` → apagado.
 *   - `despertando === true`, o `ready && !warm && launching lleno && active vacío`
 *     → despertando (el modelo de ~900 MB aún está cargando; ver cabecera 2026-09-06).
 *   - `ok && ready` con servidor activo → vivo.
 */
export function interpretarStatus(cuerpo: unknown): LecturaStatus {
    const apagado: LecturaStatus = {
        vivo: false,
        estado: "apagado",
        despertandoDesdeMs: null,
        memoriaLibreMb: null,
        pitchDisponible: null,
    };
    if (typeof cuerpo !== "object" || cuerpo === null) return apagado;
    const c = cuerpo as Record<string, unknown>;
    if (c.ok !== true) return apagado;

    const despertandoDesdeMs =
        typeof c.despertandoDesdeMs === "number" && Number.isFinite(c.despertandoDesdeMs)
            ? c.despertandoDesdeMs
            : null;
    const memoriaLibreMb =
        typeof c.memoriaLibreMb === "number" && Number.isFinite(c.memoriaLibreMb)
            ? c.memoriaLibreMb
            : null;
    // (Ola 263) Tono post-proceso disponible solo si el demonio lo declara y hay ffmpeg.
    const pitchDisponible =
        typeof c.pitchDisponible === "boolean" ? c.pitchDisponible : null;

    const pool =
        typeof c.serverPool === "object" && c.serverPool !== null
            ? (c.serverPool as Record<string, unknown>)
            : null;
    const launching = Array.isArray(pool?.launching) ? pool.launching.length : 0;
    const active = Array.isArray(pool?.active) ? pool.active.length : 0;

    // Despertando: lo declara el demonio, o se deduce de «listo pero sin nadie activo aún».
    const despertando =
        c.despertando === true ||
        (c.ready === true && c.warm === false && launching > 0 && active === 0);
    if (despertando) {
        return { vivo: true, estado: "despertando", despertandoDesdeMs, memoriaLibreMb, pitchDisponible };
    }
    if (c.ready === true) {
        return { vivo: true, estado: "vivo", despertandoDesdeMs, memoriaLibreMb, pitchDisponible };
    }
    return apagado;
}

/** Salud apagada de factoría, para no repetir el literal cinco veces. */
function saludApagada(): SaludDaemon {
    return {
        vivo: false,
        latenciaMs: null,
        modelo: null,
        estado: "apagado",
        despertandoDesdeMs: null,
        memoriaLibreMb: null,
    };
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
        if (!resp.ok) return saludApagada();
        // El demonio PUEDE devolver un JSON con datos (p. ej. el modelo cargado).
        let modelo: string | null = null;
        try {
            const cuerpo = (await resp.json()) as { model?: unknown; modelo?: unknown };
            const m = cuerpo.model ?? cuerpo.modelo;
            if (typeof m === "string" && m.trim()) modelo = m.trim();
        } catch {
            // Sin cuerpo JSON: el 200 ya basta para saber que está vivo.
        }
        return {
            vivo: true,
            latenciaMs,
            modelo,
            estado: "vivo",
            despertandoDesdeMs: null,
            memoriaLibreMb: null,
        };
    } catch {
        return saludDemonioAstraura(timeoutMs);
    } finally {
        clearTimeout(temporizador);
    }
}

/**
 * Segunda puerta: `GET /status` del demonio Astraura (4444). Cuenta como vivo si el
 * demonio responde `ok` y está `ready` (tiene motor); el pool se lanza solo al hablar.
 * Desde la Ola 251 distingue «despertando» (modelo cargando) de «apagado».
 */
async function saludDemonioAstraura(timeoutMs: number): Promise<SaludDaemon> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), Math.max(timeoutMs, 1500));
    const inicio = Date.now();
    try {
        const resp = await fetch(`${ORIGEN_ASTRAURA}/status`, { signal: control.signal, cache: "no-store" });
        const latenciaMs = Date.now() - inicio;
        if (!resp.ok) return saludApagada();
        const cuerpo = (await resp.json()) as { model?: unknown } & Record<string, unknown>;
        const lectura = interpretarStatus(cuerpo);
        if (!lectura.vivo) return saludApagada();
        const modelo = typeof cuerpo.model === "string" && cuerpo.model.trim() ? `${cuerpo.model.trim()} · demonio 4444` : "demonio 4444";
        return {
            vivo: true,
            latenciaMs,
            modelo,
            estado: lectura.estado,
            despertandoDesdeMs: lectura.despertandoDesdeMs,
            memoriaLibreMb: lectura.memoriaLibreMb,
        };
    } catch {
        return saludApagada();
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
    // (Ola 263) seed y pitch viajan al cuerpo del POST si vienen informados; el
    // demonio los aplica (el tono es post-proceso local) y no se mandan cuando
    // ausentes para no fijar valores que el llamador no pidió.
    const perfil = {
        ...(opciones.seed !== undefined ? { seed: opciones.seed } : {}),
        ...(opciones.pitch !== undefined ? { pitch: opciones.pitch } : {}),
    };
    // Primera puerta: tts-server crudo en 4500 (si alguien lo lanzó a mano).
    const directo = await pedirAudio(`${ORIGEN}/tts`, {
        text: limpio,
        voice: opciones.voz,
        speed: opciones.speed,
        ...(opciones.instruct ? { instruct: opciones.instruct } : {}),
        ...perfil,
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
        ...perfil,
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
