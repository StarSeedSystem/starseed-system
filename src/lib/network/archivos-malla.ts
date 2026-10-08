"use client";

/*
 * archivos-malla — Transferencia de ARCHIVOS de cualquier formato por la malla
 * P2P (Ola 369).
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ ES: motor de transferencia punto-a-punto, AGNÓSTICO DE TRANSPORTE — hoy
 * corre sobre el mesh WebRTC compartido de la MISMA cuenta (`webrtc-mesh.ts` +
 * `lan-sync.ts`, ver `architecture/malla-neuronas-autovinculo.md`), y está
 * diseñado para correr, sin tocar este archivo, sobre el futuro canal de
 * PAR entre CUENTAS DISTINTAS (`enviarAPar(vinculoId, data)` /
 * `onMensajeDePar`, del módulo de vínculos consentidos) — ver §"Punto de
 * adaptación" más abajo.
 *
 * PROTOCOLO (JSON, namespace `archivo.*`, un mensaje de control por línea):
 *   remitente → receptor  archivo.oferta    {id, nombre, tipo(mime), tamano, sha256, trozos, destino}
 *   receptor → remitente  archivo.aceptar   {id, desde?}       (desde = reanudar en ese índice)
 *   receptor → remitente  archivo.rechazar  {id, motivo}
 *   remitente → receptor  archivo.chunk     {id, index, datosB64}   (trozo, ver §Codificación)
 *   remitente → receptor  archivo.fin       {id}
 *   receptor → remitente  archivo.ok        {id}               (hash verificado)
 *   receptor → remitente  archivo.error     {id, motivo}        (hash NO coincide, u otro fallo)
 *   cualquiera → otro     archivo.cancelar  {id}
 *
 * CODIFICACIÓN — base64, NO binario crudo (decisión justificada):
 *   El canal `CanalArchivos` (abajo) declara `enviarBinario`/`bufferedAmount`
 *   como OPCIONALES a propósito. Hoy `webrtc-mesh.ts` solo transporta STRINGS
 *   (comparte el MISMO data channel que la ficha de dispositivo, los latidos,
 *   el relay de Astraura 1.58 y la conciencia colectiva — todos JSON/string) y
 *   el futuro canal de PAR entre cuentas es, con toda probabilidad, un relé
 *   (Supabase Realtime/broadcast o similar) que solo transporta JSON — no un
 *   RTCDataChannel propio. Añadir un segundo camino binario en paralelo
 *   (framing binario + `sendBinaryToPeer` + parseo de `ArrayBuffer` en
 *   `onmessage`) habría tocado el núcleo de un archivo compartido con OTRAS
 *   dos áreas trabajando en paralelo (relé de IA genérico y vínculos entre
 *   cuentas) para un beneficio marginal (evitar el +33% de base64), a cambio
 *   de duplicar la superficie de prueba. Se eligió el camino PORTABLE: trozos
 *   de 16 KB en crudo, base64 (`tamanoChunkBase64`, ~21.9 KB ya codificados,
 *   con margen bajo el límite típico de mensaje SCTP/Realtime). La única pieza
 *   que SÍ se tocó en `webrtc-mesh.ts` es aditiva y de coste cero:
 *   `bufferedAmount(deviceId)` (getter sobre `RTCDataChannel.bufferedAmount`,
 *   ya existente en cualquier canal), que permite backpressure REAL con
 *   strings también. `enviarBinario`/`bufferedAmount` quedan como el punto de
 *   extensión documentado para una ola futura que sí quiera ese camino.
 *
 * INTEGRIDAD — lista de hashes (WebCrypto no tiene hash incremental):
 *   Por trozo: `sha256(trozo)`. Hash final = `sha256(concat(hash_0..hash_n))`
 *   — una "raíz" de un solo nivel (lista de hashes / Merkle de una capa), NO
 *   un árbol completo: bastaba para detectar cualquier alteración de
 *   cualquier trozo sin tener que mantener el árbol completo en memoria. El
 *   remitente la calcula ANTES de ofertar (una pasada extra de lectura del
 *   archivo, con memoria acotada al tamaño de un trozo — nunca el archivo
 *   entero) y la anuncia en `archivo.oferta.sha256`; el receptor la recalcula
 *   tras `archivo.fin` sobre lo que ensambló y la compara: si no coincide,
 *   `archivo.error` y borra lo recibido.
 *
 * MEMORIA — nunca el archivo entero en RAM:
 *   Lectura: `Blob.slice(...).arrayBuffer()` por trozo (remitente). Escritura:
 *   cada trozo recibido se guarda YA en almacenamiento (`AlmacenTrozos`) —
 *   OPFS si el navegador lo da (`navigator.storage.getDirectory()`), si no
 *   IndexedDB, si no un mapa en memoria (última red, documentado, solo dura
 *   la pestaña). El Blob final solo se ensambla (`AlmacenTrozos.ensamblar`) al
 *   terminar, para entregarlo a quien lo pidió (abrir/guardar/Biblioteca).
 *
 * POLÍTICAS DE RECEPCIÓN (`PoliticaRecepcion`):
 *   MISMA cuenta → auto-aceptar por defecto (`preferenciaAutoAceptarMismaCuenta()`,
 *   ajustable) o preguntar si el usuario así lo configuró. OTRA cuenta →
 *   SIEMPRE preguntar, y solo si `verificarPermiso()` lo permite — por defecto
 *   `verificarPermisoArchivosPorDefecto()` = `false` (deniega) hasta que el
 *   módulo de vínculos consentidos (`os_mesh_vinculos`, de otra área) exponga
 *   el permiso real. Nunca se auto-acepta de otra cuenta.
 *
 * PUNTO DE ADAPTACIÓN para el canal de PAR entre cuentas (futuro, de otra
 * área — NO se importa nada suyo desde aquí):
 *   const canal: CanalArchivos = {
 *     enviar: (texto) => enviarAPar(vinculoId, texto),
 *     alMensaje: (cb) => onMensajeDePar(vinculoId, (data) => cb(data)),
 *   };
 *   motor.manejarMensaje(canal, data, { mismaCuenta: false, verificarPermiso });
 * No hace falta tocar este archivo para eso — es exactamente para lo que
 * existe `CanalArchivos`.
 */

