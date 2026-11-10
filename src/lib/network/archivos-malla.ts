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
 * `architecture/datos-por-la-malla.md` §8.
 *
 * (ARC1108B · 2026-11-08) Archivos GRANDES (8 MB, 50 MB, 500 MB) sin que el remitente se rinda:
 *   receptor → remitente  archivo.progreso  {id, n, fase, pct?}   (latido + acuse de lo GUARDADO)
 *   `archivo.aceptar` lleva además `acuses: 1` (este receptor late) y `huecos` (rangos que faltan).
 * El receptor calcula el SHA-256 de cada trozo AL RECIBIRLO (ya no relee todo para verificar), une
 * el archivo en UNA pasada por el almacén comprobando cada trozo y late cada pocos segundos mientras
 * guarda, verifica y une. El remitente no va más de una ventana (8 MiB) por delante de lo guardado
 * y vigila por INACTIVIDAD, no por un plazo fijo. Trozos más grandes donde el canal lo admite
 * (`CanalArchivos.tamanoTrozo`). Antes de aceptar, el receptor comprueba que el archivo CABE.
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
import { extensionDe, listarZip } from "@/lib/network/inspeccion-archivos";
import { anotarArchivo, type HitoArchivo } from "@/lib/network/archivos-diagnostico"; // ARC1110A
import { prepararArchivo } from "@/lib/malla/preparacion-archivo"; // ARC1110A

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
  /**
   * (ARC1108B) Opcional: bytes CRUDOS de un trozo que este canal lleva holgado en UN mensaje (enlace
   * directo WebRTC: 63 KiB en binario; canal TCP: lo que cabe en base64 en una trama de 64 KiB). Sin
   * esto, 16 KiB. El trozo de una transferencia se fija en su oferta (el hash depende de él).
   */
  tamanoTrozo?(): number;
  /**
   * (BLE1108B) Opcional: manda el texto y se resuelve cuando el OTRO aparato lo ACUSÓ (true) o no pudo
   * (false). Con él el remitente va a la velocidad del enlace (un trozo confirmado, el siguiente), el
   * progreso es el de lo confirmado y un corte se nota en el trozo exacto. Sin esto, `enviar`.
   */
  enviarConAcuse?(texto: string): Promise<boolean>;
  /**
   * (BLE1108B) Opcional: se resuelve true cuando el canal puede llevar el siguiente mensaje (hay enlace y su
   * cola cabe) y false si pasa un buen rato sin poderlo (sin enlace: ya se reintentará). Es la señal
   * «listo para enviar» del portador: el motor la respeta antes de CADA trozo (contrapresión).
   */
  esperarListo?(): Promise<boolean>;
  /**
   * (BLE1108C) Opcional: true si el canal tiene enlace AHORA. Sin esto se da por arriba. Con el enlace arriba,
   * «listo para enviar» se espera como mucho `ESPERA_LISTO_MS`: pasado ese plazo se manda igual (una señal que no
   * llega nunca bloquea un enlace vivo). Sin enlace se espera la señal de verdad (a que vuelva).
   */
  enlaceArriba?(): boolean;
  /** (BLE1108C) Opcional: se llama cuando se mandó sin esperar más la señal «listo» (para dejarlo en el registro). */
  alListoTarde?(): void;
  /** (BLE1108B) Opcional: bytes (UTF-8) que caben en UN mensaje por este canal; una oferta mayor se aligera. */
  maxTextoBytes?(): number;
  /**
   * (BLE1108B) Opcional: la ruta que ESTE aparato mide del enlace por el que va (`misma-red-local`,
   * `internet-directo`, `reenviado-turn`, `bluetooth-directo`…), con el clasificador común. Se manda al
   * otro lado en la oferta y en el «aceptar»; si los dos miden lo mismo, la transferencia queda «verificada por ambos».
   */
  rutaMedida?(): string | null;
  /**
   * (MPT1108A) Opcional: por dónde van los trozos ahora («LAN 72 % · Wi‑Fi directo 20 % · Bluetooth 8 %») y la
   * velocidad total, si el canal reparte entre varias vías. Solo para enseñarlo.
   */
  resumenVias?(): { texto: string; bps: number } | null;
  /**
   * (MPT1108A) Opcional: cómo viaja ESTA transferencia: «archivo» = cada trozo cifrado de punta a punta con
   * la clave del receptor; «sin-cifrado-de-archivo» = el par es antiguo y solo protege el enlace; null = no se sabe.
   */
  modoCifrado?(id: string): "archivo" | "sin-cifrado-de-archivo" | null;
  /**
   * (ARC1110A) Opcional: true si el aparato de enfrente entiende `archivo.anuncio` (la ventana de «aceptar» sin esperar a
   * que el remitente termine de preparar el archivo). Sin esto, o en false, el flujo es el de siempre: solo la oferta.
   */
  admiteAnuncio?(): boolean;
  /** Suscribe un callback a los mensajes entrantes. Devuelve función de baja. */
  alMensaje(cb: (data: string | ArrayBuffer) => void): () => void;
}

/** (BLE1108C) Plazo máximo de la señal «listo para enviar» con el enlace arriba; luego se manda igual. */
export const ESPERA_LISTO_MS = 500;

/**
 * (BLE1108C) «Listo para enviar» a prueba de señales perdidas. Con el enlace arriba (o sin saberlo) la espera
 * es de `plazoMs` como mucho: si la señal no llega, se sigue (true) y se avisa con `alListoTarde`. Con el enlace
 * caído se espera la señal real, que ya trae su propio tope, para no gastar reintentos mientras se reconecta.
 */
export async function esperarListoConPlazo(canal: CanalArchivos, plazoMs: number = ESPERA_LISTO_MS): Promise<boolean> {
  if (!canal.esperarListo) return true;
  const real = canal.esperarListo().catch(() => false);
  if (canal.enlaceArriba && !canal.enlaceArriba()) return real;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<"tarde">((res) => {
    reloj = setTimeout(() => res("tarde"), plazoMs);
  });
  const r = await Promise.race([real, tarde]);
  if (reloj !== undefined) clearTimeout(reloj);
  if (r !== "tarde") return r;
  if (canal.enlaceArriba && !canal.enlaceArriba()) return real;
  try {
    canal.alListoTarde?.();
  } catch {
    /* solo un aviso */
  }
  return true;
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
  /** (BLE1108B) La ruta del enlace que mide el REMITENTE (clase del clasificador común). */
  rutaEnlace?: string;
  /** Primeros bytes del archivo (≤ 512, base64) para la inspección de seguridad ANTES de aceptar. */
  inicioB64?: string;
  /** Vista previa que el remitente calculó (miniatura JPEG/PNG/WebP o fragmento de texto). */
  vista?: VistaOferta;
  /** Si es un ZIP (o un formato basado en ZIP): lo que dice llevar dentro (≤ 100 entradas). */
  contenido?: EntradaContenido[];
}

/** (ARC1108A) Una entrada de un comprimido, tal como la anuncia el remitente (se revisa otra vez al recibirlo). */
export interface EntradaContenido {
  ruta: string;
  tamano?: number;
  comprimido?: number;
  cifrado?: boolean;
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
  /**
   * (ARC1108B) 1 = este receptor manda `archivo.progreso` (latido y acuse de lo guardado): el remitente
   * frena con una ventana y vigila por inactividad. Ausente = receptor anterior (plazo fijo, sin freno).
   */
  acuses?: number;
  /** (ARC1108B) Rangos [a, b] (inclusive, en orden) de los trozos que faltan: el remitente manda SOLO esos. */
  huecos?: Array<[number, number]>;
  /** (BLE1108B) La ruta del enlace por el que RECIBIÓ el receptor (clasificador común). */
  rutaEnlace?: string;
}
/**
 * (ARC1108B) Latido del receptor: cuántos trozos tiene YA guardados (con su hash) y qué está haciendo.
 * Lo manda mientras recibe (≥ cada segundo o cada MiB guardado) y, tras «fin», cada pocos segundos
 * mientras espera trozos, verifica y une. Un remitente anterior lo ignora (no es de su protocolo).
 */
export interface MsgProgreso {
  t: "archivo.progreso";
  id: string;
  n: number;
  fase: FaseReceptor;
  /** 0..100 de la fase (verificando / ensamblando). */
  pct?: number;
}
/** (ARC1108B) Qué hace el receptor, para la burbuja del remitente. */
export type FaseReceptor = "recibiendo" | "esperando-trozos" | "verificando" | "ensamblando";
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

/**
 * (ARC1110A) Aviso temprano: el remitente lo manda en cuanto el usuario envía el archivo, ANTES de calcular su SHA-256.
 * El receptor enseña ya la tarjeta («<neurona> está preparando el archivo…») y puede aceptar o rechazar de antemano.
 * Lleva `trozos` y `tamanoTrozo` (los de la oferta que vendrá) y `sha256: ""` para poder sellarse como una oferta
 * (el mismo sobre cifrado: quien reenvía no ve el nombre). Un aparato anterior nunca lo recibe (no anuncia la capacidad).
 */
export interface MsgAnuncio {
  t: "archivo.anuncio";
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  sha256: "";
  trozos: number;
  tamanoTrozo: number;
  preparando: true;
  destino: DestinoArchivo;
  origen?: string;
  lote?: string;
  loteTotal?: number;
  loteMensaje?: string;
  ruta?: string;
}
/** (ARC1110A) El receptor aceptó de antemano: en cuanto llegue la oferta, empieza sin preguntar otra vez. */
export interface MsgPreaceptar {
  t: "archivo.preaceptar";
  id: string;
}

export type ArchivoMallaMsg =
  | MsgAnuncio
  | MsgPreaceptar
  | MsgOferta
  | MsgAceptar
  | MsgRechazar
  | MsgChunk
  | MsgFin
  | MsgOk
  | MsgError
  | MsgCancelar
  | MsgProgreso;

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
    case "archivo.anuncio":
      return typeof x.nombre === "string" && typeof x.tipo === "string" && typeof x.tamano === "number" && typeof x.trozos === "number" && typeof x.tamanoTrozo === "number";
    case "archivo.preaceptar":
      return true;
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
    case "archivo.progreso":
      return typeof x.n === "number" && Number.isFinite(x.n) && typeof x.fase === "string";
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

/**
 * (ARC1108B) La misma raíz de `calcularHashLista`, a partir de los hashes de trozo YA calculados (el
 * receptor los calcula al recibir cada trozo): verificar no relee nada. Misma definición de siempre.
 */
export async function raizDeHashes(hashes: ArrayBuffer[]): Promise<string> {
  return bufferAHex(await sha256(concatArrayBuffers(hashes)));
}

function mismosBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/* ══════════════════════════ 3c) Tamaño de trozo y huecos (ARC1108B, puros) ══════════════════════════ */

/** Trozo por defecto (bytes crudos): en base64 cabe en cualquier canal de texto, también en lotes del canal TCP. */
export const TAM_TROZO_POR_DEFECTO = 16 * 1024;
/**
 * Trozo del enlace directo WebRTC (binario): 63 KiB + la cabecera de `encodeChunkBinario` quedan por
 * debajo de 64 KiB, el tope de mensaje más estricto entre data channels de navegadores distintos (el
 * de libwebrtc —WebView de Android, WKWebView— es 256 KiB). 4 veces menos operaciones de almacén.
 */
export const TAM_TROZO_ENLACE_DIRECTO = 63 * 1024;
/** Tope de lo que un canal puede sugerir (la memoria de un trozo en vuelo y el tope de mensaje de libwebrtc). */
export const TAM_TROZO_MAX = 256 * 1024;

/**
 * Trozo de una transferencia nueva: el configurado a mano (pruebas) si lo hay; si no, lo que sugiere el
 * canal (en KiB enteros, de 1 KiB a 256 KiB); si no sugiere nada, 16 KiB. Nunca lanza. Puro.
 */
export function elegirTamanoTrozo(configurado: number | undefined, canal: Pick<CanalArchivos, "tamanoTrozo">): number {
  if (typeof configurado === "number" && Number.isFinite(configurado) && configurado > 0) return Math.floor(configurado);
  let sugerido: unknown;
  try {
    sugerido = canal.tamanoTrozo?.();
  } catch {
    sugerido = undefined;
  }
  if (typeof sugerido !== "number" || !Number.isFinite(sugerido) || sugerido <= 0) return TAM_TROZO_POR_DEFECTO;
  return Math.min(TAM_TROZO_MAX, Math.max(1024, Math.floor(sugerido / 1024) * 1024));
}

/** Tope de rangos que viajan en `archivo.aceptar.huecos` (más huecos que esto: se reanuda con `desde`). */
export const MAX_HUECOS = 256;

