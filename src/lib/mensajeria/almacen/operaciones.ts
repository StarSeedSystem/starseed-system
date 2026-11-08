/**
 * Ediciones y borrados como OPERACIONES FIRMADAS por el autor (MSJ1108C · F1, contrato §6).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Un mensaje solo se añade; editarlo o borrarlo es otra operación, firmada con una clave ECDSA P-256
 * de la neurona del autor. Viaja por el mismo canal que el mensaje (chat-malla o neurona), se guarda
 * y se reenvía como cualquier otro cuerpo, y llega al mismo estado en todos los aparatos:
 *   · última por reloj híbrido gana entre ediciones; borrar domina siempre (lápida);
 *   · solo vale si el autor de la operación es el autor del mensaje y la firma es correcta;
 *   · si la operación llega antes que el mensaje, espera (`pendientes`) y se aplica al llegar.
 * La clave pública viaja en la operación y se fija la primera vez que se ve para esa cuenta (TOFU,
 * hasta 8 por cuenta). Cuando F0 emita el certificado cuenta → neurona, la verificación exigirá que
 * la clave esté certificada y el TOFU desaparece. PURO salvo `crearFirmante` (WebCrypto).
 */

import { compararHlc } from "./reloj-hibrido";
import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";

export type TipoOperacion = "editar" | "borrar";

export interface OperacionMensaje {
    v: 1;
    t: TipoOperacion;
    /** Id del mensaje afectado. */
    mid: string;
    /** Conversación como la ve el emisor: hilo (`dm`) o neurona. Informativo. */
    h?: string;
    /** Cuenta (o, sin cuenta, neurona) que firma. */
    autor: string;
    hlc: string;
    /** Texto nuevo (solo «editar»). */
    txt?: string;
    /** Clave pública ECDSA P-256 (raw, base64). */
    pub: string;
    /** Firma ECDSA SHA-256 (raw r||s, base64). */
    firma: string;
}

export const MAX_TEXTO_OP = 4000;
export const MAX_CLAVES_POR_AUTOR = 8;

/** Texto exacto que se firma. */
export function datosAFirmar(op: Pick<OperacionMensaje, "v" | "t" | "mid" | "h" | "autor" | "hlc" | "txt">): string {
    return JSON.stringify([op.v, op.t, op.mid, op.h ?? null, op.autor, op.hlc, op.txt ?? null]);
}

export function leerOperacion(x: unknown): OperacionMensaje | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    const corto = (v: unknown, n: number) => (typeof v === "string" && v.length > 0 && v.length <= n ? v : null);
    if ((o.t !== "editar" && o.t !== "borrar") || o.v !== 1) return null;
    const mid = corto(o.mid, 80);
    const autor = corto(o.autor, 80);
    const hlc = corto(o.hlc, 120);
    const pub = corto(o.pub, 200);
    const firma = corto(o.firma, 200);
    if (!mid || !autor || !hlc || !pub || !firma) return null;
    if (o.t === "editar" && (typeof o.txt !== "string" || !o.txt.trim() || o.txt.length > MAX_TEXTO_OP)) return null;
    const h = typeof o.h === "string" && o.h.length <= 80 ? o.h : undefined;
    return { v: 1, t: o.t, mid, ...(h ? { h } : {}), autor, hlc, ...(o.t === "editar" ? { txt: o.txt as string } : {}), pub, firma };
}

/* ═══════════════════════════ Firma (WebCrypto) ═══════════════════════════ */

export interface Firmante {
    pub(): Promise<string>;
    firmar(datos: string): Promise<string>;
}

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const ALG_FIRMA = { name: "ECDSA", hash: "SHA-256" } as const;

function aB64(buf: ArrayBuffer): string {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
}

function deB64(s: string): Uint8Array<ArrayBuffer> {
    const bin = atob(s);
    const b = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
}

interface ParClaves {
    publica: CryptoKey;
    privada: CryptoKey;
}

/** Firmante con un par de claves guardado (sin poder exportar la privada) en el almacén de meta. */
export function crearFirmante(
    guardar: { leer(): Promise<ParClaves | undefined>; escribir(par: ParClaves): Promise<void> },
    subtle: SubtleCrypto = globalThis.crypto.subtle,
): Firmante {
    let par: Promise<ParClaves> | null = null;
    const obtener = () =>
        (par ??= (async () => {
            const previo = await guardar.leer().catch(() => undefined);
            if (previo) return previo;
            const nuevo = (await subtle.generateKey(ALG, false, ["sign", "verify"])) as CryptoKeyPair;
            const p = { publica: nuevo.publicKey, privada: nuevo.privateKey };
            await guardar.escribir(p).catch(() => undefined);
            return p;
        })());
    return {
        async pub() {
            return aB64(await subtle.exportKey("raw", (await obtener()).publica));
        },
        async firmar(datos) {
            return aB64(await subtle.sign(ALG_FIRMA, (await obtener()).privada, new TextEncoder().encode(datos)));
        },
    };
}

