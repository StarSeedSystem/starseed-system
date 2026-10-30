/**
 * StarSeed XR · VOZ en el visor (contrato §3 f). Parte PURA + capturador inyectable.
 * `repartirFrase`: primero `entenderVoz`; si no entiende y hay Protomolécula con foco → DICTADO
 * (aquí solo se ENRUTA a `protomolecula/dictado.ts`); sin molécula → se pregunta. Privacidad
 * (§3 k): el micrófono arranca CERRADO y se cierra al soltar y ante error; el audio no sale.
 */
import { entenderVoz } from "@/lib/xr/intenciones-voz";
import type { ContextoVoz, Referenciable, ResultadoVoz, TipoRef } from "@/lib/xr/intenciones-tipos";
import { transcribirLocal } from "@/lib/aurora/stt-oss/vibeasr-local";
export type { ContextoVoz, Referenciable, ResultadoVoz };
export interface DatosCuenta { grupos: Referenciable[]; contactos: Referenciable[]; estaciones: Referenciable[]; servidores: Referenciable[] }

export type Reparto = { via: "intencion"; resultado: ResultadoVoz } | { via: "dictado"; texto: string } | { via: "preguntar"; pregunta: string };
export function construirContexto(datos: DatosCuenta, enfoque: { tipo: TipoRef; id: string } | null, mundoActual: { id: string; nombre: string } | null): ContextoVoz {
    return { grupos: datos.grupos ?? [], contactos: datos.contactos ?? [], estaciones: datos.estaciones ?? [], servidores: datos.servidores ?? [], enfoque, mundoActual };
}
export function repartirFrase(frase: string, ctx: ContextoVoz, moleculaConFoco: boolean): Reparto {
    const r = entenderVoz(frase, ctx);
    if (r.ok) return { via: "intencion", resultado: r };
    if (r.razon === "no-entendido") return moleculaConFoco ? { via: "dictado", texto: frase } : { via: "preguntar", pregunta: r.pregunta };
    return { via: "intencion", resultado: r };
}
export interface Reconocedor {
    iniciar(): Promise<void>; parar(): void;
    onParcial(cb: (t: string) => void): () => void; onFinal(cb: (t: string) => void): () => void; onError(cb: (m: string) => void): () => void;
}
interface EventoEscucha { results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }
interface Interprete { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: EventoEscucha) => void) | null; onerror: ((e: { error?: string }) => void) | null; onend: (() => void) | null }
const grip = <T,>(s: Set<(g: T) => void>) => (cb: (g: T) => void): (() => void) => { s.add(cb); return () => { s.delete(cb); }; };
const ERR = (e: { error?: string }): string => ({ "not-allowed": "permiso de micrófono denegado", "service-not-allowed": "servicio de voz no permitido por el aparato", "audio-capture": "el micrófono está ocupado", network: "sin red para el servicio de voz", "no-speech": "no se oyó habla" })[e.error ?? ""] ?? e.error ?? "error del micrófono";
/** Reconocedor 1 (`SpeechRecognition`/`webkit` en es-ES con parciales). No existe en todos los visores: `null`. */
export const reconocedorDelNavegador = (): Reconocedor | null => {
    try {
        if (typeof window === "undefined") return null;
        const w = window as unknown as { SpeechRecognition?: new () => Interprete; webkitSpeechRecognition?: new () => Interprete };
        const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition; if (!Ctor) return null;
        const p = new Set<(t: string) => void>(), f = new Set<(t: string) => void>(), e = new Set<(m: string) => void>();
        const r = new Ctor();
        r.lang = "es-ES"; r.interimResults = true; r.continuous = false;
        r.onresult = (ev) => {
            let fin = "";
            for (let i = 0; i < ev.results.length; i++) { const x = ev.results[i]; if (x.isFinal) fin += `${x[0].transcript} `; else p.forEach((cb) => cb(x[0].transcript)); }
            if (fin.trim()) f.forEach((cb) => cb(fin.trim()));
        };
        r.onerror = (x) => e.forEach((cb) => cb(ERR(x)));
        r.onend = () => p.clear();
        return { iniciar: async () => r.start(), parar: () => { try { r.stop(); } catch { /* ya parado */ } }, onParcial: grip(p), onFinal: grip(f), onError: grip(e) };
    } catch { return null; }
};
/** Respaldo 2: el oído local (`transcribirLocal` → VibeASR en la neurona). Graba con `MediaRecorder`; el audio solo va a la neurona. */
export const reconocedorLocal = (): Reconocedor | null => {
    try {
        if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || typeof navigator === "undefined") return null;
        const p = new Set<(t: string) => void>(), f = new Set<(t: string) => void>(), e = new Set<(m: string) => void>();
        let g: MediaRecorder | null = null, medio: MediaStream | null = null;
        const detener = () => { medio?.getTracks().forEach((t) => t.stop()); medio = null; };
        return {
            iniciar: async () => {
                medio = await navigator.mediaDevices.getUserMedia({ audio: true });
                const r = new MediaRecorder(medio); g = r; const trozos: Blob[] = [];
                r.ondataavailable = (x) => { if (x.data.size) trozos.push(x.data); };
                r.onstop = () => {
                    detener();
                    if (!trozos.length) return;
                    void transcribirLocal(new Blob(trozos, { type: "audio/webm" })).then((res) => { if (res.texto) f.forEach((cb) => cb(res.texto)); }).catch((x: unknown) => e.forEach((cb) => cb(x instanceof Error ? x.message : "no se pudo transcribir")));
                };
                r.start();
            },
            parar: () => { try { g?.stop(); } catch { /* ya parado */ } g = null; },
            onParcial: grip(p), onFinal: grip(f), onError: grip(e),
        };
    } catch { return null; }
};

