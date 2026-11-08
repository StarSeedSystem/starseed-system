/**
 * cifrado-archivo — cifrado de archivo de PUNTA A PUNTA, independiente del camino (MPT1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/red-sin-dependencias.md` §5.2. Puro: solo WebCrypto, sin red ni DOM.
 *
 *  · Cada transferencia tiene una CLAVE DE CONTENIDO aleatoria de 256 bits (AES-256-GCM).
 *  · Cada trozo se sella con esa clave. Nonce de 12 bytes = 4 bytes derivados del id de la transferencia
 *    (SHA-256) + índice del trozo en 8 bytes: único por (clave, trozo), sin estado ni contador compartido
 *    entre caminos. AAD = «ss-arch-v1|id|índice|total|longitud en claro»: un trozo no se puede reordenar,
 *    cambiar por el de otra transferencia ni truncar sin que el tag falle.
 *  · La clave viaja SOLO dentro de la oferta, y la oferta entera va cifrada para el receptor con las
 *    primitivas de `recipient-crypto` (ECDH P-256 efímero → HKDF-SHA256 → AES-GCM-256): un sobre por
 *    neurona destinataria (misma cuenta o un grupo), cada uno con su par efímero.
 *  · Dentro del sobre va también el MANIFIESTO (nombre, tamaño, mime, nº de trozos, SHA-256 del archivo en
 *    claro) firmado por el remitente (`mesh-identity.signContent`). Quien reenvía (relé, router, servidor,
 *    neurona intermedia) solo ve el id, índices y longitudes de texto cifrado.
 *  · El receptor comprueba el tag de cada trozo al llegar y, al final, el SHA-256 del archivo (lo hace
 *    `archivos-malla`): el archivo solo se da por «Verificado» completo.
 *
 * Nunca lanza: todo fallo es `null`.
 */

import { decryptEnvelopeFor, decryptEnvelopeWith, encryptEnvelopeForMany, type RecipientEnvelope } from "@/ai/astraura/mesh/recipient-crypto";
import { signContent, verifyContent } from "@/ai/astraura/mesh/mesh-identity";

/** Capacidad que un aparato anuncia cuando sabe recibir/enviar archivos cifrados de punta a punta. */
export const CAPACIDAD_CIFRADO_ARCHIVO = "archivo.e2e.v1";
/** Bytes que añade el tag GCM a cada trozo. */
export const BYTES_TAG_GCM = 16;
/** Texto de la etiqueta que se enseña cuando el par es antiguo y el archivo viaja sin cifrado propio. */
export const ETIQUETA_SIN_CIFRADO_ARCHIVO = "sin cifrado de archivo";
/** Tipo de mensaje de la oferta cifrada. */
export const TIPO_OFERTA_CIFRADA = "archivo.oferta.cif";

const ENC = new TextEncoder();

function subtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

/** ¿El par anuncia el cifrado de archivo? (lista de capacidades de su anuncio). */
export function parCifraArchivo(caps: readonly string[] | null | undefined): boolean {
  return Array.isArray(caps) && caps.includes(CAPACIDAD_CIFRADO_ARCHIVO);
}

export function aB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function deB64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/* ───────────────────────── Clave de contenido y trozos ───────────────────────── */

export interface ClaveContenido {
  /** La clave AES-256 cruda (32 bytes): solo para envolverla en la oferta. */
  raw: Uint8Array;
  key: CryptoKey;
  /** 4 bytes derivados del id de la transferencia (prefijo del nonce). */
  prefijo: Uint8Array;
}

async function prefijoNonce(id: string): Promise<Uint8Array | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const h = await s.digest("SHA-256", ENC.encode(`starseed-archivo-nonce-v1|${id}`));
    return new Uint8Array(h).slice(0, 4);
  } catch {
    return null;
  }
}

/** Importa una clave cruda (de 32 bytes) como clave de contenido de la transferencia `id`. */
export async function importarClaveContenido(id: string, raw: Uint8Array): Promise<ClaveContenido | null> {
  const s = subtle();
  if (!s || raw.length !== 32) return null;
  try {
    const key = await s.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const prefijo = await prefijoNonce(id);
    return prefijo ? { raw: raw.slice(), key, prefijo } : null;
  } catch {
    return null;
  }
}

/** Clave de contenido nueva y aleatoria (256 bits) para la transferencia `id`. */
export async function crearClaveContenido(id: string): Promise<ClaveContenido | null> {
  try {
    return await importarClaveContenido(id, globalThis.crypto.getRandomValues(new Uint8Array(32)));
  } catch {
    return null;
  }
}

