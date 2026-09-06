/**
 * OÍDO 1.58 — Cliente del reconocimiento de voz TERNARIO local (VibeASR.cpp).
 * ─────────────────────────────────────────────────────────────────────────────
 * Ola 249 (2026-09-06) · motor de voces v2. VibeVoice-ASR-BitNet es un ASR
 * cuantizado a 1,58 bits que corre en CPU en tiempo real (RTF ~0,52 en un M4
 * con 3 hilos) — ideal para la Mac de 8 GB de Alex: pesa ~1,6 GB de modelos
 * GGUF y solo se carga bajo demanda, nunca en paralelo al tts-server.
 *
 * El navegador NO habla con el binario directamente: todo pasa por el proxy
 * del propio OS (`/api/voz-local/*` → daemon 127.0.0.1:4444), que es quien
 * lanza `asr_infer`. Así funciona igual en navegadores embebidos, Tauri y
 * CSP estrictas, y la misma ruta sirve para medir el estado de instalación.
 *
 * Reglas del área que respeta este módulo:
 *   - Gratis y local primero: coste cero, sin nube.
 *   - Cola única en el daemon: si está ocupado se avisa, no se encola a ciegas.
 *   - Errores honestos y en español, pensados para que Alex sepa qué hacer.
 */

/** Estado de instalación y ocupación del oído 1.58 (campo `asr` del status). */
export interface EstadoOido {
    /** El binario `asr_infer` está compilado y presente. */
    instalado: boolean;
    /** Los dos GGUF (VAE + LM) están descargados. */
    modelos: boolean;
    /** El daemon está transcribiendo otra toma ahora mismo. */
    ocupado: boolean;
    /** Peticiones esperando turno en la cola del daemon. */
    cola: number;
    /** El oído residemente (asr_stream_server) vive y está listo (Ola 255). */
    residente?: boolean;
    /** ms desde que empezó a cargar el residente si aún no está listo. */
    cargandoDesdeMs?: number | null;
    /** Presupuesto (ms) del último reconocimiento (proporcional al audio). */
    presupuestoMs?: number;
    /** Veces que el oído cedió la memoria a la voz en esta sesión del daemon. */
    cesiones?: number;
    /** Marca temporal (epoch ms) de la última cesión, o null si no hubo. */
    ultimaCesionMs?: number | null;
}
export interface ResultadoOido {
    texto: string;
    /** Segundos que tardó el motor en transcribir. */
    segundos: number;
    /** Motor que transcribió (p. ej. «vibeasr-1.58»). */
    motor: string;
    /** Modelo usado (ruta o nombre del GGUF del LM). */
    modelo: string;
    /** Duración real del audio reconocido en segundos (null si no se leyó). */
    segundosAudio?: number | null;
    /** Presupuesto (ms) que el daemon dio a este reconocimiento. */
    presupuestoMs?: number;
}

/** Comando de instalación que se muestra al usuario (script del propio repo). */
export const COMANDO_INSTALAR_OIDO = "bash native/astraura-voice/install-vibeasr.sh";

/** Timeout del lado cliente: el proxy da 370 s al daemon; damos margen propio. */
const TIMEOUT_OIDO_MS = 380_000;

/**
 * Presupuesto de reconocimiento proporcional a la duración del audio, con la
 * MISMA fórmula que usa el demonio (`asrTimeoutMs`, Ola 255): 60 s de base más
 * 20 s por segundo de audio, acotado a [120 s, 360 s]. NaN o negativo → 180 s.
 */
export function presupuestoOidoMs(segundosAudio: number): number {
    if (!Number.isFinite(segundosAudio) || segundosAudio < 0) return 180_000;
    const ms = 60_000 + 20_000 * segundosAudio;
    return Math.min(360_000, Math.max(120_000, ms));
}

/**
 * Lee el estado de instalación del oído desde `/api/voz-local/status`.
 * Devuelve `null` si el daemon/proxy no responde (daemon apagado o el servidor
 * corre en la nube y no ve el 127.0.0.1 del usuario). Nunca lanza.
 */