import { useSyncExternalStore } from "react";
import type { MeshHandle, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { getSharedMesh } from "@/lib/network/lan-sync";
import { saveItem, updateItemContent, type EntityRef } from "@/lib/library/entity-library";
import { uploadFile } from "@/lib/files/os-files";

/* ══════════════════════════ 1) Contrato de canal ══════════════════════════ */

/**
 * CanalArchivos — todo lo que el motor necesita de un transporte concreto.
 * Solo `enviar` y `alMensaje` son obligatorios: cualquier cosa capaz de mandar
 * y recibir texto sirve (mesh WebRTC hoy, relé de PAR mañana). `enviarBinario`
 * y `bufferedAmount` son optimizaciones opcionales (ver cabecera).
 */
export interface CanalArchivos {
  /** Manda texto (normalmente JSON de este protocolo). true si se pudo encolar. */
  enviar(texto: string): boolean;
  /** Opcional: enviar binario crudo si el transporte lo soporta (no usado hoy). */
  enviarBinario?(buf: ArrayBuffer): boolean;
  /** Opcional: bytes en cola sin enviar (para backpressure). Sin esto, no se frena. */
  bufferedAmount?(): number;
  /** Suscribe un callback a los mensajes entrantes. Devuelve función de baja. */
  alMensaje(cb: (data: string | ArrayBuffer) => void): () => void;
}

/* ══════════════════════════ 2) Protocolo (puro) ══════════════════════════ */

export type ModoTransferencia = "base64" | "binario";

export type DestinoArchivoTipo = "dispositivo" | "cerebro" | "biblioteca";

export interface DestinoArchivo {
  tipo: DestinoArchivoTipo;
  /** Id del cerebro/carpeta de biblioteca destino, si aplica. */
  id?: string;
}

export interface MsgOferta {
  t: "archivo.oferta";
  id: string;
  nombre: string;
  /** Mime type. */
  tipo: string;
  tamano: number;
  sha256: string;
  trozos: number;
  /** Tamaño (bytes, en crudo, antes de codificar) de cada trozo — para que el receptor calcule offsets. */
  tamanoTrozo: number;
  destino: DestinoArchivo;
  /** Etiqueta legible de quién ofrece (nombre de dispositivo), para la tarjeta de confirmación. */
  origen?: string;
  /** Modo de transferencia negociado: "binario" = trozos ArrayBuffer sin base64; "base64" = JSON con datosB64 (heredado). */
  modo?: ModoTransferencia;
}
export interface MsgAceptar {
  t: "archivo.aceptar";
  id: string;
  /** Índice del primer trozo que falta (reanudación). Ausente = desde el principio. */
  desde?: number;
  /** Modo de transferencia confirmado por el receptor. */
  modo?: ModoTransferencia;
}
export interface MsgRechazar {
  t: "archivo.rechazar";
  id: string;
  motivo: string;
}
export interface MsgChunk {
  t: "archivo.chunk";
  id: string;
  index: number;
  datosB64: string;
}
export interface MsgFin {
  t: "archivo.fin";
  id: string;
}
export interface MsgOk {
  t: "archivo.ok";
  id: string;
}
export interface MsgError {
  t: "archivo.error";
  id: string;
  motivo: string;
}
export interface MsgCancelar {
  t: "archivo.cancelar";
  id: string;
}

export type ArchivoMallaMsg =
  | MsgOferta
  | MsgAceptar
  | MsgRechazar
  | MsgChunk
  | MsgFin
  | MsgOk
  | MsgError
  | MsgCancelar;

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/** Guard puro: ¿`x` es un mensaje bien formado del protocolo `archivo.*`? */
export function esMensajeArchivoMalla(x: unknown): x is ArchivoMallaMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith("archivo.")) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "archivo.oferta":
      return (
        typeof x.nombre === "string" &&
        typeof x.tipo === "string" &&
        typeof x.tamano === "number" &&
        typeof x.sha256 === "string" &&
        typeof x.trozos === "number" &&
        typeof x.tamanoTrozo === "number" &&
        esObjeto(x.destino) &&
        typeof (x.destino as Record<string, unknown>).tipo === "string"
      );
    case "archivo.aceptar":
      return x.desde === undefined || typeof x.desde === "number";
    case "archivo.rechazar":
    case "archivo.error":
      return typeof x.motivo === "string";
    case "archivo.chunk":
      return typeof x.index === "number" && typeof x.datosB64 === "string";
    case "archivo.fin":
    case "archivo.ok":
    case "archivo.cancelar":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es de este protocolo. */
export function parseArchivoMallaMensaje(raw: string): ArchivoMallaMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeArchivoMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

/* ══════════════════════════ 3) Hash lista + base64 ══════════════════════════ */

async function sha256(buf: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", buf);
}

function bufferAHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

/**
 * calcularHashLista — hash por trozo + hash final sobre la concatenación de
 * los hashes de trozo (ver cabecera, §INTEGRIDAD). `leerTrozo` se llama una
 * vez por índice, en orden; nunca se retienen los TROZOS en memoria, solo sus
 * hashes (32 bytes cada uno).
 */
export async function calcularHashLista(
  leerTrozo: (index: number) => Promise<ArrayBuffer>,
  trozos: number,
): Promise<{ raiz: string }> {
  const hashes: ArrayBuffer[] = [];
  for (let i = 0; i < trozos; i++) {
    const datos = await leerTrozo(i);
    hashes.push(await sha256(datos));
  }
  const raiz = bufferAHex(await sha256(concatArrayBuffers(hashes)));
  return { raiz };
}

