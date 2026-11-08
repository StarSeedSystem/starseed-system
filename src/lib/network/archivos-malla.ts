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
 * (ARC1108A · 2026-11-08) `archivo.oferta` lleva además, opcionales, `lote`/`loteTotal`/`loteMensaje`
 * (el envío: varios archivos en UNA ventana del receptor), `ruta` (carpeta), `inicioB64` (≤ 512 B
 * para inspeccionar antes de aceptar) y `vista` (miniatura raster o texto); `archivo.error` lleva
 * `detalle`, `lado` y `desde`. Un trozo cuenta como recibido SOLO cuando el almacén terminó de
 * guardarlo, por los dos caminos (base64 y binario): el binario lo contaba antes de guardarlo y
 * «fin» verificaba trozos vacíos — el «hash-no-coincide» de la prueba real del 08-11. Contrato:
 * `architecture/datos-por-la-malla.md` §7.1.
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
import {
  CONFIANZA_INICIAL,
  actualizarConfianza,
  decisionPorResonancia,
  type DecisionResonancia,
  type ResultadoResonancia,
  type VeredictoCompartido,
} from "@/lib/malla/cristal/resonancias";
import { analizarArchivo } from "@/lib/malla/cristal/centinela";
import { decidirEntrada } from "@/lib/malla/cristal/centinela-archivos";

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
  /**
   * (ARC1108A) Envío al que pertenece: los archivos que se mandan juntos comparten `lote` y el receptor
   * los enseña en UNA ventana. Opcional: sin él (remitentes anteriores) se agrupan por remitente y
   * ventana de tiempo (`envios-entrantes.ts`).
   */
  lote?: string;
  /** Cuántos archivos tiene el envío (para «3 de 18»). */
  loteTotal?: number;
  /** Mensaje que acompaña al envío (≤ 1000 caracteres). */
  loteMensaje?: string;
  /** Ruta relativa dentro de la carpeta enviada («fotos/2026/a.jpg»). Nunca absoluta ni con «..». */
  ruta?: string;
  /** Primeros bytes del archivo (≤ 512, base64) para la inspección de seguridad ANTES de aceptar. */
  inicioB64?: string;
  /** Vista previa que el remitente calculó (miniatura JPEG/PNG/WebP o fragmento de texto). */
  vista?: VistaOferta;
}

/** (ARC1108A) Vista previa segura de una oferta: nunca HTML ni SVG, solo una miniatura raster o texto plano. */
export type VistaOferta = { tipo: "imagen"; datosUrl: string } | { tipo: "texto"; texto: string };

/** (ARC1108A) Quién manda y cómo se comprobó (lo enseña la ventana del envío). */
export interface VerificacionOrigen {
  /** firma: saludo firmado con la identidad de malla; cuenta: aparato de la misma cuenta; vinculo: vínculo entre cuentas consentido; codigo: emparejado con código. */
  tipo: "firma" | "cuenta" | "vinculo" | "codigo" | "ninguna";
  texto: string;
  huella?: string;
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
  /** Código corto (compatibilidad: «hash-no-coincide», «faltan-trozos», «almacen-receptor», «fallo-verificacion»…). */
  motivo: string;
  /** (ARC1108A) Explicación legible de lo que pasó (cuántos trozos, qué almacenamiento…). */
  detalle?: string;
  /** (ARC1108A) Lado donde falló. */
  lado?: LadoFallo;
  /** (ARC1108A) Primer trozo que falta: el remitente puede reanudar desde ahí. */
  desde?: number;
}

/** (ARC1108A) Dónde falló una transferencia. */
export type LadoFallo = "receptor" | "remitente";
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

/**
 * (ARC1108A) Copia EXACTA de los bytes de un trozo, venga como venga: un ArrayBuffer tal cual, una
 * vista (Uint8Array/Buffer/DataView, con su desplazamiento: nunca el buffer entero que hay debajo) o
 * un Blob. Null si no son bytes. Es lo que devuelven los almacenes al releer.
 */
export async function bytesExactos(x: unknown): Promise<ArrayBuffer | null> {
  if (x === null || x === undefined) return null;
  if (x instanceof ArrayBuffer) return x;
  if (ArrayBuffer.isView(x)) return x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer;
  const o = x as { arrayBuffer?: unknown; byteLength?: unknown; slice?: unknown };
  // Blob (o un ArrayBuffer de otro reino: iframe, jsdom), por su forma.
  if (typeof o.arrayBuffer === "function") return (await (o.arrayBuffer as () => Promise<ArrayBuffer>).call(x)) ?? null;
  if (typeof o.byteLength === "number" && typeof o.slice === "function") return (o.slice as (a: number) => ArrayBuffer).call(x, 0);
  return null;
}

/** (ARC1108A) Primer índice de 0..trozos-1 que NO está (de ahí se reanuda; con huecos, el primer hueco). Puro. */
export function primerFaltante(tenidos: Iterable<number>, trozos: number): number {
  const s = tenidos instanceof Set ? (tenidos as Set<number>) : new Set(tenidos);
  for (let i = 0; i < trozos; i++) if (!s.has(i)) return i;
  return Math.max(0, trozos);
}

/** (ARC1108A) Qué significa cada código de `archivo.error`, en una frase. Puro. */
export function describirErrorArchivo(codigo: string): string {
  switch (codigo) {
    case "hash-no-coincide":
      return "la verificación de integridad (SHA-256) no coincide: lo que llegó no es idéntico al original";
    case "faltan-trozos":
      return "no llegaron todos los trozos";
    case "almacen-receptor":
      return "no pudo guardar o releer los trozos en su almacenamiento";
    case "fallo-verificacion":
      return "falló al verificar el archivo";
    case "sin-confirmacion":
      return "no confirmó la verificación a tiempo";
    default:
      return codigo;
  }
}

/** (ARC1108A) El texto de la burbuja del remitente para un `archivo.error` que llegó del otro lado. Puro. */
export function textoErrorRemoto(msg: Pick<MsgError, "motivo" | "detalle" | "lado">): string {
  const lado = msg.lado === "remitente" ? "el remitente" : "el receptor";
  const base = `Falló en ${lado}: ${describirErrorArchivo(msg.motivo)}`;
  return msg.detalle ? `${base} — ${msg.detalle.slice(0, 300)}.` : `${base}.`;
}

/* ══════════════════════════ 3a) Extras de la oferta, saneados (ARC1108A) ══════════════════════════ */

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Ruta relativa de un archivo dentro de una carpeta enviada: sin control, sin «.»/«..», sin raíz
 * ni unidad, como mucho 12 niveles de 120 caracteres. Undefined si no queda nada. Puro.
 */