export async function estadoOido(): Promise<EstadoOido | null> {
    try {
        const resp = await fetch("/api/voz-local/status", { cache: "no-store" });
        if (!resp.ok) return null;
        const datos = (await resp.json()) as { asr?: unknown };
        const asr = datos.asr;
        if (!asr || typeof asr !== "object") return null;
        const a = asr as Record<string, unknown>;
        return {
            instalado: a.instalado === true,
            modelos: a.modelos === true,
            ocupado: a.ocupado === true,
            cola: typeof a.cola === "number" ? a.cola : 0,
            residente: a.residente === true,
            cargandoDesdeMs: typeof a.cargandoDesdeMs === "number" ? a.cargandoDesdeMs : null,
            presupuestoMs: typeof a.presupuestoMs === "number" ? a.presupuestoMs : undefined,
            cesiones: typeof a.cesiones === "number" ? a.cesiones : undefined,
            ultimaCesionMs: typeof a.ultimaCesionMs === "number" ? a.ultimaCesionMs : null,
        };
    } catch {
        return null;
    }
}

/**
 * Transcribe un Blob de audio con VibeASR.cpp por el proxy del OS.
 * Envía `multipart/form-data` (campo `audio`) a `/api/voz-local/asr`.
 *
 * Errores con mensaje claro (se lanzan como Error; la UI los muestra):
 *   - 503 (no instalado)   → comando de instalación.
 *   - 409 / «cola llena»   → «el oído está ocupado, prueba en unos segundos».
 *   - AbortError / timeout → «la transcripción tardó demasiado».
 */
export async function transcribirLocal(
    blob: Blob,
    opts?: { signal?: AbortSignal },
): Promise<ResultadoOido> {
    const form = new FormData();
    form.append("audio", blob, "toma.webm");

    // Timeout propio de 380 s combinado con la señal del llamante (si la hay).
    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(new Error("timeout")), TIMEOUT_OIDO_MS);
    const alAbortarExterno = () => ctrl.abort(opts?.signal?.reason);
    if (opts?.signal) {
        if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
        else opts.signal.addEventListener("abort", alAbortarExterno, { once: true });
    }

    try {
        const resp = await fetch("/api/voz-local/asr", {
            method: "POST",
            body: form,
            signal: ctrl.signal,
        });

        if (!resp.ok) {
            const datos = (await resp.json().catch(() => ({}))) as { error?: unknown };
            const detalle = typeof datos.error === "string" ? datos.error : "";
            if (resp.status === 503) {
                throw new Error(
                    `El oído 1.58 no está instalado en esta neurona. Instálalo con: ${COMANDO_INSTALAR_OIDO}`,
                );
            }
            if (resp.status === 409 || /cola/i.test(detalle)) {
                throw new Error("El oído está ocupado, prueba en unos segundos.");
            }
            if (resp.status === 502) {
                throw new Error(
                    "El daemon de voz local no responde desde el servidor del OS (¿está apagado o el OS corre en la nube?).",
                );
            }
            throw new Error(detalle || `El oído respondió con error ${resp.status}.`);
        }

        const datos = (await resp.json()) as {
            texto?: unknown;
            segundos?: unknown;
            motor?: unknown;
            modelo?: unknown;
            segundosAudio?: unknown;
            presupuestoMs?: unknown;
        };
        return {
            texto: typeof datos.texto === "string" ? datos.texto : "",
            segundos: typeof datos.segundos === "number" ? datos.segundos : 0,
            motor: typeof datos.motor === "string" ? datos.motor : "vibeasr-1.58",
            modelo: typeof datos.modelo === "string" ? datos.modelo : "",
            segundosAudio: typeof datos.segundosAudio === "number" ? datos.segundosAudio : null,
            presupuestoMs: typeof datos.presupuestoMs === "number" ? datos.presupuestoMs : undefined,
        };
    } catch (e) {
        // Traduce el abort por timeout a un mensaje humano; el resto ya lo es.
        if (ctrl.signal.aborted) {
            const razon = ctrl.signal.reason;
            if (razon instanceof Error && razon.message === "timeout") {
                throw new Error("La transcripción tardó demasiado (más de 380 s).");
            }
            throw new Error("Transcripción cancelada.");
        }
        throw e instanceof Error ? e : new Error("No se pudo transcribir el audio.");
    } finally {
        clearTimeout(temporizador);
        if (opts?.signal) opts.signal.removeEventListener("abort", alAbortarExterno);
    }
}
