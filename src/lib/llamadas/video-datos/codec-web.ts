"use client";

/**
 * video-datos/codec-web — WebCodecs (VP8 / H.264 baseline) o JPEG de canvas para el vídeo ligero (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Solo donde `isConfigSupported` lo confirme se usa WebCodecs:
 *   · VP8   `vp8`           — WebView de Android (Chromium) y navegadores de escritorio.
 *   · H.264 `avc1.42001e`   — baseline nivel 3.0, Annex B, `latencyMode: "realtime"` (Safari/WKWebView de Mac y Chromium).
 * Si falta WebCodecs de vídeo, JPEG desde un canvas a muy pocos fotogramas por segundo. Nunca lanza.
 * Cada lado anuncia lo que sabe DECODIFICAR y el que emite elige entre lo que sabe CODIFICAR (ver sesion-video.ts).
 */
import type { CodecVideo, CodificadorVideo, DecodificadorVideo, FabricaVideo, FrameCodificado, FrameFuente, FuenteVideo, ImagenDecodificada, PerfilVideo, SalidaVideo } from "./tipos";

/* ───────────── Lo mínimo de WebCodecs que usamos (sin depender de lib.dom) ───────────── */

interface ChunkCodificado {
  type: "key" | "delta";
  byteLength: number;
  copyTo(b: Uint8Array): void;
}
interface FrameWC {
  displayWidth: number;
  displayHeight: number;
  close(): void;
}
interface VideoEncoderWC {
  configure(c: Record<string, unknown>): void;
  encode(f: unknown, o?: { keyFrame?: boolean }): void;
  close(): void;
  encodeQueueSize?: number;
  state?: string;
}
interface VideoDecoderWC {
  configure(c: Record<string, unknown>): void;
  decode(c: unknown): void;
  close(): void;
  state?: string;
}
interface WebCodecsVideo {
  VideoEncoder?: { new (i: { output: (c: ChunkCodificado) => void; error: (e: unknown) => void }): VideoEncoderWC; isConfigSupported(c: Record<string, unknown>): Promise<{ supported?: boolean }> };
  VideoDecoder?: { new (i: { output: (f: FrameWC) => void; error: (e: unknown) => void }): VideoDecoderWC; isConfigSupported(c: Record<string, unknown>): Promise<{ supported?: boolean }> };
  VideoFrame?: new (src: unknown, init: { timestamp: number }) => { close(): void };
  EncodedVideoChunk?: new (i: { type: "key" | "delta"; timestamp: number; data: Uint8Array }) => unknown;
}

const g = (): WebCodecsVideo => globalThis as unknown as WebCodecsVideo;

const CFG_CODEC: Record<"vp8" | "h264", { codec: string; extra: Record<string, unknown> }> = {
  vp8: { codec: "vp8", extra: {} },
  h264: { codec: "avc1.42001e", extra: { avc: { format: "annexb" } } },
};

async function soportado(c: "vp8" | "h264"): Promise<{ enc: boolean; dec: boolean }> {
  const w = g();
  try {
    if (!w.VideoEncoder || !w.VideoDecoder || !w.VideoFrame || !w.EncodedVideoChunk) return { enc: false, dec: false };
    const cfg = CFG_CODEC[c];
    const [e, d] = await Promise.all([
      w.VideoEncoder.isConfigSupported({ codec: cfg.codec, width: 160, height: 120, bitrate: 40_000, framerate: 4, latencyMode: "realtime", ...cfg.extra }),
      w.VideoDecoder.isConfigSupported({ codec: cfg.codec }),
    ]);
    return { enc: !!e?.supported, dec: !!d?.supported };
  } catch {
    return { enc: false, dec: false };
  }
}

/* ───────────────────────────── VP8 / H.264 ───────────────────────────── */

