"use client";

/**
 * Micrófono, cámara, pantalla y altavoces. Solo se piden cuando la persona pulsa un botón
 * (llamar, aceptar, unirse, «probar cámara y micro»): nunca al cargar una página ni al sonar
 * un timbre. Nunca lanza: devuelve el error ya traducido.
 */
import { mensajeErrorMedios } from "@/lib/llamadas/errores";
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";
import type { DispositivosMedios } from "@/lib/llamadas/tipos";
import { explicarFalloMedios } from "@/lib/nativa/medios-nativos";
import { esAppNativa } from "@/lib/nativa/puente";
import { describirCamaras, elegirCamaraPorDefecto, leerPreferencias, lineaCamaraElegida, plataformaDe, restriccionesDeOpciones, leerCapacidades } from "@/lib/llamadas/camaras";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";
import { getDeviceId } from "@/lib/network/device-registry";

/** La neurona de ESTE aparato (donde se recuerdan las elecciones); sin ella, un nombre fijo. */
function neuronaLocal(): string {
    try {
        return getDeviceId() || "local";
    } catch {
        return "local";
    }
}

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

/**
 * (MIC1108A) Por qué no hay llamadas aquí, dicho para ESTE entorno: en la app nativa, falta de
 * permiso de la app instalada o motor sin WebRTC; en el navegador, https y navegador actual.
 */
export async function motivoSinLlamadas(video = false): Promise<{ motivo: string; ajustes: AjustesMedios | null }> {
    const md = mediaDevices();
    if (!md || typeof md.getUserMedia !== "function") {
        const d = await explicarFalloMedios({ name: "NoMediaDevices" }, { audio: true, video });
        return { motivo: d.mensaje, ajustes: d.ajustes };
    }
    return {
        motivo: esAppNativa()
            ? "El motor web de esta app no trae llamadas (WebRTC). Mientras, puedes llamar desde el navegador."
            : "Este navegador no permite llamadas: hace falta una conexión segura (https) y un navegador actual.",
        ajustes: null,
    };
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

/**
 * VID1110A: deja en la llamada la cámara DEL PROPIO APARATO. Sin deviceId, `facingMode: "user"` deja que el sistema
 * decida, y macOS prefiere el iPhone (Cámara de Continuidad) si está cerca. Con permiso ya dado se ven las etiquetas:
 * si lo abierto no es lo que se elegiría (guardada › integrada frontal › resto), se reabre la buena y se suelta la otra.
 * Nunca lanza ni deja la llamada sin cámara: si algo falla, se queda la que abrió el sistema.
 */
export async function afinarCamara(md: MediaDevices, stream: MediaStream, camaraIdPedida?: string | null, neurona: string = neuronaLocal()): Promise<void> {
    const pista = stream.getVideoTracks()[0];
    if (!pista) return;
    try {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const lista = describirCamaras(
            (await md.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ id: d.deviceId, nombre: d.label || "" })),
            plataformaDe(ua),
        );
        const abiertaId = pista.getSettings?.().deviceId ?? null;
        const abierta = lista.find((c) => c.id === abiertaId) ?? lista.find((c) => c.etiqueta && c.etiqueta === pista.label) ?? null;
        if (camaraIdPedida) {
            if (abierta) anotarLlamada("camara", null, lineaCamaraElegida(abierta, "pedida"));
            return;
        }
        const e = elegirCamaraPorDefecto(lista, leerPreferencias(neurona).camara);
        let final = abierta;
        if (e.camara && abiertaId && e.camara.id !== abiertaId) {
            try {
                const otro = await md.getUserMedia({ audio: false, video: { ...restriccionesVideo(e.camara.id) } });
                const nueva = otro.getVideoTracks()[0];
                if (nueva) {
                    stream.addTrack(nueva);
                    stream.removeTrack(pista);
                    pista.stop();
                    final = e.camara;
                }
            } catch {
                /* se queda la que abrió el sistema */
            }
        }
        if (final) anotarLlamada("camara", null, lineaCamaraElegida(final, final === e.camara ? e.motivo : "sistema"));
    } catch {
        /* sin enumerateDevices: se queda la que abrió el sistema */
    }
}

/** Aplica unas opciones guardadas (resolución, fps, zoom…) a la pista abierta. Solo lo que esa cámara admite. */
export async function aplicarOpcionesGuardadas(pista: MediaStreamTrack | null | undefined, neurona: string = neuronaLocal()): Promise<void> {
    if (!pista || typeof pista.applyConstraints !== "function") return;
    try {
        const o = leerPreferencias(neurona).opciones?.[pista.label];
        if (!o) return;
        const r = restriccionesDeOpciones(o, leerCapacidades(pista));
        if (Object.keys(r).length) await pista.applyConstraints(r);
    } catch {
        /* la cámara no las admite: se queda como está */
    }
}

export interface ResultadoMedios {
    stream: MediaStream | null;
    /** Error bloqueante (no se consiguió nada de lo pedido). */
    error: string | null;
    /** Aviso parcial (p. ej. hay micro pero no cámara). */
    aviso: string | null;
    /** (MIC1108A) Qué ajustes del sistema abre «Abrir ajustes» (solo en la app y si el fallo fue de permisos). */
    ajustes?: AjustesMedios | null;
}

/** (MIC1108A) El error bloqueante, dicho para ESTE entorno (app nativa de cada sistema o navegador). */
async function errorBloqueante(err: unknown, p: { audio: boolean; video: boolean }): Promise<ResultadoMedios> {
    const d = await explicarFalloMedios(err, { audio: p.audio, video: p.video });
    return { stream: null, error: d.mensaje, aviso: null, ajustes: d.ajustes };
}

/**
 * Pide micro y/o cámara. Si pide los dos y la cámara falla, se queda con el micro y lo avisa
 * (mejor una llamada sin vídeo que ninguna).
 */
export async function obtenerMedios(p: { audio: boolean; video: boolean; microId?: string | null; camaraId?: string | null }): Promise<ResultadoMedios> {
    const md = mediaDevices();
    if (!md || typeof md.getUserMedia !== "function") {
        return errorBloqueante({ name: "NoMediaDevices" }, p);
    }
    if (!p.audio && !p.video) return { stream: null, error: null, aviso: null };
    try {
        const stream = await md.getUserMedia({
            audio: p.audio ? restriccionesAudio(p.microId) : false,
            video: p.video ? restriccionesVideo(p.camaraId) : false,
        });
        if (p.video) {
            await afinarCamara(md, stream, p.camaraId);
            await aplicarOpcionesGuardadas(stream.getVideoTracks()[0]);
        }
        return { stream, error: null, aviso: null };
    } catch (err) {
        if (p.audio && p.video) {
            try {
                const stream = await md.getUserMedia({ audio: restriccionesAudio(p.microId), video: false });
                return { stream, error: null, aviso: mensajeErrorMedios(err, { audio: false, video: true }) };
            } catch (err2) {
                return errorBloqueante(err2, p);
            }
        }
        return errorBloqueante(err, p);
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
    if (!md?.getDisplayMedia) return { pista: null, error: (await explicarFalloMedios({ name: "NoMediaDevices" }, { audio: false, video: true, pantalla: true })).mensaje };
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
        return { pista: null, error: (await explicarFalloMedios(err, { audio: false, video: true, pantalla: true })).mensaje };
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