export function sanearRutaRelativa(x: unknown): string | undefined {
  if (typeof x !== "string" || !x) return undefined;
  const partes = x
    .replace(CONTROL, "")
    .split(/[\\/]+/)
    .map((p) => p.trim())
    .filter((p) => p && p !== "." && p !== ".." && !/^[A-Za-z]:$/.test(p))
    .map((p) => p.slice(0, 120));
  if (!partes.length || partes.length > 12) return partes.length ? partes.slice(-12).join("/") : undefined;
  return partes.join("/");
}

const RE_DATOS_IMAGEN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
/** Tope de una miniatura (caracteres del data URL): cabe holgada en una trama del canal nativo. */
export const MAX_VISTA_IMAGEN = 24_000;
export const MAX_VISTA_TEXTO = 1_200;
export const MAX_INICIO_BYTES = 512;

/** Vista previa de una oferta, solo si es segura (miniatura raster por data URL o texto plano). Puro. */
export function sanearVista(x: unknown): VistaOferta | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  if (o.tipo === "imagen" && typeof o.datosUrl === "string" && o.datosUrl.length <= MAX_VISTA_IMAGEN && RE_DATOS_IMAGEN.test(o.datosUrl)) {
    return { tipo: "imagen", datosUrl: o.datosUrl };
  }
  if (o.tipo === "texto" && typeof o.texto === "string") return { tipo: "texto", texto: o.texto.slice(0, MAX_VISTA_TEXTO) };
  return undefined;
}

/** Primeros bytes anunciados (base64 de ≤ 512 B), o undefined. Puro. */
export function sanearInicio(x: unknown): string | undefined {
  if (typeof x !== "string" || !x || x.length > Math.ceil(MAX_INICIO_BYTES / 3) * 4 + 4) return undefined;
  return /^[A-Za-z0-9+/]+=*$/.test(x) ? x : undefined;
}

/** Id de envío (lote): letras, cifras, «_» y «-», de 4 a 80. Puro. */
export function sanearLote(x: unknown): string | undefined {
  return typeof x === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(x) ? x : undefined;
}

/** Mensaje que acompaña a un envío: texto plano de ≤ 1000 caracteres, sin control salvo saltos de línea. Puro. */
export function sanearMensajeEnvio(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const t = x.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, 1000);
  return t || undefined;
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
  /** (ARC1108A) Qué almacenamiento es («OPFS», «IndexedDB», «memoria»…), para decir dónde falló. */
  readonly tipo?: string;
  /** Se resuelve cuando el trozo YA se puede releer; si no se pudo guardar, LANZA (nunca lo pierde en silencio). */
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
    tipo: "memoria",
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
    // (ARC1108A) Antes volvía sin guardar nada y el trozo se daba por recibido: un hueco silencioso
    // que solo se veía como «hash-no-coincide». Ahora lanza y el almacén en cadena prueba el siguiente.
    if (!dir) throw new Error("OPFS no deja abrir la carpeta de la transferencia");
    const fh = await dir.getFileHandle(String(index), { create: true });
    if (typeof (fh as Partial<FileHandleOPFS>).createWritable !== "function") throw new Error("OPFS sin createWritable en este navegador");
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
      return await bytesExactos(await file.arrayBuffer());
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
  return { tipo: "OPFS", guardarTrozo, leerTrozo, indicesGuardados, ensamblar, limpiar };
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
      const crudo = await new Promise<unknown>((ok, falla) => {
        const req = db.transaction(TABLA, "readonly").objectStore(TABLA).get(claveDe(id, index));
        req.onsuccess = () => ok(req.result ?? null);
        req.onerror = () => falla(req.error);
      });
      // (ARC1108A) Lo guardado vuelve tal cual se guardó: si alguna vez fue una vista o un Blob, bytes exactos.
      return await bytesExactos(crudo);
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
  return { tipo: "IndexedDB", guardarTrozo, leerTrozo, indicesGuardados, ensamblar, limpiar };
}

/**
 * (ARC1108A) ¿Se puede ESCRIBIR en OPFS desde la página? `navigator.storage.getDirectory` existe en
 * Safari/WKWebView desde la 15.2, pero `createWritable` llegó mucho después (y en el WebView de
 * Android, también tarde): con solo lo primero, cada trozo fallaba al guardarse. Nunca lanza.
 */
export function opfsEscribible(): boolean {
  try {
    const nav = typeof navigator !== "undefined" ? (navigator as unknown as { storage?: { getDirectory?: unknown } }) : undefined;
    if (typeof nav?.storage?.getDirectory !== "function") return false;
    const fh = (globalThis as { FileSystemFileHandle?: { prototype?: { createWritable?: unknown } } }).FileSystemFileHandle;
    return typeof fh?.prototype?.createWritable === "function";
  } catch {
    return false;
  }
}

/**
 * (ARC1108A) Almacén EN CADENA: escribe en el primero que funcione y, si uno falla al guardar (OPFS
 * sin `createWritable`, cuota llena, IndexedDB bloqueado en ese origen…), lo aparta para el resto de
 * la sesión y sigue con el siguiente — normalmente la memoria, que no falla. Recuerda en cuál quedó
 * cada trozo para releerlo de ahí; lo de una sesión anterior (reanudar tras recargar) se busca en
 * todos. Nunca pierde un trozo en silencio: si ninguno lo acepta, lanza.
 */
export function crearAlmacenEnCadena(almacenes: AlmacenTrozos[]): AlmacenTrozos {
  const lista = almacenes.length ? almacenes : [crearAlmacenEnMemoria()];
  const apartados = new Set<number>();
  const donde = new Map<string, Map<number, number>>();
  const nombre = (k: number) => lista[k]?.tipo ?? `almacén ${k + 1}`;
  const activo = () => {
    for (let k = 0; k < lista.length; k++) if (!apartados.has(k)) return k;
    return -1;
  };

  const leerTrozo = async (id: string, index: number): Promise<ArrayBuffer | null> => {
    const k = donde.get(id)?.get(index);
    if (k !== undefined) {
      try {
        return await bytesExactos(await lista[k].leerTrozo(id, index));
      } catch {
        return null;
      }
    }
    for (const a of lista) {
      try {
        const d = await bytesExactos(await a.leerTrozo(id, index));
        if (d) return d;
      } catch {
        /* el siguiente */
      }
    }
    return null;
  };
  const indicesGuardados = async (id: string): Promise<number[]> => {
    const todos = new Set<number>(donde.get(id)?.keys() ?? []);
    for (const a of lista) {
      try {
        for (const i of await a.indicesGuardados(id)) todos.add(i);
      } catch {
        /* el siguiente */
      }
    }
    return Array.from(todos).sort((x, y) => x - y);
  };

  return {
    get tipo() {
      const k = activo();
      const base = k >= 0 ? nombre(k) : "ninguno";
      return apartados.size ? `${base} (tras fallar ${Array.from(apartados, nombre).join(" y ")})` : base;
    },
    async guardarTrozo(id, index, datos) {
      let ultimo: unknown = null;
      for (let k = 0; k < lista.length; k++) {
        if (apartados.has(k)) continue;
        try {
          await lista[k].guardarTrozo(id, index, datos);
          let m = donde.get(id);
          if (!m) {
            m = new Map();
            donde.set(id, m);
          }
          m.set(index, k);
          return;
        } catch (e) {
          ultimo = e;
          apartados.add(k);
        }
      }
      throw ultimo instanceof Error ? ultimo : new Error("ningún almacenamiento aceptó el trozo");
    },
    leerTrozo,
    indicesGuardados,
    async ensamblar(id, tipoMime) {
      const partes: ArrayBuffer[] = [];
      for (const i of await indicesGuardados(id)) {
        const d = await leerTrozo(id, i);
        if (d) partes.push(d);
      }
      return new Blob(partes, { type: tipoMime });
    },
    async limpiar(id) {
      donde.delete(id);
      await Promise.all(lista.map((a) => a.limpiar(id).catch(() => undefined)));
    },
  };
}