function codificadorWebCodecs(c: "vp8" | "h264"): CodificadorVideo | null {
  const w = g();
  if (!w.VideoEncoder || !w.VideoFrame) return null;
  const Enc = w.VideoEncoder;
  const Fr = w.VideoFrame;
  let cb: (f: FrameCodificado) => void = () => undefined;
  let perfil: PerfilVideo | null = null;
  let tsUltimo = 0;
  let enc: VideoEncoderWC | null = null;
  const abrir = (): VideoEncoderWC | null => {
    try {
      const e = new Enc({
        output: (chunk) => {
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          cb({ clave: chunk.type === "key", bytes, ts: tsUltimo, w: perfil?.w ?? 0, h: perfil?.h ?? 0 });
        },
        error: () => {
          enc = null; // se reabre en el próximo fotograma, que irá clave
        },
      });
      return e;
    } catch {
      return null;
    }
  };
  const configurar = (p: PerfilVideo) => {
    perfil = p;
    try {
      if (!enc) enc = abrir();
      enc?.configure({ codec: CFG_CODEC[c].codec, width: p.w, height: p.h, bitrate: p.kbps * 1000, framerate: p.fps, latencyMode: "realtime", ...CFG_CODEC[c].extra });
    } catch {
      enc = null;
    }
  };
  return {
    configurar,
    codificar(f: FrameFuente, clave: boolean) {
      if (!perfil) return;
      if (!enc) configurar(perfil);
      if (!enc) return;
      // Cola del códec crecida = no da abasto: este fotograma se salta (el siguiente no tiene por qué ir clave).
      if ((enc.encodeQueueSize ?? 0) > 2) return;
      try {
        tsUltimo = f.ts;
        const vf = new Fr(f.imagen, { timestamp: Math.round(f.ts * 1000) });
        enc.encode(vf, { keyFrame: clave });
        vf.close();
      } catch {
        enc = null;
      }
    },
    alSalir(f) {
      cb = f;
    },
    cerrar() {
      try {
        enc?.close();
      } catch {
        /* noop */
      }
      enc = null;
    },
  };
}

function decodificadorWebCodecs(c: "vp8" | "h264"): DecodificadorVideo | null {
  const w = g();
  if (!w.VideoDecoder || !w.EncodedVideoChunk) return null;
  const Dec = w.VideoDecoder;
  const Chunk = w.EncodedVideoChunk;
  let cbImg: (i: ImagenDecodificada) => void = () => undefined;
  let cbErr: () => void = () => undefined;
  let dec: VideoDecoderWC | null = null;
  let hayClave = false;
  const abrir = (): VideoDecoderWC | null => {
    try {
      const d = new Dec({
        output: (f) => cbImg({ imagen: f, w: f.displayWidth, h: f.displayHeight, liberar: () => f.close() }),
        error: () => {
          dec = null;
          hayClave = false;
          cbErr();
        },
      });
      d.configure({ codec: CFG_CODEC[c].codec });
      return d;
    } catch {
      return null;
    }
  };
  return {
    decodificar(f: FrameCodificado) {
      if (!dec) {
        if (!f.clave) return cbErr();
        dec = abrir();
      }
      if (!dec) return;
      if (f.clave) hayClave = true;
      if (!hayClave) return;
      try {
        dec.decode(new Chunk({ type: f.clave ? "key" : "delta", timestamp: Math.round(f.ts * 1000), data: f.bytes }));
      } catch {
        dec = null;
        hayClave = false;
        cbErr();
      }
    },
    alImagen(cb) {
      cbImg = cb;
    },
    alError(cb) {
      cbErr = cb;
    },
    cerrar() {
      try {
        dec?.close();
      } catch {
        /* noop */
      }
      dec = null;
    },
  };
}

/* ───────────────────────────── JPEG (respaldo) ───────────────────────────── */

interface LienzoJpeg {
  width: number;
  height: number;
  toDataURL(tipo: string, calidad?: number): string;
}

/** Como mucho este número de fotogramas por segundo en JPEG (cada uno es un fotograma completo). */
export const FPS_MAX_JPEG = 3;

function bytesDeDataUrl(url: string): Uint8Array | null {
  const i = url.indexOf(",");
  if (i < 0) return null;
  try {
    const bin = atob(url.slice(i + 1));
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  } catch {
    return null;
  }
}

function codificadorJpeg(): CodificadorVideo {
  let cb: (f: FrameCodificado) => void = () => undefined;
  let perfil: PerfilVideo | null = null;
  let calidad = 0.5;
  let n = 0;
  return {
    configurar(p) {
      perfil = p;
      n = 0;
    },
    codificar(f: FrameFuente, clave: boolean) {
      if (!perfil) return;
      const cada = Math.max(1, Math.ceil(perfil.fps / FPS_MAX_JPEG));
      if (!clave && n++ % cada !== 0) return;
      const lienzo = f.imagen as LienzoJpeg | null;
      if (!lienzo || typeof lienzo.toDataURL !== "function") return;
      let bytes: Uint8Array | null = null;
      try {
        bytes = bytesDeDataUrl(lienzo.toDataURL("image/jpeg", calidad));
      } catch {
        bytes = null;
      }
      if (!bytes) return;
      // Ajusta la calidad a la tasa pedida con los fotogramas por segundo reales de JPEG.
      const objetivo = (perfil.kbps * 1000) / 8 / Math.min(perfil.fps, FPS_MAX_JPEG);
      if (bytes.length > objetivo * 1.2) calidad = Math.max(0.2, calidad - 0.08);
      else if (bytes.length < objetivo * 0.6) calidad = Math.min(0.8, calidad + 0.05);
      cb({ clave: true, bytes, ts: f.ts, w: f.w, h: f.h });
    },
    alSalir(f) {
      cb = f;
    },
    cerrar() {
      /* nada que cerrar */
    },
  };
}

