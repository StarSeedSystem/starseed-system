/**
 * sellado-contenido — contenido sellado DETERMINISTA para ámbitos privado, grupo y comunidad
 * (ENJ1110A · 2026-11-10). Contrato: `architecture/enjambre-datos.md` §4.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Idea: el árbol de Merkle se calcula sobre el TEXTO CIFRADO. Cualquiera que lo tenga (otra neurona, un servidor
 * propio, el relé de StarSeed, un relé ciego de terceros) puede verificar cada trozo contra la raíz y volver a
 * sembrarlo SIN poder leerlo. Para que la raíz sea la misma en todas partes, el sellado es determinista.
 *
 * Diferencias con `cifrado-archivo.ts` (que no se toca; allí la clave y el nonce están atados al id de una
 * TRANSFERENCIA y el texto cifrado es distinto cada vez):
 *  · Clave de contenido aleatoria de 256 bits, UNA por contenido (y por versión). Es un SECRETO DE UN SOLO USO: no se
 *    vuelve a sellar otro texto con la misma clave (con AES-GCM, repetir nonce con claves iguales lo rompería).
 *    Por eso la API de alto nivel genera ella la clave y no hay «sellar con esta clave y este nonce» expuesto.
 *  · Nonce de 12 bytes = HMAC-SHA256(clave, «ss-enj-nonce-v1|índice»)[0..12]: depende de la clave y del índice
 *    de la pieza, no de ninguna transferencia ni contador.
 *  · AAD = «ss-enj-v1|índice|total|longitud en claro»: una pieza no se puede reordenar, truncar, duplicar ni
 *    pasar a otro contenido de otro tamaño sin que el tag falle. (No incluye la raíz: es función del texto cifrado.)
 *  · Pieza sellada i = sellar(claro[i·(U−16) .. ]) → U bytes (la última, menos) = ancho de pieza del árbol. Así cada
 *    pieza del árbol es exactamente un sellado independiente y se puede abrir sin las demás.
 *  · La clave viaja envuelta por destinatario con el sobre que ya existe (`recipient-crypto`, vía `GanchosSobre`
 *    que ENJ1110B enchufa); nunca en el imán, nunca en un anuncio.
 *  · El id del enjambre en el cable es HMAC(secreto del enjambre, raíz): quien no es miembro no puede ni reconocer
 *    que se habla de un contenido que conoce.
 * Solo WebCrypto. Nunca lanza: todo fallo es null.
 */

import { aB64, aBytes, aHex, deB64, esObjeto, hex64, hmacSha256, sha256, subtle } from "./util";

export const BYTES_TAG = 16;
const DOM_NONCE = "ss-enj-nonce-v1|";
const DOM_META = "ss-enj-meta-v1|";

export interface ClaveSellado {
  /** 32 bytes crudos: solo para envolverlos para los destinatarios. */
  raw: Uint8Array;
  aes: CryptoKey;
  hmac: CryptoKey;
}

export async function importarClaveSellado(raw: Uint8Array): Promise<ClaveSellado | null> {
  if (raw.length !== 32) return null;
  try {
    const aes = await subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const hmac = await subtle().importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return { raw: raw.slice(), aes, hmac };
  } catch {
    return null;
  }
}