/**
 * Elige OPFS > IndexedDB > memoria, según lo que dé el entorno, EN CADENA (ARC1108A): si el elegido
 * falla al escribir, el trozo va al siguiente en vez de perderse. Nunca lanza.
 */
export function crearAlmacenAuto(): AlmacenTrozos {
  const cadena: AlmacenTrozos[] = [];
  if (opfsEscribible()) cadena.push(crearAlmacenOPFS());
  try {
    if (typeof indexedDB !== "undefined") cadena.push(crearAlmacenIDB());
  } catch {
    /* sigue al siguiente */
  }
  cadena.push(crearAlmacenEnMemoria());
  return crearAlmacenEnCadena(cadena);
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
  /** Id de la neurona del otro extremo: la confianza de la retícula se guarda contra ella. */
  nodoId?: string;
  /** Solo se consulta si `mismaCuenta` es false. Por defecto: deniega (ver arriba). */
  verificarPermiso?: () => boolean | Promise<boolean>;
  /** (ARC1108A) Por dónde llegó («Red local (app nativa) · enlace directo»…), para la ventana del envío. */
  via?: string;
  /** (ARC1108A) Cómo se comprobó quién lo manda. */
  verificacion?: VerificacionOrigen;
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
  | "reintentando"
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
  /** (ARC1108A) En «error»: código corto (`archivo.error.motivo`) y lado donde falló. */
  codigo?: string;
  lado?: LadoFallo;
  /** (ARC1108A) Solo rol "recibir": lo que trae la oferta para la ventana del envío (todo saneado). */
  lote?: string;
  loteTotal?: number;
  mensaje?: string;
  ruta?: string;
  vista?: VistaOferta;
  inicioB64?: string;
  sha256?: string;
  via?: string;
  verificacion?: VerificacionOrigen;
}

export interface OfertaEntranteInfo {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  destino: DestinoArchivo;
  origen?: string;
  lote?: string;
  ruta?: string;
}

/** Política de reintento automático para envíos que fallan. */
export interface PoliticaReintento {
  /** Número máximo de intentos de reintento (además del intento inicial). Por defecto 5. */
  maxIntentos?: number;
  /** Espera base en ms para el backoff exponencial. Por defecto 500 ms. */
  esperaBaseMs?: number;
  /** Factor de multiplicación por intento (exponencial). Por defecto 2. */
  factorBackoff?: number;
  /** Jitter aleatorio ± (ms) para evitar sincronización. Por defecto 100 ms. */
  jitterMs?: number;
  /** Tiempo máximo de espera entre reintentos (techo). Por defecto 30 000 ms. */
  esperaMaximaMs?: number;
}

/** Política de reintento por defecto: 5 intentos, backoff exponencial 500ms * 2^n + jitter. */
export const POLITICA_REINTENTO_POR_DEFECTO: Required<PoliticaReintento> = {
  maxIntentos: 5,
  esperaBaseMs: 500,
  factorBackoff: 2,
  jitterMs: 100,
  esperaMaximaMs: 30_000,
};

export interface ConfigMotorArchivos {
  almacen?: AlmacenTrozos;
  politica?: PoliticaRecepcion;
  /** Política de reintento automático para envíos. Por defecto: 5 intentos con backoff exponencial. */
  reintento?: PoliticaReintento;
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
  /**
   * (ARC1108A) Cuánto espera el remitente, tras mandar «fin», a que el receptor confirme (ok/error) antes
   * de darlo por fallido con «Reintentar» a mano. Por defecto 60 s + 50 ms por trozo.
   */
  esperaVerificacionMs?: (trozos: number) => number;
  /** (ARC1108A) Cuánto espera el receptor, tras «fin», a los trozos que aún no llegaron (varios caminos). Por defecto 15 s. */
  esperaTrozosFaltantesMs?: number;
}

/** (ARC1108A) Lo que se puede añadir a una oferta al mandarla (el envío al que pertenece, su ruta, su vista). */
export interface OpcionesEnvioArchivo {
  tipoMime?: string;
  idTransferencia?: string;
  /** Envío (varios archivos juntos): mismo `id` en todos; `total` y `mensaje` opcionales. */
  lote?: { id: string; total?: number; mensaje?: string };
  /** Ruta relativa dentro de la carpeta enviada (`File.webkitRelativePath`). */
  ruta?: string;
  /** Vista previa ya calculada (miniatura o fragmento de texto). */
  vista?: VistaOferta;
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
    opciones?: OpcionesEnvioArchivo,
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
  /** Resonancia (§5.6): veredicto antivirus firmado que llega de otra neurona. Solo informa. */
  registrarVeredicto(veredicto: VeredictoCompartido): void;
  /** Confianza actual de una neurona según los eventos observados en este motor. */
  confianzaDe(nodoId: string): number;
  /** Consenso de la red sobre un hash (cuarentena/aviso/limpio/sin-datos). */
  decisionSobre(hash: string): ResultadoResonancia;
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
  const reintentoConfig = { ...POLITICA_REINTENTO_POR_DEFECTO, ...config.reintento };