/** Nonce de 12 bytes del trozo `index`: prefijo del id (4) + índice (8, big-endian). */
export function nonceTrozo(prefijo: Uint8Array, index: number): Uint8Array {
  const n = new Uint8Array(12);
  n.set(prefijo.subarray(0, 4), 0);
  const dv = new DataView(n.buffer);
  dv.setUint32(4, Math.floor(index / 0x1_0000_0000) >>> 0, false);
  dv.setUint32(8, index >>> 0, false);
  return n;
}

/** Datos autenticados del trozo: id, índice, total y longitud en claro. */
export function aadTrozo(id: string, index: number, total: number, longitudClaro: number): Uint8Array {
  return ENC.encode(`ss-arch-v1|${id}|${index}|${total}|${longitudClaro}`);
}

/** Sella un trozo: devuelve el texto cifrado + tag (longitud = claro + 16). Null si falla. */
export async function sellarTrozo(c: ClaveContenido, id: string, index: number, total: number, claro: ArrayBuffer): Promise<ArrayBuffer | null> {
  const s = subtle();
  if (!s || !Number.isInteger(index) || index < 0 || !Number.isInteger(total) || index >= total) return null;
  try {
    return await s.encrypt(
      { name: "AES-GCM", iv: nonceTrozo(c.prefijo, index) as BufferSource, additionalData: aadTrozo(id, index, total, claro.byteLength) as BufferSource, tagLength: 128 },
      c.key,
      claro,
    );
  } catch {
    return null;
  }
}

/**
 * Abre un trozo. Null si el tag no casa: trozo manipulado, de otro índice, de otra transferencia, de otro
 * total, truncado o con la clave equivocada.
 */
export async function abrirTrozo(c: ClaveContenido, id: string, index: number, total: number, cifrado: ArrayBuffer): Promise<ArrayBuffer | null> {
  const s = subtle();
  if (!s || !Number.isInteger(index) || index < 0 || !Number.isInteger(total) || index >= total || cifrado.byteLength < BYTES_TAG_GCM) return null;
  try {
    return await s.decrypt(
      {
        name: "AES-GCM",
        iv: nonceTrozo(c.prefijo, index) as BufferSource,
        additionalData: aadTrozo(id, index, total, cifrado.byteLength - BYTES_TAG_GCM) as BufferSource,
        tagLength: 128,
      },
      c.key,
      cifrado,
    );
  } catch {
    return null;
  }
}

/* ───────────────────────── Oferta cifrada para el receptor ───────────────────────── */

/** Manifiesto firmado: lo que el receptor puede comprobar contra la oferta y contra el archivo final. */
export interface ManifiestoArchivo {
  v: 1;
  id: string;
  nombre: string;
  tamano: number;
  tipo: string;
  trozos: number;
  tamanoTrozo: number;
  /** SHA-256 del archivo en claro. */
  sha256: string;
}

export interface FirmaManifiesto {
  /** Firma (base64) del manifiesto. */
  s: string;
  /** Pública del firmante (JWK). */
  k: JsonWebKey;
  /** Huella del firmante. */
  f: string;
}

/** Lo que va DENTRO del sobre cifrado (nada de esto lo ve quien reenvía). */
interface PaqueteOferta {
  v: 1;
  /** La oferta original (`archivo.oferta`), tal cual la produjo el motor. */
  oferta: Record<string, unknown>;
  /** Clave de contenido (base64, 32 bytes). */
  clave: string;
  manifiesto: ManifiestoArchivo;
  firma?: FirmaManifiesto;
}

/** Mensaje que viaja por la red en lugar de `archivo.oferta`: solo id y sobres. */
export interface MsgOfertaCifrada {
  t: typeof TIPO_OFERTA_CIFRADA;
  v: 1;
  id: string;
  /** Un sobre v:3 por neurona destinataria. */
  sobres: RecipientEnvelope[];
}

export interface DestinatarioArchivo {
  /** Pública ECDH P-256 de cifrado de la neurona destinataria (JWK). */
  pub: JsonWebKey;
  rfp?: string;
}

export type FirmarFn = (cuerpo: unknown) => Promise<FirmaManifiesto | null>;
export type VerificarFn = (cuerpo: unknown, firmaB64: string, pub: JsonWebKey) => Promise<boolean>;
export type AbrirSobreFn = (env: RecipientEnvelope) => Promise<unknown | null>;

/** Abridor por defecto: la privada ECDH persistida de ESTA neurona. */
export const abrirSobrePropio: AbrirSobreFn = (env) => decryptEnvelopeFor(env);
/** Abridor con una privada concreta (pruebas y neuronas con varias identidades). */
export function abrirSobreCon(privKey: CryptoKey): AbrirSobreFn {
  return (env) => decryptEnvelopeWith(env, privKey);
}

