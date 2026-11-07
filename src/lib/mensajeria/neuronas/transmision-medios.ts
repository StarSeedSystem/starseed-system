"use client";

/**
 * Audio y vídeo en vivo por canal de datos con una neurona (GRP1107A · 2026-11-07) — el motor.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Decisiones PURAS en `flujo-medios.ts` (segmentos, reensamblado, medida y ritmo). Aquí:
 *  · EMITIR: micro, cámara o pantalla → `MediaRecorder` en segmentos de ~2 s (cada uno un webm
 *    completo, con su ritmo) → trozos del formato «medios» por `abrirFlujoNeurona` (solo P2P);
 *    tras cada segmento se mide lo que el otro confirmó y se ajusta el ritmo del siguiente;
 *  · REPRODUCIR: `crearReproductorMedios` junta los segmentos que llegan y los reproduce con
 *    MediaSource (modo «sequence»); sin MediaSource, uno detrás de otro como archivos.
 * Es el camino cuando NO hay WebRTC de medios con ese aparato (malla de la cuenta, vínculo entre
 * cuentas…): con un enlace sin internet, la llamada directa va mejor (sin ~2 s de retraso).
 * Nunca lanza hacia fuera.
 */

import type { ConversacionNeurona } from "./agrupar";
import { abrirFlujoNeurona, alSegmentosMedios, leerFlujoNeurona } from "./flujos-neurona";
import { deBase64 } from "./flujo-datos";
import {
    ajustarRitmo,
    armarTrozosSegmento,
    bitsGrabacion,
    bytesConfirmados,
    medirEnlace,
    debeDescartarSegmento,
    elegirMime,
    ritmoInicial,
    SEGMENTO_MS,
    textoRitmo,
    type EstadoRitmo,
    type MuestraAcuse,
    type TipoMedios,
} from "./flujo-medios";

export interface EstadoTransmision {
    id: string;
    tipo: TipoMedios;
    activa: boolean;
    ritmo: EstadoRitmo;
    segmentos: number;
    descartados: number;
    via: string;
    texto: string;
    motivoFin?: string;
}

export interface ControlTransmision {
    id: string;
    estado(): EstadoTransmision;
    suscribir(cb: (e: EstadoTransmision) => void): () => void;
    parar(motivo?: string): void;
}

function pararPistas(s: MediaStream | null): void {
    try {
        s?.getTracks().forEach((t) => t.stop());
    } catch {
        /* noop */
    }
}

async function conseguirStream(tipo: "audio" | "video" | "pantalla", pantalla?: Promise<MediaStreamTrack | null>): Promise<{ stream: MediaStream | null; motivo?: string }> {
    try {
        const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
        if (tipo === "pantalla") {
            const pista = await (pantalla ?? Promise.resolve(null));
            if (!pista) return { stream: null, motivo: "No se eligió ninguna pantalla, ventana ni pestaña para compartir." };
            return { stream: new MediaStream([pista]) };
        }
        if (!md?.getUserMedia) return { stream: null, motivo: "Este navegador no deja usar el micrófono ni la cámara." };
        const stream = await md.getUserMedia(tipo === "video" ? { audio: true, video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } } } : { audio: true });
        return { stream };
    } catch {
        return { stream: null, motivo: tipo === "video" ? "No se pudo usar la cámara ni el micrófono (¿permiso?)." : "No se pudo usar el micrófono (¿permiso?)." };
    }
}

/** Graba UN segmento de `ms` con su ritmo: un webm completo (con cabecera). */
function grabarSegmento(stream: MediaStream, mime: string, ritmo: EstadoRitmo, ms: number): Promise<Blob | null> {
    return new Promise((ok) => {
        let rec: MediaRecorder;
        try {
            rec = new MediaRecorder(stream, { mimeType: mime, ...bitsGrabacion(ritmo) });
        } catch {
            ok(null);
            return;
        }
        const trozos: Blob[] = [];
        rec.ondataavailable = (ev) => {
            if (ev.data && ev.data.size) trozos.push(ev.data);
        };
        rec.onstop = () => ok(trozos.length ? new Blob(trozos, { type: mime }) : null);
        rec.onerror = () => ok(null);
        try {
            rec.start();
            setTimeout(() => {
                try {
                    if (rec.state !== "inactive") rec.stop();
                } catch {
                    ok(null);
                }
            }, ms);
        } catch {
            ok(null);
        }
    });
}

