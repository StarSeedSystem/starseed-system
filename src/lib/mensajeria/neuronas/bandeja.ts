/**
 * Bandeja local de los mensajes por la malla (MSJ1107A · 2026-11-07) — operaciones PURAS.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Guarda las conversaciones con las neuronas (`n:<neurona>`, `c:<cuenta>`) y los mensajes de
 * chats que viajaron solo por la malla (`dm:<hilo>`), con su vía y su estado, más la vía MEDIDA de
 * los mensajes del servidor que se mandaron desde aquí. Sin red ni DOM: el buzón (`buzon.ts`) la
 * persiste y la sirve a la interfaz.
 */

import type { DescarteMedio, ViaMensaje } from "@/lib/mensajeria/medios/tipos";
import type { DestinoMalla } from "@/lib/mensajeria/medios/enviar";
import {
    faseTrasRecarga,
    leerAdjunto,
    leerFlujoRef,
    leerLlamada,
    registroTrasRecarga,
    type AdjuntoNeurona,
    type FaseArchivoNeurona,
    type FlujoNeuronaRef,
    type LlamadaNeurona,
    type RegistroLlamada,
} from "@/lib/mensajeria/neuronas/datos-neurona";
import { leerOperacion, type OperacionMensaje } from "@/lib/mensajeria/almacen/operaciones";

/** (NEU1107A) Estado local de un archivo del chat (se guarda con el mensaje, en este aparato). */
export interface EstadoArchivoMensaje {
    fase: FaseArchivoNeurona;
    /** 0–100 mientras viaja (lo último que se vio). */
    porcentaje?: number | null;
    motivo?: string;
    /** El archivo entero está guardado en ESTE aparato (se puede ver y bajar sin internet). */
    guardado?: boolean;
    /** Enlaces por los que viajó («Tablet de Alex + Wi-Fi local» si fue por varios). */
    enlaces?: string[];
}

export type EstadoMensajeMalla = "enviando" | "enviado" | "confirmado" | "en-espera" | "fallido" | "recibido";

export interface MensajeMalla {
    /** Id del mensaje (el mismo en los dos extremos: así se descartan duplicados). */
    id: string;
    clave: string;
    dir: "sale" | "entra";
    texto: string;
    /** Epoch ms. */
    at: number;
    estado: EstadoMensajeMalla;
    via?: ViaMensaje;
    /** Por qué espera o falló (frase honesta). */
    aviso?: string;
    /** Entrantes: nombre que declara el aparato que lo manda. */
    deNombre?: string;
    /** Chats por la malla: cuenta que lo manda (declarada por el aparato). */
    deUid?: string;
    /** Salientes: a quién y con qué ajustes reintentar. */
    destino?: DestinoMalla;
    /** Chats de grupo por la malla: cuentas destinatarias. */
    destinatarios?: string[];
    /** Clave de preferencias de medio del chat (p. ej. «neurona:n:abc» o «dm:<hilo>»). */
    clavePrefs?: string;
    intentos?: number;
    /** Por qué no salió por cada medio (cuando espera o falló). */
    descartados?: DescarteMedio[];
    /** (NEU1107A) Archivo de cualquier formato (por la malla o por el almacenamiento de la cuenta). */
    adjunto?: AdjuntoNeurona;
    /** (NEU1107A) Llamada de voz o vídeo, o pantalla compartida (el timbre y su registro). */
    llamada?: LlamadaNeurona;
    /** (NEU1107A) Transmisión de datos en vivo (lo vivo está en memoria: `flujos-neurona.ts`). */
    flujo?: FlujoNeuronaRef;
    /** (NEU1107A) No espera un medio: si no sale ya, falla (timbres y anuncios de flujos). */
    urgente?: boolean;
    /** (NEU1107A) Estado local del archivo (fase, progreso, si está guardado aquí). */
    archivo?: EstadoArchivoMensaje;
    /** (NEU1107A) Cómo fue la llamada (sonando, en curso, duración, perdida…). */
    registroLlamada?: RegistroLlamada;
    /** (MSJ1108C) Neurona que lo mandó (entrantes). */
    deNeurona?: string;
    /** (MSJ1108C) Reloj lógico híbrido del autor: ordena entre aparatos aunque sus relojes difieran. */
    hlc?: string;
    /** (MSJ1108C) Mensaje al que responde (cita): viaja por la malla igual que por el servidor. */
    respuestaA?: RespuestaCitada;
    /** (MSJ1108C) Mensaje enriquecido (lienzo/documento/estilo); el texto lleva el markdown equivalente. */
    formato?: unknown;
    /** (MSJ1108C) Edición firmada por el autor: hora de la última y su reloj. */
    editadoEn?: number;
    opHlc?: string;
    /** (MSJ1108C) Borrado firmado por el autor (lápida: el texto y los adjuntos se vacían). */
    borrado?: boolean;
    borradoHlc?: string;
    /** (MSJ1108C) Recibos por persona o neurona destinataria (epoch ms). */
    recibos?: Record<string, { entregado?: number; leido?: number }>;
    /** (MSJ1108C) El servidor de la cuenta ya tiene una copia (subida idempotente hecha), epoch ms. */
    subido?: number;
    /** (MSJ1108C) Reloj de la última edición o borrado ya aplicado en el servidor. */
    subidoOp?: string;
}

