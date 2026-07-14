/**
 * Audiomorphic — MICRÓFONO (motor de audio compartido)
 * ============================================================================
 * Port de `hooks/useAudioAnalyzer.ts` (StarSeedSystem/Audiomorphic-AR-app) con
 * DOS cambios que exige el OS:
 *
 *  1. **SINGLETON.** En la app original solo había una instancia. En el OS puede
 *     haber a la vez la CAPA DE FONDO y la APP (y hasta un widget). Si cada una
 *     llamara a `getUserMedia`, competirían por el micrófono (el mismo fallo que
 *     ya se pagó con Aurora en Android: dos capturas peleando). Aquí hay **un
 *     solo AudioContext, un solo stream y un solo AnalyserNode**, con conteo de
 *     referencias: el stream se suelta de verdad cuando el último consumidor se
 *     va.
 *
 *  2. **NUNCA SE PIDE EL PERMISO SOLO.** `start()` debe llamarse SIEMPRE desde
 *     un gesto del usuario (un clic). No hay ningún camino que lo dispare al
 *     cargar. Es la regla de la Tríada (Ciberdelia: la tecnología jamás se usa
 *     para vigilar) y además es lo que exigen los navegadores.
 *
 * Sin micrófono el visualizador NO se rompe: `getMetrics()` devuelve silencio
 * y el piloto automático sigue animando la espiral (deriva). El audio solo
 * añade reactividad.
 */

import type { AudioMetrics } from "./types";
import { SILENT_METRICS } from "./types";

export type MicState = "idle" | "requesting" | "live" | "denied" | "error";

export const AUDIOMORPHIC_MIC_EVENT = "starseed:audiomorphic-mic";

interface Engine {
    ctx: AudioContext | null;
    analyser: AnalyserNode | null;
    source: MediaStreamAudioSourceNode | null;
    stream: MediaStream | null;
    data: Uint8Array | null;
    state: MicState;
    error?: string;
    refs: number;
}

const engine: Engine = {
    ctx: null,
    analyser: null,
    source: null,
    stream: null,
    data: null,
    state: "idle",
    refs: 0,
};

function emit(): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(
            new CustomEvent(AUDIOMORPHIC_MIC_EVENT, { detail: { state: engine.state, error: engine.error } }),
        );
    } catch {
        /* noop */
    }
}

function setState(state: MicState, error?: string): void {
    engine.state = state;
    engine.error = error;
    emit();
}

export function getMicState(): MicState {
    return engine.state;
}

export function isMicLive(): boolean {
    return engine.state === "live";
}

export function getMicError(): string | undefined {
    return engine.error;
}

/**
 * Enciende el micrófono. **Llamar SOLO desde un gesto del usuario.**
 * Idempotente: si ya está vivo, no vuelve a pedir permiso.
 */
export async function startMic(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (engine.state === "live") return true;
    if (engine.state === "requesting") return false;

    if (!navigator.mediaDevices?.getUserMedia) {
        setState("error", "Este navegador no expone el micrófono (getUserMedia).");
        return false;
    }

    setState("requesting");
    try {
        const AC: typeof AudioContext =
            window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!engine.ctx) engine.ctx = new AC();
        if (engine.ctx.state === "suspended") await engine.ctx.resume();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const analyser = engine.ctx.createAnalyser();
        analyser.fftSize = 2048;                 // resolución estándar (igual que el original)
        analyser.smoothingTimeConstant = 0.85;

        const source = engine.ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        engine.stream = stream;
        engine.analyser = analyser;
        engine.source = source;
        engine.data = new Uint8Array(analyser.frequencyBinCount);

        setState("live");
        return true;
    } catch (err) {
        const e = err as { name?: string; message?: string };
        const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
        setState(denied ? "denied" : "error", e?.message || "No se pudo abrir el micrófono.");
        return false;
    }
}

/** Apaga el micrófono y SUELTA el stream de verdad (se apaga el led del sistema). */
export function stopMic(): void {
    try {
        engine.source?.disconnect();
        engine.stream?.getTracks().forEach((t) => t.stop());
    } catch {
        /* noop */
    }
    engine.source = null;
    engine.analyser = null;
    engine.stream = null;
    engine.data = null;
    setState("idle");
}

/** Reserva el motor (consumidor nuevo). Devuelve la función de liberación. */
export function acquireMic(): () => void {
    engine.refs += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        engine.refs = Math.max(0, engine.refs - 1);
        // Solo se apaga cuando NADIE lo usa. Así el fondo conserva el audio
        // aunque la app se cierre (y al revés).
        if (engine.refs === 0 && engine.state === "live") stopMic();
    };
}

/**
 * Métricas de audio del fotograma. Copia EXACTA del algoritmo original
 * (puerta de ruido 25, media sobre el rango, centroide ponderado).
 * Sin micrófono devuelve silencio: nunca lanza.
 */
export function getMetrics(sensitivity: number, freqRange: number): AudioMetrics {
    const { analyser, data } = engine;
    if (!analyser || !data || engine.state !== "live") return SILENT_METRICS;

    // El tipo de `getByteFrequencyData` varía entre libs de TS (Uint8Array<ArrayBuffer>).
    analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);

    const rangeLimit = Math.floor(data.length * freqRange);
    let totalMagnitude = 0;
    let weightedFrequencySum = 0;

    for (let i = 0; i < rangeLimit; i++) {
        const val = data[i];
        if (val > 25) { // puerta de ruido
            totalMagnitude += val;
            weightedFrequencySum += i * val;
        }
    }

    const average = rangeLimit > 0 ? totalMagnitude / rangeLimit : 0;
    const volume = Math.min((average / 50) * sensitivity, 1.0);

    let frequency = 0;
    if (totalMagnitude > 0) {
        const centroidBin = weightedFrequencySum / totalMagnitude;
        frequency = centroidBin / rangeLimit;
    }

    return { volume, frequency };
}