/**
 * Transmite audio, vídeo o pantalla en vivo a una neurona por canal de datos. `pantalla`: la
 * promesa de `pedirPantalla()` hecha en el gesto. Nunca lanza.
 */
export async function transmitirMedios(o: {
    conversacion: Pick<ConversacionNeurona, "clave" | "destino" | "propia" | "nombre">;
    tipo: "audio" | "video" | "pantalla";
    pantalla?: Promise<MediaStreamTrack | null>;
}): Promise<{ ok: true; control: ControlTransmision } | { ok: false; motivo: string }> {
    const tipoMedios: TipoMedios = o.tipo === "audio" ? "audio" : "video";
    if (typeof MediaRecorder === "undefined") return { ok: false, motivo: "Este navegador no puede grabar audio ni vídeo (MediaRecorder)." };
    const mime = elegirMime(tipoMedios, (m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return { ok: false, motivo: "Este navegador no graba en ningún formato que se pueda mandar por la malla." };
    const { stream, motivo } = await conseguirStream(o.tipo, o.pantalla);
    if (!stream) return { ok: false, motivo: motivo ?? "No se pudo empezar." };
    const nombre = o.tipo === "audio" ? "Voz en vivo" : o.tipo === "pantalla" ? "Pantalla en vivo" : "Vídeo en vivo";
    const r = await abrirFlujoNeurona({ conversacion: o.conversacion, nombre, formato: "medios", mime, soloP2P: true });
    if (!r.ok) {
        pararPistas(stream);
        return { ok: false, motivo: r.motivo };
    }
    const flujo = r.flujo;
    const oyentes = new Set<(e: EstadoTransmision) => void>();
    let e: EstadoTransmision = { id: flujo.id, tipo: tipoMedios, activa: true, ritmo: ritmoInicial(tipoMedios), segmentos: 0, descartados: 0, via: flujo.via, texto: "" };
    const poner = (p: Partial<EstadoTransmision>) => {
        e = { ...e, ...p };
        e = { ...e, texto: `${textoRitmo(e.ritmo)} · ${e.segmentos} segmentos${e.descartados ? ` · ${e.descartados} saltados` : ""}` };
        for (const cb of Array.from(oyentes)) {
            try {
                cb(e);
            } catch {
                /* noop */
            }
        }
    };
    poner({});
    const tamanos: number[] = [];
    const muestras: MuestraAcuse[] = [];
    let enviados = 0;
    let seg = 0;
    let parado = false;
    const parar = (m?: string) => {
        if (parado) return;
        parado = true;
        pararPistas(stream);
        flujo.cerrar(m);
        poner({ activa: false, ...(m ? { motivoFin: m } : {}) });
    };
    // Si la persona para la pantalla desde el navegador, se termina la transmisión.
    stream.getTracks().forEach((t) => t.addEventListener("ended", () => parar("se dejó de compartir")));
    void (async () => {
        while (!parado) {
            const blob = await grabarSegmento(stream, mime, e.ritmo, SEGMENTO_MS);
            if (parado) break;
            if (!blob) {
                parar("la grabación falló");
                break;
            }
            const datos = new Uint8Array(await blob.arrayBuffer());
            const cola = flujo.enCola();
            const d = debeDescartarSegmento(cola, datos.length);
            if (d.descartar) {
                poner({ descartados: e.descartados + 1, ritmo: ajustarRitmo(e.ritmo, null, cola) });
                continue;
            }
            let todo = true;
            let datosEnviados = 0;
            for (const t of armarTrozosSegmento(seg, datos)) {
                if (!flujo.enviar(t)) {
                    todo = false;
                    break;
                }
                tamanos.push(t.length);
                datosEnviados += t.length;
            }
            if (!todo) {
                parar("el enlace se cerró");
                break;
            }
            seg += 1;
            // Lo medido: bytes que el otro confirmó (sus acuses) en la ventana reciente.
            const est = leerFlujoNeurona(flujo.id);
            const ahora = Date.now();
            enviados += datosEnviados;
            muestras.push({ en: ahora, enviados, confirmados: bytesConfirmados(tamanos, est?.recibidosOtro ?? 0) });
            while (muestras.length > 20) muestras.shift();
            poner({ segmentos: seg, ritmo: ajustarRitmo(e.ritmo, medirEnlace(muestras, ahora), flujo.enCola()) });
        }
    })();
    return {
        ok: true,
        control: {
            id: flujo.id,
            estado: () => e,
            suscribir(cb) {
                oyentes.add(cb);
                return () => {
                    oyentes.delete(cb);
                };
            },
            parar,
        },
    };
}

/* ══════════════════════════ Reproducir lo que llega ══════════════════════════ */

/**
 * Reproduce en un `<audio>`/`<video>` los segmentos de una transmisión que llega. MediaSource en
 * modo «sequence» si el navegador admite el formato; si no, cada segmento como un archivo, uno
 * detrás de otro. Devuelve la baja (suelta todo).
 */
export function crearReproductorMedios(el: HTMLMediaElement, id: string, mime: string): () => void {
    let vivo = true;
    const urls: string[] = [];
    const MS = typeof MediaSource !== "undefined" ? MediaSource : null;
    const usarMse = !!MS && (() => {
        try {
            return MS.isTypeSupported(mime);
        } catch {
            return false;
        }
    })();
    if (usarMse && MS) {
        const ms = new MS();
        const url = URL.createObjectURL(ms);
        urls.push(url);
        el.src = url;
        let sb: SourceBuffer | null = null;
        const cola: Uint8Array<ArrayBuffer>[] = [];
        const bombear = () => {
            if (!sb || sb.updating || !cola.length || !vivo) return;
            try {
                sb.appendBuffer(cola.shift() as Uint8Array<ArrayBuffer>);
            } catch {
                /* cuota o formato: se salta este segmento */
            }
        };
        ms.addEventListener("sourceopen", () => {
            try {
                sb = ms.addSourceBuffer(mime);
                sb.mode = "sequence";
                sb.addEventListener("updateend", bombear);
                bombear();
            } catch {
                sb = null;
            }
        });
        const baja = alSegmentosMedios(id, (s) => {
            const bytes = juntar(s.partes);
            cola.push(bytes);
            bombear();
            void el.play().catch(() => undefined);
        });
        return () => {
            vivo = false;
            baja();
            urls.forEach((u) => URL.revokeObjectURL(u));
        };
    }
    // Sin MediaSource: archivo a archivo.
    const pendientes: string[] = [];
    let sonando = false;
    const siguiente = () => {
        const u = pendientes.shift();
        if (!u || !vivo) {
            sonando = false;
            return;
        }
        sonando = true;
        el.src = u;
        void el.play().catch(() => undefined);
    };
    el.addEventListener("ended", siguiente);
    const baja = alSegmentosMedios(id, (s) => {
        const u = URL.createObjectURL(new Blob([juntar(s.partes)], { type: mime }));
        urls.push(u);
        pendientes.push(u);
        while (pendientes.length > 3) pendientes.shift(); // en vivo: no se acumula retraso
        if (!sonando) siguiente();
    });
    return () => {
        vivo = false;
        baja();
        el.removeEventListener("ended", siguiente);
        urls.forEach((u) => URL.revokeObjectURL(u));
    };
}

function juntar(partes: string[]): Uint8Array<ArrayBuffer> {
    const trozos = partes.map((p) => deBase64(p.slice(p.lastIndexOf("|") + 1)));
    const total = trozos.reduce((s, t) => s + t.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const t of trozos) {
        out.set(t, o);
        o += t.length;
    }
    return out;
}