function decodificadorJpeg(): DecodificadorVideo | null {
  const crear = (globalThis as unknown as { createImageBitmap?: (b: Blob) => Promise<{ width: number; height: number; close(): void }> }).createImageBitmap;
  if (typeof crear !== "function" || typeof Blob === "undefined") return null;
  let cbImg: (i: ImagenDecodificada) => void = () => undefined;
  let cbErr: () => void = () => undefined;
  let vivo = true;
  return {
    decodificar(f) {
      void crear(new Blob([f.bytes as BlobPart], { type: "image/jpeg" }))
        .then((bm) => {
          if (!vivo) return bm.close();
          cbImg({ imagen: bm, w: bm.width, h: bm.height, liberar: () => bm.close() });
        })
        .catch(() => cbErr());
    },
    alImagen(cb) {
      cbImg = cb;
    },
    alError(cb) {
      cbErr = cb;
    },
    cerrar() {
      vivo = false;
    },
  };
}

function hayCanvas(): boolean {
  try {
    return typeof document !== "undefined" && typeof document.createElement === "function" && !!document.createElement("canvas").getContext;
  } catch {
    return false;
  }
}

/** La fábrica real: detecta qué ofrece este aparato. Siempre devuelve una (puede no tener nada que codificar). */
export async function crearFabricaVideoWeb(): Promise<FabricaVideo> {
  const [vp8, h264] = await Promise.all([soportado("vp8"), soportado("h264")]);
  const jpegDec = decodificadorJpeg() !== null;
  const jpegEnc = hayCanvas();
  const codificables: CodecVideo[] = [...(vp8.enc ? (["vp8"] as const) : []), ...(h264.enc ? (["h264"] as const) : []), ...(jpegEnc ? (["jpeg"] as const) : [])];
  const decodificables: CodecVideo[] = [...(vp8.dec ? (["vp8"] as const) : []), ...(h264.dec ? (["h264"] as const) : []), ...(jpegDec ? (["jpeg"] as const) : [])];
  return {
    codificables: () => codificables,
    decodificables: () => decodificables,
    codificador: (c) => (c === "jpeg" ? (jpegEnc ? codificadorJpeg() : null) : codificables.includes(c) ? codificadorWebCodecs(c) : null),
    decodificador: (c) => (c === "jpeg" ? decodificadorJpeg() : decodificables.includes(c) ? decodificadorWebCodecs(c) : null),
  };
}

/* ───────────────────────────── Cámara reducida y salida ───────────────────────────── */

/** La cámara (o la pantalla) como fuente: un <video> oculto y un canvas al tamaño pedido (recorte centrado). */
export function crearFuenteDePista(pista: MediaStreamTrack): FuenteVideo | null {
  if (typeof document === "undefined" || typeof MediaStream !== "function") return null;
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([pista]);
    void video.play().catch(() => undefined);
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    return {
      capturar(w, h) {
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
        if (lienzo.width !== w) lienzo.width = w;
        if (lienzo.height !== h) lienzo.height = h;
        // «cover»: llena el cuadro recortando lo que sobra.
        const k = Math.max(w / video.videoWidth, h / video.videoHeight);
        const sw = w / k;
        const sh = h / k;
        ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
        return { imagen: lienzo, w, h, ts: typeof performance !== "undefined" ? performance.now() : Date.now() };
      },
      cerrar() {
        try {
          video.pause();
          video.srcObject = null;
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}

/** Salida: un canvas cuyo `captureStream` el mosaico enseña como cualquier otra cámara remota. */
export function crearSalidaVideoWeb(): SalidaVideo | null {
  if (typeof document === "undefined") return null;
  try {
    const lienzo = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
    lienzo.width = 160;
    lienzo.height = 120;
    const ctx = lienzo.getContext("2d");
    if (!ctx || typeof lienzo.captureStream !== "function") return null;
    const stream = lienzo.captureStream(15);
    return {
      stream,
      pintar(i) {
        try {
          if (lienzo.width !== i.w) lienzo.width = i.w;
          if (lienzo.height !== i.h) lienzo.height = i.h;
          ctx.drawImage(i.imagen as CanvasImageSource, 0, 0, i.w, i.h);
        } finally {
          i.liberar?.();
        }
      },
      cerrar() {
        try {
          for (const t of stream.getTracks()) t.stop();
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}