/**
 * Los trozos que faltan de 0..trozos-1, como rangos [a, b] inclusive y en orden; null si son más de
 * `max` rangos (entonces se pide con `desde`, como antes). Puro.
 */
export function huecosDe(tenidos: Iterable<number>, trozos: number, max = MAX_HUECOS): Array<[number, number]> | null {
  const s = tenidos instanceof Set ? (tenidos as Set<number>) : new Set(tenidos);
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < trozos) {
    if (s.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < trozos && !s.has(j + 1)) j++;
    out.push([i, j]);
    if (out.length > max) return null;
    i = j + 1;
  }
  return out;
}

/** `archivo.aceptar.huecos` saneado contra el nº de trozos: rangos enteros, en orden, sin solaparse. null si no vale. Puro. */
export function sanearHuecos(x: unknown, trozos: number, max = MAX_HUECOS): Array<[number, number]> | null {
  if (!Array.isArray(x) || x.length > max) return null;
  const out: Array<[number, number]> = [];
  let fin = -1;
  for (const r of x) {
    if (!Array.isArray(r) || r.length !== 2) return null;
    const [a, b] = r as [unknown, unknown];
    if (typeof a !== "number" || typeof b !== "number" || !Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (a < 0 || b < a || b >= trozos || a <= fin) return null;
    out.push([a, b]);
    fin = b;
  }
  return out;
}

/** Lo que dice la burbuja del remitente mientras el otro aparato guarda, verifica o une. Puro. */
export function textoProgresoRemoto(fase: string, n: number, trozos: number, pct?: number): string {
  const p = (x: number) => `${Math.max(0, Math.min(100, Math.floor(x)))} %`;
  switch (fase) {
    case "recibiendo":
      return `El otro aparato termina de guardar los trozos… ${p(trozos > 0 ? (n / trozos) * 100 : 100)}`;
    case "esperando-trozos":
      return `El otro aparato espera los trozos que aún vienen por otro camino (${n} de ${trozos})…`;
    case "ensamblando":
      return `El otro aparato verifica y une el archivo (SHA-256)… ${p(pct ?? 0)}`;
    case "verificando":
    default:
      return `El otro aparato verifica el SHA-256… ${p(pct ?? 0)}`;
  }
}

/** ArrayBuffer → base64. Usa `Buffer` en Node (pruebas/servidor) o `btoa` en navegador. */
export function bufAB64(buf: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  // (ARC1108B) Por bloques: con trozos de hasta 63 KiB, byte a byte era lo más lento del remitente.
  const bytes = new Uint8Array(buf);
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) partes.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]));
  return btoa(partes.join(""));
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
    case "sin-espacio":
      return "no tiene sitio para guardarlo";
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

export const MAX_CONTENIDO_ENTRADAS = 100;
export const MAX_CONTENIDO_CARACTERES = 12_000;

/**
 * Lista de un comprimido anunciada en la oferta: rutas sin caracteres de control (≤ 200), números
 * finitos; se CONSERVAN «..» y las rutas absolutas (son justo lo que la inspección tiene que ver).
 * Como mucho 100 entradas y 12 000 caracteres. Puro.
 */
export function sanearContenido(x: unknown): EntradaContenido[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: EntradaContenido[] = [];
  let total = 0;
  for (const it of x.slice(0, MAX_CONTENIDO_ENTRADAS)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.ruta !== "string") continue;
    const ruta = o.ruta.replace(CONTROL, "").slice(0, 200);
    if (!ruta) continue;
    total += ruta.length + 40;
    if (total > MAX_CONTENIDO_CARACTERES) break;
    const e: EntradaContenido = { ruta };
    if (typeof o.tamano === "number" && Number.isFinite(o.tamano) && o.tamano >= 0) e.tamano = o.tamano;
    if (typeof o.comprimido === "number" && Number.isFinite(o.comprimido) && o.comprimido >= 0) e.comprimido = o.comprimido;
    if (o.cifrado === true) e.cifrado = true;
    out.push(e);
  }
  return out.length ? out : undefined;
}

const LISTABLES_ZIP = new Set(["zip", "docx", "docm", "xlsx", "xlsm", "pptx", "pptm", "jar", "apk"]);

/**
 * ¿Se anuncia lo que lleva dentro? Los ZIP y los formatos de Office/Java/Android que por dentro son un
 * ZIP (un .docx con `vbaProject.bin` es un .docm disfrazado). Por nombre o tipo. Puro.
 */
export function esComprimidoZip(nombre: string, tipoMime?: string | null): boolean {
  const t = String(tipoMime ?? "").toLowerCase();
  return LISTABLES_ZIP.has(extensionDe(nombre)) || t === "application/zip" || t === "application/x-zip-compressed";
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

/** (ARC1108B) Solo la cabecera de un trozo binario: id, índice y dónde empiezan los datos (sin copiarlos). */
function cabeceraChunkBinario(buf: ArrayBuffer): { id: string; index: number; offset: number } | null {
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
    return { id, index, offset };
  } catch {
    return null;
  }
}

/** Decodifica un trozo binario codificado con `encodeChunkBinario`. */
export function decodeChunkBinario(buf: ArrayBuffer): { id: string; index: number; datos: ArrayBuffer } | null {
  const cab = cabeceraChunkBinario(buf);
  return cab ? { id: cab.id, index: cab.index, datos: buf.slice(cab.offset) } : null;
}

/**
 * (ARC1108B) Un trozo binario (`encodeChunkBinario`) como `archivo.chunk` en base64: lo que manda el
 * canal multitrayecto por un enlace que solo lleva texto (el TCP de la app nativa) cuando la
 * transferencia va en binario por el otro. El receptor admite los dos caminos para el mismo archivo.
 * Null si no es un trozo. Puro.
 */
export function trozoBinarioATexto(buf: ArrayBuffer): string | null {
  const dec = decodeChunkBinario(buf);
  if (!dec || !dec.id) return null;
  return JSON.stringify({ t: "archivo.chunk", id: dec.id, index: dec.index, datosB64: bufAB64(dec.datos) } satisfies MsgChunk);
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
  /**
   * (ARC1108B) Opcional: varios trozos de una vez (una transacción de IndexedDB, lecturas en paralelo
   * en OPFS), en el orden pedido; null el que no esté. El motor une el archivo con esto.
   */
  leerTrozos?(id: string, indices: number[]): Promise<Array<ArrayBuffer | null>>;
  /** (ARC1108B) Opcional: ¿cabe un archivo de `bytes`? Se pregunta ANTES de aceptar una oferta. */
  espacioPara?(bytes: number): Promise<{ ok: boolean; motivo?: string }>;
}

/** (ARC1108B) Megas legibles. */
function mb(n: number): string {
  const m = n / 1_048_576;
  return `${m < 10 ? m.toFixed(1) : Math.round(m)} MB`;
}

/**
 * (ARC1108B) Tope de la MEMORIA como almacén de trozos (un WebView sin OPFS ni IndexedDB usables): los
 * trozos y, al terminar, el archivo unido viven en RAM. Más grande, mejor decirlo antes de aceptar
 * que tumbar la app a mitad.
 */
export const MAX_MEMORIA_BYTES = 256 * 1024 * 1024;

/**
 * (ARC1108B) ¿Cabe `bytes` en el disco de la página (OPFS/IndexedDB comparten la cuota del origen)?
 * Los trozos y la copia del archivo ya verificado que guarda Mensajes: el doble, con 16 MB de margen.
 * Sin `navigator.storage.estimate` (o si falla) no se sabe: se deja pasar. Nunca lanza.
 */
async function espacioEnDisco(bytes: number, tipo: string): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const st = typeof navigator !== "undefined" ? (navigator as unknown as { storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> } }).storage : undefined;
    if (typeof st?.estimate !== "function") return { ok: true };
    const { quota, usage } = await st.estimate();
    if (typeof quota !== "number" || !(quota > 0)) return { ok: true };
    const libre = Math.max(0, quota - (typeof usage === "number" ? usage : 0));
    const necesario = bytes * 2 + 16 * 1_048_576;
    return libre >= necesario ? { ok: true } : { ok: false, motivo: `hacen falta unos ${mb(necesario)} libres en ${tipo} y quedan ${mb(libre)}` };
  } catch {
    return { ok: true };
  }
}

/** (ARC1108B) Como mucho `n` operaciones a la vez (el resto espera su turno, en orden). */
function crearSemaforo(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let libres = Math.max(1, n);
  const cola: Array<() => void> = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (libres > 0) libres--;
    else await new Promise<void>((r) => cola.push(r));
    try {
      return await fn();
    } finally {
      const siguiente = cola.shift();
      if (siguiente) siguiente();
      else libres++;
    }
  };
}

/**
 * Última red: mapa en memoria del propio módulo. No sobrevive a recargar la pestaña. (ARC1108B) Con
 * tope (`maxBytes`, 256 MB por defecto) que `espacioPara` dice antes de aceptar.
 */