/** (MSJ1108C) Cita de un mensaje: id, autor y un extracto corto (para verla aunque falte el original). */
export interface RespuestaCitada {
    id: string;
    de?: string;
    x: string;
}

export const MAX_FORMATO_BYTES = 8 * 1024;

export function leerRespuesta(x: unknown): RespuestaCitada | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || o.id.length > 80) return null;
    return {
        id: o.id,
        ...(typeof o.de === "string" && o.de.length <= 80 ? { de: o.de } : {}),
        x: typeof o.x === "string" ? o.x.slice(0, 160) : "",
    };
}

/** El formato enriquecido viaja tal cual si es un objeto razonable; si no, se descarta (el texto basta). */
export function leerFormatoMalla(x: unknown): unknown | null {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    try {
        return JSON.stringify(x).length <= MAX_FORMATO_BYTES ? x : null;
    } catch {
        return null;
    }
}

export interface ConversacionMalla {
    mensajes: MensajeMalla[];
    /** Epoch ms hasta el que se leyó. */
    leidoHasta: number;
}

export interface EstadoBandeja {
    v: 1;
    conv: Record<string, ConversacionMalla>;
    /** Vía medida de los mensajes del servidor enviados desde aquí (id del mensaje → vía). */
    vias: Record<string, ViaMensaje>;
}

export const BANDEJA_VACIA: EstadoBandeja = { v: 1, conv: {}, vias: {} };

export const MAX_POR_CONVERSACION = 300;
export const MAX_VIAS = 600;

export function esClaveNeurona(clave: string): boolean {
    return clave.startsWith("n:") || clave.startsWith("c:");
}

/** Añade (o completa, si ya existe ese id en esa conversación) y mantiene el orden por fecha. */
export function anadirMensaje(e: EstadoBandeja, m: MensajeMalla, max = MAX_POR_CONVERSACION): EstadoBandeja {
    const c = e.conv[m.clave] ?? { mensajes: [], leidoHasta: 0 };
    const previo = c.mensajes.find((x) => x.id === m.id);
    // Un duplicado entrante (llegó por dos caminos) no pisa al primero… salvo (NEU1107A) que traiga
    // el mismo archivo por otro medio (p. ej. ya subido al almacenamiento de la cuenta).
    if (previo && m.dir === "entra" && previo.dir === "entra") {
        const otroMedio = !!m.adjunto && !!previo.adjunto && (m.adjunto.modo !== previo.adjunto.modo || m.adjunto.url !== previo.adjunto.url);
        if (!otroMedio) return e;
        return actualizarMensaje(e, m.clave, m.id, { adjunto: m.adjunto, archivo: undefined, via: m.via ?? previo.via });
    }
    const sin = c.mensajes.filter((x) => x.id !== m.id);
    const mensajes = [...sin, previo ? { ...previo, ...m } : m].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    const recortados = mensajes.length > max ? mensajes.slice(mensajes.length - max) : mensajes;
    return { ...e, conv: { ...e.conv, [m.clave]: { ...c, mensajes: recortados } } };
}

export function actualizarMensaje(e: EstadoBandeja, clave: string, id: string, cambio: Partial<MensajeMalla>): EstadoBandeja {
    const c = e.conv[clave];
    if (!c || !c.mensajes.some((m) => m.id === id)) return e;
    return {
        ...e,
        conv: { ...e.conv, [clave]: { ...c, mensajes: c.mensajes.map((m) => (m.id === id ? { ...m, ...cambio, id, clave } : m)) } },
    };
}

export function quitarMensaje(e: EstadoBandeja, clave: string, id: string): EstadoBandeja {
    const c = e.conv[clave];
    if (!c || !c.mensajes.some((m) => m.id === id)) return e;
    return { ...e, conv: { ...e.conv, [clave]: { ...c, mensajes: c.mensajes.filter((m) => m.id !== id) } } };
}

export function marcarLeida(e: EstadoBandeja, clave: string, hasta: number): EstadoBandeja {
    const c = e.conv[clave];
    if (!c || c.leidoHasta >= hasta) return e;
    return { ...e, conv: { ...e.conv, [clave]: { ...c, leidoHasta: hasta } } };
}

