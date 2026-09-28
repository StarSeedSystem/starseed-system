/**
 * Mensajes efímeros del Dibujo-adivina (van por difusión, no se guardan): los intentos de las
 * personas que adivinan y el veredicto de quien dibuja. Todo lo que llega de fuera se sanea.
 *
 * Honestidad: el canal no autentica al remitente y los intentos viajan por él, así que este juego
 * es entre personas de confianza (lo dice la interfaz): quien dibuja hace de árbitro de su ronda.
 */
import { esAcierto, esCercano } from "./palabras";

export const MAX_LARGO_INTENTO = 60;

export interface Intento {
    /** Id del intento (para casarlo con su veredicto). */
    i: string;
    /** Uid de quien lo envía (declarado; el canal no lo garantiza). */
    u: string;
    /** Texto. */
    x: string;
}

export interface Veredicto {
    i: string;
    u: string;
    /** Texto del intento (solo si NO era el acierto: un acierto nunca se repite a los demás). */
    x?: string;
    ok: boolean;
    cerca?: boolean;
}

function texto(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return t.length === 0 ? null : t.slice(0, max);
}

function idCorto(v: unknown): string | null {
    return typeof v === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : null;
}

export function sanearIntento(x: unknown): Intento | null {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
    const o = x as Record<string, unknown>;
    const i = idCorto(o.i);
    const u = texto(o.u, 80);
    const t = texto(o.x, MAX_LARGO_INTENTO);
    if (!i || !u || !t) return null;
    return { i, u, x: t };
}

export function sanearVeredicto(x: unknown): Veredicto | null {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
    const o = x as Record<string, unknown>;
    const i = idCorto(o.i);
    const u = texto(o.u, 80);
    if (!i || !u || typeof o.ok !== "boolean") return null;
    const v: Veredicto = { i, u, ok: o.ok };
    if (!o.ok) {
        const t = texto(o.x, MAX_LARGO_INTENTO);
        if (!t) return null;
        v.x = t;
        if (o.cerca === true) v.cerca = true;
    }
    return v;
}

/** El veredicto de quien dibuja para un intento (sin decidir todavía si el asiento puede acertar). */
export function veredictoDe(intento: Intento, palabra: string): Veredicto {
    if (esAcierto(intento.x, palabra)) return { i: intento.i, u: intento.u, ok: true };
    const v: Veredicto = { i: intento.i, u: intento.u, ok: false, x: intento.x };
    if (esCercano(intento.x, palabra)) v.cerca = true;
    return v;
}
