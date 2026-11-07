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
    // Un duplicado entrante (llegó por dos caminos) no pisa al primero.
    if (previo && m.dir === "entra" && previo.dir === "entra") return e;
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
                mensajes: mensajes.map((m) =>
                    m.estado === "enviando" ? { ...m, estado: "en-espera" as const, aviso: "Se cerró la pestaña mientras salía: se reintenta." } : m,
                ),
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
}

export function leerCuerpoNeurona(x: unknown): CuerpoNeurona | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (typeof o.mid !== "string" || !o.mid || o.mid.length > 80) return null;
    if (typeof o.txt !== "string" || !o.txt.trim() || o.txt.length > 4000) return null;
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
}

export function leerCuerpoChatMalla(x: unknown): CuerpoChatMalla | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (typeof o.mid !== "string" || !o.mid || o.mid.length > 80) return null;
    if (typeof o.h !== "string" || !o.h || o.h.length > 80) return null;
    if (typeof o.txt !== "string" || !o.txt.trim() || o.txt.length > 4000) return null;
    const de = (o.de && typeof o.de === "object" ? o.de : {}) as Record<string, unknown>;
    return {
        v: 1,
        mid: o.mid,
        h: o.h,
        txt: o.txt,
        at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : undefined,
        de: { u: typeof de.u === "string" && de.u.length <= 80 ? de.u : undefined },
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