export function noLeidosDe(e: EstadoBandeja, clave: string): number {
    const c = e.conv[clave];
    if (!c) return 0;
    return c.mensajes.reduce((n, m) => (m.dir === "entra" && m.at > c.leidoHasta ? n + 1 : n), 0);
}

/** No leídos de todas las conversaciones con neuronas (la pastilla de la pestaña). */
export function noLeidosNeuronas(e: EstadoBandeja): number {
    let n = 0;
    for (const clave of Object.keys(e.conv)) if (esClaveNeurona(clave)) n += noLeidosDe(e, clave);
    return n;
}

export function ultimoDe(e: EstadoBandeja, clave: string): MensajeMalla | null {
    const ms = e.conv[clave]?.mensajes;
    return ms && ms.length ? ms[ms.length - 1] : null;
}

/** Salientes que esperan un medio (para reintentar). */
export function enEspera(e: EstadoBandeja): MensajeMalla[] {
    const out: MensajeMalla[] = [];
    for (const c of Object.values(e.conv)) for (const m of c.mensajes) if (m.dir === "sale" && m.estado === "en-espera") out.push(m);
    return out.sort((a, b) => a.at - b.at);
}

export function guardarVia(e: EstadoBandeja, mensajeId: string, via: ViaMensaje, max = MAX_VIAS): EstadoBandeja {
    const vias = { ...e.vias, [mensajeId]: via };
    const claves = Object.keys(vias);
    if (claves.length > max) {
        // Fuera las más viejas (las vías llevan `en`; sin fecha, primero).
        claves
            .sort((a, b) => (vias[a].en ?? 0) - (vias[b].en ?? 0))
            .slice(0, claves.length - max)
            .forEach((k) => delete vias[k]);
    }
    return { ...e, vias };
}

/** PURA: lee lo guardado (o basura) y devuelve una bandeja válida. */
export function leerBandeja(crudo: string | null): EstadoBandeja {
    if (!crudo) return BANDEJA_VACIA;
    try {
        const o = JSON.parse(crudo) as Partial<EstadoBandeja> | null;
        if (!o || typeof o !== "object" || o.v !== 1) return BANDEJA_VACIA;
        const conv: Record<string, ConversacionMalla> = {};
        for (const [k, c] of Object.entries(o.conv ?? {})) {
            if (!c || typeof c !== "object" || !Array.isArray((c as ConversacionMalla).mensajes)) continue;
            const mensajes = (c as ConversacionMalla).mensajes.filter(
                (m) => m && typeof m.id === "string" && typeof m.texto === "string" && typeof m.at === "number" && (m.dir === "sale" || m.dir === "entra"),
            );
            // Lo que quedó «enviando» al cerrar la pestaña no se perdió: pasa a esperar y se reintenta.
            conv[k] = {
                leidoHasta: typeof (c as ConversacionMalla).leidoHasta === "number" ? (c as ConversacionMalla).leidoHasta : 0,
                mensajes: mensajes.map((m0) => {
                    // (NEU1107A) Lo que viajaba (archivo o llamada) ya no tiene motor tras recargar.
                    const fase = m0.archivo ? faseTrasRecarga(m0.archivo.fase) : undefined;
                    const m = {
                        ...m0,
                        ...(m0.archivo && fase ? { archivo: { ...m0.archivo, fase } } : {}),
                        ...(m0.registroLlamada ? { registroLlamada: registroTrasRecarga(m0.registroLlamada) } : {}),
                    };
                    return m.estado !== "enviando"
                        ? m
                        : m.urgente
                            ? { ...m, estado: "fallido" as const, aviso: "Se cerró la pestaña mientras salía." }
                            : { ...m, estado: "en-espera" as const, aviso: "Se cerró la pestaña mientras salía: se reintenta." };
                }),
            };
        }
        const vias = o.vias && typeof o.vias === "object" ? (o.vias as Record<string, ViaMensaje>) : {};
        return { v: 1, conv, vias };
    } catch {
        return BANDEJA_VACIA;
    }
}

/** Cuerpo de un mensaje de neurona recibido por la malla o por el canal de la cuenta. */
export interface CuerpoNeurona {
    v: 1;
    mid: string;
    txt: string;
    at?: number;
    de: { n?: string; nom?: string; u?: string };
    para?: { n?: string; u?: string };
    /** (NEU1107A) Archivo anunciado (la transferencia P2P va aparte, por el motor de archivos). */
    adj?: AdjuntoNeurona;
    /** (NEU1107A) Timbre o registro de una llamada. */
    ll?: LlamadaNeurona;
    /** (NEU1107A) Transmisión en vivo anunciada (los trozos van por el canal «neurona-flujo»). */
    fd?: FlujoNeuronaRef;
    /** (MSJ1108C) Cita, formato enriquecido, reloj híbrido y operación firmada (editar/borrar). */
    rp?: RespuestaCitada;
    fmt?: unknown;
    hlc?: string;
    op?: OperacionMensaje;
}

