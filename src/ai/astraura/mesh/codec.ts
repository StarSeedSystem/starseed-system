/**
 * StarSeed OS — Red Mesh · CODEC del sobre binario (Adenda 97 · SOP §5.1).
 * ============================================================================
 * Serialización EXTREMADAMENTE eficiente para el canal LoRa (~1 kbps):
 *
 *   1. FILTRADO: solo entra la whitelist de campos por tipo (sync.ts filtra).
 *   2. COMPACTADO: JSON con claves cortas → UTF-8.
 *   3. COMPRESIÓN: deflate-raw nativo (CompressionStream) si ahorra bytes.
 *   4. TROCEO: frames de ≤ 200 B (cabecera 9 B + payload ≤ 191 B).
 *   5. INTEGRIDAD: CRC-16/CCITT del payload COMPLETO, verificado al reensamblar.
 *
 * Formato de frame (SOP §5.1):
 *   [0] magic 0xA7 · [1] (versión<<4)|flags · [2..3] msgId BE ·
 *   [4] (clase<<4)|tipo · [5] chunkIdx · [6] chunkTotal · [7..8] CRC-16 BE ·
 *   [9..] payload del trozo
 *
 * Módulo PURO y testeable (scripts/test-mesh-core.ts). SSR-safe: la compresión
 * nativa se sondea en tiempo de ejecución y hay camino sin comprimir. Las
 * funciones NUNCA lanzan hacia fuera: devuelven null/[] ante datos corruptos
 * (en una malla abierta llegará basura — se ignora con dignidad).
 */

import {
  MESH_CHUNK_PAYLOAD_BYTES,
  MESH_MAGIC,
  MESH_MAX_CHUNKS,
  MESH_VERSION,
  REASSEMBLY_TIMEOUT_MS,
} from "./constants";
import type { MeshPayloadType, TrafficClass } from "./types";

/* ── Tablas de mapeo compacto (1 nibble cada una) ──────────────────────────── */

const CLASS_TO_NIBBLE: Record<TrafficClass, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const NIBBLE_TO_CLASS: TrafficClass[] = ["P0", "P1", "P2", "P3"];

const TYPE_TO_NIBBLE: Record<MeshPayloadType, number> = {
  alert: 0,
  message: 1,
  presence: 2,
  "state-delta": 3,
  manifest: 4,
  "chunk-req": 5,
  post: 6,
};
const NIBBLE_TO_TYPE: MeshPayloadType[] = [
  "alert",
  "message",
  "presence",
  "state-delta",
  "manifest",
  "chunk-req",
  "post",
];

const FLAG_DEFLATE = 0b0001;
const FLAG_E2E = 0b0010; // cifrado extra extremo-a-extremo (capa superior)
const FLAG_ACK_REQ = 0b0100;

/* ── CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — puro, sin tablas npm ─── */

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/* ── Compresión nativa (deflate-raw) con sonda y fallback sin comprimir ───── */

let deflateSupport: boolean | null = null;

/** ¿El runtime tiene CompressionStream? (Chrome/Edge/Safari 16.4+/Node 18+). */
export function deflateSupported(): boolean {
  if (deflateSupport !== null) return deflateSupport;
  try {
    deflateSupport =
      typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
  } catch {
    deflateSupport = false;
  }
  return deflateSupport;
}

async function pipeThrough(
  bytes: Uint8Array,
  stream: { readable: ReadableStream; writable: WritableStream },
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // No await encadenado del write para no dejar el stream a medias ante error.
  void writer.write(bytes.slice()).catch(() => null);
  void writer.close().catch(() => null);
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
      parts.push(chunk);
      total += chunk.length;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!deflateSupported()) return null;
  try {
    return await pipeThrough(bytes, new CompressionStream("deflate-raw"));
  } catch {
    return null;
  }
}

export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!deflateSupported()) return null;
  try {
    return await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
  } catch {
    return null;
  }
}

/* ── Codificación del cuerpo (filtrado + claves cortas la hace sync.ts) ───── */

const te = new TextEncoder();
const td = new TextDecoder();

/** Serializa el body (ya filtrado) a bytes; JSON compacto UTF-8. Nunca lanza. */
export function bodyToBytes(body: unknown): Uint8Array {
  try {
    return te.encode(JSON.stringify(body ?? null));
  } catch {
    return te.encode("null");
  }
}

export function bytesToBody(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(td.decode(bytes));
  } catch {
    return null;
  }
}

/* ── Sobre: encode → frames · decode ← frame ───────────────────────────────── */