  const canalPorId = new Map<string, CanalArchivos>();
  const intentosReintento = new Map<string, number>();
  const archivosEnvio = new Map<string, Blob>();
  const desdePorId = new Map<string, number>();
  const hashesEsperados = new Map<string, string>();
  const recibidosPorId = new Map<string, Set<number>>();
  const ofertasEntrantes = new Map<string, MsgOferta>();
  const cancelados = new Set<string>();
  const blobsRecibidos = new Map<string, Blob>();
  const modoPorId = new Map<string, ModoTransferencia>();
  // (ARC1108A) Receptor: escrituras de trozos EN CURSO (un trozo cuenta como recibido solo cuando su
  // escritura terminó; «fin» espera a todas), fallos del almacén, «fin» que se está verificando y
  // ofertas que la persona ya aceptó (un reintento del mismo archivo, mismo SHA-256, no vuelve a preguntar).
  const escrituras = new Map<string, Map<number, Promise<string | null>>>();
  const fallosAlmacen = new Map<string, string>();
  const verificandoFin = new Set<string>();
  const aceptadas = new Map<string, { sha256: string; tamano: number }>();
  // (ARC1108A) Remitente: transferencias que ya están saliendo (un «aceptar» repetido no abre otro
  // bucle), la oferta enviada (para reanudar sin recalcular el hash) y la espera de la verificación.
  const transmitiendo = new Set<string>();
  const ofertasEnviadas = new Map<string, MsgOferta>();
  const vigias = new Map<string, ReturnType<typeof setTimeout>>();
  const reanudacionesAuto = new Map<string, number>();
  const esperaVerificacion = config.esperaVerificacionMs ?? ((trozos: number) => 60_000 + trozos * 50);
  const ESPERA_FALTANTES_MS = config.esperaTrozosFaltantesMs ?? 15_000;
  // Resonancia (§5.6): confianza por neurona y veredictos antivirus de la red.
  const confianzaNodos = new Map<string, number>();
  const veredictosRed: VeredictoCompartido[] = [];
  const nodoPorId = new Map<string, string>();

  function aplicarEventoA(idTransferencia: string, ev: Parameters<typeof actualizarConfianza>[1]): void {
    const nodo = nodoPorId.get(idTransferencia);
    if (!nodo) return;
    confianzaNodos.set(nodo, actualizarConfianza(confianzaNodos.get(nodo) ?? CONFIANZA_INICIAL, ev));
  }

  function confianzaDe(nodoId: string): number {
    return confianzaNodos.get(nodoId) ?? CONFIANZA_INICIAL;
  }

  function decisionSobre(hash: string): ResultadoResonancia {
    const registro: Record<string, number> = {};
    for (const [nodo, c] of confianzaNodos) registro[nodo] = c;
    return decisionPorResonancia(hash, veredictosRed, registro);
  }

  function registrarVeredicto(veredicto: VeredictoCompartido): void {
    veredictosRed.push(veredicto);
    // Tope humilde para no crecer sin límite dentro de una pestaña larga.
    if (veredictosRed.length > 5000) veredictosRed.splice(0, veredictosRed.length - 5000);
  }

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
    opciones?: OpcionesEnvioArchivo,
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

    // (ARC1108A) Los primeros bytes viajan con la oferta: el receptor inspecciona el tipo real ANTES de aceptar.
    let inicioB64: string | undefined;
    try {
      inicioB64 = tamano > 0 ? sanearInicio(bufAB64(await archivo.slice(0, MAX_INICIO_BYTES).arrayBuffer())) : undefined;
    } catch {
      inicioB64 = undefined;
    }

