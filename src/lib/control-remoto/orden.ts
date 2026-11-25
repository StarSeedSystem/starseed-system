/**
 * Control entre mis neuronas · anatomía de una orden, su forma y su verificación ECDSA (ORD1114P ·
 * contrato `control-remoto-entre-neuronas.md` §2.1).
 *
 * Sin `node:*`. La orden la firma la clave por aparato de GEN1114 (`firma-aparato.ts`,
 * `firmarOrdenControl`) sobre los bytes exactos de `JSON.stringify(carga)`; aquí se comprueba la
 * forma y la firma con la clave pública que el DUEÑO del aparato controlado fijó al darle permiso.
 * `aud` separa los dominios: una firma de chat de Genesis nunca vale como orden ni al revés.
 */

import { deB64url } from "@/lib/chats-genesis/firma-aparato";
import { esNivel, type Args, type Nivel } from "./niveles";

export const AUD_CONTROL = "starseed.control-neuronas.v1";
/** Canal de `transporte-universal` por el que viajan órdenes y respuestas. */
export const CANAL_CONTROL = "control-neuronas";
/** Una orden vive como mucho 2 min desde que se firmó (§2.4: `caduca`). */
export const VIDA_ORDEN_MS = 120_000;
/** Reloj de las dos puntas: ±5 min (§2.4, como el timbre de faro). */
export const DESFASE_MAX_MS = 5 * 60_000;
export const MAX_CARGA_ORDEN = 4096;

const RE_HUELLA = /^[0-9a-f]{64}$/;
const RE_NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const RE_SESION = /^[0-9a-f]{32}$/;
const RE_ID = /^[A-Za-z0-9-]{1,100}$/;
const RE_B64 = /^[A-Za-z0-9_-]+$/;

export interface CargaOrden {
    aud: typeof AUD_CONTROL;
    v: 1;
    /** Huella SHA-256 (hex) de la clave pública del aparato que manda. */
    de: string;
    cuenta: string;
    /** Neurona destino (id de `neuron_devices`). */
    para: string;
    nivel: Nivel;
    sesion: string | null;
    seq: number;
    nonce: string;
    t: string;
    caduca: string;
    accion: { nombre: string; args: Args };
}

export interface OrdenFirmada {
    v: 1;
    carga: string;
    firma: string;
}

/** La respuesta del destino (viaja por el mismo canal, sin firmar: solo informa a quien mandó). */
export interface RespuestaOrden {
    tipo: "respuesta";
    nonce: string;
    ok: boolean;
    motivo: string;
    resultado?: unknown;
    /** Detalle adicional del motivo (p. ej. { motivo: "terminado-por-el-dueno" }). */
    detalle?: Record<string, string>;
}

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Lee la carga de una orden firmada: forma estricta o null. Nunca lanza. */
export function leerOrden(x: unknown): { carga: CargaOrden; bytes: Uint8Array<ArrayBuffer>; firma: Uint8Array<ArrayBuffer> } | null {
    try {
        if (!esObjeto(x) || x.v !== 1 || typeof x.carga !== "string" || typeof x.firma !== "string") return null;
        if (!RE_B64.test(x.carga) || !RE_B64.test(x.firma) || x.carga.length > MAX_CARGA_ORDEN * 2) return null;
        const bytes = deB64url(x.carga);
        const firma = deB64url(x.firma);
        if (bytes.length > MAX_CARGA_ORDEN || firma.length !== 64) return null;
        const c = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        if (!esObjeto(c) || c.aud !== AUD_CONTROL || c.v !== 1) return null;
        if (typeof c.de !== "string" || !RE_HUELLA.test(c.de)) return null;
        if (typeof c.cuenta !== "string" || !c.cuenta || c.cuenta.length > 100) return null;
        if (typeof c.para !== "string" || !RE_ID.test(c.para)) return null;
        if (!esNivel(c.nivel)) return null;
        if (c.sesion !== null && (typeof c.sesion !== "string" || !RE_SESION.test(c.sesion))) return null;
        if (typeof c.seq !== "number" || !Number.isSafeInteger(c.seq) || c.seq < 1) return null;
        if (typeof c.nonce !== "string" || !RE_NONCE.test(c.nonce)) return null;
        if (typeof c.t !== "string" || typeof c.caduca !== "string") return null;
        if (!Number.isFinite(Date.parse(c.t)) || !Number.isFinite(Date.parse(c.caduca))) return null;
        if (!esObjeto(c.accion) || typeof c.accion.nombre !== "string" || !esObjeto(c.accion.args)) return null;
        return { carga: c as unknown as CargaOrden, bytes, firma };
    } catch {
        return null;
    }
}

/** Verifica r‖s ECDSA P-256/SHA-256 sobre `bytes` con la pública SPKI (base64url). Nunca lanza. */
export async function verificarFirma(subtle: SubtleCrypto, spki: string, bytes: Uint8Array<ArrayBuffer>, firma: Uint8Array<ArrayBuffer>): Promise<boolean> {
    try {
        const clave = await subtle.importKey("spki", deB64url(spki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        return await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, clave, firma, bytes);
    } catch {
        return false;
    }
}

/** Huella (hex) de una SPKI en base64url: lo que el dueño ve al fijar la clave. */
export async function huellaDeSpki(subtle: SubtleCrypto, spki: string): Promise<string | null> {
    try {
        const d = new Uint8Array(await subtle.digest("SHA-256", deB64url(spki)));
        return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
        return null;
    }
}

export function esRespuesta(x: unknown): x is RespuestaOrden {
    return esObjeto(x) && x.tipo === "respuesta" && typeof x.nonce === "string" && typeof x.ok === "boolean" && typeof x.motivo === "string";
}