export type EstadoVoz = { estado: "cerrado" } | { estado: "escuchando" } | { estado: "procesando" } | { estado: "sin-voz"; motivo: string };
export interface OpcionesSesion {
    /** Contexto CONGELADO al soltar: listas + enfoque + molécula con foco. */
    preguntar: () => { ctx: ContextoVoz; molecula: boolean }; alEstado: (e: EstadoVoz) => void; alParcial: (t: string) => void; alReparto: (r: Reparto) => void;
}
export interface SesionVoz {
    /** `true` = pulsar «hablar» (abre el mic); `false` = soltar (lo cierra y reparte). */
    hablar(sube: boolean): Promise<void>; cancelar(): void; cerrar(): void;
}

export const MOTIVO_SIN_VOZ = "Este aparato no ofrece reconocimiento del navegador ni el oído local: sin voz en este visor.";
/** Máquina de estado PURA (sin React): `useVozXR` la envuelve. Privacidad: parar SIEMPRE cierra el mic. */
export function crearSesionVoz(recon: Reconocedor | null, es: OpcionesSesion): SesionVoz {
    let abierta = false, esperando = false, cancelada = false;
    const bajo = (r: Reconocedor) => { try { r.parar(); } catch { /* ya cerrado */ } };
    const bajas: (() => void)[] = recon
        ? [recon.onParcial((t) => es.alParcial(t)),
            recon.onFinal((t) => { if (cancelada || (!abierta && !esperando)) return; abierta = false; esperando = false; const c = es.preguntar(); es.alReparto(repartirFrase(t, c.ctx, c.molecula)); es.alEstado({ estado: "cerrado" }); }),
            recon.onError((m) => { bajo(recon); abierta = false; esperando = false; es.alEstado({ estado: "sin-voz", motivo: `El micrófono falló y quedó cerrado: ${m}` }); })]
        : [];
    return {
        async hablar(sube) {
            if (!recon || !bajas.length) { es.alEstado({ estado: "sin-voz", motivo: MOTIVO_SIN_VOZ }); return; }
            if (sube) {
                if (abierta) return; cancelada = false;
                try { await recon.iniciar(); abierta = true; es.alEstado({ estado: "escuchando" }); } catch { bajo(recon); es.alEstado({ estado: "sin-voz", motivo: "El aparato no concedió el micrófono; quedó cerrado." }); }
                return;
            }
            if (!abierta) return;
            abierta = false; bajo(recon); esperando = true;
            es.alEstado({ estado: cancelada ? "cerrado" : "procesando" });
        },
        cancelar() {
            cancelada = true; esperando = false;
            if (abierta && recon) { abierta = false; bajo(recon); }
            es.alParcial(""); es.alEstado({ estado: "cerrado" });
        },
        cerrar() {
            if (recon) bajo(recon);
            abierta = false; esperando = false; cancelada = false;
            for (const b of bajas) b(); bajas.length = 0;
        },
    };
}