    canalPorId.set(id, canal);
    archivosEnvio.set(id, archivo);
    cancelados.delete(id);
    // Un reintento con el mismo id empieza limpio: ni bucle viejo, ni espera de verificación vieja.
    limpiarVigia(id);
    reanudacionesAuto.delete(id);
    intentosReintento.delete(id);

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
    // (ARC1108A) El envío al que pertenece, su ruta en la carpeta y su vista previa (todo opcional y saneado).
    const lote = sanearLote(opciones?.lote?.id);
    if (lote) {
      oferta.lote = lote;
      const total = opciones?.lote?.total;
      if (typeof total === "number" && Number.isInteger(total) && total > 0 && total <= 10_000) oferta.loteTotal = total;
      const mensaje = sanearMensajeEnvio(opciones?.lote?.mensaje);
      if (mensaje) oferta.loteMensaje = mensaje;
    }
    const ruta = sanearRutaRelativa(opciones?.ruta);
    if (ruta && ruta !== nombre) oferta.ruta = ruta;
    if (inicioB64) oferta.inicioB64 = inicioB64;
    const vista = sanearVista(opciones?.vista);
    if (vista) oferta.vista = vista;
    ofertasEnviadas.set(id, oferta);
    canal.enviar(JSON.stringify(oferta));
    return { ok: true, id, aviso };
  }

  /** (ARC1108A) Quita la espera de verificación de una transferencia enviada. */
  function limpiarVigia(id: string): void {
    const t = vigias.get(id);
    if (t !== undefined) clearTimeout(t);
    vigias.delete(id);
  }

  /**
   * (ARC1108A) Tras mandar «fin», el remitente queda en «verificando» hasta que el receptor diga ok o
   * error. Si no dice nada (app cerrada, sin memoria…), no se queda colgado para siempre: pasa a error
   * con «Reintentar», que reanuda desde el primer trozo que le falte al otro.
   */
  function vigilarVerificacion(id: string, trozos: number): void {
    limpiarVigia(id);
    const ms = Math.max(1, esperaVerificacion(trozos));
    const t = setTimeout(() => {
      vigias.delete(id);
      const e = estados.get(id);
      if (!e || e.rol !== "enviar" || e.fase !== "verificando") return;
      emitir({
        ...e,
        fase: "error",
        motivo: textoErrorRemoto({ motivo: "sin-confirmacion", detalle: `sin respuesta en ${Math.round(ms / 1000)} s tras mandar el último trozo (¿app cerrada o sin memoria?)`, lado: "receptor" }),
        codigo: "sin-confirmacion",
        lado: "receptor",
        actualizadoMs: Date.now(),
      });
    }, ms);
    (t as { unref?: () => void }).unref?.();
    vigias.set(id, t);
  }

  async function transmitir(id: string): Promise<void> {
    const canal = canalPorId.get(id);
    const archivo = archivosEnvio.get(id);
    const estado = estados.get(id);
    if (!canal || !archivo || !estado) return;
    actualizarFase(id, "transfiriendo");
    const desde = desdePorId.get(id) ?? 0;
    const modo = modoPorId.get(id) ?? "base64";
    let i = desde;
    while (i < estado.trozos) {
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
        // Fallo de envío: iniciar reintento con backoff exponencial
        const intentoActual = intentosReintento.get(id) ?? 0;
        if (intentoActual >= reintentoConfig.maxIntentos) {
          const e = estados.get(id);
          if (e) {
            emitir({
              ...e,
              fase: "error",
              motivo: `Falló en el remitente: no se pudo enviar el trozo ${i} tras ${reintentoConfig.maxIntentos} reintentos (el canal no recupera).`,
              codigo: "canal-no-recupera",
              lado: "remitente",
              actualizadoMs: Date.now(),
            });
          }
          intentosReintento.delete(id);
          return;
        }
        const espera = Math.min(
          reintentoConfig.esperaBaseMs * Math.pow(reintentoConfig.factorBackoff, intentoActual) +
            (Math.random() * 2 - 1) * reintentoConfig.jitterMs,
          reintentoConfig.esperaMaximaMs,
        );
        intentosReintento.set(id, intentoActual + 1);
        actualizarFase(id, "reintentando", `Fallo en trozo ${i}. Reintento ${intentoActual + 1}/${reintentoConfig.maxIntentos} en ${Math.round(espera)} ms…`);
        await esperar(Math.max(0, espera));
        // No incrementamos i: reintentamos el mismo trozo
        continue;
      }
      // Envío exitoso: resetear contador de reintentos para este id
      intentosReintento.delete(id);
      actualizarProgreso(id, i + 1);
      i++;
    }
    if (cancelados.has(id)) return;
    // «fin» (con un par de reintentos si el canal está un momento lleno) y, desde ARC1108A, el
    // remitente queda «verificando» hasta que el receptor confirme: nunca colgado sin decir nada.
    let finSalio = false;
    for (let intento = 0; intento < 4 && !finSalio && !cancelados.has(id); intento++) {
      if (intento > 0) await esperar(reintentoConfig.esperaBaseMs * intento);
      finSalio = canal.enviar(JSON.stringify({ t: "archivo.fin", id } satisfies MsgFin));
    }
    const e = estados.get(id);
    if (!e || cancelados.has(id)) return;
    if (!finSalio) {
      emitir({ ...e, fase: "error", motivo: "Falló en el remitente: no se pudo mandar el aviso de fin (el canal no recupera).", codigo: "canal-no-recupera", lado: "remitente", actualizadoMs: Date.now() });
      return;
    }
    if (e.fase === "transfiriendo" || e.fase === "reintentando") {
      emitir({ ...e, fase: "verificando", motivo: "Esperando a que el otro aparato verifique el SHA-256…", actualizadoMs: Date.now() });
      vigilarVerificacion(id, e.trozos);
    }
  }

  function manejarAceptar(msg: MsgAceptar): void {
    const estado = estados.get(msg.id);
    if (!estado || estado.rol !== "enviar") return;
    // (ARC1108A) Un «aceptar» repetido (trama reenviada) no abre un segundo bucle de envío.
    if (transmitiendo.has(msg.id) || estado.fase === "completada") return;
    const desde = typeof msg.desde === "number" && Number.isInteger(msg.desde) ? Math.min(Math.max(0, msg.desde), estado.trozos) : 0;
    desdePorId.set(msg.id, desde);
    // Respetar el modo confirmado por el receptor.
    if (msg.modo) {
      modoPorId.set(msg.id, msg.modo);
    }
    // Reanudación: limpiar contador de reintentos previos y la espera de una verificación anterior
    intentosReintento.delete(msg.id);
    limpiarVigia(msg.id);
    transmitiendo.add(msg.id);
    void transmitir(msg.id).finally(() => transmitiendo.delete(msg.id));
  }

  function manejarRechazar(msg: MsgRechazar): void {
    actualizarFase(msg.id, "rechazada", msg.motivo);
    // (ARC1108A) El archivo se queda: «Reintentar» lo vuelve a ofrecer sin volver a adjuntarlo.
    canalPorId.delete(msg.id);
    intentosReintento.delete(msg.id);
    limpiarVigia(msg.id);
  }

  function manejarOk(msg: MsgOk): void {
    const e = estados.get(msg.id);
    if (!e || e.rol !== "enviar") return;
    limpiarVigia(msg.id);
    emitir({ ...e, fase: "completada", progreso: e.trozos, motivo: undefined, codigo: undefined, lado: undefined, actualizadoMs: Date.now() });
    archivosEnvio.delete(msg.id);
    canalPorId.delete(msg.id);
    desdePorId.delete(msg.id);
    intentosReintento.delete(msg.id);
    ofertasEnviadas.delete(msg.id);
    reanudacionesAuto.delete(msg.id);
  }

  /**
   * (ARC1108A) Error que manda el otro lado. La burbuja dice DÓNDE falló y por qué (no un código suelto),
   * el archivo se queda para «Reintentar» y, si solo faltaban trozos, se reanuda solo (dos veces como
   * mucho) desde el primero que falta: el receptor ya lo aceptó y no vuelve a preguntar.
   */
  function manejarErrorRemoto(canal: CanalArchivos, msg: MsgError): void {
    const e = estados.get(msg.id);
    if (!e) return;
    limpiarVigia(msg.id);
    intentosReintento.delete(msg.id);
    const lado: LadoFallo = msg.lado ?? (e.rol === "enviar" ? "receptor" : "remitente");
    const oferta = ofertasEnviadas.get(msg.id);
    const hechas = reanudacionesAuto.get(msg.id) ?? 0;
    if (e.rol === "enviar" && msg.motivo === "faltan-trozos" && oferta && archivosEnvio.has(msg.id) && hechas < 2 && !cancelados.has(msg.id)) {
      reanudacionesAuto.set(msg.id, hechas + 1);
      emitir({ ...e, fase: "reintentando", motivo: `${textoErrorRemoto({ ...msg, lado })} Reanudando solo (${hechas + 1}/2)…`, codigo: msg.motivo, lado, actualizadoMs: Date.now() });
      canalPorId.set(msg.id, canalPorId.get(msg.id) ?? canal);
      (canalPorId.get(msg.id) ?? canal).enviar(JSON.stringify(oferta));
      return;
    }
    emitir({ ...e, fase: "error", motivo: textoErrorRemoto({ ...msg, lado }), codigo: msg.motivo, lado, actualizadoMs: Date.now() });
  }

  /* ---------------- receptor ---------------- */

  /** (ARC1108A) Nombre de archivo para enseñar: sin control ni carpetas, ≤ 180 caracteres. */
  function nombreSaneado(x: string): string {
    const limpio = String(x ?? "").replace(CONTROL, "").split(/[\\/]/).pop()?.trim() ?? "";
    return (limpio || "archivo").slice(0, 180);
  }

  /** (ARC1108A) Lo que la ventana del envío necesita de una oferta (todo saneado: viene del otro aparato). */
  function extrasDeOferta(msg: MsgOferta, ctx: ContextoRecepcion): Partial<EstadoTransferencia> {
    const extras: Partial<EstadoTransferencia> = { sha256: msg.sha256 };
    const lote = sanearLote(msg.lote);
    if (lote) {
      extras.lote = lote;
      if (typeof msg.loteTotal === "number" && Number.isInteger(msg.loteTotal) && msg.loteTotal > 0 && msg.loteTotal <= 10_000) extras.loteTotal = msg.loteTotal;
    }
    const mensaje = sanearMensajeEnvio(msg.loteMensaje);
    if (mensaje) extras.mensaje = mensaje;
    const ruta = sanearRutaRelativa(msg.ruta);
    if (ruta) extras.ruta = ruta;
    const vista = sanearVista(msg.vista);
    if (vista) extras.vista = vista;
    const inicio = sanearInicio(msg.inicioB64);
    if (inicio) extras.inicioB64 = inicio;
    if (ctx.via) extras.via = ctx.via.slice(0, 160);
    if (ctx.verificacion) extras.verificacion = ctx.verificacion;
    return extras;
  }

  /**
   * (ARC1108A) Acepta: recuerda el hash esperado y que la persona aceptó ESTE archivo (un reintento con
   * el mismo SHA-256 no vuelve a preguntar), pinta «transfiriendo» y pide los trozos desde el PRIMERO
   * que falta (con huecos —varios caminos, una recarga— el primer hueco, no «el mayor + 1»).
   */
  function pedirTrozos(canal: CanalArchivos, oferta: MsgOferta, tenidos: Set<number>, estado: EstadoTransferencia): void {
    const id = oferta.id;
    hashesEsperados.set(id, oferta.sha256);
    aceptadas.set(id, { sha256: oferta.sha256, tamano: oferta.tamano });
    recibidosPorId.set(id, tenidos);
    fallosAlmacen.delete(id);
    const desde = primerFaltante(tenidos, oferta.trozos);
    emitir({ ...estado, fase: "transfiriendo", progreso: tenidos.size, actualizadoMs: Date.now() });
    const modo = modoPorId.get(id) ?? "base64";
    canal.enviar(JSON.stringify({ t: "archivo.aceptar", id, modo, ...(desde > 0 ? { desde } : {}) } satisfies MsgAceptar));
  }

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
    if (!Number.isInteger(msg.trozos) || msg.trozos < 1 || msg.trozos > 1_000_000 || !(msg.tamano >= 0)) {
      canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo: "Oferta mal formada (trozos o tamaño imposibles)." } satisfies MsgRechazar));
      return;
    }
    const ctx: ContextoRecepcion = contexto ?? { mismaCuenta: false };
    // Una oferta nueva es un intento nuevo, aunque repita el id de uno cancelado (reintento).
    cancelados.delete(msg.id);
    canalPorId.set(msg.id, canal);
    ofertasEntrantes.set(msg.id, msg);
    if (ctx.nodoId) nodoPorId.set(msg.id, ctx.nodoId);
    const previo = estados.get(msg.id);
    // (ARC1108A) ¿La persona ya aceptó ESTE archivo (mismo id, SHA-256 y tamaño)? Es un reintento o una reanudación.
    const yaAceptada = aceptadas.get(msg.id);
    const mismoArchivo = !!yaAceptada && yaAceptada.sha256 === msg.sha256 && yaAceptada.tamano === msg.tamano;
    if (mismoArchivo && previo?.rol === "recibir" && previo.fase === "completada" && blobsRecibidos.has(msg.id)) {
      // Ya está aquí y verificado (el «ok» se perdió): se le repite al remitente sin pedir nada.
      canal.enviar(JSON.stringify({ t: "archivo.ok", id: msg.id } satisfies MsgOk));
      return;
    }
    // Resonancia (§5.6): lo que la red ya sabe de este hash informa la política.
    // «Cuarentena y pregunta»: nunca auto-aceptar un hash en cuarentena, y un
    // aviso tampoco se esconde — pasa a «preguntar» con el motivo en la tarjeta.
    const resonancia = decisionSobre(msg.sha256);
    const avisoResonancia: Record<DecisionResonancia, string | undefined> = {
      cuarentena: `En CUARENTENA de la red: ${resonancia.motivo}. No se auto-acepta.`,
      aviso: `Aviso de la red: ${resonancia.motivo}.`,
      limpio: undefined,
      'sin-datos': undefined,
    };
    const aviso = avisoResonancia[resonancia.decision];

    // Lo que ya hay de este archivo (reanudar tras recargar o tras un corte) y el centinela (§5), que
    // analiza el inicio del archivo si su primer trozo ya está guardado (si no, el inicio vacío).
    let yaGuardados: number[] = [];
    try {
      yaGuardados = (await almacen.indicesGuardados(msg.id)).filter((i) => Number.isInteger(i) && i >= 0 && i < msg.trozos);
    } catch {
      yaGuardados = [];
    }
    const tenidos = new Set<number>([...yaGuardados, ...(recibidosPorId.get(msg.id) ?? [])].filter((i) => i < msg.trozos));
    let inicioBuf = new Uint8Array(0);
    if (tenidos.has(0)) {
      const primerTrozo = await almacen.leerTrozo(msg.id, 0).catch(() => null);
      if (primerTrozo) inicioBuf = new Uint8Array(primerTrozo);
    }
    const analisisArchivo = analizarArchivo({
      nombre: msg.nombre,
      tipoDeclarado: msg.tipo,
      inicio: inicioBuf,
      tamano: msg.tamano,
    });
    const entrada = decidirEntrada(analisisArchivo, resonancia ? { decision: resonancia.decision } : null);

    const base: EstadoTransferencia = {
      id: msg.id,
      rol: 'recibir',
      nombre: nombreSaneado(msg.nombre),
      tipo: msg.tipo,
      tamano: msg.tamano,
      trozos: msg.trozos,
      progreso: tenidos.size,
      fase: 'pendiente-aceptar',
      destino: msg.destino,
      origen: msg.origen ?? ctx.etiquetaOrigen,
      inicioMs: Date.now(),
      actualizadoMs: Date.now(),
      ...extrasDeOferta(msg, ctx),
    };

    // Aplicación inmediata del centinela (rechazar no pasa por política de recepción).
    if (entrada.accion === 'rechazar') {
      const motivoRechazo = entrada.texto ? `Rechazado por el centinela: ${entrada.texto}` : 'Rechazado por el centinela.';
      emitir({ ...base, progreso: 0, fase: 'rechazada', motivo: motivoRechazo });
      canal.enviar(JSON.stringify({ t: 'archivo.rechazar', id: msg.id, motivo: motivoRechazo } satisfies MsgRechazar));
      ofertasEntrantes.delete(msg.id);
      return;
    }

    // Avisos: se añade al aviso existente (resonancia o centinela).
    let avisoFinal = aviso;
    if (entrada.accion === 'avisar' && entrada.texto) {
      avisoFinal = aviso ? `${aviso} | ${entrada.texto}` : entrada.texto;
    }
    const estadoBase: EstadoTransferencia = { ...base, ...(avisoFinal ? { motivo: avisoFinal } : {}) };

    // Negociar modo: si el oferente pide binario y nuestro canal lo soporta, usamos binario.
    const modo: ModoTransferencia = msg.modo === 'binario' && canal.enviarBinario ? 'binario' : 'base64';
    modoPorId.set(msg.id, modo);

    // (ARC1108A) Reintento o reanudación de algo ya aceptado: no se vuelve a preguntar.
    if (mismoArchivo) {
      pedirTrozos(canal, msg, tenidos, estadoBase);
      return;
    }

    const decision = await Promise.resolve((config.politica ?? politicaPorDefecto)(ctx));

    if (decision === "denegar") {
      emitir({ ...estadoBase, fase: "rechazada", motivo: "Sin permiso para recibir archivos de esta cuenta." });
      canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo: "denegado por política de permisos" } satisfies MsgRechazar));
      ofertasEntrantes.delete(msg.id);
      return;
    }

    if (decision === "auto-aceptar" && !avisoFinal) {
      pedirTrozos(canal, msg, tenidos, estadoBase);
      return;
    }

    // "preguntar": queda pendiente hasta que la UI llame aceptarOferta/rechazarOferta.
    recibidosPorId.set(msg.id, tenidos);
    emitir(estadoBase);
    config.onOfertaEntrante?.({
      id: msg.id,
      nombre: estadoBase.nombre,
      tipo: msg.tipo,
      tamano: msg.tamano,
      destino: msg.destino,
      origen: estadoBase.origen,
      ...(estadoBase.lote ? { lote: estadoBase.lote } : {}),
      ...(estadoBase.ruta ? { ruta: estadoBase.ruta } : {}),
    });
  }

  function aceptarOferta(id: string): void {
    const oferta = ofertasEntrantes.get(id);
    const canal = canalPorId.get(id);
    const e = estados.get(id);
    // Solo lo que espera respuesta (un doble clic, o «Aceptar todos» tras aceptar uno, no repite nada).
    if (!oferta || !canal || !e || e.fase !== "pendiente-aceptar") return;
    pedirTrozos(canal, oferta, recibidosPorId.get(id) ?? new Set<number>(), e);
  }

  function rechazarOferta(id: string, motivo = "Rechazado por el usuario."): void {
    const e = estados.get(id);
    if (e && e.rol === "recibir" && e.fase === "completada") return;
    const canal = canalPorId.get(id);
    actualizarFase(id, "rechazada", motivo);
    canal?.enviar(JSON.stringify({ t: "archivo.rechazar", id, motivo } satisfies MsgRechazar));
    ofertasEntrantes.delete(id);
  }

  /**
   * (ARC1108A) Un trozo que llega (base64 o binario, por cualquier camino). CAUSA RAÍZ del
   * «hash-no-coincide» de la prueba del 08-11: el camino binario guardaba el trozo SIN esperar y lo
   * contaba como recibido en el acto; con un almacén asíncrono (OPFS/IndexedDB), «fin» verificaba
   * antes de que la escritura terminara y leía un trozo vacío. Ahora los dos caminos pasan por aquí: el
   * trozo cuenta SOLO cuando el almacén terminó de guardarlo, un duplicado (trama reenviada, varios
   * caminos) no se escribe dos veces y un fallo del almacén se recuerda para decirlo, nunca en silencio.
   */
  async function recibirTrozo(id: string, index: number, datosDe: () => ArrayBuffer | null): Promise<void> {
    if (cancelados.has(id) || !Number.isInteger(index) || index < 0) return;
    const estado = estados.get(id);
    if (estado) {
      if (estado.rol !== "recibir" || index >= estado.trozos) return;
      // Solo mientras se recibe: nada de escribir después de verificar, rechazar o fallar.
      if (estado.fase !== "transfiriendo" && estado.fase !== "verificando" && estado.fase !== "reintentando") return;
    }
    let set = recibidosPorId.get(id);
    if (!set) {
      set = new Set<number>();
      recibidosPorId.set(id, set);
    }
    if (set.has(index)) return; // duplicado ya guardado
    let enVuelo = escrituras.get(id);
    if (!enVuelo) {
      enVuelo = new Map();
      escrituras.set(id, enVuelo);
    }
    if (enVuelo.has(index)) return; // duplicado que llega mientras el primero se guarda
    let datos: ArrayBuffer | null = null;
    try {
      datos = datosDe();
    } catch {
      datos = null;
    }
    if (!datos) return;
    const escritura = almacen.guardarTrozo(id, index, datos).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)) || "error desconocido",
    );
    enVuelo.set(index, escritura);
    const fallo = await escritura;
    enVuelo.delete(index);
    if (fallo) {
      if (!fallosAlmacen.has(id)) fallosAlmacen.set(id, `el trozo ${index} no se pudo guardar en ${almacen.tipo ?? "el almacenamiento"} (${fallo})`);
      return;
    }
    if (cancelados.has(id)) return;
    const actual = recibidosPorId.get(id);
    if (!actual) return; // la transferencia se limpió mientras se guardaba
    actual.add(index);
    actualizarProgreso(id, actual.size);
  }

  /** (ARC1108A) Espera a que terminen TODAS las escrituras en curso de una transferencia. */
  async function esperarEscrituras(id: string): Promise<void> {
    for (let vueltas = 0; vueltas < 1000; vueltas++) {
      const enVuelo = escrituras.get(id);
      if (!enVuelo || enVuelo.size === 0) return;
      await Promise.all(Array.from(enVuelo.values()));
    }
  }

  /**
   * (ARC1108A) Falla la recepción DICIÉNDOLO: la burbuja de aquí y la del remitente explican qué pasó y
   * en qué lado. `limpiar: false` conserva los trozos (si solo faltaban algunos, se reanuda desde ahí).
   */
  async function fallarRecepcion(canal: CanalArchivos, id: string, codigo: string, detalle: string, opciones: { limpiar: boolean; desde?: number }): Promise<void> {
    const e = estados.get(id);
    if (e) {
      emitir({ ...e, fase: "error", motivo: `Falló en este aparato (receptor): ${describirErrorArchivo(codigo)} — ${detalle}.`, codigo, lado: "receptor", actualizadoMs: Date.now() });
    }
    const salida = canalPorId.get(id) ?? canal;
    salida.enviar(JSON.stringify({ t: "archivo.error", id, motivo: codigo, detalle, lado: "receptor", ...(opciones.desde !== undefined ? { desde: opciones.desde } : {}) } satisfies MsgError));
    fallosAlmacen.delete(id);
    if (opciones.limpiar) {
      await almacen.limpiar(id).catch(() => undefined);
      recibidosPorId.delete(id);
      escrituras.delete(id);
    }
  }

  async function manejarFin(canal: CanalArchivos, msg: MsgFin): Promise<void> {
    const id = msg.id;
    const estado = estados.get(id);
    if (!estado || estado.rol !== "recibir" || cancelados.has(id)) return;
    if (estado.fase === "completada") {
      // (ARC1108A) «fin» repetido (su trama se reenvió al perderse el acuse): el archivo YA está
      // verificado y ensamblado; se repite el «ok» y no se toca nada (antes se reensamblaba sobre el
      // almacén ya limpio y el archivo recibido quedaba VACÍO, o se mandaba un «hash-no-coincide»).
      canal.enviar(JSON.stringify({ t: "archivo.ok", id } satisfies MsgOk));
      return;
    }
    if (estado.fase !== "transfiriendo" && estado.fase !== "reintentando") return;
    if (verificandoFin.has(id)) return; // otro «fin» de la misma transferencia ya se está verificando
    verificandoFin.add(id);
    try {
      actualizarFase(id, "verificando");
      // (2026-10-10 · transporte universal) Por VARIOS enlaces a la vez (`canal-multitrayecto.ts`)
      // el «fin» puede llegar antes que el último trozo de otro camino: se espera a tenerlos todos
      // (como mucho 15 s) antes de verificar. Con un solo canal no espera nada.
      for (let t0 = Date.now(); (recibidosPorId.get(id)?.size ?? 0) < estado.trozos && Date.now() - t0 < ESPERA_FALTANTES_MS; ) {
        if (cancelados.has(id)) return;
        if (fallosAlmacen.has(id) && (escrituras.get(id)?.size ?? 0) === 0) break;
        await esperar(50);
      }
      // (ARC1108A) Y a que terminen TODAS las escrituras: nunca se verifica a medio guardar.
      await esperarEscrituras(id);
      if (cancelados.has(id)) return;
      const fallo = fallosAlmacen.get(id);
      if (fallo) {
        await fallarRecepcion(canal, id, "almacen-receptor", fallo, { limpiar: true });
        return;
      }
      const tenidos = recibidosPorId.get(id) ?? new Set<number>();
      const faltan: number[] = [];
      for (let i = 0; i < estado.trozos; i++) if (!tenidos.has(i)) faltan.push(i);
      if (faltan.length) {
        // Se conservan los trozos: el remitente reanuda desde el primero que falta.
        await fallarRecepcion(
          canal,
          id,
          "faltan-trozos",
          `llegaron ${estado.trozos - faltan.length} de ${estado.trozos} trozos (falta el ${faltan[0]}${faltan.length > 1 ? ` y ${faltan.length - 1} más` : ""})`,
          { limpiar: false, desde: faltan[0] },
        );
        return;
      }
      let ilegible: number | null = null;
      const leerTrozo = async (i: number) => {
        const d = await almacen.leerTrozo(id, i).catch(() => null);
        if (d) return d;
        ilegible ??= i;
        return new ArrayBuffer(0);
      };
      const { raiz } = await calcularHashLista(leerTrozo, estado.trozos);
      if (ilegible !== null) {
        await fallarRecepcion(canal, id, "almacen-receptor", `el trozo ${ilegible} no se pudo releer de ${almacen.tipo ?? "el almacenamiento"}`, { limpiar: true });
        return;
      }
      const esperado = hashesEsperados.get(id);
      if (esperado && raiz !== esperado) {
        // Trama que no supera la autoverificación: pesa contra la neurona que la envió (§5.6).
        aplicarEventoA(id, "trama-corrupta");
        await fallarRecepcion(canal, id, "hash-no-coincide", `llegaron los ${estado.trozos} trozos, guardados en ${almacen.tipo ?? "el almacenamiento"}, pero su SHA-256 no es el del original`, { limpiar: true });
        return;
      }
      const blob = await almacen.ensamblar(id, estado.tipo);
      if (blob.size !== estado.tamano) {
        await fallarRecepcion(canal, id, "almacen-receptor", `el archivo ensamblado mide ${blob.size} B y no los ${estado.tamano} B anunciados`, { limpiar: true });
        return;
      }
      blobsRecibidos.set(id, blob);
      // Integridad verificada por la neurona origen: la confianza sube.
      aplicarEventoA(id, "firma-ok");
      actualizarFase(id, "completada");
      canal.enviar(JSON.stringify({ t: "archivo.ok", id } satisfies MsgOk));
      config.onCompletado?.(estados.get(id) as EstadoTransferencia, blob);
      await almacen.limpiar(id).catch(() => undefined);
      recibidosPorId.delete(id);
      hashesEsperados.delete(id);
      ofertasEntrantes.delete(id);
      escrituras.delete(id);
    } catch (e) {
      await fallarRecepcion(canal, id, "fallo-verificacion", e instanceof Error ? e.message : String(e), { limpiar: false }).catch(() => undefined);
    } finally {
      verificandoFin.delete(id);
    }
  }

  function manejarCancelarRemoto(msg: MsgCancelar): void {
    cancelados.add(msg.id);
    limpiarVigia(msg.id);
    actualizarFase(msg.id, "cancelada");
  }

  function cancelar(id: string): void {
    cancelados.add(id);
    limpiarVigia(id);
    const canal = canalPorId.get(id);
    canal?.enviar(JSON.stringify({ t: "archivo.cancelar", id } satisfies MsgCancelar));
    actualizarFase(id, "cancelada");
    intentosReintento.delete(id);
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
        case "archivo.chunk": {
          const b64 = msg.datosB64;
          void recibirTrozo(msg.id, msg.index, () => b64ABuf(b64));
          break;
        }
        case "archivo.fin":
          void manejarFin(canal, msg);
          break;
        case "archivo.ok":
          manejarOk(msg);
          break;
        case "archivo.error":
          manejarErrorRemoto(canal, msg);
          break;
        case "archivo.cancelar":
          manejarCancelarRemoto(msg);
          break;
        default:
          break;
      }
    } else {
      // Camino binario: trozo codificado con encodeChunkBinario (un ArrayBuffer; por si un canal da
      // una vista, se copian sus bytes exactos). Pasa por `recibirTrozo` igual que el base64.
      const buf: ArrayBuffer | null =
        data instanceof ArrayBuffer
          ? data
          : ArrayBuffer.isView(data)
            ? ((data as ArrayBufferView).buffer.slice((data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteOffset + (data as ArrayBufferView).byteLength) as ArrayBuffer)
            : null;
      const dec = buf ? decodeChunkBinario(buf) : null;
      if (!dec) return;
      void recibirTrozo(dec.id, dec.index, () => dec.datos);
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
    registrarVeredicto,
    confianzaDe,
    decisionSobre,
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
        motor.manejarMensaje(canal, data, {
          mismaCuenta: true,
          etiquetaOrigen: etiquetaDePeer?.(peerId),
          nodoId: peerId,
          via: "Malla de tu cuenta (WebRTC)",
          verificacion: { tipo: "cuenta", texto: "Aparato de tu misma cuenta (sesión verificada)" },
        });
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