export interface EncodedMessage {
  msgId: number;
  frames: Uint8Array[];
  /** Bytes totales en el aire (para presupuestar airtime). */
  totalBytes: number;
  /** ¿Se comprimió? (telemetría honesta de la UI). */
  deflated: boolean;
}

export interface EncodeOptions {
  cls: TrafficClass;
  type: MeshPayloadType;
  /** Marcar cifrado E2E aplicado por la capa superior. */
  e2e?: boolean;
  /** Pedir ACK de malla (unicast). */
  ackReq?: boolean;
  /** Forzar msgId (pruebas). */
  msgId?: number;
}

/**
 * Codifica un body en 1..MESH_MAX_CHUNKS frames listos para TX.
 * Devuelve null si el payload comprimido sigue sin caber (la capa de arriba
 * decide: recortar, trocear semánticamente o rechazar la clase).
 */
export async function encodeMessage(
  body: unknown,
  opts: EncodeOptions,
): Promise<EncodedMessage | null> {
  const raw = bodyToBytes(body);
  let payload = raw;
  let deflated = false;
  // Comprimir solo si de verdad ahorra (payloads diminutos crecen con deflate).
  if (raw.length > 48) {
    const z = await deflateRaw(raw);
    if (z && z.length < raw.length) {
      payload = z;
      deflated = true;
    }
  }

  const total = Math.ceil(payload.length / MESH_CHUNK_PAYLOAD_BYTES) || 1;
  if (total > MESH_MAX_CHUNKS) return null;

  const msgId =
    typeof opts.msgId === "number"
      ? opts.msgId & 0xffff
      : // Aleatorio criptográfico si existe; determinista suave si no (SSR/tests).
        (globalThis.crypto?.getRandomValues?.(new Uint16Array(1))?.[0] ??
          (payload.length * 31 + raw.length * 7) % 0xffff) & 0xffff;

  const crc = crc16(payload);
  const flags =
    (deflated ? FLAG_DEFLATE : 0) | (opts.e2e ? FLAG_E2E : 0) | (opts.ackReq ? FLAG_ACK_REQ : 0);
  const clsN = CLASS_TO_NIBBLE[opts.cls] ?? 2;
  const typeN = TYPE_TO_NIBBLE[opts.type] ?? 1;

  const frames: Uint8Array[] = [];
  let totalBytes = 0;
  for (let i = 0; i < total; i++) {
    const slice = payload.subarray(
      i * MESH_CHUNK_PAYLOAD_BYTES,
      Math.min((i + 1) * MESH_CHUNK_PAYLOAD_BYTES, payload.length),
    );
    const frame = new Uint8Array(9 + slice.length);
    frame[0] = MESH_MAGIC;
    frame[1] = ((MESH_VERSION & 0x0f) << 4) | (flags & 0x0f);
    frame[2] = (msgId >> 8) & 0xff;
    frame[3] = msgId & 0xff;
    frame[4] = ((clsN & 0x0f) << 4) | (typeN & 0x0f);
    frame[5] = i & 0xff;
    frame[6] = total & 0xff;
    frame[7] = (crc >> 8) & 0xff;
    frame[8] = crc & 0xff;
    frame.set(slice, 9);
    frames.push(frame);
    totalBytes += frame.length;
  }
  return { msgId, frames, totalBytes, deflated };
}

export interface DecodedFrame {
  msgId: number;
  cls: TrafficClass;
  type: MeshPayloadType;
  chunkIdx: number;
  chunkTotal: number;
  crc: number;
  flags: { deflate: boolean; e2e: boolean; ackReq: boolean };
  payload: Uint8Array;
}

/** Decodifica y VALIDA un frame. null si no es nuestro o está corrupto. */
export function decodeFrame(frame: Uint8Array): DecodedFrame | null {
  try {
    if (!frame || frame.length < 10) return null;
    if (frame[0] !== MESH_MAGIC) return null;
    const version = (frame[1] >> 4) & 0x0f;
    if (version !== MESH_VERSION) return null;
    const flagBits = frame[1] & 0x0f;
    const msgId = (frame[2] << 8) | frame[3];
    const clsN = (frame[4] >> 4) & 0x0f;
    const typeN = frame[4] & 0x0f;
    const cls = NIBBLE_TO_CLASS[clsN];
    const type = NIBBLE_TO_TYPE[typeN];
    if (!cls || !type) return null;
    const chunkIdx = frame[5];
    const chunkTotal = frame[6];
    if (chunkTotal === 0 || chunkTotal > MESH_MAX_CHUNKS || chunkIdx >= chunkTotal) return null;
    return {
      msgId,
      cls,
      type,
      chunkIdx,
      chunkTotal,
      crc: (frame[7] << 8) | frame[8],
      flags: {
        deflate: !!(flagBits & FLAG_DEFLATE),
        e2e: !!(flagBits & FLAG_E2E),
        ackReq: !!(flagBits & FLAG_ACK_REQ),
      },
      payload: frame.subarray(9),
    };
  } catch {
    return null;
  }
}