export async function firmarOperacion(
    f: Firmante,
    base: { t: TipoOperacion; mid: string; h?: string; autor: string; hlc: string; txt?: string },
): Promise<OperacionMensaje> {
    const sin = { v: 1 as const, ...base };
    const [pub, firma] = await Promise.all([f.pub(), f.firmar(datosAFirmar(sin))]);
    return { ...sin, pub, firma };
}

export async function verificarFirma(op: OperacionMensaje, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<boolean> {
    try {
        const clave = await subtle.importKey("raw", deB64(op.pub), ALG, false, ["verify"]);
        return await subtle.verify(ALG_FIRMA, clave, deB64(op.firma), new TextEncoder().encode(datosAFirmar(op)));
    } catch {
        return false;
    }
}

/* ═══════════════════════════ Aplicar ═══════════════════════════ */

export type ResultadoAplicar =
    | { ok: true; m: MensajeMalla; cambio: boolean }
    | { ok: false; motivo: "firma" | "autor" | "clave" | "antigua" };

export interface ContextoAplicar {
    /** Claves ya fijadas para ese autor; `fijar` añade una (false si ya hay 8 distintas). */
    clavesDe(autor: string): string[];
    fijar(autor: string, pub: string): void;
}

/** Cuenta o neurona que escribió el mensaje, tal como la firma la nombra. */
export function autorDelMensaje(m: MensajeMalla, miUid: string | null, miNeurona: string): string | null {
    if (m.dir === "sale") return miUid ?? (miNeurona || null);
    return m.deUid ?? m.deNeurona ?? null;
}

/**
 * Aplica una operación a un mensaje. No cambia nada si la firma, el autor o la clave no valen. Las
 * ediciones respetan el reloj (la más reciente gana) y un mensaje borrado no se reedita.
 */
export async function aplicarOperacion(
    m: MensajeMalla,
    op: OperacionMensaje,
    quien: { miUid: string | null; miNeurona: string },
    ctx: ContextoAplicar,
    subtle?: SubtleCrypto,
): Promise<ResultadoAplicar> {
    if (!(await verificarFirma(op, subtle))) return { ok: false, motivo: "firma" };
    const autor = autorDelMensaje(m, quien.miUid, quien.miNeurona);
    if (!autor || autor !== op.autor) return { ok: false, motivo: "autor" };
    const claves = ctx.clavesDe(op.autor);
    if (!claves.includes(op.pub)) {
        if (claves.length >= MAX_CLAVES_POR_AUTOR) return { ok: false, motivo: "clave" };
        ctx.fijar(op.autor, op.pub);
    }
    if (m.borrado) return { ok: true, m, cambio: false };
    if (op.t === "borrar") {
        return { ok: true, cambio: true, m: { ...m, borrado: true, borradoHlc: op.hlc, texto: "", respuestaA: undefined, formato: undefined, adjunto: undefined } };
    }
    if (m.opHlc && compararHlc(op.hlc, m.opHlc) <= 0) return { ok: false, motivo: "antigua" };
    return { ok: true, cambio: true, m: { ...m, texto: op.txt ?? m.texto, opHlc: op.hlc, editadoEn: horaDeHlc(op.hlc) } };
}

function horaDeHlc(h: string): number {
    const ms = Number(h.slice(0, 13));
    return Number.isFinite(ms) ? ms : Date.now();
}

/** Operaciones llegadas antes que su mensaje: se guardan por id de mensaje. */
export type OpsPendientes = Record<string, OperacionMensaje[]>;
export const MAX_PENDIENTES = 200;

export function anadirPendiente(p: OpsPendientes, op: OperacionMensaje): OpsPendientes {
    const lista = [...(p[op.mid] ?? []).filter((x) => x.hlc !== op.hlc), op].slice(-8);
    const nuevo = { ...p, [op.mid]: lista };
    const ids = Object.keys(nuevo);
    if (ids.length > MAX_PENDIENTES) delete nuevo[ids[0]];
    return nuevo;
}