export function crearAlmacenEnMemoria(opciones: { maxBytes?: number } = {}): AlmacenTrozos {
  const datos = new Map<string, Map<number, ArrayBuffer>>();
  const maxBytes = opciones.maxBytes ?? MAX_MEMORIA_BYTES;
  return {
    tipo: "memoria",
    async leerTrozos(id, indices) {
      const m = datos.get(id);
      return indices.map((i) => m?.get(i) ?? null);
    },
    async espacioPara(bytes) {
      let ocupado = 0;
      for (const m of datos.values()) for (const b of m.values()) ocupado += b.byteLength;
      if (bytes + ocupado <= maxBytes) return { ok: true };
      return { ok: false, motivo: `solo puede guardarlo en memoria (hasta ${mb(maxBytes)}${ocupado ? `, ya ocupada con ${mb(ocupado)}` : ""}) y mide ${mb(bytes)}` };
    },
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
  createWritable(): Promise<{ write(data: ArrayBuffer): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
};

/**
 * OPFS (`navigator.storage.getDirectory()`) — un archivo por trozo, bajo `archivos-malla/<id>/<index>`.
 * (ARC1108B) Las carpetas se abren UNA vez y se recuerdan (antes, cada trozo pedía la raíz y abría dos
 * carpetas para escribir y otra vez para releer) y como mucho `concurrencia` escrituras a la vez (cada
 * `createWritable` crea un archivo temporal: miles a la vez atascan el disco del WebView).
 */
export function crearAlmacenOPFS(opciones: { concurrencia?: number } = {}): AlmacenTrozos {
  let baseP: Promise<DirectorioOPFS> | null = null;
  const dirs = new Map<string, Promise<DirectorioOPFS | null>>();
  const turno = crearSemaforo(opciones.concurrencia ?? 6);

  const base = (): Promise<DirectorioOPFS> => {
    if (!baseP) {
      const p = (async () => {
        const storage = (navigator as unknown as { storage: { getDirectory(): Promise<DirectorioOPFS> } }).storage;
        const raiz = await storage.getDirectory();
        return raiz.getDirectoryHandle("archivos-malla", { create: true });
      })();
      baseP = p;
      p.catch(() => {
        if (baseP === p) baseP = null;
      });
    }
    return baseP;
  };
  /** Carpeta de la transferencia (recordada mientras exista). */
  const dirDe = async (id: string, crear: boolean): Promise<DirectorioOPFS | null> => {
    const recordada = dirs.get(id);
    if (recordada) {
      const d = await recordada;
      if (d) return d;
    }
    const p = (async () => {
      try {
        return await (await base()).getDirectoryHandle(id, { create: crear });
      } catch {
        return null;
      }
    })();
    dirs.set(id, p);
    const d = await p;
    if (!d && dirs.get(id) === p) dirs.delete(id);
    return d;
  };

  const guardarTrozo = (id: string, index: number, datos: ArrayBuffer): Promise<void> =>
    turno(async () => {
      const dir = await dirDe(id, true);
      // (ARC1108A) Antes volvía sin guardar nada y el trozo se daba por recibido: un hueco silencioso
      // que solo se veía como «hash-no-coincide». Ahora lanza y el almacén en cadena prueba el siguiente.
      if (!dir) throw new Error("OPFS no deja abrir la carpeta de la transferencia");
      const fh = await dir.getFileHandle(String(index), { create: true });
      if (typeof (fh as Partial<FileHandleOPFS>).createWritable !== "function") throw new Error("OPFS sin createWritable en este navegador");
      const w = await fh.createWritable();
      try {
        await w.write(datos);
        await w.close();
      } catch (e) {
        await w.abort?.().catch(() => undefined);
        throw e;
      }
    });
  const leerTrozo = async (id: string, index: number): Promise<ArrayBuffer | null> => {
    try {
      const dir = await dirDe(id, false);
      if (!dir) return null;
      const fh = await dir.getFileHandle(String(index));
      const file = await fh.getFile();
      return await bytesExactos(await file.arrayBuffer());
    } catch {
      return null;
    }
  };
  const leerTrozos = (id: string, indices: number[]): Promise<Array<ArrayBuffer | null>> => Promise.all(indices.map((i) => leerTrozo(id, i)));
  const indicesGuardados = async (id: string): Promise<number[]> => {
    try {
      const dir = await dirDe(id, false);
      if (!dir) return [];
      const out: number[] = [];
      for await (const [name] of dir.entries()) {
        const n = Number(name);
        if (Number.isInteger(n) && n >= 0) out.push(n);
      }
      return out.sort((a, b) => a - b);
    } catch {
      return [];
    }
  };
  const ensamblar = async (id: string, tipoMime: string): Promise<Blob> => {
    const indices = await indicesGuardados(id);
    const partes = (await leerTrozos(id, indices)).filter((d): d is ArrayBuffer => !!d);
    return new Blob(partes, { type: tipoMime });
  };
  const limpiar = async (id: string): Promise<void> => {
    dirs.delete(id);
    try {
      await (await base()).removeEntry(id, { recursive: true });
    } catch {
      /* best-effort */
    }
  };
  return { tipo: "OPFS", guardarTrozo, leerTrozo, leerTrozos, indicesGuardados, ensamblar, limpiar, espacioPara: (bytes) => espacioEnDisco(bytes, "OPFS") };
}

/** Lo mínimo de `IDBKeyRange` que se usa (para no depender del global en las pruebas). */
type RangoIDB = { bound(a: string, b: string): IDBKeyRange };

/**
 * IndexedDB — espejo del patrón de `astraura/experiencias-idb.ts`. Clave `<id>:<index>`.
 * (ARC1108B) UNA conexión para toda la sesión (antes se abría y cerraba la base en CADA trozo: en el
 * WebView de Android, miles de aperturas), las escrituras que llegan juntas van en UNA transacción
 * (durabilidad «relaxed»: si se pierde un trozo por un corte de luz, se reanuda desde ahí), las
 * lecturas de un lote también, y los índices de una transferencia se piden por rango de claves (antes
 * un cursor recorría TODA la tabla, con los datos de todas las transferencias, en cada oferta).
 */
export function crearAlmacenIDB(nombreDb = "starseed-archivos-malla", opciones: { escriturasPorTransaccion?: number } = {}): AlmacenTrozos {
  const TABLA = "trozos";
  const MAX_LOTE = Math.max(1, opciones.escriturasPorTransaccion ?? 64);
  const claveDe = (id: string, index: number) => `${id}:${index}`;
  const rangoDe = (id: string): IDBKeyRange => (globalThis as unknown as { IDBKeyRange: RangoIDB }).IDBKeyRange.bound(`${id}:`, `${id}:￿`);
  let dbP: Promise<IDBDatabase> | null = null;

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
  const conexion = (): Promise<IDBDatabase> => {
    if (!dbP) {
      const p = abrir().then((db) => {
        // Otra pestaña sube la versión, o el navegador la cierra: la siguiente operación reabre.
        db.onversionchange = () => {
          db.close();
          if (dbP === p) dbP = null;
        };
        (db as IDBDatabase & { onclose: (() => void) | null }).onclose = () => {
          if (dbP === p) dbP = null;
        };
        return db;
      });
      dbP = p;
      p.catch(() => {
        if (dbP === p) dbP = null;
      });
    }
    return dbP;
  };
  /**
   * Abre una transacción y hace sus peticiones EN EL ACTO (en la misma vuelta en que se crea: algunos
   * WebKit dan por terminada una transacción que espera a otra promesa antes de usarse).
   */
  const conTabla = async <T>(modo: IDBTransactionMode, fn: (st: IDBObjectStore, tx: IDBTransaction) => Promise<T>): Promise<T> => {
    const db = await conexion();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(TABLA, modo, { durability: "relaxed" } as IDBTransactionOptions);
    } catch (e) {
      // Conexión cerrada por debajo (InvalidStateError): una vez más con una nueva.
      if (dbP) dbP = null;
      const otra = await conexion();
      if (otra === db) throw e;
      tx = otra.transaction(TABLA, modo, { durability: "relaxed" } as IDBTransactionOptions);
    }
    return fn(tx.objectStore(TABLA), tx);
  };
  const pedir = <T>(req: IDBRequest<T>): Promise<T> =>
    new Promise((ok, falla) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falla(req.error);
    });
  const terminada = (tx: IDBTransaction): Promise<void> =>
    new Promise<void>((ok, falla) => {
      tx.oncomplete = () => ok();
      tx.onerror = () => falla(tx.error ?? new Error("IndexedDB: error en la transacción"));
      tx.onabort = () => falla(tx.error ?? new Error("IndexedDB: transacción abortada"));
    });

  // Escrituras agrupadas: lo que llega en la misma vuelta del bucle de eventos va en una transacción.
  let pendientes: Array<{ clave: string; datos: ArrayBuffer; ok: () => void; falla: (e: unknown) => void }> = [];
  let programado = false;
  const vaciar = async (): Promise<void> => {
    programado = false;
    const lote = pendientes;
    pendientes = [];
    if (!lote.length) return;
    try {
      await conTabla("readwrite", (st, tx) => {
        for (const p of lote) st.put(p.datos, p.clave);
        return terminada(tx);
      });
      for (const p of lote) p.ok();
    } catch (e) {
      for (const p of lote) p.falla(e);
    }
  };
  const guardarTrozo = (id: string, index: number, datos: ArrayBuffer): Promise<void> =>
    new Promise<void>((ok, falla) => {
      pendientes.push({ clave: claveDe(id, index), datos, ok, falla });
      if (pendientes.length >= MAX_LOTE) void vaciar();
      else if (!programado) {
        programado = true;
        setTimeout(() => void vaciar(), 0);
      }
    });
  const leerTrozos = async (id: string, indices: number[]): Promise<Array<ArrayBuffer | null>> => {
    if (!indices.length) return [];
    const crudos = await conTabla("readonly", (st) => Promise.all(indices.map((i) => pedir(st.get(claveDe(id, i))).catch(() => null))));
    // (ARC1108A) Lo guardado vuelve tal cual se guardó: si alguna vez fue una vista o un Blob, bytes exactos.
    return Promise.all(crudos.map((c) => bytesExactos(c ?? null)));
  };
  const leerTrozo = async (id: string, index: number): Promise<ArrayBuffer | null> => (await leerTrozos(id, [index]))[0] ?? null;
  const clavesDe = (id: string): Promise<string[]> =>
    conTabla("readonly", (st) => {
      if (typeof st.getAllKeys === "function") return pedir(st.getAllKeys(rangoDe(id))).then((ks) => ks.map(String));
      return new Promise<string[]>((ok, falla) => {
        const out: string[] = [];
        const req = st.openKeyCursor(rangoDe(id));
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return ok(out);
          out.push(String(cur.key));
          cur.continue();
        };
        req.onerror = () => falla(req.error);
      });
    });
  const indicesGuardados = async (id: string): Promise<number[]> => {
    const prefijo = `${id}:`;
    return (await clavesDe(id))
      .filter((k) => k.startsWith(prefijo))
      .map((k) => Number(k.slice(prefijo.length)))
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
  };
  const ensamblar = async (id: string, tipoMime: string): Promise<Blob> => {
    const partes = (await leerTrozos(id, await indicesGuardados(id))).filter((d): d is ArrayBuffer => !!d);
    return new Blob(partes, { type: tipoMime });
  };
  const limpiar = (id: string): Promise<void> =>
    conTabla("readwrite", (st, tx) => {
      st.delete(rangoDe(id));
      return terminada(tx);
    });
  return { tipo: "IndexedDB", guardarTrozo, leerTrozo, leerTrozos, indicesGuardados, ensamblar, limpiar, espacioPara: (bytes) => espacioEnDisco(bytes, "IndexedDB") };
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
    /** (ARC1108B) Por lotes: lo de cada almacén de una vez; lo que no se sabe dónde quedó, uno a uno. */
    async leerTrozos(id, indices) {
      const out: Array<ArrayBuffer | null> = indices.map(() => null);
      const grupos = new Map<number, number[]>();
      const sueltos: number[] = [];
      const m = donde.get(id);
      indices.forEach((i, pos) => {
        const k = m?.get(i);
        if (k === undefined) sueltos.push(pos);
        else {
          const g = grupos.get(k);
          if (g) g.push(pos);
          else grupos.set(k, [pos]);
        }
      });
      for (const [k, posiciones] of grupos) {
        const a = lista[k];
        try {
          const datos = a.leerTrozos ? await a.leerTrozos(id, posiciones.map((p) => indices[p])) : await Promise.all(posiciones.map((p) => a.leerTrozo(id, indices[p])));
          for (let j = 0; j < posiciones.length; j++) out[posiciones[j]] = await bytesExactos(datos[j] ?? null);
        } catch {
          /* quedan en null: el motor dice cuál no se pudo releer */
        }
      }
      for (const p of sueltos) out[p] = await leerTrozo(id, indices[p]);
      return out;
    },
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
    /** (ARC1108B) Cabe si cabe en alguno de los que aún escriben (si uno se llena, los trozos pasan al siguiente). */
    async espacioPara(bytes) {
      let primerNo: { ok: boolean; motivo?: string } | null = null;
      for (let k = 0; k < lista.length; k++) {
        if (apartados.has(k)) continue;
        const a = lista[k];
        if (!a.espacioPara) return { ok: true };
        const r = await a.espacioPara(bytes).catch(() => ({ ok: true }));
        if (r.ok) return { ok: true };
        primerNo ??= r;
      }
      return primerNo ?? { ok: false, motivo: "ningún almacenamiento de este aparato acepta archivos ahora" };
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
  contenido?: EntradaContenido[];
  sha256?: string;
  via?: string;
  verificacion?: VerificacionOrigen;
  /** (BLE1108B) La ruta del enlace que mide ESTE aparato, la que dice el otro, y si coinciden (null = aún no se sabe). */
  rutaEnlace?: string;
  rutaEnlaceOtro?: string;
  rutaEnlaceVerificada?: boolean | null;
  /** (MPT1108A) Reparto por vías («LAN 72 % · Bluetooth 8 %»), velocidad total (bytes/s) y modo de cifrado del archivo. */
  repartoVias?: string;
  velocidadBps?: number;
  cifradoArchivo?: "archivo" | "sin-cifrado-de-archivo";
  /** (ARC1110A) Rol enviar: preparando el archivo (SHA-256 en un Worker) con su avance 0..100. Rol recibir: solo llegó el anuncio. */
  preparando?: boolean;
  preparandoPct?: number;
  /** (ARC1110A) Rol recibir: aceptado de antemano (empieza solo al llegar la oferta). Rol enviar: el otro ya lo aceptó. */
  preaceptada?: boolean;
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
  /**
   * Bytes crudos por trozo, antes de codificar a base64. Si se da, manda sobre todo (pruebas). Si no,
   * (ARC1108B) lo que sugiera el canal (`CanalArchivos.tamanoTrozo`) o 16 KiB.
   */
  tamanoChunkBase64?: number;
  /** Umbral de `bufferedAmount()` (bytes) por encima del cual el remitente espera. Por defecto 1 MiB. */
  umbralBufferAlto?: number;
  /** A partir de este tamaño se marca un aviso informativo (no bloquea). Por defecto 500 MiB. */
  limiteAvisoBytes?: number;
  /** Tope duro: una oferta que lo supere se rechaza sin ofertar. Por defecto 4 GiB. */
  limiteMaxBytes?: number;
  /**
   * (ARC1108A) Cuánto espera el remitente, tras mandar «fin», a que un receptor ANTERIOR (sin latido)
   * confirme (ok/error) antes de darlo por fallido con «Reintentar». (ARC1108B) Por defecto 90 s + 100 ms
   * por cada 16 KiB del archivo (antes 60 s + 50 ms por trozo: el vídeo de 8 MB se daba por perdido a
   * los 85 s mientras la tableta aún lo verificaba). Si se da y no se da `esperaSinNoticiasMs`, también
   * es la espera SIN NOTICIAS con un receptor que late.
   */
  esperaVerificacionMs?: (trozos: number, bytes?: number) => number;
  /**
   * (ARC1108B) Con un receptor que late (`archivo.aceptar.acuses`): cuánto aguanta el remitente SIN
   * NINGÚN mensaje suyo (latido, ok, error) tras «fin» antes de darlo por fallido. Cada latido la
   * reinicia: un archivo enorme que se verifica durante minutos no se da por perdido. Por defecto 45 s.
   */
  esperaSinNoticiasMs?: number;
  /** (ARC1108A) Cuánto espera el receptor, tras «fin», a los trozos que aún no llegaron (varios caminos). Por defecto 15 s SIN AVANCE (ARC1108B: mientras sigan llegando, espera). */
  esperaTrozosFaltantesMs?: number;
  /** (ARC1108B) Cada cuánto late el receptor mientras espera trozos, verifica o une. Por defecto 4 s. */
  intervaloLatidoMs?: number;
  /**
   * (ARC1108B) Cuánto puede ir el remitente por delante de lo que el receptor YA guardó (solo con un
   * receptor que late). Acota la memoria del receptor: sin esto, un WebView lento acumulaba en RAM
   * todo lo que llegaba mientras su almacén escribía. Por defecto 8 MiB.
   */
  ventanaVueloBytes?: number;
  /**
   * (BLE1108B) Cada cuánto vuelve a mandar el remitente una oferta que nadie ha contestado (solo por canales
   * con `enviarConAcuse`: un mensaje acusado por la radio pudo perderse en la capa de arriba, p. ej. si el
   * otro aún no había ligado el enlace). El receptor ignora la repetición. Por defecto 6 s, 12 veces.
   */
  reenvioOfertaMs?: number;
}