export function leerCuerpoNeurona(x: unknown): CuerpoNeurona | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (typeof o.mid !== "string" || !o.mid || o.mid.length > 80) return null;
    const adj = o.adj === undefined ? null : leerAdjunto(o.adj);
    const ll = o.ll === undefined ? null : leerLlamada(o.ll);
    const fd = o.fd === undefined ? null : leerFlujoRef(o.fd);
    // Un archivo, una llamada o un flujo pueden ir sin texto; un mensaje solo de texto, no.
    const op = o.op === undefined ? null : leerOperacion(o.op);
    const rp = o.rp === undefined ? null : leerRespuesta(o.rp);
    const fmt = o.fmt === undefined ? null : leerFormatoMalla(o.fmt);
    const conDatos = !!(adj || ll || fd || op);
    if (typeof o.txt !== "string" || o.txt.length > 4000 || (!conDatos && !o.txt.trim())) return null;
    const de = (o.de && typeof o.de === "object" ? o.de : {}) as Record<string, unknown>;
    const para = (o.para && typeof o.para === "object" ? o.para : {}) as Record<string, unknown>;
    const corto = (v: unknown, n = 80) => (typeof v === "string" && v.length <= n ? v : undefined);
    return {
        v: 1,
        mid: o.mid,
        txt: o.txt,
        at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : undefined,
        de: { n: corto(de.n), nom: corto(de.nom, 60), u: corto(de.u) },
        para: { n: corto(para.n), u: corto(para.u) },
        ...(adj ? { adj } : {}),
        ...(ll ? { ll } : {}),
        ...(fd ? { fd } : {}),
        ...(rp ? { rp } : {}),
        ...(fmt ? { fmt } : {}),
        ...(typeof o.hlc === "string" && o.hlc.length <= 120 ? { hlc: o.hlc } : {}),
        ...(op ? { op } : {}),
    };
}

/** Cuerpo de un chat (1:1 o grupo) que viaja solo por la malla. */
export interface CuerpoChatMalla {
    v: 1;
    mid: string;
    h: string;
    txt: string;
    at?: number;
    de: { u?: string };
    /** (NEU1107A) Archivo por la malla en un chat o grupo (los trozos van por el motor de archivos). */
    adj?: AdjuntoNeurona;
    /** (NEU1107A) Llamada directa por el enlace sin internet en un chat (su burbuja). */
    ll?: LlamadaNeurona;
    /** (MSJ1108C) Cita, formato enriquecido, reloj híbrido y operación firmada (editar/borrar). */
    rp?: RespuestaCitada;
    fmt?: unknown;
    hlc?: string;
    op?: OperacionMensaje;
}

export function leerCuerpoChatMalla(x: unknown): CuerpoChatMalla | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (typeof o.mid !== "string" || !o.mid || o.mid.length > 80) return null;
    if (typeof o.h !== "string" || !o.h || o.h.length > 80) return null;
    const adj = o.adj === undefined ? null : leerAdjunto(o.adj);
    const ll = o.ll === undefined ? null : leerLlamada(o.ll);
    const op = o.op === undefined ? null : leerOperacion(o.op);
    const rp = o.rp === undefined ? null : leerRespuesta(o.rp);
    const fmt = o.fmt === undefined ? null : leerFormatoMalla(o.fmt);
    if (typeof o.txt !== "string" || o.txt.length > 4000 || (!adj && !ll && !op && !o.txt.trim())) return null;
    const de = (o.de && typeof o.de === "object" ? o.de : {}) as Record<string, unknown>;
    return {
        v: 1,
        mid: o.mid,
        h: o.h,
        txt: o.txt,
        at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : undefined,
        de: { u: typeof de.u === "string" && de.u.length <= 80 ? de.u : undefined },
        ...(adj ? { adj } : {}),
        ...(ll ? { ll } : {}),
        ...(rp ? { rp } : {}),
        ...(fmt ? { fmt } : {}),
        ...(typeof o.hlc === "string" && o.hlc.length <= 120 ? { hlc: o.hlc } : {}),
        ...(op ? { op } : {}),
    };
}

/**
 * Clave de la conversación de un mensaje de neurona entrante: si viene de OTRA cuenta, una
 * conversación por cuenta (`c:<uid>`); si es de la mía, una por neurona (`n:<id>`).
 */
export function claveEntrante(c: CuerpoNeurona, miUid: string | null): string | null {
    if (c.de.u && miUid && c.de.u !== miUid) return `c:${c.de.u}`;
    if (c.de.n) return `n:${c.de.n}`;
    if (c.de.u && c.de.u !== miUid) return `c:${c.de.u}`;
    return null;
}
