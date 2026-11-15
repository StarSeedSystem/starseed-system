/**
 * Control entre mis neuronas · el cuerpo SELLADO de punta a punta (ORD1114Q · contrato
 * `control-remoto-entre-neuronas.md` §1 caso D y §2.2).
 *
 * Se usa la misma capa de sellado que `CanalSellado` (MPT1108B): el sobre por destinatario v:3 de
 * `recipient-crypto.ts` (ECDH P-256 efímero → HKDF → AES-GCM-256), con la pública de cifrado de la neurona
 * destino que resuelve `archivo-seguro-real.destinatariosReales` (vivo → instantánea → certificado →
 * servidor). `CanalSellado` envuelve un canal de ARCHIVOS (oferta + trozos); una orden es un mensaje
 * suelto, así que aquí se sella el mensaje entero con el mismo sobre, sin pasar por el motor de archivos.
 *
 *   orden    → { t:"control.sellado", v:1, s:<sobre v:3 con { v:1, orden:<orden firmada>, kr:<clave de respuesta> }> }
 *   respuesta→ { t:"control.respuesta", v:1, n:<nonce>, iv, ct }   (AES-GCM-256 con `kr`, AAD = etiqueta + nonce)
 *
 * Un relé (o la capa de conciencia) transporta pero no lee ni forja: la orden va dentro del sobre (solo la
 * abre la privada de la neurona destino) y además firmada por aparato; la respuesta solo la puede escribir
 * quien abrió el sobre (tiene `kr`, de un solo uso), y va atada a su nonce. Un cuerpo en claro o un sello
 * roto se rechazan sin ejecutar nada. Nunca lanza.
 */

import type { RecipientEnvelope } from "@/ai/astraura/mesh/recipient-crypto";
import { esRespuesta, type RespuestaOrden } from "./orden";

export const TIPO_ORDEN_SELLADA = "control.sellado";
export const TIPO_RESPUESTA_SELLADA = "control.respuesta";
const AAD_RESPUESTA = "starseed/control-neuronas/respuesta/v1|";

export type CifrarSobre = (pub: JsonWebKey, obj: unknown) => Promise<RecipientEnvelope | null>;
export type AbrirSobre = (env: RecipientEnvelope) => Promise<unknown | null>;

export interface OrdenSellada {
    t: typeof TIPO_ORDEN_SELLADA;
    v: 1;
    s: RecipientEnvelope;
}

export interface RespuestaSellada {
    t: typeof TIPO_RESPUESTA_SELLADA;
    v: 1;
    n: string;
    iv: string;
    ct: string;
}

function sutil(): SubtleCrypto | null {
    return globalThis.crypto?.subtle ?? null;
}

function aB64(b: Uint8Array): string {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s);
}

function deB64(t: string): Uint8Array | null {
    try {
        const s = atob(t);
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        return b;
    } catch {
        return null;
    }
}

export function esOrdenSellada(x: unknown): x is OrdenSellada {
    const m = x as OrdenSellada | null;
    return !!m && typeof m === "object" && m.t === TIPO_ORDEN_SELLADA && m.v === 1 && !!m.s && typeof m.s === "object";
}

export function esRespuestaSellada(x: unknown): x is RespuestaSellada {
    const m = x as RespuestaSellada | null;
    return !!m && typeof m === "object" && m.t === TIPO_RESPUESTA_SELLADA && m.v === 1 && typeof m.n === "string" && typeof m.iv === "string" && typeof m.ct === "string";
}

/** Sella la orden firmada para la neurona destino. Null si no hay clave o falla (entonces NO se manda). */
export async function sellarOrden(orden: unknown, pubDestino: JsonWebKey | null | undefined, cifrar: CifrarSobre): Promise<{ mensaje: OrdenSellada; kr: Uint8Array } | null> {
    if (!pubDestino) return null;
    try {
        const kr = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const s = await cifrar(pubDestino, { v: 1, orden, kr: aB64(kr) });
        return s ? { mensaje: { t: TIPO_ORDEN_SELLADA, v: 1, s }, kr } : null;
    } catch {
        return null;
    }
}

export type AperturaOrden = { ok: true; orden: unknown; kr: Uint8Array } | { ok: false; motivo: "sin-sellar" | "sellado-roto" };

/** Abre lo que llegó por el canal. En claro → «sin-sellar»; sobre que no abre o sin forma → «sellado-roto». */
export async function abrirOrden(msg: unknown, abrir: AbrirSobre): Promise<AperturaOrden> {
    if (!esOrdenSellada(msg)) return { ok: false, motivo: "sin-sellar" };
    try {
        const p = (await abrir(msg.s)) as { v?: unknown; orden?: unknown; kr?: unknown } | null;
        const kr = p && p.v === 1 && typeof p.kr === "string" ? deB64(p.kr) : null;
        if (!p || !kr || kr.length !== 32 || p.orden === undefined) return { ok: false, motivo: "sellado-roto" };
        return { ok: true, orden: p.orden, kr };
    } catch {
        return { ok: false, motivo: "sellado-roto" };
    }
}

async function claveAes(kr: Uint8Array, uso: KeyUsage): Promise<CryptoKey | null> {
    const s = sutil();
    if (!s) return null;
    try {
        return await s.importKey("raw", kr as BufferSource, { name: "AES-GCM" }, false, [uso]);
    } catch {
        return null;
    }
}

/** Sella la respuesta con la clave de un solo uso que trajo la orden. Null si falla (no se contesta en claro). */
export async function sellarRespuesta(r: RespuestaOrden, kr: Uint8Array): Promise<RespuestaSellada | null> {
    const k = await claveAes(kr, "encrypt");
    const s = sutil();
    if (!k || !s || !r.nonce) return null;
    try {
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const ct = await s.encrypt(
            { name: "AES-GCM", iv: iv as BufferSource, additionalData: new TextEncoder().encode(AAD_RESPUESTA + r.nonce) as BufferSource },
            k,
            new TextEncoder().encode(JSON.stringify(r)) as BufferSource,
        );
        return { t: TIPO_RESPUESTA_SELLADA, v: 1, n: r.nonce, iv: aB64(iv), ct: aB64(new Uint8Array(ct)) };
    } catch {
        return null;
    }
}

/** Abre una respuesta sellada para el nonce que se espera. Null si no casa (manipulada, otra clave, otro nonce). */
export async function abrirRespuesta(msg: unknown, kr: Uint8Array, nonce: string): Promise<RespuestaOrden | null> {
    if (!esRespuestaSellada(msg) || msg.n !== nonce) return null;
    const k = await claveAes(kr, "decrypt");
    const s = sutil();
    const iv = deB64(msg.iv);
    const ct = deB64(msg.ct);
    if (!k || !s || !iv || !ct) return null;
    try {
        const claro = await s.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: new TextEncoder().encode(AAD_RESPUESTA + nonce) as BufferSource }, k, ct as BufferSource);
        const r = JSON.parse(new TextDecoder().decode(claro)) as unknown;
        return esRespuesta(r) && r.nonce === nonce ? r : null;
    } catch {
        return null;
    }
}
