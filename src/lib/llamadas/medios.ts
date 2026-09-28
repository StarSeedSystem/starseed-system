"use client";

/**
 * Micrófono, cámara, pantalla y altavoces. Solo se piden cuando la persona pulsa un botón
 * (llamar, aceptar, unirse, «probar cámara y micro»): nunca al cargar una página ni al sonar
 * un timbre. Nunca lanza: devuelve el error ya traducido.
 */
import { mensajeErrorMedios } from "@/lib/llamadas/errores";
import type { DispositivosMedios } from "@/lib/llamadas/tipos";

function mediaDevices(): MediaDevices | null {
    try {
        return typeof navigator !== "undefined" && navigator.mediaDevices ? navigator.mediaDevices : null;
    } catch {
        return null;
    }
}

export function soportaLlamadas(): boolean {
    if (typeof window === "undefined") return false;
    const md = mediaDevices();
    return !!md && typeof md.getUserMedia === "function" && typeof (window as { RTCPeerConnection?: unknown }).RTCPeerConnection === "function";
}

export function soportaPantalla(): boolean {
    const md = mediaDevices();
    return !!md && typeof (md as { getDisplayMedia?: unknown }).getDisplayMedia === "function";
}

export function soportaAltavoz(): boolean {
    try {
        return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
    } catch {
        return false;
    }
}

function modoEco(): boolean {
    try {
        return typeof document !== "undefined" && document.documentElement.getAttribute("data-perf") === "eco";
    } catch {
        return false;
    }
}

export function restriccionesAudio(microId?: string | null): MediaTrackConstraints {
    return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(microId ? { deviceId: { exact: microId } } : {}),
    };
}

export function restriccionesVideo(camaraId?: string | null): MediaTrackConstraints {
    const eco = modoEco();
    return {
        width: { ideal: eco ? 640 : 1280 },
        height: { ideal: eco ? 360 : 720 },
        frameRate: { ideal: eco ? 15 : 24, max: 30 },
        ...(camaraId ? { deviceId: { exact: camaraId } } : { facingMode: "user" }),
    };
}

export interface ResultadoMedios {
    stream: MediaStream | null;
    /** Error bloqueante (no se consiguió nada de lo pedido). */
    error: string | null;
    /** Aviso parcial (p. ej. hay micro pero no cámara). */
    aviso: string | null;
}

/**
 * Pide micro y/o cámara. Si pide los dos y la cámara falla, se queda con el micro y lo avisa
 * (mejor una llamada sin vídeo que ninguna).
 */
export async function obtenerMedios(p: { audio: boolean; video: boolean; microId?: string | null; camaraId?: string | null }): Promise<ResultadoMedios> {
    const md = mediaDevices();
    if (!md || typeof md.getUserMedia !== "function") {
        return { stream: null, error: mensajeErrorMedios({ name: "NoMediaDevices" }, p), aviso: null };
    }
    if (!p.audio && !p.video) return { stream: null, error: null, aviso: null };
    try {
        const stream = await md.getUserMedia({
            audio: p.audio ? restriccionesAudio(p.microId) : false,
            video: p.video ? restriccionesVideo(p.camaraId) : false,
        });
        return { stream, error: null, aviso: null };
    } catch (err) {
        if (p.audio && p.video) {
            try {
                const stream = await md.getUserMedia({ audio: restriccionesAudio(p.microId), video: false });
                return { stream, error: null, aviso: mensajeErrorMedios(err, { audio: false, video: true }) };
            } catch (err2) {
                return { stream: null, error: mensajeErrorMedios(err2, p), aviso: null };
            }
        }
        return { stream: null, error: mensajeErrorMedios(err, p), aviso: null };
    }
}

export async function obtenerPista(tipo: "audio" | "video", deviceId?: string | null): Promise<{ pista: MediaStreamTrack | null; error: string | null }> {
    const r = await obtenerMedios({
        audio: tipo === "audio",
        video: tipo === "video",
        microId: tipo === "audio" ? deviceId : null,
        camaraId: tipo === "video" ? deviceId : null,
    });
    const pista = (tipo === "audio" ? r.stream?.getAudioTracks()[0] : r.stream?.getVideoTracks()[0]) ?? null;
    return { pista, error: pista ? null : r.error ?? r.aviso };
}

export async function obtenerPantalla(): Promise<{ pista: MediaStreamTrack | null; error: string | null }> {
    const md = mediaDevices() as (MediaDevices & { getDisplayMedia?: (c?: DisplayMediaStreamOptions) => Promise<MediaStream> }) | null;
    if (!md?.getDisplayMedia) return { pista: null, error: "Este dispositivo no permite compartir la pantalla desde el navegador." };
    try {
        const s = await md.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
        const pista = s.getVideoTracks()[0] ?? null;
        try {
            if (pista) (pista as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
        } catch {
            /* opcional */
        }
        return { pista, error: pista ? null : "No llegó ninguna imagen de la pantalla." };
    } catch (err) {
        return { pista: null, error: mensajeErrorMedios(err, { audio: false, video: true, pantalla: true }) };
    }
}

export async function listarDispositivos(): Promise<DispositivosMedios> {
    const vacio: DispositivosMedios = { microfonos: [], camaras: [], altavoces: [] };
    const md = mediaDevices();
    if (!md?.enumerateDevices) return vacio;
    try {
        const lista = await md.enumerateDevices();
        const out: DispositivosMedios = { microfonos: [], camaras: [], altavoces: [] };
        for (const d of lista) {
            if (!d.deviceId) continue;
            if (d.kind === "audioinput") out.microfonos.push({ id: d.deviceId, nombre: d.label || `Micrófono ${out.microfonos.length + 1}` });
            else if (d.kind === "videoinput") out.camaras.push({ id: d.deviceId, nombre: d.label || `Cámara ${out.camaras.length + 1}` });
            else if (d.kind === "audiooutput") out.altavoces.push({ id: d.deviceId, nombre: d.label || `Altavoz ${out.altavoces.length + 1}` });
        }
        return out;
    } catch {
        return vacio;
    }
}

/** Aplica el altavoz elegido a un elemento de audio/vídeo (si el navegador lo permite). */
export async function aplicarAltavoz(el: HTMLMediaElement | null, altavozId: string | null): Promise<void> {
    if (!el || !altavozId || !soportaAltavoz()) return;
    try {
        await (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(altavozId);
    } catch {
        /* dispositivo desaparecido o permiso: se queda en el de siempre */
    }
}

export function pararStream(s: MediaStream | null | undefined) {
    if (!s) return;
    for (const t of s.getTracks()) {
        try {
            t.stop();
        } catch {
            /* ya parada */
        }
    }
}