export function manifiestoDeOferta(oferta: Record<string, unknown>): ManifiestoArchivo | null {
  const { id, nombre, tipo, tamano, sha256, trozos, tamanoTrozo } = oferta as Record<string, unknown>;
  if (typeof id !== "string" || typeof nombre !== "string" || typeof sha256 !== "string") return null;
  if (typeof tamano !== "number" || typeof trozos !== "number" || typeof tamanoTrozo !== "number") return null;
  return { v: 1, id, nombre, tamano, tipo: typeof tipo === "string" ? tipo : "", trozos, tamanoTrozo, sha256 };
}

const firmarPorDefecto: FirmarFn = async (cuerpo) => {
  const r = await signContent(cuerpo);
  return r ? { s: r.s, k: r.k, f: r.f } : null;
};
const verificarPorDefecto: VerificarFn = (cuerpo, s, pub) => verifyContent(cuerpo, s, pub);

/**
 * Sella la oferta: la mete con la clave y el manifiesto firmado en un sobre cifrado para CADA destinatario.
 * Null si no hay destinatarios válidos o falla el cifrado (entonces NO se manda nada en claro).
 */
export async function sellarOferta(
  oferta: Record<string, unknown>,
  clave: ClaveContenido,
  destinatarios: DestinatarioArchivo[],
  opts: { firmar?: FirmarFn | null } = {},
): Promise<MsgOfertaCifrada | null> {
  const manifiesto = manifiestoDeOferta(oferta);
  if (!manifiesto || !destinatarios.length) return null;
  try {
    const firmar = opts.firmar === undefined ? firmarPorDefecto : opts.firmar;
    const firma = firmar ? await firmar(manifiesto).catch(() => null) : null;
    const paquete: PaqueteOferta = { v: 1, oferta, clave: aB64(clave.raw), manifiesto, ...(firma ? { firma } : {}) };
    const sobres = await encryptEnvelopeForMany(destinatarios, paquete);
    if (!sobres.length) return null;
    return { t: TIPO_OFERTA_CIFRADA, v: 1, id: manifiesto.id, sobres };
  } catch {
    return null;
  }
}

export interface OfertaAbierta {
  oferta: Record<string, unknown>;
  clave: ClaveContenido;
  manifiesto: ManifiestoArchivo;
  /** Huella del remitente si firmó y la firma es válida; null si la oferta no venía firmada. */
  firmante: { fp: string; pub: JsonWebKey } | null;
}

/** ¿Esto parece una oferta cifrada? (comprobación barata, sin descifrar). */
export function esOfertaCifrada(x: unknown): x is MsgOfertaCifrada {
  const m = x as MsgOfertaCifrada | null;
  return !!m && typeof m === "object" && m.t === TIPO_OFERTA_CIFRADA && typeof m.id === "string" && Array.isArray(m.sobres);
}

/**
 * Abre la oferta cifrada con el abridor de ESTA neurona: prueba los sobres hasta que uno abre. Comprueba que
 * el manifiesto firmado coincide con la oferta y con el id, y que la firma (si hay) es válida. Null si no es
 * para esta neurona, si algo no cuadra o si la firma está rota.
 */
export async function abrirOferta(
  msg: unknown,
  opts: { abrir?: AbrirSobreFn; verificar?: VerificarFn | null; maxSobres?: number } = {},
): Promise<OfertaAbierta | null> {
  if (!esOfertaCifrada(msg)) return null;
  const abrir = opts.abrir ?? abrirSobrePropio;
  const verificar = opts.verificar === undefined ? verificarPorDefecto : opts.verificar;
  try {
    let paquete: PaqueteOferta | null = null;
    for (const env of msg.sobres.slice(0, opts.maxSobres ?? 64)) {
      const r = (await abrir(env)) as PaqueteOferta | null;
      if (r && typeof r === "object" && r.v === 1 && typeof r.clave === "string") {
        paquete = r;
        break;
      }
    }
    if (!paquete?.oferta || !paquete.manifiesto) return null;
    const man = paquete.manifiesto;
    const esperado = manifiestoDeOferta(paquete.oferta);
    if (!esperado || man.id !== msg.id || JSON.stringify(esperado) !== JSON.stringify(man)) return null;
    let firmante: OfertaAbierta["firmante"] = null;
    if (paquete.firma) {
      if (!verificar || !(await verificar(man, paquete.firma.s, paquete.firma.k))) return null;
      firmante = { fp: paquete.firma.f, pub: paquete.firma.k };
    }
    const raw = deB64(paquete.clave);
    const clave = raw ? await importarClaveContenido(man.id, raw) : null;
    return clave ? { oferta: paquete.oferta, clave, manifiesto: man, firmante } : null;
  } catch {
    return null;
  }
}