export async function crearClaveSellado(): Promise<ClaveSellado | null> {
  try {
    return await importarClaveSellado(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  } catch {
    return null;
  }
}

/** Secreto del enjambre (32 bytes aleatorios): separado de la clave de contenido a propósito. */
export function crearSecretoEnjambre(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

async function nonceDe(c: ClaveSellado, dominio: string, etiqueta: string): Promise<Uint8Array> {
  const m = await subtle().sign("HMAC", c.hmac, aBytes(dominio + etiqueta) as BufferSource);
  return new Uint8Array(m).slice(0, 12);
}

export function aadPieza(indice: number, total: number, longitudClaro: number): Uint8Array {
  return aBytes(`ss-enj-v1|${indice}|${total}|${longitudClaro}`);
}

/** Cuántos bytes de claro caben en una pieza sellada de `tamanoPieza` bytes. */
export function claroPorPieza(tamanoPieza: number): number {
  return tamanoPieza - BYTES_TAG;
}

/** Plan del sellado de `tamanoClaro` bytes con piezas selladas de `tamanoPieza`: nº de piezas y tamaño del texto cifrado. */
export function planSellado(tamanoClaro: number, tamanoPieza: number): { nPiezas: number; tamanoCifrado: number } | null {
  const cp = claroPorPieza(tamanoPieza);
  if (!Number.isSafeInteger(tamanoClaro) || tamanoClaro < 0 || cp <= 0) return null;
  const nPiezas = Math.max(1, Math.ceil(tamanoClaro / cp));
  return { nPiezas, tamanoCifrado: tamanoClaro + nPiezas * BYTES_TAG };
}

export async function sellarPieza(c: ClaveSellado, indice: number, total: number, claro: Uint8Array): Promise<Uint8Array | null> {
  if (!Number.isInteger(indice) || indice < 0 || !Number.isInteger(total) || indice >= total) return null;
  try {
    const iv = await nonceDe(c, DOM_NONCE, String(indice));
    const r = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadPieza(indice, total, claro.length) as BufferSource, tagLength: 128 }, c.aes, claro as BufferSource);
    return new Uint8Array(r);
  } catch {
    return null;
  }
}

/** Abre una pieza. Null si el tag no casa (manipulada, de otro índice o total, truncada, clave equivocada). */
export async function abrirPieza(c: ClaveSellado, indice: number, total: number, cifrado: Uint8Array): Promise<Uint8Array | null> {
  if (!Number.isInteger(indice) || indice < 0 || !Number.isInteger(total) || indice >= total || cifrado.length < BYTES_TAG) return null;
  try {
    const iv = await nonceDe(c, DOM_NONCE, String(indice));
    const r = await subtle().decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadPieza(indice, total, cifrado.length - BYTES_TAG) as BufferSource, tagLength: 128 }, c.aes, cifrado as BufferSource);
    return new Uint8Array(r);
  } catch {
    return null;
  }
}

/** Sella todo un contenido: devuelve el texto cifrado (el flujo sobre el que se calcula el árbol). */
export async function sellarTodo(c: ClaveSellado, claro: Uint8Array, tamanoPieza: number): Promise<Uint8Array | null> {
  const plan = planSellado(claro.length, tamanoPieza);
  if (!plan) return null;
  const cp = claroPorPieza(tamanoPieza);
  const out = new Uint8Array(plan.tamanoCifrado);
  let o = 0;
  for (let i = 0; i < plan.nPiezas; i++) {
    const s = await sellarPieza(c, i, plan.nPiezas, claro.subarray(i * cp, Math.min(claro.length, (i + 1) * cp)));
    if (!s) return null;
    out.set(s, o);
    o += s.length;
  }
  return out;
}

export async function abrirTodo(c: ClaveSellado, cifrado: Uint8Array, tamanoPieza: number): Promise<Uint8Array | null> {
  if (cifrado.length < BYTES_TAG || tamanoPieza <= BYTES_TAG) return null;
  const n = Math.ceil(cifrado.length / tamanoPieza);
  const partes: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = await abrirPieza(c, i, n, cifrado.subarray(i * tamanoPieza, Math.min(cifrado.length, (i + 1) * tamanoPieza)));
    if (!p) return null;
    partes.push(p);
    total += p.length;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ───────────────────────── Metadatos sellados (nombre, MIME, tamaño en claro) ───────────────────────── */

export interface MetadatosSellados {
  nombre: string;
  mime: string;
  tamanoClaro: number;
  /** Firma del remitente sobre la semilla (la que circula no lleva firma en ámbitos no públicos). */
  firma?: unknown;
}

export async function sellarMetadatos(c: ClaveSellado, raiz: string, m: MetadatosSellados): Promise<string | null> {
  try {
    const iv = await nonceDe(c, DOM_META, raiz);
    const r = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aBytes(DOM_META + raiz) as BufferSource, tagLength: 128 }, c.aes, aBytes(JSON.stringify(m)) as BufferSource);
    return aB64(new Uint8Array(r));
  } catch {
    return null;
  }
}