/** (ARC1108A) Lo que se puede añadir a una oferta al mandarla (el envío al que pertenece, su ruta, su vista). */
export interface OpcionesEnvioArchivo {
  tipoMime?: string;
  idTransferencia?: string;
  /** Envío (varios archivos juntos): mismo `id` en todos; `total` y `mensaje` opcionales. */
  lote?: { id: string; total?: number; mensaje?: string };
  /** Ruta relativa dentro de la carpeta enviada (`File.webkitRelativePath`). */
  ruta?: string;
  /** Vista previa ya calculada (miniatura o fragmento de texto), o su promesa (ARC1110A: no se espera antes del anuncio). */
  vista?: VistaOferta | Promise<VistaOferta | undefined>;
  /** Lista de un comprimido ya calculada (si no, el motor la lee él mismo de los ZIP). */
  contenido?: EntradaContenido[];
}

export interface ResultadoEnviarArchivo {
  ok: boolean;
  id: string;
  error?: string;
  aviso?: string;
  /**
   * (ARC1110A) `enviarArchivo` vuelve en cuanto sale el anuncio; la preparación (SHA-256 en un Worker) sigue detrás.
   * Esta promesa se resuelve con true cuando la oferta salió y con false si se canceló, se rechazó o falló.
   */
  listo?: Promise<boolean>;
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

/** (ARC1110A) Plazo máximo para la vista previa que acompaña a la oferta: pasado, la oferta sale sin ella. */
const PLAZO_VISTA_MS = 3_000;

/** (ARC1110A) Espera `p` como mucho `ms`; pasado el plazo, `valor`. Limpia su reloj. */
async function conPlazo<T>(p: Promise<T>, ms: number, valor: T): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<T>((res) => {
    reloj = setTimeout(() => res(valor), ms);
  });
  try {
    return await Promise.race([p, tarde]);
  } finally {
    if (reloj !== undefined) clearTimeout(reloj);
  }
}

