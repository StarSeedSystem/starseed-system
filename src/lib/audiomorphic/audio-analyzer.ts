/**
 * Audiomorphic — MOTOR DE AUDIO compartido (Adenda 69 · K)
 * ============================================================================
 * Port de `hooks/useAudioAnalyzer.ts` de la repo CORRECTA
 * (github.com/alexbordongarrigos/audiomorphic-ar) con TRES cambios que exige el OS:
 *
 *  1. **SINGLETON.** En el OS puede haber a la vez la CAPA DE FONDO, la APP y un
 *     widget. Si cada uno llamara a `getUserMedia`, competirían por el micrófono.
 *     Aquí hay **un solo AudioContext, un solo stream y un solo AnalyserNode**,
 *     con conteo de referencias: el stream se suelta cuando se va el último.
 *
 *  2. **NUNCA SE PIDE EL PERMISO SOLO.** `startMic()` se llama SIEMPRE desde un
 *     gesto del usuario. Ningún camino lo dispara al cargar. (Ciberdelia: la
 *     tecnología jamás se usa para vigilar — y además es lo que exigen los
 *     navegadores.)
 *
 *  3. **Sin Electron/Capacitor.** El original tenía ramas nativas
 *     (`electronAPI.getDesktopSources`, permisos de Capacitor). En el OS web la
 *     fuente «sistema» usa `getDisplayMedia` (el navegador pide una pestaña o
 *     pantalla y le sacamos SOLO el audio: la pista de vídeo se corta al vuelo).
 *
 * Lo que SÍ se porta y antes faltaba:
 *  · **bass / mid / treble** (el piloto automático real los necesita: sin ellos
 *    no hay detección de beat, ni modo rítmico, ni Génesis por energía).
 *  · **Selección de dispositivo de entrada** (`enumerateDevices`).
 *  · **Fuente de audio**: micrófono | sistema.
 *
 * Sin micrófono el visualizador NO se rompe: `getMetrics()` devuelve silencio y
 * el piloto sigue animando la espiral. El audio solo añade reactividad.
 */

import type { AudioMetrics, AudioSource } from "./types";
import { SILENT_METRICS } from "./types";

export type MicState = "idle" | "requesting" | "live" | "denied" | "error";

export const AUDIOMORPHIC_MIC_EVENT = "starseed:audiomorphic-mic";
/** Se emite cuando cambia la lista de dispositivos de entrada. */
export const AUDIOMORPHIC_DEVICES_EVENT = "starseed:audiomorphic-devices";

interface Engine {
    ctx: AudioContext | null;
    analyser: AnalyserNode | null;
    source: MediaStreamAudioSourceNode | null;
    stream: MediaStream | null;
    data: Uint8Array | null;
    state: MicState;
    error?: string;
    refs: number;
    /** Fuente con la que se abrió el stream vivo. */
    source_kind: AudioSource;
    devices: MediaDeviceInfo[];
    deviceId: string;
}

const engine: Engine = {
    ctx: null,
    analyser: null,
    source: null,
    stream: null,
    data: null,
    state: "idle",
    refs: 0,
    source_kind: "microphone",
    devices: [],
    deviceId: "",
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

export function getAudioSourceKind(): AudioSource {
    return engine.source_kind;
}

/* ── Dispositivos de entrada ───────────────────────────────────────────── */

export function getInputDevices(): MediaDeviceInfo[] {
    return engine.devices;
}

export function getSelectedDeviceId(): string {
    return engine.deviceId;
}

export function setSelectedDeviceId(id: string): void {
    engine.deviceId = id;
}

/**
 * Refresca la lista de entradas. OJO: sin permiso concedido los navegadores
 * devuelven las etiquetas VACÍAS (es la norma, no un fallo): hasta que el
 * usuario no acepta el micrófono, no se pueden nombrar sus dispositivos.
 */
export async function refreshInputDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
        const all = await navigator.mediaDevices.enumerateDevices();
        engine.devices = all.filter((d) => d.kind === "audioinput");
        if (!engine.deviceId && engine.devices.length) engine.deviceId = engine.devices[0].deviceId;
        try {
            window.dispatchEvent(new CustomEvent(AUDIOMORPHIC_DEVICES_EVENT, { detail: { devices: engine.devices } }));
        } catch {
            /* noop */
        }
        return engine.devices;
    } catch {
        return [];
    }
}

/* ── Encendido / apagado ───────────────────────────────────────────────── */

/**
 * Enciende la captura de audio. **Llamar SOLO desde un gesto del usuario.**
 * Idempotente para la MISMA fuente: si ya está viva, no vuelve a pedir permiso.
 * Si cambia la fuente (micro ↔ sistema) o el dispositivo, se reabre el stream.
 */