export async function abrirMetadatos(c: ClaveSellado, raiz: string, meta: string): Promise<MetadatosSellados | null> {
  const b = deB64(meta);
  if (!b) return null;
  try {
    const iv = await nonceDe(c, DOM_META, raiz);
    const r = await subtle().decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aBytes(DOM_META + raiz) as BufferSource, tagLength: 128 }, c.aes, b as BufferSource);
    const j: unknown = JSON.parse(new TextDecoder().decode(r));
    if (!esObjeto(j) || typeof j.nombre !== "string" || typeof j.mime !== "string" || typeof j.tamanoClaro !== "number") return null;
    return { nombre: j.nombre, mime: j.mime, tamanoClaro: j.tamanoClaro, ...(j.firma !== undefined ? { firma: j.firma } : {}) };
  } catch {
    return null;
  }
}

/* ───────────────────────── Id del enjambre en el cable ───────────────────────── */

/**
 * Id del enjambre que viaja en los mensajes. Público: SHA-256 de la raíz con dominio. Privado / grupo / comunidad:
 * HMAC(secreto del enjambre, raíz): sin el secreto no se puede calcular aunque se conozca la raíz.
 */
export async function idEnjambre(raiz: string, secreto?: Uint8Array | null): Promise<string> {
  const r = hex64(raiz);
  if (!r) throw new Error("enjambre: raíz inválida");
  if (secreto && secreto.length >= 16) return aHex(await hmacSha256(secreto, aBytes("ss-enj-id-v1|" + r)));
  return aHex(await sha256(aBytes("ss-enj-id-pub-v1|" + r)));
}

/* ───────────────────────── Envoltura de la clave por destinatario ───────────────────────── */

/** Lo que va DENTRO del sobre de cada destinatario. */
export interface PaqueteClave {
  v: 1;
  raiz: string;
  /** Clave de contenido, base64. */
  clave: string;
  /** Secreto del enjambre, base64. */
  secreto: string;
}

/**
 * Gancho hacia `recipient-crypto` (ENJ1110B: `encryptEnvelopeForMany` y `decryptEnvelopeFor`). El motor no
 * importa esos módulos: sus pruebas inyectan un envoltorio de mentira y el real se enchufa al cablear.
 */
export interface GanchosSobre {
  envolver(destinatarios: readonly unknown[], carga: unknown): Promise<unknown[] | null>;
  abrir(sobre: unknown): Promise<unknown | null>;
}

export async function envolverClave(g: GanchosSobre, destinatarios: readonly unknown[], raiz: string, clave: ClaveSellado, secreto: Uint8Array): Promise<unknown[] | null> {
  if (!destinatarios.length || !hex64(raiz)) return null;
  const paquete: PaqueteClave = { v: 1, raiz: raiz.toLowerCase(), clave: aB64(clave.raw), secreto: aB64(secreto) };
  try {
    const s = await g.envolver(destinatarios, paquete);
    return s && s.length ? s : null;
  } catch {
    return null;
  }
}

/** Abre el primer sobre que sea para esta neurona y devuelve clave y secreto ya listos. */
export async function abrirPaqueteClave(g: GanchosSobre, sobres: readonly unknown[], raizEsperada: string): Promise<{ clave: ClaveSellado; secreto: Uint8Array } | null> {
  for (const s of sobres) {
    try {
      const p = await g.abrir(s);
      if (!esObjeto(p) || p.v !== 1 || hex64(p.raiz) !== raizEsperada.toLowerCase()) continue;
      const raw = typeof p.clave === "string" ? deB64(p.clave) : null;
      const sec = typeof p.secreto === "string" ? deB64(p.secreto) : null;
      if (!raw || !sec) continue;
      const clave = await importarClaveSellado(raw);
      if (clave) return { clave, secreto: sec };
    } catch {
      /* siguiente sobre */
    }
  }
  return null;
}