/* ── Reensamblador con ventana por msgId + NACK selectivo ──────────────────── */

export interface ReassembledMessage {
  msgId: number;
  cls: TrafficClass;
  type: MeshPayloadType;
  body: unknown;
  from: number;
  e2e: boolean;
}

interface PendingMessage {
  frames: (DecodedFrame | null)[];
  from: number;
  firstAt: number;
  lastAt: number;
}

/**
 * Reassembler — una instancia por subsistema. `push()` devuelve el mensaje
 * completo cuando llega el último trozo (y el CRC cuadra), o null si aún
 * faltan. `missingOf()` alimenta el NACK selectivo de sync.ts. `sweep()`
 * caduca ventanas viejas (llamado por el timer perezoso de discovery).
 */
/** Tope de ventanas de reensamblado simultáneas (anti-DoS de malla abierta). */
const MAX_PENDING_WINDOWS = 200;

export class Reassembler {
  private pending = new Map<string, PendingMessage>();

  private key(from: number, msgId: number): string {
    return `${from}:${msgId}`;
  }

  async push(
    frame: DecodedFrame,
    from: number,
    now: number,
  ): Promise<ReassembledMessage | null> {
    const key = this.key(from, frame.msgId);
    let entry = this.pending.get(key);
    if (!entry) {
      // Tope LRU: una malla abierta (o ruido) puede intentar abrir ventanas sin
      // fin; descartamos la MÁS VIEJA antes de crear una nueva. Sin esto, un
      // vecino hostil que emita frames con msgId aleatorio agota la memoria.
      if (this.pending.size >= MAX_PENDING_WINDOWS) {
        const oldest = this.pending.keys().next().value;
        if (oldest) this.pending.delete(oldest);
      }
      entry = {
        frames: new Array<DecodedFrame | null>(frame.chunkTotal).fill(null),
        from,
        firstAt: now,
        lastAt: now,
      };
      this.pending.set(key, entry);
    }
    if (entry.frames.length !== frame.chunkTotal) return null; // incoherente → ignorar
    entry.frames[frame.chunkIdx] = frame;
    entry.lastAt = now;

    if (entry.frames.some((f) => f === null)) return null; // aún faltan trozos

    this.pending.delete(key);
    // Reconstruir payload completo y verificar CRC.
    const totalLen = entry.frames.reduce((n, f) => n + (f ? f.payload.length : 0), 0);
    const full = new Uint8Array(totalLen);
    let off = 0;
    for (const f of entry.frames) {
      if (!f) return null;
      full.set(f.payload, off);
      off += f.payload.length;
    }
    if (crc16(full) !== frame.crc) return null; // corrupto → descartar en silencio

    let bodyBytes: Uint8Array | null = full;
    if (frame.flags.deflate) bodyBytes = await inflateRaw(full);
    if (!bodyBytes) return null;

    return {
      msgId: frame.msgId,
      cls: frame.cls,
      type: frame.type,
      body: bytesToBody(bodyBytes),
      from,
      e2e: frame.flags.e2e,
    };
  }

  /** Índices que faltan de un mensaje pendiente (para pedir reenvío selectivo). */
  missingOf(from: number, msgId: number): number[] {
    const entry = this.pending.get(this.key(from, msgId));
    if (!entry) return [];
    const missing: number[] = [];
    entry.frames.forEach((f, i) => {
      if (!f) missing.push(i);
    });
    return missing;
  }

  /** Caduca ventanas sin completar (timeout SOP §5.1). Devuelve las caducadas. */
  sweep(now: number): Array<{ from: number; msgId: number }> {
    const expired: Array<{ from: number; msgId: number }> = [];
    for (const [key, entry] of this.pending) {
      if (now - entry.lastAt > REASSEMBLY_TIMEOUT_MS) {
        this.pending.delete(key);
        const [from, msgId] = key.split(":").map(Number);
        expired.push({ from, msgId });
      }
    }
    return expired;
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