export async function startMic(kind: AudioSource = "microphone", deviceId?: string): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (engine.state === "requesting") return false;
    if (engine.state === "live" && engine.source_kind === kind && (!deviceId || deviceId === engine.deviceId)) return true;

    const md = navigator.mediaDevices as
        | (MediaDevices & { getDisplayMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> })
        | undefined;

    if (!md?.getUserMedia) {
        setState("error", "Este navegador no expone el micrófono (getUserMedia).");
        return false;
    }
    if (kind === "system" && !md.getDisplayMedia) {
        setState("error", "Este navegador no permite capturar el audio del sistema.");
        return false;
    }

    setState("requesting");
    try {
        const AC: typeof AudioContext =
            window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!engine.ctx || engine.ctx.state === "closed") engine.ctx = new AC({ latencyHint: "interactive" });
        if (engine.ctx.state === "suspended") await engine.ctx.resume();

        // Suelta el stream anterior antes de abrir otro (nunca dos capturas vivas).
        releaseStream();

        let stream: MediaStream;
        if (kind === "system") {
            // El navegador pide pantalla/pestaña. Nos quedamos SOLO con el audio.
            stream = await md.getDisplayMedia!({ video: true, audio: { echoCancellation: false } });
            stream.getVideoTracks().forEach((t) => t.stop());
            if (stream.getAudioTracks().length === 0) {
                releaseStream();
                setState(
                    "error",
                    'No llegó audio del sistema: al compartir hay que marcar «Compartir audio de la pestaña».',
                );
                return false;
            }
        } else {
            const id = deviceId || engine.deviceId;
            stream = await md.getUserMedia({
                audio: {
                    ...(id ? { deviceId: { exact: id } } : {}),
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            if (deviceId) engine.deviceId = deviceId;
        }

        const analyser = engine.ctx.createAnalyser();
        analyser.fftSize = 2048;                 // igual que el original
        analyser.smoothingTimeConstant = 0.8;    // igual que el original

        const source = engine.ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        engine.stream = stream;
        engine.analyser = analyser;
        engine.source = source;
        engine.data = new Uint8Array(analyser.frequencyBinCount);
        engine.source_kind = kind;

        setState("live");
        // Ahora SÍ hay permiso ⇒ las etiquetas de los dispositivos ya tienen nombre.
        void refreshInputDevices();
        return true;
    } catch (err) {
        const e = err as { name?: string; message?: string };
        const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
        releaseStream();
        setState(denied ? "denied" : "error", e?.message || "No se pudo abrir el audio.");
        return false;
    }
}

function releaseStream(): void {
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
}

/** Apaga el audio y SUELTA el stream de verdad (se apaga el led del sistema). */
export function stopMic(): void {
    releaseStream();
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
        // Solo se apaga cuando NADIE lo usa: el fondo conserva el audio aunque la
        // app se cierre (y al revés).
        if (engine.refs === 0 && engine.state === "live") stopMic();
    };
}

/**
 * Métricas del fotograma. Copia EXACTA del algoritmo de la app real:
 * puerta de ruido 20, media sobre el rango, centroide ponderado y **tres bandas**
 * (bins 1-10 graves · 11-80 medios · resto agudos) con sus factores 1.5/1.2/1.0.
 * Sin audio devuelve silencio: nunca lanza.
 */
export function getMetrics(sensitivity: number, freqRange: number): AudioMetrics {
    const { analyser, data } = engine;
    if (!analyser || !data || engine.state !== "live") return SILENT_METRICS;

    // El tipo de `getByteFrequencyData` varía entre libs de TS (Uint8Array).
    analyser.getByteFrequencyData(data as any);

    const rangeLimit = Math.floor(data.length * freqRange);
    let totalMagnitude = 0;
    let weightedFrequencySum = 0;
    let bassSum = 0, midSum = 0, trebleSum = 0;
    let bassCount = 0, midCount = 0, trebleCount = 0;

    for (let i = 0; i < rangeLimit; i++) {
        const val = data[i];
        if (val > 20) {
            totalMagnitude += val;
            weightedFrequencySum += i * val;
            if (i > 0 && i <= 10) { bassSum += val; bassCount++; }
            else if (i > 10 && i <= 80) { midSum += val; midCount++; }
            else { trebleSum += val; trebleCount++; }
        }
    }

    const average = rangeLimit > 0 ? totalMagnitude / rangeLimit : 0;
    const volume = Math.min((average / 50) * sensitivity, 1.0);
    const frequency = totalMagnitude > 0 ? weightedFrequencySum / totalMagnitude / rangeLimit : 0;

    const bass = bassCount > 0 ? Math.min((bassSum / bassCount / 255) * sensitivity * 1.5, 1.0) : 0;
    const mid = midCount > 0 ? Math.min((midSum / midCount / 255) * sensitivity * 1.2, 1.0) : 0;
    const treble = trebleCount > 0 ? Math.min((trebleSum / trebleCount / 255) * sensitivity * 1.0, 1.0) : 0;

    return { volume, frequency, bass, mid, treble };
}