/** crearMotorArchivos — instancia aislada del motor (una por proceso normalmente, ver `motorArchivosCompartido`). */
export function crearMotorArchivos(config: ConfigMotorArchivos = {}): MotorArchivos {
  const almacen = config.almacen ?? crearAlmacenAuto();
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
  interface VigiaInfo {
    t: ReturnType<typeof setTimeout>;
    fase: "completa" | "gracia";
  }
  const vigias = new Map<string, VigiaInfo>();
  const reanudacionesAuto = new Map<string, number>();
  const esperaVerificacion = config.esperaVerificacionMs ?? ((trozos: number, bytes?: number) => 90_000 + Math.ceil((bytes ?? trozos * TAM_TROZO_POR_DEFECTO) / TAM_TROZO_POR_DEFECTO) * 100);
  const esperaSinNoticias = (trozos: number, bytes: number): number =>
    config.esperaSinNoticiasMs ?? (config.esperaVerificacionMs ? config.esperaVerificacionMs(trozos, bytes) : 45_000);
  const ESPERA_FALTANTES_MS = config.esperaTrozosFaltantesMs ?? 15_000;
  const INTERVALO_LATIDO_MS = Math.max(50, config.intervaloLatidoMs ?? 4_000);
  const VENTANA_VUELO_BYTES = Math.max(64 * 1024, config.ventanaVueloBytes ?? 8 * 1024 * 1024);
  /** El receptor acusa lo guardado al menos cada MiB (y cada segundo): siempre muy por debajo de la ventana. */
  const ACUSE_CADA_BYTES = Math.min(1_048_576, Math.floor(VENTANA_VUELO_BYTES / 4));
  // (ARC1108B) Remitente: trozo de cada transferencia, receptores que laten, lo que el receptor dice
  // tener guardado, cuándo dijo algo por última vez y los huecos a mandar al reanudar.
  const tamanoTrozoPorId = new Map<string, number>();
  const conLatido = new Set<string>();
  const guardadosRemotos = new Map<string, number>();
  const ultimoContacto = new Map<string, number>();
  const huecosPorId = new Map<string, Array<[number, number]>>();
  // (ARC1108B) Receptor: SHA-256 de cada trozo calculado al recibirlo y el último latido mandado.
  const hashesPorId = new Map<string, Array<ArrayBuffer | undefined>>();
  const latidos = new Map<string, { n: number; at: number; t?: ReturnType<typeof setTimeout> }>();
  // Resonancia (§5.6): confianza por neurona y veredictos antivirus de la red.
  const confianzaNodos = new Map<string, number>();
  const veredictosRed: VeredictoCompartido[] = [];
  const nodoPorId = new Map<string, string>();
  // (ARC1110A) Receptor: anuncios sin oferta aún, los aceptados de antemano, los rechazados de antemano y a quién ya se avisó.
  const anunciosEntrantes = new Map<string, MsgAnuncio>();
  const preaceptadas = new Set<string>();
  const rechazadasAntes = new Map<string, number>(); // id -> cuándo (se olvida a los 60 s: un «Reintentar» no se rechaza solo)
  const notificadas = new Set<string>();
  // (ARC1110A) Remitente: preparación en curso (relevo de intentos), anuncios que se siguen repitiendo y aceptaciones adelantadas.
  const preparaciones = new Map<string, number>();
  let contadorPrep = 0;
  const anunciando = new Set<string>();
  const preaceptoElOtro = new Set<string>();
  // (ARC1110A) Hitos ya anotados (el primer trozo y 25/50/75 %, una vez por transferencia y rol).
  const hitosHechos = new Map<string, Set<string>>();
  const inicioTransferencia = new Map<string, number>();

  function hito(id: string, nombre: HitoArchivo, detalle = ""): void {
    anotarArchivo(nombre, id, detalle);
  }
  /** Anota un hito una sola vez por transferencia (`clave` lo distingue). */
  function hitoUnico(id: string, clave: string, nombre: HitoArchivo, detalle = ""): void {
    let s = hitosHechos.get(id);
    if (!s) {
      s = new Set();
      hitosHechos.set(id, s);
      while (hitosHechos.size > 200) hitosHechos.delete(hitosHechos.keys().next().value as string);
    }
    if (s.has(clave)) return;
    s.add(clave);
    hito(id, nombre, detalle);
  }
  function hitosDeProgreso(e: EstadoTransferencia, progreso: number): void {
    if (progreso >= 1) hitoUnico(e.id, `primer-trozo.${e.rol}`, "primer-trozo", `rol=${e.rol} trozos=${e.trozos}`);
    if (e.trozos <= 0) return;
    const pct = (progreso / e.trozos) * 100;
    for (const m of [25, 50, 75]) if (pct >= m && progreso < e.trozos) hitoUnico(e.id, `progreso.${e.rol}.${m}`, "progreso", `${m} rol=${e.rol}`);
  }

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
    hitosDeProgreso(actual, progreso); // ARC1110A
    emitir({ ...actual, progreso, actualizadoMs: Date.now() });
  }

  /** (MPT1108A) Anota en el estado por dónde van los trozos y si el archivo va cifrado de punta a punta. Nunca lanza. */
  function anotarVias(id: string, canal: CanalArchivos): void {
    try {
      const actual = estados.get(id);
      if (!actual) return;
      const r = canal.resumenVias?.() ?? null;
      const m = canal.modoCifrado?.(id) ?? null;
      const texto = r?.texto;
      const bps = r ? Math.round(r.bps) : undefined;
      if (texto === actual.repartoVias && (m ?? undefined) === actual.cifradoArchivo && bps === actual.velocidadBps) return;
      emitir({
        ...actual,
        ...(texto ? { repartoVias: texto } : {}),
        ...(bps !== undefined ? { velocidadBps: bps } : {}),
        ...(m ? { cifradoArchivo: m } : {}),
      });
    } catch {
      /* solo informativo */
    }
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
    // (ARC1108B) El trozo lo sugiere el canal (63 KiB por el enlace directo, 46 KiB por el TCP…): menos
    // operaciones de almacén en el receptor. Queda fijado en la oferta: la raíz del hash depende de él.
    // «Reintentar» el mismo archivo (mismo id) conserva su trozo: el mismo SHA-256 y el receptor no vuelve a preguntar.
    const previa = opciones?.idTransferencia ? ofertasEnviadas.get(id) : undefined;
    const TAM_TROZO = previa && previa.tamano === tamano && previa.tamanoTrozo > 0 ? previa.tamanoTrozo : elegirTamanoTrozo(config.tamanoChunkBase64, canal);
    const trozos = Math.max(1, Math.ceil(tamano / TAM_TROZO));
    // (ARC1110A) Se anota ya: el estado «preparando» sale ANTES de leer el archivo (antes se calculaba el SHA-256 de
    // TODO el archivo aquí, en el hilo principal, y la oferta salía minutos después del mensaje del chat).
    const yaPreparada = previa && previa.tamano === tamano && previa.tamanoTrozo === TAM_TROZO && previa.sha256 ? previa : undefined;

    canalPorId.set(id, canal);
    archivosEnvio.set(id, archivo);
    tamanoTrozoPorId.set(id, TAM_TROZO);
    cancelados.delete(id);
    // Un reintento con el mismo id empieza limpio: ni bucle viejo, ni espera de verificación vieja.
    limpiarVigia(id);
    reanudacionesAuto.delete(id);
    intentosReintento.delete(id);
    olvidarRemitente(id);
    preaceptoElOtro.delete(id);
    hitosHechos.delete(id);

    const aviso = tamano > AVISO_BYTES ? `Archivo grande (${(tamano / 1024 / 1024).toFixed(0)} MB): la transferencia puede tardar.` : undefined;

    // Negociar modo: si el canal soporta binario, usamos binario; si no, base64.
    const modo: ModoTransferencia = canal.enviarBinario ? "binario" : "base64";
    modoPorId.set(id, modo);

    const token = ++contadorPrep;
    preparaciones.set(id, token);
    const textoPrep = (pct: number): string =>
      [aviso, `Preparando ${pct} %`, preaceptoElOtro.has(id) ? "ya lo aceptó el otro aparato" : null].filter(Boolean).join(" · ");

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
      motivo: yaPreparada ? aviso : textoPrep(0),
      ...(yaPreparada ? {} : { preparando: true, preparandoPct: 0 }),
      inicioMs: Date.now(),
      actualizadoMs: Date.now(),
    });

    // (ARC1110A) El anuncio: nombre, tamaño y tipo, sin esperar al SHA-256. Solo a un aparato que lo entiende.
    const anunciada = !yaPreparada && !!canal.admiteAnuncio?.();
    if (anunciada) {
      const anuncio: MsgAnuncio = { t: "archivo.anuncio", id, nombre, tipo: tipoMime, tamano, sha256: "", trozos, tamanoTrozo: TAM_TROZO, preparando: true, destino, ...extrasDeEnvio(opciones, nombre) };
      anunciando.add(id);
      enviarAnuncio(id, canal, anuncio, token);
      hito(id, "anuncio-enviado", `bytes=${tamano} trozos=${trozos}`);
    }

    const vigente = (): boolean => {
      const e = estados.get(id);
      return preparaciones.get(id) === token && !cancelados.has(id) && !!e && e.rol === "enviar" && e.fase === "esperando-aceptacion";
    };
    const fallar = (detalle: string, codigo: string): void => {
      anunciando.delete(id);
      const e = estados.get(id);
      if (e && preparaciones.get(id) === token) {
        emitir({ ...e, fase: "error", preparando: false, preparandoPct: undefined, motivo: `Falló en el remitente: ${detalle}`, codigo, lado: "remitente", actualizadoMs: Date.now() });
      }
      hito(id, "fallo", `motivo=${codigo}`);
    };

    const preparar = async (): Promise<boolean> => {
      try {
        let sha: string;
        if (yaPreparada) sha = yaPreparada.sha256;
        else {
          let ultimo = -1;
          const r = await prepararArchivo(archivo, TAM_TROZO, trozos, {
            cancelado: () => !vigente(),
            alProgreso: (pct) => {
              if (pct === ultimo || !vigente()) return;
              ultimo = pct;
              const e = estados.get(id);
              if (e) emitir({ ...e, preparandoPct: pct, motivo: textoPrep(pct), actualizadoMs: Date.now() });
            },
          });
          if (!r.ok) {
            if (!r.cancelado && vigente()) fallar(`no se pudo preparar el archivo (${r.motivo})`, "preparacion");
            return false;
          }
          sha = r.raiz;
          hito(id, "preparado", `ms=${r.ms} via=${r.via} bytes=${tamano}`);
        }
        if (!vigente()) return false;

        // (ARC1108A) Los primeros bytes viajan con la oferta: el receptor inspecciona el tipo real ANTES de aceptar.
        let inicioB64: string | undefined;
        try {
          inicioB64 = tamano > 0 ? sanearInicio(bufAB64(await archivo.slice(0, MAX_INICIO_BYTES).arrayBuffer())) : undefined;
        } catch {
          inicioB64 = undefined;
        }
        // (ARC1108A) Si es un ZIP (o un formato basado en ZIP), lo que lleva dentro: el receptor lo revisa ANTES de aceptar.
        let contenido = sanearContenido(opciones?.contenido);
        if (!contenido && tamano >= 22 && esComprimidoZip(nombre, tipoMime)) {
          try {
            const cola = Math.min(tamano, 256 * 1024);
            const lista = listarZip(new Uint8Array(await archivo.slice(tamano - cola, tamano).arrayBuffer()), tamano, MAX_CONTENIDO_ENTRADAS);
            contenido = sanearContenido(lista ?? undefined);
          } catch {
            contenido = undefined;
          }
        }
        // (ARC1110A) La vista previa puede venir como promesa: se espera un rato corto, nunca se retrasa la oferta por ella.
        const vista = await conPlazo(Promise.resolve(opciones?.vista).then((v) => sanearVista(v), () => undefined), PLAZO_VISTA_MS, undefined);
        if (!vigente()) return false;

        const oferta: MsgOferta = {
          t: "archivo.oferta",
          id,
          nombre,
          tipo: tipoMime,
          tamano,
          sha256: sha,
          trozos,
          tamanoTrozo: TAM_TROZO,
          destino,
          modo,
          ...extrasDeEnvio(opciones, nombre),
        };
        if (inicioB64) oferta.inicioB64 = inicioB64;
        if (contenido) oferta.contenido = contenido;
        if (vista) oferta.vista = vista;
        const rutaPropia = sanearRutaEnlace(canal.rutaMedida?.());
        if (rutaPropia) oferta.rutaEnlace = rutaPropia;
        ofertasEnviadas.set(id, oferta);
        anunciando.delete(id);
        const actual = estados.get(id);
        if (actual) {
          emitir({
            ...actual,
            preparando: false,
            preparandoPct: undefined,
            motivo: aviso,
            ...(rutaPropia ? { rutaEnlace: rutaPropia, rutaEnlaceVerificada: null } : {}),
            actualizadoMs: Date.now(),
          });
        }
        enviarOferta(id, canal, oferta);
        hito(id, "oferta-enviada", `bytes=${tamano} trozos=${trozos}`);
        return true;
      } catch (e) {
        fallar(`no se pudo preparar el archivo (${e instanceof Error ? e.message : "error"})`, "preparacion");
        return false;
      }
    };

    const listo = preparar();
    if (anunciada) return { ok: true, id, aviso, listo };
    // Un par que no entiende el anuncio (o un reintento ya preparado): como siempre, vuelve con la oferta ya enviada
    // (ahora con el cálculo fuera del hilo principal y con avance).
    const salio = await listo;
    const e = estados.get(id);
    if (!salio && e?.fase === "error" && e.codigo === "preparacion") return { ok: false, id, error: e.motivo, aviso, listo };
    return { ok: true, id, aviso, listo };
  }

  /** (ARC1110A) Lo que acompaña a una oferta o a un anuncio: el envío al que pertenece y su ruta en la carpeta. */
  function extrasDeEnvio(opciones: OpcionesEnvioArchivo | undefined, nombre: string): Pick<MsgOferta, "lote" | "loteTotal" | "loteMensaje" | "ruta"> {
    const out: Pick<MsgOferta, "lote" | "loteTotal" | "loteMensaje" | "ruta"> = {};
    const lote = sanearLote(opciones?.lote?.id);
    if (lote) {
      out.lote = lote;
      const total = opciones?.lote?.total;
      if (typeof total === "number" && Number.isInteger(total) && total > 0 && total <= 10_000) out.loteTotal = total;
      const mensaje = sanearMensajeEnvio(opciones?.lote?.mensaje);
      if (mensaje) out.loteMensaje = mensaje;
    }
    const ruta = sanearRutaRelativa(opciones?.ruta);
    if (ruta && ruta !== nombre) out.ruta = ruta;
    return out;
  }

  /**
   * (ARC1110A) Manda el anuncio y lo repite mientras el archivo siga preparándose (solo por canales que acusan: un
   * mensaje acusado por la radio pudo perderse arriba). El receptor ignora la repetición. Sin acuse, UNA vez.
   */
  function enviarAnuncio(id: string, canal: CanalArchivos, anuncio: MsgAnuncio, token: number): void {
    const texto = JSON.stringify(anuncio);
    const sigue = (): boolean => anunciando.has(id) && preparaciones.get(id) === token && estados.get(id)?.fase === "esperando-aceptacion" && !cancelados.has(id);
    if (!canal.enviarConAcuse) {
      try {
        canal.enviar(texto);
      } catch {
        /* la oferta llegará de todos modos */
      }
      return;
    }
    const cada = Math.max(1, config.reenvioOfertaMs ?? 6_000);
    let veces = 0;
    const intentar = async (): Promise<void> => {
      if (!sigue() || veces >= 12) return;
      veces++;
      let ok = false;
      try {
        ok = await canal.enviarConAcuse!(texto);
      } catch {
        ok = false;
      }
      if (!sigue()) return;
      if (!ok) await (canal.esperarListo?.() ?? Promise.resolve(true)).catch(() => false);
      const t = setTimeout(() => void intentar(), ok ? cada : Math.min(cada, 1_000));
      (t as { unref?: () => void }).unref?.();
    };
    void intentar();
  }

  /** (ARC1110A) El receptor aceptó de antemano: el remitente lo apunta y lo dice en su tarjeta. */
  function manejarPreaceptar(msg: MsgPreaceptar): void {
    const e = estados.get(msg.id);
    if (!e || e.rol !== "enviar") return;
    preaceptoElOtro.add(msg.id);
    hito(msg.id, "preaceptado", "rol=enviar");
    if (e.fase === "esperando-aceptacion") {
      emitir({ ...e, preaceptada: true, ...(e.preparando ? { motivo: `Preparando ${e.preparandoPct ?? 0} % · ya lo aceptó el otro aparato` } : {}), actualizadoMs: Date.now() });
    }
  }

  /**
   * (ARC1110A) Llega el anuncio: la tarjeta aparece YA, «<neurona> está preparando el archivo…», y la persona puede
   * aceptar o rechazar de antemano. No hay SHA-256 ni bytes que inspeccionar: la decisión de seguridad
   * (centinela, resonancia) se toma igual cuando llega la oferta; aquí solo se corta lo que la política deniega.
   */
  async function manejarAnuncio(canal: CanalArchivos, msg: MsgAnuncio, contexto?: ContextoRecepcion): Promise<void> {
    if (estados.has(msg.id) || ofertasEntrantes.has(msg.id) || anunciosEntrantes.has(msg.id)) return; // repetición, o la oferta llegó antes
    const rechazadaEn = rechazadasAntes.get(msg.id);
    if (rechazadaEn !== undefined && Date.now() - rechazadaEn < 60_000) {
      canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo: "Rechazado por el usuario." } satisfies MsgRechazar));
      return;
    }
    if (!(msg.tamano >= 0) || msg.tamano > MAX_BYTES || !Number.isInteger(msg.trozos) || msg.trozos < 1 || msg.trozos > 1_000_000) return; // la oferta lo dirá
    const ctx: ContextoRecepcion = contexto ?? { mismaCuenta: false };
    hito(msg.id, "anuncio-recibido", `bytes=${msg.tamano} trozos=${msg.trozos}`);
    cancelados.delete(msg.id);
    canalPorId.set(msg.id, canal);
    if (ctx.nodoId) nodoPorId.set(msg.id, ctx.nodoId);
    anunciosEntrantes.set(msg.id, msg);
    const decision = await Promise.resolve((config.politica ?? politicaPorDefecto)(ctx));
    if (estados.has(msg.id) || ofertasEntrantes.has(msg.id)) return; // mientras se decidía llegó la oferta
    const origen = msg.origen ?? ctx.etiquetaOrigen;
    const extras = extrasDeOferta({ ...msg, sha256: "" } as unknown as MsgOferta, ctx);
    delete extras.sha256;
    const ahora = Date.now();
    const base: EstadoTransferencia = {
      id: msg.id,
      rol: "recibir",
      nombre: nombreSaneado(msg.nombre),
      tipo: String(msg.tipo ?? "").slice(0, 120),
      tamano: msg.tamano,
      trozos: msg.trozos,
      progreso: 0,
      fase: "pendiente-aceptar",
      destino: msg.destino && typeof msg.destino.tipo === "string" ? msg.destino : { tipo: "dispositivo" },
      origen,
      inicioMs: ahora,
      actualizadoMs: ahora,
      preparando: true,
      motivo: `${origen ?? "El otro aparato"} está preparando el archivo…`,
      ...extras,
      ...rutaDeOferta(canal, msg as unknown as MsgOferta),
    };
    if (decision === "denegar") {
      anunciosEntrantes.delete(msg.id);
      rechazadasAntes.set(msg.id, ahora);
      emitir({ ...base, preparando: false, fase: "rechazada", motivo: "Sin permiso para recibir archivos de esta cuenta." });
      canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo: "denegado por política de permisos" } satisfies MsgRechazar));
      return;
    }
    if (decision === "auto-aceptar") {
      // Se aceptará solo al llegar la oferta (si el centinela no pide preguntar): mientras tanto, «preparando».
      preaceptadas.add(msg.id);
      emitir({ ...base, fase: "transfiriendo", preaceptada: true });
      return;
    }
    emitir(base);
    notificadas.add(msg.id);
    config.onOfertaEntrante?.({
      id: msg.id,
      nombre: base.nombre,
      tipo: base.tipo,
      tamano: msg.tamano,
      destino: base.destino ?? { tipo: "dispositivo" },
      origen: base.origen,
      ...(base.lote ? { lote: base.lote } : {}),
      ...(base.ruta ? { ruta: base.ruta } : {}),
    });
  }

  /** (BLE1108B) La oferta sin lo opcional que no cabe en UN mensaje del canal (vista, contenido, inicio, en ese orden). */
  function ofertaQueCabe(canal: CanalArchivos, oferta: MsgOferta): MsgOferta {
    const max = canal.maxTextoBytes?.();
    if (!max || !Number.isFinite(max)) return oferta;
    const peso = (o: MsgOferta) => new TextEncoder().encode(JSON.stringify(o)).length;
    let o: MsgOferta = oferta;
    for (const campo of ["vista", "contenido", "inicioB64"] as const) {
      if (peso(o) <= max) break;
      if (o[campo] === undefined) continue;
      const copia: MsgOferta = { ...o };
      delete copia[campo];
      o = copia;
    }
    return o;
  }

  /**
   * (BLE1108B) Manda la oferta. Por un canal que acusa, la repite cada `reenvioOfertaMs` mientras nadie
   * conteste (acepto, rechazo o cancelo): antes se mandaba UNA vez y, si el otro aún no tenía ligado el
   * enlace o la trama no cabía, la ventana de «aceptar» no aparecía hasta que alguien reintentaba, minutos
   * después. Sin acuse, UNA vez, como siempre.
   */
  function enviarOferta(id: string, canal: CanalArchivos, oferta: MsgOferta): void {
    const texto = JSON.stringify(ofertaQueCabe(canal, oferta));
    if (!canal.enviarConAcuse) {
      canal.enviar(texto);
      return;
    }
    const cada = Math.max(1, config.reenvioOfertaMs ?? 6_000);
    const esperando = () => {
      const e = estados.get(id);
      return !!e && e.rol === "enviar" && e.fase === "esperando-aceptacion" && !cancelados.has(id) && ofertasEnviadas.get(id) === oferta;
    };
    let veces = 0;
    const intentar = async (): Promise<void> => {
      if (!esperando() || veces >= 12) return;
      veces++;
      let ok = false;
      try {
        ok = await canal.enviarConAcuse!(texto);
      } catch {
        ok = false;
      }
      if (!esperando()) return;
      if (!ok) await (canal.esperarListo?.() ?? Promise.resolve(true)).catch(() => false);
      const t = setTimeout(() => void intentar(), ok ? cada : Math.min(cada, 1_000));
      (t as { unref?: () => void }).unref?.();
    };
    void intentar();
  }

  /** (ARC1108A) Quita la espera de verificación de una transferencia enviada. */
  function limpiarVigia(id: string): void {
    const info = vigias.get(id);
    if (info !== undefined) clearTimeout(info.t);
    vigias.delete(id);
  }

  /** (ARC1108B) Olvida lo que el remitente sabía del receptor de una transferencia (latido, guardados, huecos). */
  function olvidarRemitente(id: string): void {
    conLatido.delete(id);
    guardadosRemotos.delete(id);
    ultimoContacto.delete(id);
    huecosPorId.delete(id);
  }

  /**
   * (ARC1108A) Tras mandar «fin», el remitente queda en «verificando» hasta que el receptor diga ok o
   * error. Si no dice nada (app cerrada, sin memoria…), no se queda colgado para siempre: pasa a error
   * con «Reintentar», que reanuda desde el primer trozo que le falte al otro. (ARC1108B) Con un receptor
   * que late es una espera SIN NOTICIAS (cada latido la reinicia: verificar 500 MB durante minutos no
   * es un fallo); con uno anterior, un plazo fijo que crece con el tamaño del archivo.
   * (SUP0911G) Al vencer la espera completa, el remitente NO se rinde: manda una vez más «fin» y arma
   * una última espera corta (gracia). Si en la gracia llega «ok», acaba «completada»; si no llega nada,
   * el error «sin-confirmacion» de siempre.
   * (SUP0911H) Cada llamada a `vigilarVerificacion` (al mandar «fin» y con cada latido) corta la espera
   * que hubiera (completa o gracia, con `limpiarVigia`) y arma otra espera COMPLETA desde cero; la
   * última llamada («fin» repetido + gracia) solo ocurre cuando la espera completa vence SIN noticias.
   */
  function vigilarVerificacion(id: string): void {
    const infoPrev = vigias.get(id);
    if (infoPrev !== undefined) {
      limpiarVigia(id);
    }
    const e = estados.get(id);
    if (!e) return;
    const late = conLatido.has(id);
    const ms = Math.max(1, late ? esperaSinNoticias(e.trozos, e.tamano) : esperaVerificacion(e.trozos, e.tamano));
    const t = setTimeout(() => {
      vigias.delete(id);
      const actual = estados.get(id);
      if (!actual || actual.rol !== "enviar" || actual.fase !== "verificando") return;
      const canal = canalPorId.get(id);
      if (!canal) {
        const s = Math.round(ms / 1000);
        const detalle = late
          ? `sin noticias suyas en ${s} s, cuando avisaba cada pocos segundos (¿app cerrada, en segundo plano o sin memoria?)`
          : `sin respuesta en ${s} s tras mandar el último trozo (¿app cerrada o sin memoria?)`;
        emitir({
          ...actual,
          fase: "error",
          motivo: textoErrorRemoto({ motivo: "sin-confirmacion", detalle, lado: "receptor" }),
          codigo: "sin-confirmacion",
          lado: "receptor",
          actualizadoMs: Date.now(),
        });
        return;
      }
      const finSalio = canal.enviar(JSON.stringify({ t: "archivo.fin", id } satisfies MsgFin));
      if (!finSalio) {
        const s = Math.round(ms / 1000);
        const detalle = late
          ? `sin noticias suyas en ${s} s, cuando avisaba cada pocos segundos (¿app cerrada, en segundo plano o sin memoria?)`
          : `sin respuesta en ${s} s tras mandar el último trozo (¿app cerrada o sin memoria?)`;
        emitir({
          ...actual,
          fase: "error",
          motivo: textoErrorRemoto({ motivo: "sin-confirmacion", detalle, lado: "receptor" }),
          codigo: "sin-confirmacion",
          lado: "receptor",
          actualizadoMs: Date.now(),
        });
        return;
      }
      const graciaMs = Math.min(10_000, Math.max(1, Math.round(ms / 2)));
      const t2 = setTimeout(() => {
        vigias.delete(id);
        const actual2 = estados.get(id);
        if (!actual2 || actual2.rol !== "enviar" || actual2.fase !== "verificando") return;
        const s = Math.round(graciaMs / 1000);
        const detalle = late
          ? `sin noticias suyas en ${s} s, cuando avisaba cada pocos segundos (¿app cerrada, en segundo plano o sin memoria?)`
          : `sin respuesta en ${s} s tras mandar el último trozo (¿app cerrada o sin memoria?)`;
        emitir({
          ...actual2,
          fase: "error",
          motivo: textoErrorRemoto({ motivo: "sin-confirmacion", detalle, lado: "receptor" }),
          codigo: "sin-confirmacion",
          lado: "receptor",
          actualizadoMs: Date.now(),
        });
      }, graciaMs);
      (t2 as { unref?: () => void }).unref?.();
      vigias.set(id, { t: t2, fase: "gracia" });
    }, ms);
    (t as { unref?: () => void }).unref?.();
    vigias.set(id, { t, fase: "completa" });
  }

  /** (ARC1108B) Índices de esta vuelta: los huecos que pidió el receptor o, si no, de `desde` al final. */
  function indicesAMandar(id: string, trozos: number): number[] {
    const out: number[] = [];
    const huecos = huecosPorId.get(id);
    if (huecos) {
      for (const [a, b] of huecos) for (let i = a; i <= b && i < trozos; i++) out.push(i);
      return out;
    }
    for (let i = desdePorId.get(id) ?? 0; i < trozos; i++) out.push(i);
    return out;
  }

  /**
   * (ARC1108B) Con un receptor que late, no ir más de la ventana por delante de lo que YA guardó: su
   * memoria queda acotada aunque su almacén escriba mucho más despacio de lo que llega. Si deja de dar
   * noticias, se sigue sin freno (la espera tras «fin» decide). false si se canceló mientras esperaba.
   */
  async function esperarVentana(id: string, debeTener: number, ventana: number): Promise<boolean> {
    while (conLatido.has(id) && debeTener - (guardadosRemotos.get(id) ?? 0) > ventana) {
      if (cancelados.has(id)) return false;
      const e = estados.get(id);
      if (Date.now() - (ultimoContacto.get(id) ?? 0) > esperaSinNoticias(e?.trozos ?? 0, e?.tamano ?? 0)) break;
      await esperar(20);
    }
    return !cancelados.has(id);
  }

  async function transmitir(id: string): Promise<void> {
    const canal = canalPorId.get(id);
    const archivo = archivosEnvio.get(id);
    const estado = estados.get(id);
    if (!canal || !archivo || !estado) return;
    actualizarFase(id, "transfiriendo");
    inicioTransferencia.set(id, Date.now()); // ARC1110A
    const modo = modoPorId.get(id) ?? "base64";
    const tam = tamanoTrozoPorId.get(id) ?? ofertasEnviadas.get(id)?.tamanoTrozo ?? TAM_TROZO_POR_DEFECTO;
    const indices = indicesAMandar(id, estado.trozos);
    // (ARC1108B) Lo que el receptor ya tiene es todo lo que no se le manda en esta vuelta.
    const yaTiene = estado.trozos - indices.length;
    const ventana = Math.max(2, Math.ceil(VENTANA_VUELO_BYTES / Math.max(1, tam)));
    if (conLatido.has(id)) guardadosRemotos.set(id, yaTiene);
    let k = 0;
    while (k < indices.length) {
      const i = indices[k];
      if (cancelados.has(id)) {
        actualizarFase(id, "cancelada");
        return;
      }
      // (ARC1108B) Freno por lo que el receptor YA guardó, además del de la cola del canal.
      if (!(await esperarVentana(id, yaTiene + k, ventana))) {
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
      const inicio = i * tam;
      const fin = Math.min(archivo.size, inicio + tam);
      const datos = await archivo.slice(inicio, fin).arrayBuffer();
      let enviado = false;
      // (BLE1108B) «Listo para enviar» del portador, antes de CADA trozo: sin enlace (se cayó) espera a que
      // vuelva y sigue en este mismo trozo; no gasta los reintentos ni salta ninguno.
      const listo = await esperarListoConPlazo(canal);
      if (cancelados.has(id)) {
        actualizarFase(id, "cancelada");
        return;
      }
      if (!listo) {
        enviado = false;
      } else if (modo === "binario" && canal.enviarBinario) {
        const chunkBin = encodeChunkBinario(id, i, datos);
        enviado = canal.enviarBinario(chunkBin);
      } else {
        const msg: MsgChunk = { t: "archivo.chunk", id, index: i, datosB64: bufAB64(datos) };
        const texto = JSON.stringify(msg);
        // (BLE1108B) Con acuse, el trozo cuenta cuando el otro aparato lo recibió: el progreso es el
        // último trozo CONFIRMADO y un corte reintenta este mismo trozo.
        enviado = canal.enviarConAcuse ? await canal.enviarConAcuse(texto).catch(() => false) : canal.enviar(texto);
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
            hito(id, "fallo", "motivo=canal-no-recupera lado=remitente"); // ARC1110A
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
        // No avanzamos: reintentamos el mismo trozo
        continue;
      }
      // Envío exitoso: resetear contador de reintentos para este id
      intentosReintento.delete(id);
      k++;
      actualizarProgreso(id, yaTiene + k);
      if (k === 1 || k % 8 === 0) anotarVias(id, canal);
    }
    anotarVias(id, canal);
    if (cancelados.has(id)) return;
    {
      // ARC1110A: todos los trozos salieron. kbps medidos desde que empezó a mandar; vías = el reparto del canal.
      const segundos = Math.max(0.001, (Date.now() - (inicioTransferencia.get(id) ?? Date.now())) / 1000);
      const bytes = Math.min(archivo.size, indices.length * tam);
      const reparto = (estados.get(id)?.repartoVias ?? canal.resumenVias?.()?.texto ?? "-").replace(/\s+/g, "_");
      hito(id, "completo", `kbps=${Math.round((bytes * 8) / 1000 / segundos)} bytes=${bytes} vias=${reparto}`);
    }
    // «fin» (con un par de reintentos si el canal está un momento lleno) y, desde ARC1108A, el
    // remitente queda «verificando» hasta que el receptor confirme: nunca colgado sin decir nada.
    let finSalio = false;
    for (let intento = 0; intento < 4 && !finSalio && !cancelados.has(id); intento++) {
      if (intento > 0) await esperar(reintentoConfig.esperaBaseMs * intento);
      const textoFin = JSON.stringify({ t: "archivo.fin", id } satisfies MsgFin);
      finSalio = canal.enviarConAcuse ? await canal.enviarConAcuse(textoFin).catch(() => false) : canal.enviar(textoFin);
    }
    const e = estados.get(id);
    if (!e || cancelados.has(id)) return;
    if (!finSalio) {
      emitir({ ...e, fase: "error", motivo: "Falló en el remitente: no se pudo mandar el aviso de fin (el canal no recupera).", codigo: "canal-no-recupera", lado: "remitente", actualizadoMs: Date.now() });
      return;
    }
    if (e.fase === "transfiriendo" || e.fase === "reintentando") {
      emitir({ ...e, fase: "verificando", motivo: "Esperando a que el otro aparato verifique el SHA-256…", actualizadoMs: Date.now() });
      vigilarVerificacion(id);
    }
  }

  function manejarAceptar(msg: MsgAceptar): void {
    const estado = estados.get(msg.id);
    if (!estado || estado.rol !== "enviar") return;
    if (!transmitiendo.has(msg.id)) hito(msg.id, "aceptado", "rol=enviar"); // ARC1110A
    // (ARC1108A) Un «aceptar» repetido (trama reenviada) no abre un segundo bucle de envío.
    if (transmitiendo.has(msg.id) || estado.fase === "completada") return;
    const desde = typeof msg.desde === "number" && Number.isInteger(msg.desde) ? Math.min(Math.max(0, msg.desde), estado.trozos) : 0;
    desdePorId.set(msg.id, desde);
    // (ARC1108B) Solo los huecos que pide (reanudar sin volver a mandar lo que ya tiene) y si late.
    const huecos = sanearHuecos(msg.huecos, estado.trozos);
    if (huecos) huecosPorId.set(msg.id, huecos);
    else huecosPorId.delete(msg.id);
    if (typeof msg.acuses === "number" && msg.acuses >= 1) conLatido.add(msg.id);
    else conLatido.delete(msg.id);
    ultimoContacto.set(msg.id, Date.now());
    // (BLE1108B) La ruta que mide el receptor: si es la misma que la mía, «verificada por ambos».
    const rutaOtra = sanearRutaEnlace(msg.rutaEnlace);
    if (rutaOtra) {
      const actual = estados.get(msg.id);
      if (actual) emitir({ ...actual, rutaEnlaceOtro: rutaOtra, rutaEnlaceVerificada: actual.rutaEnlace ? actual.rutaEnlace === rutaOtra : null });
    }
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

  /**
   * (ARC1108B) Latido del receptor: lo que ya guardó (el freno de la ventana) y, tras «fin», qué está
   * haciendo; cada latido reinicia la espera sin noticias y la burbuja lo cuenta. Si el remitente ya lo
   * había dado por perdido («sin-confirmacion») y el otro sigue vivo, vuelve a «verificando».
   */
  function manejarProgresoRemoto(msg: MsgProgreso): void {
    const e = estados.get(msg.id);
    if (!e || e.rol !== "enviar" || cancelados.has(msg.id)) return;
    const n = Math.max(0, Math.min(e.trozos, Math.floor(msg.n)));
    conLatido.add(msg.id);
    ultimoContacto.set(msg.id, Date.now());
    guardadosRemotos.set(msg.id, n);
    const revive = e.fase === "error" && e.codigo === "sin-confirmacion" && archivosEnvio.has(msg.id);
    if (e.fase !== "verificando" && !revive) return;
    vigilarVerificacion(msg.id);
    const pct = typeof msg.pct === "number" && Number.isFinite(msg.pct) ? msg.pct : undefined;
    const motivo = textoProgresoRemoto(String(msg.fase), n, e.trozos, pct);
    if (revive || motivo !== e.motivo) {
      emitir({ ...e, fase: "verificando", motivo, codigo: undefined, lado: undefined, actualizadoMs: Date.now() });
    }
  }

  function manejarRechazar(msg: MsgRechazar): void {
    anunciando.delete(msg.id); // ARC1110A: se deja de preparar lo que ya se rechazó
    preparaciones.delete(msg.id);
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
    hito(msg.id, "verificado", "rol=enviar"); // ARC1110A
    emitir({ ...e, fase: "completada", progreso: e.trozos, motivo: undefined, codigo: undefined, lado: undefined, actualizadoMs: Date.now() });
    // (MPT1108A) El reparto final por vías (los envíos cifrados salen en segundo plano: al acabar ya se sabe).
    const canalOk = canalPorId.get(msg.id);
    if (canalOk) anotarVias(msg.id, canalOk);
    archivosEnvio.delete(msg.id);
    canalPorId.delete(msg.id);
    desdePorId.delete(msg.id);
    intentosReintento.delete(msg.id);
    ofertasEnviadas.delete(msg.id);
    reanudacionesAuto.delete(msg.id);
    tamanoTrozoPorId.delete(msg.id);
    olvidarRemitente(msg.id);
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
    hito(msg.id, "fallo", `motivo=${String(msg.motivo).slice(0, 40)} lado=${lado}`); // ARC1110A
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
  /** (BLE1108B) Una clase de ruta cabe en 40 caracteres de [a-z-]; cualquier otra cosa se ignora. */
  function sanearRutaEnlace(r: unknown): string | undefined {
    return typeof r === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(r) ? r : undefined;
  }

  /** (BLE1108B) La ruta del enlace por el que llegó la oferta, junto a la que dice el remitente. */
  function rutaDeOferta(canal: CanalArchivos, msg: MsgOferta): Partial<EstadoTransferencia> {
    const propia = sanearRutaEnlace(canal.rutaMedida?.());
    const otra = sanearRutaEnlace(msg.rutaEnlace);
    return {
      ...(propia ? { rutaEnlace: propia } : {}),
      ...(otra ? { rutaEnlaceOtro: otra } : {}),
      rutaEnlaceVerificada: propia && otra ? propia === otra : null,
    };
  }

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
    const contenido = sanearContenido(msg.contenido);
    if (contenido) extras.contenido = contenido;
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
    // (ARC1108B) Con trozos ya guardados, los huecos exactos: el remitente manda SOLO eso (con `desde`,
    // un remitente anterior manda todo lo que va detrás del primer hueco, aunque ya esté aquí).
    const huecos = tenidos.size > 0 ? huecosDe(tenidos, oferta.trozos) : null;
    if (!hashesPorId.has(id)) hashesPorId.set(id, []);
    emitir({ ...estado, fase: "transfiriendo", progreso: tenidos.size, actualizadoMs: Date.now() });
    const modo = modoPorId.get(id) ?? "base64";
    hito(id, "aceptado", `rol=recibir desde=${desde}`); // ARC1110A
    anotarVias(id, canal);
    const rutaRecibida = sanearRutaEnlace(canal.rutaMedida?.());
    canal.enviar(JSON.stringify({ t: "archivo.aceptar", id, modo, ...(desde > 0 ? { desde } : {}), acuses: 1, ...(huecos ? { huecos } : {}), ...(rutaRecibida ? { rutaEnlace: rutaRecibida } : {}) } satisfies MsgAceptar));
  }

  /* ---- (ARC1108B) latido del receptor ---- */

  function tamanoTrozoRecibido(id: string): number {
    const t = ofertasEntrantes.get(id)?.tamanoTrozo;
    return typeof t === "number" && t > 0 ? t : TAM_TROZO_POR_DEFECTO;
  }

  /** Manda YA un latido: cuántos trozos tiene guardados y qué hace. Nunca lanza. */
  function mandarProgreso(id: string, fase: FaseReceptor, pct?: number): void {
    const canal = canalPorId.get(id);
    const n = recibidosPorId.get(id)?.size ?? 0;
    const l = latidos.get(id) ?? { n: -1, at: 0 };
    if (l.t !== undefined) clearTimeout(l.t);
    latidos.set(id, { n, at: Date.now() });
    if (!canal) return;
    try {
      canal.enviar(JSON.stringify({ t: "archivo.progreso", id, n, fase, ...(pct !== undefined ? { pct: Math.round(pct) } : {}) } satisfies MsgProgreso));
    } catch {
      /* el siguiente latido lo intenta otra vez */
    }
  }

  /**
   * Acuse de lo guardado mientras llegan trozos: en el acto cada MiB guardado (o cada segundo, o al
   * tenerlos todos) y, si no, como mucho 250 ms después del último trozo guardado. Así el remitente,
   * que no va más de la ventana por delante, nunca se queda esperando un acuse que no llega.
   */
  function acusarGuardados(id: string, trozos: number): void {
    const n = recibidosPorId.get(id)?.size ?? 0;
    const l = latidos.get(id) ?? { n: -1, at: 0 };
    const cada = Math.max(1, Math.floor(ACUSE_CADA_BYTES / tamanoTrozoRecibido(id)));
    if (n - l.n >= cada || Date.now() - l.at >= 1000 || n >= trozos) {
      mandarProgreso(id, "recibiendo");
      return;
    }
    if (l.t !== undefined) return;
    const t = setTimeout(() => {
      const actual = latidos.get(id);
      if (actual) actual.t = undefined;
      if (!estados.has(id) || cancelados.has(id)) return;
      if ((recibidosPorId.get(id)?.size ?? 0) !== (actual?.n ?? -1)) mandarProgreso(id, "recibiendo");
    }, 250);
    (t as { unref?: () => void }).unref?.();
    latidos.set(id, { ...l, t });
  }

  function olvidarLatido(id: string): void {
    const l = latidos.get(id);
    if (l?.t !== undefined) clearTimeout(l.t);
    latidos.delete(id);
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
    // (ARC1110A) ¿La persona la rechazó de antemano, con el anuncio? Se le repite al remitente y no se vuelve a preguntar.
    const rechazadaEn = rechazadasAntes.get(msg.id);
    if (rechazadaEn !== undefined && Date.now() - rechazadaEn < 60_000) {
      canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo: "Rechazado por el usuario." } satisfies MsgRechazar));
      return;
    }
    if (!ofertasEntrantes.has(msg.id)) hito(msg.id, "oferta-recibida", `bytes=${msg.tamano} trozos=${msg.trozos}`);
    anunciosEntrantes.delete(msg.id);
    const preAceptada = preaceptadas.delete(msg.id);
    // (BLE1108B) La misma oferta repetida (el remitente la reenvía hasta que le contestan) mientras la persona
    // aún decide: no se pregunta dos veces; solo se apunta por qué canal volver a hablarle.
    const preguntada = ofertasEntrantes.get(msg.id);
    if (preguntada && estados.get(msg.id)?.fase === "pendiente-aceptar" && preguntada.sha256 === msg.sha256 && preguntada.tamano === msg.tamano) {
      canalPorId.set(msg.id, canal);
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
    if (yaAceptada && !mismoArchivo && !verificandoFin.has(msg.id)) {
      // (ARC1108B) El mismo id con OTRO contenido (o partido en otros trozos): lo de antes ya no sirve.
      await almacen.limpiar(msg.id).catch(() => undefined);
      recibidosPorId.delete(msg.id);
      hashesPorId.delete(msg.id);
      escrituras.delete(msg.id);
      aceptadas.delete(msg.id);
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
      ...rutaDeOferta(canal, msg),
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

    // (ARC1108B) ¿Cabe? Se dice ANTES de aceptar (y antes de preguntar a la persona), no a mitad de
    // camino con la app sin memoria: memoria con tope, o la cuota del disco de la página.
    if (!mismoArchivo && almacen.espacioPara) {
      const falta = Math.max(0, msg.tamano - tenidos.size * (msg.tamanoTrozo > 0 ? msg.tamanoTrozo : TAM_TROZO_POR_DEFECTO));
      const cabe = await almacen.espacioPara(falta).catch(() => ({ ok: true, motivo: undefined }));
      if (!cabe.ok) {
        const motivo = `No cabe en el aparato que recibe: ${cabe.motivo ?? "no hay sitio para guardarlo"}.`;
        emitir({ ...estadoBase, progreso: 0, fase: "rechazada", motivo, codigo: "sin-espacio", lado: "receptor" });
        canal.enviar(JSON.stringify({ t: "archivo.rechazar", id: msg.id, motivo } satisfies MsgRechazar));
        ofertasEntrantes.delete(msg.id);
        return;
      }
    }

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

    if ((decision === "auto-aceptar" || preAceptada) && !avisoFinal) {
      pedirTrozos(canal, msg, tenidos, estadoBase);
      return;
    }

    // "preguntar": queda pendiente hasta que la UI llame aceptarOferta/rechazarOferta.
    recibidosPorId.set(msg.id, tenidos);
    emitir(estadoBase);
    if (!notificadas.delete(msg.id)) config.onOfertaEntrante?.({
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
    // (ARC1110A) Solo llegó el anuncio: se acepta DE ANTEMANO. Empieza sola cuando llegue la oferta.
    if (!oferta && canal && e && e.rol === "recibir" && e.fase === "pendiente-aceptar" && e.preparando) {
      preaceptadas.add(id);
      emitir({ ...e, fase: "transfiriendo", preaceptada: true, motivo: `Aceptado: empezará en cuanto ${e.origen ?? "el otro aparato"} termine de preparar el archivo.`, actualizadoMs: Date.now() });
      canal.enviar(JSON.stringify({ t: "archivo.preaceptar", id } satisfies MsgPreaceptar));
      hito(id, "preaceptado", "rol=recibir");
      return;
    }
    // Solo lo que espera respuesta (un doble clic, o «Aceptar todos» tras aceptar uno, no repite nada).
    if (!oferta || !canal || !e || e.fase !== "pendiente-aceptar") return;
    pedirTrozos(canal, oferta, recibidosPorId.get(id) ?? new Set<number>(), e);
  }

  function rechazarOferta(id: string, motivo = "Rechazado por el usuario."): void {
    const e = estados.get(id);
    if (e && e.rol === "recibir" && e.fase === "completada") return;
    const canal = canalPorId.get(id);
    if (e?.preparando || anunciosEntrantes.has(id)) rechazadasAntes.set(id, Date.now()); // ARC1110A: rechazada con solo el anuncio
    anunciosEntrantes.delete(id);
    preaceptadas.delete(id);
    notificadas.delete(id);
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
   * (ARC1108B) A la vez que se guarda se calcula su SHA-256 (verificar ya no relee el almacén entero) y
   * se acusa lo guardado al remitente (`archivo.progreso`), que frena con eso. Un duplicado se descarta
   * ANTES de decodificarlo, guardarlo o calcular su hash.
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
    let hash: ArrayBuffer | undefined;
    // `digest` copia los bytes al llamarlo: se puede guardar a la vez sin esperar.
    const escritura = Promise.all([almacen.guardarTrozo(id, index, datos), sha256(datos)]).then(
      ([, h]) => {
        hash = h;
        return null;
      },
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
    let hashes = hashesPorId.get(id);
    if (!hashes) {
      hashes = [];
      hashesPorId.set(id, hashes);
    }
    hashes[index] = hash;
    actual.add(index);
    actualizarProgreso(id, actual.size);
    if (estado) acusarGuardados(id, estado.trozos);
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
    hito(id, "fallo", `motivo=${codigo} lado=receptor`); // ARC1110A
    const e = estados.get(id);
    if (e) {
      emitir({ ...e, fase: "error", motivo: `Falló en este aparato (receptor): ${describirErrorArchivo(codigo)} — ${detalle}.`, codigo, lado: "receptor", actualizadoMs: Date.now() });
    }
    olvidarLatido(id);
    const salida = canalPorId.get(id) ?? canal;
    salida.enviar(JSON.stringify({ t: "archivo.error", id, motivo: codigo, detalle, lado: "receptor", ...(opciones.desde !== undefined ? { desde: opciones.desde } : {}) } satisfies MsgError));
    fallosAlmacen.delete(id);
    if (opciones.limpiar) {
      await almacen.limpiar(id).catch(() => undefined);
      recibidosPorId.delete(id);
      escrituras.delete(id);
      hashesPorId.delete(id);
    }
  }

  /** (ARC1108B) Lo que se lee del almacén de una vez al unir el archivo, y cada cuánto se junta en un Blob. */
  const LOTE_LECTURA = 16;
  const BYTES_POR_PARTE = 4 * 1024 * 1024;

  /**
   * (ARC1108B) Une el archivo en UNA pasada por el almacén (antes eran dos: releer todo para el hash y
   * releerlo todo otra vez para ensamblar, además de recorrer los índices de todos los almacenes) y
   * comprueba que cada trozo se relee IGUAL que llegó (el SHA-256 calculado al recibirlo): así se sigue
   * verificando lo que de verdad quedó guardado. Va juntando partes de ~4 MB en Blobs: nunca tiene el
   * archivo dos veces en memoria. Rellena los hashes que falten (trozos de una sesión anterior).
   */
  async function unirVerificado(
    id: string,
    estado: EstadoTransferencia,
    hashes: Array<ArrayBuffer | undefined>,
    alAvance: (pct: number) => void,
  ): Promise<{ blob: Blob } | { fallo: string }> {
    const donde = almacen.tipo ?? "el almacenamiento";
    const partes: Blob[] = [];
    let pendiente: ArrayBuffer[] = [];
    let bytesPendiente = 0;
    for (let i0 = 0; i0 < estado.trozos; i0 += LOTE_LECTURA) {
      if (cancelados.has(id)) return { fallo: "cancelada" };
      const indices: number[] = [];
      for (let i = i0; i < Math.min(estado.trozos, i0 + LOTE_LECTURA); i++) indices.push(i);
      let leidos: Array<ArrayBuffer | null>;
      try {
        leidos = almacen.leerTrozos ? await almacen.leerTrozos(id, indices) : await Promise.all(indices.map((i) => almacen.leerTrozo(id, i).catch(() => null)));
      } catch {
        leidos = indices.map(() => null);
      }
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        const d = await bytesExactos(leidos[j] ?? null);
        if (!d) return { fallo: `el trozo ${i} no se pudo releer de ${donde}` };
        const h = await sha256(d);
        const alRecibir = hashes[i];
        if (alRecibir && !mismosBytes(h, alRecibir)) return { fallo: `el trozo ${i} no se relee de ${donde} igual que llegó (cambió al guardarse)` };
        hashes[i] = h;
        pendiente.push(d);
        bytesPendiente += d.byteLength;
      }
      if (bytesPendiente >= BYTES_POR_PARTE) {
        partes.push(new Blob(pendiente));
        pendiente = [];
        bytesPendiente = 0;
      }
      alAvance(((i0 + indices.length) / estado.trozos) * 100);
    }
    if (pendiente.length) partes.push(new Blob(pendiente));
    return { blob: new Blob(partes, { type: estado.tipo }) };
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
    // Lo que decía la tarjeta (avisos del centinela o de la red): vuelve al terminar.
    const motivoPrevio = estado.motivo;
    // (ARC1108B) Late mientras espera, verifica y une: el remitente sabe que sigue vivo y trabajando.
    let faseLatido: FaseReceptor = (escrituras.get(id)?.size ?? 0) > 0 ? "recibiendo" : "esperando-trozos";
    let pctLatido: number | undefined;
    const latir = setInterval(() => mandarProgreso(id, faseLatido, pctLatido), INTERVALO_LATIDO_MS);
    (latir as { unref?: () => void }).unref?.();
    const avanzar = (fase: FaseReceptor, pct?: number) => {
      const cambia = fase !== faseLatido;
      faseLatido = fase;
      pctLatido = pct;
      // Cada cambio de fase se dice en el acto; el avance dentro de una fase, con el latido.
      if (cambia) mandarProgreso(id, fase, pct);
      const e = estados.get(id);
      const motivo = fase === "ensamblando" ? `Verificando y uniendo el archivo (SHA-256)… ${Math.floor(pct ?? 0)} %` : fase === "verificando" ? "Verificando el SHA-256…" : undefined;
      if (e && motivo && motivo !== e.motivo) emitir({ ...e, motivo, actualizadoMs: Date.now() });
    };
    try {
      actualizarFase(id, "verificando");
      mandarProgreso(id, faseLatido);
      // (2026-10-10 · transporte universal) Por VARIOS enlaces a la vez (`canal-multitrayecto.ts`)
      // el «fin» puede llegar antes que el último trozo de otro camino: se espera a tenerlos todos.
      // (ARC1108B) Mientras sigan llegando (o guardándose) se sigue esperando; se rinde tras 15 s SIN
      // avance (antes, 15 s en total: con un almacén lento eso no bastaba).
      for (let ultimoAvance = Date.now(), visto = recibidosPorId.get(id)?.size ?? 0; (recibidosPorId.get(id)?.size ?? 0) < estado.trozos; ) {
        if (cancelados.has(id)) return;
        if (fallosAlmacen.has(id) && (escrituras.get(id)?.size ?? 0) === 0) break;
        const n = recibidosPorId.get(id)?.size ?? 0;
        if (n !== visto) {
          visto = n;
          ultimoAvance = Date.now();
        }
        if (Date.now() - ultimoAvance >= ESPERA_FALTANTES_MS) break;
        // Guardando lo que ya llegó, o esperando lo que aún viene por otro camino: el latido lo distingue.
        faseLatido = (escrituras.get(id)?.size ?? 0) > 0 ? "recibiendo" : "esperando-trozos";
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
      const esperado = hashesEsperados.get(id);
      const hashes = hashesPorId.get(id) ?? [];
      // (ARC1108B) 1) Lo que LLEGÓ, sin releer nada: el SHA-256 de cada trozo se calculó al recibirlo.
      avanzar("verificando", 0);
      let todos = true;
      for (let i = 0; i < estado.trozos && todos; i++) if (!hashes[i]) todos = false;
      const integridadMal = async () => {
        // Trama que no supera la autoverificación: pesa contra la neurona que la envió (§5.6).
        aplicarEventoA(id, "trama-corrupta");
        await fallarRecepcion(canal, id, "hash-no-coincide", `llegaron los ${estado.trozos} trozos, guardados en ${almacen.tipo ?? "el almacenamiento"}, pero su SHA-256 no es el del original`, { limpiar: true });
      };
      if (todos && esperado && (await raizDeHashes(hashes.slice(0, estado.trozos) as ArrayBuffer[])) !== esperado) {
        await integridadMal();
        return;
      }
      // 2) Una sola pasada por el almacén: une el archivo y comprueba que cada trozo quedó bien guardado.
      avanzar("ensamblando", 0);
      const unido = await unirVerificado(id, estado, hashes, (pct) => avanzar("ensamblando", pct));
      if (cancelados.has(id)) return;
      if ("fallo" in unido) {
        await fallarRecepcion(canal, id, "almacen-receptor", unido.fallo, { limpiar: true });
        return;
      }
      // Trozos de una sesión anterior (sin hash al recibir): la raíz, ahora que están todos.
      if (!todos && esperado && (await raizDeHashes(hashes.slice(0, estado.trozos) as ArrayBuffer[])) !== esperado) {
        await integridadMal();
        return;
      }
      const blob = unido.blob;
      if (blob.size !== estado.tamano) {
        await fallarRecepcion(canal, id, "almacen-receptor", `el archivo ensamblado mide ${blob.size} B y no los ${estado.tamano} B anunciados`, { limpiar: true });
        return;
      }
      blobsRecibidos.set(id, blob);
      // Integridad verificada por la neurona origen: la confianza sube.
      aplicarEventoA(id, "firma-ok");
      const hecho = estados.get(id);
      if (hecho) emitir({ ...hecho, fase: "completada", motivo: motivoPrevio, actualizadoMs: Date.now() });
      hito(id, "verificado", `rol=recibir bytes=${blob.size}`); // ARC1110A
      olvidarLatido(id);
      canal.enviar(JSON.stringify({ t: "archivo.ok", id } satisfies MsgOk));
      config.onCompletado?.(estados.get(id) as EstadoTransferencia, blob);
      await almacen.limpiar(id).catch(() => undefined);
      recibidosPorId.delete(id);
      hashesEsperados.delete(id);
      hashesPorId.delete(id);
      ofertasEntrantes.delete(id);
      escrituras.delete(id);
    } catch (e) {
      await fallarRecepcion(canal, id, "fallo-verificacion", e instanceof Error ? e.message : String(e), { limpiar: false }).catch(() => undefined);
    } finally {
      clearInterval(latir);
      verificandoFin.delete(id);
    }
  }

  function manejarCancelarRemoto(msg: MsgCancelar): void {
    cancelados.add(msg.id);
    anunciosEntrantes.delete(msg.id); // ARC1110A
    preaceptadas.delete(msg.id);
    anunciando.delete(msg.id);
    limpiarVigia(msg.id);
    olvidarLatido(msg.id);
    actualizarFase(msg.id, "cancelada");
  }

  function cancelar(id: string): void {
    cancelados.add(id);
    anunciosEntrantes.delete(id); // ARC1110A
    preaceptadas.delete(id);
    anunciando.delete(id);
    preparaciones.delete(id);
    limpiarVigia(id);
    olvidarLatido(id);
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
        case "archivo.anuncio":
          void manejarAnuncio(canal, msg, contexto); // ARC1110A
          break;
        case "archivo.preaceptar":
          manejarPreaceptar(msg); // ARC1110A
          break;
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
        case "archivo.progreso":
          manejarProgresoRemoto(msg);
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
      // (ARC1108B) Solo la cabecera: un duplicado (varios caminos) se descarta sin copiar sus datos.
      const cab = buf ? cabeceraChunkBinario(buf) : null;
      if (!buf || !cab) return;
      void recibirTrozo(cab.id, cab.index, () => buf.slice(cab.offset));
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
let fuenteRutaPeer: ((deviceId: string) => string | null) | null = null;
/** (BLE1108B) Quien sabe la ruta medida de cada par de la malla de la cuenta (la pone el transporte universal). */
export function fijarFuenteRutaPeer(f: ((deviceId: string) => string | null) | null): void {
  fuenteRutaPeer = f;
}

export function canalDesdeMesh(mesh: MeshHandle, deviceId: string): CanalArchivos {
  return {
    // (BLE1108B) La ruta que mide ESTE aparato del enlace con ese par (clasificador común).
    rutaMedida: () => fuenteRutaPeer?.(deviceId) ?? null,
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
  // (MPT1108B) El cifrado de archivo se abre antes del motor; carga perezosa (evita un ciclo de módulos). Sin cargar, pasa directo.
  let entrada: ((m: Pick<MotorArchivos, "manejarMensaje">, c: CanalArchivos, d: string | ArrayBuffer, x?: ContextoRecepcion) => void) | null = null;
  void import("@/lib/malla/recepcion-sellada").then((m) => (entrada = m.recibirArchivo)).catch(() => undefined);
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
        (entrada ?? ((m, c, d, x) => m.manejarMensaje(c, d, x)))(motor, canal, data, {
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