/** ArrayBuffer → base64. Usa `Buffer` en Node (pruebas/servidor) o `btoa` en navegador. */
export function bufAB64(buf: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  let binario = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

/** base64 → ArrayBuffer. Espejo de `bufAB64`. */
export function b64ABuf(b64: string): ArrayBuffer {
  if (typeof Buffer !== "undefined") {
    const b = Buffer.from(b64, "base64");
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
  const binario = atob(b64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

/* ══════════════════════════ 3b) Codificación binaria de trozos ══════════════════════════ */

/** Codifica un trozo binario con cabecera: [id_len:u32][id:utf8][index:u32][datos]. */
export function encodeChunkBinario(id: string, index: number, datos: ArrayBuffer): ArrayBuffer {
  const idBytes = new TextEncoder().encode(id);
  const headerLen = 4 + idBytes.length + 4;
  const totalLen = headerLen + datos.byteLength;
  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);
  let offset = 0;
  view.setUint32(offset, idBytes.length, false);
  offset += 4;
  out.set(idBytes, offset);
  offset += idBytes.length;
  view.setUint32(offset, index, false);
  offset += 4;
  out.set(new Uint8Array(datos), offset);
  return out.buffer;
}

/** Decodifica un trozo binario codificado con `encodeChunkBinario`. */
export function decodeChunkBinario(buf: ArrayBuffer): { id: string; index: number; datos: ArrayBuffer } | null {
  try {
    const view = new DataView(buf);
    let offset = 0;
    const idLen = view.getUint32(offset, false);
    offset += 4;
    if (offset + idLen > buf.byteLength) return null;
    const idBytes = new Uint8Array(buf, offset, idLen);
    const id = new TextDecoder().decode(idBytes);
    offset += idLen;
    if (offset + 4 > buf.byteLength) return null;
    const index = view.getUint32(offset, false);
    offset += 4;
    const datos = buf.slice(offset);
    return { id, index, datos };
  } catch {
    return null;
  }
}

/* ══════════════════════════ 4) Almacenamiento de trozos ══════════════════════════ */

/**
 * AlmacenTrozos — abstracción de dónde viven los trozos recibidos MIENTRAS
 * llegan (nunca el archivo entero en RAM). `ensamblar` solo se llama una vez,
 * al terminar, para entregar el Blob final.
 */
export interface AlmacenTrozos {
  guardarTrozo(id: string, index: number, datos: ArrayBuffer): Promise<void>;
  leerTrozo(id: string, index: number): Promise<ArrayBuffer | null>;
  /** Índices ya guardados de esta transferencia (para reanudar). Vacío si no hay nada. */
  indicesGuardados(id: string): Promise<number[]>;
  ensamblar(id: string, tipoMime: string): Promise<Blob>;
  limpiar(id: string): Promise<void>;
}

/** Última red: mapa en memoria del propio módulo. No sobrevive a recargar la pestaña. */
export function crearAlmacenEnMemoria(): AlmacenTrozos {
  const datos = new Map<string, Map<number, ArrayBuffer>>();
  return {
    async guardarTrozo(id, index, buf) {
      let m = datos.get(id);
      if (!m) {
        m = new Map();
        datos.set(id, m);
      }
      m.set(index, buf);
    },
    async leerTrozo(id, index) {
      return datos.get(id)?.get(index) ?? null;
    },
    async indicesGuardados(id) {
      return Array.from(datos.get(id)?.keys() ?? []).sort((a, b) => a - b);
    },
    async ensamblar(id, tipoMime) {
      const m = datos.get(id);
      if (!m) return new Blob([], { type: tipoMime });
      const ordenados = Array.from(m.keys())
        .sort((a, b) => a - b)
        .map((i) => m.get(i) as ArrayBuffer);
      return new Blob(ordenados, { type: tipoMime });
    },
    async limpiar(id) {
      datos.delete(id);
    },
  };
}

type DirectorioOPFS = {
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirectorioOPFS>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleOPFS>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, unknown]>;
};
type FileHandleOPFS = {
  createWritable(): Promise<{ write(data: ArrayBuffer): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
};

/** OPFS (`navigator.storage.getDirectory()`) — un archivo por trozo, bajo `archivos-malla/<id>/<index>`. */
export function crearAlmacenOPFS(): AlmacenTrozos {
  const raiz = async (): Promise<DirectorioOPFS> => {
    const storage = (navigator as unknown as { storage: { getDirectory(): Promise<DirectorioOPFS> } }).storage;
    return storage.getDirectory();
  };
  const dirDeTransferencia = async (id: string, crear: boolean): Promise<DirectorioOPFS | null> => {
    try {
      const r = await raiz();
      const base = await r.getDirectoryHandle("archivos-malla", { create: true });
      return await base.getDirectoryHandle(id, { create: crear });
    } catch {
      return null;
    }
  };

  const guardarTrozo = async (id: string, index: number, datos: ArrayBuffer): Promise<void> => {
    const dir = await dirDeTransferencia(id, true);
    if (!dir) return;
    const fh = await dir.getFileHandle(String(index), { create: true });
    const w = await fh.createWritable();
    await w.write(datos);
    await w.close();
  };
  const leerTrozo = async (id: string, index: number): Promise<ArrayBuffer | null> => {
    try {
      const dir = await dirDeTransferencia(id, false);
      if (!dir) return null;
      const fh = await dir.getFileHandle(String(index));
      const file = await fh.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  };
  const indicesGuardados = async (id: string): Promise<number[]> => {
    try {
      const dir = await dirDeTransferencia(id, false);
      if (!dir) return [];
      const out: number[] = [];
      for await (const [name] of dir.entries()) {
        const n = Number(name);
        if (Number.isFinite(n)) out.push(n);
      }
      return out.sort((a, b) => a - b);
    } catch {
      return [];
    }
  };
  const ensamblar = async (id: string, tipoMime: string): Promise<Blob> => {
    const indices = await indicesGuardados(id);
    const partes: ArrayBuffer[] = [];
    for (const i of indices) {
      const d = await leerTrozo(id, i);
      if (d) partes.push(d);
    }
    return new Blob(partes, { type: tipoMime });
  };
  const limpiar = async (id: string): Promise<void> => {
    try {
      const r = await raiz();
      const base = await r.getDirectoryHandle("archivos-malla", { create: true });
      await base.removeEntry(id, { recursive: true });
    } catch {
      /* best-effort */
    }
  };
  return { guardarTrozo, leerTrozo, indicesGuardados, ensamblar, limpiar };
}

/** IndexedDB — espejo del patrón de `astraura/experiencias-idb.ts`. Clave `<id>:<index>`. */
export function crearAlmacenIDB(nombreDb = "starseed-archivos-malla"): AlmacenTrozos {
  const TABLA = "trozos";
  const claveDe = (id: string, index: number) => `${id}:${index}`;

  function abrir(): Promise<IDBDatabase> {
    return new Promise((ok, falla) => {
      const req = indexedDB.open(nombreDb, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TABLA)) db.createObjectStore(TABLA);
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falla(req.error);
    });
  }

  const guardarTrozo = async (id: string, index: number, datos: ArrayBuffer): Promise<void> => {
    const db = await abrir();
    try {
      await new Promise<void>((ok, falla) => {
        const tx = db.transaction(TABLA, "readwrite");
        tx.objectStore(TABLA).put(datos, claveDe(id, index));
        tx.oncomplete = () => ok();
        tx.onerror = () => falla(tx.error);
      });
    } finally {
      db.close();
    }
  };
  const leerTrozo = async (id: string, index: number): Promise<ArrayBuffer | null> => {
    const db = await abrir();
    try {
      return await new Promise((ok, falla) => {
        const req = db.transaction(TABLA, "readonly").objectStore(TABLA).get(claveDe(id, index));
        req.onsuccess = () => ok((req.result as ArrayBuffer | undefined) ?? null);
        req.onerror = () => falla(req.error);
      });
    } finally {
      db.close();
    }
  };
  const indicesGuardados = async (id: string): Promise<number[]> => {
    const db = await abrir();
    try {
      return await new Promise((ok, falla) => {
        const out: number[] = [];
        const prefijo = `${id}:`;
        const req = db.transaction(TABLA, "readonly").objectStore(TABLA).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) {
            const k = String(cur.key);
            if (k.startsWith(prefijo)) out.push(Number(k.slice(prefijo.length)));
            cur.continue();
          } else {
            ok(out.sort((a, b) => a - b));
          }
        };
        req.onerror = () => falla(req.error);
      });
    } finally {
      db.close();
    }
  };
  const ensamblar = async (id: string, tipoMime: string): Promise<Blob> => {
    const indices = await indicesGuardados(id);
    const partes: ArrayBuffer[] = [];
    for (const i of indices) {
      const d = await leerTrozo(id, i);
      if (d) partes.push(d);
    }
    return new Blob(partes, { type: tipoMime });
  };
  const limpiar = async (id: string): Promise<void> => {
    const indices = await indicesGuardados(id);
    if (indices.length === 0) return;
    const db = await abrir();
    try {
      await new Promise<void>((ok, falla) => {
        const tx = db.transaction(TABLA, "readwrite");
        for (const i of indices) tx.objectStore(TABLA).delete(claveDe(id, i));
        tx.oncomplete = () => ok();
        tx.onerror = () => falla(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return { guardarTrozo, leerTrozo, indicesGuardados, ensamblar, limpiar };
}

/** Elige OPFS > IndexedDB > memoria, según lo que dé el entorno. Nunca lanza. */
export function crearAlmacenAuto(): AlmacenTrozos {
  try {
    if (typeof navigator !== "undefined" && typeof (navigator as unknown as { storage?: { getDirectory?: unknown } }).storage?.getDirectory === "function") {
      return crearAlmacenOPFS();
    }
  } catch {
    /* sigue al siguiente */
  }
  try {
    if (typeof indexedDB !== "undefined") return crearAlmacenIDB();
  } catch {
    /* sigue al siguiente */
  }
  return crearAlmacenEnMemoria();
}

/* ══════════════════════════ 5) Políticas de recepción ══════════════════════════ */

export type PoliticaResultado = "auto-aceptar" | "preguntar" | "denegar";

const CLAVE_AUTO_ACEPTAR = "starseed.archivos.auto-aceptar-misma-cuenta.v1";

/** ¿Se auto-aceptan archivos de OTRO dispositivo de la MISMA cuenta? Por defecto sí. */
export function preferenciaAutoAceptarMismaCuenta(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(CLAVE_AUTO_ACEPTAR);
    if (raw === null) return true;
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

export function setPreferenciaAutoAceptarMismaCuenta(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_AUTO_ACEPTAR, v ? "1" : "0");
  } catch {
    /* best-effort */
  }
}

/**
 * verificarPermisoArchivosPorDefecto — hasta que el módulo de vínculos entre
 * CUENTAS DISTINTAS (`os_mesh_vinculos`, de otra área de esta misma ola) dé el
 * permiso real, CUALQUIER oferta de otra cuenta se deniega — nunca se
 * auto-acepta ni siquiera se pregunta. Punto de extensión documentado.
 */
export function verificarPermisoArchivosPorDefecto(): boolean {
  return false;
}

export interface ContextoRecepcion {
  /** ¿El canal por el que llega esto es de un dispositivo de la MISMA cuenta? */
  mismaCuenta: boolean;
  /** Etiqueta legible del remitente, para la tarjeta de confirmación. */
  etiquetaOrigen?: string;
  /** Solo se consulta si `mismaCuenta` es false. Por defecto: deniega (ver arriba). */
  verificarPermiso?: () => boolean | Promise<boolean>;
}

/** Política por defecto: ver cabecera del módulo, §POLÍTICAS DE RECEPCIÓN. */
export async function politicaPorDefecto(ctx: ContextoRecepcion): Promise<PoliticaResultado> {
  if (ctx.mismaCuenta) return preferenciaAutoAceptarMismaCuenta() ? "auto-aceptar" : "preguntar";
  const permitido = await Promise.resolve((ctx.verificarPermiso ?? verificarPermisoArchivosPorDefecto)());
  return permitido ? "preguntar" : "denegar";
}

export type PoliticaRecepcion = (ctx: ContextoRecepcion) => PoliticaResultado | Promise<PoliticaResultado>;

/* ══════════════════════════ 6) Motor de transferencia ══════════════════════════ */

export type FaseTransferencia =
  | "pendiente-aceptar"
  | "esperando-aceptacion"
  | "transfiriendo"
  | "verificando"
  | "completada"
  | "rechazada"
  | "cancelada"
  | "error";

export interface EstadoTransferencia {
  id: string;
  rol: "enviar" | "recibir";
  nombre: string;
  tipo: string;
  tamano: number;
  trozos: number;
  /** Nº de trozos enviados (rol enviar) o recibidos (rol recibir), 0..trozos. */
  progreso: number;
  fase: FaseTransferencia;
  motivo?: string;
  destino?: DestinoArchivo;
  /** Solo rol "recibir": etiqueta legible de quién ofrece. */
  origen?: string;
  inicioMs: number;
  actualizadoMs: number;
}

export interface OfertaEntranteInfo {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  destino: DestinoArchivo;
  origen?: string;
}

export interface ConfigMotorArchivos {
  almacen?: AlmacenTrozos;
  politica?: PoliticaRecepcion;
  /** Se dispara cuando una oferta entrante necesita confirmación humana (fase "preguntar"). */
  onOfertaEntrante?: (oferta: OfertaEntranteInfo) => void;
  onProgreso?: (estado: EstadoTransferencia) => void;
  /** Se dispara UNA vez, al terminar de recibir y verificar un archivo con éxito. */
  onCompletado?: (estado: EstadoTransferencia, blob: Blob) => void;
  /** Bytes crudos por trozo, antes de codificar a base64. Por defecto 16 KiB. */
  tamanoChunkBase64?: number;
  /** Umbral de `bufferedAmount()` (bytes) por encima del cual el remitente espera. Por defecto 1 MiB. */
  umbralBufferAlto?: number;
  /** A partir de este tamaño se marca un aviso informativo (no bloquea). Por defecto 500 MiB. */
  limiteAvisoBytes?: number;
  /** Tope duro: una oferta que lo supere se rechaza sin ofertar. Por defecto 4 GiB. */
  limiteMaxBytes?: number;
}

export interface ResultadoEnviarArchivo {
  ok: boolean;
  id: string;
  error?: string;
  aviso?: string;
}

export interface MotorArchivos {
  enviarArchivo(
    canal: CanalArchivos,
    archivo: Blob,
    nombre: string,
    destino: DestinoArchivo,
    opciones?: { tipoMime?: string; idTransferencia?: string },
  ): Promise<ResultadoEnviarArchivo>;
  manejarMensaje(canal: CanalArchivos, data: string | ArrayBuffer, contexto?: ContextoRecepcion): void;
  aceptarOferta(id: string): void;
  rechazarOferta(id: string, motivo?: string): void;
  cancelar(id: string): void;
  onProgreso(cb: (estado: EstadoTransferencia) => void): () => void;
  estadoDe(id: string): EstadoTransferencia | undefined;
  listaTransferencias(): EstadoTransferencia[];
  ofertasPendientes(): EstadoTransferencia[];
  /** Blob YA ensamblado de una transferencia recibida y completada (para Abrir/Guardar/Biblioteca). */
  blobRecibido(id: string): Blob | undefined;
  /**
   * El archivo original de una transferencia ENVIADA que aún no terminó con
   * éxito (pendiente, en curso, cancelada, rechazada o en error) — para el
   * botón «Reintentar» sin que la UI tenga que guardar su propia copia.
   */
  archivoDeEnvio(id: string): Blob | undefined;
}

function idAleatorio(): string {
  try {
    return `arch_${crypto.randomUUID()}`;
  } catch {
    return `arch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** crearMotorArchivos — instancia aislada del motor (una por proceso normalmente, ver `motorArchivosCompartido`). */
export function crearMotorArchivos(config: ConfigMotorArchivos = {}): MotorArchivos {
  const almacen = config.almacen ?? crearAlmacenAuto();
  const TAM_TROZO = config.tamanoChunkBase64 ?? 16 * 1024;
  const UMBRAL_BUFFER = config.umbralBufferAlto ?? 1_048_576;
  const AVISO_BYTES = config.limiteAvisoBytes ?? 500 * 1024 * 1024;
  const MAX_BYTES = config.limiteMaxBytes ?? 4 * 1024 * 1024 * 1024;

  const canalPorId = new Map<string, CanalArchivos>();
  const archivosEnvio = new Map<string, Blob>();
  const desdePorId = new Map<string, number>();
  const hashesEsperados = new Map<string, string>();
  const recibidosPorId = new Map<string, Set<number>>();
  const ofertasEntrantes = new Map<string, MsgOferta>();
  const cancelados = new Set<string>();
  const blobsRecibidos = new Map<string, Blob>();
  const modoPorId = new Map<string, ModoTransferencia>();

  const estados = new Map<string, EstadoTransferencia>();
  let version = 0;
  let listaCache: EstadoTransferencia[] = [];
  let listaCacheVersion = -1;

  const listenersProgreso = new Set<(e: EstadoTransferencia) => void>();

  function emitir(e: EstadoTransferencia): void {
    estados.set(e.id, e);
    version++;
    config.onProgreso?.(e);
    for (const l of listenersProgreso) {
      try {
        l(e);
      } catch {
        /* un listener no debe tumbar a los demás */
      }
    }
  }

  function actualizarFase(id: string, fase: FaseTransferencia, motivo?: string): void {
    const actual = estados.get(id);
    if (!actual) return;
    emitir({ ...actual, fase, motivo: motivo ?? actual.motivo, actualizadoMs: Date.now() });
  }

  function actualizarProgreso(id: string, progreso: number): void {
    const actual = estados.get(id);
    if (!actual) return;
    emitir({ ...actual, progreso, actualizadoMs: Date.now() });
  }

  function onProgreso(cb: (estado: EstadoTransferencia) => void): () => void {
    listenersProgreso.add(cb);
    return () => listenersProgreso.delete(cb);
  }

  function estadoDe(id: string): EstadoTransferencia | undefined {
    return estados.get(id);
  }

  function listaTransferencias(): EstadoTransferencia[] {
    if (listaCacheVersion !== version) {
      listaCache = Array.from(estados.values());
      listaCacheVersion = version;
    }
    return listaCache;
  }

  function ofertasPendientes(): EstadoTransferencia[] {
    return listaTransferencias().filter((e) => e.rol === "recibir" && e.fase === "pendiente-aceptar");
  }

  function blobRecibido(id: string): Blob | undefined {
    return blobsRecibidos.get(id);
  }

  function archivoDeEnvio(id: string): Blob | undefined {
    return archivosEnvio.get(id);
  }

  /* ---------------- remitente ---------------- */

  async function enviarArchivo(
    canal: CanalArchivos,
    archivo: Blob,
    nombre: string,
    destino: DestinoArchivo,
    opciones?: { tipoMime?: string; idTransferencia?: string },
  ): Promise<ResultadoEnviarArchivo> {
    const id = opciones?.idTransferencia ?? idAleatorio();
    const tamano = archivo.size;
    if (tamano > MAX_BYTES) {
      return {
        ok: false,
        id,
        error: `El archivo (${(tamano / 1024 / 1024 / 1024).toFixed(2)} GB) supera el límite máximo de ${(MAX_BYTES / 1024 / 1024 / 1024).toFixed(1)} GB.`,
      };
    }
    const tipoMime = opciones?.tipoMime ?? (archivo as File).type ?? "application/octet-stream";
    const trozos = Math.max(1, Math.ceil(tamano / TAM_TROZO));
    const leerTrozo = async (i: number) => archivo.slice(i * TAM_TROZO, Math.min(tamano, (i + 1) * TAM_TROZO)).arrayBuffer();
    const { raiz } = await calcularHashLista(leerTrozo, trozos);

    canalPorId.set(id, canal);
    archivosEnvio.set(id, archivo);
    cancelados.delete(id);

    const aviso = tamano > AVISO_BYTES ? `Archivo grande (${(tamano / 1024 / 1024).toFixed(0)} MB): la transferencia puede tardar.` : undefined;

    // Negociar modo: si el canal soporta binario, usamos binario; si no, base64.
    const modo: ModoTransferencia = canal.enviarBinario ? "binario" : "base64";
    modoPorId.set(id, modo);

    emitir({
      id,
      rol: "enviar",
      nombre,
      tipo: tipoMime,
      tamano,
      trozos,
      progreso: 0,
      fase: "esperando-aceptacion",
      destino,
      motivo: aviso,
      inicioMs: Date.now(),
      actualizadoMs: Date.now(),
    });

    const oferta: MsgOferta = {
      t: "archivo.oferta",
      id,
      nombre,
      tipo: tipoMime,
      tamano,
      sha256: raiz,
      trozos,
      tamanoTrozo: TAM_TROZO,
      destino,
      modo,
    };
    canal.enviar(JSON.stringify(oferta));
    return { ok: true, id, aviso };
  }

  async function transmitir(id: string): Promise<void> {
    const canal = canalPorId.get(id);
    const archivo = archivosEnvio.get(id);
    const estado = estados.get(id);
    if (!canal || !archivo || !estado) return;
    actualizarFase(id, "transfiriendo");
    const desde = desdePorId.get(id) ?? 0;
    const modo = modoPorId.get(id) ?? "base64";
    for (let i = desde; i < estado.trozos; i++) {
      if (cancelados.has(id)) {
        actualizarFase(id, "cancelada");
        return;
      }
      // Backpressure: si el canal expone `bufferedAmount`, esperamos a que baje
      // del umbral antes de encolar el siguiente trozo (nunca satura el buffer).
      while (canal.bufferedAmount && canal.bufferedAmount() > UMBRAL_BUFFER) {
        if (cancelados.has(id)) {
          actualizarFase(id, "cancelada");
          return;
        }
        await esperar(30);
      }
      const inicio = i * TAM_TROZO;
      const fin = Math.min(archivo.size, inicio + TAM_TROZO);
      const datos = await archivo.slice(inicio, fin).arrayBuffer();
      let enviado = false;
      if (modo === "binario" && canal.enviarBinario) {
        const chunkBin = encodeChunkBinario(id, i, datos);
        enviado = canal.enviarBinario(chunkBin);
      } else {
        const msg: MsgChunk = { t: "archivo.chunk", id, index: i, datosB64: bufAB64(datos) };
        enviado = canal.enviar(JSON.stringify(msg));
      }
      if (!enviado) {
        actualizarFase(id, "error", "No se pudo enviar el trozo: el canal está caído. Puedes reintentar; se reanuda desde el último trozo confirmado.");
        return;
      }
      actualizarProgreso(id, i + 1);
    }
    if (!cancelados.has(id)) {
      canal.enviar(JSON.stringify({ t: "archivo.fin", id } satisfies MsgFin));
    }
  }

  function manejarAceptar(msg: MsgAceptar): void {
    const estado = estados.get(msg.id);
    if (!estado || estado.rol !== "enviar") return;
    desdePorId.set(msg.id, msg.desde ?? 0);
    // Respetar el modo confirmado por el receptor.
    if (msg.modo) {
      modoPorId.set(msg.id, msg.modo);
    }
    void transmitir(msg.id);
  }

  function manejarRechazar(msg: MsgRechazar): void {
    actualizarFase(msg.id, "rechazada", msg.motivo);
    archivosEnvio.delete(msg.id);
    canalPorId.delete(msg.id);
  }

  function manejarOk(msg: MsgOk): void {
    actualizarFase(msg.id, "completada");
    archivosEnvio.delete(msg.id);
    canalPorId.delete(msg.id);
    desdePorId.delete(msg.id);
  }

  function manejarErrorRemoto(msg: MsgError): void {
    actualizarFase(msg.id, "error", msg.motivo);
    archivosEnvio.delete(msg.id);
  }

  /* ---------------- receptor ---------------- */

  async function manejarOferta(canal: CanalArchivos, msg: MsgOferta, contexto?: ContextoRecepcion): Promise<void> {
    if (msg.tamano > MAX_BYTES) {
      canal.enviar(
        JSON.stringify({
          t: "archivo.rechazar",
          id: msg.id,
          motivo: `Supera el límite máximo de ${(MAX_BYTES / 1024 / 1024 / 1024).toFixed(1)} GB.`,
        } satisfies MsgRechazar),
      );
      return;
    }
    canalPorId.set(msg.id, canal);
    ofertasEntrantes.set(msg.id, msg);
    const yaGuardados = await almacen.indicesGuardados(msg.id);
    const desde = yaGuardados.length ? Math.max(...yaGuardados) + 1 : 0;

    const ctx: ContextoRecepcion = contexto ?? { mismaCuenta: false };
    const decision = await Promise.resolve((config.politica ?? politicaPorDefecto)(ctx));

    // Negociar modo: si el oferente pide binario y nuestro canal lo soporta, usamos binario.
    const modo: ModoTransferencia = msg.modo === "binario" && canal.enviarBinario ? "binario" : "base64";
    modoPorId.set(msg.id, modo);

    const estadoBase: EstadoTransferencia = {
      id: msg.id,
      rol: "recibir",
      nombre: msg.nombre,
      tipo: msg.tipo,
      tamano: msg.tamano,
      trozos: msg.trozos,
      progreso: desde,
      fase: "pendiente-aceptar",
      destino: msg.destino,
      origen: msg.origen ?? ctx.etiquetaOrigen,
      inicioMs: Date.now(),
      actualizadoMs: Date.now(),
    };

    if (decision === "denegar") {
      emitir({ ...estadoBase, fase: "rechazada", motivo: "Sin permiso para recibir archivos de esta cuenta." });
      canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo: "denegado por política de permisos" } satisfies MsgRechazar));
      ofertasEntrantes.delete(msg.id);
      return;
    }

    if (decision === "auto-aceptar") {
      hashesEsperados.set(msg.id, msg.sha256);
      recibidosPorId.set(msg.id, new Set(yaGuardados));
      emitir({ ...estadoBase, fase: "transfiriendo" });
      canal.enviar(JSON.stringify({ t: "archivo.aceptar", id: msg.id, modo, ...(desde > 0 ? { desde } : {}) } satisfies MsgAceptar));
      return;
    }

    // "preguntar": queda pendiente hasta que la UI llame aceptarOferta/rechazarOferta.
    emitir(estadoBase);
    config.onOfertaEntrante?.({
      id: msg.id,
      nombre: msg.nombre,
      tipo: msg.tipo,
      tamano: msg.tamano,
      destino: msg.destino,
      origen: estadoBase.origen,
    });
  }

  function aceptarOferta(id: string): void {
    const oferta = ofertasEntrantes.get(id);
    const canal = canalPorId.get(id);
    if (!oferta || !canal) return;
    hashesEsperados.set(id, oferta.sha256);
    const yaGuardados = recibidosPorId.get(id) ?? new Set<number>();
    recibidosPorId.set(id, yaGuardados);
    const desde = yaGuardados.size ? Math.max(...Array.from(yaGuardados)) + 1 : 0;
    actualizarFase(id, "transfiriendo");
    // Incluir modo negociado en la aceptación manual.
    const modo = modoPorId.get(id) ?? "base64";
    canal.enviar(JSON.stringify({ t: "archivo.aceptar", id, modo, ...(desde > 0 ? { desde } : {}) } satisfies MsgAceptar));
  }

  function rechazarOferta(id: string, motivo = "Rechazado por el usuario."): void {
    const canal = canalPorId.get(id);
    actualizarFase(id, "rechazada", motivo);
    canal?.enviar(JSON.stringify({ t: "archivo.rechazar", id, motivo } satisfies MsgRechazar));
    ofertasEntrantes.delete(id);
  }

  async function manejarChunk(msg: MsgChunk): Promise<void> {
    if (cancelados.has(msg.id)) return;
    let set = recibidosPorId.get(msg.id);
    if (!set) {
      set = new Set<number>();
      recibidosPorId.set(msg.id, set);
    }
    if (set.has(msg.index)) return; // duplicado: ignorar (idempotente)
    const datos = b64ABuf(msg.datosB64);
    await almacen.guardarTrozo(msg.id, msg.index, datos);
    set.add(msg.index);
    actualizarProgreso(msg.id, set.size);
  }

  async function manejarFin(canal: CanalArchivos, msg: MsgFin): Promise<void> {
    const estado = estados.get(msg.id);
    if (!estado) return;
    if (cancelados.has(msg.id)) return;
    actualizarFase(msg.id, "verificando");
    const leerTrozo = async (i: number) => (await almacen.leerTrozo(msg.id, i)) ?? new ArrayBuffer(0);
    const { raiz } = await calcularHashLista(leerTrozo, estado.trozos);
    const esperado = hashesEsperados.get(msg.id);
    if (esperado && raiz !== esperado) {
      actualizarFase(msg.id, "error", "La verificación de integridad (SHA-256) no coincide: el archivo llegó dañado o alterado.");
      canal.enviar(JSON.stringify({ t: "archivo.error", id: msg.id, motivo: "hash-no-coincide" } satisfies MsgError));
      await almacen.limpiar(msg.id);
      recibidosPorId.delete(msg.id);
      return;
    }
    const blob = await almacen.ensamblar(msg.id, estado.tipo);
    blobsRecibidos.set(msg.id, blob);
    actualizarFase(msg.id, "completada");
    canal.enviar(JSON.stringify({ t: "archivo.ok", id: msg.id } satisfies MsgOk));
    config.onCompletado?.(estados.get(msg.id) as EstadoTransferencia, blob);
    await almacen.limpiar(msg.id);
    recibidosPorId.delete(msg.id);
    hashesEsperados.delete(msg.id);
    ofertasEntrantes.delete(msg.id);
  }

  function manejarCancelarRemoto(msg: MsgCancelar): void {
    cancelados.add(msg.id);
    actualizarFase(msg.id, "cancelada");
  }

  function cancelar(id: string): void {
    cancelados.add(id);
    const canal = canalPorId.get(id);
    canal?.enviar(JSON.stringify({ t: "archivo.cancelar", id } satisfies MsgCancelar));
    actualizarFase(id, "cancelada");
  }

  /* ---------------- despacho ---------------- */

  function manejarMensaje(canal: CanalArchivos, data: string | ArrayBuffer, contexto?: ContextoRecepcion): void {
    if (typeof data === "string") {
      const msg = parseArchivoMallaMensaje(data);
      if (!msg) return;
      switch (msg.t) {
        case "archivo.oferta":
          void manejarOferta(canal, msg, contexto);
          break;
        case "archivo.aceptar":
          manejarAceptar(msg);
          break;
        case "archivo.rechazar":
          manejarRechazar(msg);
          break;
        case "archivo.chunk":
          void manejarChunk(msg);
          break;
        case "archivo.fin":
          void manejarFin(canal, msg);
          break;
        case "archivo.ok":
          manejarOk(msg);
          break;
        case "archivo.error":
          manejarErrorRemoto(msg);
          break;
        case "archivo.cancelar":
          manejarCancelarRemoto(msg);
          break;
        default:
          break;
      }
    } else {
      // Camino binario: trozo codificado con encodeChunkBinario.
      const dec = decodeChunkBinario(data);
      if (!dec) return;
      // Procesar trozo binario igual que manejarChunk pero con datos ya decodificados.
      if (cancelados.has(dec.id)) return;
      let set = recibidosPorId.get(dec.id);
      if (!set) {
        set = new Set<number>();
        recibidosPorId.set(dec.id, set);
      }
      if (set.has(dec.index)) return; // duplicado
      // Guardar trozo directamente (ya es ArrayBuffer crudo).
      almacen.guardarTrozo(dec.id, dec.index, dec.datos);
      set.add(dec.index);
      actualizarProgreso(dec.id, set.size);
    }
  }

  return {
    enviarArchivo,
    manejarMensaje,
    aceptarOferta,
    rechazarOferta,
    cancelar,
    onProgreso,
    estadoDe,
    listaTransferencias,
    ofertasPendientes,
    blobRecibido,
    archivoDeEnvio,
  };
}

/* ══════════════════════════ 7) Adaptador — mesh WebRTC compartido ══════════════════════════ */

/**
 * canalDesdeMesh — adapta un `MeshHandle` (mismo mesh COMPARTIDO de
 * `lan-sync.ts`, nunca uno propio) + un `deviceId` concreto a `CanalArchivos`.
 * `alMensaje` se suscribe con `mesh.onPeer` filtrando por ese `deviceId` — no
 * hace falta un segundo canal ni un segundo data channel.
 */
export function canalDesdeMesh(mesh: MeshHandle, deviceId: string): CanalArchivos {
  return {
    enviar: (texto: string) => mesh.sendToPeer(deviceId, texto),
    bufferedAmount: mesh.bufferedAmount ? () => (mesh.bufferedAmount as (d: string) => number)(deviceId) : undefined,
    alMensaje: (cb) =>
      mesh.onPeer({
        onMessage: (peerId, data) => {
          if (peerId === deviceId) cb(data);
        },
      }),
  };
}

let motorCompartido: MotorArchivos | null = null;

/** Instancia única del motor para toda la sesión (la UI y el mount la comparten). */
export function motorArchivosCompartido(config?: ConfigMotorArchivos): MotorArchivos {
  if (!motorCompartido) motorCompartido = crearMotorArchivos(config);
  return motorCompartido;
}

/** Solo para pruebas: descarta el motor compartido para que la siguiente llamada cree uno limpio. */
export function reiniciarMotorArchivosCompartidoParaTests(): void {
  motorCompartido = null;
}

/**
 * iniciarMotorArchivosPorMalla — engancha el motor compartido al mesh
 * COMPARTIDO de la malla de neuronas (misma cuenta, `getSharedMesh()`). Todo
 * mensaje `archivo.*` que llegue de cualquier peer se despacha con el
 * `contexto.mismaCuenta = true` (el mesh WebRTC de `lan-sync.ts` SOLO conecta
 * dispositivos de la MISMA cuenta — cualquier peer en él ya es "mía").
 * Reintenta hasta que exista un mesh compartido (igual que
 * `iniciarServidorAstrauraPorMalla`). Devuelve función de baja.
 */
export function iniciarMotorArchivosPorMalla(motor: MotorArchivos = motorArchivosCompartido(), etiquetaDePeer?: (deviceId: string) => string | undefined): () => void {
  let activo = true;
  let unsubMesh: (() => void) | null = null;
  let reintento: ReturnType<typeof setTimeout> | null = null;
  const canalesPorPeer = new Map<string, CanalArchivos>();

  const conectar = () => {
    if (!activo) return;
    const mesh = getSharedMesh();
    if (!mesh) {
      reintento = setTimeout(conectar, 2000);
      return;
    }
    unsubMesh = mesh.onPeer({
      onMessage: (peerId, data) => {
        let canal = canalesPorPeer.get(peerId);
        if (!canal) {
          canal = canalDesdeMesh(mesh, peerId);
          canalesPorPeer.set(peerId, canal);
        }
        motor.manejarMensaje(canal, data, { mismaCuenta: true, etiquetaOrigen: etiquetaDePeer?.(peerId) });
      },
      onState: (snap: PeerSnapshot) => {
        if (snap.state === "closed" || snap.state === "failed") canalesPorPeer.delete(snap.deviceId);
      },
    });
  };
  conectar();

  return () => {
    activo = false;
    if (reintento) clearTimeout(reintento);
    unsubMesh?.();
  };
}

/* ══════════════════════════ 8) Hooks React (para la UI) ══════════════════════════ */

/** Lista reactiva de todas las transferencias conocidas (enviar + recibir) del motor compartido. */
export function useTransferenciasArchivo(): EstadoTransferencia[] {
  const motor = motorArchivosCompartido();
  return useSyncExternalStore(
    (cb) => motor.onProgreso(() => cb()),
    () => motor.listaTransferencias(),
    () => [] as EstadoTransferencia[],
  );
}

const OFERTAS_VACIAS: EstadoTransferencia[] = [];

/** Ofertas entrantes que esperan Aceptar/Rechazar del usuario (política "preguntar"). */
export function useOfertasPendientesArchivo(): EstadoTransferencia[] {
  const todas = useTransferenciasArchivo();
  const pendientes = todas.filter((e) => e.rol === "recibir" && e.fase === "pendiente-aceptar");
  return pendientes.length ? pendientes : OFERTAS_VACIAS;
}

/* ══════════════════════════ 9) Biblioteca — ítem LOCAL + "Subir a mi cuenta" ══════════════════════════ */

/** Esquema propio (no resuelve a una URL real) para marcar un ítem de biblioteca como "solo en este dispositivo". */
export function urlLocalDeArchivo(idTransferencia: string): string {
  return `local-archivos-malla://${idTransferencia}`;
}

/**
 * registrarArchivoLocalEnBiblioteca — cuando el destino de una transferencia
 * recibida es `"cerebro"`/`"biblioteca"`, registra el archivo YA recibido
 * (en OPFS/IndexedDB, ver `AlmacenTrozos`) como un ítem de biblioteca LOCAL:
 * NUNCA sube a Supabase por sí solo (Lienzo Universal: eso es una decisión
 * explícita del usuario, ver `subirArchivoLocalACuenta`). `ref` la resuelve
 * quien llama (perfil/cuenta activos) — este módulo de red no conoce sesión.
 */
export async function registrarArchivoLocalEnBiblioteca(
  ref: EntityRef,
  estado: Pick<EstadoTransferencia, "id" | "nombre" | "tipo" | "tamano">,
  folderId?: string | null,
): Promise<{ ok: boolean; id?: string }> {
  try {
    const r = await saveItem(
      ref,
      {
        type: "file",
        url: urlLocalDeArchivo(estado.id),
        title: estado.nombre,
        mime: estado.tipo,
        tags: ["p2p", "local"],
        description: `Recibido por la malla P2P (${(estado.tamano / 1024 / 1024).toFixed(1)} MB) — guardado solo en este dispositivo. Usa «Subir a mi cuenta» para respaldarlo.`,
      },
      folderId ?? null,
    );
    return { ok: r.ok, id: r.id };
  } catch {
    return { ok: false };
  }
}

/**
 * subirArchivoLocalACuenta — el botón «Subir a mi cuenta»: sube el Blob YA
 * ensamblado al almacenamiento real del OS (`uploadFile`, sujeto a su límite
 * de 50 MB por archivo) y actualiza la `url` del ítem de biblioteca para que
 * deje de ser "solo local". Nunca lanza.
 */
export async function subirArchivoLocalACuenta(
  ref: EntityRef,
  itemId: string,
  blob: Blob,
  nombre: string,
  tipoMime: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const archivo = new File([blob], nombre, { type: tipoMime });
    const subida = await uploadFile(archivo, { folder: "archivos-malla" });
    if (!subida.ok || !subida.file?.url) return { ok: false, error: subida.error ?? "No se pudo subir el archivo." };
    await updateItemContent(ref, itemId, {
      url: subida.file.url,
      description: "Subido a tu cuenta desde un archivo recibido por la malla P2P.",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al subir el archivo." };
  }
}
