/**
 * SEN1116A · la señalización de vídeo en partes numeradas (contrato §12).
 *
 * Una oferta o una respuesta SDP real mide 4–6 KB y la orden firmada entera no pasa de 4 KB
 * (`MAX_CARGA_ORDEN`), así que viajan en trozos: un identificador de negociación, parte i de n, el largo total y
 * un resumen SHA-256 (16 hex) que se comprueba al juntarlas. Sin cambiar el sobre ni su firma: cada parte es una
 * orden `pantalla-senal` normal.
 *
 * Topes: PARTE_MAX caracteres por parte, MAX_PARTES partes, MAX_TOTAL_SDP caracteres en total y MAX_NEGOCIACIONES
 * negociaciones a medias a la vez. Lo que no se completa caduca (TTL) y se tira entero al cerrar la sesión.
 */

export const PARTE_MAX = 1800;
export const MAX_PARTES = 12;
export const MAX_TOTAL_SDP = 16_000;
export const MAX_NEGOCIACIONES = 4;
export const TTL_PARTES_MS = 60_000;
export const RE_NEG = /^[a-z0-9]{8,24}$/;
export const RE_SHA = /^[0-9a-f]{16}$/;
/** SDP: texto imprimible y saltos de línea. */
export const RE_SDP_TEXTO = /^[\x20-\x7e\r\n]*$/;

export interface ParteSenal {
    neg: string;
    tipo: "oferta" | "respuesta";
    i: number;
    n: number;
    total: number;
    sha: string;
    datos: string;
}

export async function resumen(texto: string): Promise<string> {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
    return Array.from(d.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function negNueva(): string {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 16).padEnd(8, "0").replace(/[^a-z0-9]/g, "0");
}

/** Parte un texto en trozos; lanza «demasiado-grande» si pasa de los topes. */
export async function trocear(texto: string, tipo: "oferta" | "respuesta", neg = negNueva()): Promise<ParteSenal[]> {
    if (texto.length > MAX_TOTAL_SDP || !RE_SDP_TEXTO.test(texto)) throw new Error("demasiado-grande");
    const n = Math.max(1, Math.ceil(texto.length / PARTE_MAX));
    if (n > MAX_PARTES) throw new Error("demasiado-grande");
    const sha = await resumen(texto);
    return Array.from({ length: n }, (_, i) => ({ neg, tipo, i, n, total: texto.length, sha, datos: texto.slice(i * PARTE_MAX, (i + 1) * PARTE_MAX) }));
}

/** Valida los argumentos de una parte (para la lista cerrada de órdenes). null si no valen. */
export function leerParte(a: Record<string, unknown>): ParteSenal | null {
    const k = Object.keys(a);
    if (k.length !== 7 || !["neg", "tipo", "i", "n", "total", "sha", "datos"].every((x) => k.includes(x))) return null;
    const ent = (x: unknown, lo: number, hi: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;
    if (typeof a.neg !== "string" || !RE_NEG.test(a.neg) || (a.tipo !== "oferta" && a.tipo !== "respuesta")) return null;
    if (!ent(a.n, 1, MAX_PARTES) || !ent(a.i, 0, MAX_PARTES - 1) || a.i >= a.n || !ent(a.total, 10, MAX_TOTAL_SDP)) return null;
    if (typeof a.sha !== "string" || !RE_SHA.test(a.sha)) return null;
    if (typeof a.datos !== "string" || a.datos.length < 1 || a.datos.length > PARTE_MAX || !RE_SDP_TEXTO.test(a.datos)) return null;
    // Todas las partes menos la última miden PARTE_MAX; el total tiene que casar con n.
    if (a.total > a.n * PARTE_MAX || a.total <= (a.n - 1) * PARTE_MAX) return null;
    const esperado = a.i < a.n - 1 ? PARTE_MAX : a.total - (a.n - 1) * PARTE_MAX;
    if (a.datos.length !== esperado) return null;
    return { neg: a.neg, tipo: a.tipo, i: a.i, n: a.n, total: a.total, sha: a.sha, datos: a.datos };
}

interface Montaje {
    tipo: string;
    n: number;
    total: number;
    sha: string;
    partes: (string | undefined)[];
    t: number;
}

/** Junta partes de varias negociaciones a la vez, en cualquier orden. Lanza con un motivo corto. */
export class Reensamblador {
    private m = new Map<string, Montaje>();
    constructor(private readonly ahora: () => number = Date.now) {}

    pendientes(): number {
        this.caducar();
        return this.m.size;
    }

    private caducar(): void {
        const t = this.ahora();
        for (const [k, v] of this.m) if (t - v.t > TTL_PARTES_MS) this.m.delete(k);
    }

    /** Devuelve el texto completo cuando llega la última parte; null si faltan. */
    async meter(p: ParteSenal): Promise<string | null> {
        this.caducar();
        let g = this.m.get(p.neg);
        if (!g) {
            if (this.m.size >= MAX_NEGOCIACIONES) throw new Error("demasiadas-negociaciones");
            g = { tipo: p.tipo, n: p.n, total: p.total, sha: p.sha, partes: new Array(p.n).fill(undefined), t: this.ahora() };
            this.m.set(p.neg, g);
        }
        if (g.tipo !== p.tipo || g.n !== p.n || g.total !== p.total || g.sha !== p.sha) throw new Error("partes-incoherentes");
        const previa = g.partes[p.i];
        if (previa !== undefined && previa !== p.datos) throw new Error("parte-repetida-distinta");
        g.partes[p.i] = p.datos; // una repetida igual no cambia nada
        if (g.partes.some((x) => x === undefined)) return null;
        this.m.delete(p.neg);
        const texto = (g.partes as string[]).join("");
        if (texto.length !== g.total || (await resumen(texto)) !== g.sha) throw new Error("resumen-no-casa");
        return texto;
    }

    limpiar(): void {
        this.m.clear();
    }
}
